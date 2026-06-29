'use client'

import { Panel, useReactFlow } from '@xyflow/react'
import {
  Eye,
  EyeOff,
  Focus,
  GalleryHorizontal,
  GalleryVertical,
  Group,
  LayoutGrid,
  Orbit,
  Plus,
  Route,
  Search,
  SquareMousePointer,
  StickyNote,
  Ungroup,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FlowCanvasZoomLockControls } from '@/components/flow-inspector/FlowCanvasZoomLockControls'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ActionBarMotionInlineGroup, ActionBarMotionItem, ActionBarMotionStrip } from '@/pages/automation/map/pageMapActionBarMotion'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

const BAR_EASE = [0.22, 1, 0.36, 1] as const
const BAR_DURATION = 0.2

const horizontalBarShellClass =
  'rounded-xl bg-card/95 px-2 py-1.5 text-card-foreground shadow-lg shadow-black/10 backdrop-blur-sm'
const horizontalRowClass = 'flex w-fit max-w-full flex-nowrap items-center gap-1'
const horizontalBarsStackClass = 'flex w-fit max-w-full flex-col items-center gap-1.5'

export type PipelineSearchNode = { id: string; label: string }

export type PipelineAssignGroupOption = { id: string; name: string; movableCount: number }

export type PipelineBottomBarProps = {
  nodeCount: number
  anyNodeSelected: boolean
  selectedStepCount: number
  showPathActions: boolean
  pathHighlightActive: boolean
  pathHighlightLabel: string
  onPathHighlightToggle: () => void
  assignGroupOptions: PipelineAssignGroupOption[]
  onAssignToGroup: (groupId: string) => void
  removeFromGroupCount: number
  onRemoveFromGroup: () => void
  searchNodes: PipelineSearchNode[]
  onSearchSelect: (nodeId: string) => void
  onAddStep: () => void
  onAddGroup: () => void
  onAddNote: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onAutoLayout: (algo: 'dagre-tb' | 'dagre-lr' | 'radial') => void
  onApplyContentLayoutToAll?: () => void
  layoutDisabled?: boolean
  miniMapVisible: boolean
  onMiniMapVisibleChange: (visible: boolean) => void
  canvasLocked: boolean
  onCanvasLockedChange: (locked: boolean) => void
  /** Commit workflow: hide pipeline-only add actions. */
  hideAddActions?: boolean
}

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  className,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={pressed ? 'secondary' : 'ghost'}
          size="icon"
          className={cn('size-7 shrink-0', className)}
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function PipelineBottomBar({
  nodeCount,
  anyNodeSelected,
  selectedStepCount,
  showPathActions,
  pathHighlightActive,
  pathHighlightLabel,
  onPathHighlightToggle,
  assignGroupOptions,
  onAssignToGroup,
  removeFromGroupCount,
  onRemoveFromGroup,
  searchNodes,
  onSearchSelect,
  onAddStep,
  onAddGroup,
  onAddNote,
  onSelectAll,
  onClearSelection,
  onAutoLayout,
  onApplyContentLayoutToAll,
  layoutDisabled = false,
  miniMapVisible,
  onMiniMapVisibleChange,
  canvasLocked,
  onCanvasLockedChange,
  hideAddActions = false,
}: PipelineBottomBarProps) {
  const { t } = useTranslation()
  const rf = useReactFlow()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [searchQ, setSearchQ] = useState('')

  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return [] as PipelineSearchNode[]
    return searchNodes.filter(n => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).slice(0, 12)
  }, [searchNodes, searchQ])

  const focusFirstMatch = useCallback(() => {
    const first = searchResults[0]
    if (first) {
      onSearchSelect(first.id)
      setSearchQ('')
    }
  }, [onSearchSelect, searchResults])

  const handleSelectSearchResult = useCallback(
    (nodeId: string) => {
      onSearchSelect(nodeId)
      setSearchQ('')
    },
    [onSearchSelect]
  )

  const reduceMotion = useReducedMotion()
  const barTransition = reduceMotion ? { duration: 0 } : { duration: BAR_DURATION, ease: BAR_EASE }
  const showSelectAll = !canvasLocked && !anyNodeSelected
  const showStepStrip = !canvasLocked && selectedStepCount > 0
  const assignDisabled = selectedStepCount === 0 || assignGroupOptions.length === 0
  const stripBtnClass = 'h-7 gap-1 px-2 text-[11px]'
  const actionBtnClass = 'h-7 gap-1 px-2 text-[11px]'
  const layoutMenuTitle = t('automation.pageMap.actionBarSectionLayout')

  const renderLayoutMenuItems = () => (
    <>
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {layoutMenuTitle}
      </DropdownMenuLabel>
      <DropdownMenuItem onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}>
        <Focus className="size-4" />
        {t('automation.pageMap.fitView')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onAutoLayout('dagre-tb')} disabled={layoutDisabled}>
        <GalleryVertical className="size-4" />
        {t('automation.pageMap.layoutAlgoVertical')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAutoLayout('dagre-lr')} disabled={layoutDisabled}>
        <GalleryHorizontal className="size-4" />
        {t('automation.pageMap.layoutAlgoHorizontal')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAutoLayout('radial')} disabled={layoutDisabled}>
        <Orbit className="size-4" />
        {t('automation.pageMap.layoutAlgoRadial')}
      </DropdownMenuItem>
      {onApplyContentLayoutToAll ? (
        <DropdownMenuItem onClick={onApplyContentLayoutToAll} disabled={layoutDisabled}>
          <LayoutGrid className="size-4" />
          {t('flowInspector.applyLayoutToAll')}
        </DropdownMenuItem>
      ) : null}
    </>
  )

  return (
    <Panel position="top-center" className="pointer-events-auto mt-2 w-auto max-w-[calc(100vw-1rem)] px-1">
      <div className={horizontalBarsStackClass}>
        <motion.div
          layout={!reduceMotion}
          transition={barTransition}
          className={horizontalBarShellClass}
          role="toolbar"
          aria-label={t('devPipelines.actionBarAria')}
        >
          <div className={horizontalRowClass}>
        {hideAddActions ? null : (
          <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant={buttonVariant} size="sm" className={actionBtnClass} onClick={onAddStep} disabled={canvasLocked}>
              <Plus className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('devPipelines.addStep')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('devPipelines.addStep')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant={buttonVariant} size="sm" className={actionBtnClass} onClick={onAddGroup} disabled={canvasLocked}>
              <Group className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('devPipelines.addGroup')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('devPipelines.addGroup')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant={buttonVariant} size="sm" className={actionBtnClass} onClick={onAddNote} disabled={canvasLocked}>
              <StickyNote className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('devPipelines.addNote')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('devPipelines.addNote')}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-6 self-center" />
          </>
        )}

        <div className="relative w-[10rem] sm:w-[14rem]">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {searchResults.map(hit => (
                <button
                  key={hit.id}
                  type="button"
                  className="flex w-full truncate px-2.5 py-1.5 text-left text-[11px] hover:bg-accent"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelectSearchResult(hit.id)}
                >
                  {hit.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 self-center" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={buttonVariant}
              className={actionBtnClass}
              disabled={layoutDisabled}
              title={layoutMenuTitle}
            >
              <LayoutGrid className="size-3 shrink-0" />
              <span className="hidden sm:inline">{layoutMenuTitle}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {renderLayoutMenuItems()}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-0.5 h-6 self-center" />

        <div className="flex shrink-0 items-center gap-0.5">
          <FlowCanvasZoomLockControls
            canvasLocked={canvasLocked}
            onCanvasLockedChange={onCanvasLockedChange}
            fitViewPadding={0.15}
          />
          <ToolbarIconButton
            label={miniMapVisible ? t('devPipelines.hideMinimap') : t('devPipelines.showMinimap')}
            onClick={() => onMiniMapVisibleChange(!miniMapVisible)}
            pressed={miniMapVisible}
          >
            {miniMapVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </ToolbarIconButton>
        </div>

        {!canvasLocked ? (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-6 self-center" />

            <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
              <ActionBarMotionItem show={showSelectAll} orientation="horizontal" motionKey="pipeline-select-all">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={buttonVariant}
                      size="sm"
                      className={actionBtnClass}
                      onClick={onSelectAll}
                      disabled={nodeCount === 0}
                    >
                      <SquareMousePointer className="size-3.5 shrink-0" />
                      <span className="hidden sm:inline">{t('devPipelines.selectAll')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('devPipelines.selectAll')}</TooltipContent>
                </Tooltip>
              </ActionBarMotionItem>

              <ActionBarMotionItem show={anyNodeSelected} orientation="horizontal" motionKey="pipeline-clear-selection">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant={buttonVariant} size="sm" className={actionBtnClass} onClick={onClearSelection}>
                      <SquareMousePointer className="size-3.5 shrink-0" />
                      <span className="hidden sm:inline">{t('devPipelines.clearSelection')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('devPipelines.clearSelection')}</TooltipContent>
                </Tooltip>
              </ActionBarMotionItem>
            </div>
          </>
        ) : null}
          </div>
        </motion.div>

        <ActionBarMotionStrip show={showStepStrip} orientation="horizontal">
          <div className={horizontalBarShellClass}>
            <div role="toolbar" aria-label={t('automation.pageMap.actionBarSectionSelection')} className={horizontalRowClass}>
              <ActionBarMotionInlineGroup show={showPathActions} motionKey="pipeline-path-actions">
                <Button
                  type="button"
                  size="sm"
                  variant={pathHighlightActive ? 'secondary' : buttonVariant}
                  className={stripBtnClass}
                  aria-pressed={pathHighlightActive}
                  title={pathHighlightLabel}
                  onClick={onPathHighlightToggle}
                >
                  <Route className="size-3 shrink-0" />
                  {pathHighlightLabel}
                </Button>
              </ActionBarMotionInlineGroup>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant={buttonVariant} className={stripBtnClass} disabled={assignDisabled}>
                    <Group className="size-3 shrink-0" />
                    {t('automation.pageMap.assignToGroup')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="max-h-64 w-52 overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('automation.pageMap.assignToGroupPick')}
                  </DropdownMenuLabel>
                  {assignGroupOptions.length === 0 ? (
                    <DropdownMenuItem disabled>{t('automation.pageMap.assignToGroupNoGroups')}</DropdownMenuItem>
                  ) : (
                    assignGroupOptions.map(g => (
                      <DropdownMenuItem key={g.id} disabled={g.movableCount === 0} onClick={() => onAssignToGroup(g.id)}>
                        <span className="truncate">{g.name}</span>
                        {g.movableCount > 0 ? (
                          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{g.movableCount}</span>
                        ) : null}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                size="sm"
                variant={buttonVariant}
                className={stripBtnClass}
                title={t('automation.pageMap.removeFromGroupHint')}
                disabled={removeFromGroupCount === 0}
                onClick={onRemoveFromGroup}
              >
                <Ungroup className="size-3 shrink-0" />
                {t('automation.pageMap.removeFromGroup')}
              </Button>
            </div>
          </div>
        </ActionBarMotionStrip>
      </div>
    </Panel>
  )
}
