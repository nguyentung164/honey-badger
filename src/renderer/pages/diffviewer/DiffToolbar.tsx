'use client'
import { t } from 'i18next'
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown as ChevronDownNav,
  ChevronFirst,
  ChevronLast,
  Columns2,
  ExternalLink,
  FoldVertical,
  FolderOpen,
  GitCommitHorizontal,
  ListMinus,
  ListFilter,
  Map as MapIcon,
  Minus,
  RefreshCw,
  Replace,
  RotateCcw,
  Rows2,
  Save,
  Search,
  SkipForward,
  Space,
  Square,
  SquareMinus,
  SquarePlus,
  UnfoldVertical,
  Wand2,
  WrapText,
  X,
} from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
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
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DIFF_VIEWER_FONT_SIZE_MAX, DIFF_VIEWER_FONT_SIZE_MIN, type DiffViewerViewOptionKey, type DiffViewerViewOptions } from './diffViewerTypes'
import { DiffViewerAdvancedOptionsPanel } from './DiffViewerAdvancedOptions'
import { DiffViewerFilePicker } from './DiffViewerFilePicker'
import type { DiffViewerFileEntry } from './diffViewerPayload'
interface DiffToolbarProps {
  onRefresh?: () => void
  onSwapSides?: () => void
  onSave?: () => void
  onPrevChange?: () => void
  onNextChange?: () => void
  onFirstChange?: () => void
  onLastChange?: () => void
  changePosition?: { current: number; total: number }
  disableChangeNav?: boolean
  showNoChangesBadge?: boolean
  isSaving?: boolean
  filePath: string
  files?: DiffViewerFileEntry[]
  activeFile?: DiffViewerFileEntry
  onSelectFile?: (index: number) => void
  disableFilePicker?: boolean
  disableSave: boolean
  isDirty?: boolean
  onCloseRequest?: () => void
  hasMultipleFiles?: boolean
  filePosition?: { current: number; total: number }
  onPrevFile?: () => void
  onNextFile?: () => void
  disableFileNav?: boolean
  disablePrevFile?: boolean
  disableNextFile?: boolean
  wrapFileNav?: boolean
  showStageActions?: boolean
  stagingState?: 'staged' | 'unstaged'
  onStageToggle?: () => void
  isStaging?: boolean
  showRevertAction?: boolean
  onRevert?: () => void
  isReverting?: boolean
  showFormatAction?: boolean
  onFormat?: () => void
  isFormatting?: boolean
  disableFormat?: boolean
  showRemoveEmptyLinesAction?: boolean
  onRemoveEmptyLines?: () => void
  isRemovingEmptyLines?: boolean
  disableRemoveEmptyLines?: boolean
  showAutoAdvanceToggle?: boolean
  autoAdvance?: boolean
  onToggleAutoAdvance?: () => void
  showBlameToggle?: boolean
  showBlame?: boolean
  onToggleBlame?: () => void
  viewOptions: DiffViewerViewOptions
  onViewOptionChange: <K extends DiffViewerViewOptionKey>(key: K, value: DiffViewerViewOptions[K]) => void
  onOpenInEditor?: () => void
  onRevealInExplorer?: () => void
  onFind?: () => void
  onFindReplace?: () => void
}
const toggleBtnClass =
  'shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]'
const menuTriggerClass =
  'h-7 gap-1 px-2.5 text-xs font-medium shadow-none hover:bg-muted rounded-sm focus-visible:ring-0 focus-visible:ring-offset-0'
const viewMenuActiveClass = 'text-green-600 dark:text-green-400 focus:text-green-600 dark:focus:text-green-400'
const stageActionBtnClass =
  'text-green-600 dark:text-green-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-500/10'
const unstageActionBtnClass =
  'text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10'
const navPositionClass = 'min-w-[2.75rem] px-0.5 text-center text-xs tabular-nums shrink-0'
const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
function NavIconButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="link" size="sm" onClick={onClick} disabled={disabled} className={toggleBtnClass} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
function DragGutter({ className }: { className?: string }) {
  return <div className={cn('flex-1 min-w-6 self-stretch', className)} style={dragStyle} aria-hidden />
}
function ToolbarMenus({ style, children }: { style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className="flex items-center h-full gap-0.5 shrink-0" style={style}>
      {children}
    </div>
  )
}
function MenuTriggerLabel({ label }: { label: string }) {
  return <span>{label}</span>
}
function ViewMenuToggleItem({
  icon: Icon,
  label,
  active,
  disabled,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  active?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={onSelect}
      className={cn('gap-2', active && viewMenuActiveClass)}
    >
      <Icon strokeWidth={1.25} className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </DropdownMenuItem>
  )
}
export const DiffToolbar: React.FC<DiffToolbarProps> = ({
  onRefresh,
  onSwapSides,
  onSave,
  onPrevChange,
  onNextChange,
  onFirstChange,
  onLastChange,
  changePosition,
  disableChangeNav = false,
  showNoChangesBadge = false,
  isSaving = false,
  filePath,
  files = [],
  activeFile,
  onSelectFile,
  disableFilePicker = false,
  disableSave,
  isDirty = false,
  onCloseRequest,
  hasMultipleFiles = false,
  filePosition,
  onPrevFile,
  onNextFile,
  disableFileNav = false,
  disablePrevFile = false,
  disableNextFile = false,
  wrapFileNav = false,
  showStageActions = false,
  stagingState,
  onStageToggle,
  isStaging = false,
  showRevertAction = false,
  onRevert,
  isReverting = false,
  showFormatAction = false,
  onFormat,
  isFormatting = false,
  disableFormat = false,
  showRemoveEmptyLinesAction = false,
  onRemoveEmptyLines,
  isRemovingEmptyLines = false,
  disableRemoveEmptyLines = false,
  showAutoAdvanceToggle = false,
  autoAdvance = false,
  onToggleAutoAdvance,
  showBlameToggle = false,
  showBlame = false,
  onToggleBlame,
  viewOptions,
  onViewOptionChange,
  onOpenInEditor,
  onRevealInExplorer,
  onFind,
  onFindReplace,
}) => {
  const handleWindow = (action: string) => {
    if (action === 'close' && onCloseRequest) {
      onCloseRequest()
      return
    }
    window.api.electron.send('window:action', action)
  }
  return (
    <div
      className="flex items-center h-8 text-sm select-none min-w-0"
      style={
        {
          ...dragStyle,
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as React.CSSProperties
      }
    >
      {/* Left — logo (draggable) + labeled menus */}
      <div className="flex items-center h-full shrink-0 min-w-0" style={dragStyle}>
        <div className="w-10 h-full flex justify-center items-center shrink-0">
          <img src="logo.png" alt="" draggable={false} className="w-3.5 h-3.5 dark:brightness-130 pointer-events-none" />
        </div>
        <ToolbarMenus style={noDragStyle}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={menuTriggerClass}>
                <MenuTriggerLabel label={t('dialog.diffViewer.menuFile')} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52" style={noDragStyle}>
              {onRefresh && (
                <DropdownMenuItem onClick={() => void onRefresh()} className="gap-2">
                  <RefreshCw strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('common.refresh')}
                </DropdownMenuItem>
              )}
              {onSave && (
                <DropdownMenuItem onClick={onSave} disabled={isSaving || disableSave} className="gap-2">
                  <Save strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('common.save')}
                </DropdownMenuItem>
              )}
              {showFormatAction && onFormat ? (
                <DropdownMenuItem onClick={onFormat} disabled={isFormatting || disableFormat} className="gap-2">
                  <Wand2 strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('dialog.diffViewer.formatCode')}
                </DropdownMenuItem>
              ) : null}
              {showRemoveEmptyLinesAction && onRemoveEmptyLines ? (
                <DropdownMenuItem
                  onClick={onRemoveEmptyLines}
                  disabled={isRemovingEmptyLines || disableRemoveEmptyLines}
                  className="gap-2"
                >
                  <ListMinus strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('dialog.diffViewer.removeEmptyLines')}
                </DropdownMenuItem>
              ) : null}
              {showAutoAdvanceToggle && onToggleAutoAdvance ? (
                <>
                  {(onRefresh || onSave || showFormatAction || showRemoveEmptyLinesAction) ? <DropdownMenuSeparator /> : null}
                  <ViewMenuToggleItem
                    icon={SkipForward}
                    label={t('dialog.diffViewer.autoAdvanceMenu')}
                    active={autoAdvance}
                    onSelect={() => onToggleAutoAdvance()}
                  />
                </>
              ) : null}
              {(onRevealInExplorer || onOpenInEditor) &&
              (onRefresh || onSave || showFormatAction || showRemoveEmptyLinesAction || showAutoAdvanceToggle) ? (
                <DropdownMenuSeparator />
              ) : null}
              {onRevealInExplorer && (
                <DropdownMenuItem onClick={onRevealInExplorer} disabled={!filePath} className="gap-2">
                  <FolderOpen strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('dialog.diffViewer.revealInExplorer')}
                </DropdownMenuItem>
              )}
              {onOpenInEditor && (
                <DropdownMenuItem onClick={onOpenInEditor} disabled={!filePath} className="gap-2">
                  <ExternalLink strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('dialog.diffViewer.openInEditor')}
                </DropdownMenuItem>
              )}
              {(onFind || onFindReplace) && <DropdownMenuSeparator />}
              {onFind && (
                <DropdownMenuItem onClick={onFind} className="gap-2">
                  <Search strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('dialog.diffViewer.find')}
                </DropdownMenuItem>
              )}
              {onFindReplace && (
                <DropdownMenuItem onClick={onFindReplace} className="gap-2">
                  <Replace strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('dialog.diffViewer.findReplace')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={menuTriggerClass}>
                <MenuTriggerLabel label={t('dialog.diffViewer.menuView')} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56" style={noDragStyle}>
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('dialog.diffViewer.sectionDiff')}</DropdownMenuLabel>
              {onSwapSides && (
                <DropdownMenuItem onClick={onSwapSides} className="gap-2">
                  <ArrowLeftRight strokeWidth={1.25} className="h-4 w-4 shrink-0" />
                  {t('common.swap')}
                </DropdownMenuItem>
              )}
              <ViewMenuToggleItem
                icon={WrapText}
                label={t('dialog.diffViewer.wordWrap')}
                active={viewOptions.wordWrap === 'on'}
                onSelect={() => onViewOptionChange('wordWrap', viewOptions.wordWrap === 'on' ? 'off' : 'on')}
              />
              <ViewMenuToggleItem
                icon={viewOptions.renderSideBySide ? Columns2 : Rows2}
                label={t('dialog.diffViewer.sideBySide')}
                active={viewOptions.renderSideBySide}
                disabled={viewOptions.diffOnly}
                onSelect={() => onViewOptionChange('renderSideBySide', !viewOptions.renderSideBySide)}
              />
              <ViewMenuToggleItem
                icon={Space}
                label={t('dialog.diffViewer.ignoreWhitespace')}
                active={viewOptions.ignoreTrimWhitespace}
                onSelect={() => onViewOptionChange('ignoreTrimWhitespace', !viewOptions.ignoreTrimWhitespace)}
              />
              <ViewMenuToggleItem
                icon={viewOptions.collapseUnchangedRegions ? UnfoldVertical : FoldVertical}
                label={t('dialog.diffViewer.collapseUnchanged')}
                active={viewOptions.collapseUnchangedRegions}
                disabled={viewOptions.diffOnly}
                onSelect={() => onViewOptionChange('collapseUnchangedRegions', !viewOptions.collapseUnchangedRegions)}
              />
              <ViewMenuToggleItem
                icon={ListFilter}
                label={t('dialog.diffViewer.diffOnly')}
                active={viewOptions.diffOnly}
                onSelect={() => onViewOptionChange('diffOnly', !viewOptions.diffOnly)}
              />
              <ViewMenuToggleItem
                icon={MapIcon}
                label={t('dialog.diffViewer.minimap')}
                active={viewOptions.minimap}
                onSelect={() => onViewOptionChange('minimap', !viewOptions.minimap)}
              />
              {showBlameToggle && onToggleBlame && (
                <ViewMenuToggleItem
                  icon={GitCommitHorizontal}
                  label={t('dialog.diffViewer.blameToggle')}
                  active={showBlame}
                  onSelect={() => onToggleBlame()}
                />
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex cursor-default flex-col items-stretch gap-2 p-2 focus:bg-accent"
                onSelect={e => e.preventDefault()}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{t('dialog.diffViewer.fontSize')}</span>
                  <span className="text-xs font-medium tabular-nums">{viewOptions.fontSize}</span>
                </div>
                <Slider
                  value={[viewOptions.fontSize]}
                  onValueChange={([size]) => {
                    if (size != null) onViewOptionChange('fontSize', size)
                  }}
                  min={DIFF_VIEWER_FONT_SIZE_MIN}
                  max={DIFF_VIEWER_FONT_SIZE_MAX}
                  step={1}
                  className="w-full"
                  onPointerDown={e => e.stopPropagation()}
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">{t('dialog.diffViewer.advancedOptions')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-80 max-h-[min(70vh,520px)] overflow-y-auto p-3" style={noDragStyle}>
                  <DiffViewerAdvancedOptionsPanel viewOptions={viewOptions} onViewOptionChange={onViewOptionChange} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolbarMenus>
      </div>
      <DragGutter />
      {/* Center — file picker, nav, stage/revert */}
      <div className="flex min-w-0 max-w-lg w-full shrink items-center justify-center gap-0.5" style={noDragStyle}>
        <div className="flex min-w-0 items-center gap-0 shrink">
          <DiffViewerFilePicker
            filePath={filePath}
            files={files}
            activeEntry={activeFile}
            showStageIndicators={showStageActions}
            disabled={disableFilePicker}
            onSelectFile={index => onSelectFile?.(index)}
          />
          {isDirty ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex shrink-0 items-center rounded px-1 py-0 text-[9px] leading-4 font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 cursor-default"
                  tabIndex={-1}
                >
                  {t('dialog.diffViewer.unsavedChip')}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.unsavedChanges')}</TooltipContent>
            </Tooltip>
          ) : null}
          {hasMultipleFiles && onPrevFile && onNextFile ? (
            <div className="flex items-center gap-0 shrink-0">
              <NavIconButton onClick={onPrevFile} disabled={disableFileNav || (!wrapFileNav && disablePrevFile)} label={t('dialog.diffViewer.prevFile')}>
                <ChevronLeft strokeWidth={1.25} className="h-4 w-4" />
              </NavIconButton>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(navPositionClass, 'text-muted-foreground cursor-default')}
                    tabIndex={-1}
                  >
                    {filePosition ? `${filePosition.current}/${filePosition.total}` : '\u00a0'}
                  </span>
                </TooltipTrigger>
                {filePosition ? (
                  <TooltipContent>{t('dialog.diffViewer.filePosition', filePosition)}</TooltipContent>
                ) : null}
              </Tooltip>
              <NavIconButton onClick={onNextFile} disabled={disableFileNav || (!wrapFileNav && disableNextFile)} label={t('dialog.diffViewer.nextFile')}>
                <ChevronRight strokeWidth={1.25} className="h-4 w-4" />
              </NavIconButton>
            </div>
          ) : null}
          {showStageActions && onStageToggle ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  onClick={onStageToggle}
                  disabled={isStaging || !filePath}
                  className={cn(
                    toggleBtnClass,
                    stagingState === 'staged' ? unstageActionBtnClass : stageActionBtnClass
                  )}
                  aria-label={stagingState === 'staged' ? t('dialog.diffViewer.unstage') : t('dialog.diffViewer.stage')}
                >
                  {stagingState === 'staged' ? (
                    <SquareMinus strokeWidth={1.25} className="h-4 w-4" />
                  ) : (
                    <SquarePlus strokeWidth={1.25} className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {stagingState === 'staged' ? t('dialog.diffViewer.unstage') : t('dialog.diffViewer.stage')}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {showRevertAction && onRevert ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  onClick={onRevert}
                  disabled={isReverting || !filePath}
                  className={cn(toggleBtnClass, 'text-destructive hover:text-destructive hover:bg-destructive/10')}
                  aria-label={t('dialog.diffViewer.revert')}
                >
                  <RotateCcw strokeWidth={1.25} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.revert')}</TooltipContent>
            </Tooltip>
          ) : null}
          {showFormatAction && onFormat ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  onClick={onFormat}
                  disabled={isFormatting || disableFormat}
                  className={cn(
                    toggleBtnClass,
                    'text-sky-600 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10'
                  )}
                  aria-label={t('dialog.diffViewer.formatCode')}
                >
                  <Wand2 strokeWidth={1.25} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.formatCodeHint')}</TooltipContent>
            </Tooltip>
          ) : null}
          {showRemoveEmptyLinesAction && onRemoveEmptyLines ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  onClick={onRemoveEmptyLines}
                  disabled={isRemovingEmptyLines || disableRemoveEmptyLines}
                  className={cn(
                    toggleBtnClass,
                    'text-violet-600 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/10'
                  )}
                  aria-label={t('dialog.diffViewer.removeEmptyLines')}
                >
                  <ListMinus strokeWidth={1.25} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.removeEmptyLinesHint')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <DragGutter />
      {/* Right — change prev-next only */}
      <div className="flex items-center h-full gap-2 shrink-0 pr-1" style={noDragStyle}>
        {showNoChangesBadge ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex shrink-0 items-center rounded px-1.5 py-0 text-[9px] leading-4 font-medium bg-muted text-muted-foreground cursor-default"
                tabIndex={-1}
              >
                {t('dialog.diffViewer.noChangesChip')}
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.noChanges')}</TooltipContent>
          </Tooltip>
        ) : (onPrevChange || onNextChange || onFirstChange || onLastChange) ? (
          <div className="flex items-center gap-0.5">
            {onFirstChange && (
              <NavIconButton onClick={onFirstChange} disabled={disableChangeNav} label={t('dialog.diffViewer.firstChange')}>
                <ChevronFirst strokeWidth={1.25} className="h-4 w-4" />
              </NavIconButton>
            )}
            {onPrevChange && (
              <NavIconButton onClick={onPrevChange} disabled={disableChangeNav} label={t('dialog.diffViewer.prevChange')}>
                <ChevronUp strokeWidth={1.25} className="h-4 w-4" />
              </NavIconButton>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    navPositionClass,
                    'cursor-default',
                    changePosition && changePosition.total > 0 ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  )}
                  tabIndex={-1}
                >
                  {changePosition && changePosition.total > 0 ? `${changePosition.current}/${changePosition.total}` : '—'}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {changePosition && changePosition.total > 0
                  ? t('dialog.diffViewer.changePosition', changePosition)
                  : t('dialog.diffViewer.noChanges')}
              </TooltipContent>
            </Tooltip>
            {onNextChange && (
              <NavIconButton onClick={onNextChange} disabled={disableChangeNav} label={t('dialog.diffViewer.nextChange')}>
                <ChevronDownNav strokeWidth={1.25} className="h-4 w-4" />
              </NavIconButton>
            )}
            {onLastChange && (
              <NavIconButton onClick={onLastChange} disabled={disableChangeNav} label={t('dialog.diffViewer.lastChange')}>
                <ChevronLast strokeWidth={1.25} className="h-4 w-4" />
              </NavIconButton>
            )}
          </div>
        ) : null}
      </div>
      {/* Window controls */}
      <div className="flex gap-1 shrink-0" style={noDragStyle}>
        <button
          type="button"
          onClick={() => handleWindow('minimize')}
          className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
        >
          <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button
          type="button"
          onClick={() => handleWindow('maximize')}
          className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
        >
          <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
          <X size={20} strokeWidth={1} absoluteStrokeWidth />
        </button>
      </div>
    </div>
  )
}