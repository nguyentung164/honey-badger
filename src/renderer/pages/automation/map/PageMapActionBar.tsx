'use client'

import { type Node, Panel, useReactFlow } from '@xyflow/react'
import { toPng } from 'html-to-image'
import type { TFunction } from 'i18next'
import {
  BadgeCheck,
  Camera,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  FileStack,
  FileUp,
  Focus,
  GalleryHorizontal,
  GalleryVertical,
  Group,
  LayoutGrid,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Orbit,
  Play,
  PlayCircle,
  Plus,
  Redo2,
  Route,
  Search,
  StickyNote,
  Undo2,
  Ungroup,
} from 'lucide-react'
import {
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react'
import type { TestCatalogGroup, TestCatalogPage, TestPageNavEdge } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { FlowCanvasZoomLockControls } from '@/components/flow-inspector/FlowCanvasZoomLockControls'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import {
  type CatalogMapLayoutAlgo,
  computeCatalogPageMapLayout,
  isValidCatalogSlug,
  unionShortestPathEdgesUndirected,
} from '@/pages/automation/map/pageMapLayout'
import { mergeNodeVisualStyle } from 'shared/flowDiagramStyle'
import { readBoardContentDefaults } from 'shared/flowNodeBoardDefaults'
import { getNodesSizedForAutoLayout } from 'shared/flowCanvasAutoLayout'
import { pagesNeedingGroupAssignment } from '@/pages/automation/map/pageMapGroupAssign'
import { trackPageMapPersistAll } from '@/pages/automation/map/pageMapAutosaveStore'
import {
  getPageMapActionBarVertical,
  subscribePageMapActionBarVertical,
} from '@/pages/automation/map/pageMapActionBarLayoutStore'
import {
  ActionBarMotionInlineGroup,
  ActionBarMotionItem,
  ActionBarMotionStrip,
} from '@/pages/automation/map/pageMapActionBarMotion'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

const verticalBarRowTriggerClass =
  'h-auto min-h-7 w-full shrink-0 justify-start gap-1.5 px-2 py-1 text-xs font-normal shadow-none'

/** Right-aligned “>” for toolbar controls that open a menu or popover */
function MenuTriggerChevron({ className }: { className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center text-muted-foreground', className)} aria-hidden>
      <ChevronRight className="size-3 opacity-70" />
    </span>
  )
}

/** Vertical sidebar: one full-width control with icon + label (no outer row frame). */
function VerticalBarActionButton({
  label,
  title: titleProp,
  onClick,
  disabled,
  variant: variantProp,
  className,
  suffix,
  children,
}: {
  label: string
  /** Native tooltip; defaults to `label` */
  title?: string
  onClick?: () => void
  disabled?: boolean
  variant?: ComponentProps<typeof Button>['variant']
  className?: string
  /** e.g. menu chevron */
  suffix?: ReactNode
  children: ReactNode
}) {
  const buttonVariantSetting = useAppearanceStoreSelect(s => s.buttonVariant)
  const variant = variantProp ?? buttonVariantSetting
  const title = titleProp ?? label
  return (
    <Button
      type="button"
      variant={variant}
      className={cn(verticalBarRowTriggerClass, className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      <span className="flex shrink-0 items-center text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">{children}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {suffix ? <span className="flex shrink-0 items-center">{suffix}</span> : null}
    </Button>
  )
}

/** Vertical sidebar: titled block + controls (border under title when not first). */
function VerticalBarSection({ title, isFirst, children }: { title: string; isFirst?: boolean; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-0.5">
      <h3
        className={cn(
          'px-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
          isFirst ? 'pt-0' : 'mt-1 border-t border-border/50 pt-1.5'
        )}
      >
        {title}
      </h3>
      <div className="flex min-w-0 flex-col gap-0.5">{children}</div>
    </section>
  )
}

export type PageMapBottomBarProps = {
  projectId: string
  flowWrapRef: RefObject<HTMLDivElement | null>
  t: TFunction
  busy: string | null
  setBusy: (v: string | null) => void
  addOpen: boolean
  setAddOpen: (v: boolean) => void
  addName: string
  setAddName: (v: string) => void
  addSlug: string
  setAddSlug: (v: string) => void
  addDesc: string
  setAddDesc: (v: string) => void
  navEdges: TestPageNavEdge[]
  selectedIds: string[]
  pathEdgeIds: Set<string>
  setPathEdgeIds: Dispatch<SetStateAction<Set<string>>>
  handleOpenRun: () => void
  handleOpenRunAll: () => void
  runDisabled: boolean
  runAllDisabled: boolean
  runBusy: boolean
  handleUndo: () => void
  handleRedo: () => void
  undoAvailable: boolean
  redoAvailable: boolean
  capturePositions: (nds: Node[]) => Record<string, { x: number; y: number }>
  pushUndoPositions: (snap: Record<string, { x: number; y: number }>) => void
  setNodes: Dispatch<SetStateAction<Node[]>>
  loadGraph: () => Promise<void>
  setImportOpen: (v: boolean) => void
  miniMapVisible: boolean
  onMiniMapVisibleChange: (v: boolean) => void
  clearSelection: () => void
  onSelectAllPages: () => void
  showPreviousRunStatus: boolean
  onToggleLastRunStatus: (visible: boolean) => void
  hasLastRunStatus: boolean
  runStatusToggleDisabled: boolean
  pageCount: number
  pages: TestCatalogPage[]
  groups: TestCatalogGroup[]
  selectedPageIds: string[]
  selectedGroupIds: string[]
  onOpenCasesForGroup?: (groupId: string) => void
  onAssignToGroup: (groupId: string) => void
  onRunThisGroup: (groupId: string) => void
  onOpenHelp: () => void
  onExportCsv: () => void
  addGroupOpen: boolean
  setAddGroupOpen: (v: boolean) => void
  addGroupName: string
  setAddGroupName: (v: string) => void
  onCreateCatalogGroup: () => Promise<void>
  searchQ: string
  setSearchQ: (v: string) => void
  onRemoveSelectedPagesFromGroup: () => void
  onAddAnnotation: () => void
  canvasLocked: boolean
  onCanvasLockedChange: (locked: boolean) => void
  onApplyContentLayoutToAll?: () => void
}

export function PageMapBottomBar(props: PageMapBottomBarProps) {
  const {
    projectId,
    flowWrapRef,
    t,
    busy,
    setBusy,
    addOpen,
    setAddOpen,
    addName,
    setAddName,
    addSlug,
    setAddSlug,
    addDesc,
    setAddDesc,
    navEdges,
    selectedIds,
    pathEdgeIds,
    setPathEdgeIds,
    handleOpenRun,
    handleOpenRunAll,
    runDisabled,
    runAllDisabled,
    runBusy,
    handleUndo,
    handleRedo,
    undoAvailable,
    redoAvailable,
    capturePositions,
    pushUndoPositions,
    setNodes,
    loadGraph,
    setImportOpen,
    miniMapVisible,
    onMiniMapVisibleChange,
    clearSelection,
    onSelectAllPages,
    showPreviousRunStatus,
    onToggleLastRunStatus,
    runStatusToggleDisabled,
    pageCount,
    pages,
    groups,
    selectedPageIds,
    selectedGroupIds,
    onOpenCasesForGroup,
    onAssignToGroup,
    onRunThisGroup,
    onOpenHelp,
    onExportCsv,
    addGroupOpen,
    setAddGroupOpen,
    addGroupName,
    setAddGroupName,
    onCreateCatalogGroup,
    searchQ,
    setSearchQ,
    onRemoveSelectedPagesFromGroup,
    onAddAnnotation,
    canvasLocked,
    onCanvasLockedChange,
    onApplyContentLayoutToAll,
  } = props

  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const rf = useReactFlow()
  const isVertical = useSyncExternalStore(subscribePageMapActionBarVertical, getPageMapActionBarVertical, () => false)

  const actionBtnClass = 'h-7 gap-1 px-2 text-[11px]'
  const stripBtnClass = 'h-7 gap-1 px-2 text-[11px]'
  const verticalBarClass = 'flex min-w-[12.5rem] max-w-[18rem] flex-col items-stretch gap-0.5'
  const verticalBarSeparator = <Separator className="my-0.5 w-full" />

  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return [] as Array<{ kind: 'page' | 'group'; id: string; label: string; slug?: string }>
    const matches: Array<{ kind: 'page' | 'group'; id: string; label: string; slug?: string }> = []
    for (const g of groups) {
      if (g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q)) {
        matches.push({ kind: 'group', id: g.id, label: g.name })
      }
    }
    for (const p of pages) {
      if (p.name.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) {
        matches.push({ kind: 'page', id: p.id, label: p.name, slug: p.slug ?? undefined })
      }
    }
    return matches.slice(0, 12)
  }, [searchQ, pages, groups])

  const removeFromGroupSelectionCount = useMemo(() => {
    const sel = new Set(selectedIds)
    return pages.filter(p => sel.has(p.id) && p.groupId).length
  }, [selectedIds, pages])

  const handleSelectSearchResult = useCallback(
    (hit: { kind: 'page' | 'group'; id: string }) => {
      rf.fitView({ nodes: [{ id: hit.id }], padding: 0.35, duration: 400 })
      setSearchQ('')
    },
    [rf, setSearchQ]
  )

  const focusFirstMatch = useCallback(() => {
    const first = searchResults[0]
    if (first) handleSelectSearchResult(first)
  }, [searchResults, handleSelectSearchResult])

  const singleSelectedGroupId = selectedGroupIds.length === 1 ? selectedGroupIds[0] : undefined
  const showGroupStrip = !canvasLocked && selectedGroupIds.length === 1 && selectedPageIds.length === 0
  const showPageStrip = !canvasLocked && selectedPageIds.length > 0
  const showPathActions = selectedPageIds.length >= 2
  const hasSelection = selectedIds.length > 0
  const layoutMenuTitle = t('automation.pageMap.actionBarSectionLayout')

  const assignGroupOptions = useMemo(
    () =>
      [...groups]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(g => ({
          id: g.id,
          name: g.name,
          movableCount: pagesNeedingGroupAssignment(selectedPageIds, pages, g.id).length,
        })),
    [groups, selectedPageIds, pages]
  )

  const applyLayout = useCallback(
    async (algo: CatalogMapLayoutAlgo) => {
      const currentNodes = await getNodesSizedForAutoLayout(rf)
      const currentEdges = rf.getEdges()
      const posBefore = capturePositions(currentNodes)
      pushUndoPositions(posBefore)
      const laid = computeCatalogPageMapLayout(currentNodes, currentEdges, algo, { kind: 'all' })
      setNodes(nds =>
        nds.map(n => {
          const p = laid[n.id]
          return p ? { ...n, position: p } : n
        })
      )
      const groupIdSet = new Set(groups.map(g => g.id))
      const pageIdSet = new Set(pages.map(p => p.id))
      const annotationIdSet = new Set(
        rf.getNodes().filter(n => n.type === 'mapAnnotation').map(n => n.id)
      )
      const results = await trackPageMapPersistAll(() =>
        Promise.all(
          Object.entries(laid).map(([id, p]) => {
            if (groupIdSet.has(id)) {
              return window.api.automation.catalogGroup.update({ id, patch: { diagramX: p.x, diagramY: p.y } })
            }
            if (pageIdSet.has(id)) {
              return window.api.automation.catalogPage.update({ id, patch: { diagramX: p.x, diagramY: p.y } })
            }
            if (annotationIdSet.has(id)) {
              return window.api.automation.mapAnnotation.update({ id, patch: { diagramX: p.x, diagramY: p.y } })
            }
            return Promise.resolve({ status: 'success' as const })
          })
        )
      )
      const failed = results.some(r => r.status !== 'success')
      if (failed) {
        toast.error(t('devPipelines.saveError'))
        return
      }
      requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 300 }))
      toast.success(t('automation.pageMap.autoLayoutDone'))
    },
    [rf, capturePositions, pushUndoPositions, setNodes, t, groups, pages]
  )

  const handleLayoutVertical = useCallback(() => void applyLayout('dagre-tb'), [applyLayout])
  const handleLayoutHorizontal = useCallback(() => void applyLayout('dagre-lr'), [applyLayout])
  const handleLayoutRadial = useCallback(() => void applyLayout('radial'), [applyLayout])
  const layoutAlgoDisabled = !!busy || canvasLocked

  const renderLayoutMenuItems = () => (
    <>
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t('automation.pageMap.actionBarSectionLayout')}
      </DropdownMenuLabel>
      <DropdownMenuItem onClick={() => rf.fitView({ padding: 0.2 })}>
        <Focus className="size-4" />
        {t('automation.pageMap.fitView')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLayoutVertical} disabled={layoutAlgoDisabled}>
        <GalleryVertical className="size-4" />
        {t('automation.pageMap.layoutAlgoVertical')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleLayoutHorizontal} disabled={layoutAlgoDisabled}>
        <GalleryHorizontal className="size-4" />
        {t('automation.pageMap.layoutAlgoHorizontal')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleLayoutRadial} disabled={layoutAlgoDisabled}>
        <Orbit className="size-4" />
        {t('automation.pageMap.layoutAlgoRadial')}
      </DropdownMenuItem>
      {onApplyContentLayoutToAll ? (
        <DropdownMenuItem onClick={onApplyContentLayoutToAll} disabled={layoutAlgoDisabled}>
          <LayoutGrid className="size-4" />
          {t('flowInspector.applyLayoutToAll')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleUndo} disabled={!undoAvailable || canvasLocked}>
        <Undo2 className="size-4" />
        {t('automation.pageMap.undoLayout')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleRedo} disabled={!redoAvailable || canvasLocked}>
        <Redo2 className="size-4" />
        {t('automation.pageMap.redoLayout')}
      </DropdownMenuItem>
    </>
  )

  const renderAssignToGroupControl = (compact?: boolean) => {
    const disabled = selectedPageIds.length === 0 || !!busy || groups.length === 0
    const menu = (
      <DropdownMenuContent side={compact ? 'right' : 'top'} align="start" className="max-h-64 w-52 overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t('automation.pageMap.assignToGroupPick')}
        </DropdownMenuLabel>
        {assignGroupOptions.length === 0 ? (
          <DropdownMenuItem disabled>{t('automation.pageMap.assignToGroupNoGroups')}</DropdownMenuItem>
        ) : (
          assignGroupOptions.map(g => (
            <DropdownMenuItem key={g.id} disabled={g.movableCount === 0} onClick={() => onAssignToGroup(g.id)}>
              <span className="truncate">{g.name}</span>
              {g.movableCount > 0 ? <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{g.movableCount}</span> : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    )
    if (compact) {
      const pickLabel = t('automation.pageMap.assignToGroupPick')
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={buttonVariant}
              className={cn(verticalBarRowTriggerClass)}
              disabled={disabled}
              title={pickLabel}
              aria-label={pickLabel}
            >
              <span className="flex shrink-0 items-center text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
                <Group />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{pickLabel}</span>
              <MenuTriggerChevron className="ml-auto" />
            </Button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      )
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant={buttonVariant} className={stripBtnClass} disabled={disabled}>
            <Group className="size-3 shrink-0" />
            {t('automation.pageMap.assignToGroup')}
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    )
  }

  const handleAddPage = async () => {
    if (!addName.trim()) return
    if (addSlug.trim() && !isValidCatalogSlug(addSlug)) {
      toast.error(t('automation.pageMap.slugInvalid'))
      return
    }
    setBusy('add')
    try {
      const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      const res = await window.api.automation.catalogPage.create({
        projectId,
        name: addName.trim(),
        slug: addSlug.trim() || undefined,
        description: addDesc.trim() || undefined,
      })
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? t('automation.pageMap.pageCreateFailed'))
        return
      }
      const p = res.data
      const boardLayout = readBoardContentDefaults('pageMap')
      await window.api.automation.catalogPage.update({
        id: p.id,
        patch: {
          diagramX: center.x - 100,
          diagramY: center.y - 40,
          ...(boardLayout ? { diagramStyle: mergeNodeVisualStyle(boardLayout) } : {}),
        },
      })
      toast.success(t('automation.pageMap.pageCreated'))
      setAddOpen(false)
      setAddName('')
      setAddSlug('')
      setAddDesc('')
      await loadGraph()
      requestAnimationFrame(() => rf.fitView({ nodes: [{ id: p.id }], padding: 0.45, duration: 400 }))
    } finally {
      setBusy(null)
    }
  }

  const exportPng = async () => {
    const el = flowWrapRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) {
      toast.error(t('automation.pageMap.exportPngFail'))
      return
    }
    setBusy('png')
    try {
      const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `page-map-${projectId}.png`
      a.click()
      toast.success(t('automation.pageMap.exportPngDone'))
    } catch {
      toast.error(t('automation.pageMap.exportPngFail'))
    } finally {
      setBusy(null)
    }
  }

  const pathHighlightActive = pathEdgeIds.size > 0
  const pathHighlightToggleLabel = pathHighlightActive
    ? t('automation.pageMap.pathClear')
    : t('automation.pageMap.pathHighlight')

  const handlePathHighlightToggle = () => {
    if (pathHighlightActive) {
      setPathEdgeIds(new Set())
      return
    }
    const unique = [...new Set(selectedIds)]
    const pageOnlyIds = unique.filter(id => pages.some(p => p.id === id))
    if (pageOnlyIds.length < 2) {
      toast.info(t('automation.pageMap.pathNeedTwo'))
      return
    }
    const edgeList = navEdges.map(e => ({ id: e.id, source: e.sourcePageId, target: e.targetPageId }))
    const ids = unionShortestPathEdgesUndirected(pageOnlyIds, edgeList)
    if (!ids.length) toast.info(t('automation.pageMap.pathNone'))
    setPathEdgeIds(new Set(ids))
  }

  const actionMenuAria = t('automation.pageMap.actionBarSectionAction')
  const minimapToggleLabel = miniMapVisible ? t('automation.pageMap.hideMinimap') : t('automation.pageMap.showMinimap')

  const renderMinimapToggle = (compact?: boolean) =>
    compact ? (
      <VerticalBarActionButton
        label={minimapToggleLabel}
        title={minimapToggleLabel}
        variant={miniMapVisible ? 'secondary' : undefined}
        onClick={() => onMiniMapVisibleChange(!miniMapVisible)}
      >
        {miniMapVisible ? <Eye /> : <EyeOff />}
      </VerticalBarActionButton>
    ) : (
      <Button
        type="button"
        size="icon"
        variant={miniMapVisible ? 'secondary' : buttonVariant}
        className="size-7 shrink-0"
        aria-label={minimapToggleLabel}
        title={minimapToggleLabel}
        aria-pressed={miniMapVisible}
        onClick={() => onMiniMapVisibleChange(!miniMapVisible)}
      >
        {miniMapVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </Button>
    )

  const renderActionMenuItems = () => (
    <>
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{actionMenuAria}</DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <FileUp className="size-4" />
          {t('automation.pageMap.importMenu')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={() => setImportOpen(true)}>{t('automation.pageMap.importCsv')}</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Download className="size-4" />
          {t('automation.pageMap.exportMenu')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={() => void onExportCsv()} disabled={!!busy || pageCount === 0}>
            <Download className="size-4" />
            {t('automation.pageMap.exportCsv')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void exportPng()} disabled={busy === 'png'}>
            <Camera className="size-4" />
            {t('automation.pageMap.exportPng')}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onClick={onOpenHelp}>
        <CircleHelp className="size-4" />
        {t('automation.pageMap.help')}
      </DropdownMenuItem>
    </>
  )

  const handleToggleSelectAll = useCallback(() => {
    if (hasSelection) clearSelection()
    else onSelectAllPages()
  }, [clearSelection, hasSelection, onSelectAllPages])

  const renderSelectAllControl = (compact?: boolean) => {
    const label = hasSelection ? t('automation.pageMap.clearSelection') : t('automation.pageMap.selectAllPages')
    if (compact) {
      return (
        <VerticalBarActionButton
          label={label}
          variant={hasSelection ? 'secondary' : undefined}
          onClick={handleToggleSelectAll}
          disabled={pageCount === 0}
        >
          <ListChecks />
        </VerticalBarActionButton>
      )
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant={hasSelection ? 'secondary' : buttonVariant}
            className="size-7 shrink-0"
            onClick={handleToggleSelectAll}
            disabled={pageCount === 0}
            aria-label={label}
            aria-pressed={hasSelection}
            title={label}
          >
            <ListChecks className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    )
  }

  const actionBarOrientation = isVertical ? 'vertical' : 'horizontal'

  const horizontalBarShellClass =
    'rounded-xl bg-card/95 px-2 py-1.5 text-card-foreground shadow-lg shadow-black/10 backdrop-blur-sm'
  const horizontalRowClass = 'flex w-fit max-w-full flex-nowrap items-center gap-1'
  const horizontalBarsStackClass = 'flex w-fit max-w-full flex-col items-center gap-1.5'

  return (
    <Panel
      position={isVertical ? 'top-left' : 'top-center'}
      className={cn(
        isVertical
          ? 'm-2 w-auto rounded-lg border border-border bg-card/95 px-1 py-1 text-card-foreground shadow-sm backdrop-blur-sm'
          : 'pointer-events-auto mt-2 w-auto max-w-[calc(100vw-1rem)] px-1'
      )}
    >
      {isVertical ? (
          <div role="toolbar" aria-label={t('automation.pageMap.actionBarAria')} className={verticalBarClass}>
            <VerticalBarSection title={t('automation.pageMap.verticalBarGroupRun')} isFirst>
              <VerticalBarActionButton
                label={t('automation.pageMap.runSelected')}
                onClick={handleOpenRun}
                disabled={runDisabled || runBusy}
              >
                {runBusy ? <Loader2 className="animate-spin" /> : <Play />}
              </VerticalBarActionButton>
              <VerticalBarActionButton
                label={t('automation.pageMap.runAllPages')}
                onClick={handleOpenRunAll}
                disabled={runAllDisabled}
              >
                <PlayCircle />
              </VerticalBarActionButton>
              <VerticalBarActionButton
                label={t('automation.pageMap.showLastRunStatus')}
                title={t('automation.pageMap.showLastRunStatusTooltip')}
                variant={showPreviousRunStatus ? 'secondary' : undefined}
                disabled={runStatusToggleDisabled}
                onClick={() => onToggleLastRunStatus(!showPreviousRunStatus)}
              >
                <BadgeCheck />
              </VerticalBarActionButton>
            </VerticalBarSection>

            <VerticalBarSection title={t('automation.pageMap.verticalBarGroupAdd')}>
              <VerticalBarActionButton label={t('automation.pageMap.addPage')} onClick={() => setAddOpen(true)} disabled={!!busy || canvasLocked}>
                <Plus />
              </VerticalBarActionButton>
              <VerticalBarActionButton label={t('automation.pageMap.addGroup')} onClick={() => setAddGroupOpen(true)} disabled={!!busy || canvasLocked}>
                <Group />
              </VerticalBarActionButton>
              <VerticalBarActionButton label={t('automation.pageMap.addAnnotation')} onClick={() => void onAddAnnotation()} disabled={!!busy || canvasLocked}>
                <StickyNote />
              </VerticalBarActionButton>
            </VerticalBarSection>

            <VerticalBarSection title={t('automation.pageMap.verticalBarGroupTools')}>
              <div className="flex w-full min-w-0 flex-col gap-1">
                <div className="relative w-full min-w-0">
                  <Search className="pointer-events-none absolute left-2 top-1/2 z-10 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-7 w-full min-w-0 border-border bg-background pl-7 pr-2 text-[11px] shadow-sm"
                    placeholder={t('flowInspector.searchPlaceholder')}
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') focusFirstMatch()
                      if (e.key === 'Escape') {
                        setSearchQ('')
                        e.currentTarget.blur()
                      }
                    }}
                    aria-label={t('flowInspector.searchPlaceholder')}
                  />
                </div>
                {searchQ.trim() && searchResults.length > 0 ? (
                  <div className="max-h-40 w-full min-w-0 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-sm">
                    {searchResults.map(hit => (
                      <button
                        key={`${hit.kind}-${hit.id}`}
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left hover:bg-accent"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleSelectSearchResult(hit)}
                      >
                        <span className="truncate text-[11px] font-medium text-foreground">
                          {hit.kind === 'group' ? `${hit.label} (${t('automation.pageMap.groupKindLabel')})` : hit.label}
                        </span>
                        {hit.kind === 'page' && hit.slug ? (
                          <span className="truncate font-mono text-[9px] text-muted-foreground">{hit.slug}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant={buttonVariant}
                    className={cn(verticalBarRowTriggerClass)}
                    disabled={layoutAlgoDisabled}
                    aria-label={layoutMenuTitle}
                    title={layoutMenuTitle}
                  >
                    <span className="flex shrink-0 items-center text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
                      <LayoutGrid />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left text-xs">{layoutMenuTitle}</span>
                    <MenuTriggerChevron className="ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-52">
                  {renderLayoutMenuItems()}
                </DropdownMenuContent>
              </DropdownMenu>

              {renderMinimapToggle(true)}
              <FlowCanvasZoomLockControls
                variant="vertical"
                canvasLocked={canvasLocked}
                onCanvasLockedChange={onCanvasLockedChange}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant={buttonVariant}
                    className={cn(verticalBarRowTriggerClass)}
                    aria-label={actionMenuAria}
                    title={actionMenuAria}
                  >
                    <span className="flex shrink-0 items-center text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
                      <MoreHorizontal />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left text-xs">{actionMenuAria}</span>
                    <MenuTriggerChevron className="ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-52">
                  {renderActionMenuItems()}
                </DropdownMenuContent>
              </DropdownMenu>

              {!canvasLocked ? renderSelectAllControl(true) : null}
            </VerticalBarSection>
          </div>
        ) : (
          <div className={horizontalBarsStackClass}>
            <div className={horizontalBarShellClass}>
              <div role="toolbar" aria-label={t('automation.pageMap.actionBarAria')} className={horizontalRowClass}>
              <Button
                type="button"
                size="sm"
                variant={buttonVariant}
                className={actionBtnClass}
                onClick={handleOpenRun}
                disabled={runDisabled || runBusy}
                title={t('automation.pageMap.runSelectedTooltip')}
              >
                {runBusy ? <Loader2 className="size-3 shrink-0 animate-spin" /> : <Play className="size-3 shrink-0" />}
                <span className="hidden sm:inline">{t('automation.pageMap.runSelected')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={buttonVariant}
                className={actionBtnClass}
                onClick={handleOpenRunAll}
                disabled={runAllDisabled}
                title={t('automation.pageMap.runAllTooltip')}
              >
                <PlayCircle className="size-3 shrink-0" />
                <span className="hidden sm:inline">{t('automation.pageMap.runAllPages')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showPreviousRunStatus ? 'secondary' : buttonVariant}
                className={actionBtnClass}
                disabled={runStatusToggleDisabled}
                title={t('automation.pageMap.showLastRunStatusTooltip')}
                aria-pressed={showPreviousRunStatus}
                onClick={() => onToggleLastRunStatus(!showPreviousRunStatus)}
              >
                <BadgeCheck className="size-3 shrink-0" />
                <span className="hidden sm:inline">{t('automation.pageMap.showLastRunStatus')}</span>
              </Button>

              <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 self-center" />

              <Button type="button" size="sm" variant={buttonVariant} className={actionBtnClass} onClick={() => setAddOpen(true)} disabled={!!busy || canvasLocked}>
                <Plus className="size-3 shrink-0" />
                <span className="hidden sm:inline">{t('automation.pageMap.addPage')}</span>
              </Button>
              <Button type="button" size="sm" variant={buttonVariant} className={actionBtnClass} onClick={() => setAddGroupOpen(true)} disabled={!!busy || canvasLocked}>
                <Group className="size-3 shrink-0" />
                <span className="hidden sm:inline">{t('automation.pageMap.addGroup')}</span>
              </Button>
              <Button type="button" size="sm" variant={buttonVariant} className={actionBtnClass} onClick={() => void onAddAnnotation()} disabled={!!busy || canvasLocked}>
                <StickyNote className="size-3 shrink-0" />
                <span className="hidden sm:inline">{t('automation.pageMap.addAnnotation')}</span>
              </Button>

              <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 self-center" />

              <div className="relative w-[10rem] shrink-0 sm:w-[14rem]">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-7 pl-6 pr-2 text-[11px]"
                  placeholder={t('flowInspector.searchPlaceholder')}
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') focusFirstMatch()
                    if (e.key === 'Escape') {
                      setSearchQ('')
                      e.currentTarget.blur()
                    }
                  }}
                  aria-label={t('flowInspector.searchPlaceholder')}
                />
                {searchQ.trim() && searchResults.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {searchResults.map(hit => (
                      <button
                        key={`${hit.kind}-${hit.id}`}
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left hover:bg-accent"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleSelectSearchResult(hit)}
                      >
                        <span className="truncate text-[11px] font-medium text-foreground">
                          {hit.kind === 'group' ? `${hit.label} (${t('automation.pageMap.groupKindLabel')})` : hit.label}
                        </span>
                        {hit.kind === 'page' && hit.slug ? (
                          <span className="truncate font-mono text-[9px] text-muted-foreground">{hit.slug}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 self-center" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant={buttonVariant} className={actionBtnClass} disabled={layoutAlgoDisabled} title={layoutMenuTitle}>
                    <LayoutGrid className="size-3 shrink-0" />
                    <span className="hidden sm:inline">{t('automation.pageMap.actionBarSectionLayout')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {renderLayoutMenuItems()}
                </DropdownMenuContent>
              </DropdownMenu>

              {renderMinimapToggle()}

              <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 self-center" />

              <FlowCanvasZoomLockControls
                canvasLocked={canvasLocked}
                onCanvasLockedChange={onCanvasLockedChange}
              />

              <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 self-center" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant={buttonVariant} className="size-7 shrink-0" aria-label={actionMenuAria} title={actionMenuAria}>
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {renderActionMenuItems()}
                </DropdownMenuContent>
              </DropdownMenu>

              {!canvasLocked ? renderSelectAllControl() : null}
              </div>
            </div>

            <ActionBarMotionStrip show={showGroupStrip} orientation={actionBarOrientation}>
              <div className={horizontalBarShellClass}>
                <div role="toolbar" aria-label={t('automation.pageMap.actionBarSectionGroups')} className={horizontalRowClass}>
                <Button
                  type="button"
                  size="sm"
                  variant={buttonVariant}
                  className={stripBtnClass}
                  disabled={runBusy}
                  onClick={() => singleSelectedGroupId && onRunThisGroup(singleSelectedGroupId)}
                >
                  <PlayCircle className="size-3 shrink-0" />
                  {t('automation.pageMap.runThisGroup')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={buttonVariant}
                  className={stripBtnClass}
                  onClick={() => singleSelectedGroupId && onOpenCasesForGroup?.(singleSelectedGroupId)}
                >
                  <FileStack className="size-3 shrink-0" />
                  {t('automation.pageMap.openCasesInGroup')}
                </Button>
                </div>
              </div>
            </ActionBarMotionStrip>

            <ActionBarMotionStrip show={showPageStrip} orientation={actionBarOrientation}>
              <div className={horizontalBarShellClass}>
                <div role="toolbar" aria-label={t('automation.pageMap.actionBarSectionSelection')} className={horizontalRowClass}>
                <ActionBarMotionInlineGroup show={showPathActions} motionKey="path-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant={pathHighlightActive ? 'secondary' : buttonVariant}
                    className={stripBtnClass}
                    aria-pressed={pathHighlightActive}
                    title={pathHighlightToggleLabel}
                    onClick={handlePathHighlightToggle}
                  >
                    <Route className="size-3 shrink-0" />
                    {pathHighlightToggleLabel}
                  </Button>
                </ActionBarMotionInlineGroup>
                {renderAssignToGroupControl()}
                <Button
                  type="button"
                  size="sm"
                  variant={buttonVariant}
                  className={stripBtnClass}
                  title={t('automation.pageMap.removeFromGroupHint')}
                  disabled={removeFromGroupSelectionCount === 0 || !!busy}
                  onClick={() => void onRemoveSelectedPagesFromGroup()}
                >
                  <Ungroup className="size-3 shrink-0" />
                  {t('automation.pageMap.removeFromGroup')}
                </Button>
                </div>
              </div>
            </ActionBarMotionStrip>
          </div>
        )}

        {isVertical ? (
          <>
            <ActionBarMotionStrip
              show={showGroupStrip}
              orientation={actionBarOrientation}
              separator={verticalBarSeparator}
              className={verticalBarClass}
            >
              <div role="toolbar" aria-label={t('automation.pageMap.actionBarSectionGroups')} className={verticalBarClass}>
                <VerticalBarSection title={t('automation.pageMap.verticalBarGroupGroupActions')} isFirst>
                  <VerticalBarActionButton
                    label={t('automation.pageMap.runThisGroup')}
                    disabled={runBusy}
                    onClick={() => singleSelectedGroupId && onRunThisGroup(singleSelectedGroupId)}
                  >
                    <PlayCircle />
                  </VerticalBarActionButton>
                  <VerticalBarActionButton
                    label={t('automation.pageMap.openCasesInGroup')}
                    onClick={() => singleSelectedGroupId && onOpenCasesForGroup?.(singleSelectedGroupId)}
                  >
                    <FileStack />
                  </VerticalBarActionButton>
                </VerticalBarSection>
              </div>
            </ActionBarMotionStrip>

            <ActionBarMotionStrip
              show={showPageStrip}
              orientation={actionBarOrientation}
              separator={verticalBarSeparator}
              className={verticalBarClass}
            >
              <div role="toolbar" aria-label={t('automation.pageMap.actionBarSectionSelection')} className={verticalBarClass}>
                <ActionBarMotionItem show={showPathActions} orientation="vertical" motionKey="path-section">
                  <VerticalBarSection title={t('automation.pageMap.verticalBarGroupPath')} isFirst>
                    <VerticalBarActionButton
                      label={pathHighlightToggleLabel}
                      title={pathHighlightToggleLabel}
                      variant={pathHighlightActive ? 'secondary' : undefined}
                      onClick={handlePathHighlightToggle}
                    >
                      <Route />
                    </VerticalBarActionButton>
                  </VerticalBarSection>
                </ActionBarMotionItem>
                <VerticalBarSection title={t('automation.pageMap.verticalBarGroupPageActions')} isFirst={!showPathActions}>
                  {renderAssignToGroupControl(true)}
                  <VerticalBarActionButton
                    label={t('automation.pageMap.removeFromGroup')}
                    disabled={removeFromGroupSelectionCount === 0 || !!busy}
                    onClick={() => void onRemoveSelectedPagesFromGroup()}
                  >
                    <Ungroup />
                  </VerticalBarActionButton>
                </VerticalBarSection>
              </div>
            </ActionBarMotionStrip>
          </>
        ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('automation.pageMap.addPageTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <div className="grid gap-1">
              <Label>{t('automation.pageMap.fieldName')}</Label>
              <Input value={addName} onChange={e => setAddName(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>{t('automation.pageMap.fieldSlug')}</Label>
              <Input value={addSlug} onChange={e => setAddSlug(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>{t('automation.pageMap.fieldDescription')}</Label>
              <Textarea rows={3} value={addDesc} onChange={e => setAddDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
              {t('automation.common.cancel')}
            </Button>
            <Button size="sm" variant={buttonVariant} onClick={() => void handleAddPage()} disabled={!addName.trim() || busy === 'add'}>
              {busy === 'add' ? <Loader2 className="size-4 animate-spin" /> : t('automation.pageMap.addPage')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="max-w-sm" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('automation.pageMap.addGroupTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-group-name">{t('automation.pageMap.fieldGroupName')}</Label>
            <Input id="new-group-name" value={addGroupName} onChange={e => setAddGroupName(e.target.value)} placeholder={t('automation.pageMap.addGroupNamePlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddGroupOpen(false)}>
              {t('automation.common.cancel')}
            </Button>
            <Button size="sm" variant={buttonVariant} onClick={() => void onCreateCatalogGroup()} disabled={!addGroupName.trim() || busy === 'addGroup'}>
              {busy === 'addGroup' ? <Loader2 className="size-4 animate-spin" /> : t('automation.pageMap.addGroup')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
