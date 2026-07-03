'use client'

import { ChevronDown, ChevronRight, Loader2, Replace, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import toast from '@/components/ui-elements/Toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useEditorSearch } from '@/pages/editor/hooks/useEditorSearch'
import { DiffViewerFileTreeVirtualList } from '@/pages/diffviewer/DiffViewerFileTreeVirtualList'
import type { SearchInFilesMatch } from 'shared/editor/types'

type EditorSearchPanelProps = {
  repoCwd: string
  onOpenMatch: (match: SearchInFilesMatch) => void
  onFilesReplaced?: (relativePaths: string[]) => void
}

type SearchResultRow =
  | { kind: 'file'; relativePath: string; matchCount: number }
  | { kind: 'match'; match: SearchInFilesMatch }

export function EditorSearchPanel({ repoCwd, onOpenMatch, onFilesReplaced }: EditorSearchPanelProps) {
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
    options,
    setOptions,
    groups,
    isSearching,
    isReplacing,
    truncated,
    replaceAll,
    replaceInFile,
  } = useEditorSearch(repoCwd, onFilesReplaced)

  const rows = useMemo<SearchResultRow[]>(() => {
    const flat: SearchResultRow[] = []
    for (const group of groups) {
      flat.push({ kind: 'file', relativePath: group.relativePath, matchCount: group.matches.length })
      for (const match of group.matches) {
        flat.push({ kind: 'match', match })
      }
    }
    return flat
  }, [groups])

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

  const handleReplaceInFile = async (relativePath: string) => {
    const outcome = await replaceInFile(relativePath)
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('editor.searchPlaceholder')}
            className="h-8 pl-8 pr-8 text-xs"
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded hover:bg-muted"
            aria-label={t('editor.toggleReplace')}
            aria-expanded={showReplace}
            onClick={() => setShowReplace(v => !v)}
          >
            {showReplace ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {isSearching && <Loader2 className="pointer-events-none absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>

        {showReplace ? (
          <div className="relative">
            <Replace className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder={t('editor.replacePlaceholder')}
              className="h-8 pl-8 text-xs"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Checkbox checked={options.caseSensitive} onCheckedChange={v => setOptions(o => ({ ...o, caseSensitive: Boolean(v) }))} />
              <span>{t('editor.matchCase')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox checked={options.wholeWord} onCheckedChange={v => setOptions(o => ({ ...o, wholeWord: Boolean(v) }))} />
              <span>{t('editor.wholeWord')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox checked={options.regex} onCheckedChange={v => setOptions(o => ({ ...o, regex: Boolean(v) }))} />
              <span>{t('editor.useRegex')}</span>
            </div>
          </div>
          <button
            type="button"
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(v => !v)}
          >
            {showFilters ? t('editor.searchHideFilters') : t('editor.searchShowFilters')}
          </button>
        </div>

        {showFilters ? (
          <div className="space-y-1.5">
            <Input
              value={options.includePattern}
              onChange={e => setOptions(o => ({ ...o, includePattern: e.target.value }))}
              placeholder={t('editor.filesToIncludePlaceholder')}
              className="h-7 text-[11px]"
              aria-label={t('editor.filesToInclude')}
            />
            <Input
              value={options.excludePattern}
              onChange={e => setOptions(o => ({ ...o, excludePattern: e.target.value }))}
              placeholder={t('editor.filesToExcludePlaceholder')}
              className="h-7 text-[11px]"
              aria-label={t('editor.filesToExclude')}
            />
          </div>
        ) : null}

        {showReplace ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 w-full text-xs"
            disabled={!query.trim() || isReplacing || isSearching}
            onClick={() => void handleReplaceAll()}
          >
            {isReplacing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Replace className="mr-1.5 h-3.5 w-3.5" />}
            {t('editor.replaceAll')}
          </Button>
        ) : null}
      </div>

      {truncated && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('editor.searchTruncated')}</p>}

      <DiffViewerFileTreeVirtualList<SearchResultRow>
        rows={rows}
        getRowKey={(row, i) => (row.kind === 'file' ? `file:${row.relativePath}` : `match:${row.match.relativePath}:${row.match.line}:${i}`)}
        estimateRowHeight={row => (row.kind === 'file' ? 32 : 44)}
        className="min-h-0 flex-1"
        emptyState={<p className="px-1 py-4 text-xs text-muted-foreground">{query ? t('editor.searchNoResults') : t('editor.searchHint')}</p>}
        renderRow={row => {
          if (row.kind === 'file') {
            const fileName = row.relativePath.split('/').pop() ?? row.relativePath
            return (
              <div className="flex items-center gap-1 px-1 py-0.5">
                <div className="min-w-0 flex-1 truncate text-xs font-semibold" title={row.relativePath}>
                  {fileName}
                  <span className="ml-1 font-normal text-muted-foreground">({row.matchCount})</span>
                </div>
                {showReplace ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 shrink-0 px-2 text-[10px]"
                    disabled={isReplacing}
                    onClick={() => void handleReplaceInFile(row.relativePath)}
                  >
                    {t('editor.replaceInFile')}
                  </Button>
                ) : null}
              </div>
            )
          }

          const { match } = row
          return (
            <button
              type="button"
              className={cn('w-full rounded-sm px-2 py-1 text-left hover:bg-muted/70')}
              onClick={() => onOpenMatch(match)}
            >
              <div className="truncate text-[11px] text-muted-foreground">
                {match.line}:{match.column}
              </div>
              <div className="truncate text-xs">{match.preview}</div>
            </button>
          )
        }}
      />
    </div>
  )
}
