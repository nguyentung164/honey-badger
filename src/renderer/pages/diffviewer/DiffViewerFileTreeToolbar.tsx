'use client'

import {
  ArrowDownAZ,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  FolderInput,
  FolderTree,
  List,
  ListFilter,
  Plus,
  RotateCcw,
  SquareMinus,
  SquarePlus,
} from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type {
  DiffFileTreeSortBy,
  DiffFileTreeStatusFilter,
  DiffFileTreeViewMode,
} from './diffViewerFileTree'

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

const iconBtnClass =
  'h-7 w-7 shrink-0 rounded-sm p-0 shadow-none text-muted-foreground transition-colors hover:!bg-muted hover:!text-muted-foreground dark:hover:!bg-muted/80 dark:hover:!text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0'

function ToolbarIconButton({
  label,
  disabled,
  destructive,
  active,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  destructive?: boolean
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            iconBtnClass,
            active && 'bg-muted/80 text-foreground',
            destructive && 'text-destructive hover:!text-destructive hover:!bg-destructive/15'
          )}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          style={noDragStyle}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border/80" aria-hidden />
}

const STATUS_FILTER_OPTIONS: DiffFileTreeStatusFilter[] = [
  'all',
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'conflicted',
]

interface DiffViewerFileTreeToolbarProps {
  disabled?: boolean
  showStageActions?: boolean
  viewMode: DiffFileTreeViewMode
  sortBy: DiffFileTreeSortBy
  groupByFolder: boolean
  statusFilter: DiffFileTreeStatusFilter
  canCollapseFolders?: boolean
  canStageSelected?: boolean
  canStageAll?: boolean
  canUnstageAll?: boolean
  onToggleViewMode: () => void
  onSortByChange: (sortBy: DiffFileTreeSortBy) => void
  onToggleGroupByFolder: () => void
  onStatusFilterChange: (filter: DiffFileTreeStatusFilter) => void
  onCollapseAll: () => void
  onExpandAll: () => void
  onStageSelected: () => void
  onStageAll: () => void
  onUnstageAll: () => void
  onDiscardAll: () => void
  showLocalIgnorePatterns?: boolean
  onOpenLocalIgnorePatterns?: () => void
}

export function DiffViewerFileTreeToolbar({
  disabled = false,
  showStageActions = false,
  viewMode,
  sortBy,
  groupByFolder,
  statusFilter,
  canCollapseFolders = true,
  canStageSelected = false,
  canStageAll = true,
  canUnstageAll = true,
  onToggleViewMode,
  onSortByChange,
  onToggleGroupByFolder,
  onStatusFilterChange,
  onCollapseAll,
  onExpandAll,
  onStageSelected,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  showLocalIgnorePatterns = false,
  onOpenLocalIgnorePatterns,
}: DiffViewerFileTreeToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-w-0 items-center gap-0.5 bg-muted/30 px-1 py-1" style={noDragStyle}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
        <ToolbarIconButton
          label={viewMode === 'tree' ? t('dialog.diffViewer.treeViewFlat') : t('dialog.diffViewer.treeViewTree')}
          disabled={disabled}
          onClick={onToggleViewMode}
        >
          {viewMode === 'tree' ? <List className="h-3.5 w-3.5" /> : <FolderTree className="h-3.5 w-3.5" />}
        </ToolbarIconButton>

        <ToolbarIconButton
          label={t('dialog.diffViewer.treeGroupByFolder')}
          disabled={disabled}
          active={groupByFolder && viewMode === 'flat'}
          onClick={onToggleGroupByFolder}
        >
          <FolderInput className="h-3.5 w-3.5" />
        </ToolbarIconButton>

        {viewMode === 'tree' || groupByFolder ? (
          <>
            <ToolbarIconButton
              label={t('dialog.diffViewer.treeCollapseAll')}
              disabled={disabled || !canCollapseFolders}
              onClick={onCollapseAll}
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t('dialog.diffViewer.treeExpandAll')}
              disabled={disabled || !canCollapseFolders}
              onClick={onExpandAll}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </ToolbarIconButton>
          </>
        ) : null}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(iconBtnClass, sortBy !== 'path' && 'bg-muted/80')}
                  disabled={disabled}
                  aria-label={t('dialog.diffViewer.treeSort')}
                  style={noDragStyle}
                >
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t('dialog.diffViewer.treeSort')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="min-w-40" style={noDragStyle}>
            <DropdownMenuLabel className="text-xs">{t('dialog.diffViewer.treeSort')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sortBy} onValueChange={value => onSortByChange(value as DiffFileTreeSortBy)}>
              <DropdownMenuRadioItem value="name">{t('dialog.diffViewer.treeSortName')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="path">{t('dialog.diffViewer.treeSortPath')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status">{t('dialog.diffViewer.treeSortStatus')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(iconBtnClass, statusFilter !== 'all' && 'bg-muted/80 text-primary')}
                  disabled={disabled}
                  aria-label={t('dialog.diffViewer.treeFilterStatus')}
                  style={noDragStyle}
                >
                  <Filter className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t('dialog.diffViewer.treeFilterStatus')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="min-w-44" style={noDragStyle}>
            <DropdownMenuLabel className="text-xs">{t('dialog.diffViewer.treeFilterStatus')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={statusFilter}
              onValueChange={value => onStatusFilterChange(value as DiffFileTreeStatusFilter)}
            >
              {STATUS_FILTER_OPTIONS.map(option => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {t(`dialog.diffViewer.treeStatusFilter.${option}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {showStageActions ? (
          <>
            <ToolbarDivider />
            <ToolbarIconButton
              label={t('dialog.diffViewer.treeStageSelectedToolbar')}
              disabled={disabled || !canStageSelected}
              onClick={onStageSelected}
            >
              <Plus className="h-3.5 w-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t('dialog.diffViewer.treeStageAll')}
              disabled={disabled || !canStageAll}
              onClick={onStageAll}
            >
              <SquarePlus className="h-3.5 w-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t('dialog.diffViewer.treeUnstageAll')}
              disabled={disabled || !canUnstageAll}
              onClick={onUnstageAll}
            >
              <SquareMinus className="h-3.5 w-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t('dialog.diffViewer.treeDiscardAll')}
              disabled={disabled}
              destructive
              onClick={onDiscardAll}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </ToolbarIconButton>
          </>
        ) : null}
      </div>
      {showLocalIgnorePatterns && onOpenLocalIgnorePatterns ? (
        <ToolbarIconButton
          label={t('git.localIgnoreListTitle')}
          disabled={disabled}
          onClick={onOpenLocalIgnorePatterns}
        >
          <ListFilter className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}
    </div>
  )
}
