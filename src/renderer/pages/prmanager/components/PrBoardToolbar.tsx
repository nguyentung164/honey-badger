'use client'

import {
  ArrowDownToLine,
  BrushCleaning,
  ChevronDown,
  CircleCheckBig,
  FileWarning,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestCreate,
  GitPullRequestCreateArrow,
  GitPullRequestDraft,
  ListChecks,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate, PrRepo } from '../hooks/usePrData'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS, PR_GH_STATUS_TEXT_CLASS } from '../prGhStatus'
import type { BulkActionKind } from './prBoardBulkResolve'
import { PrBoardFullTableSyncButton, type PrBoardSyncProgressEvent } from './PrBoardFullTableSyncButton'

const PR_GH_FILTER_IDS = PR_GH_STATUS_IDS
const PR_GH_FILTER_STYLE: Record<PrGhStatusKind, { label: string; checkbox: string }> = {
  open: {
    label: PR_GH_STATUS_TEXT_CLASS.open,
    checkbox:
      'data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white dark:data-[state=checked]:border-emerald-500 dark:data-[state=checked]:bg-emerald-600',
  },
  draft: {
    label: PR_GH_STATUS_TEXT_CLASS.draft,
    checkbox:
      'data-[state=checked]:border-slate-500 data-[state=checked]:bg-slate-500 data-[state=checked]:text-white dark:data-[state=checked]:border-slate-500 dark:data-[state=checked]:bg-slate-500',
  },
  merged: {
    label: PR_GH_STATUS_TEXT_CLASS.merged,
    checkbox:
      'data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600 data-[state=checked]:text-white dark:data-[state=checked]:border-violet-500 dark:data-[state=checked]:bg-violet-600',
  },
  closed: {
    label: PR_GH_STATUS_TEXT_CLASS.closed,
    checkbox:
      'data-[state=checked]:border-rose-600 data-[state=checked]:bg-rose-600 data-[state=checked]:text-white dark:data-[state=checked]:border-rose-500 dark:data-[state=checked]:bg-rose-600',
  },
}

type PrGhAdvancedCombineMode = 'and' | 'or'

export type PrBoardToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  i18nLanguage: string
  handleSyncFromGithub: (source?: 'manual' | 'idle') => void | Promise<void>
  showFullTableGithubSyncOverlay: boolean
  onSyncProgress?: (event: PrBoardSyncProgressEvent) => void
  onRegisterSyncProgressReset: (reset: () => void) => () => void
  lastGithubSyncAt: number | null
  lastGithubSyncWasAuto: boolean
  statusChangedKeysSize: number
  handleDismissStatusChanges: () => void
  autoSyncGithub: boolean
  setAutoSyncGithub: (on: boolean) => void
  writeAutoSyncGithub: (projectId: string, on: boolean) => void
  projectId: string
  githubTokenOk: boolean
  repos: PrRepo[]
  isAnyGithubSync: boolean
  openCreatePrFromToolbar: () => void
  handlePruneStaleDryRun: () => void | Promise<void>
  userId: string | null
  pruningStaleBusy: boolean
  setFileOverlapOpen: (open: boolean) => void
  setAiAssistOpen: (open: boolean) => void
  sortedReposForFilter: PrRepo[]
  activeTemplates: PrCheckpointTemplate[]
  repoExcludedSet: Set<string>
  setRepoExcludedIds: React.Dispatch<React.SetStateAction<string[]>>
  onlyExistingOnRemote: boolean
  setOnlyExistingOnRemote: (v: boolean) => void
  remoteExistLoading: boolean
  remoteExistMap: Record<string, boolean> | null
  branchesOnRemoteCount: number | null
  onlyBranchesWithoutPr: boolean
  setOnlyBranchesWithoutPr: (v: boolean) => void
  branchesWithoutPrCount: number
  advancedFiltersOpen: boolean
  prGhAdvancedCombineMode: PrGhAdvancedCombineMode
  prGhSimpleCombineMode: PrGhAdvancedCombineMode
  setPrGhAdvancedCombineMode: (v: PrGhAdvancedCombineMode) => void
  setPrGhSimpleCombineMode: (v: PrGhAdvancedCombineMode) => void
  prGhFilters: Set<PrGhStatusKind>
  setPrGhFilters: React.Dispatch<React.SetStateAction<Set<PrGhStatusKind>>>
  prGhFilterCounts: Record<PrGhStatusKind, number>
  toggleAdvancedFilters: () => void
  orderedPrCheckpointTemplates: PrCheckpointTemplate[]
  prGhAdvancedColumnCounts: Record<string, Record<PrGhStatusKind, number>>
  prGhFiltersByTpl: Record<string, PrGhStatusKind[]>
  toggleTplGhFilter: (tplId: string, id: PrGhStatusKind, checked: boolean) => void
  bulkCreatePrToolbarEnabled: boolean
  bulkElig: Record<string, number>
  setBulkToolbarConfirm: (kind: BulkActionKind | null) => void
  selectedRowIdsSize: number
}

export const PrBoardToolbar = memo(function PrBoardToolbar(props: PrBoardToolbarProps) {
  const { t } = useTranslation()
  const {
    search,
    onSearchChange,
    i18nLanguage,
    handleSyncFromGithub,
    showFullTableGithubSyncOverlay,
    onSyncProgress,
    onRegisterSyncProgressReset,
    lastGithubSyncAt,
    lastGithubSyncWasAuto,
    statusChangedKeysSize,
    handleDismissStatusChanges,
    autoSyncGithub,
    setAutoSyncGithub,
    writeAutoSyncGithub,
    projectId,
    githubTokenOk,
    repos,
    isAnyGithubSync,
    openCreatePrFromToolbar,
    handlePruneStaleDryRun,
    userId,
    pruningStaleBusy,
    setFileOverlapOpen,
    setAiAssistOpen,
    sortedReposForFilter,
    activeTemplates,
    repoExcludedSet,
    setRepoExcludedIds,
    onlyExistingOnRemote,
    setOnlyExistingOnRemote,
    remoteExistLoading,
    remoteExistMap,
    branchesOnRemoteCount,
    onlyBranchesWithoutPr,
    setOnlyBranchesWithoutPr,
    branchesWithoutPrCount,
    advancedFiltersOpen,
    prGhAdvancedCombineMode,
    prGhSimpleCombineMode,
    setPrGhAdvancedCombineMode,
    setPrGhSimpleCombineMode,
    prGhFilters,
    setPrGhFilters,
    prGhFilterCounts,
    toggleAdvancedFilters,
    orderedPrCheckpointTemplates,
    prGhAdvancedColumnCounts,
    prGhFiltersByTpl,
    toggleTplGhFilter,
    bulkCreatePrToolbarEnabled,
    bulkElig,
    setBulkToolbarConfirm,
    selectedRowIdsSize,
  } = props

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => onSearchChange(e.target.value)} placeholder={t('prManager.board.searchPh')} className="h-8 w-[260px] pl-7 text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PrBoardFullTableSyncButton
            projectId={projectId}
            showFullTableGithubSyncOverlay={showFullTableGithubSyncOverlay}
            lastGithubSyncAt={lastGithubSyncAt}
            lastGithubSyncWasAuto={lastGithubSyncWasAuto}
            i18nLanguage={i18nLanguage}
            disabled={repos.length === 0 || isAnyGithubSync}
            onSync={() => void handleSyncFromGithub('manual')}
            onSyncProgress={onSyncProgress}
            onRegisterReset={onRegisterSyncProgressReset}
          />
          {statusChangedKeysSize > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 border-emerald-500/60 bg-emerald-50/80 text-emerald-800 shadow-none hover:bg-emerald-100/90 hover:text-emerald-900 dark:border-emerald-500/45 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-950/50"
                  onClick={handleDismissStatusChanges}
                  aria-label={t('prManager.board.statusChangesDismissAria', { count: statusChangedKeysSize })}
                >
                  <ListChecks className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium">{t('prManager.board.statusChangesDismiss')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {t('prManager.board.statusChangesDismissHelp', { count: statusChangedKeysSize })}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <div className="border-l border-border/60 pl-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    githubTokenOk && repos.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  )}
                >
                  <Checkbox
                    id="pr-board-auto-sync-github"
                    checked={autoSyncGithub}
                    className="data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600 data-[state=checked]:text-white dark:data-[state=checked]:border-violet-500 dark:data-[state=checked]:bg-violet-600"
                    onCheckedChange={v => {
                      const on = v === true
                      setAutoSyncGithub(on)
                      writeAutoSyncGithub(projectId, on)
                    }}
                    disabled={!githubTokenOk || repos.length === 0}
                  />
                  <Label
                    htmlFor="pr-board-auto-sync-github"
                    className={cn(
                      'cursor-pointer text-xs font-medium leading-none text-violet-900 dark:text-violet-200',
                      (!githubTokenOk || repos.length === 0) && 'cursor-not-allowed'
                    )}
                  >
                    {t('prManager.board.autoSyncGithub')}
                  </Label>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {t('prManager.board.autoSyncGithubHelp')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                disabled={!githubTokenOk || repos.length === 0}
                onClick={openCreatePrFromToolbar}
                aria-label={t('prManager.board.createPrCell')}
              >
                <GitPullRequestCreate className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[7rem] truncate text-xs font-medium sm:max-w-none">{t('prManager.board.createPrCell')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t('prManager.createPr.title')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                disabled={repos.length === 0 || isAnyGithubSync || !githubTokenOk || !userId?.trim() || pruningStaleBusy}
                onClick={() => void handlePruneStaleDryRun()}
                aria-label={t('prManager.board.pruneStaleRemote')}
              >
                <BrushCleaning className={cn('h-3.5 w-3.5 shrink-0', pruningStaleBusy && 'animate-pulse')} />
                <span className="max-w-[7rem] truncate text-xs font-medium sm:max-w-none">{t('prManager.board.pruneStaleRemote')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t('prManager.board.pruneStaleRemoteHelp')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                disabled={!githubTokenOk || repos.length === 0}
                onClick={() => setFileOverlapOpen(true)}
                aria-label={t('prManager.fileOverlap.ariaOpen')}
              >
                <FileWarning className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[7rem] truncate text-xs font-medium sm:max-w-none">{t('prManager.fileOverlap.buttonLabel')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t('prManager.fileOverlap.tooltip')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2 text-violet-600 hover:bg-violet-50 hover:text-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
                disabled={repos.length === 0}
                onClick={() => setAiAssistOpen(true)}
                aria-label={t('prManager.aiAssist.openButton')}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[6.5rem] truncate text-xs font-medium sm:max-w-none">{t('prManager.aiAssist.openButton')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t('prManager.aiAssist.sheetHint')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {sortedReposForFilter.length > 0 && activeTemplates.length === 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">{t('prManager.board.filterRepos')}</span>
          {sortedReposForFilter.map(repo => (
            <Tooltip key={repo.id}>
              <TooltipTrigger asChild>
                <span className="flex max-w-[min(100%,16rem)] cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <Checkbox
                    id={`pr-repo-filter-${repo.id}`}
                    checked={!repoExcludedSet.has(repo.id)}
                    className="shrink-0 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-500 dark:data-[state=checked]:bg-blue-600"
                    onCheckedChange={v => {
                      const show = v === true
                      setRepoExcludedIds(prev => {
                        if (show) {
                          const next = prev.filter(id => id !== repo.id)
                          return next.length === prev.length ? prev : next
                        }
                        if (prev.includes(repo.id)) return prev
                        return [...prev, repo.id].sort()
                      })
                    }}
                  />
                  <Label htmlFor={`pr-repo-filter-${repo.id}`} className="min-w-0 cursor-pointer truncate text-xs font-medium leading-none text-foreground">
                    {repo.name}
                  </Label>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {`${repo.name} (${repo.owner}/${repo.repo})`}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {repos.length > 0 && activeTemplates.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
          <div className="flex min-w-0 min-h-6 flex-1 flex-col rounded-md border border-dashed bg-muted/30 px-3 py-2.5">
            <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-2 pb-1">
              {sortedReposForFilter.length > 0 ? (
                <>
                  <span className="shrink-0 text-[11px] font-medium leading-snug text-muted-foreground">{t('prManager.board.filterRepos')}</span>
                  {sortedReposForFilter.map(repo => (
                    <Tooltip key={repo.id}>
                      <TooltipTrigger asChild>
                        <span className="flex max-w-[min(100%,16rem)] cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                          <Checkbox
                            id={`pr-repo-filter-${repo.id}`}
                            checked={!repoExcludedSet.has(repo.id)}
                            className="shrink-0 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-500 dark:data-[state=checked]:bg-blue-600"
                            onCheckedChange={v => {
                              const show = v === true
                              setRepoExcludedIds(prev => {
                                if (show) {
                                  const next = prev.filter(id => id !== repo.id)
                                  return next.length === prev.length ? prev : next
                                }
                                if (prev.includes(repo.id)) return prev
                                return [...prev, repo.id].sort()
                              })
                            }}
                          />
                          <Label htmlFor={`pr-repo-filter-${repo.id}`} className="min-w-0 cursor-pointer truncate text-xs font-medium leading-none text-foreground">
                            {repo.name}
                          </Label>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        {`${repo.name} (${repo.owner}/${repo.repo})`}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  <div className="h-3 w-px shrink-0 self-center bg-border" aria-hidden />
                </>
              ) : null}
              <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="shrink-0 text-[11px] font-medium leading-snug text-muted-foreground">{t('prManager.board.filterByBranchLabel')}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <Checkbox
                        id="pr-filter-remote-exists"
                        checked={onlyExistingOnRemote}
                        className="data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white dark:data-[state=checked]:border-green-500"
                        onCheckedChange={v => {
                          if (v === true) setOnlyExistingOnRemote(true)
                          else setOnlyExistingOnRemote(false)
                        }}
                      />
                      <Label
                        htmlFor="pr-filter-remote-exists"
                        className="flex cursor-pointer items-center gap-1.5 text-xs font-medium leading-none text-green-800 dark:text-green-200 tabular-nums"
                      >
                        {remoteExistLoading && onlyExistingOnRemote ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
                        {`${t('prManager.board.onlyRemote')} (${remoteExistMap == null && remoteExistLoading ? '—' : branchesOnRemoteCount == null ? '—' : branchesOnRemoteCount})`}
                      </Label>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {t('prManager.board.onlyRemoteTitle')}
                  </TooltipContent>
                </Tooltip>
                <div className="h-3 w-px shrink-0 self-center bg-border" aria-hidden />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <Checkbox
                        id="pr-filter-without-pr"
                        checked={onlyBranchesWithoutPr}
                        className="data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white dark:data-[state=checked]:border-amber-500"
                        onCheckedChange={v => {
                          if (v === true) setOnlyBranchesWithoutPr(true)
                          else setOnlyBranchesWithoutPr(false)
                        }}
                      />
                      <Label
                        htmlFor="pr-filter-without-pr"
                        className="flex cursor-pointer items-center gap-1.5 text-xs font-medium leading-none text-amber-900 tabular-nums dark:text-amber-200"
                      >
                        {remoteExistLoading && onlyBranchesWithoutPr && !onlyExistingOnRemote ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
                        {t('prManager.board.onlyNoPr')} ({remoteExistMap == null && remoteExistLoading ? '—' : branchesWithoutPrCount})
                      </Label>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {t('prManager.board.onlyNoPrTitle')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <Collapsible open={advancedFiltersOpen}>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-1">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="shrink-0 text-[11px] font-medium leading-snug text-muted-foreground">{t('prManager.board.advancedCombineLabel')}</span>
                  <ToggleGroup
                    type="single"
                    value={advancedFiltersOpen ? prGhAdvancedCombineMode : prGhSimpleCombineMode}
                    onValueChange={v => {
                      if (v !== 'and' && v !== 'or') return
                      if (advancedFiltersOpen) setPrGhAdvancedCombineMode(v)
                      else setPrGhSimpleCombineMode(v)
                    }}
                    variant="default"
                    size="xs"
                    spacing={0}
                    className={cn('shrink-0 gap-0 rounded-lg bg-zinc-200/95 shadow-sm', 'dark:bg-zinc-800 dark:shadow-black/20')}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem
                          value="and"
                          className={cn(
                            'border-0 font-medium shadow-none',
                            'rounded-sm text-muted-foreground hover:bg-zinc-300/70 hover:text-foreground dark:hover:bg-zinc-700',
                            'data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
                            'data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
                            'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                          )}
                        >
                          {t('prManager.board.advancedCombineAnd')}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        {t('prManager.board.advancedCombineAndHelp')}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem
                          value="or"
                          className={cn(
                            'border-0 font-medium shadow-none',
                            'rounded-sm text-muted-foreground hover:bg-zinc-300/70 hover:text-foreground dark:hover:bg-zinc-700',
                            'data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
                            'data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
                            'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                          )}
                        >
                          {t('prManager.board.advancedCombineOr')}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        {t('prManager.board.advancedCombineOrHelp')}
                      </TooltipContent>
                    </Tooltip>
                  </ToggleGroup>
                  {!advancedFiltersOpen ? (
                    <>
                      <div className="h-3 w-px shrink-0 self-center bg-border" aria-hidden />
                      {PR_GH_FILTER_IDS.map(id => (
                        <Tooltip key={id}>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                              <Checkbox
                                id={`pr-gh-filter-${id}`}
                                checked={prGhFilters.has(id)}
                                className={PR_GH_FILTER_STYLE[id].checkbox}
                                onCheckedChange={v => {
                                  setPrGhFilters(prev => {
                                    const n = new Set(prev)
                                    if (v === true) n.add(id)
                                    else n.delete(id)
                                    return n
                                  })
                                }}
                              />
                              <Label htmlFor={`pr-gh-filter-${id}`} className={cn('cursor-pointer text-xs font-medium leading-none tabular-nums', PR_GH_FILTER_STYLE[id].label)}>
                                {t(`prManager.ghStatus.${id}`)} ({prGhFilterCounts[id]})
                              </Label>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs">
                            {t(`prManager.ghStatus.tooltips.${id}`)}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </>
                  ) : null}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="link"
                      className="inline-flex h-8 min-h-8 shrink-0 items-center gap-1 px-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={toggleAdvancedFilters}
                      aria-expanded={advancedFiltersOpen}
                    >
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out', advancedFiltersOpen && '-rotate-180')} aria-hidden />
                      {advancedFiltersOpen ? t('prManager.board.advancedCollapse') : t('prManager.board.advancedOpen')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {t('prManager.board.advancedFiltersHelp')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <CollapsibleContent className={cn('overflow-hidden', 'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none')}>
                <div className="flex flex-col gap-2 pt-1">
                  {orderedPrCheckpointTemplates.map(tpl => {
                    const colCounts = prGhAdvancedColumnCounts[tpl.id]
                    const effective = prGhFiltersByTpl[tpl.id] ?? PR_GH_FILTER_IDS.filter(k => prGhFilters.has(k))
                    return (
                      <div key={tpl.id} className="flex min-h-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-l-2 border-l-border/80 pl-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="min-w-[6rem] max-w-[160px] cursor-default truncate text-xs font-semibold text-foreground/90">{tpl.label}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            {tpl.label}
                          </TooltipContent>
                        </Tooltip>
                        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
                          {PR_GH_FILTER_IDS.map(id => (
                            <Tooltip key={id}>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                                  <Checkbox
                                    id={`pr-gh-filter-${tpl.id}-${id}`}
                                    checked={effective.includes(id)}
                                    className={PR_GH_FILTER_STYLE[id].checkbox}
                                    onCheckedChange={v => toggleTplGhFilter(tpl.id, id, v === true)}
                                  />
                                  <Label
                                    htmlFor={`pr-gh-filter-${tpl.id}-${id}`}
                                    className={cn('cursor-pointer text-xs font-medium leading-none tabular-nums', PR_GH_FILTER_STYLE[id].label)}
                                  >
                                    {t(`prManager.ghStatus.${id}`)} ({colCounts?.[id] ?? 0})
                                  </Label>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-xs">
                                {t(`prManager.ghStatus.tooltips.${id}`)}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <div className="ml-auto flex min-w-0 max-w-full shrink-0 flex-col items-stretch gap-1.5 rounded-md border border-dashed bg-muted/30 px-2 pt-1.5 sm:px-3">
            <span className="w-full text-center text-[12px] font-medium leading-none text-muted-foreground">{t('prManager.bulk.toolbarLabel')}</span>
            <div className="flex min-h-8 w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        bulkCreatePrToolbarEnabled
                          ? 'border-sky-600 bg-sky-600 text-white shadow-none hover:border-sky-700 hover:bg-sky-700 hover:text-white dark:border-sky-500 dark:bg-sky-500 dark:hover:border-sky-400 dark:hover:bg-sky-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!bulkCreatePrToolbarEnabled}
                      onClick={() => setBulkToolbarConfirm('createPr')}
                    >
                      <GitPullRequestCreate className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.createPr')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.merge > 0
                          ? 'border-violet-600 bg-violet-600 text-white shadow-none hover:border-violet-700 hover:bg-violet-700 hover:text-white dark:border-violet-500 dark:bg-violet-600 dark:hover:border-violet-400 dark:hover:bg-violet-500'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.merge === 0}
                      onClick={() => setBulkToolbarConfirm('merge')}
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.merge')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.approve > 0
                          ? 'border-teal-600 bg-teal-600 text-white shadow-none hover:border-teal-700 hover:bg-teal-700 hover:text-white dark:border-teal-500 dark:bg-teal-500 dark:hover:border-teal-400 dark:hover:bg-teal-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.approve === 0}
                      onClick={() => setBulkToolbarConfirm('approve')}
                    >
                      <CircleCheckBig className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.approve')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.close > 0
                          ? 'border-rose-600 bg-rose-600 text-white shadow-none hover:border-rose-700 hover:bg-rose-700 hover:text-white dark:border-rose-500 dark:bg-rose-500 dark:hover:border-rose-400 dark:hover:bg-rose-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.close === 0}
                      onClick={() => setBulkToolbarConfirm('close')}
                    >
                      <GitPullRequestClosed className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.close')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.reopen > 0
                          ? 'border-orange-600 bg-orange-600 text-white shadow-none hover:border-orange-700 hover:bg-orange-700 hover:text-white dark:border-orange-500 dark:bg-orange-500 dark:hover:border-orange-400 dark:hover:bg-orange-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.reopen === 0}
                      onClick={() => setBulkToolbarConfirm('reopen')}
                    >
                      <GitPullRequestCreateArrow className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.reopen')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.draft > 0
                          ? 'border-slate-600 bg-slate-600 text-white shadow-none hover:border-slate-700 hover:bg-slate-700 hover:text-white dark:border-slate-500 dark:bg-slate-500 dark:hover:border-slate-400 dark:hover:bg-slate-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.draft === 0}
                      onClick={() => setBulkToolbarConfirm('draft')}
                    >
                      <GitPullRequestDraft className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.draft')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.ready > 0
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-none hover:border-emerald-700 hover:bg-emerald-700 hover:text-white dark:border-emerald-500 dark:bg-emerald-500 dark:hover:border-emerald-400 dark:hover:bg-emerald-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.ready === 0}
                      onClick={() => setBulkToolbarConfirm('ready')}
                    >
                      <GitPullRequestArrow className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.ready')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.requestReviewers > 0
                          ? 'border-fuchsia-600 bg-fuchsia-600 text-white shadow-none hover:border-fuchsia-700 hover:bg-fuchsia-700 hover:text-white dark:border-fuchsia-500 dark:bg-fuchsia-500 dark:hover:border-fuchsia-400 dark:hover:bg-fuchsia-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.requestReviewers === 0}
                      onClick={() => setBulkToolbarConfirm('requestReviewers')}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.requestReviewers')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.updateBranch > 0
                          ? 'border-green-600 bg-green-600 text-white shadow-none hover:border-green-700 hover:bg-green-700 hover:text-white dark:border-green-500 dark:bg-green-500 dark:hover:border-green-400 dark:hover:bg-green-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.updateBranch === 0}
                      onClick={() => setBulkToolbarConfirm('updateBranch')}
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.updateBranch')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-md">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-8 w-8 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
                        githubTokenOk && bulkElig.deleteBranch > 0
                          ? 'border-red-600 bg-red-600 text-white shadow-none hover:border-red-700 hover:bg-red-700 hover:text-white dark:border-red-500 dark:bg-red-500 dark:hover:border-red-400 dark:hover:bg-red-400'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                      )}
                      disabled={!githubTokenOk || bulkElig.deleteBranch === 0}
                      onClick={() => setBulkToolbarConfirm('deleteRemoteBranch')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('prManager.bulk.tt.deleteRemoteBranch')}
                </TooltipContent>
              </Tooltip>
            </div>
            {selectedRowIdsSize > 0 ? (
              <span className="w-full text-center text-xs tabular-nums text-muted-foreground">{t('prManager.bulk.nSelected', { count: selectedRowIdsSize })}</span>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
})
