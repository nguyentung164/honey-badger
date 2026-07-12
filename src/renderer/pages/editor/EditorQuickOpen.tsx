'use client'

import { type MutableRefObject, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  isPatternSubsequence,
  normalizeQuickOpenFileQuery,
  parseQuickOpenQuery,
  type QuickOpenFuzzyMatch,
  scoreQuickOpenPath,
  splitQuickOpenPath,
  tryResolveQuickOpenFilePath,
} from 'shared/editor/quickOpenFuzzy'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import { cn } from '@/lib/utils'
import type { OpenFileOptions } from '@/pages/editor/lib/editorWorkspaceTypes'
import { getQuickOpenFiles, getQuickOpenLowercasePaths, peekQuickOpenFiles } from '@/pages/editor/lib/quickOpenFileIndex'
import { QuickOpenFileRow } from '@/pages/editor/quick-open/QuickOpenFileRow'

export type QuickOpenRecentEntry = { relativePath: string; repoRoot: string }

type EditorQuickOpenProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoCwd: string
  /** Multi-root workspace folders — when provided (length > 1) Quick Open searches every folder. */
  workspaceFolders?: readonly EditorWorkspaceFolder[]
  recentEntries?: readonly QuickOpenRecentEntry[]
  onOpenFile: (relativePath: string, opts?: OpenFileOptions) => void
  onRunCommand?: (commandId: string) => void
}

type QuickOpenResult = QuickOpenFuzzyMatch & { path: string; repoRoot: string; folderLabel: string }

type QuickOpenCommand = {
  id: string
  label: string
  keywords: string
}

const EDITOR_COMMANDS: QuickOpenCommand[] = [{ id: 'revert', label: 'editor.revertFile', keywords: 'revert file reload disk' }]

function buildRecentResults(
  recentEntries: readonly QuickOpenRecentEntry[],
  folders: readonly EditorWorkspaceFolder[],
  filesByFolder: ReadonlyMap<string, readonly string[]>,
  indexReady: boolean,
  showFolderLabel: boolean
): QuickOpenResult[] {
  const folderLabelByPath = new Map(folders.map(f => [f.path, f.label]))
  const fileSetByFolder = indexReady ? new Map(folders.map(f => [f.path, new Set(filesByFolder.get(f.path) ?? [])])) : null
  const seen = new Set<string>()
  const results: QuickOpenResult[] = []

  for (const entry of recentEntries) {
    const key = `${entry.repoRoot}\0${entry.relativePath}`
    if (seen.has(key)) continue
    if (fileSetByFolder && !fileSetByFolder.get(entry.repoRoot)?.has(entry.relativePath)) continue
    seen.add(key)
    const { fileName, dirname } = splitQuickOpenPath(entry.relativePath)
    results.push({
      path: entry.relativePath,
      repoRoot: entry.repoRoot,
      folderLabel: showFolderLabel ? (folderLabelByPath.get(entry.repoRoot) ?? '') : '',
      score: 0,
      fileName,
      dirname,
      matchIndices: [],
    })
    if (results.length >= 50) return results
  }

  if (!indexReady) return results

  for (const folder of folders) {
    const files = filesByFolder.get(folder.path) ?? []
    for (const path of files) {
      const key = `${folder.path}\0${path}`
      if (seen.has(key)) continue
      seen.add(key)
      const { fileName, dirname } = splitQuickOpenPath(path)
      results.push({ path, repoRoot: folder.path, folderLabel: showFolderLabel ? folder.label : '', score: 0, fileName, dirname, matchIndices: [] })
      if (results.length >= 50) return results
    }
  }

  return results
}

type QuickOpenFolderCandidates = {
  /** Files array identity the cached indices were computed against. */
  files: readonly string[]
  indices: number[]
}

type QuickOpenPrefilterCache = {
  queryLow: string
  byFolder: Map<string, QuickOpenFolderCandidates>
}

function buildSearchResults(
  fileQuery: string,
  folders: readonly EditorWorkspaceFolder[],
  filesByFolder: ReadonlyMap<string, readonly string[]>,
  showFolderLabel: boolean,
  cacheRef: MutableRefObject<QuickOpenPrefilterCache | null>
): QuickOpenResult[] {
  for (const folder of folders) {
    const files = filesByFolder.get(folder.path)
    if (!files) continue
    const resolved = tryResolveQuickOpenFilePath(fileQuery, folder.path, files)
    if (resolved) {
      const { fileName, dirname } = splitQuickOpenPath(resolved)
      return [
        {
          path: resolved,
          repoRoot: folder.path,
          folderLabel: showFolderLabel ? folder.label : '',
          score: Number.MAX_SAFE_INTEGER,
          fileName,
          dirname,
          matchIndices: [],
        },
      ]
    }
  }

  const queryLow = normalizeQuickOpenFileQuery(fileQuery).toLowerCase()
  // When the new query extends the previous one, only the previous candidates can still match.
  const prev = cacheRef.current
  const canNarrow = prev !== null && queryLow.startsWith(prev.queryLow)
  const nextByFolder = new Map<string, QuickOpenFolderCandidates>()

  const results: QuickOpenResult[] = []
  for (const folder of folders) {
    const files = filesByFolder.get(folder.path)
    if (!files) continue
    const lowercasePaths = getQuickOpenLowercasePaths(files)
    const prevEntry = canNarrow ? prev.byFolder.get(folder.path) : undefined
    const baseIndices = prevEntry && prevEntry.files === files ? prevEntry.indices : null
    const indices: number[] = []

    const considerIndex = (i: number) => {
      const pathLow = lowercasePaths[i]
      const path = files[i]
      if (pathLow === undefined || path === undefined) return
      // Cheap subsequence prefilter — the O(p*w) DP scorer only runs on survivors.
      if (!isPatternSubsequence(queryLow, pathLow)) return
      indices.push(i)
      const match = scoreQuickOpenPath(fileQuery, path)
      if (match) results.push({ ...match, path, repoRoot: folder.path, folderLabel: showFolderLabel ? folder.label : '' })
    }

    if (baseIndices) {
      for (const i of baseIndices) considerIndex(i)
    } else {
      for (let i = 0; i < files.length; i++) considerIndex(i)
    }

    nextByFolder.set(folder.path, { files, indices })
  }

  cacheRef.current = { queryLow, byFolder: nextByFolder }
  return results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 50)
}

function buildCommandResults(query: string, t: (key: string) => string): QuickOpenCommand[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return EDITOR_COMMANDS
  return EDITOR_COMMANDS.filter(cmd => {
    const haystack = `${t(cmd.label)} ${cmd.keywords}`.toLowerCase()
    return haystack.includes(needle)
  })
}

export function EditorQuickOpen({ open, onOpenChange, repoCwd, workspaceFolders, recentEntries = [], onOpenFile, onRunCommand }: EditorQuickOpenProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const folders = useMemo<readonly EditorWorkspaceFolder[]>(() => {
    if (workspaceFolders && workspaceFolders.length > 0) return workspaceFolders
    return repoCwd ? [{ path: repoCwd, label: '' }] : []
  }, [workspaceFolders, repoCwd])
  const showFolderLabel = folders.length > 1
  const foldersKey = folders.map(f => f.path).join('\0')

  const [filesByFolder, setFilesByFolder] = useState<Map<string, readonly string[]>>(() => {
    const map = new Map<string, readonly string[]>()
    for (const folder of folders) {
      const cached = peekQuickOpenFiles(folder.path)
      if (cached) map.set(folder.path, cached)
    }
    return map
  })
  const [indexReadyFolders, setIndexReadyFolders] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const folder of folders) if (peekQuickOpenFiles(folder.path)) set.add(folder.path)
    return set
  })
  const [loading, setLoading] = useState(false)

  const openRef = useRef(open)
  const closingRef = useRef(false)
  const selectGuardRef = useRef(false)

  openRef.current = open

  const isCommandMode = query.trimStart().startsWith('>')
  const commandQuery = isCommandMode ? query.trimStart().slice(1).trim() : ''

  useEffect(() => {
    if (!open || folders.length === 0) return

    closingRef.current = false
    selectGuardRef.current = false
    prefilterCacheRef.current = null
    setQuery('')

    const cachedMap = new Map<string, readonly string[]>()
    let allCached = true
    for (const folder of folders) {
      const cached = peekQuickOpenFiles(folder.path)
      if (cached) cachedMap.set(folder.path, cached)
      else allCached = false
    }

    if (allCached) {
      setFilesByFolder(cachedMap)
      setIndexReadyFolders(new Set(folders.map(f => f.path)))
      setLoading(false)
      void Promise.all(folders.map(folder => getQuickOpenFiles(folder.path, { force: true }).then(files => [folder.path, files] as const))).then(entries => {
        if (!openRef.current) return
        setFilesByFolder(new Map(entries))
        setIndexReadyFolders(new Set(folders.map(f => f.path)))
        setLoading(false)
      })
      return
    }

    setIndexReadyFolders(new Set())
    setLoading(recentEntries.length === 0)
    void Promise.all(folders.map(folder => getQuickOpenFiles(folder.path).then(files => [folder.path, files] as const))).then(entries => {
      if (!openRef.current) return
      setFilesByFolder(new Map(entries))
      setIndexReadyFolders(new Set(folders.map(f => f.path)))
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- foldersKey captures the effective identity of `folders`
  }, [open, foldersKey, recentEntries.length])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next && closingRef.current) return
      onOpenChange(next)
    },
    [onOpenChange]
  )

  const parsedQuery = useMemo(() => parseQuickOpenQuery(query), [query])
  const indexReady = folders.length > 0 && folders.every(f => indexReadyFolders.has(f.path))

  // Defer heavy scoring so fast typing never blocks the input (VS Code-style responsiveness).
  const deferredFileQuery = useDeferredValue(parsedQuery.fileQuery)
  const prefilterCacheRef = useRef<QuickOpenPrefilterCache | null>(null)

  const results = useMemo(() => {
    if (isCommandMode) return []
    if (!deferredFileQuery) return buildRecentResults(recentEntries, folders, filesByFolder, indexReady, showFolderLabel)
    if (!indexReady) return []
    return buildSearchResults(deferredFileQuery, folders, filesByFolder, showFolderLabel, prefilterCacheRef)
  }, [deferredFileQuery, filesByFolder, folders, indexReady, isCommandMode, recentEntries, showFolderLabel])

  const commandResults = useMemo(() => {
    if (!isCommandMode) return []
    return buildCommandResults(commandQuery, t)
  }, [commandQuery, isCommandMode, t])

  const groupHeading = isCommandMode ? t('editor.quickOpenCommands') : parsedQuery.fileQuery ? t('editor.quickOpenFileResults') : t('editor.quickOpenRecentlyOpened')

  const handleSelect = useCallback(
    (path: string, repoRoot: string) => {
      if (selectGuardRef.current || closingRef.current) return

      selectGuardRef.current = true
      closingRef.current = true

      const line = parsedQuery.line
      const column = parsedQuery.column

      handleOpenChange(false)

      queueMicrotask(() => {
        onOpenFile(path, { pin: true, line, column, repoRoot })
        selectGuardRef.current = false
        queueMicrotask(() => {
          closingRef.current = false
        })
      })
    },
    [handleOpenChange, onOpenFile, parsedQuery.column, parsedQuery.line]
  )

  const handleSelectCommand = useCallback(
    (commandId: string) => {
      if (selectGuardRef.current || closingRef.current) return
      selectGuardRef.current = true
      closingRef.current = true
      handleOpenChange(false)
      queueMicrotask(() => {
        onRunCommand?.(commandId)
        selectGuardRef.current = false
        queueMicrotask(() => {
          closingRef.current = false
        })
      })
    },
    [handleOpenChange, onRunCommand]
  )

  const locationSuffix = parsedQuery.line != null ? (parsedQuery.column != null ? `:${parsedQuery.line}:${parsedQuery.column}` : `:${parsedQuery.line}`) : undefined

  const showListLoader = !isCommandMode && loading && results.length === 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('editor.quickOpenTitle')}
      shouldFilter={false}
      showCloseButton={false}
      onCloseAutoFocus={event => event.preventDefault()}
      className={cn('hb-quick-open max-w-[600px] gap-0 border border-[var(--hb-quick-open-border)] bg-[var(--hb-quick-open-bg)] p-0 shadow-lg sm:max-w-[600px]')}
      commandClassName="hb-quick-open-command bg-transparent text-[var(--hb-quick-open-filename)]"
    >
      <CommandInput
        hideSearchIcon
        placeholder={t('editor.quickOpenPlaceholder')}
        value={query}
        onValueChange={setQuery}
        className="h-[26px] border-0 border-b border-[var(--hb-quick-open-border)] px-3 py-0 text-[13px] leading-[26px] text-[var(--hb-quick-open-filename)] placeholder:text-[var(--hb-quick-open-path)]"
      />
      <CommandList className="max-h-[440px] scroll-py-0 overflow-x-hidden p-0">
        {showListLoader ? (
          <div className="flex justify-center py-8">
            <GlowLoader className="h-8 w-8" />
          </div>
        ) : (
          <>
            <CommandEmpty className="py-6 text-[13px] text-[var(--hb-quick-open-path)]">
              {isCommandMode ? t('editor.quickOpenCommandEmpty') : t('editor.quickOpenEmpty')}
            </CommandEmpty>
            <CommandGroup
              heading={groupHeading}
              className="hb-quick-open-group p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-right [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:text-[var(--hb-quick-open-group-label)]"
            >
              {isCommandMode
                ? commandResults.map(cmd => (
                  <CommandItem key={cmd.id} value={cmd.id} onSelect={() => handleSelectCommand(cmd.id)} className="px-3 py-1.5 text-[13px] text-[var(--hb-quick-open-filename)]">
                    {t(cmd.label)}
                  </CommandItem>
                ))
                : results.map(item => (
                  <QuickOpenFileRow
                    key={`${item.repoRoot}\0${item.path}`}
                    path={item.path}
                    fileName={item.fileName}
                    dirname={item.dirname}
                    folderLabel={item.folderLabel}
                    matchIndices={item.matchIndices}
                    locationSuffix={locationSuffix}
                    onSelect={() => handleSelect(item.path, item.repoRoot)}
                  />
                ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
