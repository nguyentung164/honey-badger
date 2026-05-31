'use client'

import { ArrowLeftRight, Asterisk, Circle, ChevronsRight, Minus, ScanLine, Sparkles, Stars, Zap } from 'lucide-react'
import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  FlowConnectionLabelStyle,
  FlowConnectionStyle,
  FlowEdgeAnimationKind,
  FlowEdgeCurveKind,
  FlowEdgeDashKind,
  GradientStop,
} from 'shared/flowDiagramStyle'
import {
  FLOW_CONNECTION_STYLE_DEFAULT,
  FLOW_EDGE_INSPECTOR_ANIMATIONS,
  FLOW_LABEL_FONT_FAMILIES,
  FLOW_LABEL_FONT_SIZES,
  effectiveConnectionColorStops,
  effectiveLabelAccentColor,
  effectiveLabelAccentStops,
  edgeLabelStaticBorderWidthPx,
  isMultiColorGradient,
  labelUsesAccentGradient,
  mergeConnectionLabelStyle,
  mergeConnectionStyle,
} from 'shared/flowDiagramStyle'
import { FlowColorPickerField } from '@/components/flow-inspector/FlowColorPickerField'
import { FlowEdgeSettingPreview } from '@/components/flow-inspector/FlowInspectorSettingPreviews'
import {
  FlowEdgeFireflyMarkers,
  FlowEdgeQuantumHopMarker,
  FlowEdgeSpotlightSweep,
  FlowEdgeShuttleMarker,
} from '@/components/flow-inspector/flowEdgeAnimationSvg'
import { ensureFlowEdgePathAnimStyles } from '@/components/flow-inspector/flowEdgePathAnimCss'
import { GradientPresetsGrid, GradientStopEditor } from '@/components/flow-inspector/FlowGradientStopEditor'
import {
  FLOW_INSPECTOR_RESET_ALL_BUTTON,
  FLOW_INSPECTOR_RESET_LINK,
  FLOW_INSPECTOR_SECTION_LABEL,
} from '@/components/flow-inspector/flowInspectorUi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { DevPipelineEdgeCondition } from 'shared/devPipelines/types'

type Props = {
  value: FlowConnectionStyle
  onChange: (next: FlowConnectionStyle) => void
  /** Dev Pipelines — edge run condition (optional). */
  edgeCondition?: DevPipelineEdgeCondition
  onEdgeConditionChange?: (next: DevPipelineEdgeCondition) => void
  /** Execution order among outgoing edges from same source. */
  runOrder?: number
  runOrderMax?: number
  onRunOrderChange?: (next: number) => void
}

const CURVES: FlowEdgeCurveKind[] = ['curved', 'straight', 'step']
const PREVIEW_EDGE_D = 'M 4 18 Q 22 6 76 18'

function sd(base: string, speed: number): string {
  const s = Number.parseFloat(base) / Math.max(0.1, speed)
  return `${s.toFixed(2)}s`
}

function pathAnimIcon(kind: FlowEdgeAnimationKind) {
  switch (kind) {
    case 'flow':
      return <ChevronsRight className="size-3 shrink-0" aria-hidden />
    case 'dot':
      return <Circle className="size-3 shrink-0" aria-hidden />
    case 'neon':
      return <Sparkles className="size-3 shrink-0" aria-hidden />
    case 'arcSparks':
      return <Asterisk className="size-3 shrink-0" aria-hidden />
    case 'shimmer':
      return <ScanLine className="size-3 shrink-0" aria-hidden />
    case 'shuttle':
      return <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
    case 'serpent':
      return <Zap className="size-3 shrink-0" aria-hidden />
    case 'firefly':
      return <Stars className="size-3 shrink-0" aria-hidden />
    default:
      return <Minus className="size-3 shrink-0" aria-hidden />
  }
}

function pathAnimLabel(t: (k: string) => string, kind: FlowEdgeAnimationKind) {
  switch (kind) {
    case 'flow':
      return t('flowInspector.animationFlow')
    case 'dot':
      return t('flowInspector.animationDot')
    case 'neon':
      return t('flowInspector.animationNeon')
    case 'arcSparks':
      return t('flowInspector.animationArcSparks')
    case 'shimmer':
      return t('flowInspector.animationShimmer')
    case 'shuttle':
      return t('flowInspector.animationShuttle')
    case 'serpent':
      return t('flowInspector.animationSerpent')
    case 'firefly':
      return t('flowInspector.animationFirefly')
    default:
      return t('flowInspector.animationNone')
  }
}

function curveIcon(kind: FlowEdgeCurveKind) {
  switch (kind) {
    case 'straight':
      return <span className="text-xs font-semibold">—</span>
    case 'step':
      return <span className="text-[10px] font-bold">⌐</span>
    default:
      return <span className="text-xs font-semibold">〜</span>
  }
}

function curveLabel(t: (k: string) => string, kind: FlowEdgeCurveKind) {
  switch (kind) {
    case 'straight':
      return t('flowInspector.styleStraight')
    case 'step':
      return t('flowInspector.styleStep')
    default:
      return t('flowInspector.styleCurved')
  }
}

function EdgeAnimationPreviewSvg({
  kind,
  color,
  colorStops,
  speed = 1,
}: {
  kind: Exclude<FlowEdgeAnimationKind, 'none'>
  color: string
  colorStops?: GradientStop[]
  speed?: number
}) {
  const uid = useId().replace(/:/g, '')
  const strokeW = 3.2
  const hasGrad = colorStops != null && isMultiColorGradient(colorStops)
  const pathGradId = `rf-animprev-cg-${uid}`
  const strokePaint = hasGrad ? `url(#${pathGradId})` : color
  const gradDef = hasGrad ? (
    <linearGradient id={pathGradId} gradientUnits="userSpaceOnUse" x1="4" y1="18" x2="76" y2="18">
      {(colorStops ?? []).map((s, i) => (
        <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
      ))}
    </linearGradient>
  ) : null

  if (kind === 'flow') {
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        {gradDef ? <defs>{gradDef}</defs> : null}
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={strokeW} strokeLinecap="round" className="rf-anim-flow" />
      </svg>
    )
  }

  if (kind === 'dot') {
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        {gradDef ? <defs>{gradDef}</defs> : null}
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={1} opacity={0.25} strokeLinecap="round" />
        <rect x={-5} y={-2.5} width={10} height={4.5} rx={1} fill={color} opacity={0.9}>
          <animateMotion dur={sd('1.35s', speed)} repeatCount="indefinite" path={PREVIEW_EDGE_D} rotate="auto" />
        </rect>
      </svg>
    )
  }

  if (kind === 'neon') {
    const fid = `rf-prev-neon-${uid}`
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        <defs>
          <filter id={fid} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="1" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {gradDef}
        </defs>
        <path d={PREVIEW_EDGE_D} fill="none" stroke={color} strokeWidth={5} opacity={0.08} strokeLinecap="round" />
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={strokeW} strokeLinecap="round" style={hasGrad ? undefined : { filter: `url(#${fid})` }} />
        <rect x={-8} y={-2.5} width={16} height={4.5} rx={1} fill={color} filter={`url(#${fid})`} opacity={0.88}>
          <animateMotion dur={sd('1.5s', speed)} repeatCount="indefinite" path={PREVIEW_EDGE_D} rotate="auto" />
        </rect>
      </svg>
    )
  }

  if (kind === 'shimmer') {
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        {gradDef ? <defs>{gradDef}</defs> : null}
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={strokeW} strokeLinecap="round" strokeOpacity={0.28} />
        <FlowEdgeSpotlightSweep path={PREVIEW_EDGE_D} stroke={strokePaint} color={color} strokeW={strokeW} animSpeed={speed} />
      </svg>
    )
  }

  if (kind === 'shuttle') {
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        {gradDef ? <defs>{gradDef}</defs> : null}
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={1} opacity={0.28} strokeLinecap="round" />
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={strokeW} strokeLinecap="round" />
        <FlowEdgeShuttleMarker path={PREVIEW_EDGE_D} color={color} strokeW={strokeW} animSpeed={speed} />
      </svg>
    )
  }

  if (kind === 'serpent') {
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        {gradDef ? <defs>{gradDef}</defs> : null}
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={strokeW} strokeLinecap="round" />
        <FlowEdgeQuantumHopMarker path={PREVIEW_EDGE_D} color={color} strokeW={strokeW} animSpeed={speed} />
      </svg>
    )
  }

  if (kind === 'firefly') {
    return (
      <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
        {gradDef ? <defs>{gradDef}</defs> : null}
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={1} opacity={0.22} strokeLinecap="round" />
        <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={strokeW} strokeLinecap="round" />
        <FlowEdgeFireflyMarkers path={PREVIEW_EDGE_D} color={color} strokeW={strokeW} animSpeed={speed} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 80 24" className="h-full w-full" aria-hidden>
      {gradDef ? <defs>{gradDef}</defs> : null}
      <path d={PREVIEW_EDGE_D} fill="none" stroke={strokePaint} strokeWidth={1} opacity={0.22} strokeLinecap="round" />
      {[0, -0.35, -0.7].map((begin, i) => (
        <circle key={i} r={2.8} fill={color} opacity={0.95}>
          <animateMotion dur={sd('1.2s', speed)} begin={`${begin / speed}s`} repeatCount="indefinite" path={PREVIEW_EDGE_D} />
          <animate attributeName="opacity" values="0.12;1;0.12" dur={sd('0.38s', speed)} repeatCount="indefinite" begin={`${begin / speed}s`} />
        </circle>
      ))}
    </svg>
  )
}

export function FlowConnectionPropertiesPanel({
  value,
  onChange,
  edgeCondition,
  onEdgeConditionChange,
  runOrder,
  runOrderMax,
  onRunOrderChange,
}: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    ensureFlowEdgePathAnimStyles()
  }, [])

  const patch = (p: Partial<FlowConnectionStyle>) => onChange({ ...value, ...p })
  const mergedLabel = mergeConnectionLabelStyle(value.labelStyle)
  const patchLabelStyle = (p: Partial<FlowConnectionLabelStyle>) =>
    patch({ labelStyle: { ...mergedLabel, ...p } })

  const speed = value.animationSpeed ?? 1
  const labelAccentMode = labelUsesAccentGradient(mergedLabel)
  const labelAccentStops = effectiveLabelAccentStops(mergedLabel)
  const labelBorderColor = labelAccentMode
    ? effectiveLabelAccentColor(mergedLabel)
    : mergedLabel.borderColor?.trim() || '#94a3b8'
  const labelBorderStaticPx = edgeLabelStaticBorderWidthPx(mergedLabel.borderWidth)

  const patchLabelAccentStops = (next: GradientStop[]) => {
    const sorted = [...next].sort((a, b) => a.position - b.position)
    patchLabelStyle({ labelAccentGradient: sorted })
  }

  const setLabelAccentMode = (enabled: boolean) => {
    if (enabled) {
      patchLabelStyle({ labelAccentGradient: labelAccentStops })
      return
    }
    const stops = effectiveLabelAccentStops(mergedLabel)
    patchLabelStyle({
      labelAccentGradient: undefined,
      backgroundColor: stops[0]?.color ?? mergedLabel.backgroundColor,
      borderColor: stops[stops.length - 1]?.color ?? mergedLabel.borderColor,
    })
  }

  const colorStops = effectiveConnectionColorStops(value)

  const patchColorStops = (next: GradientStop[]) => {
    const sorted = [...next].sort((a, b) => a.position - b.position)
    const isSolid = sorted.length <= 2 && new Set(sorted.map(s => s.color)).size <= 1
    if (isSolid) {
      patch({ color: sorted[0]?.color ?? '#6b7280', colorGradient: undefined, opacity: undefined })
    } else {
      patch({ color: sorted[0].color, colorGradient: sorted, opacity: undefined })
    }
  }

  const resetAll = () => onChange(mergeConnectionStyle())

  return (
    <div className="space-y-4">
      <FlowEdgeSettingPreview
        value={value}
        headerRight={
          <Button type="button" variant="ghost" size="sm" className={FLOW_INSPECTOR_RESET_ALL_BUTTON} onClick={resetAll}>
            {t('flowInspector.resetAllStyles')}
          </Button>
        }
      />

      {onEdgeConditionChange ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
          <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('devPipelines.edgeCondition')}</Label>
          <Select value={edgeCondition ?? 'always'} onValueChange={v => onEdgeConditionChange(v as DevPipelineEdgeCondition)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">{t('devPipelines.edgeConditionAlways')}</SelectItem>
              <SelectItem value="on-success">{t('devPipelines.edgeConditionOnSuccess')}</SelectItem>
              <SelectItem value="on-failure">{t('devPipelines.edgeConditionOnFailure')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] leading-snug text-muted-foreground">{t('devPipelines.edgeConditionHint')}</p>
        </div>
      ) : null}

      {onRunOrderChange && runOrder != null ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
          <Label className={FLOW_INSPECTOR_SECTION_LABEL} htmlFor="flow-edge-run-order">
            {t('flowInspector.runOrder')}
          </Label>
          <Input
            id="flow-edge-run-order"
            type="number"
            min={1}
            max={runOrderMax ?? runOrder}
            value={runOrder}
            className="h-8 tabular-nums"
            onChange={e => {
              const n = Number.parseInt(e.target.value, 10)
              if (Number.isFinite(n) && n >= 1) onRunOrderChange(Math.min(runOrderMax ?? n, n))
            }}
          />
          <p className="text-[10px] leading-snug text-muted-foreground">{t('flowInspector.runOrderHint')}</p>
        </div>
      ) : null}

      <Tabs defaultValue="label" className="gap-4">
        <TabsList className="grid h-9 w-full grid-cols-2">
          <TabsTrigger value="label" className="text-xs">
            {t('flowInspector.edgeTabLabel')}
          </TabsTrigger>
          <TabsTrigger value="line" className="text-xs">
            {t('flowInspector.edgeTabLine')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="label" className="mt-0 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.label')}</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="flow-edge-label-show" checked={value.labelVisible} onCheckedChange={c => patch({ labelVisible: c === true })} />
                <Label htmlFor="flow-edge-label-show" className="text-xs font-normal">
                  {t('flowInspector.labelShow')}
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid min-w-0 gap-1">
                <Label className="text-xs text-muted-foreground">{t('flowInspector.edgeLabelText')}</Label>
                <Input
                  value={value.label}
                  onChange={e => patch({ label: e.target.value })}
                  placeholder={t('flowInspector.label')}
                  className="h-9 min-w-0"
                />
              </div>
              <FlowColorPickerField
                label={t('automation.pageMap.annotationColor')}
                labelClassName="text-xs font-normal normal-case tracking-normal text-muted-foreground"
                value={mergedLabel.color ?? ''}
                onCommit={hex => patchLabelStyle({ color: hex })}
                onReset={() => patchLabelStyle({ color: '' })}
                resetDisabled={!value.labelStyle?.color?.trim()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid min-w-0 gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">{t('automation.pageMap.annotationFontSize')}</Label>
                  <button
                    type="button"
                    className={FLOW_INSPECTOR_RESET_LINK}
                    disabled={value.labelStyle?.fontSize === undefined}
                    onClick={() => patchLabelStyle({ fontSize: undefined })}
                  >
                    {t('flowInspector.nodeBorderAnimationReset')}
                  </button>
                </div>
                <Select value={String(mergedLabel.fontSize)} onValueChange={v => patchLabelStyle({ fontSize: Number(v) })}>
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOW_LABEL_FONT_SIZES.map(size => (
                      <SelectItem key={size} value={String(size)}>
                        {size}px
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">{t('automation.pageMap.annotationFontFamily')}</Label>
                  <button
                    type="button"
                    className={FLOW_INSPECTOR_RESET_LINK}
                    disabled={value.labelStyle?.fontFamily === undefined}
                    onClick={() => patchLabelStyle({ fontFamily: undefined })}
                  >
                    {t('flowInspector.nodeBorderAnimationReset')}
                  </button>
                </div>
                <Select value={mergedLabel.fontFamily} onValueChange={v => patchLabelStyle({ fontFamily: v as FlowConnectionLabelStyle['fontFamily'] })}>
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOW_LABEL_FONT_FAMILIES.map(f => (
                      <SelectItem key={f} value={f}>
                        {t(`automation.pageMap.annotationFont.${f}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.edgeLabelBackground')}</Label>
              <button
                type="button"
                className={FLOW_INSPECTOR_RESET_LINK}
                disabled={
                  !mergedLabel.backgroundColor?.trim() &&
                  !mergedLabel.borderColor?.trim() &&
                  !labelAccentMode
                }
                onClick={() => patchLabelStyle({ backgroundColor: '', borderColor: '', labelAccentGradient: undefined })}
              >
                {t('flowInspector.nodeBorderAnimationReset')}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
              <Label htmlFor="flow-edge-label-accent-mode" className="text-xs font-normal text-muted-foreground">
                {t('flowInspector.edgeLabelAccentGradient')}
              </Label>
              <Switch id="flow-edge-label-accent-mode" checked={labelAccentMode} onCheckedChange={setLabelAccentMode} />
            </div>
            {labelAccentMode ? (
              <>
                <GradientPresetsGrid activeStops={labelAccentStops} onPickTemplate={patchLabelAccentStops} />
                <GradientStopEditor stops={labelAccentStops} onChange={patchLabelAccentStops} />
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <FlowColorPickerField
                  label={t('flowInspector.background')}
                  labelClassName="text-xs font-normal normal-case tracking-normal text-muted-foreground"
                  value={mergedLabel.backgroundColor?.trim() || '#ffffff'}
                  onCommit={hex => patchLabelStyle({ backgroundColor: hex })}
                />
                <FlowColorPickerField
                  label={t('flowInspector.border')}
                  labelClassName="text-xs font-normal normal-case tracking-normal text-muted-foreground"
                  value={labelBorderColor}
                  onCommit={hex => patchLabelStyle({ borderColor: hex })}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.edgeLabelBorder')}</Label>
              <button
                type="button"
                className={FLOW_INSPECTOR_RESET_LINK}
                disabled={value.labelStyle?.borderWidth === undefined}
                onClick={() => patchLabelStyle({ borderWidth: undefined })}
              >
                {t('flowInspector.nodeBorderAnimationReset')}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{t('flowInspector.nodeBorderWidth')}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {mergedLabel.borderWidth === 0
                  ? t('flowInspector.nodeBorderNone')
                  : `${labelBorderStaticPx.toFixed(2)}px`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.25}
              value={mergedLabel.borderWidth}
              onChange={e => {
                const borderWidth = Number(e.target.value) as FlowConnectionLabelStyle['borderWidth']
                const next: Partial<FlowConnectionLabelStyle> = { borderWidth }
                if ((borderWidth ?? 0) > 0 && !labelAccentMode && !mergedLabel.borderColor?.trim()) {
                  next.borderColor = '#94a3b8'
                }
                patchLabelStyle(next)
              }}
              className="h-1.5 w-full cursor-pointer accent-primary"
              aria-label={t('flowInspector.nodeBorderWidth')}
            />
          </div>
        </TabsContent>

        <TabsContent value="line" className="mt-0 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.style')}</Label>
              <button
                type="button"
                className={FLOW_INSPECTOR_RESET_LINK}
                disabled={value.curve === FLOW_CONNECTION_STYLE_DEFAULT.curve}
                onClick={() => patch({ curve: FLOW_CONNECTION_STYLE_DEFAULT.curve })}
              >
                {t('flowInspector.nodeBorderAnimationReset')}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CURVES.map(curve => {
                const active = value.curve === curve
                return (
                  <Button
                    key={curve}
                    type="button"
                    variant={active ? 'secondary' : 'outline'}
                    className={cn('h-9 gap-1.5 justify-center px-2', active && 'ring-2 ring-primary/40')}
                    onClick={() => patch({ curve })}
                  >
                    {curveIcon(curve)}
                    <span className="text-xs">{curveLabel(t, curve)}</span>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.color')}</Label>
              <button
                type="button"
                className={FLOW_INSPECTOR_RESET_LINK}
                onClick={() => patch({ color: FLOW_CONNECTION_STYLE_DEFAULT.color, colorGradient: undefined, opacity: undefined })}
              >
                {t('flowInspector.nodeBorderAnimationReset')}
              </button>
            </div>
            <GradientPresetsGrid activeStops={colorStops} onPickTemplate={patchColorStops} />
            <GradientStopEditor stops={colorStops} onChange={patchColorStops} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.lineType')}</Label>
                <button
                  type="button"
                  className={FLOW_INSPECTOR_RESET_LINK}
                  disabled={value.dash === FLOW_CONNECTION_STYLE_DEFAULT.dash}
                  onClick={() => patch({ dash: FLOW_CONNECTION_STYLE_DEFAULT.dash })}
                >
                  {t('flowInspector.nodeBorderAnimationReset')}
                </button>
              </div>
              <Select value={value.dash} onValueChange={v => patch({ dash: v as FlowEdgeDashKind })}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">{t('flowInspector.lineSolid')}</SelectItem>
                  <SelectItem value="dashed">{t('flowInspector.lineDashed')}</SelectItem>
                  <SelectItem value="dotted">{t('flowInspector.lineDotted')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.width')}</Label>
                <button
                  type="button"
                  className={FLOW_INSPECTOR_RESET_LINK}
                  disabled={value.width === FLOW_CONNECTION_STYLE_DEFAULT.width}
                  onClick={() => patch({ width: FLOW_CONNECTION_STYLE_DEFAULT.width })}
                >
                  {t('flowInspector.nodeBorderAnimationReset')}
                </button>
              </div>
              <input
                type="range"
                min={0.25}
                max={1.5}
                step={0.25}
                value={value.width}
                onChange={e => patch({ width: Number(e.target.value) as FlowConnectionStyle['width'] })}
                className="h-1.5 w-full cursor-pointer accent-primary"
                aria-label={t('flowInspector.width')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.animation')}</Label>
              <button
                type="button"
                className={FLOW_INSPECTOR_RESET_LINK}
                disabled={(value.animation ?? 'none') === 'none' && value.animationSpeed === undefined}
                onClick={() => patch({ animation: 'none', animationSpeed: undefined })}
              >
                {t('flowInspector.nodeBorderAnimationReset')}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {FLOW_EDGE_INSPECTOR_ANIMATIONS.map(kind => {
                const active = value.animation === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => patch({ animation: kind })}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border border-border/80 bg-card/50 p-1.5 text-left transition-all',
                      active ? 'ring-2 ring-primary/45 ring-offset-1 ring-offset-background' : 'hover:bg-muted/40'
                    )}
                  >
                    <div className="flex h-9 w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/25">
                      <EdgeAnimationPreviewSvg kind={kind} color={value.color} colorStops={colorStops} speed={speed} />
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-medium leading-tight">
                      {pathAnimIcon(kind)}
                      <span className="truncate">{pathAnimLabel(t, kind)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            {value.animation && value.animation !== 'none' ? (
              <div className="flex items-center gap-2 pt-0.5">
                <span className="shrink-0 text-[11px] text-muted-foreground">{t('flowInspector.animSpeedSlow')}</span>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={speed}
                  onChange={e => patch({ animationSpeed: Number(e.target.value) })}
                  className="h-1.5 w-full cursor-pointer accent-primary"
                  aria-label={t('flowInspector.animSpeed')}
                />
                <span className="shrink-0 text-[11px] text-muted-foreground">{t('flowInspector.animSpeedFast')}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Checkbox id="flow-edge-bi" checked={value.bidirectional} onCheckedChange={c => patch({ bidirectional: c === true })} />
              <Label htmlFor="flow-edge-bi" className="text-xs font-normal">
                {t('flowInspector.bidirectional')}
              </Label>
            </div>
            <button
              type="button"
              className={FLOW_INSPECTOR_RESET_LINK}
              disabled={!value.bidirectional}
              onClick={() => patch({ bidirectional: false })}
            >
              {t('flowInspector.nodeBorderAnimationReset')}
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
