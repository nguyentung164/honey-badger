'use client'

import { useTranslation } from 'react-i18next'
import { FLOW_OPACITY_DEFAULT, FLOW_OPACITY_MAX, FLOW_OPACITY_MIN, FLOW_OPACITY_STEP } from 'shared/flowDiagramStyle'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { FLOW_INSPECTOR_RESET_LINK, FLOW_INSPECTOR_SECTION_LABEL } from '@/components/flow-inspector/flowInspectorUi'

type Props = {
  value: number
  onChange: (next: number) => void
  onReset?: () => void
  resetDisabled?: boolean
  labelClassName?: string
}

export function FlowOpacitySliderField({ value, onChange, onReset, resetDisabled, labelClassName }: Props) {
  const { t } = useTranslation()
  const resetDisabledEffective = resetDisabled ?? value === FLOW_OPACITY_DEFAULT

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className={cn(FLOW_INSPECTOR_SECTION_LABEL, labelClassName)}>{t('flowInspector.opacity')}</Label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">{value.toFixed(1)}</span>
          {onReset ? (
            <button
              type="button"
              disabled={resetDisabledEffective}
              className={FLOW_INSPECTOR_RESET_LINK}
              onClick={onReset}
            >
              {t('flowInspector.nodeBorderAnimationReset')}
            </button>
          ) : null}
        </div>
      </div>
      <input
        type="range"
        min={FLOW_OPACITY_MIN}
        max={FLOW_OPACITY_MAX}
        step={FLOW_OPACITY_STEP}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-primary"
        aria-label={t('flowInspector.opacity')}
      />
    </div>
  )
}
