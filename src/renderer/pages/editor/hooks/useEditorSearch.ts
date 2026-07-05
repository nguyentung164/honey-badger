import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildSearchRegExp } from 'shared/editor/searchReplace'
import type { SearchInFilesMatch } from 'shared/editor/types'

export type EditorSearchOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  includePattern: string
  excludePattern: string
  useExcludesAndIgnoreFiles: boolean
  onlyOpenEditors: boolean
}

export type SearchFileGroup = {
  relativePath: string
  matches: SearchInFilesMatch[]
}

export type SearchFolderGroup = {
  folderPath: string
  files: SearchFileGroup[]
}

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

function groupMatches(matches: SearchInFilesMatch[]): SearchFileGroup[] {
  const map = new Map<string, SearchInFilesMatch[]>()
  for (const match of matches) {
    const list = map.get(match.relativePath)
    if (list) list.push(match)
    else map.set(match.relativePath, [match])
  }
  return [...map.entries()]
    .map(([relativePath, fileMatches]) => ({ relativePath, matches: fileMatches }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function countMatchOccurrences(matches: SearchInFilesMatch[]): number {
  return matches.reduce((sum, match) => sum + (match.occurrences ?? 1), 0)
}

function groupMatchesByFolder(fileGroups: SearchFileGroup[]): SearchFolderGroup[] {
  const map = new Map<string, SearchFileGroup[]>()
  for (const group of fileGroups) {
    const parts = group.relativePath.split('/')
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
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
  onFilesReplaced?: (relativePaths: string[]) => void,
  openTabPaths: string[] = []
) {
  const prefs = useMemo(() => readSearchPrefs(), [])
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showReplace, setShowReplaceState] = useState(Boolean(prefs.showReplace))
  const [showFilters, setShowFiltersState] = useState(Boolean(prefs.showFilters))
  const [viewMode, setViewModeState] = useState<EditorSearchViewMode>(prefs.viewMode ?? 'list')
  const [options, setOptionsState] = useState<EditorSearchOptions>(() => ({ ...DEFAULT_OPTIONS, ...prefs }))
  const [matches, setMatches] = useState<SearchInFilesMatch[]>([])
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
      if (!repoCwd || !q.trim()) {
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
        const result = await window.api.system.search_in_files({
          query: q,
          cwd: repoCwd,
          caseSensitive: opts.caseSensitive,
          wholeWord: opts.wholeWord,
          regex: opts.regex,
          maxResults: 20_000,
          includePattern: opts.includePattern || undefined,
          excludePattern: opts.excludePattern || undefined,
          useExcludesAndIgnoreFiles: opts.useExcludesAndIgnoreFiles,
          onlyRelativePaths: opts.onlyOpenEditors && openTabPaths.length > 0 ? openTabPaths : undefined,
        })
        if (id !== requestIdRef.current) return
        setMatches(result.matches)
        setTruncated(result.truncated)
      } catch {
        if (id === requestIdRef.current) {
          setMatches([])
          setTruncated(false)
        }
      } finally {
        if (id === requestIdRef.current) setIsSearching(false)
      }
    },
    [openTabPaths, repoCwd]
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

  const toggleFileCollapsed = useCallback((relativePath: string) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
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
      setCollapsedFiles(new Set(groups.map(g => g.relativePath)))
      return
    }
    setCollapsedFiles(new Set(groups.map(g => g.relativePath)))
  }, [folderGroups, groups, viewMode])

  const dismissFile = useCallback((relativePath: string) => {
    setMatches(prev => prev.filter(m => m.relativePath !== relativePath))
    setCollapsedFiles(prev => {
      if (!prev.has(relativePath)) return prev
      const next = new Set(prev)
      next.delete(relativePath)
      return next
    })
  }, [])

  const replaceInPaths = useCallback(
    async (relativePaths?: string[]) => {
      if (!repoCwd || !query.trim()) return null
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
        const result = await window.api.system.replace_in_files({
          query,
          replace: replaceText,
          cwd: repoCwd,
          caseSensitive: options.caseSensitive,
          wholeWord: options.wholeWord,
          regex: options.regex,
          includePattern: options.includePattern || undefined,
          excludePattern: options.excludePattern || undefined,
          useExcludesAndIgnoreFiles: options.useExcludesAndIgnoreFiles,
          onlyRelativePaths: options.onlyOpenEditors && openTabPaths.length > 0 ? openTabPaths : undefined,
          relativePaths,
        })
        if (result.relativePaths.length > 0) {
          onFilesReplaced?.(result.relativePaths)
          await runSearch(query, options)
        }
        return { result }
      } finally {
        setIsReplacing(false)
      }
    },
    [onFilesReplaced, openTabPaths, options, query, replaceText, repoCwd, runSearch]
  )

  const replaceAll = useCallback(() => replaceInPaths(), [replaceInPaths])
  const replaceInFile = useCallback((relativePath: string) => replaceInPaths([relativePath]), [replaceInPaths])

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
