'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { getQuickOpenFiles, peekQuickOpenFiles } from '@/pages/editor/lib/quickOpenFileIndex'
import { QuickOpenFileRow } from '@/pages/editor/quick-open/QuickOpenFileRow'
import {
  parseQuickOpenQuery,
  scoreQuickOpenPath,
  splitQuickOpenPath,
  tryResolveQuickOpenFilePath,
  type QuickOpenFuzzyMatch,
} from 'shared/editor/quickOpenFuzzy'
import { cn } from '@/lib/utils'

type EditorQuickOpenProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoCwd: string
  recentPaths?: readonly string[]
  onOpenFile: (relativePath: string, opts?: { line?: number; column?: number; pin?: boolean }) => void
  onRunCommand?: (commandId: string) => void
}

type QuickOpenResult = QuickOpenFuzzyMatch & { path: string }

type QuickOpenCommand = {
  id: string
  label: string
  keywords: string
}

const EDITOR_COMMANDS: QuickOpenCommand[] = [
  { id: 'revert', label: 'editor.revertFile', keywords: 'revert file reload disk' },
]

function buildRecentResults(recentPaths: readonly string[], files: readonly string[], indexReady: boolean): QuickOpenResult[] {
  const fileSet = indexReady ? new Set(files) : null
  const seen = new Set<string>()
  const results: QuickOpenResult[] = []

  for (const path of recentPaths) {
    if (seen.has(path)) continue
    if (fileSet && !fileSet.has(path)) continue
    seen.add(path)
    const { fileName, dirname } = splitQuickOpenPath(path)
    results.push({ path, score: 0, fileName, dirname, matchIndices: [] })
    if (results.length >= 50) return results
  }

  if (!indexReady) return results

  for (const path of files) {
    if (seen.has(path)) continue
    seen.add(path)
    const { fileName, dirname } = splitQuickOpenPath(path)
    results.push({ path, score: 0, fileName, dirname, matchIndices: [] })
    if (results.length >= 50) break
  }

  return results
}

function buildSearchResults(fileQuery: string, files: readonly string[], repoCwd: string): QuickOpenResult[] {
  const resolved = tryResolveQuickOpenFilePath(fileQuery, repoCwd, files)
  if (resolved) {
    const { fileName, dirname } = splitQuickOpenPath(resolved)
    return [{ path: resolved, score: Number.MAX_SAFE_INTEGER, fileName, dirname, matchIndices: [] }]
  }

  return files
    .map(path => {
      const match = scoreQuickOpenPath(fileQuery, path)
      return match ? ({ path, ...match } satisfies QuickOpenResult) : null
    })
    .filter((item): item is QuickOpenResult => item != null)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 50)
}

function buildCommandResults(query: string, t: (key: string) => string): QuickOpenCommand[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return EDITOR_COMMANDS
  return EDITOR_COMMANDS.filter(cmd => {
    const haystack = `${t(cmd.label)} ${cmd.keywords}`.toLowerCase()
    return haystack.includes(needle)
  })
}

export function EditorQuickOpen({ open, onOpenChange, repoCwd, recentPaths = [], onOpenFile, onRunCommand }: EditorQuickOpenProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<string[]>(() => {
    const cached = repoCwd ? peekQuickOpenFiles(repoCwd) : null
    return cached ? [...cached] : []
  })
  const [indexReady, setIndexReady] = useState(() => Boolean(repoCwd && peekQuickOpenFiles(repoCwd)))
  const [loading, setLoading] = useState(false)

  const openRef = useRef(open)
  const closingRef = useRef(false)
  const selectGuardRef = useRef(false)

  openRef.current = open

  const isCommandMode = query.trimStart().startsWith('>')
  const commandQuery = isCommandMode ? query.trimStart().slice(1).trim() : ''

  useEffect(() => {
    if (!open || !repoCwd) return

    closingRef.current = false
    selectGuardRef.current = false
    setQuery('')

    const cached = peekQuickOpenFiles(repoCwd)
    if (cached) {
      setFiles([...cached])
      setIndexReady(true)
      setLoading(false)
      void getQuickOpenFiles(repoCwd, { force: true }).then(fresh => {
        if (!openRef.current) return
        setFiles(fresh)
        setIndexReady(true)
        setLoading(false)
      })
      return
    }

    setIndexReady(false)
    setLoading(recentPaths.length === 0)
    void getQuickOpenFiles(repoCwd).then(paths => {
      if (!openRef.current) return
      setFiles(paths)
      setIndexReady(true)
      setLoading(false)
    })
  }, [open, recentPaths.length, repoCwd])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next && closingRef.current) return
      onOpenChange(next)
    },
    [onOpenChange]
  )

  const parsedQuery = useMemo(() => parseQuickOpenQuery(query), [query])

  const results = useMemo(() => {
    if (isCommandMode) return []
    if (!parsedQuery.fileQuery) return buildRecentResults(recentPaths, files, indexReady)
    if (!indexReady) return []
    return buildSearchResults(parsedQuery.fileQuery, files, repoCwd)
  }, [files, indexReady, isCommandMode, parsedQuery.fileQuery, recentPaths, repoCwd])

  const commandResults = useMemo(() => {
    if (!isCommandMode) return []
    return buildCommandResults(commandQuery, t)
  }, [commandQuery, isCommandMode, t])

  const groupHeading = isCommandMode
    ? t('editor.quickOpenCommands')
    : parsedQuery.fileQuery
      ? t('editor.quickOpenFileResults')
      : t('editor.quickOpenRecentlyOpened')

  const handleSelect = useCallback(
    (path: string) => {
      if (selectGuardRef.current || closingRef.current) return

      selectGuardRef.current = true
      closingRef.current = true

      const line = parsedQuery.line
      const column = parsedQuery.column

      handleOpenChange(false)

      queueMicrotask(() => {
        onOpenFile(path, { pin: true, line, column })
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

  const locationSuffix =
    parsedQuery.line != null
      ? parsedQuery.column != null
        ? `:${parsedQuery.line}:${parsedQuery.column}`
        : `:${parsedQuery.line}`
      : undefined

  const showListLoader = !isCommandMode && loading && results.length === 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('editor.quickOpenTitle')}
      shouldFilter={false}
      showCloseButton={false}
      onCloseAutoFocus={event => event.preventDefault()}
      className={cn(
        'hb-quick-open max-w-[600px] gap-0 border border-[var(--hb-quick-open-border)] bg-[var(--hb-quick-open-bg)] p-0 shadow-lg sm:max-w-[600px]'
      )}
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
                    <CommandItem
                      key={cmd.id}
                      value={cmd.id}
                      onSelect={() => handleSelectCommand(cmd.id)}
                      className="px-3 py-1.5 text-[13px] text-[var(--hb-quick-open-filename)]"
                    >
                      {t(cmd.label)}
                    </CommandItem>
                  ))
                : results.map(item => (
                    <QuickOpenFileRow
                      key={item.path}
                      path={item.path}
                      fileName={item.fileName}
                      dirname={item.dirname}
                      matchIndices={item.matchIndices}
                      locationSuffix={locationSuffix}
                      onSelect={() => handleSelect(item.path)}
                    />
                  ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
