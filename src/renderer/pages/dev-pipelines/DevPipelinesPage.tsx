'use client'

import type { MouseEvent } from 'react'
import type { Edge, EdgeChange, Node, NodeChange, OnConnect } from '@xyflow/react'
import { addEdge, getNodesBounds, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import { FlowCanvasBackground } from '@/components/flow-inspector/FlowCanvasBackground'
import { FlowCanvasNodeSelectionProvider } from '@/components/flow-inspector/FlowCanvasNodeSelectionContext'
import { FlowConnectionPropertiesPanel } from '@/components/flow-inspector/FlowConnectionPropertiesPanel'
import { FlowEdgeActionsContext } from '@/components/flow-inspector/FlowEdgeActionsContext'
import { FlowNodeActionsContext } from '@/components/flow-inspector/FlowNodeActionsContext'
import { FlowNodeVisualConfigPanel } from '@/components/flow-inspector/FlowNodeVisualConfigPanel'
import { StyledFlowEdge } from '@/components/flow-inspector/StyledFlowEdge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { PageMapAnnotationConfigPanel, type PageMapAnnotationDraft } from '@/pages/automation/map/PageMapAnnotationConfigPanel'
import {
  layoutCatalogHorizontal,
  layoutCatalogRadial,
  layoutCatalogWithDagre,
  unionShortestPathEdgesUndirected,
} from '@/pages/automation/map/pageMapLayout'
import { devPipelineMiniMapNodeColor, devPipelineMiniMapNodeStrokeColor } from '@/pages/dev-pipelines/devPipelineMinimap'
import { applyPipelineEdgePresentation, patchPipelineNodesRunVisual } from '@/pages/dev-pipelines/devPipelineRunVisualPatch'
import { pipelineGroupOptionLabel, stepsNeedingGroupAssignment } from '@/pages/dev-pipelines/pipelineGroupAssign'
import '@xyflow/react/dist/style.css'
import { Loader2, Minus, PanelLeft, PanelLeftClose, Rocket, Square, SquareArrowOutDownLeft, Workflow, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import {
  assignRunOrderForNewEdge,
  normalizeAllRunOrders,
  normalizeRunOrdersForSource,
  resolvedRunOrderByEdgeId,
  swapRunOrderForEdge,
  type FlowExecEdge,
} from 'shared/flowExecution'
import { runOrderFanPlacementForEdge } from 'shared/flowEdgeRunOrderLayout'
import { buildNodeDataFromSnippetNode, buildNodeDataFromTemplate } from 'shared/devPipelines/applyNodeTemplate'
import {
  PIPELINE_GROUP_DEFAULT_H,
  PIPELINE_GROUP_DEFAULT_W,
  PIPELINE_NOTE_DEFAULT_H,
  PIPELINE_NOTE_DEFAULT_W,
  resolveSmallestIntersectingPipelineGroupId,
  sortNodesParentBeforeChildren,
} from 'shared/devPipelines/graphLayout'
import { findNodeTemplate, findSnippetTemplate, type PipelineNodeTemplate, type PipelineSnippetTemplate } from 'shared/devPipelines/templateCatalog'
import type {
  DevPipelineEdgeCondition,
  DevPipelineFlow,
  DevPipelineFlowSummary,
  DevPipelineGraphJson,
  DevPipelineGroupNodeData,
  DevPipelineLogStreamPayload,
  DevPipelineNodeData,
  DevPipelineNoteNodeData,
  DevPipelinePersistedEdge,
  DevPipelineRunScope,
  DevPipelineRunStatus,
  DevPipelineRunStreamPayload,
} from 'shared/devPipelines/types'
import { FLOW_DEFAULT_EDGE_OPTIONS, FLOW_DELETE_KEY_CODE, FLOW_PAN_ON_DRAG, FLOW_PRO_OPTIONS } from 'shared/flowCanvasDefaults'
import { FLOW_CANVAS_MAX_ZOOM, FLOW_CANVAS_MIN_ZOOM, flowCanvasColorMode } from 'shared/flowCanvasZoom'
import type { FlowConnectionStyle, FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { edgeHandleIds, mergeConnectionStyle, mergeNodeVisualStyle } from 'shared/flowDiagramStyle'
import { getNodesSizedForAutoLayout } from 'shared/flowCanvasAutoLayout'
import { createDebouncedPersist } from 'shared/debouncedPersist'
import {
  clearBoardContentDefaults,
  pickContentDefaultsFromVisual,
  readBoardContentDefaults,
  writeBoardContentDefaults,
} from 'shared/flowNodeBoardDefaults'
import { flowDiagramArrowMarkerEnd, flowDiagramArrowMarkerStart } from 'shared/flowEdgeMarkers'
import { mergePageMapAnnotationStyle, PAGE_MAP_ANNOTATION_DEFAULT_H } from 'shared/pageMapAnnotationStyle'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { DevPipelineActiveBar, type DevPipelineSaveState, DevPipelineSidebar } from './DevPipelineSidebar'
import { type DevPipelineCanvasActions, DevPipelineCanvasContext } from './devPipelineCanvasContext'
import { type DevPipelineNodeToolbarActions, DevPipelineNodeToolbarContext } from './devPipelineNodeToolbarContext'
import { PipelineBottomBar } from './PipelineBottomBar'
import { planPipelineGroupChildLayout } from './pipelineGroupLayout'
import { PipelineGroupNode } from './PipelineGroupNode'
import { PipelineNoteNode } from './PipelineNoteNode'
import { PipelineStepNode, type PipelineStepRunVisual } from './PipelineStepNode'
import { cn } from '@/lib/utils'
import { canOpenDevPipelinesEmbedded } from '@/lib/mainShellTabAccess'
import { useDevPipelinesToolbarPortalTarget } from '@/pages/main/DevPipelinesToolbarPortalContext'

export type DevPipelinesPageProps = {
  mode?: 'embedded' | 'standalone'
}

const SIDEBAR_SIZE_KEY = 'dev-pipelines-sidebar-size'
const PIPELINE_MINIMAP_LS = 'dev-pipelines-miniMapVisible'
const SIDEBAR_MIN_PERCENT = 14
const SIDEBAR_MAX_PERCENT = 50

function readSidebarDefaultSize(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_SIZE_KEY)
    const n = raw ? Number(raw) : Number.NaN
    return Number.isFinite(n) && n >= SIDEBAR_MIN_PERCENT && n <= SIDEBAR_MAX_PERCENT ? n : 22
  } catch {
    return 22
  }
}

const nodeTypes = { pipelineStep: PipelineStepNode, pipelineGroup: PipelineGroupNode, pipelineNote: PipelineNoteNode }
const edgeTypes = { labeled: StyledFlowEdge }

/** UUID v7 shares an 8-char prefix within the same ms — use full id to avoid collisions. */
function newPipelineStepId(): string {
  return `step_${randomUuidV7()}`
}

function newPipelineEdgeId(): string {
  return `e_${randomUuidV7()}`
}

function newPipelineGroupId(): string {
  return `group_${randomUuidV7()}`
}

function newPipelineNoteId(): string {
  return `note_${randomUuidV7()}`
}

function rfNodeSize(n: { width?: number; height?: number; style?: { width?: number | string; height?: number | string } }): {
  width?: number
  height?: number
} {
  const readNum = (v: number | string | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const width = readNum(n.width) ?? readNum(n.style?.width)
  const height = readNum(n.height) ?? readNum(n.style?.height)
  return { width, height }
}

function graphToRf(graph: DevPipelineGraphJson): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map(n => {
    const base = {
      id: n.id,
      type: n.type || 'pipelineStep',
      position: n.position,
      ...(n.parentId ? { parentId: n.parentId, extent: 'parent' as const } : {}),
      ...(n.width || n.height ? { style: { width: n.width, height: n.height } } : {}),
      ...(n.type === 'pipelineGroup' ? { zIndex: 0 } : n.type === 'pipelineNote' ? { zIndex: -1, connectable: false } : { zIndex: 1 }),
    }
    if (n.type === 'pipelineGroup') {
      return {
        ...base,
        data: { ...(n.data as DevPipelineGroupNodeData) },
      }
    }
    if (n.type === 'pipelineNote') {
      const noteData = n.data as DevPipelineNoteNodeData
      const noteHeight = n.height ?? PAGE_MAP_ANNOTATION_DEFAULT_H
      return {
        ...base,
        data: {
          ...noteData,
          minHeight: noteData.minHeight ?? noteHeight,
        },
      }
    }
    return {
      ...base,
      data: { ...(n.data as DevPipelineNodeData), runVisual: 'idle' as PipelineStepRunVisual },
    }
  })
  const edges: Edge[] = graph.edges.map(e => {
    const cs = mergeConnectionStyle(e.data?.connectionStyle)
    const hid = edgeHandleIds(cs)
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'labeled',
      sourceHandle: e.sourceHandle ?? hid.sourceHandle,
      targetHandle: e.targetHandle ?? hid.targetHandle,
      animated: false,
      markerEnd: flowDiagramArrowMarkerEnd(cs.color),
      markerStart: cs.bidirectional ? flowDiagramArrowMarkerStart(cs.color) : undefined,
      data: {
        label: e.data?.label ?? '',
        connectionStyle: e.data?.connectionStyle,
        condition: e.data?.condition,
        runOrder: e.data?.runOrder,
      },
    }
  })
  return { nodes: sortNodesParentBeforeChildren(nodes), edges }
}

function rfToGraph(nodes: Node[], edges: Edge[], viewport?: { x: number; y: number; zoom: number }): DevPipelineGraphJson {
  const outNodes = nodes.map(n => {
    const d = n.data as Record<string, unknown>
    const { runVisual: _rv, ...rest } = d
    const { width, height } = rfNodeSize(n)
    return {
      id: n.id,
      type: typeof n.type === 'string' ? n.type : 'pipelineStep',
      position: { x: n.position.x, y: n.position.y },
      ...(n.parentId ? { parentId: String(n.parentId) } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      data: rest,
    }
  })
  const outEdges: DevPipelinePersistedEdge[] = edges.map(e => {
    const d = (e.data ?? {}) as {
      connectionStyle?: Partial<FlowConnectionStyle>
      label?: string
      condition?: DevPipelineEdgeCondition
      runOrder?: number
    }
    const row: DevPipelinePersistedEdge = {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'labeled',
    }
    if (e.sourceHandle) row.sourceHandle = e.sourceHandle
    if (e.targetHandle) row.targetHandle = e.targetHandle
    if (d.connectionStyle || d.label || d.condition || d.runOrder != null) {
      row.data = { connectionStyle: d.connectionStyle, label: d.label, condition: d.condition, runOrder: d.runOrder }
    }
    return row
  })
  return {
    version: 1,
    nodes: outNodes as DevPipelineGraphJson['nodes'],
    edges: outEdges,
    viewport,
  }
}

function FlowInitialViewport({ flowId, viewport }: { flowId: string; viewport?: { x: number; y: number; zoom: number } }) {
  const rf = useReactFlow()
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (viewport && Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.zoom)) {
        rf.setViewport(viewport, { duration: 0 })
        return
      }
      if (rf.getNodes().length > 0) {
        rf.fitView({ padding: 0.15, duration: 220 })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [flowId, rf, viewport])
  return null
}

function DevPipelinesEditorInner({
  flow,
  flowName,
  loading,
  onDirty,
  onRegisterSave,
  onRegisterAddFromTemplate,
  activeRunId,
  running,
  onStartRun,
}: {
  flow: DevPipelineFlow | null
  flowName: string
  loading?: boolean
  onDirty: () => void
  onRegisterSave: (fn: () => Promise<boolean>) => void
  onRegisterAddFromTemplate: (fn: (id: string, kind: 'node' | 'snippet') => void) => void
  activeRunId: string | null
  running: boolean
  onStartRun: (scope?: DevPipelineRunScope) => Promise<void>
}) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const flowColorMode = flowCanvasColorMode(resolvedTheme)
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const rf = useReactFlow()
  const [anyNodeSelected, setAnyNodeSelected] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pathEdgeIds, setPathEdgeIds] = useState<Set<string>>(() => new Set())
  const [activeRunEdgeId, setActiveRunEdgeId] = useState<string | null>(null)
  const [miniMapVisible, setMiniMapVisible] = useState(() => {
    try {
      return localStorage.getItem(PIPELINE_MINIMAP_LS) !== 'false'
    } catch {
      return true
    }
  })
  const [canvasLocked, setCanvasLocked] = useState(false)
  const [floatMenu, setFloatMenu] = useState<{ kind: 'pane'; clientX: number; clientY: number } | null>(null)
  // Suppresses dirty-marking during programmatic node/edge resets (load, switch pipeline)
  const suppressDirtyUntilRef = useRef(0)
  const [stepDialogOpen, setStepDialogOpen] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [stepLogs, setStepLogs] = useState<Record<string, string[]>>({})
  type FlowInspectorState = null | { kind: 'edge'; id: string } | { kind: 'node'; ids: string[] } | { kind: 'group'; id: string } | { kind: 'note'; id: string }
  const [flowInspector, setFlowInspector] = useState<FlowInspectorState>(null)
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [addGroupName, setAddGroupName] = useState('')
  const [noteDraft, setNoteDraft] = useState<PageMapAnnotationDraft | null>(null)
  const [edgeDraft, setEdgeDraft] = useState<FlowConnectionStyle>(() => mergeConnectionStyle())
  const [edgeConditionDraft, setEdgeConditionDraft] = useState<DevPipelineEdgeCondition>('always')
  const [edgeRunOrderDraft, setEdgeRunOrderDraft] = useState(1)
  const [executionDisabledDraft, setExecutionDisabledDraft] = useState(false)
  const [nodeVisualDraft, setNodeVisualDraft] = useState<FlowNodeVisualStyle>(() => mergeNodeVisualStyle())
  const [nodeNameDraft, setNodeNameDraft] = useState('')
  const [boardLayoutDefaultChecked, setBoardLayoutDefaultChecked] = useState(false)
  const [hasBoardLayoutDefault, setHasBoardLayoutDefault] = useState(() => Boolean(readBoardContentDefaults('devPipelines')))
  const [pendingApproval, setPendingApproval] = useState<{ nodeId: string; label: string; message?: string } | null>(null)

  const editLocked = canvasLocked || running

  const flowEdgeInspectorActions = useMemo(
    () => ({
      openInspector: (id: string) => setFlowInspector({ kind: 'edge', id }),
    }),
    []
  )

  const flowNodeInspectorActions = useMemo(
    () => ({
      openInspector: (id: string) => {
        const sel = rf
          .getNodes()
          .filter(n => n.selected)
          .map(n => n.id)
        const stepIds = sel.length ? sel : [id]
        if (stepIds.length > 1 && stepIds.includes(id)) {
          setFlowInspector({ kind: 'node', ids: stepIds })
        } else {
          setFlowInspector({ kind: 'node', ids: [id] })
        }
      },
      openGroupInspector: (groupId: string) => setFlowInspector({ kind: 'group', id: groupId }),
      openAnnotationInspector: (noteId: string) => setFlowInspector({ kind: 'note', id: noteId }),
    }),
    [rf]
  )

  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[] }) => {
    const ids = sel.map(n => n.id)
    setSelectedIds(ids)
    setAnyNodeSelected(prev => {
      const next = ids.length > 0
      return prev === next ? prev : next
    })
  }, [])

  const selectedStepIds = useMemo(
    () => selectedIds.filter(id => nodes.some(n => n.id === id && n.type === 'pipelineStep')),
    [nodes, selectedIds],
  )

  const pipelineGroups = useMemo(() => nodes.filter(n => n.type === 'pipelineGroup'), [nodes])

  const assignGroupOptions = useMemo(
    () =>
      [...pipelineGroups]
        .sort((a, b) => pipelineGroupOptionLabel(a).localeCompare(pipelineGroupOptionLabel(b)))
        .map(g => ({
          id: g.id,
          name: pipelineGroupOptionLabel(g),
          movableCount: stepsNeedingGroupAssignment(selectedStepIds, nodes, g.id).length,
        })),
    [nodes, pipelineGroups, selectedStepIds],
  )

  const removeFromGroupSelectionCount = useMemo(() => {
    const sel = new Set(selectedIds)
    return nodes.filter(n => n.type === 'pipelineStep' && sel.has(n.id) && n.parentId).length
  }, [nodes, selectedIds])

  const handleEdgeRunOrderChange = useCallback(
    (edgeId: string, next: number) => {
      onDirty()
      setEdges(eds => {
        const edge = eds.find(e => e.id === edgeId)
        if (!edge) return eds
        const flowExec = normalizeAllRunOrders(
          eds.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            runOrder: (e.data as { runOrder?: number } | undefined)?.runOrder,
          })),
        )
        const swapped = swapRunOrderForEdge(edgeId, next, flowExec)
        const orderById = new Map(swapped.map(x => [x.id, x.runOrder]))
        return eds.map(e => {
          const ro = orderById.get(e.id)
          if (ro == null) return e
          const prevData = (e.data ?? {}) as Record<string, unknown>
          if (prevData.runOrder === ro) return e
          return { ...e, data: { ...prevData, runOrder: ro } }
        })
      })
    },
    [onDirty, setEdges],
  )

  const flowEdges = useMemo(() => {
    const presented = applyPipelineEdgePresentation(edges, {
      pathEdgeIds,
      pathRunPulse: running && pathEdgeIds.size > 0,
      activeEdgeId: activeRunEdgeId,
    })
    const flowExec: FlowExecEdge[] = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      runOrder: (e.data as { runOrder?: number } | undefined)?.runOrder,
    }))
    const resolvedOrder = resolvedRunOrderByEdgeId(flowExec)
    const fanEdges = edges.map(e => ({ id: e.id, source: e.source, target: e.target }))
    const fanByEdgeId = new Map(
      edges.map(e => {
        const fan = runOrderFanPlacementForEdge({ id: e.id, source: e.source, target: e.target }, fanEdges, resolvedOrder)
        return [e.id, fan] as const
      }),
    )
    return presented.map(e => {
      const d = (e.data ?? {}) as { runOrder?: number; onRunOrderChange?: (n: number) => void }
      const siblingCount = edges.filter(x => x.source === e.source).length
      if (siblingCount === 0) return e
      const runOrder = resolvedOrder.get(e.id) ?? 1
      const fan = fanByEdgeId.get(e.id)
      return {
        ...e,
        data: {
          ...d,
          runOrder,
          runOrderMax: siblingCount,
          runOrderFanMax: fan?.fanMax ?? 1,
          runOrderFanIndex: fan?.fanIndex ?? 1,
          runOrderEditable: true,
          onRunOrderChange: (n: number) => handleEdgeRunOrderChange(e.id, n),
        },
      }
    })
  }, [activeRunEdgeId, edges, handleEdgeRunOrderChange, pathEdgeIds, running])

  const pathHighlightActive = pathEdgeIds.size > 0
  const pathHighlightToggleLabel = pathHighlightActive
    ? t('automation.pageMap.pathClear')
    : t('automation.pageMap.pathHighlight')

  const handlePathHighlightToggle = useCallback(() => {
    if (pathHighlightActive) {
      setPathEdgeIds(new Set())
      return
    }
    const stepOnlyIds = [...new Set(selectedStepIds)]
    if (stepOnlyIds.length < 2) {
      toast.info(t('automation.pageMap.pathNeedTwo'))
      return
    }
    const edgeList = edges.map(e => ({ id: e.id, source: e.source, target: e.target }))
    const ids = unionShortestPathEdgesUndirected(stepOnlyIds, edgeList)
    if (!ids.length) toast.info(t('automation.pageMap.pathNone'))
    setPathEdgeIds(new Set(ids))
  }, [edges, pathHighlightActive, selectedStepIds, t])

  const assignStepsToGroup = useCallback(
    (targetGroupId: string) => {
      if (!targetGroupId || selectedStepIds.length === 0) return
      const need = stepsNeedingGroupAssignment(selectedStepIds, nodes, targetGroupId)
      if (!need.length) {
        toast.info(t('automation.pageMap.assignToGroupNone'))
        return
      }
      onDirty()
      const updatedNodes = nodes.map(n => {
        if (!need.includes(n.id)) return n
        return { ...n, parentId: targetGroupId, extent: 'parent' as const }
      })
      const plan = planPipelineGroupChildLayout(updatedNodes, edges, targetGroupId)
      setNodes(nds =>
        sortNodesParentBeforeChildren(
          nds.map(n => {
            if (n.id === targetGroupId && plan.groupSize) {
              return { ...n, style: { ...n.style, width: plan.groupSize.width, height: plan.groupSize.height } }
            }
            const pos = plan.positions[n.id]
            if (!pos) return n
            if (need.includes(n.id)) {
              return { ...n, parentId: targetGroupId, extent: 'parent' as const, position: pos }
            }
            if (n.parentId === targetGroupId && n.type === 'pipelineStep') {
              return { ...n, position: pos }
            }
            return n
          }),
        ),
      )
      requestAnimationFrame(() =>
        rf.fitView({ nodes: [{ id: targetGroupId }, ...need.map(id => ({ id }))], padding: 0.35, duration: 350 }),
      )
      toast.success(t('automation.pageMap.assignToGroupDone', { count: need.length }))
    },
    [edges, nodes, onDirty, rf, selectedStepIds, setNodes, t],
  )

  const removeSelectedStepsFromGroup = useCallback(() => {
    const targets = nodes.filter(n => n.selected && n.type === 'pipelineStep' && n.parentId)
    if (!targets.length) {
      toast.info(t('automation.pageMap.removeFromGroupNone'))
      return
    }
    onDirty()
    setNodes(nds =>
      sortNodesParentBeforeChildren(
        nds.map(n => {
          if (!targets.some(x => x.id === n.id)) return n
          const abs = rf.getInternalNode(n.id)?.internals?.positionAbsolute
          if (!abs) return n
          return { ...n, parentId: undefined, extent: undefined, position: { x: abs.x, y: abs.y } }
        }),
      ),
    )
    toast.success(t('automation.pageMap.removeFromGroupDone', { count: targets.length }))
  }, [nodes, onDirty, rf, setNodes, t])

  const isDirtySuppressed = useCallback(() => Date.now() < suppressDirtyUntilRef.current, [])

  const onEdgesChangeWithDirty = useCallback(
    (changes: EdgeChange[]) => {
      if (editLocked) {
        const selectOnly = changes.filter(c => c.type === 'select')
        if (selectOnly.length > 0) onEdgesChange(selectOnly)
        return
      }
      onEdgesChange(changes)
      // Selection-only changes don't modify the graph
      if (!isDirtySuppressed() && changes.some(c => c.type !== 'select')) {
        onDirty()
      }
    },
    [editLocked, isDirtySuppressed, onEdgesChange, onDirty]
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!deleted.length) return
      onDirty()
      const deletedIds = new Set(deleted.map(d => d.id))
      const affectedSources = new Set<string>()
      for (const e of edges) {
        if (deletedIds.has(e.id)) affectedSources.add(e.source)
      }
      setEdges(eds => {
        let next = eds.filter(e => !deletedIds.has(e.id))
        for (const src of affectedSources) {
          const flowExec: FlowExecEdge[] = next.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            runOrder: (e.data as { runOrder?: number } | undefined)?.runOrder,
          }))
          const normalized = normalizeRunOrdersForSource(src, flowExec)
          const orderById = new Map(normalized.map(e => [e.id, e.runOrder]))
          next = next.map(e => {
            if (e.source !== src) return e
            const ro = orderById.get(e.id)
            const prev = (e.data as { runOrder?: number } | undefined)?.runOrder
            return ro != null && ro !== prev ? { ...e, data: { ...(e.data ?? {}), runOrder: ro } } : e
          })
        }
        return next
      })
    },
    [edges, onDirty, setEdges]
  )

  const resetFromFlow = useCallback(
    (f: DevPipelineFlow | null) => {
      suppressDirtyUntilRef.current = Date.now() + 500
      if (!f) {
        setNodes([])
        setEdges([])
        setAnyNodeSelected(false)
        setSelectedIds([])
        setPathEdgeIds(new Set())
        setActiveRunEdgeId(null)
      } else {
        const { nodes: n, edges: e } = graphToRf(f.graph)
        setNodes(n)
        setEdges(e)
      }
    },
    [setEdges, setNodes]
  )

  useEffect(() => {
    resetFromFlow(flow)
  }, [flow, resetFromFlow])

  const persistGraph = useCallback(async (): Promise<boolean> => {
    if (!flow) return false
    const vp = rf.getViewport()
    const graph = rfToGraph(nodes, edges, vp)
    const res = await window.api.devPipelines.flow.upsert({
      id: flow.id,
      name: flowName.trim() || flow.name,
      description: flow.description ?? null,
      graph,
      schemaVersion: flow.schemaVersion,
    })
    if (res.status !== 'success' || !res.data) {
      toast.error(res.message ?? t('devPipelines.saveError'))
      return false
    }
    return true
  }, [edges, flow, flowName, nodes, rf, t])

  useEffect(() => {
    onRegisterSave(() => persistGraph())
  }, [onRegisterSave, persistGraph])

  useEffect(() => {
    if (!activeRunId) {
      setStepLogs({})
      return
    }
    setStepLogs({})
    const off = window.api.devPipelines.onLogStream((p: DevPipelineLogStreamPayload) => {
      if (p.runId !== activeRunId) return
      setStepLogs(prev => {
        const cur = prev[p.nodeId] ?? []
        const prefix = p.stream === 'stderr' ? '[stderr] ' : ''
        const next = [...cur, `${prefix}${p.line}`]
        const cap = 2500
        return { ...prev, [p.nodeId]: next.length > cap ? next.slice(-cap) : next }
      })
    })
    return off
  }, [activeRunId])

  useEffect(() => {
    if (editingNodeId && !nodes.some(n => n.id === editingNodeId)) {
      setStepDialogOpen(false)
      setEditingNodeId(null)
    }
  }, [editingNodeId, nodes])

  const removeNodeById = useCallback(
    (id: string) => {
      onDirty()
      setNodes(nds => nds.filter(n => n.id !== id))
      setEdges(eds => eds.filter(e => e.source !== id && e.target !== id))
      if (editingNodeId === id) {
        setStepDialogOpen(false)
        setEditingNodeId(null)
      }
    },
    [editingNodeId, onDirty, setEdges, setNodes]
  )

  const deleteGroupById = useCallback(
    (groupId: string) => {
      onDirty()
      setNodes(nds => {
        const group = nds.find(n => n.id === groupId)
        if (!group) return nds
        const gx = group.position.x
        const gy = group.position.y
        return sortNodesParentBeforeChildren(
          nds
            .filter(n => n.id !== groupId)
            .map(n => {
              if (n.parentId !== groupId) return n
              return {
                ...n,
                parentId: undefined,
                extent: undefined,
                position: { x: gx + n.position.x, y: gy + n.position.y },
              }
            })
        )
      })
    },
    [onDirty, setNodes]
  )

  const canvasActions = useMemo((): DevPipelineCanvasActions => {
    return {
      canvasLocked,
      runBusy: running,
      runThisGroup: groupId => {
        void onStartRun({ mode: 'group', groupId })
      },
      runThisStep: stepId => {
        void onStartRun({ mode: 'node', nodeId: stepId })
      },
      runFlowFromStep: stepId => {
        void onStartRun({ mode: 'flow', startNodeId: stepId })
      },
      persistGroupSize: (groupId, size) => {
        if (canvasLocked) return
        onDirty()
        setNodes(nds => nds.map(n => (n.id === groupId ? { ...n, style: { ...n.style, width: size.width, height: size.height } } : n)))
      },
      persistNoteSize: (noteId, size) => {
        if (canvasLocked) return
        onDirty()
        setNodes(nds =>
          nds.map(n => {
            if (n.id !== noteId || n.type !== 'pipelineNote') return n
            const prev = n.data as DevPipelineNoteNodeData
            return {
              ...n,
              style: {
                ...n.style,
                width: size.width,
                ...(size.nodeHeight != null ? { height: size.nodeHeight } : {}),
              },
              data: {
                ...prev,
                ...(size.minHeight != null ? { minHeight: size.minHeight } : {}),
              },
            }
          })
        )
      },
      persistNoteContent: (noteId, content) => {
        if (canvasLocked) return
        onDirty()
        setNodes(nds =>
          nds.map(n => {
            if (n.id !== noteId || n.type !== 'pipelineNote') return n
            return { ...n, data: { ...(n.data as DevPipelineNoteNodeData), content } }
          })
        )
      },
      deleteGroup: groupId => {
        if (canvasLocked) return
        deleteGroupById(groupId)
      },
      deleteNote: noteId => {
        if (canvasLocked) return
        removeNodeById(noteId)
      },
    }
  }, [canvasLocked, deleteGroupById, onDirty, onStartRun, removeNodeById, running, setNodes])

  const addGroup = useCallback(() => {
    const label = addGroupName.trim() || t('devPipelines.defaultGroupName')
    onDirty()
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const id = newPipelineGroupId()
    setNodes(nds =>
      sortNodesParentBeforeChildren([
        ...nds,
        {
          id,
          type: 'pipelineGroup',
          position: { x: center.x - PIPELINE_GROUP_DEFAULT_W / 2, y: center.y - PIPELINE_GROUP_DEFAULT_H / 2 },
          style: { width: PIPELINE_GROUP_DEFAULT_W, height: PIPELINE_GROUP_DEFAULT_H },
          zIndex: 0,
          data: { label } satisfies DevPipelineGroupNodeData,
        },
      ])
    )
    setAddGroupOpen(false)
    setAddGroupName('')
  }, [addGroupName, onDirty, rf, setNodes, t])

  const addNote = useCallback(() => {
    onDirty()
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const id = newPipelineNoteId()
    setNodes(nds =>
      sortNodesParentBeforeChildren([
        ...nds,
        {
          id,
          type: 'pipelineNote',
          position: { x: center.x - PIPELINE_NOTE_DEFAULT_W / 2, y: center.y - PIPELINE_NOTE_DEFAULT_H / 2 },
          style: { width: PIPELINE_NOTE_DEFAULT_W, height: PIPELINE_NOTE_DEFAULT_H },
          zIndex: -1,
          connectable: false,
          data: {
            content: t('devPipelines.noteDefaultContent'),
            minHeight: PAGE_MAP_ANNOTATION_DEFAULT_H,
          } satisfies DevPipelineNoteNodeData,
        },
      ])
    )
  }, [onDirty, rf, setNodes, t])

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.type !== 'pipelineStep') return
      const nextGroup = resolveSmallestIntersectingPipelineGroupId(rf, node.id)
      const curGroup = node.parentId ? String(node.parentId) : null
      if ((nextGroup ?? null) === curGroup) return
      onDirty()

      if (!nextGroup) {
        setNodes(nds =>
          nds.map(n => {
            if (n.id !== node.id) return n
            const abs = rf.getInternalNode(node.id)?.internals?.positionAbsolute
            if (!abs) return n
            return { ...n, parentId: undefined, extent: undefined, position: { x: abs.x, y: abs.y } }
          })
        )
        return
      }

      const layoutNodes = rf.getNodes().map(n => {
        if (n.id !== node.id) return n
        return { ...n, parentId: nextGroup, extent: 'parent' as const }
      })
      const plan = planPipelineGroupChildLayout(layoutNodes, rf.getEdges(), nextGroup)

      setNodes(nds =>
        nds.map(n => {
          if (n.id === nextGroup && plan.groupSize) {
            return { ...n, style: { ...n.style, width: plan.groupSize.width, height: plan.groupSize.height } }
          }
          const pos = plan.positions[n.id]
          if (!pos) return n
          if (n.id === node.id) {
            return { ...n, parentId: nextGroup, extent: 'parent' as const, position: pos }
          }
          if (n.parentId === nextGroup && n.type === 'pipelineStep') {
            return { ...n, position: pos }
          }
          return n
        })
      )
    },
    [onDirty, rf, setNodes]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (editLocked) {
        const selectOnly = changes.filter(c => c.type === 'select')
        if (selectOnly.length > 0) onNodesChangeInternal(selectOnly)
        return
      }
      const removeIds = changes.filter((c): c is NodeChange & { type: 'remove'; id: string } => c.type === 'remove').map(c => c.id)
      const removedGroups = new Set(removeIds.filter(id => nodes.find(n => n.id === id)?.type === 'pipelineGroup'))

      if (removedGroups.size > 0) {
        setNodes(nds =>
          sortNodesParentBeforeChildren(
            nds
              .filter(n => !removeIds.includes(n.id))
              .map(n => {
                if (!n.parentId || !removedGroups.has(String(n.parentId))) return n
                const group = nodes.find(g => g.id === n.parentId)
                if (!group) return { ...n, parentId: undefined, extent: undefined }
                return {
                  ...n,
                  parentId: undefined,
                  extent: undefined,
                  position: { x: group.position.x + n.position.x, y: group.position.y + n.position.y },
                }
              })
          )
        )
        setEdges(eds => eds.filter(e => !removeIds.includes(e.source) && !removeIds.includes(e.target)))
        const rest = changes.filter(c => c.type !== 'remove')
        if (rest.length > 0) onNodesChangeInternal(rest)
        if (!isDirtySuppressed()) onDirty()
        return
      }

      onNodesChangeInternal(changes)
      if (removeIds.length > 0) {
        setEdges(eds => eds.filter(e => !removeIds.includes(e.source) && !removeIds.includes(e.target)))
      }
      if (!isDirtySuppressed()) {
        const hasMeaningfulChange = changes.some(c => c.type === 'remove' || c.type === 'position' || c.type === 'replace')
        if (hasMeaningfulChange) onDirty()
      }
    },
    [editLocked, isDirtySuppressed, nodes, onDirty, onNodesChangeInternal, setEdges, setNodes]
  )

  const patchNodeData = useCallback(
    (nodeId: string, patch: Partial<DevPipelineNodeData>) => {
      onDirty()
      setNodes(nds =>
        nds.map(n => {
          if (n.id !== nodeId) return n
          const prev = n.data as DevPipelineNodeData
          return { ...n, data: { ...prev, ...patch } }
        })
      )
    },
    [onDirty, setNodes]
  )

  useEffect(() => {
    if (!flowInspector) return
    if (flowInspector.kind === 'edge') {
      const e = edges.find(x => x.id === flowInspector.id)
      const d = (e?.data ?? {}) as { connectionStyle?: Partial<FlowConnectionStyle>; label?: string; condition?: DevPipelineEdgeCondition; runOrder?: number }
      const m = mergeConnectionStyle(d.connectionStyle)
      if (typeof d.label === 'string') m.label = d.label
      setEdgeDraft(m)
      setEdgeConditionDraft(d.condition ?? 'always')
      setEdgeRunOrderDraft(
        resolvedRunOrderByEdgeId(
          edges.map(x => ({
            id: x.id,
            source: x.source,
            target: x.target,
            runOrder: (x.data as { runOrder?: number } | undefined)?.runOrder,
          })),
        ).get(flowInspector.id) ?? 1,
      )
    } else if (flowInspector.kind === 'node') {
      const n = nodes.find(x => x.id === flowInspector.ids[0])
      const dd = n?.data as DevPipelineNodeData | undefined
      setNodeVisualDraft(mergeNodeVisualStyle(dd?.diagramVisual))
      setExecutionDisabledDraft(dd?.executionDisabled === true)
      if (flowInspector.ids.length === 1) {
        setNodeNameDraft(dd?.label ?? '')
      } else {
        setNodeNameDraft('')
      }
    } else if (flowInspector.kind === 'group') {
      const n = nodes.find(x => x.id === flowInspector.id)
      const dd = n?.data as DevPipelineGroupNodeData | undefined
      setNodeVisualDraft(mergeNodeVisualStyle(dd?.diagramVisual))
      setNodeNameDraft(dd?.label ?? '')
    } else if (flowInspector.kind === 'note') {
      const n = nodes.find(x => x.id === flowInspector.id)
      const dd = n?.data as DevPipelineNoteNodeData | undefined
      const merged = mergePageMapAnnotationStyle(dd?.style)
      const { width, height } = rfNodeSize(n ?? {})
      const noteMinHeight = dd?.minHeight ?? height ?? PAGE_MAP_ANNOTATION_DEFAULT_H
      setNoteDraft({
        content: dd?.content ?? '',
        labelNumber: 0,
        width: width ?? PIPELINE_NOTE_DEFAULT_W,
        height: noteMinHeight,
        style: merged,
      })
    }
  }, [flowInspector, edges, nodes])

  const applyEdgeInspector = useCallback(() => {
    if (!flowInspector || flowInspector.kind !== 'edge') return
    const hid = edgeHandleIds(edgeDraft)
    const edgeId = flowInspector.id
    onDirty()
    setEdges(eds => {
      const edge = eds.find(e => e.id === edgeId)
      if (!edge) return eds
      const flowEdges = normalizeAllRunOrders(
        eds.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          runOrder: (e.data as { runOrder?: number } | undefined)?.runOrder,
        })),
      )
      const swapped = swapRunOrderForEdge(edgeId, edgeRunOrderDraft, flowEdges)
      const orderById = new Map(swapped.map(e => [e.id, e.runOrder]))
      return eds.map(e => {
        if (e.id !== edgeId && e.source !== edge.source) return e
        const ro = orderById.get(e.id)
        const prevData = (e.data ?? {}) as Record<string, unknown>
        if (e.id === edgeId) {
          return {
            ...e,
            sourceHandle: hid.sourceHandle,
            targetHandle: hid.targetHandle,
            data: { ...prevData, label: edgeDraft.label, connectionStyle: edgeDraft, condition: edgeConditionDraft, runOrder: ro ?? edgeRunOrderDraft },
          }
        }
        if (ro != null && ro !== prevData.runOrder) {
          return { ...e, data: { ...prevData, runOrder: ro } }
        }
        return e
      })
    })
    setFlowInspector(null)
  }, [flowInspector, edgeDraft, edgeConditionDraft, edgeRunOrderDraft, onDirty, setEdges])

  const applyContentLayoutToAllSteps = useCallback(() => {
    const defaults = readBoardContentDefaults('devPipelines')
    if (!defaults?.contentLayout && !defaults?.contentDensity && !defaults?.metadataMode) {
      toast.error(t('flowInspector.applyLayoutToAllNoDefault'))
      return
    }
    onDirty()
    setNodes(nds =>
      nds.map(n => {
        if (n.type !== 'pipelineStep') return n
        const prev = n.data as DevPipelineNodeData
        return {
          ...n,
          data: {
            ...prev,
            diagramVisual: mergeNodeVisualStyle({ ...prev.diagramVisual, ...defaults }),
          },
        }
      }),
    )
    toast.success(t('flowInspector.applyLayoutToAllDone', { count: nodes.filter(n => n.type === 'pipelineStep').length }))
  }, [nodes, onDirty, setNodes, t])

  const applyNodeInspector = useCallback(() => {
    if (!flowInspector || flowInspector.kind === 'edge') return
    if (flowInspector.kind === 'node' && boardLayoutDefaultChecked) {
      writeBoardContentDefaults('devPipelines', pickContentDefaultsFromVisual(nodeVisualDraft))
      setHasBoardLayoutDefault(true)
    }
    if (flowInspector.kind === 'group') {
      const id = flowInspector.id
      const n = nodes.find(x => x.id === id)
      const prevLabel = (n?.data as DevPipelineGroupNodeData | undefined)?.label ?? ''
      const nextLabel = nodeNameDraft.trim() || prevLabel
      onDirty()
      setNodes(nds =>
        nds.map(node => {
          if (node.id !== id) return node
          const prev = node.data as DevPipelineGroupNodeData
          return { ...node, data: { ...prev, label: nextLabel, diagramVisual: nodeVisualDraft } }
        })
      )
      setFlowInspector(null)
      return
    }
    if (flowInspector.kind === 'note' && noteDraft) {
      const id = flowInspector.id
      onDirty()
      setNodes(nds =>
        nds.map(node => {
          if (node.id !== id || node.type !== 'pipelineNote') return node
          const prev = node.data as DevPipelineNoteNodeData
          return {
            ...node,
            style: { ...node.style, width: noteDraft.width, height: noteDraft.height },
            data: { ...prev, content: noteDraft.content, style: noteDraft.style, minHeight: noteDraft.height },
          }
        })
      )
      setFlowInspector(null)
      return
    }
    if (flowInspector.kind !== 'node') return
    const ids = flowInspector.ids
    if (ids.length === 1) {
      const id = ids[0]
      const n = nodes.find(x => x.id === id)
      const prevLabel = (n?.data as DevPipelineNodeData | undefined)?.label ?? ''
      const nextLabel = nodeNameDraft.trim() || prevLabel
      patchNodeData(id, { diagramVisual: nodeVisualDraft, label: nextLabel, executionDisabled: executionDisabledDraft || undefined })
      setFlowInspector(null)
      return
    }
    onDirty()
    setNodes(nds =>
      nds.map(n => {
        if (!ids.includes(n.id)) return n
        const prev = n.data as DevPipelineNodeData
        return { ...n, data: { ...prev, diagramVisual: nodeVisualDraft } }
      })
    )
    setFlowInspector(null)
  }, [flowInspector, nodeVisualDraft, nodeNameDraft, noteDraft, nodes, patchNodeData, onDirty, setNodes, boardLayoutDefaultChecked, executionDisabledDraft])

  const onConnect: OnConnect = useCallback(
    params => {
      const sourceNode = nodes.find(n => n.id === params.source)
      const targetNode = nodes.find(n => n.id === params.target)
      if (sourceNode?.type !== 'pipelineStep' || targetNode?.type !== 'pipelineStep') return
      const srcKind = (sourceNode.data as DevPipelineNodeData).stepKind
      const tgtKind = (targetNode.data as DevPipelineNodeData).stepKind
      onDirty()
      // Preserve the actual handle sides used during the drag.
      const sourceSide = params.sourceHandle?.startsWith('s-') ? params.sourceHandle.slice(2) : 'bottom'
      const targetSide = params.targetHandle?.startsWith('t-') ? params.targetHandle.slice(2) : 'top'
      const cs = mergeConnectionStyle({ sourceSide, targetSide } as Parameters<typeof mergeConnectionStyle>[0])
      setEdges(eds => {
        const runOrder = assignRunOrderForNewEdge(
          params.source!,
          eds.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            runOrder: (e.data as { runOrder?: number } | undefined)?.runOrder,
          })),
        )
        return addEdge(
          {
            ...params,
            type: 'labeled',
            sourceHandle: params.sourceHandle ?? `s-${sourceSide}`,
            targetHandle: params.targetHandle ?? `t-${targetSide}`,
            markerEnd: flowDiagramArrowMarkerEnd(cs.color),
            markerStart: cs.bidirectional ? flowDiagramArrowMarkerStart(cs.color) : undefined,
            data: { label: '', connectionStyle: cs, runOrder },
          },
          eds,
        )
      })
    },
    [nodes, onDirty, setEdges]
  )

  const createNodeFromTemplate = useCallback(
    (tpl: PipelineNodeTemplate, position: { x: number; y: number }) => {
      onDirty()
      const id = newPipelineStepId()
      const data: DevPipelineNodeData & { runVisual: PipelineStepRunVisual } = {
        ...buildNodeDataFromTemplate(tpl, t(`devPipelines.tpl.${tpl.labelKey}`)),
        runVisual: 'idle',
      }
      setNodes(nds => [
        ...nds,
        {
          id,
          type: 'pipelineStep',
          position,
          data,
        },
      ])
    },
    [onDirty, setNodes, t]
  )

  const createSnippetFromTemplate = useCallback(
    (snip: PipelineSnippetTemplate, dropPosition: { x: number; y: number }) => {
      onDirty()
      const idMap = new Map<string, string>()
      for (const n of snip.nodes) {
        idMap.set(n.templateNodeId, newPipelineStepId())
      }
      const minX = Math.min(...snip.nodes.map(n => n.relativePosition.x))
      const minY = Math.min(...snip.nodes.map(n => n.relativePosition.y))
      const newNodes: Node[] = snip.nodes.map(n => {
        const id = idMap.get(n.templateNodeId)
        if (!id) throw new Error(`Missing id map for ${n.templateNodeId}`)
        const data: DevPipelineNodeData & { runVisual: PipelineStepRunVisual } = {
          ...buildNodeDataFromSnippetNode(n, t(`devPipelines.tpl.${n.labelKey}`)),
          runVisual: 'idle',
        }
        return {
          id,
          type: 'pipelineStep',
          position: {
            x: dropPosition.x + (n.relativePosition.x - minX),
            y: dropPosition.y + (n.relativePosition.y - minY),
          },
          data,
        }
      })
      const rawEdges: Edge[] = snip.edges.flatMap(e => {
        const source = idMap.get(e.source)
        const target = idMap.get(e.target)
        if (!source || !target) return []
        const cs = mergeConnectionStyle()
        return [
          {
            id: newPipelineEdgeId(),
            source,
            target,
            type: 'labeled',
            sourceHandle: 's-bottom',
            targetHandle: 't-top',
            markerEnd: flowDiagramArrowMarkerEnd(cs.color),
            data: {
              label: e.label ?? '',
              connectionStyle: cs,
              condition: e.condition ?? 'always',
            },
          },
        ]
      })
      setNodes(nds => [...nds, ...newNodes])
      setEdges(eds => {
        const acc: FlowExecEdge[] = eds.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          runOrder: (e.data as { runOrder?: number } | undefined)?.runOrder,
        }))
        const withOrder = rawEdges.map(edge => {
          const runOrder = assignRunOrderForNewEdge(edge.source, acc)
          acc.push({ id: edge.id, source: edge.source, target: edge.target, runOrder })
          return { ...edge, data: { ...(edge.data ?? {}), runOrder } }
        })
        return [...eds, ...withOrder]
      })
    },
    [onDirty, setEdges, setNodes, t]
  )

  const addFromTemplate = useCallback(
    (id: string, kind: 'node' | 'snippet', position: { x: number; y: number }) => {
      if (kind === 'snippet') {
        const snip = findSnippetTemplate(id)
        if (snip) createSnippetFromTemplate(snip, position)
        return
      }
      const tpl = findNodeTemplate(id)
      if (tpl) createNodeFromTemplate(tpl, position)
    },
    [createNodeFromTemplate, createSnippetFromTemplate]
  )

  const addStep = useCallback(() => {
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const blankTpl = findNodeTemplate('util-blank-shell')
    if (blankTpl) {
      createNodeFromTemplate(blankTpl, center)
      return
    }
    onDirty()
    const id = newPipelineStepId()
    setNodes(nds => [
      ...nds,
      {
        id,
        type: 'pipelineStep',
        position: center,
        data: {
          label: t('devPipelines.stepLabel'),
          stepKind: 'shell' as const,
          command: '',
          waitForExit: true,
          runVisual: 'idle' as const,
          diagramVisual: mergeNodeVisualStyle(readBoardContentDefaults('devPipelines') ?? undefined),
        },
      },
    ])
  }, [createNodeFromTemplate, onDirty, rf, setNodes, t])

  useEffect(() => {
    onRegisterAddFromTemplate((id, kind) => {
      const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      addFromTemplate(id, kind, center)
    })
  }, [addFromTemplate, onRegisterAddFromTemplate, rf])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('pipeline/template-id')
      const kind = e.dataTransfer.getData('pipeline/template-kind') as 'node' | 'snippet'
      if (!id) return
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addFromTemplate(id, kind || 'node', pos)
    },
    [addFromTemplate, rf]
  )

  useEffect(() => {
    const off = window.api.devPipelines.onRunStream((p: DevPipelineRunStreamPayload) => {
      if (!flow || p.flowId !== flow.id) return
      setActiveRunEdgeId(p.activeEdgeId ?? null)
      setNodes(nds => patchPipelineNodesRunVisual(nds, p.stepStatus) ?? nds)

      if (!activeRunId || p.runId !== activeRunId) return
      const awaiting = Object.entries(p.stepStatus).find(([, s]) => s.status === 'awaiting-approval')
      if (awaiting) {
        const [nodeId] = awaiting
        const node = nodes.find(n => n.id === nodeId)
        const nd = node?.data as DevPipelineNodeData | undefined
        setPendingApproval({
          nodeId,
          label: nd?.label ?? nodeId,
          message: nd?.approvalMessage,
        })
      } else {
        setPendingApproval(null)
      }
    })
    return off
  }, [activeRunId, flow, nodes, setNodes])

  const editingNode = editingNodeId ? nodes.find(n => n.id === editingNodeId) : undefined
  const editingData = editingNode?.data as DevPipelineNodeData | undefined

  const nodeToolbarActions = useMemo((): DevPipelineNodeToolbarActions => {
    return {
      openStepDetails: (id: string) => {
        setEditingNodeId(id)
        setStepDialogOpen(true)
      },
      runThisStep: (id: string) => {
        const node = nodes.find(n => n.id === id)
        const data = node?.data as DevPipelineNodeData | undefined
        if (data?.executionDisabled) {
          toast.info(t('flowInspector.executionDisabledRunBlocked'))
          return
        }
        void onStartRun({ mode: 'node', nodeId: id })
      },
      runFlowFromStep: (id: string) => {
        void onStartRun({ mode: 'flow', startNodeId: id })
      },
      toggleExecutionDisabled: (id: string) => {
        onDirty()
        setNodes(nds =>
          nds.map(n => {
            if (n.id !== id) return n
            const prev = n.data as DevPipelineNodeData
            const next = !prev.executionDisabled
            return { ...n, data: { ...prev, executionDisabled: next || undefined } }
          }),
        )
      },
      canRunStep: !running,
      duplicateStep: (id: string) => {
        setNodes(nds => {
          const src = nds.find(n => n.id === id)
          if (!src) return nds
          const newId = newPipelineStepId()
          const raw = { ...(src.data as Record<string, unknown>) }
          delete raw.runVisual
          const clone: Node = {
            ...src,
            id: newId,
            position: { x: src.position.x + 48, y: src.position.y + 48 },
            selected: true,
            data: { ...raw, runVisual: 'idle' as const },
          }
          return [...nds.map(n => ({ ...n, selected: false })), clone]
        })
        onDirty()
      },
      deleteStep: removeNodeById,
      canDeleteStep: true,
      canDuplicateStep: true,
    }
  }, [nodes, onDirty, onStartRun, removeNodeById, running, setNodes, t])

  const pipelineSearchNodes = useMemo(() => nodes.map(n => ({ id: n.id, label: (n.data as { label?: string }).label ?? n.id })), [nodes])

  const handlePipelineSearchSelect = useCallback(
    (nodeId: string) => {
      const n = nodes.find(x => x.id === nodeId)
      if (!n) return
      requestAnimationFrame(() => {
        const b = getNodesBounds([n])
        void rf.fitBounds(b, { padding: 0.45, duration: 300 })
      })
    },
    [nodes, rf]
  )

  const handleSelectAll = useCallback(() => {
    setNodes(nds => {
      const next = nds.map(n => ({ ...n, selected: true }))
      setSelectedIds(next.map(n => n.id))
      return next
    })
  }, [setNodes])

  const handleClearSelection = useCallback(() => {
    setNodes(nds => nds.map(n => ({ ...n, selected: false })))
    setSelectedIds([])
  }, [setNodes])

  const handleCanvasLockedChange = useCallback(
    (locked: boolean) => {
      setCanvasLocked(locked)
      if (locked) {
        handleClearSelection()
        setPathEdgeIds(new Set())
        setFlowInspector(null)
      }
    },
    [handleClearSelection],
  )

  const applyPipelineAutoLayout = useCallback(
    async (algo: 'dagre-tb' | 'dagre-lr' | 'radial') => {
      const currentNodes = await getNodesSizedForAutoLayout(rf, n => n.type !== 'pipelineNote')
      const currentEdges = rf.getEdges()
      const layoutIds = new Set(currentNodes.map(n => n.id))
      const layoutEdges = currentEdges.filter(e => layoutIds.has(e.source) && layoutIds.has(e.target))
      let laid: Record<string, { x: number; y: number }>
      switch (algo) {
        case 'dagre-lr':
          laid = layoutCatalogHorizontal(currentNodes, layoutEdges)
          break
        case 'radial':
          laid = layoutCatalogRadial(currentNodes, layoutEdges)
          break
        default:
          laid = layoutCatalogWithDagre(currentNodes, layoutEdges)
      }
      setNodes(nds => nds.map(n => (laid[n.id] ? { ...n, position: laid[n.id] } : n)))
      onDirty()
      requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 300 }))
      toast.success(t('automation.pageMap.autoLayoutDone'))
    },
    [onDirty, rf, setNodes, t],
  )

  const handlePaneContextMenu = useCallback(
    (e: MouseEvent<Element> | globalThis.MouseEvent) => {
      e.preventDefault()
      if (canvasLocked) return
      setFloatMenu({ kind: 'pane', clientX: e.clientX, clientY: e.clientY })
    },
    [canvasLocked]
  )

  useEffect(() => {
    if (!floatMenu) return
    const close = () => setFloatMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [floatMenu])

  const handleMiniMapVisibleChange = useCallback((visible: boolean) => {
    setMiniMapVisible(visible)
    try {
      localStorage.setItem(PIPELINE_MINIMAP_LS, visible ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }, [])

  const miniMapIsDark = resolvedTheme === 'dark'
  const miniMapNodeColor = useCallback((node: Node) => devPipelineMiniMapNodeColor(node, miniMapIsDark), [miniMapIsDark])
  const miniMapNodeStrokeColor = useCallback((node: Node) => devPipelineMiniMapNodeStrokeColor(node, miniMapIsDark), [miniMapIsDark])
  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  if (!flow) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <Workflow className="size-10 opacity-40" aria-hidden />
        <p>{t('devPipelines.selectPipelineHint')}</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {pendingApproval && activeRunId ? (
        <div className="absolute inset-x-0 top-0 z-20 mx-3 mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 shadow-sm backdrop-blur-sm">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{t('devPipelines.approvalRequired')}</p>
            <p className="truncate text-[11px] text-muted-foreground">{pendingApproval.message?.trim() || pendingApproval.label}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                void window.api.devPipelines.run.approvalRespond({
                  runId: activeRunId,
                  nodeId: pendingApproval.nodeId,
                  approved: false,
                })
              }}
            >
              {t('devPipelines.approvalReject')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                void window.api.devPipelines.run.approvalRespond({
                  runId: activeRunId,
                  nodeId: pendingApproval.nodeId,
                  approved: true,
                })
              }}
            >
              {t('devPipelines.approvalApprove')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <DevPipelineNodeToolbarContext.Provider value={nodeToolbarActions}>
          <DevPipelineCanvasContext.Provider value={canvasActions}>
            <FlowEdgeActionsContext.Provider value={flowEdgeInspectorActions}>
              <FlowNodeActionsContext.Provider value={flowNodeInspectorActions}>
                <FlowCanvasNodeSelectionProvider anyNodeSelected={anyNodeSelected}>
                  <ReactFlow
                    colorMode={flowColorMode}
                    deleteKeyCode={editLocked ? null : FLOW_DELETE_KEY_CODE}
                    minZoom={FLOW_CANVAS_MIN_ZOOM}
                    maxZoom={FLOW_CANVAS_MAX_ZOOM}
                    nodes={nodes}
                    edges={flowEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChangeWithDirty}
                    onEdgesDelete={editLocked ? undefined : onEdgesDelete}
                    onConnect={editLocked ? undefined : onConnect}
                    onNodeDragStop={onNodeDragStop}
                    onSelectionChange={onSelectionChange}
                    onPaneContextMenu={handlePaneContextMenu}
                    onDragOver={editLocked ? undefined : onDragOver}
                    onDrop={editLocked ? undefined : onDrop}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={FLOW_DEFAULT_EDGE_OPTIONS}
                    onlyRenderVisibleElements
                    selectionOnDrag={!editLocked}
                    panOnDrag={editLocked ? true : FLOW_PAN_ON_DRAG}
                    nodesDraggable={!editLocked}
                    nodesConnectable={!editLocked}
                    elementsSelectable={!editLocked}
                    proOptions={FLOW_PRO_OPTIONS}
                    className="h-full w-full bg-background"
                  >
                    <FlowCanvasBackground />
                    {miniMapVisible ? (
                      <MiniMap
                        className="m-2 overflow-hidden rounded-md border border-border bg-card shadow-sm"
                        zoomable
                        pannable
                        nodeColor={miniMapNodeColor}
                        nodeStrokeColor={miniMapNodeStrokeColor}
                        nodeStrokeWidth={2}
                      />
                    ) : null}
                    <FlowInitialViewport flowId={flow.id} viewport={flow.graph.viewport} />
                    <PipelineBottomBar
                      nodeCount={nodes.length}
                      anyNodeSelected={anyNodeSelected}
                      selectedStepCount={selectedStepIds.length}
                      showPathActions={selectedStepIds.length >= 2}
                      pathHighlightActive={pathHighlightActive}
                      pathHighlightLabel={pathHighlightToggleLabel}
                      onPathHighlightToggle={handlePathHighlightToggle}
                      assignGroupOptions={assignGroupOptions}
                      onAssignToGroup={assignStepsToGroup}
                      removeFromGroupCount={removeFromGroupSelectionCount}
                      onRemoveFromGroup={removeSelectedStepsFromGroup}
                      searchNodes={pipelineSearchNodes}
                      onSearchSelect={handlePipelineSearchSelect}
                      onAddStep={addStep}
                      onAddGroup={() => setAddGroupOpen(true)}
                      onAddNote={addNote}
                      onSelectAll={handleSelectAll}
                      onClearSelection={handleClearSelection}
                      onAutoLayout={applyPipelineAutoLayout}
                      onApplyContentLayoutToAll={applyContentLayoutToAllSteps}
                      layoutDisabled={editLocked}
                      miniMapVisible={miniMapVisible}
                      onMiniMapVisibleChange={handleMiniMapVisibleChange}
                      canvasLocked={editLocked}
                      onCanvasLockedChange={handleCanvasLockedChange}
                    />
                  </ReactFlow>
                </FlowCanvasNodeSelectionProvider>
              </FlowNodeActionsContext.Provider>
            </FlowEdgeActionsContext.Provider>
          </DevPipelineCanvasContext.Provider>
        </DevPipelineNodeToolbarContext.Provider>

        {floatMenu?.kind === 'pane' ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops propagation for portaled menu
          <div
            role="menu"
            aria-label={t('automation.pageMap.actionBarSectionLayout')}
            className="fixed z-[80] min-w-[11rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
            style={{ left: floatMenu.clientX, top: floatMenu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                void rf.fitView({ padding: 0.2, duration: 300 })
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.fitView')}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                applyPipelineAutoLayout('dagre-tb')
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.layoutAlgoVertical')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                applyPipelineAutoLayout('dagre-lr')
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.layoutAlgoHorizontal')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                applyPipelineAutoLayout('radial')
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.layoutAlgoRadial')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                applyContentLayoutToAllSteps()
                setFloatMenu(null)
              }}
            >
              {t('flowInspector.applyLayoutToAll')}
            </button>
          </div>
        ) : null}
      </div>

      <Sheet open={Boolean(flowInspector)} onOpenChange={o => !o && setFlowInspector(null)}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col gap-4 overflow-y-auto">
          <SheetHeader className="flex-row items-center justify-between gap-2">
            <SheetTitle>
              {flowInspector?.kind === 'edge'
                ? t('flowInspector.connectionTitle')
                : flowInspector?.kind === 'node'
                  ? flowInspector.ids.length > 1
                    ? t('flowInspector.visualBulkSteps', { count: flowInspector.ids.length })
                    : t('flowInspector.visualTitle')
                  : flowInspector?.kind === 'group'
                    ? t('devPipelines.groupInspectorTitle')
                    : flowInspector?.kind === 'note'
                      ? t('devPipelines.noteInspectorTitle')
                      : ''}
            </SheetTitle>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              onClick={() => {
                if (flowInspector?.kind === 'edge') applyEdgeInspector()
                else if (flowInspector?.kind === 'node' || flowInspector?.kind === 'group' || flowInspector?.kind === 'note') applyNodeInspector()
              }}
            >
              {t('flowInspector.apply')}
            </Button>
          </SheetHeader>
          <div className="px-4 pb-6">
            {flowInspector?.kind === 'edge' ? (
              <FlowConnectionPropertiesPanel
                value={edgeDraft}
                onChange={setEdgeDraft}
                edgeCondition={edgeConditionDraft}
                onEdgeConditionChange={setEdgeConditionDraft}
                runOrder={edgeRunOrderDraft}
                runOrderMax={
                  flowInspector?.kind === 'edge'
                    ? Math.max(
                        1,
                        edges.filter(e => e.source === edges.find(x => x.id === flowInspector.id)?.source).length,
                      )
                    : 1
                }
                onRunOrderChange={setEdgeRunOrderDraft}
              />
            ) : null}
            {flowInspector?.kind === 'node' ? (
              <div className="grid gap-3">
                {flowInspector.ids.length > 1 ? <p className="text-xs leading-snug text-muted-foreground">{t('flowInspector.bulkVisualHint')}</p> : null}
                <FlowNodeVisualConfigPanel
                  value={nodeVisualDraft}
                  onChange={setNodeVisualDraft}
                  layoutContext="pipelineStep"
                  boardDefaultLayoutChecked={boardLayoutDefaultChecked}
                  onBoardDefaultLayoutCheckedChange={setBoardLayoutDefaultChecked}
                  onResetBoardDefaultLayout={() => {
                    clearBoardContentDefaults('devPipelines')
                    setHasBoardLayoutDefault(false)
                    setBoardLayoutDefaultChecked(false)
                  }}
                  hasBoardDefaultLayout={hasBoardLayoutDefault}
                  executionDisabled={executionDisabledDraft}
                  onExecutionDisabledChange={setExecutionDisabledDraft}
                  {...(flowInspector.ids.length === 1 ? { nodeDisplayName: nodeNameDraft, onNodeDisplayNameChange: setNodeNameDraft } : {})}
                />
              </div>
            ) : null}
            {flowInspector?.kind === 'group' ? (
              <div className="grid gap-3">
                <FlowNodeVisualConfigPanel
                  value={nodeVisualDraft}
                  onChange={setNodeVisualDraft}
                  nodeDisplayName={nodeNameDraft}
                  onNodeDisplayNameChange={setNodeNameDraft}
                  showConnectionHandlesToggle
                />
              </div>
            ) : null}
            {flowInspector?.kind === 'note' && noteDraft ? <PageMapAnnotationConfigPanel value={noteDraft} onChange={setNoteDraft} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('devPipelines.addGroupTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-pipeline-group-name">{t('devPipelines.addGroupNameLabel')}</Label>
            <Input
              id="new-pipeline-group-name"
              value={addGroupName}
              onChange={e => setAddGroupName(e.target.value)}
              placeholder={t('devPipelines.addGroupNamePlaceholder')}
              onKeyDown={e => {
                if (e.key === 'Enter') addGroup()
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddGroupOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={addGroup}>
              {t('devPipelines.addGroup')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={stepDialogOpen}
        onOpenChange={o => {
          setStepDialogOpen(o)
          if (!o) setEditingNodeId(null)
        }}
      >
        <DialogContent className="flex max-h-[min(85vh,720px)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton>
          <DialogHeader className="shrink-0 space-y-0 border-b px-6 py-4 pr-14 text-left sm:text-left">
            <DialogTitle className="min-w-0 leading-snug">{t('devPipelines.stepDetails')}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            {editingNodeId && editingData ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="step-label">{t('devPipelines.stepLabel')}</Label>
                  <Input
                    id="step-label"
                    value={editingData.label}
                    onChange={e => patchNodeData(editingNodeId, { label: e.target.value })}
                    className="h-9"
                    disabled={editLocked}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('devPipelines.stepKindLabel')}</Label>
                  <Select
                    value={editingData.stepKind}
                    onValueChange={v => {
                      const kind = v as DevPipelineNodeData['stepKind']
                      if (kind === 'noop')
                        patchNodeData(editingNodeId, {
                          stepKind: 'noop',
                          params: undefined,
                          scriptPath: '',
                          command: '',
                          cwd: undefined,
                          waitForExit: undefined,
                          approvalMessage: undefined,
                        })
                      else if (kind === 'delay')
                        patchNodeData(editingNodeId, {
                          stepKind: 'delay',
                          params: { ms: editingData.params?.ms ?? 600 },
                          scriptPath: '',
                          command: '',
                          cwd: undefined,
                          waitForExit: undefined,
                          approvalMessage: undefined,
                        })
                      else if (kind === 'approval')
                        patchNodeData(editingNodeId, {
                          stepKind: 'approval',
                          params: undefined,
                          scriptPath: '',
                          command: '',
                          cwd: undefined,
                          waitForExit: undefined,
                          approvalMessage: editingData.approvalMessage ?? '',
                        })
                      else if (kind === 'http-check')
                        patchNodeData(editingNodeId, {
                          stepKind: 'http-check',
                          params: {
                            url: editingData.params?.url?.trim() || 'http://localhost:3000/health',
                            expectedStatus: editingData.params?.expectedStatus ?? 200,
                            timeoutMs: editingData.params?.timeoutMs ?? 30000,
                            retryDelayMs: editingData.params?.retryDelayMs ?? 2000,
                            maxRetries: editingData.params?.maxRetries ?? 10,
                          },
                          scriptPath: '',
                          command: '',
                          cwd: undefined,
                          waitForExit: undefined,
                          approvalMessage: undefined,
                        })
                      else
                        patchNodeData(editingNodeId, {
                          stepKind: 'shell',
                          params: undefined,
                          command: editingData.command ?? '',
                          waitForExit: editingData.waitForExit !== false,
                          approvalMessage: undefined,
                        })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noop">{t('devPipelines.stepKindNoop')}</SelectItem>
                      <SelectItem value="delay">{t('devPipelines.stepKindDelay')}</SelectItem>
                      <SelectItem value="shell">{t('devPipelines.stepKindShell')}</SelectItem>
                      <SelectItem value="approval">{t('devPipelines.stepKindApproval')}</SelectItem>
                      <SelectItem value="http-check">{t('devPipelines.stepKindHttpCheck')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingData.stepKind === 'delay' ? (
                  <div className="space-y-2">
                    <Label htmlFor="step-ms">{t('devPipelines.delayMs')}</Label>
                    <Input
                      id="step-ms"
                      type="number"
                      min={50}
                      max={120000}
                      value={editingData.params?.ms ?? 600}
                      onChange={e => patchNodeData(editingNodeId, { params: { ...editingData.params, ms: Number(e.target.value) || 600 } })}
                      className="h-9"
                    />
                  </div>
                ) : null}
                {editingData.stepKind === 'approval' ? (
                  <div className="space-y-2">
                    <Label htmlFor="step-approval-msg">{t('devPipelines.approvalMessage')}</Label>
                    <Textarea
                      id="step-approval-msg"
                      rows={2}
                      className="text-xs"
                      value={editingData.approvalMessage ?? ''}
                      onChange={e => patchNodeData(editingNodeId, { approvalMessage: e.target.value })}
                    />
                  </div>
                ) : null}
                {editingData.stepKind === 'http-check' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="step-http-url">{t('devPipelines.httpCheckUrl')}</Label>
                      <Input
                        id="step-http-url"
                        className="h-9 font-mono text-xs"
                        value={editingData.params?.url ?? ''}
                        onChange={e => patchNodeData(editingNodeId, { params: { ...editingData.params, url: e.target.value } })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="step-http-status">{t('devPipelines.httpCheckExpectedStatus')}</Label>
                        <Input
                          id="step-http-status"
                          type="number"
                          className="h-9"
                          value={editingData.params?.expectedStatus ?? 200}
                          onChange={e =>
                            patchNodeData(editingNodeId, {
                              params: { ...editingData.params, expectedStatus: Number(e.target.value) || 200 },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="step-http-retries">{t('devPipelines.httpCheckMaxRetries')}</Label>
                        <Input
                          id="step-http-retries"
                          type="number"
                          min={1}
                          className="h-9"
                          value={editingData.params?.maxRetries ?? 10}
                          onChange={e =>
                            patchNodeData(editingNodeId, {
                              params: { ...editingData.params, maxRetries: Number(e.target.value) || 10 },
                            })
                          }
                        />
                      </div>
                    </div>
                  </>
                ) : null}
                {editingData.stepKind === 'shell' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="step-script">{t('devPipelines.scriptPath')}</Label>
                      <Textarea
                        id="step-script"
                        rows={2}
                        className="font-mono text-xs"
                        placeholder={t('devPipelines.scriptPathPlaceholder')}
                        value={editingData.scriptPath ?? ''}
                        onChange={e => patchNodeData(editingNodeId, { scriptPath: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">{t('devPipelines.scriptPathHint')}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="step-cmd">{t('devPipelines.command')}</Label>
                      <Textarea
                        id="step-cmd"
                        rows={3}
                        className="font-mono text-xs"
                        placeholder={t('devPipelines.commandPlaceholder')}
                        value={editingData.command ?? ''}
                        onChange={e => patchNodeData(editingNodeId, { command: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="step-cwd">{t('devPipelines.nodeCwd')}</Label>
                      <Input
                        id="step-cwd"
                        className="h-9 font-mono text-xs"
                        placeholder={t('devPipelines.nodeCwdPlaceholder')}
                        value={editingData.cwd ?? ''}
                        onChange={e => patchNodeData(editingNodeId, { cwd: e.target.value || undefined })}
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox id="step-wait" checked={editingData.waitForExit !== false} onCheckedChange={c => patchNodeData(editingNodeId, { waitForExit: c === true })} />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="step-wait" className="cursor-pointer text-sm font-medium">
                          {t('devPipelines.waitForExit')}
                        </Label>
                        <p className="text-xs text-muted-foreground">{t('devPipelines.waitForExitHint')}</p>
                      </div>
                    </div>
                  </>
                ) : null}
                <Separator />
                <div className="space-y-2">
                  <Label>{t('devPipelines.logTitle')}</Label>
                  <div className="h-48 overflow-y-auto overscroll-y-contain rounded-md border bg-muted/30 p-2" onWheel={e => e.stopPropagation()}>
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">
                      {(activeRunId ? stepLogs[editingNodeId]?.join('\n') || t('devPipelines.logWaiting') : t('devPipelines.logEmpty')) ?? ''}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DevPipelinesPage({ mode = 'standalone' }: DevPipelinesPageProps) {
  const { t } = useTranslation()
  const embedded = mode === 'embedded'
  const portal = useDevPipelinesToolbarPortalTarget()
  const [flows, setFlows] = useState<DevPipelineFlowSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flowDetail, setFlowDetail] = useState<DevPipelineFlow | null>(null)
  const [flowName, setFlowName] = useState('')
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState<DevPipelineSaveState>('idle')
  const [running, setRunning] = useState(false)
  const [lastRunStatus, setLastRunStatus] = useState<DevPipelineRunStatus | null>(null)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const saveFnRef = useRef<() => Promise<boolean>>(async () => false)
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const dirtyRef = useRef(false)
  const canPersistRef = useRef(false)
  const performSaveRef = useRef<() => Promise<boolean>>(async () => true)
  const savedFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveRef = useRef(
    createDebouncedPersist(async () => {
      if (!dirtyRef.current || !canPersistRef.current) return
      await performSaveRef.current()
    }),
  )
  const registerSave = useCallback((fn: () => Promise<boolean>) => {
    saveFnRef.current = fn
  }, [])
  const addFromTemplateFnRef = useRef<(id: string, kind: 'node' | 'snippet') => void>(() => { })
  const registerAddFromTemplate = useCallback((fn: (id: string, kind: 'node' | 'snippet') => void) => {
    addFromTemplateFnRef.current = fn
  }, [])
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null)
  const [flowSidebarOpen, setFlowSidebarOpen] = useState(true)
  const [sidebarDefaultSize] = useState(() => readSidebarDefaultSize())
  const initialPanelLayout = useMemo(
    () => ({
      'dev-pipeline-sidebar': sidebarDefaultSize,
      'dev-pipeline-canvas': 100 - sidebarDefaultSize,
    }),
    [sidebarDefaultSize]
  )
  const [sidebarTab, setSidebarTab] = useState<'pipelines' | 'templates'>('pipelines')

  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadList = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!opts?.background) setLoadingList(true)
      const res = await window.api.devPipelines.flow.list()
      if (!opts?.background) setLoadingList(false)
      if (res.status !== 'success' || !res.data) {
        if (!opts?.background) toast.error(res.message ?? t('devPipelines.loadError'))
        setFlows([])
        return
      }
      setFlows(res.data)
    },
    [t]
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    const onFocus = () => {
      void loadList({ background: true })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadList])

  const loadDetail = useCallback(
    async (id: string) => {
      autosaveRef.current.cancel()
      dirtyRef.current = false
      setDetailLoading(true)
      setSaveState('idle')
      setFlowDetail(null)
      const res = await window.api.devPipelines.flow.get(id)
      setDetailLoading(false)
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? t('devPipelines.loadError'))
        return
      }
      setFlowDetail(res.data)
      setFlowName(res.data.name)
      dirtyRef.current = false
      setSaveState('idle')
    },
    [t]
  )

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else {
      autosaveRef.current.cancel()
      dirtyRef.current = false
      setDetailLoading(false)
      setFlowDetail(null)
      setFlowName('')
      setSaveState('idle')
    }
  }, [selectedId, loadDetail])

  const activeFlowName = flowName || flows.find(f => f.id === selectedId)?.name || ''
  const barRunning = running

  const canPersist = Boolean(selectedId && flowDetail && flowDetail.id === selectedId && !detailLoading)

  const performSave = useCallback(async (): Promise<boolean> => {
    if (saveInFlightRef.current) return saveInFlightRef.current
    const p = (async () => {
      if (!selectedId || !flowDetail || flowDetail.id !== selectedId || detailLoading) {
        dirtyRef.current = false
        setSaveState('idle')
        return true
      }
      setSaveState('saving')
      const ok = await saveFnRef.current()
      if (ok) {
        dirtyRef.current = false
        setSaveState('saved')
        if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current)
        savedFadeTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
      } else {
        setSaveState('error')
        toast.error(t('devPipelines.autosaveError'))
      }
      return ok
    })()
    saveInFlightRef.current = p
    try {
      return await p
    } finally {
      saveInFlightRef.current = null
    }
  }, [detailLoading, flowDetail, selectedId, t])

  performSaveRef.current = performSave
  canPersistRef.current = canPersist

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    autosaveRef.current.schedule()
  }, [])

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current && saveState !== 'saving') return true
    if (!canPersist) {
      dirtyRef.current = false
      setSaveState('idle')
      autosaveRef.current.cancel()
      return true
    }
    await autosaveRef.current.flush()
    return dirtyRef.current ? false : true
  }, [canPersist, saveState])

  useEffect(() => {
    return () => {
      autosaveRef.current.cancel()
    }
  }, [])

  const trySelect = useCallback(
    async (id: string) => {
      if (id === selectedId) return
      const ok = await flushSave()
      if (!ok) return
      setSelectedId(id)
    },
    [flushSave, selectedId]
  )

  useEffect(() => {
    if (selectedId || flows.length === 0) return
    void trySelect(flows[0].id)
  }, [flows, selectedId, trySelect])

  const startRun = useCallback(
    async (scope?: DevPipelineRunScope) => {
      if (!selectedId) return
      const ok = await flushSave()
      if (!ok) return
      setLastRunStatus(null)
      const res = await window.api.devPipelines.run.start(selectedId, scope)
      if (res.status !== 'success' || !res.data?.runId) {
        toast.error(res.message ?? t('devPipelines.loadError'))
        return
      }
      setCurrentRunId(res.data.runId)
      setRunning(true)
    },
    [flushSave, selectedId, t]
  )

  const handleRun = useCallback(async () => {
    await startRun({ mode: 'full' })
  }, [startRun])

  useEffect(() => {
    const off = window.api.devPipelines.onRunStream(p => {
      if (p.runStatus === 'running') {
        setRunning(true)
        if (p.flowId === selectedId) setLastRunStatus(null)
      }
      if (p.runStatus && p.runStatus !== 'running') {
        setRunning(false)
        if (p.flowId === selectedId) setLastRunStatus(p.runStatus)
      }
    })
    return off
  }, [selectedId])

  const handleCancelRun = useCallback(async () => {
    if (!currentRunId) return
    await window.api.devPipelines.run.cancel(currentRunId)
  }, [currentRunId])

  const handleNew = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    const res = await window.api.devPipelines.flow.create({ name })
    setNewOpen(false)
    setNewName('')
    if (res.status !== 'success' || !res.data) {
      toast.error(res.message ?? t('devPipelines.saveError'))
      return
    }
    await loadList()
    dirtyRef.current = false
    setSaveState('idle')
    setSelectedId(res.data.id)
  }, [loadList, newName, t])

  const requestDelete = useCallback((id: string) => {
    setDeleteTargetId(id)
    setDeleteOpen(true)
  }, [])

  const deleteTargetName = useMemo(() => {
    const id = deleteTargetId ?? selectedId
    if (!id) return ''
    return flows.find(f => f.id === id)?.name ?? flowDetail?.name ?? ''
  }, [deleteTargetId, selectedId, flows, flowDetail?.name])

  const handleDelete = useCallback(async () => {
    const id = deleteTargetId ?? selectedId
    if (!id) return
    const res = await window.api.devPipelines.flow.delete(id)
    setDeleteOpen(false)
    setDeleteTargetId(null)
    if (res.status !== 'success') {
      toast.error(res.message ?? t('devPipelines.saveError'))
      return
    }
    if (selectedId === id) {
      setSelectedId(null)
      setFlowDetail(null)
      setFlowName('')
    }
    autosaveRef.current.cancel()
    dirtyRef.current = false
    setSaveState('idle')
    void loadList()
  }, [deleteTargetId, loadList, selectedId, t])

  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (panel) {
      if (flowSidebarOpen) panel.collapse()
      else panel.expand()
    } else {
      setFlowSidebarOpen(o => !o)
    }
  }, [flowSidebarOpen])

  const handleRename = useCallback((name: string) => {
    setFlowName(name)
    markDirty()
  }, [markDirty])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const topBar = (
    <div
      className={cn(
        'flex select-none items-center gap-2 text-sm',
        embedded ? 'h-full min-h-0 w-full max-h-8 min-w-0 flex-1 pl-1' : 'h-9 w-full shrink-0 border-b border-border pl-2 pr-0'
      )}
      style={
        {
          WebkitAppRegion: 'drag',
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as CSSProperties
      }
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={embedded ? 'link' : 'ghost'}
              size="icon"
              className={cn('shrink-0', embedded ? 'h-[25px] w-[25px] rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0' : 'size-8')}
              aria-label={flowSidebarOpen ? t('devPipelines.hidePipelineList') : t('devPipelines.showPipelineList')}
              aria-pressed={flowSidebarOpen}
              onClick={toggleSidebar}
            >
              {flowSidebarOpen ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeft className="size-4" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{flowSidebarOpen ? t('devPipelines.hidePipelineList') : t('devPipelines.showPipelineList')}</TooltipContent>
        </Tooltip>
        {!embedded ? (
          <>
            <Rocket className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate font-semibold">{t('devPipelines.title')}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">{t('devPipelines.subtitle')}</span>
          </>
        ) : null}
      </div>
      {selectedId && activeFlowName ? (
        <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <DevPipelineActiveBar
            flowName={activeFlowName}
            running={barRunning}
            lastRunStatus={lastRunStatus}
            saveState={saveState}
            onRename={handleRename}
            onRun={() => void handleRun()}
            onCancelRun={() => void handleCancelRun()}
          />
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 self-stretch" style={{ WebkitAppRegion: 'drag' } as CSSProperties} aria-hidden />
      {!embedded ? (
        <div className="flex h-full shrink-0 items-center" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          {canOpenDevPipelinesEmbedded() ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={() => window.api.devPipelines.requestDock()}
                  aria-label={t('devPipelines.dock')}
                >
                  <SquareArrowOutDownLeft strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('devPipelines.dock')}</TooltipContent>
            </Tooltip>
          ) : null}
          <button type="button" onClick={() => handleWindow('minimize')} className="flex h-full w-10 items-center justify-center hover:bg-white/10" aria-label="minimize">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="flex h-full w-10 items-center justify-center hover:bg-white/10" aria-label="maximize">
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => window.api.devPipelines.closeWindow()}
            className="flex h-full w-10 items-center justify-center hover:bg-red-600 hover:text-white"
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className={cn('flex w-full flex-col overflow-hidden bg-background', embedded ? 'h-full min-h-0' : 'h-screen')}>
      {embedded && portal.host ? createPortal(topBar, portal.host) : null}
      {!embedded ? topBar : null}
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={initialPanelLayout}
        onLayoutChanged={layout => {
          const sidebar = layout['dev-pipeline-sidebar']
          if (typeof sidebar === 'number') {
            setFlowSidebarOpen(sidebar > 0.5)
            try {
              localStorage.setItem(SIDEBAR_SIZE_KEY, String(sidebar))
            } catch {
              /* ignore */
            }
          }
        }}
      >
        <ResizablePanel
          ref={sidebarPanelRef}
          id="dev-pipeline-sidebar"
          minSize={`${SIDEBAR_MIN_PERCENT}%`}
          maxSize={`${SIDEBAR_MAX_PERCENT}%`}
          collapsible
          collapsedSize="0%"
          className="flex min-h-0 flex-col"
        >
          <DevPipelineSidebar
            tab={sidebarTab}
            onTabChange={setSidebarTab}
            flows={flows}
            loadingList={loadingList}
            selectedId={selectedId}
            search={search}
            onSearchChange={setSearch}
            onSelect={id => void trySelect(id)}
            onDelete={requestDelete}
            onNew={() => setNewOpen(true)}
            onClickTemplate={(id, kind) => addFromTemplateFnRef.current(id, kind)}
          />
        </ResizablePanel>
        <ResizableHandle showGrip={false} className="z-20 bg-transparent after:w-2" />
        <ResizablePanel id="dev-pipeline-canvas" minSize="35%" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ReactFlowProvider>
            <DevPipelinesEditorInner
              flow={flowDetail}
              flowName={flowName}
              loading={detailLoading}
              onDirty={markDirty}
              onRegisterSave={registerSave}
              onRegisterAddFromTemplate={registerAddFromTemplate}
              activeRunId={currentRunId}
              running={running}
              onStartRun={startRun}
            />
          </ReactFlowProvider>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t('devPipelines.newPipelineTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('devPipelines.newPipelineHint')}</p>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('devPipelines.pipelineNamePlaceholder')} className="mt-2" />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleNew()} disabled={!newName.trim()}>
              {t('devPipelines.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={o => {
          if (!o) setDeleteTargetId(null)
          setDeleteOpen(o)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('devPipelines.deletePipeline')}</AlertDialogTitle>
            <AlertDialogDescription>{t('devPipelines.deleteConfirm', { name: deleteTargetName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDelete()}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
