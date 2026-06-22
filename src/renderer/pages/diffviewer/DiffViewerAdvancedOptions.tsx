'use client'
import { Settings2 } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  DIFF_VIEWER_LINE_DECORATIONS_WIDTH_DEFAULT,
  DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MAX,
  DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MIN,
  type AutoFindInSelection,
  type DiffViewerViewOptionKey,
  type DiffViewerViewOptions,
  type DiffWordWrap,
  type FindSeedSelection,
} from './diffViewerTypes'

const toggleBtnClass =
  'shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]'

interface DiffViewerAdvancedOptionsProps {
  viewOptions: DiffViewerViewOptions
  onViewOptionChange: <K extends DiffViewerViewOptionKey>(key: K, value: DiffViewerViewOptions[K]) => void
}

function OptionSwitch({
  id,
  label,
  checked,
  onCheckedChange,
  description,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  description?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-xs font-medium leading-none cursor-pointer">
          {label}
        </Label>
        {description ? <p className="text-[10px] text-muted-foreground leading-snug">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  )
}

export function DiffViewerAdvancedOptionsPanel({
  viewOptions,
  onViewOptionChange,
}: DiffViewerAdvancedOptionsProps) {
  const { t } = useTranslation()

  return (
    <>
      <section className="space-y-0.5 border-b pb-3 mb-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{t('dialog.diffViewer.sectionDiff')}</p>
        <OptionSwitch
          id="compactMode"
          label={t('dialog.diffViewer.compactMode')}
          checked={viewOptions.compactMode}
          onCheckedChange={v => onViewOptionChange('compactMode', v)}
        />
        <OptionSwitch
          id="renderOverviewRuler"
          label={t('dialog.diffViewer.renderOverviewRuler')}
          checked={viewOptions.renderOverviewRuler}
          onCheckedChange={v => onViewOptionChange('renderOverviewRuler', v)}
        />
        <OptionSwitch
          id="originalEditable"
          label={t('dialog.diffViewer.originalEditable')}
          checked={viewOptions.originalEditable}
          onCheckedChange={v => onViewOptionChange('originalEditable', v)}
        />
        <OptionSwitch
          id="diffCodeLens"
          label={t('dialog.diffViewer.diffCodeLens')}
          checked={viewOptions.diffCodeLens}
          onCheckedChange={v => onViewOptionChange('diffCodeLens', v)}
        />
        <OptionSwitch
          id="showMoves"
          label={t('dialog.diffViewer.showMoves')}
          checked={viewOptions.showMoves}
          onCheckedChange={v => onViewOptionChange('showMoves', v)}
        />
        <OptionSwitch
          id="showEmptyDecorations"
          label={t('dialog.diffViewer.showEmptyDecorations')}
          checked={viewOptions.showEmptyDecorations}
          onCheckedChange={v => onViewOptionChange('showEmptyDecorations', v)}
        />
        <div className="py-1.5 space-y-1.5">
          <Label className="text-xs">{t('dialog.diffViewer.diffAlgorithm')}</Label>
          <Select value={viewOptions.diffAlgorithm} onValueChange={v => onViewOptionChange('diffAlgorithm', v as 'advanced' | 'legacy')}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="advanced">{t('dialog.diffViewer.diffAlgorithmAdvanced')}</SelectItem>
              <SelectItem value="legacy">{t('dialog.diffViewer.diffAlgorithmLegacy')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="py-1.5 space-y-1.5">
          <Label className="text-xs">{t('dialog.diffViewer.diffWordWrap')}</Label>
          <Select value={viewOptions.diffWordWrap} onValueChange={v => onViewOptionChange('diffWordWrap', v as DiffWordWrap)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">{t('dialog.diffViewer.diffWordWrapInherit')}</SelectItem>
              <SelectItem value="on">{t('dialog.diffViewer.diffWordWrapOn')}</SelectItem>
              <SelectItem value="off">{t('dialog.diffViewer.diffWordWrapOff')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-0.5 border-b pb-3 mb-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{t('dialog.diffViewer.sectionEditor')}</p>
        <OptionSwitch
          id="fontLigatures"
          label={t('dialog.diffViewer.fontLigatures')}
          checked={viewOptions.fontLigatures}
          onCheckedChange={v => onViewOptionChange('fontLigatures', v)}
        />
        <OptionSwitch
          id="fontVariations"
          label={t('dialog.diffViewer.fontVariations')}
          checked={viewOptions.fontVariations}
          onCheckedChange={v => onViewOptionChange('fontVariations', v)}
        />
        <OptionSwitch
          id="glyphMargin"
          label={t('dialog.diffViewer.glyphMargin')}
          checked={viewOptions.glyphMargin}
          onCheckedChange={v => onViewOptionChange('glyphMargin', v)}
        />
        <div className="py-1.5 space-y-1.5">
          <Label htmlFor="lineDecorationsWidth" className="text-xs">
            {t('dialog.diffViewer.lineDecorationsWidth')}
          </Label>
          <input
            id="lineDecorationsWidth"
            type="number"
            min={DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MIN}
            max={DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MAX}
            value={viewOptions.lineDecorationsWidth}
            onChange={e => onViewOptionChange('lineDecorationsWidth', Number(e.target.value))}
            className="h-7 w-full rounded-md border bg-background px-2 text-xs"
          />
        </div>
      </section>

      <section className="space-y-0.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{t('dialog.diffViewer.sectionFind')}</p>
        <OptionSwitch
          id="findLoop"
          label={t('dialog.diffViewer.findLoop')}
          checked={viewOptions.findLoop}
          onCheckedChange={v => onViewOptionChange('findLoop', v)}
        />
        <OptionSwitch
          id="findOnType"
          label={t('dialog.diffViewer.findOnType')}
          checked={viewOptions.findOnType}
          onCheckedChange={v => onViewOptionChange('findOnType', v)}
        />
        <OptionSwitch
          id="findAddExtraSpaceOnTop"
          label={t('dialog.diffViewer.findAddExtraSpaceOnTop')}
          checked={viewOptions.findAddExtraSpaceOnTop}
          onCheckedChange={v => onViewOptionChange('findAddExtraSpaceOnTop', v)}
        />
        <div className="py-1.5 space-y-1.5">
          <Label className="text-xs">{t('dialog.diffViewer.findSeedFromSelection')}</Label>
          <Select
            value={viewOptions.findSeedFromSelection}
            onValueChange={v => onViewOptionChange('findSeedFromSelection', v as FindSeedSelection)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selection">{t('dialog.diffViewer.findSeedSelection')}</SelectItem>
              <SelectItem value="always">{t('dialog.diffViewer.findSeedAlways')}</SelectItem>
              <SelectItem value="never">{t('dialog.diffViewer.findSeedNever')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="py-1.5 space-y-1.5">
          <Label className="text-xs">{t('dialog.diffViewer.autoFindInSelection')}</Label>
          <Select
            value={viewOptions.autoFindInSelection}
            onValueChange={v => onViewOptionChange('autoFindInSelection', v as AutoFindInSelection)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">{t('dialog.diffViewer.autoFindNever')}</SelectItem>
              <SelectItem value="always">{t('dialog.diffViewer.autoFindAlways')}</SelectItem>
              <SelectItem value="multiline">{t('dialog.diffViewer.autoFindMultiline')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>
    </>
  )
}

export function DiffViewerAdvancedOptions({ viewOptions, onViewOptionChange }: DiffViewerAdvancedOptionsProps) {
  const { t } = useTranslation()
  const hasAdvancedActive =
    viewOptions.compactMode ||
    !viewOptions.renderOverviewRuler ||
    viewOptions.diffWordWrap !== 'inherit' ||
    viewOptions.diffAlgorithm !== 'advanced' ||
    viewOptions.originalEditable ||
    viewOptions.diffCodeLens ||
    viewOptions.showMoves ||
    viewOptions.showEmptyDecorations ||
    viewOptions.fontLigatures ||
    viewOptions.fontVariations ||
    !viewOptions.glyphMargin ||
    viewOptions.lineDecorationsWidth !== DIFF_VIEWER_LINE_DECORATIONS_WIDTH_DEFAULT ||
    viewOptions.findSeedFromSelection !== 'selection' ||
    !viewOptions.findLoop ||
    !viewOptions.findOnType ||
    viewOptions.autoFindInSelection !== 'never' ||
    !viewOptions.findAddExtraSpaceOnTop

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          size="sm"
          className={cn(toggleBtnClass, hasAdvancedActive && 'text-green-600 dark:text-green-400 hover:text-green-600 dark:hover:text-green-400')}
          aria-label={t('dialog.diffViewer.advancedOptions')}
        >
          <Settings2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[min(70vh,520px)] overflow-y-auto p-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <p className="text-xs font-semibold mb-2">{t('dialog.diffViewer.advancedOptions')}</p>
        <DiffViewerAdvancedOptionsPanel viewOptions={viewOptions} onViewOptionChange={onViewOptionChange} />
      </PopoverContent>
    </Popover>
  )
}
