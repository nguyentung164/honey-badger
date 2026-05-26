'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeFlowPickerColor, parseFlowColor } from 'shared/flowColor'
import { FlowColorPickerPopover } from '@/components/flow-inspector/FlowColorPickerPopover'
import { FLOW_INSPECTOR_RESET_LINK } from '@/components/flow-inspector/flowInspectorUi'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const COLOR_INPUT = /^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\))$/

function isValidColorInput(value: string): boolean {
  const trimmed = value.trim()
  if (!COLOR_INPUT.test(trimmed)) return false
  const parsed = parseFlowColor(trimmed)
  return parsed.a >= 0 && parsed.a <= 1
}

type Props = {
  label: string
  labelClassName?: string
  value: string
  onCommit: (color: string) => void
  onReset?: () => void
  resetDisabled?: boolean
}

export function FlowColorPickerField({ label, labelClassName, value, onCommit, onReset, resetDisabled }: Props) {
  const { t } = useTranslation()
  const [live, setLive] = useState(value)

  useEffect(() => {
    setLive(value)
  }, [value])

  const flush = (next: string) => {
    const normalized = normalizeFlowPickerColor(next)
    setLive(normalized)
    if (normalized !== normalizeFlowPickerColor(value)) onCommit(normalized)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className={cn('text-xs', labelClassName)}>{label}</Label>
        {onReset ? (
          <button type="button" disabled={resetDisabled} className={FLOW_INSPECTOR_RESET_LINK} onClick={onReset}>
            {t('flowInspector.nodeBorderAnimationReset')}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <FlowColorPickerPopover
          value={value}
          onCommit={flush}
          onLiveChange={setLive}
          swatchClassName="size-9"
          ariaLabel={t('flowInspector.pickColor')}
        />
        <Input
          className="h-9 flex-1 font-mono text-xs"
          value={live}
          onChange={e => {
            const v = e.target.value
            setLive(v)
            if (isValidColorInput(v)) flush(v)
          }}
          onBlur={() => {
            if (isValidColorInput(live)) flush(live)
            else setLive(value)
          }}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
