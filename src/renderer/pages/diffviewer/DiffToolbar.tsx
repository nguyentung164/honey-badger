'use client'
import { t } from 'i18next'
import {
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronUp,
  Columns,
  Columns2,
  ExternalLink,
  FoldVertical,
  FolderOpen,
  GitCompareArrows,
  ListFilter,
  Map,
  Minus,
  RefreshCw,
  Replace,
  Rows2,
  Save,
  Search,
  Space,
  Square,
  UnfoldVertical,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { DIFF_VIEWER_FONT_SIZE_DEFAULT, DIFF_VIEWER_FONT_SIZE_MAX, DIFF_VIEWER_FONT_SIZE_MIN, type DiffViewerViewOptionKey, type DiffViewerViewOptions } from './diffViewerTypes'
import { DiffViewerAdvancedOptions } from './DiffViewerAdvancedOptions'

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
  isSaving?: boolean
  filePath: string
  disableSave: boolean
  viewOptions: DiffViewerViewOptions
  onViewOptionChange: <K extends DiffViewerViewOptionKey>(key: K, value: DiffViewerViewOptions[K]) => void
  onFontSizeDecrease?: () => void
  onFontSizeIncrease?: () => void
  onOpenInEditor?: () => void
  onRevealInExplorer?: () => void
  onCopyPath?: () => void
  onFind?: () => void
  onFindReplace?: () => void
}

const toggleBtnClass =
  'shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]'

const activeToggleClass = 'text-green-600 dark:text-green-400 hover:text-green-600 dark:hover:text-green-400'

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function toggleClass(active: boolean) {
  return cn(toggleBtnClass, active && activeToggleClass)
}

function ToolbarIconGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center h-full shrink-0', className)} style={noDragStyle}>
      {children}
    </div>
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
  isSaving = false,
  filePath,
  disableSave,
  viewOptions,
  onViewOptionChange,
  onFontSizeDecrease,
  onFontSizeIncrease,
  onOpenInEditor,
  onRevealInExplorer,
  onCopyPath,
  onFind,
  onFindReplace,
}) => {
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const fontAtMin = viewOptions.fontSize <= DIFF_VIEWER_FONT_SIZE_MIN
  const fontAtMax = viewOptions.fontSize >= DIFF_VIEWER_FONT_SIZE_MAX

  return (
    <div
      className="flex items-center h-8 text-sm select-none gap-1"
      style={
        {
          WebkitAppRegion: 'drag',
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as React.CSSProperties
      }
    >
      {/* Left — core file actions */}
      <div className="flex items-center h-full min-w-0 shrink-0">
        <div className="w-10 h-6 flex justify-center items-center shrink-0">
          <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
        </div>
        <ToolbarIconGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" onClick={onRefresh} className={toggleBtnClass}>
                <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.refresh')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" onClick={onSwapSides} className={toggleBtnClass}>
                <Columns strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.swap')}</TooltipContent>
          </Tooltip>

          {onSave && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="link" size="sm" onClick={onSave} disabled={isSaving || disableSave} className={toggleBtnClass}>
                  <Save strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.save')}</TooltipContent>
            </Tooltip>
          )}
        </ToolbarIconGroup>
      </div>

      {/* Center — draggable gutter; title text only is no-drag */}
      <div
        className="flex-1 min-w-0 flex items-center justify-center mx-1"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={buttonVariant}
              className="font-medium text-xs w-auto max-w-full min-w-0 truncate cursor-pointer shrink"
              style={noDragStyle}
              onClick={onCopyPath}
              disabled={!filePath}
            >
              {t('dialog.diffViewer.title')}: {filePath}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.copyPathHint')}</TooltipContent>
        </Tooltip>
      </div>

      {/* Right — change nav, view / explorer / editor tools */}
      <ToolbarIconGroup className="overflow-x-auto max-w-[50%]">
        {onPrevChange && onNextChange && (
          <>
            {onFirstChange && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="link" size="sm" onClick={onFirstChange} disabled={disableChangeNav} className={toggleBtnClass}>
                    <ChevronFirst strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('dialog.diffViewer.firstChange')}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="link" size="sm" onClick={onPrevChange} disabled={disableChangeNav} className={toggleBtnClass}>
                  <ChevronUp strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.prevChange')}</TooltipContent>
            </Tooltip>

            <span
              className="w-[2.75rem] text-center text-[10px] tabular-nums text-muted-foreground shrink-0"
              aria-hidden={!changePosition || changePosition.total <= 0}
            >
              {changePosition && changePosition.total > 0 ? `${changePosition.current}/${changePosition.total}` : '\u00a0'}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="link" size="sm" onClick={onNextChange} disabled={disableChangeNav} className={toggleBtnClass}>
                  <ChevronDown strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.nextChange')}</TooltipContent>
            </Tooltip>
            {onLastChange && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="link" size="sm" onClick={onLastChange} disabled={disableChangeNav} className={toggleBtnClass}>
                    <ChevronLast strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('dialog.diffViewer.lastChange')}</TooltipContent>
              </Tooltip>
            )}
            <div className="mx-0.5 h-4 w-px bg-border shrink-0" aria-hidden />
          </>
        )}

        {onRevealInExplorer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" onClick={onRevealInExplorer} disabled={!filePath} className={toggleBtnClass}>
                <FolderOpen strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.revealInExplorer')}</TooltipContent>
          </Tooltip>
        )}

        {onOpenInEditor && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" onClick={onOpenInEditor} disabled={!filePath} className={toggleBtnClass}>
                <ExternalLink strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.openInEditor')}</TooltipContent>
          </Tooltip>
        )}

        {onFind && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" onClick={onFind} className={toggleBtnClass}>
                <Search strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.find')}</TooltipContent>
          </Tooltip>
        )}

        {onFindReplace && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" onClick={onFindReplace} className={toggleBtnClass}>
                <Replace strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.findReplace')}</TooltipContent>
          </Tooltip>
        )}

        <DiffViewerAdvancedOptions viewOptions={viewOptions} onViewOptionChange={onViewOptionChange} />

        <div className="mx-0.5 h-4 w-px bg-border shrink-0" aria-hidden />

        {onFontSizeDecrease && onFontSizeIncrease && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="link" size="sm" onClick={onFontSizeDecrease} disabled={fontAtMin} className={toggleBtnClass}>
                  <ZoomOut strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.fontSizeDecrease')}</TooltipContent>
            </Tooltip>
            <span
              className={cn(
                'min-w-[1.25rem] text-center text-[10px] tabular-nums shrink-0',
                viewOptions.fontSize !== DIFF_VIEWER_FONT_SIZE_DEFAULT ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'
              )}
            >
              {viewOptions.fontSize}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="link" size="sm" onClick={onFontSizeIncrease} disabled={fontAtMax} className={toggleBtnClass}>
                  <ZoomIn strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('dialog.diffViewer.fontSizeIncrease')}</TooltipContent>
            </Tooltip>
            <div className="mx-0.5 h-4 w-px bg-border shrink-0" aria-hidden />
          </>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              aria-pressed={viewOptions.wordWrap === 'on'}
              onClick={() => onViewOptionChange('wordWrap', viewOptions.wordWrap === 'on' ? 'off' : 'on')}
              className={toggleClass(viewOptions.wordWrap === 'on')}
            >
              <WrapText strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.wordWrap')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              aria-pressed
              disabled={viewOptions.diffOnly}
              onClick={() => onViewOptionChange('renderSideBySide', !viewOptions.renderSideBySide)}
              className={toggleClass(!viewOptions.diffOnly)}
            >
              {viewOptions.renderSideBySide ? (
                <Columns2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              ) : (
                <Rows2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {viewOptions.diffOnly
              ? t('dialog.diffViewer.layoutDisabledByDiffOnly')
              : viewOptions.renderSideBySide
                ? t('dialog.diffViewer.sideBySide')
                : t('dialog.diffViewer.inlineDiff')}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              aria-pressed={viewOptions.ignoreTrimWhitespace}
              onClick={() => onViewOptionChange('ignoreTrimWhitespace', !viewOptions.ignoreTrimWhitespace)}
              className={toggleClass(viewOptions.ignoreTrimWhitespace)}
            >
              <Space strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.ignoreWhitespace')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              aria-pressed={viewOptions.collapseUnchangedRegions}
              disabled={viewOptions.diffOnly}
              onClick={() => onViewOptionChange('collapseUnchangedRegions', !viewOptions.collapseUnchangedRegions)}
              className={toggleClass(viewOptions.collapseUnchangedRegions)}
            >
              {viewOptions.collapseUnchangedRegions ? (
                <UnfoldVertical strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              ) : (
                <FoldVertical strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {viewOptions.diffOnly ? t('dialog.diffViewer.collapseDisabledByDiffOnly') : t('dialog.diffViewer.collapseUnchanged')}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              aria-pressed={viewOptions.diffOnly}
              onClick={() => onViewOptionChange('diffOnly', !viewOptions.diffOnly)}
              className={toggleClass(viewOptions.diffOnly)}
            >
              {viewOptions.diffOnly ? (
                <GitCompareArrows strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              ) : (
                <ListFilter strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.diffOnly')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              aria-pressed={viewOptions.minimap}
              onClick={() => onViewOptionChange('minimap', !viewOptions.minimap)}
              className={toggleClass(viewOptions.minimap)}
            >
              <Map strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.minimap')}</TooltipContent>
        </Tooltip>
      </ToolbarIconGroup>

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
