'use client'

import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  LayoutGrid,
  LayoutList,
  Minimize2,
  PanelBottom,
} from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowNodeContentLayoutKind, FlowNodeContentLayoutContext } from 'shared/flowNodeContentLayout'
import {
  FLOW_NODE_CONTENT_DENSITIES,
  FLOW_NODE_CONTENT_LAYOUT_KINDS,
  FLOW_NODE_CONTENT_METADATA_MODES,
} from 'shared/flowNodeContentLayout'
import type { FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { FLOW_INSPECTOR_RESET_LINK, FLOW_INSPECTOR_SECTION_LABEL } from '@/components/flow-inspector/flowInspectorUi'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const LAYOUT_ICONS: Record<FlowNodeContentLayoutKind, typeof LayoutList> = {
  inline: AlignHorizontalJustifyCenter,
  stacked: AlignVerticalJustifyCenter,
  iconBlock: LayoutGrid,
  badgeLeading: LayoutList,
  compact: Minimize2,
  metadata: PanelBottom,
}

const LAYOUT_LABEL_KEYS: Record<FlowNodeContentLayoutKind, string> = {
  inline: 'flowInspector.contentLayoutInline',
  stacked: 'flowInspector.contentLayoutStacked',
  iconBlock: 'flowInspector.contentLayoutIconBlock',
  badgeLeading: 'flowInspector.contentLayoutBadgeLeading',
  compact: 'flowInspector.contentLayoutCompact',
  metadata: 'flowInspector.contentLayoutMetadata',
}

type Props = {
  value: FlowNodeVisualStyle
  onChange: (next: FlowNodeVisualStyle) => void
  layoutContext: FlowNodeContentLayoutContext
  boardDefaultChecked?: boolean
  onBoardDefaultCheckedChange?: (next: boolean) => void
  onResetBoardDefault?: () => void
  hasBoardDefault?: boolean
}

export const FlowNodeContentLayoutSection = memo(function FlowNodeContentLayoutSection({
  value,
  onChange,
  layoutContext,
  boardDefaultChecked,
  onBoardDefaultCheckedChange,
  onResetBoardDefault,
  hasBoardDefault,
}: Props) {
  const { t } = useTranslation()
  const patch = (p: Partial<FlowNodeVisualStyle>) => onChange({ ...value, ...p })
  const currentLayout = value.contentLayout ?? (layoutContext === 'pipelineStep' ? 'stacked' : 'inline')
  const isCompact = currentLayout === 'compact'

  const resetLayout = () => {
    const next = { ...value }
    delete next.contentLayout
    delete next.contentDensity
    delete next.metadataMode
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.contentLayoutTitle')}</Label>
        <button type="button" className={FLOW_INSPECTOR_RESET_LINK} onClick={resetLayout}>
          {t('flowInspector.resetContentLayout')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {FLOW_NODE_CONTENT_LAYOUT_KINDS.map(kind => {
          const Icon = LAYOUT_ICONS[kind]
          const selected = currentLayout === kind
          return (
            <button
              key={kind}
              type="button"
              title={t(LAYOUT_LABEL_KEYS[kind])}
              aria-label={t(LAYOUT_LABEL_KEYS[kind])}
              aria-pressed={selected}
              onClick={() => {
                const p: Partial<FlowNodeVisualStyle> = { contentLayout: kind }
                if (kind === 'compact') p.metadataMode = 'hidden'
                if (kind === 'metadata') p.metadataMode = 'always'
                patch(p)
              }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-[9px] transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/40'
                  : 'border-border/60 bg-muted/10 text-muted-foreground hover:border-primary/40 hover:bg-muted/25',
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2 text-center leading-tight">{t(LAYOUT_LABEL_KEYS[kind])}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1">
          <Label className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.contentDensityTitle')}</Label>
          <Select
            value={value.contentDensity ?? 'comfortable'}
            onValueChange={v => patch({ contentDensity: v as FlowNodeVisualStyle['contentDensity'] })}
          >
            <SelectTrigger className="h-8 w-full min-w-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLOW_NODE_CONTENT_DENSITIES.map(d => (
                <SelectItem key={d} value={d} className="text-xs">
                  {t(`flowInspector.contentDensity${d.charAt(0).toUpperCase()}${d.slice(1)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-1">
          <Label className={FLOW_INSPECTOR_SECTION_LABEL}>
            {layoutContext === 'pipelineStep'
              ? t('flowInspector.metadataModePipelineTitle')
              : t('flowInspector.metadataModeTitle')}
          </Label>
          <Select
            value={value.metadataMode ?? (layoutContext === 'pipelineStep' ? 'hidden' : 'toggle')}
            onValueChange={v => patch({ metadataMode: v as FlowNodeVisualStyle['metadataMode'] })}
            disabled={isCompact || currentLayout === 'metadata'}
          >
            <SelectTrigger className="h-8 w-full min-w-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLOW_NODE_CONTENT_METADATA_MODES.map(m => (
                <SelectItem key={m} value={m} className="text-xs">
                  {t(`flowInspector.metadataMode${m.charAt(0).toUpperCase()}${m.slice(1)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isCompact ? <p className="text-[10px] leading-snug text-muted-foreground">{t('flowInspector.metadataModeCompactHint')}</p> : null}

      {onBoardDefaultCheckedChange ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="flow-board-layout-default" className={FLOW_INSPECTOR_SECTION_LABEL}>
                {t('flowInspector.boardDefaultLayout')}
              </Label>
              <p className="text-[10px] leading-snug text-muted-foreground">{t('flowInspector.boardDefaultLayoutHint')}</p>
            </div>
            <Switch
              id="flow-board-layout-default"
              size="sm"
              checked={boardDefaultChecked ?? false}
              onCheckedChange={onBoardDefaultCheckedChange}
              className="shrink-0"
            />
          </div>
          {hasBoardDefault && onResetBoardDefault ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onResetBoardDefault}>
              {t('flowInspector.resetBoardDefault')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
