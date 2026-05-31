'use client'

import { Circle, Cloud, Droplets, Gem, ImagePlus, Lightbulb, Repeat2, Scan, Search, Signal, Sparkles, Square, Stars, Sun } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowNodeAnimationKind, FlowNodeHandleSidesMode, FlowNodeHandleStyleKind, FlowNodeVisualStyle, GradientStop } from 'shared/flowDiagramStyle'
import { effectiveAccentColor, effectiveAccentStops, FLOW_NODE_HANDLE_STYLE_KINDS, handleSideCountForSidesMode, isMultiColorGradient, mergeNodeVisualStyle, resolveHandleSidesMode } from 'shared/flowDiagramStyle'
import { FlowColorPickerPopover } from '@/components/flow-inspector/FlowColorPickerPopover'
import { GradientPresetsGrid, GradientStopEditor } from '@/components/flow-inspector/FlowGradientStopEditor'
import { FlowNodeBorderAnimPreviewSvg, FlowNodeSettingPreview } from '@/components/flow-inspector/FlowInspectorSettingPreviews'
import { FlowNodeContentLayoutSection } from '@/components/flow-inspector/FlowNodeContentLayoutSection'
import type { FlowNodeContentLayoutContext } from 'shared/flowNodeContentLayout'
import { FlowLucideIconPickerDialog } from '@/components/flow-inspector/FlowLucideIconPickerDialog'
import { FLOW_INSPECTOR_RESET_ALL_BUTTON, FLOW_INSPECTOR_RESET_LINK, FLOW_INSPECTOR_SECTION_LABEL } from '@/components/flow-inspector/flowInspectorUi'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import { FlowNodeDiagramIcon } from '@/components/flow-inspector/nodeIconUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Props = {
  value: FlowNodeVisualStyle
  onChange: (next: FlowNodeVisualStyle) => void
  nodeDisplayName?: string
  onNodeDisplayNameChange?: (next: string) => void
  /** Chỉ inspector nhóm catalog — bật/tắt handle nối trên khung group. */
  showConnectionHandlesToggle?: boolean
  /** Page map catalog page vs dev pipeline step — drives layout defaults & preview. */
  layoutContext?: FlowNodeContentLayoutContext
  boardDefaultLayoutChecked?: boolean
  onBoardDefaultLayoutCheckedChange?: (next: boolean) => void
  onResetBoardDefaultLayout?: () => void
  hasBoardDefaultLayout?: boolean
  executionDisabled?: boolean
  onExecutionDisabledChange?: (next: boolean) => void
}

/** Orbit kinds in catalog node + page map note inspectors (excludes `none`). */
export const FLOW_NODE_INSPECTOR_ORBIT_ANIMATIONS: FlowNodeAnimationKind[] = [
  'beam',
  'doubleBeam',
  'bounce',
  'morse',
  'shimmer',
  'dots',
  'neon',
  'borderBeam',
  'aurora',
  'focusBrackets',
  'sparkle',
  'glassRim',
]

const NODE_ANIMS = FLOW_NODE_INSPECTOR_ORBIT_ANIMATIONS

const FLOW_NODE_HANDLE_STYLE_LABEL: Record<FlowNodeHandleStyleKind, string> = {
  'minimal-dot': 'handleStyleMinimalDot',
  'accent-ring': 'handleStyleAccentRing',
  'accent-glow': 'handleStyleAccentGlow',
}

/** Apply icon color without React state (avoids re-rendering the whole inspector while dragging). */
function applyIconPickerLiveColor(color: string, iconWrapEl: HTMLSpanElement | null) {
  if (iconWrapEl) iconWrapEl.style.color = color
}

type IconConfigRowProps = {
  iconKey?: string
  committedIconColor: string
  isLucideIconSelected: boolean
  onCommitIconColor: (color: string) => void
  onOpenLucide: () => void
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void
  labels: {
    preview: string
    placeholder: string
    iconColor: string
    upload: string
    openLucide: string
  }
}

/**
 * Isolated icon toolbar: local DOM updates during color drag so the parent panel
 * (and heavy FlowNodeSettingPreview) does not re-render every input event.
 */
const IconConfigRow = memo(function IconConfigRow({ iconKey, committedIconColor, isLucideIconSelected, onCommitIconColor, onOpenLucide, onUpload, labels }: IconConfigRowProps) {
  const iconWrapRef = useRef<HTMLSpanElement>(null)
  const lastCommittedRef = useRef(committedIconColor)

  const paintLive = useCallback((color: string) => {
    applyIconPickerLiveColor(color, iconWrapRef.current)
  }, [])

  useEffect(() => {
    lastCommittedRef.current = committedIconColor
    paintLive(committedIconColor)
  }, [committedIconColor, paintLive])

  const commitIfChanged = (color: string) => {
    paintLive(color)
    if (color === lastCommittedRef.current) return
    lastCommittedRef.current = color
    onCommitIconColor(color)
  }

  return (
    <div className="flex min-h-9 items-center gap-1.5">
      <span
        ref={iconWrapRef}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border [&_svg]:text-current',
          iconKey ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/50' : 'border-dashed border-border/60 bg-muted/20 text-muted-foreground/40'
        )}
        style={{ color: committedIconColor }}
        title={iconKey ? labels.preview : labels.placeholder}
      >
        {iconKey?.startsWith('data:') ? (
          <img src={iconKey} className="size-5 rounded-sm object-contain" alt="" aria-hidden />
        ) : iconKey ? (
          <FlowNodeDiagramIcon iconKey={iconKey} className="size-4" style={{ color: 'currentColor' }} />
        ) : null}
      </span>

      <FlowColorPickerPopover
        value={committedIconColor}
        onCommit={commitIfChanged}
        onLiveChange={paintLive}
        variant="ring"
        swatchClassName="size-9"
        ariaLabel={labels.iconColor}
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn('h-9 w-9 shrink-0', isLucideIconSelected && 'border-primary bg-primary/10 text-primary ring-1 ring-primary/50')}
        title={labels.openLucide}
        aria-label={labels.openLucide}
        onClick={onOpenLucide}
      >
        <Search className="size-4 shrink-0" aria-hidden />
      </Button>

      <label
        className={cn(
          'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors',
          iconKey?.startsWith('data:')
            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/50'
            : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:bg-muted/40 hover:text-primary'
        )}
        title={labels.upload}
      >
        <ImagePlus className="size-4" aria-hidden />
        <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={onUpload} />
      </label>
    </div>
  )
})

function nodeAnimIcon(kind: FlowNodeAnimationKind) {
  const cls = 'size-3 shrink-0'
  switch (kind) {
    case 'bounce':
      return <Sparkles className={cls} aria-hidden />
    case 'beam':
      return <Sparkles className={cls} aria-hidden />
    case 'doubleBeam':
      return <Repeat2 className={cls} aria-hidden />
    case 'dots':
      return <Circle className={cls} aria-hidden />
    case 'borderBeam':
      return <Scan className={cls} aria-hidden />
    case 'aurora':
      return <Cloud className={cls} aria-hidden />
    case 'shimmer':
      return <Gem className={cls} aria-hidden />
    case 'neon':
      return <Lightbulb className={cls} aria-hidden />
    case 'morse':
      return <Signal className={cls} aria-hidden />
    case 'focusBrackets':
      return <Square className={cls} aria-hidden />
    case 'sparkle':
      return <Stars className={cls} aria-hidden />
    case 'glassRim':
      return <Droplets className={cls} aria-hidden />
    default:
      return <Sun className={cls} aria-hidden />
  }
}

export function FlowNodeVisualConfigPanel({
  value,
  onChange,
  nodeDisplayName,
  onNodeDisplayNameChange,
  showConnectionHandlesToggle,
  layoutContext,
  boardDefaultLayoutChecked,
  onBoardDefaultLayoutCheckedChange,
  onResetBoardDefaultLayout,
  hasBoardDefaultLayout,
  executionDisabled,
  onExecutionDisabledChange,
}: Props) {
  const { t } = useTranslation()
  const [lucideOpen, setLucideOpen] = useState(false)

  const patch = (p: Partial<FlowNodeVisualStyle>) => onChange({ ...value, ...p })

  // ── Gradient accent state ────────────────────────────────────────────
  const accentStops = effectiveAccentStops(value)
  const accentCol = effectiveAccentColor(value)
  const accentGradient = isMultiColorGradient(accentStops) ? accentStops : undefined
  const hasAccent = Boolean(value.accentColor || value.accentGradient)
  const orbitBorderPx = resolveFlowNodeShellVisual(value).orbitBorderPx

  const patchAccentStops = (next: GradientStop[]) => {
    const sorted = [...next].sort((a, b) => a.position - b.position)
    // Collapse to solid only when exactly 2 (or fewer) stops share the same color.
    // If the user has added a 3rd stop (even with the same color for now), keep it
    // as a gradient so the new handle stays visible for the user to recolor.
    const isSolid = sorted.length <= 2 && new Set(sorted.map(s => s.color)).size <= 1
    if (isSolid) {
      patch({ accentColor: sorted[0]?.color ?? '#94a3b8', accentGradient: undefined })
    } else {
      patch({ accentColor: sorted[0].color, accentGradient: sorted })
    }
  }

  const handleIconUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const result = ev.target?.result
      if (typeof result === 'string') patch({ iconKey: result })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleStyleValue = value.handleStyle ?? 'minimal-dot'
  const handleSidesMode = resolveHandleSidesMode(value)
  const showHandleConnectionSettings = !showConnectionHandlesToggle || value.showConnectionHandles !== false

  // Any non-data-URL icon key means a Lucide icon was selected (quick preset OR picker result).
  const isLucideIconSelected = Boolean(value.iconKey) && !value.iconKey?.startsWith('data:')

  const speed = value.nodeAnimationSpeed ?? 1
  const iconColorCommitted = value.iconColor ?? (value.accentColor || '#94a3b8')

  const commitIconColor = useCallback(
    (color: string) => patch({ iconColor: color }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patch closes over value
    [onChange, value]
  )

  return (
    <>
      <FlowLucideIconPickerDialog
        open={lucideOpen}
        onOpenChange={setLucideOpen}
        selectedExportName={value.iconKey?.startsWith('data:') ? undefined : value.iconKey}
        onPickExportName={name => patch({ iconKey: name })}
      />

      <div className="space-y-4">
        <FlowNodeSettingPreview
          value={value}
          displayName={nodeDisplayName}
          accentBackground={showConnectionHandlesToggle ? hasAccent : true}
          layoutContext={layoutContext}
          headerRight={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={FLOW_INSPECTOR_RESET_ALL_BUTTON}
              onClick={() => onChange(mergeNodeVisualStyle())}
            >
              {t('flowInspector.resetAllStyles')}
            </Button>
          }
        />

        <Tabs defaultValue="layout" className="w-full">
          <TabsList className="grid h-8 w-full grid-cols-2 gap-0.5 rounded-md bg-muted/40 p-0.5">
            <TabsTrigger value="layout" className="h-7 px-2 text-[11px]">
              {t('flowInspector.inspectorTabLayout')}
            </TabsTrigger>
            <TabsTrigger value="style" className="h-7 px-2 text-[11px]">
              {t('flowInspector.inspectorTabStyle')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layout" className="mt-4 space-y-4">
        {onNodeDisplayNameChange != null && nodeDisplayName != null ? (
          <div className="space-y-1.5">
            <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.nodeName')}</Label>
            <Input value={nodeDisplayName} onChange={e => onNodeDisplayNameChange(e.target.value)} className="h-9" spellCheck={false} />
          </div>
        ) : null}

        {onExecutionDisabledChange != null ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.executionDisabled')}</Label>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{t('flowInspector.executionDisabledHint')}</p>
            </div>
            <Switch checked={executionDisabled ?? false} onCheckedChange={onExecutionDisabledChange} aria-label={t('flowInspector.executionDisabled')} />
          </div>
        ) : null}

        {/* ── Icon section ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.iconLabel')}</Label>
            {value.iconKey ? (
              <button
                type="button"
                onClick={() => patch({ iconKey: undefined })}
                className="rounded px-1 text-[10px] text-muted-foreground hover:text-destructive"
                title={t('flowInspector.iconClear')}
              >
                {t('flowInspector.iconClear')}
              </button>
            ) : null}
          </div>

          <IconConfigRow
            iconKey={value.iconKey}
            committedIconColor={iconColorCommitted}
            isLucideIconSelected={isLucideIconSelected}
            onCommitIconColor={commitIconColor}
            onOpenLucide={() => setLucideOpen(true)}
            onUpload={handleIconUpload}
            labels={{
              preview: t('flowInspector.iconPreview'),
              placeholder: t('flowInspector.iconPlaceholder1'),
              iconColor: t('flowInspector.iconColor'),
              upload: t('flowInspector.iconUpload'),
              openLucide: t('flowInspector.iconOpenLucide'),
            }}
          />
        </div>

        {layoutContext ? (
          <FlowNodeContentLayoutSection
            value={value}
            onChange={onChange}
            layoutContext={layoutContext}
            boardDefaultChecked={boardDefaultLayoutChecked}
            onBoardDefaultCheckedChange={onBoardDefaultLayoutCheckedChange}
            onResetBoardDefault={onResetBoardDefaultLayout}
            hasBoardDefault={hasBoardDefaultLayout}
          />
        ) : null}

        {showConnectionHandlesToggle ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="flow-grp-handles" className={FLOW_INSPECTOR_SECTION_LABEL}>
                {t('flowInspector.groupFrameHandles')}
              </Label>
              <p className="text-[10px] leading-snug text-muted-foreground">{t('flowInspector.groupFrameHandlesHint')}</p>
            </div>
            <Switch
              id="flow-grp-handles"
              size="sm"
              checked={value.showConnectionHandles !== false}
              onCheckedChange={next => patch({ showConnectionHandles: next })}
              className="shrink-0"
            />
          </div>
        ) : null}
          </TabsContent>

          <TabsContent value="style" className="mt-4 space-y-4">
        {/* ── Accent — gradient stop editor ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.accentColors')}</Label>
            <button
              type="button"
              className={FLOW_INSPECTOR_RESET_LINK}
              onClick={() => patch({ accentColor: undefined, accentGradient: undefined })}
            >
              {t('flowInspector.nodeBorderAnimationReset')}
            </button>
          </div>

          <GradientPresetsGrid activeStops={accentStops} onPickTemplate={patchAccentStops} />

          {/* Multi-stop gradient editor */}
          <GradientStopEditor stops={accentStops} onChange={patchAccentStops} />
        </div>

        {/* ── Border width slider ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.nodeBorderWidth')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {value.borderWidth !== undefined
                  ? value.borderWidth === 0
                    ? t('flowInspector.nodeBorderNone')
                    : `${value.borderWidth}px`
                  : t('flowInspector.nodeBorderAuto')}
              </span>
              <button
                type="button"
                className={FLOW_INSPECTOR_RESET_LINK}
                onClick={() => patch({ borderWidth: undefined })}
              >
                {t('flowInspector.nodeBorderAuto')}
              </button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.25}
            value={value.borderWidth ?? 0.5}
            onChange={e => patch({ borderWidth: Number(e.target.value) as FlowNodeVisualStyle['borderWidth'] })}
            className="h-1.5 w-full cursor-pointer accent-primary"
            aria-label={t('flowInspector.nodeBorderWidth')}
          />
        </div>

        {/* ── Border animation ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.nodeBorderAnimation')}</Label>
            <button
              type="button"
              className={FLOW_INSPECTOR_RESET_LINK}
              onClick={() => patch({ nodeAnimation: undefined })}
            >
              {t('flowInspector.nodeBorderAnimationReset')}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {NODE_ANIMS.map(kind => {
              const active = value.nodeAnimation === kind
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => patch({ nodeAnimation: kind })}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border border-border/80 bg-card/50 p-1.5 text-left transition-all',
                    active ? 'ring-2 ring-primary/45 ring-offset-1 ring-offset-background' : 'hover:bg-muted/40'
                  )}
                >
                  <div className="flex h-9 w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/25">
                    <FlowNodeBorderAnimPreviewSvg kind={kind} accent={accentCol} gradient={accentGradient} speed={speed} borderPx={orbitBorderPx} />
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-medium leading-tight">
                    {nodeAnimIcon(kind)}
                    <span className="truncate">{t(`flowInspector.nodeAnim${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Speed slider — only when an animation is active */}
          {value.nodeAnimation && value.nodeAnimation !== 'none' && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="shrink-0 text-[11px] text-muted-foreground">{t('flowInspector.animSpeedSlow')}</span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={speed}
                onChange={e => patch({ nodeAnimationSpeed: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer accent-primary"
                aria-label={t('flowInspector.animSpeed')}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground">{t('flowInspector.animSpeedFast')}</span>
            </div>
          )}
        </div>

        {showHandleConnectionSettings ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.handleMagnetStyleLabel')}</Label>
              <Select value={handleStyleValue} onValueChange={v => patch({ handleStyle: v as FlowNodeHandleStyleKind })}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLOW_NODE_HANDLE_STYLE_KINDS.map(k => (
                    <SelectItem key={k} value={k}>
                      {t(`flowInspector.${FLOW_NODE_HANDLE_STYLE_LABEL[k]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.handleSidesLabel')}</Label>
              <Select
                value={handleSidesMode}
                onValueChange={v => {
                  const mode = v as FlowNodeHandleSidesMode
                  patch({
                    handleSidesMode: mode,
                    handleSideCount: handleSideCountForSidesMode(mode),
                  })
                }}
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="two-vertical">{t('flowInspector.handleSidesTwo')}</SelectItem>
                  <SelectItem value="two-horizontal">{t('flowInspector.handleSidesTwoHorizontal')}</SelectItem>
                  <SelectItem value="four">{t('flowInspector.handleSidesFour')}</SelectItem>
                  <SelectItem value="one-top">{t('flowInspector.handleSidesOneTop')}</SelectItem>
                  <SelectItem value="one-bottom">{t('flowInspector.handleSidesOneBottom')}</SelectItem>
                  <SelectItem value="one-left">{t('flowInspector.handleSidesOneLeft')}</SelectItem>
                  <SelectItem value="one-right">{t('flowInspector.handleSidesOneRight')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
