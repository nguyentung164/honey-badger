'use client'

import { type NodeProps, NodeResizer, NodeToolbar, Position } from '@xyflow/react'
import { Group, Loader2, Play, Settings2, Trash2 } from 'lucide-react'
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { effectiveAccentColor, mergeNodeVisualStyle } from 'shared/flowDiagramStyle'
import { useFlowNodeActions } from '@/components/flow-inspector/FlowNodeActionsContext'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import { NodeStatusIndicator, type NodeStatusIndicatorStatus } from '@/components/flow-inspector/NodeStatusIndicator'
import { Button } from '@/components/ui/button'
import { PageMapActionsContext } from '@/pages/automation/map/pageMapActionsContext'
import type { CatalogGroupNodeData, PageMapActionsValue, PageMapNodeStatus } from '@/pages/automation/map/pageMapGraph'

function groupStatusToIndicator(status: PageMapNodeStatus): NodeStatusIndicatorStatus {
  if (status === 'running' || status === 'queued') return 'loading'
  if (status === 'done') return 'success'
  if (status === 'error') return 'error'
  return 'initial'
}

const NODE_TOOLBAR_HOVER_LEAVE_MS = 200

const CatalogGroupNodeToolbar = memo(function CatalogGroupNodeToolbar({
  groupId,
  isVisible,
  onToolbarPointerEnter,
  onToolbarPointerLeave,
  ctx,
}: {
  groupId: string
  isVisible: boolean
  onToolbarPointerEnter: () => void
  onToolbarPointerLeave: () => void
  ctx: PageMapActionsValue
}) {
  const nodeInspector = useFlowNodeActions()
  const { t } = useTranslation()
  return (
    <NodeToolbar nodeId={groupId} position={Position.Top} offset={10} align="center" isVisible={isVisible} className="nodrag nopan">
      <div
        role="toolbar"
        aria-label={t('automation.pageMap.groupToolbarAria')}
        className="flex items-center gap-0.5 rounded-lg bg-popover px-1 py-0.5 text-popover-foreground shadow-lg backdrop-blur-md dark:shadow-black/50"
        onPointerEnter={onToolbarPointerEnter}
        onPointerLeave={onToolbarPointerLeave}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={ctx.runBusy}
          title={t('automation.pageMap.runThisGroup')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.runThisGroup?.(groupId)
          }}
        >
          <Play className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t('automation.pageMap.openCasesInGroup')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.openCasesForGroup?.(groupId)
          }}
        >
          <Group className="size-3.5" />
        </Button>
        {nodeInspector ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('flowInspector.visualTitle')}
            aria-label={t('flowInspector.visualTitle')}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              nodeInspector.openGroupInspector?.(groupId)
            }}
          >
            <Settings2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="nodrag nopan size-7 text-destructive hover:bg-destructive/15 hover:text-destructive"
          disabled={ctx.groupActionBusy}
          title={t('automation.pageMap.deleteGroup')}
          aria-label={t('automation.pageMap.deleteGroup')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.requestDeleteGroup?.(groupId)
          }}
        >
          {ctx.groupActionBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
        </Button>
      </div>
    </NodeToolbar>
  )
})

export const CatalogGroupNode = memo(function CatalogGroupNode({ id, data, selected }: NodeProps) {
  const d = data as CatalogGroupNodeData
  const ctx = useContext(PageMapActionsContext)
  const { t } = useTranslation()
  const mergedVisual = useMemo(() => mergeNodeVisualStyle(d.diagramVisual), [d.diagramVisual])
  const hasAccent = Boolean(mergedVisual.accentColor || mergedVisual.accentGradient)
  const groupTitleChipStyle = useMemo(() => {
    const accent = effectiveAccentColor(mergedVisual)
    return {
      backgroundColor: `color-mix(in oklab, ${accent} 52%, var(--card))`,
      color: 'var(--foreground)',
    } as const
  }, [mergedVisual])
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

  if (!ctx) return null
  const canvasLocked = ctx.canvasLocked

  return (
    <div className="relative h-full w-full">
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={!canvasLocked && selected}
        lineClassName="!border-primary/35"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-border !bg-background"
        onResizeEnd={(_evt, p) => {
          ctx.persistGroupSize?.(id, { width: p.width, height: p.height })
        }}
      />
      <CatalogGroupNodeToolbar groupId={id} isVisible={toolbarHover} onToolbarPointerEnter={showToolbar} onToolbarPointerLeave={hideToolbarSoon} ctx={ctx} />
      <NodeStatusIndicator status={groupStatusToIndicator(d.status)} className="h-full w-full min-h-0">
        <FlowNodeVisualShell
          diagramVisual={d.diagramVisual}
          selected={selected}
          showHandles={mergedVisual.showConnectionHandles}
          accentBackground={hasAccent}
          interiorBackground="group-card"
          className="h-full w-full"
          cardClassName="h-full w-full min-h-0 min-w-0 max-w-none rounded-lg bg-card/50 text-sm"
          innerClassName="flex h-full min-h-0 flex-col rounded-lg p-1.5"
          onPointerEnter={showToolbar}
          onPointerLeave={hideToolbarSoon}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            <div className="flex shrink-0 items-start">
              <span
                className="inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[11px] font-semibold leading-snug tracking-tight"
                style={groupTitleChipStyle}
                title={d.label}
              >
                {d.label}
              </span>
            </div>
            {d.hint ? <div className="line-clamp-2 px-0.5 text-[10px] text-muted-foreground">{d.hint}</div> : null}
            <div className="mt-auto flex flex-wrap gap-1 px-0.5 text-[10px] text-muted-foreground">
              <span>{t('automation.pageMap.groupBadgePages', { count: d.pageCount })}</span>
              <span>·</span>
              <span>{t('automation.pageMap.groupBadgeCases', { count: d.caseCount })}</span>
            </div>
          </div>
        </FlowNodeVisualShell>
      </NodeStatusIndicator>
    </div>
  )
})
