'use client'

import { type NodeProps, NodeResizer, NodeToolbar, Position, useReactFlow } from '@xyflow/react'
import { ArrowDownRight, Settings2, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  mergePageMapAnnotationStyle,
  PAGE_MAP_ANNOTATION_DEFAULT_H,
  PAGE_MAP_ANNOTATION_MIN_H,
  PAGE_MAP_ANNOTATION_MIN_W,
  pageMapAnnotationFontFamilyCss,
  pageMapAnnotationHasAccent,
  pageMapAnnotationStyleToDiagramVisual,
  resolvedPageMapAnnotationTextColor,
} from 'shared/pageMapAnnotationStyle'
import type { DevPipelineNoteNodeData } from 'shared/devPipelines/types'
import { useFlowNodeActions } from '@/components/flow-inspector/FlowNodeActionsContext'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import { BaseNode, BaseNodeContent } from '@/components/flow-inspector/BaseNode'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDevPipelineCanvas } from './devPipelineCanvasContext'

const NODE_TOOLBAR_HOVER_LEAVE_MS = 200

export const PipelineNoteNode = memo(function PipelineNoteNode({ id, data, selected }: NodeProps) {
  const d = data as DevPipelineNoteNodeData
  const canvas = useDevPipelineCanvas()
  const { setNodes } = useReactFlow()
  const nodeInspector = useFlowNodeActions()
  const { t } = useTranslation()
  const [draft, setDraft] = useState(d.content)
  const [toolbarHover, setToolbarHover] = useState(false)
  const toolbarHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const resizeStartRef = useRef({ width: 0, height: 0 })
  const resizeAxisRef = useRef<'x' | 'y' | 'both' | null>(null)
  const isResizingRef = useRef(false)
  const lastShellWidthRef = useRef(0)
  const mergedStyle = useMemo(() => mergePageMapAnnotationStyle(d.style), [d.style])
  const textColor = resolvedPageMapAnnotationTextColor(mergedStyle)
  const hasAccent = pageMapAnnotationHasAccent(mergedStyle)
  const diagramVisual = useMemo(() => pageMapAnnotationStyleToDiagramVisual(mergedStyle), [mergedStyle])
  const minHeightPx = d.minHeight ?? PAGE_MAP_ANNOTATION_DEFAULT_H
  const canvasLocked = canvas?.canvasLocked ?? false

  const toolbarBarVisible = selected || toolbarHover
  const showResizeChrome = !canvasLocked && toolbarBarVisible

  const syncTextareaOnly = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const syncNodeHeightToContent = useCallback(() => {
    if (isResizingRef.current) return
    const shell = shellRef.current
    if (!shell) return
    const measured = Math.max(shell.offsetHeight, minHeightPx)
    setNodes(nds =>
      nds.map(n => {
        if (n.id !== id || n.type !== 'pipelineNote') return n
        const curH = typeof n.style?.height === 'number' ? n.style.height : undefined
        if (curH != null && Math.abs(curH - measured) < 1) return n
        return { ...n, style: { ...n.style, height: measured } }
      }),
    )
  }, [id, minHeightPx, setNodes])

  const syncTextareaHeight = useCallback(() => {
    syncTextareaOnly()
    syncNodeHeightToContent()
  }, [syncNodeHeightToContent, syncTextareaOnly])

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

  useEffect(() => {
    setDraft(d.content)
  }, [d.content])

  useEffect(() => {
    syncTextareaHeight()
  }, [draft, mergedStyle.fontSize, minHeightPx, syncTextareaHeight])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    lastShellWidthRef.current = shell.clientWidth
    const ro = new ResizeObserver(entries => {
      if (isResizingRef.current) return
      const w = entries[0]?.contentRect.width ?? shell.clientWidth
      if (Math.abs(w - lastShellWidthRef.current) <= 1) return
      lastShellWidthRef.current = w
      syncTextareaHeight()
    })
    ro.observe(shell)
    return () => ro.disconnect()
  }, [syncTextareaHeight])

  useEffect(
    () => () => {
      if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current)
    },
    [],
  )

  const commit = useCallback(() => {
    const next = draft.trim()
    if (next && next !== d.content) canvas?.persistNoteContent(id, next)
    else if (!next) setDraft(d.content)
  }, [canvas, draft, d.content, id])

  const textStyle = {
    color: textColor,
    fontSize: mergedStyle.fontSize,
    fontFamily: pageMapAnnotationFontFamilyCss(mergedStyle.fontFamily ?? 'system'),
  }

  if (!canvas) return null

  return (
    <>
      <NodeResizer
        minWidth={PAGE_MAP_ANNOTATION_MIN_W}
        minHeight={PAGE_MAP_ANNOTATION_MIN_H}
        isVisible={showResizeChrome}
        lineClassName="!border-primary/35"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-border !bg-background"
        onResizeStart={(_evt, p) => {
          isResizingRef.current = true
          resizeAxisRef.current = null
          resizeStartRef.current = { width: p.width, height: p.height }
        }}
        onResize={(_evt, p) => {
          const start = resizeStartRef.current
          const dw = Math.abs(p.width - start.width)
          const dh = Math.abs(p.height - start.height)
          if (!resizeAxisRef.current && (dw > 2 || dh > 2)) {
            if (dw > dh) resizeAxisRef.current = 'x'
            else if (dh > dw) resizeAxisRef.current = 'y'
            else resizeAxisRef.current = 'both'
          }
          if (resizeAxisRef.current === 'x' || resizeAxisRef.current === 'both') {
            requestAnimationFrame(syncTextareaOnly)
          }
        }}
        onResizeEnd={(_evt, p) => {
          const start = resizeStartRef.current
          const heightChanged = Math.abs(p.height - start.height) > 2
          const nextMinHeight = heightChanged
            ? Math.max(PAGE_MAP_ANNOTATION_MIN_H, p.height)
            : (d.minHeight ?? PAGE_MAP_ANNOTATION_MIN_H)

          isResizingRef.current = false
          resizeAxisRef.current = null

          canvas.persistNoteSize(id, {
            width: p.width,
            minHeight: nextMinHeight,
            nodeHeight: heightChanged ? p.height : undefined,
          })

          requestAnimationFrame(() => {
            if (heightChanged) syncTextareaOnly()
            else syncTextareaHeight()
          })
        }}
      />
      <NodeToolbar nodeId={id} position={Position.Top} offset={10} align="center" isVisible={toolbarHover} className="nodrag nopan">
        <div
          role="toolbar"
          aria-label={t('devPipelines.noteToolbarAria')}
          className="flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-0.5 text-popover-foreground shadow-lg ring-1 ring-border/50 backdrop-blur-md dark:shadow-black/50"
          onPointerEnter={showToolbar}
          onPointerLeave={hideToolbarSoon}
        >
          {nodeInspector ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('devPipelines.noteInspectorTitle')}
              aria-label={t('devPipelines.noteInspectorTitle')}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                nodeInspector.openAnnotationInspector?.(id)
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
            title={t('devPipelines.deleteNote')}
            aria-label={t('devPipelines.deleteNote')}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              canvas.deleteNote(id)
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </NodeToolbar>
      <div ref={shellRef} className="h-full w-full" style={{ minHeight: minHeightPx }}>
        <FlowNodeVisualShell
          diagramVisual={diagramVisual}
          showHandles={false}
          accentBackground={hasAccent}
          interiorBackground="transparent"
          className={cn('h-full w-full', hasAccent && 'rounded-lg')}
          cardClassName="h-full border-none bg-transparent shadow-none"
          innerClassName="h-full overflow-visible"
        >
          <BaseNode
            className={cn('h-full w-full border-none bg-transparent text-sm text-secondary-foreground shadow-none hover:ring-0', selected && 'ring-0')}
          >
            <BaseNodeContent className="flex h-full min-h-0 flex-col gap-0 pb-0 pr-1 pt-1 leading-snug">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col" onPointerEnter={showToolbar} onPointerLeave={hideToolbarSoon}>
                <textarea
                  ref={textareaRef}
                  id={`pipeline-note-${id}`}
                  className="block w-full shrink-0 resize-none overflow-hidden border-0 bg-transparent p-0 leading-snug outline-none placeholder:text-muted-foreground/70"
                  style={textStyle}
                  value={draft}
                  rows={1}
                  spellCheck
                  readOnly={canvasLocked}
                  placeholder={t('devPipelines.notePlaceholder')}
                  onChange={e => {
                    setDraft(e.target.value)
                    requestAnimationFrame(syncTextareaHeight)
                  }}
                  onBlur={commit}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      ;(e.target as HTMLTextAreaElement).blur()
                    }
                  }}
                />
              </div>
              {nodeInspector ? (
                <button
                  type="button"
                  className="nodrag nopan mt-auto inline-flex shrink-0 self-end p-0 text-muted-foreground transition-colors hover:text-foreground"
                  title={t('devPipelines.noteInspectorTitle')}
                  aria-label={t('devPipelines.noteInspectorTitle')}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    nodeInspector.openAnnotationInspector?.(id)
                  }}
                >
                  <ArrowDownRight size={12} aria-hidden />
                </button>
              ) : (
                <div className="pointer-events-none mt-auto inline-flex shrink-0 self-end text-muted-foreground">
                  <ArrowDownRight size={12} aria-hidden />
                </div>
              )}
            </BaseNodeContent>
          </BaseNode>
        </FlowNodeVisualShell>
      </div>
    </>
  )
})
