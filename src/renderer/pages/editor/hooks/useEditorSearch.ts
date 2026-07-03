import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildSearchRegExp } from 'shared/editor/searchReplace'
import type { SearchInFilesMatch } from 'shared/editor/types'

export type EditorSearchOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  includePattern: string
  excludePattern: string
}

export type SearchFileGroup = {
  relativePath: string
  matches: SearchInFilesMatch[]
}

const SEARCH_PREFS_KEY = 'editor-search-prefs'

const DEFAULT_OPTIONS: EditorSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  includePattern: '',
  excludePattern: '',
}

function readSearchPrefs(): Partial<EditorSearchOptions> {
  try {
    const raw = localStorage.getItem(SEARCH_PREFS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<EditorSearchOptions>
  } catch {
    return {}
  }
}

function writeSearchPrefs(options: EditorSearchOptions) {
  try {
    localStorage.setItem(SEARCH_PREFS_KEY, JSON.stringify(options))
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
  return [...map.entries()].map(([relativePath, fileMatches]) => ({ relativePath, matches: fileMatches }))
}

export function useEditorSearch(repoCwd: string, onFilesReplaced?: (relativePaths: string[]) => void) {
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [options, setOptionsState] = useState<EditorSearchOptions>(() => ({ ...DEFAULT_OPTIONS, ...readSearchPrefs() }))
  const [matches, setMatches] = useState<SearchInFilesMatch[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const requestIdRef = useRef(0)

  const setOptions = useCallback((updater: EditorSearchOptions | ((prev: EditorSearchOptions) => EditorSearchOptions)) => {
    setOptionsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      writeSearchPrefs(next)
      return next
    })
  }, [])

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
          maxResults: 500,
          includePattern: opts.includePattern || undefined,
          excludePattern: opts.excludePattern || undefined,
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
    [repoCwd]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query, options)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, options, runSearch])

  const groups = useMemo(() => groupMatches(matches), [matches])

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
    [onFilesReplaced, options, query, replaceText, repoCwd, runSearch]
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
    options,
    setOptions,
    matches,
    groups,
    isSearching,
    isReplacing,
    truncated,
    replaceAll,
    replaceInFile,
  }
}
