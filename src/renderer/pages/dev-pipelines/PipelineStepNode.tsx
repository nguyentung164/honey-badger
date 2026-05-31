import { type NodeProps, NodeToolbar, Position } from '@xyflow/react'
import { CheckCircle2, Circle, FileText, Files, HandMetal, Loader2, Play, Ban, Route, Settings2, SkipForward, Terminal, Trash2, XCircle } from 'lucide-react'
import type { CSSProperties } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DevPipelineNodeData } from 'shared/devPipelines/types'
import { resolveFlowNodeContentLayout } from 'shared/flowNodeContentLayout'
import { useFlowNodeActions } from '@/components/flow-inspector/FlowNodeActionsContext'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import { FlowNodeContentLayout } from '@/components/flow-inspector/FlowNodeContentLayout'
import { FlowNodeMetadataRows } from '@/components/flow-inspector/FlowNodeMetadataRows'
import { flowNodeContentLayoutShellClasses, shouldShowInlineBadge } from '@/components/flow-inspector/flowNodeContentLayoutUi'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import { NodeStatusIndicator, type NodeStatusIndicatorStatus } from '@/components/flow-inspector/NodeStatusIndicator'
import { ensureNodeAnimStyles } from '@/components/flow-inspector/nodeAnimStyles'
import { FlowNodeDiagramIcon } from '@/components/flow-inspector/nodeIconUtils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useDevPipelineNodeToolbar } from './devPipelineNodeToolbarContext'

ensureNodeAnimStyles()

const NODE_TOOLBAR_HOVER_LEAVE_MS = 200

export type PipelineStepRunVisual = 'idle' | 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'awaiting-approval'

export type PipelineStepNodeData = DevPipelineNodeData & {
  runVisual?: PipelineStepRunVisual
}

function statusIcon(visual: PipelineStepRunVisual | undefined) {
  const v = visual ?? 'idle'
  if (v === 'running') return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
  if (v === 'awaiting-approval') return <HandMetal className="size-4 shrink-0 text-amber-500" aria-hidden />
  if (v === 'success') return <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
  if (v === 'error') return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
  if (v === 'skipped') return <SkipForward className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  return <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
}

function runVisualToIndicator(visual: PipelineStepRunVisual | undefined): NodeStatusIndicatorStatus {
  if (visual === 'running' || visual === 'awaiting-approval') return 'loading'
  if (visual === 'success') return 'success'
  if (visual === 'error') return 'error'
  if (visual === 'pending') return 'loading'
  return 'initial'
}

function kindSubtitle(d: PipelineStepNodeData): string {
  if (d.stepKind === 'delay') return `delay ${d.params?.ms ?? 600}ms`
  if (d.stepKind === 'noop') return 'noop'
  if (d.stepKind === 'approval') return d.approvalMessage?.trim() || 'approval'
  if (d.stepKind === 'http-check') {
    const url = d.params?.url?.trim()
    if (url) return url.length > 40 ? `${url.slice(0, 40)}…` : url
    return 'http-check'
  }
  const script = d.scriptPath?.trim()
  if (script) {
    const s = script.replace(/\\/g, '/')
    return s.length > 36 ? `${s.slice(0, 36)}…` : s
  }
  const cmd = d.command?.trim()
  if (cmd) {
    const one = cmd.replace(/\s+/g, ' ')
    return one.length > 40 ? `${one.slice(0, 40)}…` : one
  }
  return d.stepKind === 'shell' ? '—' : ''
}

function pipelineStepMetadataRows(d: PipelineStepNodeData, t: (key: string) => string) {
  const subtitle = kindSubtitle(d)
  const rows = [
    { label: t('flowInspector.pipelineMetaKind'), value: d.stepKind },
    ...(d.scriptPath ? [{ label: t('flowInspector.pipelineMetaScript'), value: d.scriptPath.replace(/\\/g, '/'), title: d.scriptPath }] : []),
    ...(d.command ? [{ label: t('flowInspector.pipelineMetaCommand'), value: d.command.replace(/\s+/g, ' '), title: d.command }] : []),
    ...(d.cwd ? [{ label: t('flowInspector.pipelineMetaCwd'), value: d.cwd, title: d.cwd }] : []),
  ]
  const empty = !subtitle && rows.length <= 1
  return { rows, empty }
}

function PipelineStepNodeInner({ id, data, selected }: NodeProps) {
  const { t } = useTranslation()
  const nodeInspector = useFlowNodeActions()
  const toolbar = useDevPipelineNodeToolbar()
  const d = data as PipelineStepNodeData
  const visual = d.runVisual ?? 'idle'
  const [toolbarHover, setToolbarHover] = useState(false)
  const toolbarHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToolbar = useCallback(() => {
    if (toolbarHideTimer.current) {
      clearTimeout(toolbarHideTimer.current)
      toolbarHideTimer.current = null
    }
    setToolbarHover(true)
  }, [])

  const hideToolbarSoon = useCallback(() => {
    if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current)
    toolbarHideTimer.current = setTimeout(() => {
      toolbarHideTimer.current = null
      setToolbarHover(false)
    }, NODE_TOOLBAR_HOVER_LEAVE_MS)
  }, [])

  useEffect(
    () => () => {
      if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current)
    },
    []
  )

  const shellVisual = resolveFlowNodeShellVisual(d.diagramVisual, { selected })
  const iconStyle = { color: shellVisual.iconColor } satisfies CSSProperties
  const skippedDash = visual === 'skipped' && !selected
  const awaitingRing = visual === 'awaiting-approval' && !selected
  const contentLayout = resolveFlowNodeContentLayout(d.diagramVisual, 'pipelineStep')
  const shellClasses = flowNodeContentLayoutShellClasses(contentLayout.contentLayout, contentLayout.contentDensity)
  const showBadge = shouldShowInlineBadge(contentLayout.contentLayout)
  const meta = pipelineStepMetadataRows(d, t)

  const subtitleNode = (
    <>
      {d.stepKind === 'shell' ? <Terminal className="size-2.5 shrink-0 opacity-70" aria-hidden /> : null}
      <span className="min-w-0 truncate">{kindSubtitle(d)}</span>
    </>
  )

  return (
    <>
      {toolbar ? (
        <NodeToolbar nodeId={id} position={Position.Top} align="center" offset={10} isVisible={toolbarHover || selected} className="nodrag nopan">
          <div
            role="toolbar"
            aria-label={t('devPipelines.stepToolbar')}
            className="flex items-center gap-0.5 rounded-lg bg-popover px-1 py-0.5 text-popover-foreground shadow-lg backdrop-blur-md dark:shadow-black/50"
            onPointerEnter={showToolbar}
            onPointerLeave={hideToolbarSoon}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                  disabled={!toolbar.canRunStep}
                  aria-label={t('devPipelines.runThisStep')}
                  title={t('devPipelines.runThisStep')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    toolbar.runThisStep(id)
                  }}
                >
                  <Play className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('devPipelines.runThisStep')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                  disabled={!toolbar.canRunStep}
                  aria-label={t('devPipelines.runFlow')}
                  title={t('devPipelines.runFlow')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    toolbar.runFlowFromStep(id)
                  }}
                >
                  <Route className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('devPipelines.runFlow')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'nodrag nopan size-7',
                    d.executionDisabled
                      ? 'text-amber-600 hover:bg-amber-500/15 dark:text-amber-400'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-label={t('flowInspector.executionDisabled')}
                  title={t('flowInspector.executionDisabled')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    toolbar.toggleExecutionDisabled(id)
                  }}
                >
                  <Ban className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('flowInspector.executionDisabled')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('devPipelines.toolbarDetails')}
                  title={t('devPipelines.toolbarDetails')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    toolbar.openStepDetails(id)
                  }}
                >
                  <FileText className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('devPipelines.toolbarDetails')}</TooltipContent>
            </Tooltip>
            {nodeInspector ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('flowInspector.visualTitle')}
                    title={t('flowInspector.visualTitle')}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      nodeInspector.openInspector(id)
                    }}
                  >
                    <Settings2 className="size-3.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('flowInspector.visualTitle')}</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('devPipelines.toolbarDuplicate')}
                  title={t('devPipelines.toolbarDuplicate')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    toolbar.duplicateStep(id)
                  }}
                >
                  <Files className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('devPipelines.toolbarDuplicate')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="nodrag nopan size-7 text-destructive hover:bg-destructive/15 hover:text-destructive"
                  disabled={!toolbar.canDeleteStep}
                  aria-label={t('devPipelines.toolbarDelete')}
                  title={t('devPipelines.toolbarDelete')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    toolbar.deleteStep(id)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('devPipelines.toolbarDelete')}</TooltipContent>
            </Tooltip>
          </div>
        </NodeToolbar>
      ) : null}
      <div
        className="w-fit max-w-full"
        onPointerEnter={toolbar ? showToolbar : undefined}
        onPointerLeave={toolbar ? hideToolbarSoon : undefined}
      >
      <NodeStatusIndicator status={runVisualToIndicator(visual)} variant={visual === 'pending' ? 'overlay' : 'border'} className="w-fit max-w-full">
        <FlowNodeVisualShell
          diagramVisual={d.diagramVisual}
          selected={selected}
          executionDisabled={d.executionDisabled}
          cardClassName={cn(
            shellClasses.cardClassName,
            'bg-card',
            skippedDash && 'opacity-80 ring-1 ring-dashed ring-amber-500/45 ring-offset-0',
            awaitingRing && 'ring-1 ring-amber-500/60 ring-offset-0',
          )}
          innerClassName={shellClasses.innerClassName}
        >
          <FlowNodeContentLayout
            layout={contentLayout.contentLayout}
            density={contentLayout.contentDensity}
            metadataMode={contentLayout.metadataMode}
            context="pipelineStep"
            slots={{
              icon: d.diagramVisual?.iconKey ? (
                <FlowNodeDiagramIcon iconKey={d.diagramVisual.iconKey} className="size-3" style={iconStyle} />
              ) : undefined,
              title: d.label,
              subtitle: subtitleNode,
              statusIcon: statusIcon(visual),
              statusBadge: showBadge ? statusIcon(visual) : undefined,
              metadata: (
                <FlowNodeMetadataRows
                  rows={meta.rows}
                  emptyMessage={meta.empty ? t('flowInspector.pipelineMetaEmpty') : undefined}
                />
              ),
            }}
          />
          <span className="sr-only" role="status">
            {d.label}: {visual}
          </span>
        </FlowNodeVisualShell>
      </NodeStatusIndicator>
      </div>
    </>
  )
}

export const PipelineStepNode = memo(PipelineStepNodeInner)
