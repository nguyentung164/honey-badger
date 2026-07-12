'use client'

import {
  type Connection,
  type Edge,
  MiniMap,
  type Node,
  type NodeProps,
  NodeToolbar,
  type NodeTypes,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleHelp,
  Clock,
  Download,
  Eye,
  FileStack,
  Files,
  FileUp,
  Focus,
  GalleryHorizontal,
  GalleryVertical,
  Group,
  LayoutList,
  ListChecks,
  Loader2,
  Orbit,
  Play,
  PlayCircle,
  Plus,
  Redo2,
  Route,
  Search,
  Settings2,
  SquareMousePointer,
  StickyNote,
  Trash2,
  Undo2,
  Ungroup,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { type CSSProperties, createContext, type MouseEvent, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FLOW_UNREACHABLE_IN_SCOPE_PREFIX, isFlowUnreachableWarning } from 'shared/automation/flowPageSequence'
import { isFlowStartPageScopeWarning } from 'shared/automation/flowRunScope'
import { hasTerminalPageMapStatus } from 'shared/automation/pageMapRunStatus'
import { caseCodeToSpecStem, parseSpecRelPathFromReporterLine, specRelPathToStem } from 'shared/automation/reporterSpecPath'
import type {
  PageMapLastRunStatus,
  RunScopeResolution,
  TestCase,
  TestCatalogGroup,
  TestCatalogPage,
  TestPageMapAnnotation,
  TestPageNavEdge,
  TestProject,
} from 'shared/automation/types'
import { createDebouncedPersist } from 'shared/debouncedPersist'
import { getNodesSizedForAutoLayout } from 'shared/flowCanvasAutoLayout'
import { FLOW_DEFAULT_EDGE_OPTIONS, FLOW_DELETE_KEY_CODE, FLOW_PAN_ON_DRAG, FLOW_PRO_OPTIONS } from 'shared/flowCanvasDefaults'
import { FLOW_CANVAS_MAX_ZOOM, FLOW_CANVAS_MIN_ZOOM, flowCanvasColorMode } from 'shared/flowCanvasZoom'
import type { FlowConnectionStyle, FlowEdgeHandleSide, FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { connectionStrokeWidthPx, dashArrayForKind, edgeHandleIds, mergeConnectionStyle, mergeNodeVisualStyle, stringifyConnectionStyle } from 'shared/flowDiagramStyle'
import { flowDiagramArrowMarkerEnd, flowDiagramArrowMarkerStart } from 'shared/flowEdgeMarkers'
import { runOrderFanPlacementForEdge } from 'shared/flowEdgeRunOrderLayout'
import {
  assignRunOrderForNewEdge,
  FLOW_CYCLE_ERROR,
  type FlowExecEdge,
  normalizeAllRunOrders,
  normalizeRunOrdersForSource,
  resolvedRunOrderByEdgeId,
  swapRunOrderForEdge,
} from 'shared/flowExecution'
import { clearBoardContentDefaults, pickContentDefaultsFromVisual, readBoardContentDefaults, writeBoardContentDefaults } from 'shared/flowNodeBoardDefaults'
import { resolveFlowNodeContentLayout } from 'shared/flowNodeContentLayout'
import {
  mergePageMapAnnotationStyle,
  PAGE_MAP_ANNOTATION_DEFAULT_H,
  PAGE_MAP_ANNOTATION_DEFAULT_W,
  PAGE_MAP_ANNOTATION_MIN_H,
  PAGE_MAP_ANNOTATION_MIN_W,
} from 'shared/pageMapAnnotationStyle'
import { FlowCanvasBackground } from '@/components/flow-inspector/FlowCanvasBackground'
import { FlowCanvasNodeSelectionProvider } from '@/components/flow-inspector/FlowCanvasNodeSelectionContext'
import { FlowConnectionPropertiesPanel } from '@/components/flow-inspector/FlowConnectionPropertiesPanel'
import { FlowEdgeActionsContext } from '@/components/flow-inspector/FlowEdgeActionsContext'
import { FlowNodeActionsContext, useFlowNodeActions } from '@/components/flow-inspector/FlowNodeActionsContext'
import { FlowNodeContentLayout } from '@/components/flow-inspector/FlowNodeContentLayout'
import { FlowNodeMetadataRows } from '@/components/flow-inspector/FlowNodeMetadataRows'
import { FlowNodeVisualConfigPanel } from '@/components/flow-inspector/FlowNodeVisualConfigPanel'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import { flowNodeContentLayoutShellClasses, shouldShowInlineBadge } from '@/components/flow-inspector/flowNodeContentLayoutUi'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import { NodeStatusIndicator, type NodeStatusIndicatorStatus } from '@/components/flow-inspector/NodeStatusIndicator'
import { ensureNodeAnimStyles } from '@/components/flow-inspector/nodeAnimStyles'
import { FlowNodeDiagramIcon } from '@/components/flow-inspector/nodeIconUtils'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { CatalogGroupNode } from '@/pages/automation/map/CatalogGroupNode'
import { PageMapBottomBar } from '@/pages/automation/map/PageMapActionBar'
import { PageMapAnnotationConfigPanel, type PageMapAnnotationDraft } from '@/pages/automation/map/PageMapAnnotationConfigPanel'
import { PageMapAnnotationNode } from '@/pages/automation/map/PageMapAnnotationNode'
import { PageMapActionsContext } from '@/pages/automation/map/pageMapActionsContext'
import { logPageMapAutosave } from '@/pages/automation/map/pageMapAutosaveDebug'
import {
  flushDebouncedPageMapPersists,
  resetPageMapSaveState,
  scheduleDebouncedPageMapPersist,
  trackPageMapPersist,
  trackPageMapPersistAll,
} from '@/pages/automation/map/pageMapAutosaveStore'
import { buildCatalogPagesCsv, downloadTextFile, parseCatalogPagesCsv } from '@/pages/automation/map/pageMapCsvExport'
import {
  buildPageMapNodes,
  type CatalogGroupNodeData,
  PAGE_MAP_GROUP_DEFAULT_H,
  PAGE_MAP_GROUP_DEFAULT_W,
  PAGE_MAP_GROUP_INNER_PAD,
  PAGE_MAP_GROUP_TITLE_RESERVE,
  type PageMapActionsValue,
  type PageMapNodeStatus,
  pageIdsWithCasesInScope,
  resolveSmallestIntersectingCatalogGroupId,
} from '@/pages/automation/map/pageMapGraph'
import { mergePageMapEdges, mergePageMapNodes } from '@/pages/automation/map/pageMapGraphSync'
import { pagesNeedingGroupAssignment } from '@/pages/automation/map/pageMapGroupAssign'
import {
  type CatalogMapLayoutAlgo,
  type CatalogMapLayoutScope,
  computeCatalogPageMapLayout,
  isValidCatalogSlug,
  mapPool,
  planCatalogGroupChildLayout,
} from '@/pages/automation/map/pageMapLayout'
import { pageMapMiniMapNodeColor, pageMapMiniMapNodeStrokeColor } from '@/pages/automation/map/pageMapMinimap'
import {
  PAGE_MAP_PATH_HIGHLIGHT_COLOR,
  PAGE_MAP_PATH_HIGHLIGHT_EDGE_STYLE,
  PAGE_MAP_PATH_HIGHLIGHT_RUNNING_COLOR,
  PAGE_MAP_PATH_HIGHLIGHT_RUNNING_EDGE_STYLE,
} from '@/pages/automation/map/pageMapPathHighlight'
import { RunDialog } from '@/pages/automation/runs/RunDialog'
import { automationEmptyCases, useAutomationStore } from '@/stores/useAutomationStore'

export type { PageMapNodeStatus } from '@/pages/automation/map/pageMapGraph'

type CatalogPageNodeData = {
  label: string
  hint: string
  status: PageMapNodeStatus
  statusLabel: string
  /** Số test case trên trang (baseline; khi có selection trên map có thể khớp scope). */
  panelTestCount: number
  panelLinksLine?: string
  panelUpdatedLine?: string
  /** Slug dạng hiển thị, có / đầu chuỗi nếu cần. */
  panelSlugLine?: string
  diagramVisual?: FlowNodeVisualStyle
  inGroup: boolean
  executionDisabled?: boolean
}

const statusBadgeClass: Record<PageMapNodeStatus, string> = {
  idle: 'border-transparent bg-muted text-muted-foreground',
  queued: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  running: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200',
  done: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
  cancelled: 'border-muted-foreground/40 bg-muted text-muted-foreground',
}

const statusBadgeIcon: Record<PageMapNodeStatus, LucideIcon> = {
  idle: Circle,
  queued: Clock,
  running: Loader2,
  done: CheckCircle2,
  error: XCircle,
  cancelled: Ban,
}

type PageMapNodePanelValue = {
  isPanelOpen: (pageId: string) => boolean
  togglePanel: (pageId: string) => void
}

const PageMapNodePanelContext = createContext<PageMapNodePanelValue | null>(null)

const NODE_TOOLBAR_HOVER_LEAVE_MS = 200
ensureNodeAnimStyles()

const CatalogPageNodeToolbar = memo(function CatalogPageNodeToolbar({
  pageId,
  executionDisabled,
  isVisible,
  onToolbarPointerEnter,
  onToolbarPointerLeave,
}: {
  pageId: string
  executionDisabled?: boolean
  isVisible: boolean
  onToolbarPointerEnter: () => void
  onToolbarPointerLeave: () => void
}) {
  const ctx = useContext(PageMapActionsContext)
  const nodeInspector = useFlowNodeActions()
  const { t } = useTranslation()
  if (!ctx) return null
  return (
    <NodeToolbar nodeId={pageId} position={Position.Top} offset={10} align="center" isVisible={isVisible} className="nodrag nopan">
      <div
        role="toolbar"
        aria-label={t('automation.pageMap.nodeToolbarAria')}
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
          title={t('automation.pageMap.runThisPage')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.runThisPage(pageId)
          }}
        >
          <Play className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={ctx.runBusy}
          title={t('automation.pageMap.runFlow')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.runFlowFromPage(pageId)
          }}
        >
          <Route className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            'nodrag nopan size-7',
            executionDisabled ? 'text-amber-600 hover:bg-amber-500/15 dark:text-amber-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          title={t('flowInspector.executionDisabled')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.togglePageExecutionDisabled(pageId)
          }}
        >
          <Ban className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={ctx.pageActionBusy}
          title={t('automation.pageMap.duplicateDeep')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.duplicatePage(pageId)
          }}
        >
          <Files className="size-3.5" />
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
              nodeInspector.openInspector(pageId)
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
          title={t('automation.pageMap.deletePage')}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            ctx.requestDeletePage(pageId)
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </NodeToolbar>
  )
})

const CatalogPageNode = memo(function CatalogPageNode({ id, data, selected }: NodeProps) {
  const d = data as CatalogPageNodeData
  const panelCtx = useContext(PageMapNodePanelContext)
  const mapActions = useContext(PageMapActionsContext)
  const { t } = useTranslation()
  const panelOpen = panelCtx?.isPanelOpen(id) ?? false
  const StatusIcon = statusBadgeIcon[d.status]
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
  const accentForIcon = { color: shellVisual.iconColor } satisfies CSSProperties
  const contentLayout = resolveFlowNodeContentLayout(d.diagramVisual, 'catalogPage')
  const shellClasses = flowNodeContentLayoutShellClasses(contentLayout.contentLayout, contentLayout.contentDensity)
  const showBadge = shouldShowInlineBadge(contentLayout.contentLayout)

  const metadataPanel = panelCtx ? (
    <FlowNodeMetadataRows
      rows={[
        {
          label: t('automation.pageMap.nodePanelRowTests'),
          value: t('automation.pageMap.nodePanelTestCount', { count: d.panelTestCount }),
        },
        ...(d.panelLinksLine ? [{ label: t('automation.pageMap.nodePanelRowLinks'), value: d.panelLinksLine, title: d.panelLinksLine }] : []),
        ...(d.panelUpdatedLine ? [{ label: t('automation.pageMap.nodePanelRowSaved'), value: d.panelUpdatedLine }] : []),
        ...(d.panelSlugLine
          ? [
            {
              label: t('automation.pageMap.nodePanelRowSlug'),
              value: d.panelSlugLine,
              title: d.panelSlugLine,
              valueClassName: 'font-mono text-[7.5px] text-foreground/90',
            },
          ]
          : []),
      ]}
      emptyMessage={d.panelTestCount === 0 && !d.panelLinksLine && !d.panelUpdatedLine && !d.panelSlugLine ? t('automation.pageMap.nodePanelEmpty') : undefined}
    />
  ) : null

  const metadataToggle = panelCtx ? (
    <button
      type="button"
      className="nodrag nopan relative z-[2] flex w-full items-center justify-center border-t border-border/40 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
      aria-expanded={panelOpen}
      title={t('automation.pageMap.toggleTestInfo')}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onClick={e => {
        e.stopPropagation()
        panelCtx.togglePanel(id)
      }}
    >
      <ChevronDown className={cn('size-3 shrink-0 transition-transform duration-200', panelOpen && 'rotate-180')} aria-hidden />
    </button>
  ) : null

  return (
    <>
      <CatalogPageNodeToolbar
        pageId={id}
        executionDisabled={d.executionDisabled}
        isVisible={toolbarHover}
        onToolbarPointerEnter={showToolbar}
        onToolbarPointerLeave={hideToolbarSoon}
      />
      <NodeStatusIndicator status={pageStatusToIndicator(d.status)} className="w-fit max-w-full">
        <FlowNodeVisualShell
          diagramVisual={d.diagramVisual}
          selected={selected}
          executionDisabled={d.executionDisabled}
          cardClassName={shellClasses.cardClassName}
          innerClassName={shellClasses.innerClassName}
          onPointerEnter={showToolbar}
          onPointerLeave={hideToolbarSoon}
        >
          <FlowNodeContentLayout
            layout={contentLayout.contentLayout}
            density={contentLayout.contentDensity}
            metadataMode={contentLayout.metadataMode}
            context="catalogPage"
            metadataExpanded={panelOpen}
            slots={{
              icon: d.diagramVisual?.iconKey ? <FlowNodeDiagramIcon iconKey={d.diagramVisual.iconKey} className="size-3" style={accentForIcon} /> : undefined,
              title: d.label,
              statusBadge: showBadge ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'box-border flex h-4 max-w-[min(100%,5.5rem)] shrink-0 items-center justify-center gap-0.5 rounded-sm border px-1.5 !py-0 text-[8px] font-semibold uppercase !leading-none tracking-tighter',
                    '[&>svg]:pointer-events-none [&>svg]:!size-2 [&>svg]:shrink-0',
                    statusBadgeClass[d.status]
                  )}
                >
                  <StatusIcon className={cn('shrink-0', d.status === 'running' && 'animate-spin')} aria-hidden />
                  <span className="min-w-0 truncate leading-none">{d.statusLabel}</span>
                </Badge>
              ) : undefined,
              metadata: metadataPanel,
              metadataToggle,
              trailing: d.inGroup ? (
                <button
                  type="button"
                  className="nodrag nopan inline-flex size-3 shrink-0 cursor-pointer items-center justify-center text-muted-foreground/85 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&>svg]:pointer-events-none [&>svg]:shrink-0"
                  title={t('flowInspector.ungroupFromBadgeHint')}
                  aria-label={t('automation.pageMap.removeFromGroup')}
                  disabled={mapActions?.removeFromGroupBusy}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    mapActions?.removePagesFromGroup([id])
                  }}
                >
                  <Group className="size-2.5" aria-hidden />
                </button>
              ) : undefined,
            }}
          />
        </FlowNodeVisualShell>
      </NodeStatusIndicator>
    </>
  )
})

function pageStatusToIndicator(status: PageMapNodeStatus): NodeStatusIndicatorStatus {
  if (status === 'running' || status === 'queued') return 'loading'
  if (status === 'done') return 'success'
  if (status === 'error') return 'error'
  return 'initial'
}

function mapPageStatusForDisplay(pageStatus: Record<string, PageMapNodeStatus>, showPreviousRunStatus: boolean): Record<string, PageMapNodeStatus> {
  if (showPreviousRunStatus) return pageStatus
  let changed = false
  const next: Record<string, PageMapNodeStatus> = {}
  for (const [id, status] of Object.entries(pageStatus)) {
    if (status === 'done' || status === 'error' || status === 'cancelled') {
      next[id] = 'idle'
      changed = true
    } else {
      next[id] = status
    }
  }
  return changed ? next : pageStatus
}

function hasPreviousRunStatus(pageStatus: Record<string, PageMapNodeStatus>): boolean {
  return hasTerminalPageMapStatus(pageStatus)
}

/** Merge DB snapshot without clobbering in-flight or not-yet-persisted terminal statuses. */
function mergeDbPageStatus(prev: Record<string, PageMapNodeStatus>, fromDb: Record<string, PageMapNodeStatus>): Record<string, PageMapNodeStatus> {
  const next = { ...fromDb }
  for (const [id, status] of Object.entries(prev)) {
    if (status === 'queued' || status === 'running') next[id] = status
    else if ((status === 'done' || status === 'error' || status === 'cancelled') && !fromDb[id]) next[id] = status
  }
  return next
}

const nodeTypes: NodeTypes = { catalogPage: CatalogPageNode, catalogGroup: CatalogGroupNode, mapAnnotation: PageMapAnnotationNode }

const edgeTypes = { labeled: StyledFlowEdge }

type PageMapLegendRow = { id: string; Icon: LucideIcon; labelKey: string; descKey: string }

const HELP_LEGEND_SECTIONS: Array<{ id: string; sectionKey: string; rows: PageMapLegendRow[] }> = [
  {
    id: 'view',
    sectionKey: 'automation.pageMap.actionBarSectionView',
    rows: [{ id: 'mini', Icon: Eye, labelKey: 'automation.pageMap.showMinimap', descKey: 'automation.pageMap.helpLegendMinimap' }],
  },
  {
    id: 'selection',
    sectionKey: 'automation.pageMap.actionBarSectionSelection',
    rows: [
      { id: 'pathHi', Icon: Route, labelKey: 'automation.pageMap.pathHighlight', descKey: 'automation.pageMap.helpLegendPathHighlightTwo' },
      { id: 'selectAll', Icon: ListChecks, labelKey: 'automation.pageMap.selectAllPages', descKey: 'automation.pageMap.helpLegendSelectAll' },
      { id: 'clear', Icon: SquareMousePointer, labelKey: 'automation.pageMap.clearSelection', descKey: 'automation.pageMap.helpLegendClear' },
      { id: 'assignGrp', Icon: Group, labelKey: 'automation.pageMap.assignToGroup', descKey: 'automation.pageMap.helpLegendAssignToGroup' },
      { id: 'rmGrp', Icon: Ungroup, labelKey: 'automation.pageMap.removeFromGroup', descKey: 'automation.pageMap.helpLegendRemoveFromGroup' },
    ],
  },
  {
    id: 'groups',
    sectionKey: 'automation.pageMap.actionBarSectionGroups',
    rows: [
      { id: 'addGrp', Icon: Group, labelKey: 'automation.pageMap.addGroup', descKey: 'automation.pageMap.helpLegendAddGroup' },
      { id: 'runGrp', Icon: PlayCircle, labelKey: 'automation.pageMap.runThisGroup', descKey: 'automation.pageMap.helpLegendRunThisGroup' },
      { id: 'openGrpCases', Icon: FileStack, labelKey: 'automation.pageMap.openCasesInGroup', descKey: 'automation.pageMap.helpLegendOpenCasesInGroup' },
    ],
  },
  {
    id: 'run',
    sectionKey: 'automation.pageMap.verticalBarGroupRun',
    rows: [
      { id: 'runSel', Icon: Play, labelKey: 'automation.pageMap.runSelected', descKey: 'automation.pageMap.helpLegendRunSelected' },
      { id: 'runAll', Icon: PlayCircle, labelKey: 'automation.pageMap.runAllPages', descKey: 'automation.pageMap.helpLegendRunAll' },
      {
        id: 'showLastRunStatus',
        Icon: BadgeCheck,
        labelKey: 'automation.pageMap.showLastRunStatus',
        descKey: 'automation.pageMap.helpLegendShowLastRunStatus',
      },
    ],
  },
  {
    id: 'layout',
    sectionKey: 'automation.pageMap.actionBarSectionLayout',
    rows: [
      { id: 'fit', Icon: Focus, labelKey: 'automation.pageMap.fitView', descKey: 'automation.pageMap.helpLegendFit' },
      { id: 'zoomIn', Icon: ZoomIn, labelKey: 'automation.pageMap.zoomIn', descKey: 'automation.pageMap.helpLegendZoomIn' },
      { id: 'zoomOut', Icon: ZoomOut, labelKey: 'automation.pageMap.zoomOut', descKey: 'automation.pageMap.helpLegendZoomOut' },
      { id: 'undo', Icon: Undo2, labelKey: 'automation.pageMap.undoLayout', descKey: 'automation.pageMap.helpLegendUndo' },
      { id: 'redo', Icon: Redo2, labelKey: 'automation.pageMap.redoLayout', descKey: 'automation.pageMap.helpLegendRedo' },
      { id: 'layoutV', Icon: GalleryVertical, labelKey: 'automation.pageMap.layoutAlgoVertical', descKey: 'automation.pageMap.helpLegendAutoLayout' },
      { id: 'layoutH', Icon: GalleryHorizontal, labelKey: 'automation.pageMap.layoutAlgoHorizontal', descKey: 'automation.pageMap.helpLegendAutoLayout' },
      { id: 'layoutR', Icon: Orbit, labelKey: 'automation.pageMap.layoutAlgoRadial', descKey: 'automation.pageMap.helpLegendAutoLayout' },
      { id: 'nodeLayout', Icon: LayoutList, labelKey: 'flowInspector.contentLayoutTitle', descKey: 'automation.pageMap.helpLegendNodeContentLayout' },
    ],
  },
  {
    id: 'action',
    sectionKey: 'automation.pageMap.actionBarSectionAction',
    rows: [
      { id: 'add', Icon: Plus, labelKey: 'automation.pageMap.addPage', descKey: 'automation.pageMap.helpLegendAdd' },
      { id: 'addNote', Icon: StickyNote, labelKey: 'automation.pageMap.addAnnotation', descKey: 'automation.pageMap.helpLegendAddAnnotation' },
      { id: 'import', Icon: FileUp, labelKey: 'automation.pageMap.importMenu', descKey: 'automation.pageMap.helpLegendImportMenu' },
      { id: 'export', Icon: Download, labelKey: 'automation.pageMap.exportMenu', descKey: 'automation.pageMap.helpLegendExportMenu' },
      { id: 'help', Icon: CircleHelp, labelKey: 'automation.pageMap.help', descKey: 'automation.pageMap.helpLegendHelpMore' },
      { id: 'search', Icon: Search, labelKey: 'automation.pageMap.searchPagesLegend', descKey: 'automation.pageMap.helpLegendSearch' },
      { id: 'focus', Icon: Focus, labelKey: 'automation.pageMap.focusMatch', descKey: 'automation.pageMap.helpLegendFocusMatch' },
    ],
  },
]

function PageMapHelpLegendTable() {
  const { t } = useTranslation()
  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{t('automation.pageMap.helpActionBarTitle')}</h3>
      <div className="max-h-[min(50vh,26rem)] space-y-4 overflow-auto rounded-md border p-3">
        {HELP_LEGEND_SECTIONS.map(section => (
          <div key={section.id} className="space-y-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(section.sectionKey)}</h4>
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full min-w-[min(100%,18rem)] border-collapse text-left text-xs">
                <thead className="border-b bg-muted/60">
                  <tr>
                    <th className="w-12 px-2 py-1.5 font-medium text-muted-foreground">{t('automation.pageMap.helpLegendColIcon')}</th>
                    <th className="min-w-[6.5rem] px-2 py-1.5 font-medium text-muted-foreground">{t('automation.pageMap.helpLegendColControl')}</th>
                    <th className="px-2 py-1.5 font-medium text-muted-foreground">{t('automation.pageMap.helpLegendColDesc')}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map(({ id, Icon, labelKey, descKey }) => (
                    <tr key={id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-2 py-1.5 align-middle">
                        <Icon className="mx-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </td>
                      <td className="px-2 py-1.5 align-top font-medium text-foreground">{t(labelKey)}</td>
                      <td className="px-2 py-1.5 align-top text-muted-foreground">{t(descKey)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function showLastRunStatusStorageKey(projectId: string) {
  return `automation.pageMap.showLastRunStatus.v1.${projectId}`
}

function readShowLastRunStatusPref(projectId: string): boolean {
  try {
    return localStorage.getItem(showLastRunStatusStorageKey(projectId)) !== '0'
  } catch {
    return true
  }
}

function writeShowLastRunStatusPref(projectId: string, visible: boolean): void {
  try {
    localStorage.setItem(showLastRunStatusStorageKey(projectId), visible ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function navToLabeledEdges(nav: TestPageNavEdge[], pathEdgeIds: Set<string>, pathEdgesRunPulse: boolean, onRunOrderChange?: (edgeId: string, next: number) => void): Edge[] {
  const siblingCountBySource = new Map<string, number>()
  for (const e of nav) siblingCountBySource.set(e.sourcePageId, (siblingCountBySource.get(e.sourcePageId) ?? 0) + 1)
  const flowExec: FlowExecEdge[] = nav.map(e => ({
    id: e.id,
    source: e.sourcePageId,
    target: e.targetPageId,
    runOrder: e.runOrder,
  }))
  const resolvedOrder = resolvedRunOrderByEdgeId(flowExec)
  const fanEdges = nav.map(e => ({ id: e.id, source: e.sourcePageId, target: e.targetPageId }))
  const fanByEdgeId = new Map(
    nav.map(e => {
      const fan = runOrderFanPlacementForEdge({ id: e.id, source: e.sourcePageId, target: e.targetPageId }, fanEdges, resolvedOrder)
      return [e.id, fan] as const
    })
  )
  return nav.map(e => {
    const cs = mergeConnectionStyle(e.connectionStyle)
    const lineLabel = e.label ?? cs.label ?? ''
    const hid = edgeHandleIds(cs)
    const onPath = pathEdgeIds.has(e.id)
    const highlightStroke = pathEdgesRunPulse ? PAGE_MAP_PATH_HIGHLIGHT_RUNNING_COLOR : PAGE_MAP_PATH_HIGHLIGHT_COLOR
    const userStyle: CSSProperties = {
      stroke: cs.color,
      strokeWidth: connectionStrokeWidthPx(cs.width),
      strokeDasharray: dashArrayForKind(cs.dash),
    }
    const style: CSSProperties = onPath ? { ...userStyle, ...(pathEdgesRunPulse ? PAGE_MAP_PATH_HIGHLIGHT_RUNNING_EDGE_STYLE : PAGE_MAP_PATH_HIGHLIGHT_EDGE_STYLE) } : userStyle
    return {
      id: e.id,
      type: 'labeled',
      source: e.sourcePageId,
      target: e.targetPageId,
      sourceHandle: hid.sourceHandle,
      targetHandle: hid.targetHandle,
      label: lineLabel || undefined,
      animated: false,
      markerEnd: flowDiagramArrowMarkerEnd(onPath ? highlightStroke : cs.color),
      markerStart: cs.bidirectional ? flowDiagramArrowMarkerStart(onPath ? highlightStroke : cs.color) : undefined,
      style,
      data: {
        label: lineLabel,
        connectionStyle: e.connectionStyle,
        runOrder: resolvedOrder.get(e.id) ?? 1,
        runOrderMax: siblingCountBySource.get(e.sourcePageId) ?? 1,
        runOrderFanMax: fanByEdgeId.get(e.id)?.fanMax ?? 1,
        runOrderFanIndex: fanByEdgeId.get(e.id)?.fanIndex ?? 1,
        runOrderEditable: Boolean(onRunOrderChange),
        onRunOrderChange: onRunOrderChange ? (next: number) => onRunOrderChange(e.id, next) : undefined,
      },
    }
  })
}

type FloatMenu =
  | { kind: 'node'; pageId: string; clientX: number; clientY: number }
  | { kind: 'group'; groupId: string; clientX: number; clientY: number }
  | { kind: 'edge'; edgeId: string; clientX: number; clientY: number }

const UNDO_CAP = 50

function hasFlowCycleWarning(warnings: string[]): boolean {
  return warnings.some(w => w === FLOW_CYCLE_ERROR)
}

function hasFlowStartPageScopeError(warnings: string[]): boolean {
  return warnings.some(isFlowStartPageScopeWarning)
}

function unreachablePagesFromWarnings(warnings: string[]): string[] {
  for (const w of warnings) {
    if (!isFlowUnreachableWarning(w)) continue
    return w
      .slice(FLOW_UNREACHABLE_IN_SCOPE_PREFIX.length)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }
  return []
}

function notifyFlowScopeWarnings(warnings: string[], t: (key: string, opts?: Record<string, string>) => string): void {
  const unreachable = unreachablePagesFromWarnings(warnings)
  if (unreachable.length) {
    toast.info(t('automation.pageMap.flowUnreachablePages', { pages: unreachable.join(', ') }))
  } else if (warnings.some(isFlowUnreachableWarning)) {
    toast.info(t('automation.pageMap.flowUnreachableWarning'))
  }
}

export type PageNavigationMapViewProps = {
  projectId: string
  project: TestProject
  onOpenCasesForPage?: (pageId: string) => void
  onOpenCasesForGroup?: (groupId: string) => void
  onOpenRuns?: () => void
}

export function PageNavigationMapView({ projectId, project, onOpenCasesForPage, onOpenCasesForGroup }: PageNavigationMapViewProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const flowColorMode = flowCanvasColorMode(resolvedTheme)
  const statusLabels = useMemo(
    () => ({
      idle: t('automation.pageMap.status.idle'),
      queued: t('automation.pageMap.status.queued'),
      running: t('automation.pageMap.status.running'),
      done: t('automation.pageMap.status.done'),
      error: t('automation.pageMap.status.error'),
      cancelled: t('automation.pageMap.status.cancelled'),
    }),
    [t]
  )

  const setCases = useAutomationStore(s => s.setCases)
  const current = useAutomationStore(s => s.current)
  const runBusy = current.status === 'running' && current.projectId === projectId
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const pendingDragDiagramRef = useRef<Record<string, { x: number; y: number }>>({})
  const flushPendingDragPositionsRef = useRef<() => Promise<void>>(async () => { })
  const dragPositionPersistRef = useRef(createDebouncedPersist(() => flushPendingDragPositionsRef.current()))
  const [pages, setPages] = useState<TestCatalogPage[]>([])
  const pagesRef = useRef<TestCatalogPage[]>([])
  pagesRef.current = pages
  const [groups, setGroups] = useState<TestCatalogGroup[]>([])
  const [annotations, setAnnotations] = useState<TestPageMapAnnotation[]>([])
  const [groupCaseCounts, setGroupCaseCounts] = useState<Record<string, number>>({})
  const [navEdges, setNavEdges] = useState<TestPageNavEdge[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [scope, setScope] = useState<RunScopeResolution | null>(null)
  const [scopeLoading, setScopeLoading] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  /** Khi mở Run từ context (một page / một group); null = dùng selection hiện tại trên map. */
  const [runIntent, setRunIntent] = useState<{ pageIds: string[]; groupIds: string[] } | null>(null)
  const [runOpenHint, setRunOpenHint] = useState<string | undefined>(undefined)
  const [runOrdered, setRunOrdered] = useState(false)
  const [runStartPageId, setRunStartPageId] = useState<string | undefined>(undefined)
  const [pageStatus, setPageStatus] = useState<Record<string, PageMapNodeStatus>>({})
  const [dbLastRun, setDbLastRun] = useState<PageMapLastRunStatus | null>(null)
  const [showPreviousRunStatus, setShowPreviousRunStatus] = useState(() => readShowLastRunStatusPref(projectId))
  const [baselineCaseCountByPage, setBaselineCaseCountByPage] = useState<Record<string, number>>({})
  const [caseCountByPage, setCaseCountByPage] = useState<Record<string, number>>({})
  const [openTestPanels, setOpenTestPanels] = useState<Set<string>>(() => new Set())
  const runScopePageIdsRef = useRef<string[]>([])
  const stemToCaseIdRef = useRef<Map<string, string>>(new Map())
  const caseIdToPageIdRef = useRef<Map<string, string>>(new Map())
  const prevTallyRef = useRef({ passed: 0, failed: 0, skipped: 0 })
  const trackedRunIdRef = useRef<string | null>(null)
  const runOrderedRef = useRef(false)
  const lastActivePageRef = useRef<string | null>(null)

  const [pathEdgeIds, setPathEdgeIds] = useState<Set<string>>(() => new Set())
  const [floatMenu, setFloatMenu] = useState<FloatMenu | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [canvasLocked, setCanvasLocked] = useState(false)

  const undoStack = useRef<Array<Record<string, { x: number; y: number }>>>([])
  const redoStack = useRef<Array<Record<string, { x: number; y: number }>>>([])
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [redoAvailable, setRedoAvailable] = useState(false)
  const dragPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const flowWrapRef = useRef<HTMLDivElement | null>(null)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addSlug, setAddSlug] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [addGroupName, setAddGroupName] = useState('')
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null)

  const [editPageOpen, setEditPageOpen] = useState(false)
  const [editPageName, setEditPageName] = useState('')
  const [editPageSlug, setEditPageSlug] = useState('')
  const [editPageDesc, setEditPageDesc] = useState('')
  const [ctxPageId, setCtxPageId] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)

  type FlowInspectorState = null | { kind: 'edge'; id: string } | { kind: 'node'; ids: string[] } | { kind: 'group'; ids: string[] } | { kind: 'annotation'; id: string }
  const [flowInspector, setFlowInspector] = useState<FlowInspectorState>(null)
  const [edgeDraft, setEdgeDraft] = useState<FlowConnectionStyle>(() => mergeConnectionStyle())
  const [edgeRunOrderDraft, setEdgeRunOrderDraft] = useState(1)
  const [executionDisabledDraft, setExecutionDisabledDraft] = useState(false)
  const [nodeVisualDraft, setNodeVisualDraft] = useState<FlowNodeVisualStyle>(() => mergeNodeVisualStyle())
  const [nodeNameDraft, setNodeNameDraft] = useState('')
  const [boardLayoutDefaultChecked, setBoardLayoutDefaultChecked] = useState(false)
  const [hasBoardLayoutDefault, setHasBoardLayoutDefault] = useState(() => Boolean(readBoardContentDefaults('pageMap')))
  const [applyLayoutAllConfirmOpen, setApplyLayoutAllConfirmOpen] = useState(false)
  const [groupSizeDraft, setGroupSizeDraft] = useState({ w: PAGE_MAP_GROUP_DEFAULT_W, h: PAGE_MAP_GROUP_DEFAULT_H })
  const [annotationDraft, setAnnotationDraft] = useState<PageMapAnnotationDraft>(() => ({
    content: '',
    labelNumber: 1,
    width: PAGE_MAP_ANNOTATION_DEFAULT_W,
    height: PAGE_MAP_ANNOTATION_DEFAULT_H,
    style: mergePageMapAnnotationStyle(),
  }))

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

  const [helpOpen, setHelpOpen] = useState(false)
  const PAGE_MAP_MINIMAP_LS = 'automation.pageMap.miniMapVisible.v1'
  const [miniMapVisible, setMiniMapVisible] = useState(() => {
    try {
      return localStorage.getItem(PAGE_MAP_MINIMAP_LS) !== '0'
    } catch {
      return true
    }
  })

  const setMiniMapVisiblePersist = useCallback((visible: boolean) => {
    setMiniMapVisible(visible)
    try {
      localStorage.setItem(PAGE_MAP_MINIMAP_LS, visible ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const ctxPage = useMemo(() => (ctxPageId ? pages.find(p => p.id === ctxPageId) : undefined), [ctxPageId, pages])
  const pendingDeleteGroup = useMemo(() => (deleteGroupTarget ? groups.find(g => g.id === deleteGroupTarget) : undefined), [deleteGroupTarget, groups])
  const floatMenuGroupRec = useMemo(() => (floatMenu?.kind === 'group' ? groups.find(g => g.id === floatMenu.groupId) : undefined), [floatMenu, groups])

  const displayCaseCountByPage = useMemo(() => {
    if (Object.keys(caseCountByPage).length === 0) return baselineCaseCountByPage
    return { ...baselineCaseCountByPage, ...caseCountByPage }
  }, [baselineCaseCountByPage, caseCountByPage])

  const toggleTestPanel = useCallback((pageId: string) => {
    setOpenTestPanels(prev => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }, [])

  const isTestPanelOpen = useCallback((pageId: string) => openTestPanels.has(pageId), [openTestPanels])

  const nodePanelValue = useMemo<PageMapNodePanelValue>(
    () => ({
      isPanelOpen: isTestPanelOpen,
      togglePanel: toggleTestPanel,
    }),
    [isTestPanelOpen, toggleTestPanel]
  )

  const pushUndoPositions = useCallback((snapshot: Record<string, { x: number; y: number }>) => {
    redoStack.current = []
    setRedoAvailable(false)
    undoStack.current.push(snapshot)
    if (undoStack.current.length > UNDO_CAP) undoStack.current.shift()
    setUndoAvailable(true)
  }, [])

  const capturePositions = useCallback((nds: Node[]) => {
    const m: Record<string, { x: number; y: number }> = {}
    for (const n of nds) m[n.id] = { x: n.position.x, y: n.position.y }
    return m
  }, [])

  const persistCatalogGroupDiagramSize = useCallback(
    (groupId: string, size: { width: number; height: number }) => {
      const w = Math.max(200, Math.round(size.width))
      const h = Math.max(160, Math.round(size.height))
      scheduleDebouncedPageMapPersist(`group-size:${groupId}`, async () => {
        const res = await window.api.automation.catalogGroup.update({ id: groupId, patch: { diagramWidth: w, diagramHeight: h } })
        if (res.status !== 'success') {
          toast.error(res.message ?? t('devPipelines.saveError'))
          return res
        }
        setGroups(gs => gs.map(g => (g.id === groupId ? { ...g, diagramWidth: w, diagramHeight: h } : g)))
        setNodes(nds => nds.map(n => (n.id === groupId && n.type === 'catalogGroup' ? { ...n, style: { ...n.style, width: w, height: h } } : n)))
        return res
      })
    },
    [t, setNodes]
  )

  const persistAnnotationContent = useCallback(
    (id: string, content: string) => {
      setAnnotations(prev => prev.map(a => (a.id === id ? { ...a, content } : a)))
      scheduleDebouncedPageMapPersist(`annotation-content:${id}`, async () => {
        const res = await window.api.automation.mapAnnotation.update({ id, patch: { content } })
        if (res.status !== 'success') toast.error(res.message ?? t('devPipelines.saveError'))
        return res
      })
    },
    [t]
  )

  const persistAnnotationDiagramSize = useCallback(
    (annotationId: string, size: { width: number; minHeight: number; nodeHeight?: number }) => {
      const w = Math.max(PAGE_MAP_ANNOTATION_MIN_W, Math.round(size.width))
      const h = Math.max(PAGE_MAP_ANNOTATION_MIN_H, Math.round(size.minHeight))
      const nextNodeHeight = size.nodeHeight != null ? Math.max(PAGE_MAP_ANNOTATION_MIN_H, Math.round(size.nodeHeight)) : undefined
      scheduleDebouncedPageMapPersist(`annotation-size:${annotationId}`, async () => {
        const res = await window.api.automation.mapAnnotation.update({ id: annotationId, patch: { diagramWidth: w, diagramHeight: h } })
        if (res.status !== 'success') {
          toast.error(res.message ?? t('devPipelines.saveError'))
          return res
        }
        setAnnotations(prev => prev.map(a => (a.id === annotationId ? { ...a, diagramWidth: w, diagramHeight: h } : a)))
        setNodes(nds =>
          nds.map(n =>
            n.id === annotationId && n.type === 'mapAnnotation'
              ? {
                ...n,
                style: { ...n.style, width: w, height: nextNodeHeight },
                data: { ...n.data, minHeight: h },
              }
              : n
          )
        )
        return res
      })
    },
    [t, setNodes]
  )

  const displayPageStatus = useMemo(() => mapPageStatusForDisplay(pageStatus, showPreviousRunStatus), [pageStatus, showPreviousRunStatus])

  const handleNavEdgeRunOrderChange = useCallback((edgeId: string, next: number) => {
    let swapped: FlowExecEdge[] = []
    let prevResolved = new Map<string, number>()
    setNavEdges(eds => {
      const flowExec = normalizeAllRunOrders(
        eds.map(e => ({
          id: e.id,
          source: e.sourcePageId,
          target: e.targetPageId,
          runOrder: e.runOrder,
        }))
      )
      prevResolved = resolvedRunOrderByEdgeId(flowExec)
      swapped = swapRunOrderForEdge(edgeId, next, flowExec)
      return eds.map(e => {
        const ro = swapped.find(x => x.id === e.id)?.runOrder
        return ro != null && ro !== e.runOrder ? { ...e, runOrder: ro } : e
      })
    })
    void trackPageMapPersist(async () => {
      const updates: ReturnType<typeof window.api.automation.navEdge.update>[] = []
      for (const fe of swapped) {
        const ro = fe.runOrder
        if (ro == null || ro === prevResolved.get(fe.id)) continue
        updates.push(window.api.automation.navEdge.update({ id: fe.id, patch: { runOrder: ro } }))
      }
      if (!updates.length) return { status: 'success' as const }
      const results = await Promise.all(updates)
      const failed = results.find(r => r.status !== 'success')
      return failed ?? results[0] ?? { status: 'success' as const }
    })
  }, [])

  const syncNodesFromState = useCallback(() => {
    if (!pages.length && !groups.length && !annotations.length) return
    setNodes(prev => {
      const built = buildPageMapNodes({
        pages,
        groups,
        annotations,
        groupCaseCounts,
        fallbackHint: t('automation.pageMap.nodeHint'),
        pageCaseCounts: displayCaseCountByPage,
        pageStatus: displayPageStatus,
        statusLabels,
        navEdges,
        t,
      })
      return mergePageMapNodes(prev, built)
    })
    setEdges(prev => mergePageMapEdges(prev, navToLabeledEdges(navEdges, pathEdgeIds, runBusy, handleNavEdgeRunOrderChange)))
  }, [
    pages,
    groups,
    annotations,
    groupCaseCounts,
    displayCaseCountByPage,
    displayPageStatus,
    statusLabels,
    t,
    setNodes,
    setEdges,
    navEdges,
    pathEdgeIds,
    runBusy,
    handleNavEdgeRunOrderChange,
  ])

  const loadPageStatusFromDb = useCallback(async () => {
    const res = await window.api.automation.run.pageMapStatus(projectId)
    if (res.status !== 'success' || !res.data) return
    setDbLastRun(res.data)
    const fromDb = res.data.pageStatus
    setPageStatus(prev => mergeDbPageStatus(prev, fromDb))
  }, [projectId])

  const setShowLastRunStatusVisible = useCallback(
    (visible: boolean) => {
      setShowPreviousRunStatus(visible)
      writeShowLastRunStatusPref(projectId, visible)
    },
    [projectId]
  )

  useEffect(() => {
    setShowPreviousRunStatus(readShowLastRunStatusPref(projectId))
    setDbLastRun(null)
  }, [projectId])

  const loadGraph = useCallback(async () => {
    const [graphRes, edgesRes, countsRes] = await Promise.all([
      window.api.automation.catalogGroup.listGraph(projectId),
      window.api.automation.navEdge.list(projectId),
      window.api.automation.catalogPage.caseCounts(projectId),
    ])
    if (graphRes.status === 'success' && graphRes.data) {
      setPages(graphRes.data.pages)
      setGroups(graphRes.data.groups)
      setAnnotations(graphRes.data.annotations ?? [])
      setGroupCaseCounts(graphRes.data.groupCaseCounts ?? {})
    } else {
      setPages([])
      setGroups([])
      setAnnotations([])
      setGroupCaseCounts({})
    }
    const nav = edgesRes.status === 'success' && edgesRes.data ? edgesRes.data : []
    setNavEdges(nav)
    if (countsRes.status === 'success' && countsRes.data) setBaselineCaseCountByPage(countsRes.data)
    else setBaselineCaseCountByPage({})
    await loadPageStatusFromDb()
  }, [projectId, loadPageStatusFromDb])

  const loadCases = useCallback(async () => {
    const res = await window.api.automation.case.list(projectId)
    if (res.status === 'success' && res.data) {
      setCases(projectId, res.data)
    }
  }, [projectId, setCases])

  useEffect(() => {
    void loadCases()
  }, [loadCases])

  useEffect(() => {
    void loadGraph()
  }, [loadGraph])

  useEffect(() => {
    const off = window.api.automation.onRunStream(event => {
      if (event.kind === 'persisted' && event.projectId === projectId) {
        void loadPageStatusFromDb()
      }
    })
    return off
  }, [projectId, loadPageStatusFromDb])

  useEffect(() => {
    syncNodesFromState()
  }, [syncNodesFromState])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFloatMenu(null)
        setFlowInspector(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!floatMenu) return
    const close = () => setFloatMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [floatMenu])

  useEffect(() => {
    if (!flowInspector) return
    if (flowInspector.kind === 'edge') {
      const ne = navEdges.find(x => x.id === flowInspector.id)
      const m = mergeConnectionStyle(ne?.connectionStyle)
      if (typeof ne?.label === 'string') m.label = ne.label
      setEdgeDraft(m)
      setEdgeRunOrderDraft(
        resolvedRunOrderByEdgeId(
          navEdges.map(e => ({
            id: e.id,
            source: e.sourcePageId,
            target: e.targetPageId,
            runOrder: e.runOrder,
          }))
        ).get(flowInspector.id) ?? 1
      )
    } else if (flowInspector.kind === 'node') {
      const firstId = flowInspector.ids[0]
      const p = pages.find(x => x.id === firstId)
      setNodeVisualDraft(mergeNodeVisualStyle(p?.diagramStyle))
      setExecutionDisabledDraft(p?.executionDisabled === true)
      if (flowInspector.ids.length === 1) {
        setNodeNameDraft(p?.name ?? '')
      } else {
        setNodeNameDraft('')
      }
    } else if (flowInspector.kind === 'group') {
      const firstId = flowInspector.ids[0]
      const g = groups.find(x => x.id === firstId)
      setNodeVisualDraft(mergeNodeVisualStyle(g?.diagramStyle))
      if (flowInspector.ids.length === 1) {
        setNodeNameDraft(g?.name ?? '')
        setGroupSizeDraft({
          w: g?.diagramWidth ?? PAGE_MAP_GROUP_DEFAULT_W,
          h: g?.diagramHeight ?? PAGE_MAP_GROUP_DEFAULT_H,
        })
      } else {
        setNodeNameDraft('')
        setGroupSizeDraft({
          w: g?.diagramWidth ?? PAGE_MAP_GROUP_DEFAULT_W,
          h: g?.diagramHeight ?? PAGE_MAP_GROUP_DEFAULT_H,
        })
      }
    } else if (flowInspector.kind === 'annotation') {
      const a = annotations.find(x => x.id === flowInspector.id)
      setAnnotationDraft({
        content: a?.content ?? '',
        labelNumber: a?.labelNumber ?? 1,
        width: a?.diagramWidth ?? PAGE_MAP_ANNOTATION_DEFAULT_W,
        height: a?.diagramHeight ?? PAGE_MAP_ANNOTATION_DEFAULT_H,
        style: mergePageMapAnnotationStyle(a?.style),
      })
    }
  }, [flowInspector, navEdges, pages, groups, annotations])

  const [searchQ, setSearchQ] = useState('')

  const flowEdgeInspectorActions = useMemo(
    () => ({
      openInspector: (id: string) => setFlowInspector({ kind: 'edge', id }),
    }),
    []
  )

  const resolveSelectionScope = useCallback(
    async (selectedNodeIds: string[]) => {
      if (selectedNodeIds.length === 0) {
        setScope(null)
        setCaseCountByPage({})
        return
      }
      setScopeLoading(true)
      try {
        const pageIds = selectedNodeIds.filter(id => pages.some(p => p.id === id))
        const groupIds = selectedNodeIds.filter(id => groups.some(g => g.id === id))
        const res = await window.api.automation.run.resolveScope({ projectId, pageIds, groupIds })
        if (res.status === 'success' && res.data) {
          setScope(res.data)
          setCaseCountByPage(res.data.caseCountByPageId)
        } else {
          setScope(null)
          toast.error(res.message ?? t('automation.pageMap.resolveFailed'))
        }
      } finally {
        setScopeLoading(false)
      }
    },
    [projectId, pages, groups, t]
  )

  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (resolveTimer.current) clearTimeout(resolveTimer.current)
    resolveTimer.current = setTimeout(() => {
      resolveTimer.current = null
      void resolveSelectionScope(selectedIds)
    }, 280)
    return () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current)
    }
  }, [selectedIds, resolveSelectionScope])

  const buildStemMaps = useCallback((resolution: RunScopeResolution, caseList: TestCase[]) => {
    const stemToCaseId = new Map<string, string>()
    const caseIdToPage = new Map<string, string>()
    const byId = new Map(caseList.map(c => [c.id, c]))
    for (const [pid, ids] of Object.entries(resolution.caseIdsByPageId)) {
      for (const cid of ids) {
        caseIdToPage.set(cid, pid)
        const c = byId.get(cid)
        if (c) stemToCaseId.set(caseCodeToSpecStem(c.code), cid)
      }
    }
    stemToCaseIdRef.current = stemToCaseId
    caseIdToPageIdRef.current = caseIdToPage
  }, [])

  const cases = useAutomationStore(s => s.cases[projectId] ?? automationEmptyCases)

  const selectedPageIds = useMemo(() => selectedIds.filter(id => pages.some(p => p.id === id)), [selectedIds, pages])
  const selectedGroupIds = useMemo(() => selectedIds.filter(id => groups.some(g => g.id === id)), [selectedIds, groups])

  const flowNodeInspectorActions = useMemo(
    () => ({
      openInspector: (id: string) => {
        const pageSel = selectedPageIds
        if (pageSel.length > 1 && pageSel.includes(id)) {
          setFlowInspector({ kind: 'node', ids: pageSel })
        } else {
          setFlowInspector({ kind: 'node', ids: [id] })
        }
      },
      openGroupInspector: (id: string) => {
        const groupSel = selectedGroupIds
        if (groupSel.length > 1 && groupSel.includes(id)) {
          setFlowInspector({ kind: 'group', ids: groupSel })
        } else {
          setFlowInspector({ kind: 'group', ids: [id] })
        }
      },
      openAnnotationInspector: (id: string) => setFlowInspector({ kind: 'annotation', id }),
    }),
    [selectedPageIds, selectedGroupIds]
  )

  const removePagesFromGroupByIds = useCallback(
    async (pageIds: string[]) => {
      const inst = rfRef.current
      if (!inst || pageIds.length === 0) return
      const want = new Set(pageIds)
      const targets = pages.filter(p => want.has(p.id) && p.groupId)
      if (!targets.length) {
        toast.info(t('automation.pageMap.removeFromGroupNone'))
        return
      }
      setBusy('removeFromGroup')
      try {
        const reps: { id: string; x: number; y: number }[] = []
        for (const p of targets) {
          const pi = inst.getInternalNode(p.id)
          const abs = pi?.internals?.positionAbsolute
          if (!abs) continue
          reps.push({ id: p.id, x: abs.x, y: abs.y })
        }
        if (!reps.length) {
          toast.error(t('automation.pageMap.removeFromGroupNoLayout'))
          return
        }
        const results = await trackPageMapPersistAll(() =>
          Promise.all(
            reps.map(r =>
              window.api.automation.catalogPage.update({
                id: r.id,
                patch: { groupId: null, diagramX: r.x, diagramY: r.y },
              })
            )
          )
        )
        const bad = results.find(x => x.status !== 'success')
        if (bad) {
          toast.error(bad.message ?? t('devPipelines.saveError'))
          await loadGraph()
          return
        }
        setPages(ps =>
          ps.map(p => {
            const r = reps.find(x => x.id === p.id)
            return r ? { ...p, groupId: null, diagramX: r.x, diagramY: r.y } : p
          })
        )
        setNodes(nds =>
          nds.map(n => {
            const r = reps.find(x => x.id === n.id)
            if (!r) return n
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: { x: r.x, y: r.y },
              data: n.type === 'catalogPage' && n.data && typeof n.data === 'object' ? { ...n.data, inGroup: false } : n.data,
            }
          })
        )
        toast.success(t('automation.pageMap.removeFromGroupDone', { count: reps.length }))
      } finally {
        setBusy(null)
      }
    },
    [pages, loadGraph, t, setPages, setNodes]
  )

  const assignPagesToGroupByIds = useCallback(
    async (pageIds: string[], targetGroupId: string) => {
      const inst = rfRef.current
      if (!inst || pageIds.length === 0 || !targetGroupId) return
      const need = pagesNeedingGroupAssignment(pageIds, pages, targetGroupId)
      if (!need.length) {
        toast.info(t('automation.pageMap.assignToGroupNone'))
        return
      }
      setBusy('assignToGroup')
      try {
        const currentNodes = inst.getNodes()
        const currentEdges = inst.getEdges()
        pushUndoPositions(capturePositions(currentNodes))

        const updatedNodes = currentNodes.map(n => {
          if (!need.includes(n.id)) return n
          return {
            ...n,
            parentId: targetGroupId,
            extent: 'parent' as const,
            data: n.type === 'catalogPage' && n.data && typeof n.data === 'object' ? { ...n.data, inGroup: true } : n.data,
          }
        })

        const { positions: laid, groupSize: groupSizePatchRaw } = planCatalogGroupChildLayout(updatedNodes, currentEdges, targetGroupId)
        const groupSizePatch = groupSizePatchRaw ? { diagramWidth: groupSizePatchRaw.width, diagramHeight: groupSizePatchRaw.height } : undefined

        const pageIdsToPersist = new Set([...need, ...pages.filter(p => p.groupId === targetGroupId).map(p => p.id)])

        const updates: Array<{ id: string; groupId?: string; diagramX: number; diagramY: number }> = []
        for (const id of pageIdsToPersist) {
          const pos = laid[id]
          if (!pos) continue
          updates.push({
            id,
            ...(need.includes(id) ? { groupId: targetGroupId } : {}),
            diagramX: pos.x,
            diagramY: pos.y,
          })
        }

        if (!updates.length) {
          toast.error(t('automation.pageMap.removeFromGroupNoLayout'))
          return
        }

        const results = await trackPageMapPersistAll(() =>
          Promise.all([
            ...updates.map(u =>
              window.api.automation.catalogPage.update({
                id: u.id,
                patch: {
                  ...(u.groupId ? { groupId: u.groupId } : {}),
                  diagramX: u.diagramX,
                  diagramY: u.diagramY,
                },
              })
            ),
            ...(groupSizePatch
              ? [
                window.api.automation.catalogGroup.update({
                  id: targetGroupId,
                  patch: groupSizePatch,
                }),
              ]
              : []),
          ])
        )
        const bad = results.find(x => x.status !== 'success')
        if (bad) {
          toast.error(bad.message ?? t('devPipelines.saveError'))
          await loadGraph()
          return
        }

        setPages(ps =>
          ps.map(p => {
            const u = updates.find(x => x.id === p.id)
            return u ? { ...p, groupId: u.groupId ?? p.groupId, diagramX: u.diagramX, diagramY: u.diagramY } : p
          })
        )
        if (groupSizePatch) {
          setGroups(gs => gs.map(g => (g.id === targetGroupId ? { ...g, ...groupSizePatch } : g)))
        }
        setNodes(nds =>
          nds.map(n => {
            const assigned = need.includes(n.id)
            const pos = laid[n.id]
            if (n.id === targetGroupId && groupSizePatch) {
              return {
                ...n,
                style: { ...n.style, width: groupSizePatch.diagramWidth, height: groupSizePatch.diagramHeight },
              }
            }
            if (assigned) {
              return {
                ...n,
                parentId: targetGroupId,
                extent: 'parent' as const,
                position: pos ?? { x: PAGE_MAP_GROUP_INNER_PAD, y: PAGE_MAP_GROUP_TITLE_RESERVE },
                data: n.type === 'catalogPage' && n.data && typeof n.data === 'object' ? { ...n.data, inGroup: true } : n.data,
              }
            }
            if (pos) return { ...n, position: pos }
            return n
          })
        )

        requestAnimationFrame(() => inst.fitView({ nodes: [{ id: targetGroupId }, ...need.map(id => ({ id }))], padding: 0.35, duration: 350 }))
        toast.success(t('automation.pageMap.assignToGroupDone', { count: need.length }))
      } finally {
        setBusy(null)
      }
    },
    [pages, loadGraph, t, setPages, setNodes, setGroups, capturePositions, pushUndoPositions]
  )

  const effectiveRunPageIds = useMemo(() => (runIntent?.pageIds?.length ? runIntent.pageIds : selectedPageIds), [runIntent?.pageIds, selectedPageIds])
  const effectiveRunGroupIds = useMemo(() => (runIntent?.groupIds?.length ? runIntent.groupIds : selectedGroupIds), [runIntent?.groupIds, selectedGroupIds])

  const inspectorEdgeRunOrderMax = useMemo(() => {
    if (flowInspector?.kind !== 'edge') return 1
    const edge = navEdges.find(e => e.id === flowInspector.id)
    if (!edge) return 1
    return Math.max(1, navEdges.filter(e => e.sourcePageId === edge.sourcePageId).length)
  }, [flowInspector, navEdges])

  useEffect(() => {
    const runPages = runScopePageIdsRef.current
    if (!runPages.length) return

    if (current.status === 'running' && current.projectId === projectId && current.runId === trackedRunIdRef.current) {
      const activePageId = current.activePageId ?? undefined
      if (activePageId && runPages.includes(activePageId) && runOrderedRef.current) {
        const idx = runPages.indexOf(activePageId)
        if (idx >= 0) {
          setPageStatus(prev => {
            const next = { ...prev }
            for (let i = 0; i < idx; i++) {
              const pid = runPages[i]!
              if (next[pid] !== 'error') next[pid] = 'done'
            }
            next[activePageId] = 'running'
            for (let i = idx + 1; i < runPages.length; i++) {
              const pid = runPages[i]!
              if (next[pid] === 'running') next[pid] = 'queued'
            }
            let changed = false
            for (const pid of runPages) {
              if (prev[pid] !== next[pid]) {
                changed = true
                break
              }
            }
            return changed ? next : prev
          })
        }
        const prevPageId = lastActivePageRef.current
        if (current.activeEdgeId) {
          setPathEdgeIds(new Set([current.activeEdgeId]))
        } else if (prevPageId && prevPageId !== activePageId) {
          const traversed = navEdges.filter(e => e.sourcePageId === prevPageId && e.targetPageId === activePageId).sort((a, b) => (a.runOrder ?? 99) - (b.runOrder ?? 99))[0]
          if (traversed) setPathEdgeIds(new Set([traversed.id]))
        }
        lastActivePageRef.current = activePageId
      }

      const tally = current.tally
      const curTest = tally.currentTest ?? ''
      const rel = parseSpecRelPathFromReporterLine(curTest)
      const stem = rel ? specRelPathToStem(rel) : null
      const caseId = stem ? stemToCaseIdRef.current.get(stem) : undefined
      const pageId = caseId ? caseIdToPageIdRef.current.get(caseId) : undefined

      if (pageId && runPages.includes(pageId)) {
        setPageStatus(prev => {
          const next = { ...prev }
          for (const pid of runPages) {
            if (pid === pageId) next[pid] = 'running'
            else if (next[pid] === 'running') next[pid] = 'queued'
          }
          let changed = false
          for (const pid of runPages) {
            if (prev[pid] !== next[pid]) {
              changed = true
              break
            }
          }
          return changed ? next : prev
        })
      }

      const prev = prevTallyRef.current
      if (tally.failed > prev.failed) {
        const rel2 = parseSpecRelPathFromReporterLine(curTest)
        const stem2 = rel2 ? specRelPathToStem(rel2) : null
        const caseId2 = stem2 ? stemToCaseIdRef.current.get(stem2) : undefined
        const pageId2 = caseId2 ? caseIdToPageIdRef.current.get(caseId2) : pageId
        if (pageId2 && runPages.includes(pageId2)) {
          setPageStatus(prev => {
            if (prev[pageId2] === 'error') return prev
            return { ...prev, [pageId2]: 'error' }
          })
        }
      }
      prevTallyRef.current = { passed: tally.passed, failed: tally.failed, skipped: tally.skipped }
    }

    if (
      trackedRunIdRef.current &&
      current.runId === trackedRunIdRef.current &&
      current.projectId === projectId &&
      (current.status === 'passed' || current.status === 'failed' || current.status === 'cancelled' || current.status === 'error')
    ) {
      const pagesInRun = runScopePageIdsRef.current
      if (current.status === 'cancelled') {
        setPageStatus(prev => {
          const next = { ...prev }
          for (const pid of pagesInRun) {
            if (next[pid] === 'running' || next[pid] === 'queued') next[pid] = 'cancelled'
          }
          return next
        })
      } else {
        setPageStatus(prev => {
          const next = { ...prev }
          for (const pid of pagesInRun) {
            if (next[pid] === 'error') continue
            if (next[pid] === 'running' || next[pid] === 'queued') next[pid] = 'done'
          }
          return next
        })
      }
      setShowLastRunStatusVisible(true)
      runScopePageIdsRef.current = []
      trackedRunIdRef.current = null
      lastActivePageRef.current = null
      setPathEdgeIds(new Set())
      runOrderedRef.current = false
    }
  }, [current, projectId, setShowLastRunStatusVisible, navEdges])

  useEffect(() => {
    if (current.status === 'running' && current.projectId === projectId && current.runId && runScopePageIdsRef.current.length) {
      if (trackedRunIdRef.current === current.runId) {
        const tally = current.tally
        prevTallyRef.current = { passed: tally.passed, failed: tally.failed, skipped: tally.skipped }
      }
    }
  }, [current.runId, current.status, current.projectId, projectId, current.tally.passed, current.tally.failed, current.tally.skipped])

  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[] }) => {
    const next = sel.map(n => n.id)
    setSelectedIds(prev => {
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev
      const a = [...prev].sort().join('\0')
      const b = [...next].sort().join('\0')
      if (a === b) return prev
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
    setNodes(nds => nds.map(n => ({ ...n, selected: false })))
  }, [setNodes])

  const handleCanvasLockedChange = useCallback(
    (locked: boolean) => {
      setCanvasLocked(locked)
      if (locked) {
        clearSelection()
        setFlowInspector(null)
        setFloatMenu(null)
      }
    },
    [clearSelection]
  )

  const hasLastRunInDb = useMemo(() => {
    if (dbLastRun?.runId && hasPreviousRunStatus(dbLastRun.pageStatus)) return true
    return hasPreviousRunStatus(pageStatus)
  }, [dbLastRun, pageStatus])

  const runStatusToggleDisabled = !hasLastRunInDb && !showPreviousRunStatus

  const handleHideLastRunStatus = useCallback(() => {
    setShowLastRunStatusVisible(false)
  }, [setShowLastRunStatusVisible])

  const handleShowLastRunStatus = useCallback(() => {
    void (async () => {
      const res = await window.api.automation.run.pageMapStatus(projectId)
      if (res.status !== 'success') {
        toast.error(res.message ?? t('automation.pageMap.showLastRunStatusFailed'))
        return
      }
      const data = res.data
      if (!data?.runId) {
        toast.info(t('automation.pageMap.noLastRunStatus'))
        return
      }
      const fromDb = data.pageStatus ?? {}
      if (!hasTerminalPageMapStatus(fromDb)) {
        toast.info(t('automation.pageMap.noLastRunPageStatus'))
        return
      }
      setDbLastRun(data)
      setPageStatus(prev => mergeDbPageStatus(prev, fromDb))
      setShowLastRunStatusVisible(true)
    })()
  }, [projectId, setShowLastRunStatusVisible, t])

  const handleToggleLastRunStatus = useCallback(
    (visible: boolean) => {
      if (visible) handleShowLastRunStatus()
      else handleHideLastRunStatus()
    },
    [handleShowLastRunStatus, handleHideLastRunStatus]
  )

  const handleSelectAllPages = useCallback(() => {
    if (!pages.length) return
    const ids = pages.map(p => p.id)
    setSelectedIds(ids)
    setNodes(nds => nds.map(n => ({ ...n, selected: n.type === 'catalogPage' && ids.includes(n.id) })))
  }, [pages, setNodes])

  const runDisabled = selectedIds.length === 0 || !scope?.caseIds.length || scopeLoading

  const openRunForPages = useCallback(
    async (pageIds: string[]) => {
      if (!pageIds.length || runBusy) return
      try {
        const res = await window.api.automation.run.resolveScope({ projectId, pageIds, groupIds: [], ordered: true })
        const caseIds = res.status === 'success' && res.data?.caseIds ? res.data.caseIds : []
        if (!caseIds.length) {
          if (pageIds.length === 1 && res.status === 'success') return
          toast.error(res.message ?? t('automation.pageMap.noCasesToRun'))
          return
        }
        const data = res.data
        if (!data) return
        if (hasFlowCycleWarning(data.warnings)) {
          toast.error(t('automation.pageMap.flowCycleError'))
          return
        }
        if (hasFlowStartPageScopeError(data.warnings)) {
          toast.error(t('automation.pageMap.flowStartPageScopeError'))
          return
        }
        notifyFlowScopeWarnings(data.warnings, t)
        buildStemMaps(data, cases)
        const runnablePages = data.orderedPageIds?.length ? data.orderedPageIds : pageIdsWithCasesInScope(data)
        runScopePageIdsRef.current = [...runnablePages]
        prevTallyRef.current = { passed: 0, failed: 0, skipped: 0 }
        setRunOrdered(true)
        runOrderedRef.current = true
        setRunStartPageId(undefined)
        setRunIntent({ pageIds: [...pageIds], groupIds: [] })
        setRunOpenHint(t('automation.pageMap.runDialogScope', { pages: runnablePages.length, cases: data.caseIds.length }))
        setPageStatus(prev => {
          const next = { ...prev }
          for (const pid of runnablePages) next[pid] = 'queued'
          return next
        })
        setRunOpen(true)
      } catch {
        toast.error(t('automation.pageMap.resolveFailed'))
      }
    },
    [projectId, cases, buildStemMaps, t, runBusy]
  )

  const openRunForGroups = useCallback(
    async (groupIds: string[]) => {
      if (!groupIds.length || runBusy) return
      try {
        const res = await window.api.automation.run.resolveScope({ projectId, pageIds: [], groupIds, ordered: true })
        const caseIds = res.status === 'success' && res.data?.caseIds ? res.data.caseIds : []
        if (!caseIds.length) {
          toast.error(res.message ?? t('automation.pageMap.noCasesToRun'))
          return
        }
        const data = res.data
        if (!data) return
        if (hasFlowCycleWarning(data.warnings)) {
          toast.error(t('automation.pageMap.flowCycleError'))
          return
        }
        if (hasFlowStartPageScopeError(data.warnings)) {
          toast.error(t('automation.pageMap.flowStartPageScopeError'))
          return
        }
        notifyFlowScopeWarnings(data.warnings, t)
        buildStemMaps(data, cases)
        const runnablePages = data.orderedPageIds?.length ? data.orderedPageIds : pageIdsWithCasesInScope(data)
        runScopePageIdsRef.current = [...runnablePages]
        prevTallyRef.current = { passed: 0, failed: 0, skipped: 0 }
        setRunOrdered(true)
        runOrderedRef.current = true
        setRunStartPageId(undefined)
        setRunIntent({ pageIds: [], groupIds: [...groupIds] })
        setRunOpenHint(t('automation.pageMap.runDialogScope', { pages: runnablePages.length, cases: data.caseIds.length }))
        setPageStatus(prev => {
          const next = { ...prev }
          for (const pid of runnablePages) next[pid] = 'queued'
          return next
        })
        setRunOpen(true)
      } catch {
        toast.error(t('automation.pageMap.resolveFailed'))
      }
    },
    [projectId, cases, buildStemMaps, t, runBusy]
  )

  const openRunForFlow = useCallback(
    async (startPageId: string) => {
      if (!startPageId || runBusy) return
      const page = pages.find(p => p.id === startPageId)
      if (page?.executionDisabled) {
        toast.info(t('flowInspector.executionDisabledRunBlocked'))
        return
      }
      try {
        const res = await window.api.automation.run.resolveScope({
          projectId,
          pageIds: [],
          groupIds: [],
          ordered: true,
          startPageId,
        })
        const caseIds = res.status === 'success' && res.data?.caseIds ? res.data.caseIds : []
        if (!caseIds.length) {
          toast.error(res.message ?? t('automation.pageMap.noCasesToRun'))
          return
        }
        const data = res.data
        if (!data) return
        if (hasFlowCycleWarning(data.warnings)) {
          toast.error(t('automation.pageMap.flowCycleError'))
          return
        }
        if (hasFlowStartPageScopeError(data.warnings)) {
          toast.error(t('automation.pageMap.flowStartPageScopeError'))
          return
        }
        notifyFlowScopeWarnings(data.warnings, t)
        buildStemMaps(data, cases)
        const runnablePages = data.orderedPageIds?.length ? data.orderedPageIds : pageIdsWithCasesInScope(data)
        runScopePageIdsRef.current = [...runnablePages]
        prevTallyRef.current = { passed: 0, failed: 0, skipped: 0 }
        setRunOrdered(true)
        runOrderedRef.current = true
        setRunStartPageId(startPageId)
        setRunIntent({ pageIds: [...runnablePages], groupIds: [] })
        setRunOpenHint(t('automation.pageMap.runFlowScope', { pages: runnablePages.length, cases: data.caseIds.length }))
        setPageStatus(prev => {
          const next = { ...prev }
          for (const pid of runnablePages) next[pid] = 'queued'
          return next
        })
        setRunOpen(true)
      } catch {
        toast.error(t('automation.pageMap.resolveFailed'))
      }
    },
    [pages, projectId, cases, buildStemMaps, t, runBusy]
  )

  const handleOpenRun = useCallback(() => {
    setRunIntent(null)
    setRunOpenHint(undefined)
    setRunOrdered(false)
    runOrderedRef.current = false
    setRunStartPageId(undefined)
    if (!scope?.caseIds.length) {
      toast.error(t('automation.pageMap.noCasesToRun'))
      return
    }
    buildStemMaps(scope, cases)
    const runnablePages = pageIdsWithCasesInScope(scope)
    runScopePageIdsRef.current = [...runnablePages]
    prevTallyRef.current = { passed: 0, failed: 0, skipped: 0 }
    setPageStatus(prev => {
      const next = { ...prev }
      for (const pid of runnablePages) next[pid] = 'queued'
      return next
    })
    setRunOpen(true)
  }, [scope, selectedPageIds, cases, buildStemMaps, t])

  const handleOpenRunAll = useCallback(() => {
    void openRunForPages(pages.map(p => p.id))
  }, [openRunForPages, pages])

  const runAllDisabled = pages.length === 0 || runBusy

  const handleExportCsv = useCallback(() => {
    if (!pages.length) return
    setBusy('exportCsv')
    try {
      downloadTextFile(`page-map-${projectId}.csv`, buildCatalogPagesCsv(pages))
      toast.success(t('automation.pageMap.exportCsvDone'))
    } finally {
      setBusy(null)
    }
  }, [pages, projectId, t])

  const handleAssignToGroup = useCallback(
    (groupId: string) => {
      if (!selectedPageIds.length) {
        toast.info(t('automation.pageMap.selectPagesFirst'))
        return
      }
      void assignPagesToGroupByIds(selectedPageIds, groupId)
    },
    [selectedPageIds, assignPagesToGroupByIds, t]
  )

  const handleRunStarted = useCallback((runId: string) => {
    trackedRunIdRef.current = runId
    const pages = runScopePageIdsRef.current
    setPageStatus(prev => {
      const next = { ...prev }
      if (runOrderedRef.current && pages.length) {
        next[pages[0]!] = 'running'
        for (let i = 1; i < pages.length; i++) {
          const pid = pages[i]!
          if (next[pid] !== 'error') next[pid] = 'queued'
        }
      } else {
        for (const pid of pages) {
          if (next[pid] === 'queued') next[pid] = 'running'
        }
      }
      return next
    })
    setRunOpen(false)
    setRunIntent(null)
    setRunOpenHint(undefined)
  }, [])

  const scopeSummaryHint = useMemo(() => {
    if (runOpenHint) return runOpenHint
    if (!selectedIds.length) return undefined
    const pageCount = scope ? pageIdsWithCasesInScope(scope).length : selectedPageIds.length
    const groupCount = selectedGroupIds.length
    return t('automation.pageMap.runDialogScopeDetail', {
      pages: pageCount,
      groups: groupCount,
      cases: scope?.caseIds.length ?? 0,
    })
  }, [runOpenHint, selectedIds.length, scope, selectedPageIds.length, selectedGroupIds.length, scope?.caseIds.length, t])

  const duplicatePageFromMap = useCallback(
    async (sourcePageId: string) => {
      setBusy('dup')
      try {
        const res = await window.api.automation.catalogPage.duplicateDeep({ sourcePageId })
        if (res.status === 'success' && res.data) {
          toast.success(t('automation.pageMap.duplicateDeepSuccess'))
          await loadGraph()
        } else toast.error(res.message ?? t('automation.pageMap.duplicateDeepFailed'))
      } finally {
        setBusy(null)
      }
    },
    [loadGraph, t]
  )

  const requestDeletePageFromMap = useCallback((pageId: string) => {
    setCtxPageId(pageId)
    setDeleteOpen(true)
  }, [])

  const requestDeleteGroupFromMap = useCallback((groupId: string) => {
    setDeleteGroupTarget(groupId)
  }, [])

  const persistDiagramPositions = useCallback(
    async (positions: Record<string, { x: number; y: number }>) => {
      if (Object.keys(positions).length === 0) return
      const gids = new Set(groups.map(g => g.id))
      const pids = new Set(pages.map(p => p.id))
      const aids = new Set(annotations.map(a => a.id))
      const targets = Object.keys(positions).map(id => ({
        id,
        kind: gids.has(id) ? 'group' : pids.has(id) ? 'page' : aids.has(id) ? 'annotation' : 'unknown',
        ...positions[id],
      }))
      logPageMapAutosave('drag:persistDiagramPositions', { nodeCount: targets.length, targets })
      await trackPageMapPersistAll(() =>
        Promise.all(
          Object.entries(positions).map(([id, pos]) => {
            if (gids.has(id)) return window.api.automation.catalogGroup.update({ id, patch: { diagramX: pos.x, diagramY: pos.y } })
            if (pids.has(id)) return window.api.automation.catalogPage.update({ id, patch: { diagramX: pos.x, diagramY: pos.y } })
            if (aids.has(id)) return window.api.automation.mapAnnotation.update({ id, patch: { diagramX: pos.x, diagramY: pos.y } })
            return Promise.resolve({ status: 'success' as const })
          })
        )
      )
    },
    [groups, pages, annotations]
  )

  const runLayoutForScope = useCallback(
    async (algo: CatalogMapLayoutAlgo, scope: CatalogMapLayoutScope) => {
      const inst = rfRef.current
      if (!inst) return
      const currentNodes = await getNodesSizedForAutoLayout(inst)
      const currentEdges = inst.getEdges()
      const posBefore = capturePositions(currentNodes)
      pushUndoPositions(posBefore)
      const laid = computeCatalogPageMapLayout(currentNodes, currentEdges, algo, scope)
      setNodes(nds =>
        nds.map(n => {
          const p = laid[n.id]
          return p ? { ...n, position: p } : n
        })
      )
      await persistDiagramPositions(laid)
      requestAnimationFrame(() => inst.fitView({ padding: 0.2, duration: 300 }))
      toast.success(t('automation.pageMap.autoLayoutDone'))
    },
    [capturePositions, pushUndoPositions, setNodes, persistDiagramPositions, t]
  )

  const flushPendingDragPositions = useCallback(async () => {
    const batch = { ...pendingDragDiagramRef.current }
    pendingDragDiagramRef.current = {}
    logPageMapAutosave('drag:debounceFlush', { nodeCount: Object.keys(batch).length, nodeIds: Object.keys(batch) })
    if (Object.keys(batch).length) await persistDiagramPositions(batch)
  }, [persistDiagramPositions])

  flushPendingDragPositionsRef.current = flushPendingDragPositions

  const schedulePersistDragPositions = useCallback((updates: Record<string, { x: number; y: number }>) => {
    Object.assign(pendingDragDiagramRef.current, updates)
    logPageMapAutosave('drag:debounceSchedule', {
      updateCount: Object.keys(updates).length,
      pendingCount: Object.keys(pendingDragDiagramRef.current).length,
      nodeIds: Object.keys(pendingDragDiagramRef.current),
    })
    dragPositionPersistRef.current.schedule()
  }, [])

  const flushAllPendingPersists = useCallback(async () => {
    dragPositionPersistRef.current.cancel()
    pendingDragDiagramRef.current = {}
    await flushDebouncedPageMapPersists()
    await flushPendingDragPositions()
  }, [flushPendingDragPositions])

  useEffect(() => {
    return () => {
      void flushAllPendingPersists()
      resetPageMapSaveState()
    }
  }, [projectId, flushAllPendingPersists])

  const duplicateAnnotationFromMap = useCallback(
    async (annotationId: string) => {
      setBusy('dupAnnotation')
      try {
        const res = await window.api.automation.mapAnnotation.duplicate(annotationId)
        if (res.status !== 'success' || !res.data) {
          toast.error(res.message ?? t('automation.pageMap.annotationDuplicateFailed'))
          return
        }
        toast.success(t('automation.pageMap.annotationDuplicated'))
        const created = res.data
        setAnnotations(prev => [...prev, created])
      } finally {
        setBusy(null)
      }
    },
    [t]
  )

  const deleteAnnotationFromMap = useCallback(
    async (annotationId: string) => {
      setBusy('delAnnotation')
      try {
        const res = await window.api.automation.mapAnnotation.delete(annotationId)
        if (res.status !== 'success') {
          toast.error(res.message ?? t('automation.pageMap.annotationDeleteFailed'))
          return
        }
        setAnnotations(prev => prev.filter(a => a.id !== annotationId))
        setSelectedIds(ids => ids.filter(id => id !== annotationId))
        setNodes(nds => nds.filter(n => n.id !== annotationId))
        if (flowInspector?.kind === 'annotation' && flowInspector.id === annotationId) setFlowInspector(null)
      } finally {
        setBusy(null)
      }
    },
    [flowInspector, setNodes, t]
  )

  const pageMapActions = useMemo<PageMapActionsValue>(
    () => ({
      canvasLocked,
      runThisPage: pageId => {
        const page = pages.find(p => p.id === pageId)
        if (page?.executionDisabled) {
          toast.info(t('flowInspector.executionDisabledRunBlocked'))
          return
        }
        void openRunForPages([pageId])
      },
      runFlowFromPage: pageId => {
        void openRunForFlow(pageId)
      },
      togglePageExecutionDisabled: pageId => {
        const page = pages.find(p => p.id === pageId)
        if (!page) return
        const next = !page.executionDisabled
        void trackPageMapPersist(async () => {
          const res = await window.api.automation.catalogPage.update({ id: pageId, patch: { executionDisabled: next } })
          if (res.status === 'success' && res.data) {
            setPages(ps => ps.map(p => (p.id === pageId ? res.data! : p)))
          }
          return res
        })
      },
      runBusy,
      duplicatePage: pageId => {
        void duplicatePageFromMap(pageId)
      },
      requestDeletePage: requestDeletePageFromMap,
      pageActionBusy: busy === 'dup',
      removePagesFromGroup: pageIds => {
        void removePagesFromGroupByIds(pageIds)
      },
      removeFromGroupBusy: busy === 'removeFromGroup',
      runThisGroup: gid => {
        void openRunForGroups([gid])
      },
      openCasesForGroup: gid => {
        onOpenCasesForGroup?.(gid)
      },
      requestDeleteGroup: requestDeleteGroupFromMap,
      groupActionBusy: busy === 'delGroup',
      duplicateAnnotation: annotationId => {
        void duplicateAnnotationFromMap(annotationId)
      },
      deleteAnnotation: annotationId => {
        void deleteAnnotationFromMap(annotationId)
      },
      annotationActionBusy: busy === 'dupAnnotation' || busy === 'delAnnotation',
      persistGroupSize: persistCatalogGroupDiagramSize,
      persistAnnotationContent,
      persistAnnotationSize: persistAnnotationDiagramSize,
    }),
    [
      canvasLocked,
      openRunForPages,
      openRunForFlow,
      openRunForGroups,
      pages,
      t,
      runBusy,
      duplicatePageFromMap,
      requestDeletePageFromMap,
      removePagesFromGroupByIds,
      requestDeleteGroupFromMap,
      busy,
      onOpenCasesForGroup,
      duplicateAnnotationFromMap,
      deleteAnnotationFromMap,
      persistCatalogGroupDiagramSize,
      persistAnnotationContent,
      persistAnnotationDiagramSize,
    ]
  )

  const handleCreateCatalogGroup = useCallback(async () => {
    const name = addGroupName.trim()
    if (!name) return
    setBusy('addGroup')
    try {
      const res = await window.api.automation.catalogGroup.create({ projectId, name })
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? t('automation.pageMap.groupCreateFailed'))
        return
      }
      toast.success(t('automation.pageMap.groupCreated'))
      setAddGroupOpen(false)
      setAddGroupName('')
      await loadGraph()
    } finally {
      setBusy(null)
    }
  }, [addGroupName, projectId, loadGraph, t])

  const handleCreateAnnotation = useCallback(async () => {
    const inst = rfRef.current
    const center = inst?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 120, y: 120 }
    setBusy('addAnnotation')
    try {
      const res = await window.api.automation.mapAnnotation.create({
        projectId,
        content: t('automation.pageMap.annotationDefaultContent'),
        diagramX: center.x - 88,
        diagramY: center.y - 36,
        diagramWidth: PAGE_MAP_ANNOTATION_DEFAULT_W,
        diagramHeight: PAGE_MAP_ANNOTATION_DEFAULT_H,
      })
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? t('automation.pageMap.annotationCreateFailed'))
        return
      }
      const created = res.data
      toast.success(t('automation.pageMap.annotationCreated'))
      setAnnotations(prev => [...prev, created])
    } finally {
      setBusy(null)
    }
  }, [projectId, t])

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const annIds = deleted.filter(n => n.type === 'mapAnnotation').map(n => n.id)
      if (!annIds.length) return
      void (async () => {
        const results = await Promise.all(annIds.map(id => window.api.automation.mapAnnotation.delete(id)))
        const bad = results.find(r => r.status !== 'success')
        if (bad) {
          toast.error(bad.message ?? t('automation.pageMap.annotationDeleteFailed'))
          await loadGraph()
          return
        }
        setAnnotations(prev => prev.filter(a => !annIds.includes(a.id)))
        setSelectedIds(ids => ids.filter(id => !annIds.includes(id)))
      })()
    },
    [loadGraph, t]
  )

  const confirmDeleteGroup = useCallback(async () => {
    if (!deleteGroupTarget) return
    setBusy('delGroup')
    try {
      const res = await window.api.automation.catalogGroup.delete(deleteGroupTarget)
      if (res.status !== 'success') {
        toast.error(res.message ?? t('automation.pageMap.groupDeleteFailed'))
        return
      }
      toast.success(t('automation.pageMap.groupDeleted'))
      setDeleteGroupTarget(null)
      setSelectedIds(ids => ids.filter(i => i !== deleteGroupTarget))
      await loadGraph()
    } finally {
      setBusy(null)
    }
  }, [deleteGroupTarget, loadGraph, t])

  const onNodeDragStart = useCallback(
    (_: unknown, node: Node) => {
      if (dragPositionsRef.current) {
        logPageMapAutosave('drag:start:skip', { nodeId: node.id, reason: 'snap already set' })
        return
      }
      const nds = rfRef.current?.getNodes() ?? []
      const tracked = nds.filter(n => n.id === node.id || n.selected)
      dragPositionsRef.current = capturePositions(tracked)
      logPageMapAutosave('drag:start', {
        nodeId: node.id,
        nodeType: node.type,
        trackedCount: tracked.length,
        trackedIds: tracked.map(n => n.id),
      })
    },
    [capturePositions]
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      logPageMapAutosave('drag:stop', { nodeId: node.id, nodeType: node.type })
      const inst = rfRef.current
      const snap = dragPositionsRef.current
      dragPositionsRef.current = null
      const after = capturePositions(inst?.getNodes() ?? [])

      const pinnedPages = pagesRef.current
      const pageIdSet = new Set(pinnedPages.map(p => p.id))

      type Rep = { id: string; nextG: string | null; relX: number; relY: number }
      const reps: Rep[] = []

      if (inst && snap) {
        for (const id of Object.keys(snap)) {
          if (!pageIdSet.has(id)) continue
          const row = pinnedPages.find(p => p.id === id)
          if (!row) continue
          const oldG = row.groupId ?? null
          const nextG = resolveSmallestIntersectingCatalogGroupId(inst, id)
          if ((oldG ?? null) === (nextG ?? null)) continue

          const pi = inst.getInternalNode(id)
          const abs = pi?.internals?.positionAbsolute
          if (!abs) continue

          let relX = abs.x
          let relY = abs.y
          if (nextG) {
            const gi = inst.getInternalNode(nextG)
            const gabs = gi?.internals?.positionAbsolute
            if (!gabs) continue
            relX -= gabs.x
            relY -= gabs.y
          }

          reps.push({ id, nextG, relX, relY })
        }
      }

      const reparentedIds = new Set(reps.map(r => r.id))

      if (reps.length) {
        const targetGroupIds = [...new Set(reps.map(r => r.nextG).filter((id): id is string => Boolean(id)))]
        let layoutNodes =
          inst?.getNodes().map(n => {
            const r = reps.find(x => x.id === n.id)
            if (!r) return n
            return {
              ...n,
              parentId: r.nextG ?? undefined,
              extent: r.nextG ? ('parent' as const) : undefined,
            }
          }) ?? []
        const currentEdges = inst?.getEdges() ?? []
        const laidByGroup = new Map<string, ReturnType<typeof planCatalogGroupChildLayout>>()

        for (const groupId of targetGroupIds) {
          const plan = planCatalogGroupChildLayout(layoutNodes, currentEdges, groupId)
          laidByGroup.set(groupId, plan)
          if (plan.groupSize) {
            const { width, height } = plan.groupSize
            layoutNodes = layoutNodes.map(n => (n.id === groupId ? { ...n, style: { ...n.style, width, height } } : n))
          }
        }

        const pageUpdates = reps.map(r => {
          const plan = r.nextG ? laidByGroup.get(r.nextG) : undefined
          const pos = r.nextG ? plan?.positions[r.id] : undefined
          return {
            id: r.id,
            groupId: r.nextG,
            diagramX: pos?.x ?? r.relX,
            diagramY: pos?.y ?? r.relY,
          }
        })

        for (const [groupId, plan] of laidByGroup) {
          for (const childId of plan.childIds) {
            if (reparentedIds.has(childId)) continue
            const pos = plan.positions[childId]
            if (!pos) continue
            pageUpdates.push({ id: childId, groupId, diagramX: pos.x, diagramY: pos.y })
          }
        }

        const groupSizePatches = [...laidByGroup.entries()].flatMap(([groupId, plan]) =>
          plan.groupSize ? [{ id: groupId, diagramWidth: plan.groupSize.width, diagramHeight: plan.groupSize.height }] : []
        )

        logPageMapAutosave('drag:reparentPersist', {
          pageUpdateCount: pageUpdates.length,
          groupSizePatchCount: groupSizePatches.length,
          pageIds: pageUpdates.map(u => u.id),
        })
        void trackPageMapPersistAll(() =>
          Promise.all([
            ...pageUpdates.map(u =>
              window.api.automation.catalogPage.update({
                id: u.id,
                patch: { groupId: u.groupId, diagramX: u.diagramX, diagramY: u.diagramY },
              })
            ),
            ...groupSizePatches.map(g =>
              window.api.automation.catalogGroup.update({
                id: g.id,
                patch: { diagramWidth: g.diagramWidth, diagramHeight: g.diagramHeight },
              })
            ),
          ])
        ).then(results => {
          const badResult = results.find(r => r.status !== 'success')
          if (badResult) {
            toast.error(badResult.message ?? t('devPipelines.saveError'))
            void loadGraph()
          }
        })

        const pageUpdateById = new Map(pageUpdates.map(u => [u.id, u]))
        setPages(ps =>
          ps.map(p => {
            const u = pageUpdateById.get(p.id)
            return u ? { ...p, groupId: u.groupId, diagramX: u.diagramX, diagramY: u.diagramY } : p
          })
        )
        if (groupSizePatches.length) {
          const groupPatchById = new Map(groupSizePatches.map(g => [g.id, g]))
          setGroups(gs =>
            gs.map(g => {
              const patch = groupPatchById.get(g.id)
              return patch ? { ...g, diagramWidth: patch.diagramWidth, diagramHeight: patch.diagramHeight } : g
            })
          )
        }
        setNodes(nds =>
          nds.map(n => {
            const u = pageUpdateById.get(n.id)
            const groupPatch = groupSizePatches.find(g => g.id === n.id)
            if (groupPatch) {
              return {
                ...n,
                style: { ...n.style, width: groupPatch.diagramWidth, height: groupPatch.diagramHeight },
              }
            }
            if (!u) return n
            return {
              ...n,
              parentId: u.groupId ?? undefined,
              extent: u.groupId ? ('parent' as const) : undefined,
              position: { x: u.diagramX, y: u.diagramY },
              data: n.type === 'catalogPage' && n.data && typeof n.data === 'object' ? { ...n.data, inGroup: Boolean(u.groupId) } : n.data,
            }
          })
        )
      }

      const toPersist: Record<string, { x: number; y: number }> = {}
      if (snap) {
        for (const [id, b] of Object.entries(snap)) {
          if (reparentedIds.has(id)) continue
          const a = after[id]
          if (a && (a.x !== b.x || a.y !== b.y)) toPersist[id] = { x: a.x, y: a.y }
        }
      }
      logPageMapAutosave('drag:stop:summary', {
        nodeId: node.id,
        snapCount: snap ? Object.keys(snap).length : 0,
        reparentCount: reps.length,
        toPersistCount: Object.keys(toPersist).length,
        toPersistIds: Object.keys(toPersist),
      })
      if (Object.keys(toPersist).length) schedulePersistDragPositions(toPersist)
      if (!snap) return
      let changed = false
      for (const k of Object.keys(snap)) {
        const b = snap[k]
        const a = after[k]
        if (a && (a.x !== b.x || a.y !== b.y)) {
          changed = true
          break
        }
      }
      if (changed) pushUndoPositions(snap)
    },
    [capturePositions, loadGraph, pushUndoPositions, schedulePersistDragPositions, setNodes, setPages, t]
  )

  const handleUndo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    const inst = rfRef.current
    const current = inst ? capturePositions(inst.getNodes()) : {}
    setUndoAvailable(undoStack.current.length > 0)
    redoStack.current.push(current)
    setRedoAvailable(true)
    setNodes(nds =>
      nds.map(n => {
        const p = prev[n.id]
        return p ? { ...n, position: { x: p.x, y: p.y } } : n
      })
    )
    void persistDiagramPositions(prev)
  }, [setNodes, capturePositions, persistDiagramPositions])

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    const inst = rfRef.current
    const current = inst ? capturePositions(inst.getNodes()) : {}
    setRedoAvailable(redoStack.current.length > 0)
    undoStack.current.push(current)
    if (undoStack.current.length > UNDO_CAP) undoStack.current.shift()
    setUndoAvailable(undoStack.current.length > 0)
    setNodes(nds =>
      nds.map(n => {
        const p = next[n.id]
        return p ? { ...n, position: { x: p.x, y: p.y } } : n
      })
    )
    void persistDiagramPositions(next)
  }, [setNodes, capturePositions, persistDiagramPositions])

  const applyEdgeInspector = useCallback(() => {
    if (!flowInspector || flowInspector.kind !== 'edge') return
    const id = flowInspector.id
    const flowExec = normalizeAllRunOrders(
      navEdges.map(e => ({
        id: e.id,
        source: e.sourcePageId,
        target: e.targetPageId,
        runOrder: e.runOrder,
      }))
    )
    const prevResolved = resolvedRunOrderByEdgeId(flowExec)
    const swapped = swapRunOrderForEdge(id, edgeRunOrderDraft, flowExec)
    const targetRunOrder = swapped.find(x => x.id === id)?.runOrder ?? edgeRunOrderDraft
    setNavEdges(eds =>
      eds.map(e => {
        const ro = swapped.find(x => x.id === e.id)?.runOrder
        return ro != null && ro !== e.runOrder ? { ...e, runOrder: ro } : e
      })
    )
    void trackPageMapPersist(async () => {
      const styleJson = stringifyConnectionStyle(edgeDraft)
      const label = edgeDraft.label.trim() || null
      const styleRes = await window.api.automation.navEdge.update({ id, patch: { label, styleJson, runOrder: targetRunOrder } })
      const orderUpdates = swapped
        .filter(fe => fe.runOrder != null && fe.runOrder !== prevResolved.get(fe.id))
        .map(fe => window.api.automation.navEdge.update({ id: fe.id, patch: { runOrder: fe.runOrder! } }))
      const orderResults = await Promise.all(orderUpdates)
      if (styleRes.status !== 'success') {
        toast.error(styleRes.message ?? t('devPipelines.saveError'))
        return styleRes
      }
      const orderFailed = orderResults.find(r => r.status !== 'success')
      if (orderFailed) {
        toast.error(orderFailed.message ?? t('devPipelines.saveError'))
        return orderFailed
      }
      const next = styleRes.data
      setNavEdges(eds =>
        eds.map(e => {
          const ro = swapped.find(x => x.id === e.id)?.runOrder
          if (e.id === id) {
            if (next) return { ...next, runOrder: ro ?? targetRunOrder }
            return {
              ...e,
              label: label ?? undefined,
              connectionStyle: mergeConnectionStyle(edgeDraft),
              runOrder: ro ?? targetRunOrder,
            }
          }
          return ro != null && ro !== e.runOrder ? { ...e, runOrder: ro } : e
        })
      )
      setFlowInspector(null)
      toast.success(t('flowInspector.saved'))
      return styleRes
    })
  }, [flowInspector, edgeDraft, edgeRunOrderDraft, navEdges, t])

  const applyContentLayoutToAllPages = useCallback(async () => {
    const defaults = readBoardContentDefaults('pageMap')
    if (!defaults?.contentLayout && !defaults?.contentDensity && !defaults?.metadataMode) {
      toast.error(t('flowInspector.applyLayoutToAllNoDefault'))
      return
    }
    const pageIds = pages.map(p => p.id)
    if (!pageIds.length) return
    const mergedStyle = (prev?: FlowNodeVisualStyle) => mergeNodeVisualStyle({ ...prev, ...defaults })
    void trackPageMapPersistAll(async () => {
      const results = await Promise.all(
        pageIds.map(id => {
          const prev = pages.find(p => p.id === id)?.diagramStyle
          return window.api.automation.catalogPage.update({ id, patch: { diagramStyle: mergedStyle(prev) } })
        })
      )
      const bad = results.find(x => x.status !== 'success')
      if (bad) {
        toast.error(bad.message ?? t('devPipelines.saveError'))
        return results
      }
      setPages(ps => ps.map(p => ({ ...p, diagramStyle: mergedStyle(p.diagramStyle) })))
      setNodes(nds =>
        nds.map(n => {
          if (n.type !== 'catalogPage') return n
          const prev = n.data as CatalogPageNodeData
          return { ...n, data: { ...prev, diagramVisual: mergedStyle(prev.diagramVisual) } }
        })
      )
      toast.success(t('flowInspector.applyLayoutToAllDone', { count: pageIds.length }))
      return results
    })
  }, [pages, setNodes, t])

  const requestApplyContentLayoutToAll = useCallback(() => {
    const defaults = readBoardContentDefaults('pageMap')
    if (!defaults?.contentLayout && !defaults?.contentDensity && !defaults?.metadataMode) {
      toast.error(t('flowInspector.applyLayoutToAllNoDefault'))
      return
    }
    if (pages.length > 10) {
      setApplyLayoutAllConfirmOpen(true)
      return
    }
    void applyContentLayoutToAllPages()
  }, [applyContentLayoutToAllPages, pages.length, t])

  const applyNodeInspector = useCallback(() => {
    if (!flowInspector || flowInspector.kind !== 'node') return
    if (boardLayoutDefaultChecked) {
      writeBoardContentDefaults('pageMap', pickContentDefaultsFromVisual(nodeVisualDraft))
      setHasBoardLayoutDefault(true)
    }
    const ids = flowInspector.ids
    if (ids.length === 1) {
      const id = ids[0]
      const prev = pages.find(x => x.id === id)
      const nextName = nodeNameDraft.trim() || prev?.name || ''
      void trackPageMapPersist(async () => {
        const res = await window.api.automation.catalogPage.update({
          id,
          patch: { diagramStyle: nodeVisualDraft, name: nextName, executionDisabled: executionDisabledDraft || undefined },
        })
        if (res.status !== 'success') {
          toast.error(res.message ?? t('devPipelines.saveError'))
          return res
        }
        setPages(ps =>
          ps.map(p => (p.id === id ? { ...p, diagramStyle: { ...nodeVisualDraft }, name: nextName || p.name, executionDisabled: executionDisabledDraft || undefined } : p))
        )
        setNodes(nds =>
          nds.map(n => {
            if (n.type !== 'catalogPage' || n.id !== id) return n
            const prev = n.data as CatalogPageNodeData
            return { ...n, data: { ...prev, diagramVisual: { ...nodeVisualDraft }, label: nextName || prev.label } }
          })
        )
        setFlowInspector(null)
        toast.success(t('flowInspector.saved'))
        return res
      })
      return
    }
    void trackPageMapPersistAll(async () => {
      const results = await Promise.all(ids.map(id => window.api.automation.catalogPage.update({ id, patch: { diagramStyle: nodeVisualDraft } })))
      const bad = results.find(x => x.status !== 'success')
      if (bad) {
        toast.error(bad.message ?? t('devPipelines.saveError'))
        return results
      }
      setPages(ps => ps.map(p => (ids.includes(p.id) ? { ...p, diagramStyle: { ...nodeVisualDraft } } : p)))
      setNodes(nds =>
        nds.map(n => {
          if (n.type !== 'catalogPage' || !ids.includes(n.id)) return n
          const prev = n.data as CatalogPageNodeData
          return { ...n, data: { ...prev, diagramVisual: { ...nodeVisualDraft } } }
        })
      )
      setFlowInspector(null)
      toast.success(t('flowInspector.savedBulk', { count: ids.length }))
      return results
    })
  }, [flowInspector, nodeVisualDraft, nodeNameDraft, pages, t, setNodes, boardLayoutDefaultChecked])

  const applyGroupInspector = useCallback(() => {
    if (!flowInspector || flowInspector.kind !== 'group') return
    const ids = flowInspector.ids
    if (ids.length === 1) {
      const id = ids[0]
      const prev = groups.find(x => x.id === id)
      const nextName = nodeNameDraft.trim() || prev?.name || ''
      const w = Math.max(200, groupSizeDraft.w)
      const h = Math.max(160, groupSizeDraft.h)
      void trackPageMapPersist(async () => {
        const res = await window.api.automation.catalogGroup.update({
          id,
          patch: { diagramStyle: nodeVisualDraft, name: nextName, diagramWidth: w, diagramHeight: h },
        })
        if (res.status !== 'success') {
          toast.error(res.message ?? t('devPipelines.saveError'))
          return res
        }
        setGroups(gs => gs.map(g => (g.id === id ? { ...g, diagramStyle: { ...nodeVisualDraft }, name: nextName || g.name, diagramWidth: w, diagramHeight: h } : g)))
        setNodes(nds =>
          nds.map(n => {
            if (n.type !== 'catalogGroup' || n.id !== id) return n
            const prev = n.data as CatalogGroupNodeData
            return {
              ...n,
              style: { ...n.style, width: w, height: h },
              data: { ...prev, diagramVisual: { ...nodeVisualDraft }, label: nextName || prev.label },
            }
          })
        )
        setFlowInspector(null)
        toast.success(t('flowInspector.saved'))
        return res
      })
      return
    }
    void trackPageMapPersistAll(async () => {
      const results = await Promise.all(ids.map(id => window.api.automation.catalogGroup.update({ id, patch: { diagramStyle: nodeVisualDraft } })))
      const bad = results.find(x => x.status !== 'success')
      if (bad) {
        toast.error(bad.message ?? t('devPipelines.saveError'))
        return results
      }
      setGroups(gs => gs.map(g => (ids.includes(g.id) ? { ...g, diagramStyle: { ...nodeVisualDraft } } : g)))
      setNodes(nds =>
        nds.map(n => {
          if (n.type !== 'catalogGroup' || !ids.includes(n.id)) return n
          const prev = n.data as CatalogGroupNodeData
          return { ...n, data: { ...prev, diagramVisual: { ...nodeVisualDraft } } }
        })
      )
      setFlowInspector(null)
      toast.success(t('flowInspector.savedBulk', { count: ids.length }))
      return results
    })
  }, [flowInspector, nodeVisualDraft, nodeNameDraft, groupSizeDraft, groups, t, setNodes])

  const applyAnnotationInspector = useCallback(() => {
    if (!flowInspector || flowInspector.kind !== 'annotation') return
    const id = flowInspector.id
    const w = Math.max(PAGE_MAP_ANNOTATION_MIN_W, Math.round(annotationDraft.width))
    const h = Math.max(PAGE_MAP_ANNOTATION_MIN_H, Math.round(annotationDraft.height))
    const content = annotationDraft.content.trim()
    void trackPageMapPersist(async () => {
      const res = await window.api.automation.mapAnnotation.update({
        id,
        patch: {
          content: content || t('automation.pageMap.annotationDefaultContent'),
          diagramWidth: w,
          diagramHeight: h,
          style: annotationDraft.style,
        },
      })
      if (res.status !== 'success') {
        toast.error(res.message ?? t('devPipelines.saveError'))
        return res
      }
      setAnnotations(prev =>
        prev.map(a =>
          a.id === id
            ? {
              ...a,
              content: content || a.content,
              diagramWidth: w,
              diagramHeight: h,
              style: { ...annotationDraft.style },
            }
            : a
        )
      )
      setNodes(nds => nds.map(n => (n.id === id && n.type === 'mapAnnotation' ? { ...n, style: { ...n.style, width: w, height: h }, data: { ...n.data, minHeight: h } } : n)))
      setFlowInspector(null)
      toast.success(t('flowInspector.saved'))
      return res
    })
  }, [flowInspector, annotationDraft, t, setNodes])

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return
      void (async () => {
        // Preserve the actual handle sides used during the drag gesture.
        // Handle IDs follow the pattern 's-{side}' / 't-{side}' (see FlowNodeMultiHandles).
        const sourceSide = (c.sourceHandle?.startsWith('s-') ? c.sourceHandle.slice(2) : 'bottom') as FlowEdgeHandleSide
        const targetSide = (c.targetHandle?.startsWith('t-') ? c.targetHandle.slice(2) : 'top') as FlowEdgeHandleSide

        await trackPageMapPersistAll(async () => {
          const res = await window.api.automation.navEdge.create({
            projectId,
            sourcePageId: c.source,
            targetPageId: c.target,
          })
          if (res.status !== 'success' || !res.data) {
            toast.error(res.message ?? t('automation.pageMap.edgeFailed'))
            return [res]
          }
          const created = res.data
          const runOrder = assignRunOrderForNewEdge(
            c.source,
            navEdges.map(e => ({ id: e.id, source: e.sourcePageId, target: e.targetPageId, runOrder: e.runOrder }))
          )

          const cs = mergeConnectionStyle({ sourceSide, targetSide })
          const styleJson = stringifyConnectionStyle(cs)
          const styleRes = await window.api.automation.navEdge.update({ id: created.id, patch: { styleJson, runOrder } })

          setNavEdges(eds => [...eds, { ...created, connectionStyle: cs, runOrder }])
          toast.success(t('automation.pageMap.edgeAdded'))
          return [res, styleRes]
        })
      })()
    },
    [projectId, t, navEdges]
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const deletedIds = new Set(deleted.map(d => d.id))
      const affectedSources = new Set<string>()
      for (const e of navEdges) {
        if (deletedIds.has(e.id)) affectedSources.add(e.sourcePageId)
      }

      setNavEdges(eds => {
        let next = eds.filter(x => !deletedIds.has(x.id))
        for (const src of affectedSources) {
          const flowExec: FlowExecEdge[] = next.map(e => ({
            id: e.id,
            source: e.sourcePageId,
            target: e.targetPageId,
            runOrder: e.runOrder,
          }))
          const normalized = normalizeRunOrdersForSource(src, flowExec)
          const orderById = new Map(normalized.map(e => [e.id, e.runOrder]))
          next = next.map(e => {
            if (e.sourcePageId !== src) return e
            const ro = orderById.get(e.id)
            return ro != null && ro !== e.runOrder ? { ...e, runOrder: ro } : e
          })
        }
        return next
      })

      void trackPageMapPersistAll(async () => {
        const deleteResults = await Promise.all(deleted.map(e => window.api.automation.navEdge.delete(e.id)))
        const remaining = navEdges.filter(x => !deletedIds.has(x.id))
        const updateResults: Promise<unknown>[] = []
        for (const src of affectedSources) {
          const siblings = remaining.filter(e => e.sourcePageId === src)
          const flowExec: FlowExecEdge[] = siblings.map(e => ({
            id: e.id,
            source: e.sourcePageId,
            target: e.targetPageId,
            runOrder: e.runOrder,
          }))
          const normalized = normalizeRunOrdersForSource(src, flowExec)
          for (const fe of normalized) {
            const prev = siblings.find(e => e.id === fe.id)
            if (fe.runOrder != null && fe.runOrder !== prev?.runOrder) {
              updateResults.push(window.api.automation.navEdge.update({ id: fe.id, patch: { runOrder: fe.runOrder } }))
            }
          }
        }
        const renumberResults = await Promise.all(updateResults)
        return [...deleteResults, ...renumberResults] as Array<{ status: string }>
      }).catch(() => {
        toast.error(t('automation.pageMap.edgeDeleteFailed'))
      })
    },
    [t, navEdges]
  )

  const handleRunDialogOpenChange = useCallback((open: boolean) => {
    setRunOpen(open)
    if (!open && trackedRunIdRef.current === null) {
      const queuedPages = [...runScopePageIdsRef.current]
      setPageStatus(prev => {
        const next = { ...prev }
        for (const pid of queuedPages) {
          if (next[pid] === 'queued') next[pid] = 'idle'
        }
        return next
      })
      runScopePageIdsRef.current = []
      setRunIntent(null)
      setRunOpenHint(undefined)
      setRunOrdered(false)
      runOrderedRef.current = false
      setRunStartPageId(undefined)
    }
  }, [])

  const miniMapIsDark = resolvedTheme === 'dark'
  const miniMapNodeColor = useCallback((node: Node) => pageMapMiniMapNodeColor(node, miniMapIsDark), [miniMapIsDark])
  const miniMapNodeStrokeColor = useCallback((node: Node) => pageMapMiniMapNodeStrokeColor(node, miniMapIsDark), [miniMapIsDark])
  const handleRfInit = useCallback((inst: ReactFlowInstance) => {
    rfRef.current = inst
  }, [])

  const openCtxPage = useCallback((pageId: string, clientX: number, clientY: number) => {
    setCtxPageId(pageId)
    setFloatMenu({ kind: 'node', pageId, clientX, clientY })
  }, [])

  const handleNodeContextMenu = useCallback(
    (e: MouseEvent, n: Node) => {
      e.preventDefault()
      if (n.type === 'catalogGroup') {
        setFloatMenu({ kind: 'group', groupId: n.id, clientX: e.clientX, clientY: e.clientY })
        return
      }
      if (n.type === 'mapAnnotation') return
      openCtxPage(n.id, e.clientX, e.clientY)
    },
    [openCtxPage]
  )

  const handleEdgeContextMenu = useCallback((e: MouseEvent, edge: Edge) => {
    e.preventDefault()
    setFloatMenu({ kind: 'edge', edgeId: edge.id, clientX: e.clientX, clientY: e.clientY })
  }, [])

  const handleNodeDoubleClick = useCallback(
    (_e: MouseEvent, n: Node) => {
      if (n.type !== 'catalogPage') return
      onOpenCasesForPage?.(n.id)
    },
    [onOpenCasesForPage]
  )

  const openBaseUrlForPage = useCallback(
    (p: TestCatalogPage) => {
      const base = project.baseUrl.replace(/\/$/, '')
      const slug = (p.slug ?? '').replace(/^\//, '')
      const url = slug ? `${base}/${slug}` : base
      void window.api.system.open_external_url(url)
    },
    [project.baseUrl]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={flowWrapRef} className="group relative min-h-0 flex-1 overflow-hidden rounded-lg border">
        <PageMapActionsContext.Provider value={pageMapActions}>
          <PageMapNodePanelContext.Provider value={nodePanelValue}>
            <FlowEdgeActionsContext.Provider value={flowEdgeInspectorActions}>
              <FlowNodeActionsContext.Provider value={flowNodeInspectorActions}>
                <FlowCanvasNodeSelectionProvider anyNodeSelected={selectedIds.length > 0}>
                  <ReactFlow
                    className="h-full w-full bg-background"
                    colorMode={flowColorMode}
                    onInit={handleRfInit}
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgesDelete={onEdgesDelete}
                    onNodesDelete={onNodesDelete}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDragStop={onNodeDragStop}
                    onSelectionChange={onSelectionChange}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodeContextMenu={handleNodeContextMenu}
                    onEdgeContextMenu={handleEdgeContextMenu}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={FLOW_DEFAULT_EDGE_OPTIONS}
                    fitView
                    onlyRenderVisibleElements
                    selectionOnDrag={!canvasLocked}
                    panOnDrag={canvasLocked ? true : FLOW_PAN_ON_DRAG}
                    nodesDraggable={!canvasLocked}
                    nodesConnectable={!canvasLocked}
                    elementsSelectable={!canvasLocked}
                    nodeDragThreshold={5}
                    deleteKeyCode={canvasLocked ? null : FLOW_DELETE_KEY_CODE}
                    proOptions={FLOW_PRO_OPTIONS}
                    minZoom={FLOW_CANVAS_MIN_ZOOM}
                    maxZoom={FLOW_CANVAS_MAX_ZOOM}
                  >
                    <PageMapBottomBar
                      projectId={projectId}
                      flowWrapRef={flowWrapRef}
                      t={t}
                      busy={busy}
                      setBusy={setBusy}
                      addOpen={addOpen}
                      setAddOpen={setAddOpen}
                      addName={addName}
                      setAddName={setAddName}
                      addSlug={addSlug}
                      setAddSlug={setAddSlug}
                      addDesc={addDesc}
                      setAddDesc={setAddDesc}
                      navEdges={navEdges}
                      selectedIds={selectedIds}
                      pathEdgeIds={pathEdgeIds}
                      setPathEdgeIds={setPathEdgeIds}
                      handleOpenRun={handleOpenRun}
                      handleOpenRunAll={handleOpenRunAll}
                      runDisabled={runDisabled}
                      runAllDisabled={runAllDisabled}
                      runBusy={runBusy}
                      handleUndo={handleUndo}
                      handleRedo={handleRedo}
                      undoAvailable={undoAvailable}
                      redoAvailable={redoAvailable}
                      capturePositions={capturePositions}
                      pushUndoPositions={pushUndoPositions}
                      setNodes={setNodes}
                      loadGraph={loadGraph}
                      setImportOpen={setImportOpen}
                      miniMapVisible={miniMapVisible}
                      onMiniMapVisibleChange={setMiniMapVisiblePersist}
                      clearSelection={clearSelection}
                      onSelectAllPages={handleSelectAllPages}
                      showPreviousRunStatus={showPreviousRunStatus}
                      onToggleLastRunStatus={handleToggleLastRunStatus}
                      hasLastRunStatus={hasLastRunInDb}
                      runStatusToggleDisabled={runStatusToggleDisabled}
                      pageCount={pages.length}
                      pages={pages}
                      groups={groups}
                      selectedPageIds={selectedPageIds}
                      selectedGroupIds={selectedGroupIds}
                      onOpenCasesForGroup={onOpenCasesForGroup}
                      onAssignToGroup={handleAssignToGroup}
                      onRunThisGroup={groupId => void openRunForGroups([groupId])}
                      onOpenHelp={() => setHelpOpen(true)}
                      onExportCsv={handleExportCsv}
                      addGroupOpen={addGroupOpen}
                      setAddGroupOpen={setAddGroupOpen}
                      addGroupName={addGroupName}
                      setAddGroupName={setAddGroupName}
                      onCreateCatalogGroup={handleCreateCatalogGroup}
                      onAddAnnotation={handleCreateAnnotation}
                      searchQ={searchQ}
                      setSearchQ={setSearchQ}
                      onRemoveSelectedPagesFromGroup={() => {
                        void removePagesFromGroupByIds(selectedPageIds)
                      }}
                      canvasLocked={canvasLocked}
                      onCanvasLockedChange={handleCanvasLockedChange}
                      onApplyContentLayoutToAll={requestApplyContentLayoutToAll}
                    />
                    <FlowCanvasBackground />
                    {miniMapVisible ? (
                      <MiniMap
                        pannable
                        zoomable
                        nodeColor={miniMapNodeColor}
                        nodeStrokeColor={miniMapNodeStrokeColor}
                        nodeStrokeWidth={2}
                        className="m-2 overflow-hidden rounded-md border border-border bg-card shadow-sm"
                      />
                    ) : null}
                  </ReactFlow>
                </FlowCanvasNodeSelectionProvider>
              </FlowNodeActionsContext.Provider>
            </FlowEdgeActionsContext.Provider>
          </PageMapNodePanelContext.Provider>
        </PageMapActionsContext.Provider>

        {floatMenu?.kind === 'node' && ctxPage ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops propagation for portaled menu
          <div
            role="menu"
            aria-label={t('automation.pageMap.floatMenuAria')}
            className="fixed z-[80] min-w-[11rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
            style={{ left: floatMenu.clientX, top: floatMenu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                onOpenCasesForPage?.(ctxPage.id)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.openCases')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                openBaseUrlForPage(ctxPage)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.openBaseUrl')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              disabled={runBusy}
              onClick={() => {
                pageMapActions.runThisPage(ctxPage.id)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.runThisPage')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              disabled={runBusy}
              onClick={() => {
                pageMapActions.runFlowFromPage(ctxPage.id)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.runFlow')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                setEditPageName(ctxPage.name)
                setEditPageSlug(ctxPage.slug ?? '')
                setEditPageDesc(ctxPage.description ?? '')
                setEditPageOpen(true)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.editPage')}
            </button>
            {ctxPage.groupId ? (
              <button
                type="button"
                className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
                disabled={!!busy}
                onClick={() => {
                  void removePagesFromGroupByIds([ctxPage.id])
                  setFloatMenu(null)
                }}
              >
                {t('automation.pageMap.removeFromGroupMenu')}
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                void (async () => {
                  setBusy('dup')
                  try {
                    const res = await window.api.automation.catalogPage.duplicateDeep({ sourcePageId: ctxPage.id })
                    if (res.status === 'success' && res.data) {
                      toast.success(t('automation.pageMap.duplicateDeepSuccess'))
                      await loadGraph()
                    } else toast.error(res.message ?? t('automation.pageMap.duplicateDeepFailed'))
                  } finally {
                    setBusy(null)
                    setFloatMenu(null)
                  }
                })()
              }}
            >
              {t('automation.pageMap.duplicateDeep')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left text-destructive hover:bg-destructive/10"
              onClick={() => {
                setDeleteOpen(true)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.deletePage')}
            </button>
          </div>
        ) : null}

        {floatMenu?.kind === 'group' && floatMenuGroupRec ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops propagation for portaled menu
          <div
            role="menu"
            aria-label={t('automation.pageMap.groupFloatMenuAria')}
            className="fixed z-[80] min-w-[11rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
            style={{ left: floatMenu.clientX, top: floatMenu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                onOpenCasesForGroup?.(floatMenu.groupId)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.openCasesInGroup')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              disabled={runBusy}
              onClick={() => {
                void openRunForGroups([floatMenu.groupId])
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.runThisGroup')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              disabled={!!busy}
              onClick={() => {
                void (async () => {
                  setBusy('addPageGrp')
                  try {
                    const res = await window.api.automation.catalogPage.create({
                      projectId,
                      name: t('automation.pageMap.newPageInGroupDefaultName'),
                      groupId: floatMenu.groupId,
                    })
                    if (res.status !== 'success' || !res.data) {
                      toast.error(res.message ?? t('automation.pageMap.pageCreateFailed'))
                      return
                    }
                    const p = res.data
                    await window.api.automation.catalogPage.update({
                      id: p.id,
                      patch: { diagramX: 48, diagramY: 56 },
                    })
                    toast.success(t('automation.pageMap.pageCreated'))
                    await loadGraph()
                  } finally {
                    setBusy(null)
                    setFloatMenu(null)
                  }
                })()
              }}
            >
              {t('automation.pageMap.addPageToGroup')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              disabled={!!busy}
              onClick={() => {
                void (async () => {
                  setBusy('addChildGrp')
                  try {
                    const res = await window.api.automation.catalogGroup.create({
                      projectId,
                      name: t('automation.pageMap.newChildGroupDefaultName'),
                      parentGroupId: floatMenu.groupId,
                    })
                    if (res.status !== 'success' || !res.data) {
                      toast.error(res.message ?? t('automation.pageMap.groupCreateFailed'))
                      return
                    }
                    toast.success(t('automation.pageMap.groupCreated'))
                    await loadGraph()
                  } finally {
                    setBusy(null)
                    setFloatMenu(null)
                  }
                })()
              }}
            >
              {t('automation.pageMap.addChildGroup')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              disabled={!!busy}
              onClick={() => {
                void runLayoutForScope('dagre-tb', { kind: 'group', groupId: floatMenu.groupId })
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.layoutThisGroup')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                const groupSel = selectedGroupIds
                if (groupSel.length > 1 && groupSel.includes(floatMenu.groupId)) {
                  setFlowInspector({ kind: 'group', ids: groupSel })
                } else {
                  setFlowInspector({ kind: 'group', ids: [floatMenu.groupId] })
                }
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.groupInspectorOpen')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left text-destructive hover:bg-destructive/10"
              onClick={() => {
                setDeleteGroupTarget(floatMenu.groupId)
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.deleteGroup')}
            </button>
          </div>
        ) : null}

        {floatMenu?.kind === 'edge' ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops propagation for portaled menu
          <div
            role="menu"
            aria-label={t('automation.pageMap.floatMenuAria')}
            className="fixed z-[80] min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
            style={{ left: floatMenu.clientX, top: floatMenu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                const eid = floatMenu.edgeId
                setFlowInspector({ kind: 'edge', id: eid })
                setFloatMenu(null)
              }}
            >
              {t('automation.pageMap.edgeSetLabel')}
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-left text-destructive hover:bg-destructive/10"
              onClick={() => {
                const eid = floatMenu.edgeId
                setNavEdges(eds => eds.filter(x => x.id !== eid))
                setFloatMenu(null)
                void trackPageMapPersist(() => window.api.automation.navEdge.delete(eid))
              }}
            >
              {t('automation.common.delete')}
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
                    ? t('flowInspector.visualBulkPages', { count: flowInspector.ids.length })
                    : t('flowInspector.visualTitle')
                  : flowInspector?.kind === 'group'
                    ? flowInspector.ids.length > 1
                      ? t('flowInspector.visualBulkGroups', { count: flowInspector.ids.length })
                      : t('automation.pageMap.groupInspectorTitle')
                    : flowInspector?.kind === 'annotation'
                      ? t('automation.pageMap.annotationInspectorTitle')
                      : ''}
            </SheetTitle>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              onClick={() => {
                if (flowInspector?.kind === 'edge') applyEdgeInspector()
                else if (flowInspector?.kind === 'node') applyNodeInspector()
                else if (flowInspector?.kind === 'group') applyGroupInspector()
                else if (flowInspector?.kind === 'annotation') applyAnnotationInspector()
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
                runOrder={edgeRunOrderDraft}
                runOrderMax={inspectorEdgeRunOrderMax}
                onRunOrderChange={setEdgeRunOrderDraft}
              />
            ) : null}
            {flowInspector?.kind === 'node' ? (
              <div className="grid gap-3">
                {flowInspector.ids.length > 1 ? <p className="text-xs leading-snug text-muted-foreground">{t('flowInspector.bulkVisualHint')}</p> : null}
                <FlowNodeVisualConfigPanel
                  value={nodeVisualDraft}
                  onChange={setNodeVisualDraft}
                  layoutContext="catalogPage"
                  boardDefaultLayoutChecked={boardLayoutDefaultChecked}
                  onBoardDefaultLayoutCheckedChange={setBoardLayoutDefaultChecked}
                  onResetBoardDefaultLayout={() => {
                    clearBoardContentDefaults('pageMap')
                    setHasBoardLayoutDefault(false)
                    setBoardLayoutDefaultChecked(false)
                  }}
                  hasBoardDefaultLayout={hasBoardLayoutDefault}
                  {...(flowInspector.ids.length === 1
                    ? {
                      nodeDisplayName: nodeNameDraft,
                      onNodeDisplayNameChange: setNodeNameDraft,
                      executionDisabled: executionDisabledDraft,
                      onExecutionDisabledChange: setExecutionDisabledDraft,
                    }
                    : {})}
                />
              </div>
            ) : null}
            {flowInspector?.kind === 'group' ? (
              <div className="grid gap-4">
                {flowInspector.ids.length > 1 ? <p className="text-xs leading-snug text-muted-foreground">{t('flowInspector.bulkVisualHint')}</p> : null}
                <FlowNodeVisualConfigPanel
                  value={nodeVisualDraft}
                  onChange={setNodeVisualDraft}
                  {...(flowInspector.ids.length === 1 ? { nodeDisplayName: nodeNameDraft, onNodeDisplayNameChange: setNodeNameDraft } : {})}
                  showConnectionHandlesToggle
                />
              </div>
            ) : null}
            {flowInspector?.kind === 'annotation' ? <PageMapAnnotationConfigPanel value={annotationDraft} onChange={setAnnotationDraft} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <RunDialog
        project={project}
        open={runOpen}
        onOpenChange={handleRunDialogOpenChange}
        pageIdsForRun={effectiveRunPageIds.length ? effectiveRunPageIds : undefined}
        groupIdsForRun={effectiveRunGroupIds.length ? effectiveRunGroupIds : undefined}
        scopeSummaryHint={scopeSummaryHint}
        ordered={runOrdered}
        startPageId={runStartPageId}
        onStarted={handleRunStarted}
      />

      <AlertDialog open={applyLayoutAllConfirmOpen} onOpenChange={setApplyLayoutAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('flowInspector.applyLayoutToAll')}</AlertDialogTitle>
            <AlertDialogDescription>{t('flowInspector.applyLayoutToAllConfirm', { count: pages.length })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setApplyLayoutAllConfirmOpen(false)
                void applyContentLayoutToAllPages()
              }}
            >
              {t('flowInspector.apply')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editPageOpen} onOpenChange={setEditPageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('automation.pageMap.editPageTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <div className="grid gap-1">
              <Label htmlFor="edit-page-map-name">{t('automation.pageMap.fieldName')}</Label>
              <Input id="edit-page-map-name" value={editPageName} onChange={e => setEditPageName(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-page-map-slug">{t('automation.pageMap.fieldSlug')}</Label>
              <Input id="edit-page-map-slug" value={editPageSlug} onChange={e => setEditPageSlug(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-page-map-desc">{t('automation.pageMap.fieldDescription')}</Label>
              <Textarea id="edit-page-map-desc" rows={3} value={editPageDesc} onChange={e => setEditPageDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditPageOpen(false)}>
              {t('automation.common.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!editPageName.trim()}
              onClick={() => {
                if (!ctxPageId || !editPageName.trim()) return
                if (editPageSlug.trim() && !isValidCatalogSlug(editPageSlug)) {
                  toast.error(t('automation.pageMap.slugInvalid'))
                  return
                }
                void trackPageMapPersist(async () => {
                  const res = await window.api.automation.catalogPage.update({
                    id: ctxPageId,
                    patch: {
                      name: editPageName.trim(),
                      slug: editPageSlug.trim() || undefined,
                      description: editPageDesc.trim() || undefined,
                    },
                  })
                  if (res.status === 'success') {
                    setEditPageOpen(false)
                    await loadGraph()
                  } else toast.error(res.message ?? '')
                  return res
                })
              }}
            >
              {t('automation.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.pageMap.deletePage')}</AlertDialogTitle>
            <AlertDialogDescription>{t('automation.pageMap.deletePageConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!ctxPageId) return
                void (async () => {
                  const res = await window.api.automation.catalogPage.delete(ctxPageId)
                  if (res.status === 'success') {
                    toast.success(t('automation.pageMap.pageDeleted'))
                    setDeleteOpen(false)
                    setCtxPageId(null)
                    await loadGraph()
                  } else {
                    const msg = res.message ?? t('automation.pageMap.pageDeleteFailed')
                    if (/still has test cases/i.test(msg)) toast.error(t('automation.pageMap.deletePageBlockedCases'))
                    else toast.error(msg)
                  }
                })()
              }}
            >
              {t('automation.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteGroupTarget} onOpenChange={o => !o && setDeleteGroupTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.pageMap.deleteGroupTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('automation.pageMap.deleteGroupConfirm', { name: pendingDeleteGroup?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteGroup()}>{t('automation.common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('automation.pageMap.importCsvTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t('automation.pageMap.importCsvHint')}</p>
          <Textarea rows={10} value={importText} onChange={e => setImportText(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>
              {t('automation.common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void (async () => {
                  const rows = parseCatalogPagesCsv(importText)
                  if (!rows.length) {
                    toast.error(t('automation.pageMap.importCsvEmpty'))
                    return
                  }
                  setBusy('csv')
                  try {
                    let ok = 0
                    let fail = 0
                    await mapPool(rows, 4, async r => {
                      if (r.slug && !isValidCatalogSlug(r.slug)) {
                        fail++
                        return { ok: false as const }
                      }
                      const res = await window.api.automation.catalogPage.create({
                        projectId,
                        name: r.name,
                        slug: r.slug,
                        description: r.description,
                      })
                      if (res.status === 'success') {
                        ok++
                        return { ok: true as const }
                      }
                      fail++
                      return { ok: false as const }
                    })
                    if (ok === 0) {
                      toast.error(t('automation.pageMap.importCsvFailed'))
                    } else {
                      toast.success(fail > 0 ? t('automation.pageMap.importCsvResult', { ok, fail }) : t('automation.pageMap.importCsvDone'))
                    }
                    setImportOpen(false)
                    setImportText('')
                    await loadGraph()
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
            >
              {t('automation.pageMap.importCsvRun')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('automation.pageMap.helpTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">{t('automation.pageMap.helpBody')}</p>
          <PageMapHelpLegendTable />
          <DialogFooter>
            <Button size="sm" onClick={() => setHelpOpen(false)}>
              {t('automation.common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
