'use client'
import { t } from 'i18next'
import {
  ArrowLeftRight,
  ChevronDown as ChevronDownNav,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Columns2,
  FoldVertical,
  GitCommitHorizontal,
  ListFilter,
  ListMinus,
  Map as MapIcon,
  Minus,
  Rows2,
  Settings,
  SkipForward,
  Space,
  Square,
  UnfoldVertical,
  Wand2,
  WrapText,
  X,
} from 'lucide-react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DiffViewerFilePicker } from './DiffViewerFilePicker'
import type { DiffViewerFileEntry } from './diffViewerPayload'
import type { DiffViewerViewOptionKey, DiffViewerViewOptions } from './diffViewerTypes'

export interface DiffToolbarProps {
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
  /** Embedded in MainPage — hide window chrome (logo, drag, min/max/close). */
  embedded?: boolean
  /** When set with `embedded`, primary controls render into this host (Git Staging title row). */
  headerPortalTarget?: HTMLElement | null
}

const toggleBtnClass = 'shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]'
const settingsBtnClass = 'h-7 w-7 shrink-0 rounded-sm p-0 shadow-none hover:bg-muted focus-visible:ring-0 focus-visible:ring-offset-0'
const viewMenuActiveClass = 'text-green-600 dark:text-green-400 focus:text-green-600 dark:focus:text-green-400'
const navPositionClass = 'min-w-[2.75rem] px-0.5 text-center text-xs tabular-nums shrink-0'
const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function NavIconButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
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
    <DropdownMenuItem disabled={disabled} onClick={onSelect} className={cn('gap-2', active && viewMenuActiveClass)}>
      <Icon strokeWidth={1.25} className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </DropdownMenuItem>
  )
}

function DiffToolbarSettingsMenu({
  onSwapSides,
  showBlameToggle,
  showBlame,
  onToggleBlame,
  showAutoAdvanceToggle,
  autoAdvance,
  onToggleAutoAdvance,
  viewOptions,
  onViewOptionChange,
  compact = false,
}: Pick<
  DiffToolbarProps,
  'onSwapSides' | 'showBlameToggle' | 'showBlame' | 'onToggleBlame' | 'showAutoAdvanceToggle' | 'autoAdvance' | 'onToggleAutoAdvance' | 'viewOptions' | 'onViewOptionChange'
> & { compact?: boolean }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={compact ? cn(settingsBtnClass, 'h-6 w-6') : settingsBtnClass}
              aria-label={t('dialog.diffViewer.menuView')}
              style={noDragStyle}
            >
              <Settings strokeWidth={1.25} className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('dialog.diffViewer.menuView')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-56" style={noDragStyle}>
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
          <ViewMenuToggleItem icon={GitCommitHorizontal} label={t('dialog.diffViewer.blameToggle')} active={showBlame} onSelect={() => onToggleBlame()} />
        )}
        {showAutoAdvanceToggle && onToggleAutoAdvance ? (
          <ViewMenuToggleItem icon={SkipForward} label={t('dialog.diffViewer.autoAdvanceMenu')} active={autoAdvance} onSelect={() => onToggleAutoAdvance()} />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DiffToolbarChangeNav({
  onPrevChange,
  onNextChange,
  onFirstChange,
  onLastChange,
  changePosition,
  disableChangeNav,
  showNoChangesBadge,
}: Pick<DiffToolbarProps, 'onPrevChange' | 'onNextChange' | 'onFirstChange' | 'onLastChange' | 'changePosition' | 'disableChangeNav' | 'showNoChangesBadge'>) {
  if (showNoChangesBadge) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0 text-[9px] leading-4 font-medium bg-muted text-muted-foreground cursor-default" tabIndex={-1}>
            {t('dialog.diffViewer.noChangesChip')}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('dialog.diffViewer.noChanges')}</TooltipContent>
      </Tooltip>
    )
  }

  if (!onPrevChange && !onNextChange && !onFirstChange && !onLastChange) return null

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {onFirstChange && (
        <NavIconButton onClick={onFirstChange} disabled={disableChangeNav} label={t('dialog.diffViewer.firstChange')}>
          <ChevronsUp strokeWidth={1.25} className="h-4 w-4" />
        </NavIconButton>
      )}
      {onPrevChange && (
        <NavIconButton onClick={onPrevChange} disabled={disableChangeNav} label={t('dialog.diffViewer.prevChange')}>
          <ChevronUp strokeWidth={1.25} className="h-4 w-4" />
        </NavIconButton>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(navPositionClass, 'cursor-default', changePosition && changePosition.total > 0 ? 'text-muted-foreground' : 'text-muted-foreground/50')} tabIndex={-1}>
            {changePosition && changePosition.total > 0 ? `${changePosition.current}/${changePosition.total}` : '—'}
          </span>
        </TooltipTrigger>
        <TooltipContent>{changePosition && changePosition.total > 0 ? t('dialog.diffViewer.changePosition', changePosition) : t('dialog.diffViewer.noChanges')}</TooltipContent>
      </Tooltip>
      {onNextChange && (
        <NavIconButton onClick={onNextChange} disabled={disableChangeNav} label={t('dialog.diffViewer.nextChange')}>
          <ChevronDownNav strokeWidth={1.25} className="h-4 w-4" />
        </NavIconButton>
      )}
      {onLastChange && (
        <NavIconButton onClick={onLastChange} disabled={disableChangeNav} label={t('dialog.diffViewer.lastChange')}>
          <ChevronsDown strokeWidth={1.25} className="h-4 w-4" />
        </NavIconButton>
      )}
    </div>
  )
}

/** File path, file nav, format, change nav, settings — used inline or in Git Staging title row. */
export function DiffToolbarHeaderControls(props: DiffToolbarProps) {
  const {
    onSwapSides,
    onPrevChange,
    onNextChange,
    onFirstChange,
    onLastChange,
    changePosition,
    disableChangeNav = false,
    showNoChangesBadge = false,
    filePath,
    files = [],
    activeFile,
    onSelectFile,
    disableFilePicker = false,
    isDirty = false,
    hasMultipleFiles = false,
    filePosition,
    onPrevFile,
    onNextFile,
    disableFileNav = false,
    disablePrevFile = false,
    disableNextFile = false,
    wrapFileNav = false,
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
    showStageActions = false,
    headerPortalTarget,
  } = props

  const compact = Boolean(headerPortalTarget)

  return (
    <div className={cn('flex min-w-0 items-center gap-0.5', headerPortalTarget ? 'h-7 flex-1 overflow-hidden' : 'shrink')} style={noDragStyle}>
      <div className="flex min-w-0 items-center gap-0 shrink overflow-hidden">
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
                <span className={cn(navPositionClass, 'text-muted-foreground cursor-default')} tabIndex={-1}>
                  {filePosition ? `${filePosition.current}/${filePosition.total}` : '\u00a0'}
                </span>
              </TooltipTrigger>
              {filePosition ? <TooltipContent>{t('dialog.diffViewer.filePosition', filePosition)}</TooltipContent> : null}
            </Tooltip>
            <NavIconButton onClick={onNextFile} disabled={disableFileNav || (!wrapFileNav && disableNextFile)} label={t('dialog.diffViewer.nextFile')}>
              <ChevronRight strokeWidth={1.25} className="h-4 w-4" />
            </NavIconButton>
          </div>
        ) : null}
      </div>
      {headerPortalTarget ? <div className="min-w-2 flex-1" aria-hidden /> : null}
      <div className="flex shrink-0 items-center gap-0">
        {showFormatAction && onFormat ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                size="sm"
                onClick={onFormat}
                disabled={isFormatting || disableFormat}
                className={toggleBtnClass}
                aria-label={t('dialog.diffViewer.formatCode')}
              >
                <Wand2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 text-sky-600 dark:text-sky-400" />
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
                className={toggleBtnClass}
                aria-label={t('dialog.diffViewer.removeEmptyLines')}
              >
                <ListMinus strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.removeEmptyLinesHint')}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <Separator orientation="vertical" className="h-full px-2 bg-transparent" />
      <DiffToolbarChangeNav
        onPrevChange={onPrevChange}
        onNextChange={onNextChange}
        onFirstChange={onFirstChange}
        onLastChange={onLastChange}
        changePosition={changePosition}
        disableChangeNav={disableChangeNav}
        showNoChangesBadge={showNoChangesBadge}
      />
      <Separator orientation="vertical" className="h-full px-2 bg-transparent" />
      <DiffToolbarSettingsMenu
        onSwapSides={onSwapSides}
        showBlameToggle={showBlameToggle}
        showBlame={showBlame}
        onToggleBlame={onToggleBlame}
        showAutoAdvanceToggle={showAutoAdvanceToggle}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={onToggleAutoAdvance}
        viewOptions={viewOptions}
        onViewOptionChange={onViewOptionChange}
        compact={compact}
      />
    </div>
  )
}

export const DiffToolbar: React.FC<DiffToolbarProps> = props => {
  const { embedded = false, headerPortalTarget, onCloseRequest } = props

  const handleWindow = (action: string) => {
    if (action === 'close' && onCloseRequest) {
      onCloseRequest()
      return
    }
    window.api.electron.send('window:action', action)
  }

  if (embedded && headerPortalTarget) {
    return createPortal(<DiffToolbarHeaderControls {...props} />, headerPortalTarget)
  }

  return (
    <div
      className={cn('flex items-center h-8 text-sm select-none min-w-0', embedded && 'border-b border-border')}
      style={
        {
          ...(embedded ? noDragStyle : dragStyle),
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as React.CSSProperties
      }
    >
      {!embedded ? (
        <>
          <div className="flex items-center h-full shrink-0 min-w-0" style={dragStyle}>
            <div className="w-10 h-full flex justify-center items-center shrink-0">
              <img src="logo.png" alt="" draggable={false} className="w-3.5 h-3.5 dark:brightness-130 pointer-events-none" />
            </div>
          </div>
          <DragGutter />
        </>
      ) : null}
      <div className={cn('flex min-w-0 items-center gap-0.5', embedded ? 'flex-1 px-1' : 'max-w-lg w-full shrink justify-center')} style={noDragStyle}>
        <DiffToolbarHeaderControls {...props} />
      </div>
      {!embedded ? (
        <>
          <DragGutter />
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
        </>
      ) : null}
    </div>
  )
}
