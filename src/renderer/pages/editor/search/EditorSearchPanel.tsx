'use client'

import { ChevronDown, ChevronRight, Loader2, Replace, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import toast from '@/components/ui-elements/Toast'
import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import { cn } from '@/lib/utils'
import { DiffViewerFileTreeVirtualList } from '@/pages/diffviewer/DiffViewerFileTreeVirtualList'
import { type EditorSearchMatch, type EditorSearchOpenTab, type EditorSearchReplacedEntry, useEditorSearch } from '@/pages/editor/hooks/useEditorSearch'
import {
  BookOpen,
  EditorSearchMatchHighlight,
  EditorSearchPatternInput,
  EditorSearchQueryInput,
  EditorSearchReplaceInput,
  EditorSearchToolbar,
  FilterX,
} from '@/pages/editor/search/editorSearchUi'

type EditorSearchPanelProps = {
  repoCwd: string
  workspaceFolders?: readonly EditorWorkspaceFolder[]
  openTabs?: EditorSearchOpenTab[]
  onOpenMatch: (match: EditorSearchMatch) => void
  onFilesReplaced?: (entries: EditorSearchReplacedEntry[]) => void
}

type SearchResultRow =
  | { kind: 'folder'; folderPath: string; fileCount: number; matchCount: number }
  | { kind: 'file'; relativePath: string; repoRoot: string; folderLabel: string; matchCount: number; depth: number }
  | { kind: 'match'; match: EditorSearchMatch; depth: number }

const SEARCH_FILE_ROW_HEIGHT = 22
const SEARCH_MATCH_ROW_HEIGHT = 22
const SEARCH_FOLDER_ROW_HEIGHT = 22

function countOccurrences(matches: EditorSearchMatch[]): number {
  return matches.reduce((sum, match) => sum + (match.occurrences ?? 1), 0)
}

function formatFolderLabel(folderPath: string): string {
  if (!folderPath) return '.'
  return folderPath
}

export function EditorSearchPanel({ repoCwd, workspaceFolders, openTabs = [], onOpenMatch, onFilesReplaced }: EditorSearchPanelProps) {
  const { t } = useTranslation()
  const {
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
  } = useEditorSearch(repoCwd, onFilesReplaced, openTabs, workspaceFolders)

  const rows = useMemo<SearchResultRow[]>(() => {
    const flat: SearchResultRow[] = []

    if (viewMode === 'tree') {
      for (const folder of folderGroups) {
        const folderMatchCount = folder.files.reduce((sum, file) => sum + countOccurrences(file.matches), 0)
        flat.push({
          kind: 'folder',
          folderPath: folder.folderPath,
          fileCount: folder.files.length,
          matchCount: folderMatchCount,
        })
        if (collapsedFolders.has(folder.folderPath)) continue

        for (const group of folder.files) {
          const depth = folder.folderPath ? 1 : 0
          flat.push({
            kind: 'file',
            relativePath: group.relativePath,
            repoRoot: group.repoRoot,
            folderLabel: group.folderLabel,
            matchCount: countOccurrences(group.matches),
            depth,
          })
          if (collapsedFiles.has(`${group.repoRoot}\0${group.relativePath}`)) continue
          for (const match of group.matches) {
            flat.push({ kind: 'match', match, depth: depth + 1 })
          }
        }
      }
      return flat
    }

    for (const group of groups) {
      flat.push({
        kind: 'file',
        relativePath: group.relativePath,
        repoRoot: group.repoRoot,
        folderLabel: group.folderLabel,
        matchCount: countOccurrences(group.matches),
        depth: 0,
      })
      if (collapsedFiles.has(`${group.repoRoot}\0${group.relativePath}`)) continue
      for (const match of group.matches) {
        flat.push({ kind: 'match', match, depth: 1 })
      }
    }
    return flat
  }, [collapsedFiles, collapsedFolders, folderGroups, groups, viewMode])

  const handleReplaceAll = async () => {
    const outcome = await replaceAll()
    if (!outcome) return
    if ('error' in outcome && outcome.error === 'invalidRegex') {
      toast.error(t('editor.searchInvalidRegex'))
      return
    }
    const { result } = outcome
    if (result.failures.length > 0) {
      toast.error(t('editor.searchReplaceFailed'))
    }
    if (result.replacementCount > 0) {
      toast.success(t('editor.searchReplaceDone', { count: result.replacementCount, files: result.fileCount }))
    } else if (result.failures.length === 0) {
      toast.info(t('editor.searchReplaceNone'))
    }
  }

  const handleReplaceInFile = async (relativePath: string, folderRepoRoot: string) => {
    const outcome = await replaceInFile(relativePath, folderRepoRoot)
    if (!outcome) return
    if ('error' in outcome && outcome.error === 'invalidRegex') {
      toast.error(t('editor.searchInvalidRegex'))
      return
    }
    const { result } = outcome
    if (result.failures.length > 0) {
      toast.error(t('editor.searchReplaceFailed'))
      return
    }
    if (result.replacementCount > 0) {
      toast.success(t('editor.searchReplaceDone', { count: result.replacementCount, files: result.fileCount }))
    } else {
      toast.info(t('editor.searchReplaceNone'))
    }
  }

  const hasQuery = Boolean(query.trim())
  const showSummary = hasQuery && (resultStats.matchCount > 0 || isSearching)

  return (
    <div className="editor-search-panel flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1 px-2 pt-1">
        <EditorSearchToolbar
          onRefresh={refreshSearch}
          onClearResults={clearResults}
          onNewSearchEditor={() => toast.info(t('editor.searchActions.newSearchEditorSoon'))}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
          onCollapseAll={collapseAll}
          disabled={!repoCwd}
        />

        <EditorSearchQueryInput
          value={query}
          onChange={setQuery}
          placeholder={t('editor.searchPlaceholder')}
          showReplace={showReplace}
          onToggleReplace={() => setShowReplace(v => !v)}
          caseSensitive={options.caseSensitive}
          wholeWord={options.wholeWord}
          regex={options.regex}
          onToggleCaseSensitive={() => setOptions(o => ({ ...o, caseSensitive: !o.caseSensitive }))}
          onToggleWholeWord={() => setOptions(o => ({ ...o, wholeWord: !o.wholeWord }))}
          onToggleRegex={() => setOptions(o => ({ ...o, regex: !o.regex }))}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(v => !v)}
          trailing={isSearching ? <Loader2 className="mr-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        />

        {showReplace ? (
          <EditorSearchReplaceInput
            value={replaceText}
            onChange={setReplaceText}
            placeholder={t('editor.replacePlaceholder')}
            onReplaceAll={() => void handleReplaceAll()}
            replaceAllDisabled={!query.trim()}
            isReplacing={isReplacing}
          />
        ) : null}

        {showFilters ? (
          <div className="space-y-1">
            <EditorSearchPatternInput
              value={options.includePattern}
              onChange={value => setOptions(o => ({ ...o, includePattern: value }))}
              placeholder={t('editor.filesToInclude')}
              ariaLabel={t('editor.filesToInclude')}
              toggleIcon={BookOpen}
              toggleActive={options.onlyOpenEditors}
              onToggle={() => setOptions(o => ({ ...o, onlyOpenEditors: !o.onlyOpenEditors }))}
              toggleTitle={t('editor.searchOnlyOpenEditors')}
            />
            <EditorSearchPatternInput
              value={options.excludePattern}
              onChange={value => setOptions(o => ({ ...o, excludePattern: value }))}
              placeholder={t('editor.filesToExclude')}
              ariaLabel={t('editor.filesToExclude')}
              toggleIcon={FilterX}
              toggleActive={options.useExcludesAndIgnoreFiles}
              onToggle={() => setOptions(o => ({ ...o, useExcludesAndIgnoreFiles: !o.useExcludesAndIgnoreFiles }))}
              toggleTitle={t('editor.useExcludesAndIgnoreFiles')}
            />
          </div>
        ) : null}
      </div>

      {showSummary ? (
        <p className="shrink-0 px-3 py-1 text-[11px] text-muted-foreground">
          {isSearching ? t('editor.searchSearching') : t('editor.searchResultSummary', { results: resultStats.matchCount, files: resultStats.fileCount })}
          {!options.useExcludesAndIgnoreFiles ? (
            <span>
              {' '}
              — {t('editor.searchExcludesDisabled')}{' '}
              <button type="button" className="text-primary hover:underline" onClick={() => setOptions(o => ({ ...o, useExcludesAndIgnoreFiles: true }))}>
                {t('editor.searchEnableExcludes')}
              </button>
            </span>
          ) : null}
        </p>
      ) : null}

      {truncated ? <p className="shrink-0 px-3 text-[11px] text-amber-600 dark:text-amber-400">{t('editor.searchTruncated')}</p> : null}

      <DiffViewerFileTreeVirtualList<SearchResultRow>
        rows={rows}
        getRowKey={(row, i) => {
          if (row.kind === 'folder') return `folder:${row.folderPath}`
          if (row.kind === 'file') return `file:${row.repoRoot}\0${row.relativePath}`
          return `match:${row.match.repoRoot}\0${row.match.relativePath}:${row.match.line}:${i}`
        }}
        estimateRowHeight={row => {
          if (row.kind === 'folder') return SEARCH_FOLDER_ROW_HEIGHT
          if (row.kind === 'file') return SEARCH_FILE_ROW_HEIGHT
          return SEARCH_MATCH_ROW_HEIGHT
        }}
        className="min-h-0 flex-1 px-1 pb-1"
        emptyState={<p className="px-2 py-4 text-xs text-muted-foreground">{hasQuery ? t('editor.searchNoResults') : t('editor.searchHint')}</p>}
        renderRow={row => {
          if (row.kind === 'folder') {
            const expanded = !collapsedFolders.has(row.folderPath)
            return (
              <button
                type="button"
                className="flex h-full w-full min-w-0 items-center gap-1 rounded-sm px-1 text-left hover:bg-muted/60"
                onClick={() => toggleFolderCollapsed(row.folderPath)}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <MaterialFileIcon name={row.folderPath || 'folder'} kind="folder" expanded={expanded} size={16} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{formatFolderLabel(row.folderPath)}</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{row.matchCount}</span>
              </button>
            )
          }

          if (row.kind === 'file') {
            const fileKey = `${row.repoRoot}\0${row.relativePath}`
            const expanded = !collapsedFiles.has(fileKey)
            const fileName = row.relativePath.split('/').pop() ?? row.relativePath
            const dirPath = row.relativePath.includes('/') ? row.relativePath.slice(0, row.relativePath.lastIndexOf('/')) : ''
            const paddingLeft = 4 + row.depth * 12
            return (
              <div className="group flex h-full w-full min-w-0 items-center gap-0.5" style={{ paddingLeft }}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1 rounded-sm py-0.5 pr-0.5 text-left hover:bg-muted/60"
                  onClick={() => toggleFileCollapsed(row.relativePath, row.repoRoot)}
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <MaterialFileIcon name={row.relativePath} size={16} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={row.relativePath}>
                    {fileName}
                    {expanded && dirPath ? <span className="ml-1 text-muted-foreground/70">{dirPath}</span> : null}
                  </span>
                  {row.folderLabel ? <span className="shrink-0 truncate rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{row.folderLabel}</span> : null}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  {showReplace ? (
                    <button
                      type="button"
                      className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted/80 hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
                      aria-label={t('editor.replaceInFile')}
                      disabled={isReplacing}
                      onClick={e => {
                        e.stopPropagation()
                        void handleReplaceInFile(row.relativePath, row.repoRoot)
                      }}
                    >
                      <Replace className={cn('h-3.5 w-3.5', isReplacing && 'animate-pulse')} strokeWidth={1.75} />
                    </button>
                  ) : null}
                  <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                    <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground transition-opacity group-hover:opacity-0">{row.matchCount}</span>
                    <button
                      type="button"
                      className="absolute inset-0 flex items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted/80 hover:text-foreground group-hover:opacity-100"
                      aria-label={t('editor.searchDismissFile')}
                      onClick={e => {
                        e.stopPropagation()
                        dismissFile(row.relativePath, row.repoRoot)
                      }}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          const { match } = row
          const paddingLeft = 20 + row.depth * 12
          return (
            <button
              type="button"
              className={cn('w-full truncate rounded-sm py-0.5 text-left text-[13px] hover:bg-muted/70')}
              style={{ paddingLeft }}
              onClick={() => onOpenMatch(match)}
            >
              <EditorSearchMatchHighlight
                preview={match.preview.trim() || `${match.line}:${match.column}`}
                query={query}
                caseSensitive={options.caseSensitive}
                wholeWord={options.wholeWord}
                regex={options.regex}
              />
            </button>
          )
        }}
      />
    </div>
  )
}
