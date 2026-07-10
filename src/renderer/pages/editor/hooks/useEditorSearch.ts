import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildSearchRegExp } from 'shared/editor/searchReplace'
import type { SearchInFilesMatch } from 'shared/editor/types'
import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import { normalizeEditorRepoKey } from '@/pages/editor/lib/editorSessionPersist'

export type EditorSearchOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  includePattern: string
  excludePattern: string
  useExcludesAndIgnoreFiles: boolean
  onlyOpenEditors: boolean
}

/** A match tagged with its owning workspace folder — multi-root search spans every folder. */
export type EditorSearchMatch = SearchInFilesMatch & { repoRoot: string; folderLabel: string }

export type SearchFileGroup = {
  relativePath: string
  repoRoot: string
  folderLabel: string
  matches: EditorSearchMatch[]
}

export type SearchFolderGroup = {
  folderPath: string
  files: SearchFileGroup[]
}

export type EditorSearchOpenTab = { relativePath: string; repoRoot: string }
export type EditorSearchReplacedEntry = { relativePath: string; repoRoot: string }

export type EditorSearchViewMode = 'list' | 'tree'

const SEARCH_PREFS_KEY = 'editor-search-prefs'

const DEFAULT_OPTIONS: EditorSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  includePattern: '',
  excludePattern: '',
  useExcludesAndIgnoreFiles: true,
  onlyOpenEditors: false,
}

type SearchPrefs = Partial<EditorSearchOptions> & {
  showFilters?: boolean
  showReplace?: boolean
  viewMode?: EditorSearchViewMode
}

function readSearchPrefs(): SearchPrefs {
  try {
    const raw = localStorage.getItem(SEARCH_PREFS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SearchPrefs
  } catch {
    return {}
  }
}

function writeSearchPrefs(prefs: SearchPrefs) {
  try {
    localStorage.setItem(SEARCH_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

/** Group by (repoRoot, relativePath) — same relative path in two folders must stay separate. */
function groupMatches(matches: EditorSearchMatch[]): SearchFileGroup[] {
  const map = new Map<string, SearchFileGroup>()
  for (const match of matches) {
    const key = `${match.repoRoot}\0${match.relativePath}`
    const existing = map.get(key)
    if (existing) existing.matches.push(match)
    else {
      map.set(key, { relativePath: match.relativePath, repoRoot: match.repoRoot, folderLabel: match.folderLabel, matches: [match] })
    }
  }
  return [...map.values()].sort(
    (a, b) => a.relativePath.localeCompare(b.relativePath) || a.repoRoot.localeCompare(b.repoRoot)
  )
}

function countMatchOccurrences(matches: EditorSearchMatch[]): number {
  return matches.reduce((sum, match) => sum + (match.occurrences ?? 1), 0)
}

function groupMatchesByFolder(fileGroups: SearchFileGroup[]): SearchFolderGroup[] {
  const map = new Map<string, SearchFileGroup[]>()
  for (const group of fileGroups) {
    const parts = group.relativePath.split('/')
    const subPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const folderPath = group.folderLabel ? (subPath ? `${group.folderLabel}/${subPath}` : group.folderLabel) : subPath
    const list = map.get(folderPath)
    if (list) list.push(group)
    else map.set(folderPath, [group])
  }
  return [...map.entries()]
    .map(([folderPath, files]) => ({ folderPath, files }))
    .sort((a, b) => a.folderPath.localeCompare(b.folderPath))
}

export function useEditorSearch(
  repoCwd: string,
  onFilesReplaced?: (entries: EditorSearchReplacedEntry[]) => void,
  openTabs: EditorSearchOpenTab[] = [],
  workspaceFolders?: readonly EditorWorkspaceFolder[]
) {
  const folders = useMemo<readonly EditorWorkspaceFolder[]>(() => {
    if (workspaceFolders && workspaceFolders.length > 0) return workspaceFolders
    return repoCwd ? [{ path: repoCwd, label: '' }] : []
  }, [workspaceFolders, repoCwd])
  const showFolderLabel = folders.length > 1

  const prefs = useMemo(() => readSearchPrefs(), [])
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showReplace, setShowReplaceState] = useState(Boolean(prefs.showReplace))
  const [showFilters, setShowFiltersState] = useState(Boolean(prefs.showFilters))
  const [viewMode, setViewModeState] = useState<EditorSearchViewMode>(prefs.viewMode ?? 'list')
  const [options, setOptionsState] = useState<EditorSearchOptions>(() => ({ ...DEFAULT_OPTIONS, ...prefs }))
  const [matches, setMatches] = useState<EditorSearchMatch[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => new Set())
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const requestIdRef = useRef(0)

  const persistPrefs = useCallback(
    (patch: Partial<SearchPrefs>) => {
      writeSearchPrefs({
        ...options,
        showFilters,
        showReplace,
        viewMode,
        ...patch,
      })
    },
    [options, showFilters, showReplace, viewMode]
  )

  const setShowReplace = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      setShowReplaceState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        persistPrefs({ showReplace: next })
        return next
      })
    },
    [persistPrefs]
  )

  const setShowFilters = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      setShowFiltersState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        persistPrefs({ showFilters: next })
        return next
      })
    },
    [persistPrefs]
  )

  const setViewMode = useCallback(
    (mode: EditorSearchViewMode) => {
      setViewModeState(mode)
      persistPrefs({ viewMode: mode })
    },
    [persistPrefs]
  )

  const setOptions = useCallback(
    (updater: EditorSearchOptions | ((prev: EditorSearchOptions) => EditorSearchOptions)) => {
      setOptionsState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        persistPrefs(next)
        return next
      })
    },
    [persistPrefs]
  )

  const runSearch = useCallback(
    async (q: string, opts: EditorSearchOptions) => {
      if (folders.length === 0 || !q.trim()) {
        setMatches([])
        setTruncated(false)
        return
      }
      const id = ++requestIdRef.current
      setIsSearching(true)
      try {
        if (opts.regex) {
          buildSearchRegExp(q, {
            caseSensitive: opts.caseSensitive,
            wholeWord: opts.wholeWord,
            regex: true,
          })
        }
        const responses = await Promise.all(
          folders.map(async folder => {
            const folderOpenPaths = openTabs
              .filter(t => normalizeEditorRepoKey(t.repoRoot) === normalizeEditorRepoKey(folder.path))
              .map(t => t.relativePath)
            if (opts.onlyOpenEditors && folderOpenPaths.length === 0) {
              return { folder, result: { matches: [], truncated: false } }
            }
            const result = await window.api.system.search_in_files({
              query: q,
              cwd: folder.path,
              caseSensitive: opts.caseSensitive,
              wholeWord: opts.wholeWord,
              regex: opts.regex,
              maxResults: 20_000,
              includePattern: opts.includePattern || undefined,
              excludePattern: opts.excludePattern || undefined,
              useExcludesAndIgnoreFiles: opts.useExcludesAndIgnoreFiles,
              onlyRelativePaths: opts.onlyOpenEditors ? folderOpenPaths : undefined,
            })
            return { folder, result }
          })
        )
        if (id !== requestIdRef.current) return

        const merged: EditorSearchMatch[] = []
        let anyTruncated = false
        for (const { folder, result } of responses) {
          anyTruncated = anyTruncated || result.truncated
          for (const match of result.matches) {
            merged.push({ ...match, repoRoot: folder.path, folderLabel: showFolderLabel ? folder.label : '' })
          }
        }
        setMatches(merged)
        setTruncated(anyTruncated)
      } catch {
        if (id === requestIdRef.current) {
          setMatches([])
          setTruncated(false)
        }
      } finally {
        if (id === requestIdRef.current) setIsSearching(false)
      }
    },
    [folders, openTabs, showFolderLabel]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query, options)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, options, runSearch])

  const groups = useMemo(() => groupMatches(matches), [matches])
  const folderGroups = useMemo(() => groupMatchesByFolder(groups), [groups])

  const resultStats = useMemo(() => {
    const fileCount = groups.length
    const matchCount = countMatchOccurrences(matches)
    return { fileCount, matchCount }
  }, [groups.length, matches])

  const refreshSearch = useCallback(() => {
    void runSearch(query, options)
  }, [options, query, runSearch])

  const clearResults = useCallback(() => {
    requestIdRef.current++
    setMatches([])
    setTruncated(false)
    setQuery('')
    setCollapsedFiles(new Set())
    setCollapsedFolders(new Set())
  }, [])

  const toggleFileCollapsed = useCallback((relativePath: string, repoRoot: string) => {
    const key = `${repoRoot}\0${relativePath}`
    setCollapsedFiles(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleFolderCollapsed = useCallback((folderPath: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    if (viewMode === 'tree') {
      setCollapsedFolders(new Set(folderGroups.map(g => g.folderPath)))
      setCollapsedFiles(new Set(groups.map(g => `${g.repoRoot}\0${g.relativePath}`)))
      return
    }
    setCollapsedFiles(new Set(groups.map(g => `${g.repoRoot}\0${g.relativePath}`)))
  }, [folderGroups, groups, viewMode])

  const dismissFile = useCallback((relativePath: string, repoRoot: string) => {
    setMatches(prev => prev.filter(m => !(m.relativePath === relativePath && m.repoRoot === repoRoot)))
    const key = `${repoRoot}\0${relativePath}`
    setCollapsedFiles(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

  const replaceInPaths = useCallback(
    async (targets?: readonly EditorSearchReplacedEntry[]) => {
      if (folders.length === 0 || !query.trim()) return null
      try {
        if (options.regex) {
          buildSearchRegExp(query, {
            caseSensitive: options.caseSensitive,
            wholeWord: options.wholeWord,
            regex: true,
          })
        }
      } catch {
        return { error: 'invalidRegex' as const }
      }

      setIsReplacing(true)
      try {
        const targetFolders = targets
          ? folders.filter(f => targets.some(t => normalizeEditorRepoKey(t.repoRoot) === normalizeEditorRepoKey(f.path)))
          : folders

        const responses = await Promise.all(
          targetFolders.map(async folder => {
            const relativePaths = targets
              ? targets
                  .filter(t => normalizeEditorRepoKey(t.repoRoot) === normalizeEditorRepoKey(folder.path))
                  .map(t => t.relativePath)
              : undefined
            const folderOpenPaths = openTabs
              .filter(t => normalizeEditorRepoKey(t.repoRoot) === normalizeEditorRepoKey(folder.path))
              .map(t => t.relativePath)
            if (options.onlyOpenEditors && folderOpenPaths.length === 0) {
              return { folder, result: { fileCount: 0, replacementCount: 0, relativePaths: [], failures: [] } }
            }
            const result = await window.api.system.replace_in_files({
              query,
              replace: replaceText,
              cwd: folder.path,
              caseSensitive: options.caseSensitive,
              wholeWord: options.wholeWord,
              regex: options.regex,
              includePattern: options.includePattern || undefined,
              excludePattern: options.excludePattern || undefined,
              useExcludesAndIgnoreFiles: options.useExcludesAndIgnoreFiles,
              onlyRelativePaths: options.onlyOpenEditors ? folderOpenPaths : undefined,
              relativePaths,
            })
            return { folder, result }
          })
        )

        const entries: EditorSearchReplacedEntry[] = []
        const failures: Array<{ relativePath: string; error: string }> = []
        let fileCount = 0
        let replacementCount = 0
        for (const { folder, result } of responses) {
          fileCount += result.fileCount
          replacementCount += result.replacementCount
          for (const relativePath of result.relativePaths) entries.push({ relativePath, repoRoot: folder.path })
          for (const failure of result.failures) failures.push(failure)
        }

        if (entries.length > 0) {
          onFilesReplaced?.(entries)
          await runSearch(query, options)
        }
        return { result: { fileCount, replacementCount, relativePaths: entries.map(e => e.relativePath), failures } }
      } finally {
        setIsReplacing(false)
      }
    },
    [folders, onFilesReplaced, openTabs, options, query, replaceText, runSearch]
  )

  const replaceAll = useCallback(() => replaceInPaths(), [replaceInPaths])
  const replaceInFile = useCallback(
    (relativePath: string, repoRoot: string) => replaceInPaths([{ relativePath, repoRoot }]),
    [replaceInPaths]
  )

  return {
    query,
    setQuery,
    replaceText,
    setReplaceText,
    showReplace,
    setShowReplace,
    showFilters,
    setShowFilters,
    viewMode,
    setViewMode,
    options,
    setOptions,
    matches,
    groups,
    folderGroups,
    resultStats,
    isSearching,
    isReplacing,
    truncated,
    collapsedFiles,
    collapsedFolders,
    toggleFileCollapsed,
    toggleFolderCollapsed,
    collapseAll,
    refreshSearch,
    clearResults,
    dismissFile,
    replaceAll,
    replaceInFile,
  }
}
