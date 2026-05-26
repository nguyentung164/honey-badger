'use client'

import { type NodeProps, NodeResizer, NodeToolbar, Position } from '@xyflow/react'
import { Play, Settings2, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { effectiveAccentColor, mergeNodeVisualStyle } from 'shared/flowDiagramStyle'
import type { DevPipelineGroupNodeData } from 'shared/devPipelines/types'
import { useFlowNodeActions } from '@/components/flow-inspector/FlowNodeActionsContext'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDevPipelineCanvas } from './devPipelineCanvasContext'

const NODE_TOOLBAR_HOVER_LEAVE_MS = 200

export const PipelineGroupNode = memo(function PipelineGroupNode({ id, data, selected }: NodeProps) {
  const d = data as DevPipelineGroupNodeData
  const canvas = useDevPipelineCanvas()
  const nodeInspector = useFlowNodeActions()
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
    [],
  )

  if (!canvas) return null
  const canvasLocked = canvas.canvasLocked

  return (
    <div className="relative h-full w-full" onPointerEnter={showToolbar} onPointerLeave={hideToolbarSoon}>
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={!canvasLocked && selected}
        lineClassName="!border-primary/35"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-border !bg-background"
        onResizeEnd={(_evt, p) => {
          canvas.persistGroupSize(id, { width: p.width, height: p.height })
        }}
      />
      <NodeToolbar nodeId={id} position={Position.Top} offset={10} align="center" isVisible={toolbarHover || selected} className="nodrag nopan">
        <div
          role="toolbar"
          aria-label={t('devPipelines.groupToolbarAria')}
          className="flex items-center gap-0.5 rounded-lg bg-popover px-1 py-0.5 text-popover-foreground shadow-lg backdrop-blur-md dark:shadow-black/50"
          onPointerEnter={showToolbar}
          onPointerLeave={hideToolbarSoon}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                disabled={canvas.runBusy}
                aria-label={t('devPipelines.runThisGroup')}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation()
                  canvas.runThisGroup(id)
                }}
              >
                <Play className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('devPipelines.runThisGroup')}</TooltipContent>
          </Tooltip>
          {nodeInspector ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('flowInspector.visualTitle')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    nodeInspector.openGroupInspector?.(id)
                  }}
                >
                  <Settings2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('flowInspector.visualTitle')}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="nodrag nopan size-7 text-destructive hover:bg-destructive/15 hover:text-destructive"
                aria-label={t('devPipelines.deleteGroup')}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation()
                  canvas.deleteGroup(id)
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('devPipelines.deleteGroup')}</TooltipContent>
          </Tooltip>
        </div>
      </NodeToolbar>
      <FlowNodeVisualShell
        diagramVisual={d.diagramVisual}
        selected={selected}
        showHandles={mergedVisual.showConnectionHandles}
        accentBackground={hasAccent}
        interiorBackground="group-card"
        className="h-full w-full"
        cardClassName="h-full w-full min-h-0 min-w-0 max-w-none rounded-lg bg-card/50 text-sm"
        innerClassName="flex h-full min-h-0 flex-col rounded-lg p-1.5"
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
        </div>
      </FlowNodeVisualShell>
    </div>
  )
})
