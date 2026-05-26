'use client'

import type { CSSProperties } from 'react'
import { useCallback, useMemo } from 'react'
import {
  ArrowDownRight,
  Circle,
  Cloud,
  Droplets,
  Gem,
  Lightbulb,
  Repeat2,
  Scan,
  Signal,
  Sparkles,
  Square,
  Stars,
  Sun,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FlowNodeAnimationKind, FlowNodeVisualStyle, GradientStop } from 'shared/flowDiagramStyle'
import { effectiveAccentColor, effectiveAccentStops, isMultiColorGradient } from 'shared/flowDiagramStyle'
import type { PageMapAnnotationStyle } from 'shared/pageMapAnnotationStyle'
import {
  mergePageMapAnnotationStyle,
  PAGE_MAP_ANNOTATION_FONT_FAMILIES,
  PAGE_MAP_ANNOTATION_FONT_SIZES,
  PAGE_MAP_ANNOTATION_STYLE_DEFAULT,
  pageMapAnnotationFontFamilyCss,
  pageMapAnnotationHasAccent,
  pageMapAnnotationStyleToDiagramVisual,
  resolvedPageMapAnnotationTextColor,
} from 'shared/pageMapAnnotationStyle'
import { FlowColorPickerField } from '@/components/flow-inspector/FlowColorPickerField'
import { GradientPresetsGrid, GradientStopEditor } from '@/components/flow-inspector/FlowGradientStopEditor'
import { FlowNodeBorderAnimPreviewSvg } from '@/components/flow-inspector/FlowInspectorSettingPreviews'
import { FLOW_NODE_INSPECTOR_ORBIT_ANIMATIONS } from '@/components/flow-inspector/FlowNodeVisualConfigPanel'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import {
  FLOW_INSPECTOR_RESET_ALL_BUTTON,
  FLOW_INSPECTOR_RESET_LINK,
  FLOW_INSPECTOR_SECTION_LABEL,
} from '@/components/flow-inspector/flowInspectorUi'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import { BaseNode, BaseNodeContent } from '@/components/flow-inspector/BaseNode'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type PageMapAnnotationDraft = {
  content: string
  labelNumber: number
  width: number
  height: number
  style: PageMapAnnotationStyle
}

type Props = {
  value: PageMapAnnotationDraft
  onChange: (next: PageMapAnnotationDraft) => void
}

/** Match node / edge / group inspector: small caps section titles. */
const SECTION_LABEL = FLOW_INSPECTOR_SECTION_LABEL

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

function AnnotationPreview({ draft }: { draft: PageMapAnnotationDraft }) {
  const merged = mergePageMapAnnotationStyle(draft.style)
  const diagramVisual = pageMapAnnotationStyleToDiagramVisual(merged)
  const hasAccent = pageMapAnnotationHasAccent(merged)
  const color = resolvedPageMapAnnotationTextColor(merged)
  const textStyle = {
    color,
    fontSize: merged.fontSize,
    fontFamily: pageMapAnnotationFontFamilyCss(merged.fontFamily ?? 'system'),
  } satisfies CSSProperties

  return (
    <FlowNodeVisualShell
      diagramVisual={diagramVisual}
      showHandles={false}
      accentBackground={hasAccent}
      interiorBackground="transparent"
      className={cn('inline-block max-w-full', hasAccent && 'rounded-lg')}
      cardClassName="border-none bg-transparent shadow-none"
      innerClassName="overflow-visible"
    >
      <BaseNode className="w-full max-w-none border-none bg-transparent text-secondary-foreground shadow-none ring-0">
        <BaseNodeContent
          className="flex flex-col gap-0 pb-0 pr-1 pt-1 leading-snug"
          style={{ width: draft.width, minHeight: draft.height }}
        >
          <p className="whitespace-pre-wrap break-words leading-snug" style={textStyle}>
            {draft.content.trim() || '…'}
          </p>
          <div className="pointer-events-none -mt-1 flex justify-end pr-0 text-muted-foreground">
            <ArrowDownRight size={12} aria-hidden />
          </div>
        </BaseNodeContent>
      </BaseNode>
    </FlowNodeVisualShell>
  )
}

export function PageMapAnnotationConfigPanel({ value, onChange }: Props) {
  const { t } = useTranslation()
  const merged = mergePageMapAnnotationStyle(value.style)

  const patch = (partial: Partial<PageMapAnnotationDraft>) => onChange({ ...value, ...partial })
  const patchStyle = (partial: Partial<PageMapAnnotationStyle>) => patch({ style: { ...value.style, ...partial } })

  const patchAccentStops = useCallback(
    (next: GradientStop[]) => {
      const sorted = [...next].sort((a, b) => a.position - b.position)
      const isSolid = sorted.length <= 2 && new Set(sorted.map(s => s.color)).size <= 1
      if (isSolid) {
        patchStyle({ accentColor: sorted[0]?.color ?? '#94a3b8', accentGradient: undefined })
      } else {
        patchStyle({ accentColor: sorted[0].color, accentGradient: sorted })
      }
    },
    [patchStyle]
  )

  const accentStops = merged.accentGradient?.length
    ? merged.accentGradient
    : [
        { color: merged.accentColor?.trim() || '#94a3b8', position: 0 },
        { color: merged.accentColor?.trim() || '#94a3b8', position: 100 },
      ]

  const resetAllStyle = () => patch({ style: mergePageMapAnnotationStyle() })

  const diagramVisual = useMemo(() => pageMapAnnotationStyleToDiagramVisual(merged), [merged])
  const shell = useMemo(() => resolveFlowNodeShellVisual(diagramVisual), [diagramVisual])
  const accentCol = pageMapAnnotationHasAccent(merged)
    ? effectiveAccentColor(diagramVisual as FlowNodeVisualStyle)
    : '#94a3b8'
  const accentGradientPreview =
    pageMapAnnotationHasAccent(merged) && isMultiColorGradient(effectiveAccentStops(diagramVisual as FlowNodeVisualStyle))
      ? effectiveAccentStops(diagramVisual as FlowNodeVisualStyle)
      : undefined
  const orbitBorderPx = shell.orbitBorderPx
  const speed = merged.nodeAnimationSpeed ?? 1

  const colorHex = merged.color
  const colorResetDisabled = !value.style.color?.trim()

  const fontSizeResetDisabled = (value.style.fontSize ?? PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontSize) === PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontSize

  const fontFamilyResetDisabled =
    (value.style.fontFamily ?? PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontFamily) === PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontFamily

  const borderWidthResetDisabled = value.style.borderWidth === undefined
  const animResetDisabled = value.style.nodeAnimation === undefined && value.style.nodeAnimationSpeed === undefined

  return (
    <div className="grid gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className={SECTION_LABEL}>{t('flowInspector.preview')}</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={FLOW_INSPECTOR_RESET_ALL_BUTTON}
            onClick={resetAllStyle}
          >
            {t('flowInspector.resetAllStyles')}
          </Button>
        </div>
        <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-border/70 bg-muted/15 p-4">
          <div className="max-w-full">
            <AnnotationPreview draft={value} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="layout" className="w-full">
        <TabsList className="grid h-8 w-full grid-cols-2 gap-0.5 rounded-md bg-muted/40 p-0.5">
          <TabsTrigger value="layout" className="h-7 px-2 text-[11px]">
            {t('flowInspector.inspectorTabLayout')}
          </TabsTrigger>
          <TabsTrigger value="style" className="h-7 px-2 text-[11px]">
            {t('flowInspector.inspectorTabStyle')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layout" className="mt-4 grid gap-4">
      <div className="space-y-1.5">
        <Label className={SECTION_LABEL}>{t('automation.pageMap.annotationContent')}</Label>
        <Textarea className="min-h-[4.5rem] text-sm" value={value.content} onChange={e => patch({ content: e.target.value })} />
      </div>

      <FlowColorPickerField
        label={t('automation.pageMap.annotationColor')}
        labelClassName={SECTION_LABEL}
        value={colorHex}
        onCommit={hex => patchStyle({ color: hex })}
        onReset={() => patchStyle({ color: '' })}
        resetDisabled={colorResetDisabled}
      />

      <div className="flex min-w-0 flex-row gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <Label className={SECTION_LABEL}>{t('automation.pageMap.annotationFontSize')}</Label>
            <button
              type="button"
              className={FLOW_INSPECTOR_RESET_LINK}
              disabled={fontSizeResetDisabled}
              onClick={() => patchStyle({ fontSize: undefined })}
            >
              {t('flowInspector.nodeBorderAnimationReset')}
            </button>
          </div>
          <Select value={String(merged.fontSize)} onValueChange={v => patchStyle({ fontSize: Number(v) })}>
            <SelectTrigger className="h-9 w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_MAP_ANNOTATION_FONT_SIZES.map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size}px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <Label className={SECTION_LABEL}>{t('automation.pageMap.annotationFontFamily')}</Label>
            <button
              type="button"
              className={FLOW_INSPECTOR_RESET_LINK}
              disabled={fontFamilyResetDisabled}
              onClick={() => patchStyle({ fontFamily: undefined })}
            >
              {t('flowInspector.nodeBorderAnimationReset')}
            </button>
          </div>
          <Select
            value={merged.fontFamily ?? 'system'}
            onValueChange={v => patchStyle({ fontFamily: v as PageMapAnnotationStyle['fontFamily'] })}
          >
            <SelectTrigger className="h-9 w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_MAP_ANNOTATION_FONT_FAMILIES.map(f => (
                <SelectItem key={f} value={f}>
                  {t(`automation.pageMap.annotationFont.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="style" className="mt-4 grid gap-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className={SECTION_LABEL}>{t('flowInspector.accentColors')}</Label>
          <button
            type="button"
            className={FLOW_INSPECTOR_RESET_LINK}
            disabled={!pageMapAnnotationHasAccent(merged)}
            onClick={() => patchStyle({ accentColor: '', accentGradient: undefined })}
          >
            {t('flowInspector.nodeBorderAnimationReset')}
          </button>
        </div>
        <GradientPresetsGrid activeStops={accentStops} onPickTemplate={patchAccentStops} />
        <GradientStopEditor stops={accentStops} onChange={patchAccentStops} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className={SECTION_LABEL}>{t('flowInspector.nodeBorderWidth')}</Label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {merged.borderWidth !== undefined
                ? merged.borderWidth === 0
                  ? t('flowInspector.nodeBorderNone')
                  : `${merged.borderWidth}px`
                : t('flowInspector.nodeBorderAuto')}
            </span>
            <button
              type="button"
              disabled={borderWidthResetDisabled}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
              onClick={() => patchStyle({ borderWidth: undefined })}
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
          value={merged.borderWidth ?? 0.5}
          onChange={e => patchStyle({ borderWidth: Number(e.target.value) as PageMapAnnotationStyle['borderWidth'] })}
          className="h-1.5 w-full cursor-pointer accent-primary"
          aria-label={t('flowInspector.nodeBorderWidth')}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className={SECTION_LABEL}>{t('flowInspector.nodeBorderAnimation')}</Label>
          <button
            type="button"
            disabled={animResetDisabled}
            className={FLOW_INSPECTOR_RESET_LINK}
            onClick={() => patchStyle({ nodeAnimation: undefined, nodeAnimationSpeed: undefined })}
          >
            {t('flowInspector.nodeBorderAnimationReset')}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {FLOW_NODE_INSPECTOR_ORBIT_ANIMATIONS.map(kind => {
            const active = merged.nodeAnimation === kind
            return (
              <button
                key={kind}
                type="button"
                onClick={() => patchStyle({ nodeAnimation: kind })}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border border-border/80 bg-card/50 p-1.5 text-left transition-all',
                  active ? 'ring-2 ring-primary/45 ring-offset-1 ring-offset-background' : 'hover:bg-muted/40'
                )}
              >
                <div className="flex h-9 w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/25">
                  <FlowNodeBorderAnimPreviewSvg
                    kind={kind}
                    accent={accentCol}
                    gradient={accentGradientPreview}
                    speed={speed}
                    borderPx={orbitBorderPx}
                  />
                </div>
                <div className="flex items-center gap-1 text-[9px] font-medium leading-tight">
                  {nodeAnimIcon(kind)}
                  <span className="truncate">{t(`flowInspector.nodeAnim${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)}</span>
                </div>
              </button>
            )
          })}
        </div>

        {merged.nodeAnimation ? (
          <div className="flex items-center gap-2 pt-0.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">{t('flowInspector.animSpeedSlow')}</span>
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={speed}
              onChange={e => patchStyle({ nodeAnimationSpeed: Number(e.target.value) })}
              className="h-1.5 w-full cursor-pointer accent-primary"
              aria-label={t('flowInspector.animSpeed')}
            />
            <span className="shrink-0 text-[11px] text-muted-foreground">{t('flowInspector.animSpeedFast')}</span>
          </div>
        ) : null}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
