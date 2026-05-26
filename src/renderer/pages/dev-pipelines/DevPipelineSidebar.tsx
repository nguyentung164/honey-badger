'use client'

import { Check, Loader2, Minus, Pencil, Play, Plus, Trash2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DevPipelineFlowSummary, DevPipelineRunStatus } from 'shared/devPipelines/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { PipelineTemplatePanel } from './PipelineTemplatePanel'

export type DevPipelineSaveState = 'idle' | 'saving' | 'saved' | 'error'

function RunStatusBadge({
  running,
  lastRunStatus,
  saveState,
  compact,
}: {
  running: boolean
  lastRunStatus: DevPipelineRunStatus | null
  saveState: DevPipelineSaveState
  compact?: boolean
}) {
  const { t } = useTranslation()
  const badgeClass = compact
    ? 'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none'
    : 'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px]'

  if (saveState === 'saving') {
    return (
      <span className={cn(badgeClass, 'bg-muted text-muted-foreground')}>
        <Loader2 className="size-2.5 animate-spin" aria-hidden />
        {!compact ? t('devPipelines.autosaveSaving') : null}
      </span>
    )
  }

  if (saveState === 'saved') {
    return (
      <span className={cn(badgeClass, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
        <Check className="size-2.5" aria-hidden />
        {!compact ? t('devPipelines.autosaveSaved') : null}
      </span>
    )
  }

  if (saveState === 'error') {
    return (
      <span className={cn(badgeClass, 'bg-destructive/10 text-destructive')}>
        {compact ? <XCircle className="size-2.5" aria-hidden /> : t('devPipelines.autosaveError')}
      </span>
    )
  }

  if (running) {
    return (
      <span className={cn(badgeClass, 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
        <Loader2 className="size-2.5 animate-spin" aria-hidden />
        {!compact ? t('devPipelines.statusRunning') : null}
      </span>
    )
  }

  if (lastRunStatus === 'completed') {
    return (
      <span className={cn(badgeClass, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
        {compact ? <Check className="size-2.5" aria-hidden /> : t('devPipelines.statusSuccess')}
      </span>
    )
  }

  if (lastRunStatus === 'failed') {
    return (
      <span className={cn(badgeClass, 'bg-destructive/10 text-destructive')}>
        {compact ? <XCircle className="size-2.5" aria-hidden /> : t('devPipelines.statusError')}
      </span>
    )
  }

  if (lastRunStatus === 'cancelled') {
    return (
      <span className={cn(badgeClass, 'bg-muted text-muted-foreground')}>
        {compact ? <Minus className="size-2.5" aria-hidden /> : t('devPipelines.statusCancelled')}
      </span>
    )
  }

  return null
}

export function DevPipelineActiveBar({
  flowName,
  running,
  lastRunStatus,
  saveState,
  onRename,
  onRun,
  onCancelRun,
}: {
  flowName: string
  running: boolean
  lastRunStatus: DevPipelineRunStatus | null
  saveState: DevPipelineSaveState
  onRename: (name: string) => void
  onRun: () => void
  onCancelRun: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(flowName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(flowName)
  }, [flowName, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commitRename = useCallback(() => {
    const next = draft.trim()
    if (next && next !== flowName) onRename(next)
    setEditing(false)
  }, [draft, flowName, onRename])

  return (
    <div className="flex min-w-0 max-w-[min(100%,20rem)] items-center gap-0.5 rounded bg-card/50 px-1 py-0.5">
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setDraft(flowName)
              setEditing(false)
            }
          }}
          className="h-6 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
          aria-label={t('devPipelines.pipelineName')}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium leading-none text-foreground">{flowName}</span>
      )}
      <div className="flex size-5 shrink-0 items-center justify-center">
        <RunStatusBadge running={running} lastRunStatus={lastRunStatus} saveState={saveState} compact />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={t('devPipelines.rename')}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('devPipelines.rename')}</TooltipContent>
      </Tooltip>
      {running ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-emerald-500 hover:text-emerald-600"
              aria-label={t('devPipelines.cancelRun')}
              onClick={onCancelRun}
            >
              <Loader2 className="size-3 animate-spin" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('devPipelines.cancelRun')}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600"
              aria-label={t('devPipelines.run')}
              onClick={onRun}
            >
              <Play className="size-3 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('devPipelines.run')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function PipelineListRow({
  flow,
  selected,
  onSelect,
  onDelete,
}: {
  flow: DevPipelineFlowSummary
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'group flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-primary/15 font-medium text-primary' : 'hover:bg-muted/80'
      )}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate text-left text-sm leading-snug">
        {flow.name}
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={t('devPipelines.deletePipeline')}
            onClick={e => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('devPipelines.deletePipeline')}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export type DevPipelineSidebarProps = {
  tab: 'pipelines' | 'templates'
  onTabChange: (tab: 'pipelines' | 'templates') => void
  flows: DevPipelineFlowSummary[]
  loadingList: boolean
  selectedId: string | null
  search: string
  onSearchChange: (q: string) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  onClickTemplate: (id: string, kind: 'node' | 'snippet') => void
}

export function DevPipelineSidebar({
  tab,
  onTabChange,
  flows,
  loadingList,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  onDelete,
  onNew,
  onClickTemplate,
}: DevPipelineSidebarProps) {
  const { t } = useTranslation()

  const filteredFlows = flows.filter(f => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return f.name.toLowerCase().includes(q)
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/15">
      <Tabs value={tab} onValueChange={v => onTabChange(v as 'pipelines' | 'templates')} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-2 mt-2 h-7 shrink-0 bg-muted/40 p-1">
          <TabsTrigger value="pipelines" className="h-6 flex-1 px-2 text-xs">
            {t('devPipelines.tpl.tabPipelines')}
          </TabsTrigger>
          <TabsTrigger value="templates" className="h-6 flex-1 px-2 text-xs">
            {t('devPipelines.tpl.tabTemplates')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipelines" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <div className="flex shrink-0 items-center gap-1.5 p-2 pb-0">
            <Input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={t('devPipelines.searchPlaceholder')}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" aria-label={t('devPipelines.newPipeline')} onClick={onNew}>
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('devPipelines.newPipeline')}</TooltipContent>
            </Tooltip>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-0.5 p-2 pt-1">
              {loadingList ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredFlows.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t('devPipelines.noPipelines')}</p>
                  <p className="mt-1">{t('devPipelines.noPipelinesHint')}</p>
                </div>
              ) : (
                filteredFlows.map(f => (
                  <PipelineListRow
                    key={f.id}
                    flow={f}
                    selected={selectedId === f.id}
                    onSelect={() => onSelect(f.id)}
                    onDelete={() => onDelete(f.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="templates" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <PipelineTemplatePanel onClickTemplate={onClickTemplate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
