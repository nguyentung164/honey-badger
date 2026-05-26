'use client'

import { useEffect, useState } from 'react'
import {
  ColorPicker,
  ColorPickerAlphaSlider,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerTrigger,
} from '@/components/editor/editor-ui/color-picker'
import { flowColorCss, normalizeFlowPickerColor } from 'shared/flowColor'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  /** Called when the user closes the popover or finishes a valid color edit elsewhere. */
  onCommit: (color: string) => void
  /** Live preview while dragging (does not commit to parent). */
  onLiveChange?: (color: string) => void
  swatchClassName?: string
  /** `filled` = solid swatch; `ring` = tinted fill + colored border (icon / gradient stops). */
  variant?: 'filled' | 'ring'
  ariaLabel?: string
  disabled?: boolean
}

/**
 * Full shadcn color picker (area, hue, alpha, eyedropper, format + hex input).
 * Commits rgba/hex with alpha preserved for diagram chrome.
 */
export function FlowColorPickerPopover({
  value,
  onCommit,
  onLiveChange,
  swatchClassName,
  variant = 'filled',
  ariaLabel,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [live, setLive] = useState(() => normalizeFlowPickerColor(value))

  useEffect(() => {
    if (!open) setLive(normalizeFlowPickerColor(value))
  }, [open, value])

  const display = flowColorCss(open ? live : value, flowColorCss(value))

  const flush = (next: string) => {
    const normalized = normalizeFlowPickerColor(next)
    if (normalized !== normalizeFlowPickerColor(value)) onCommit(normalized)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) setLive(normalizeFlowPickerColor(value))
    if (!next && open) flush(live)
    setOpen(next)
  }

  const handleValueChange = (next: string) => {
    const normalized = normalizeFlowPickerColor(next)
    setLive(normalized)
    onLiveChange?.(normalized)
  }

  const swatchStyle =
    variant === 'ring'
      ? { borderColor: display, backgroundColor: display }
      : { backgroundColor: display }

  const checkerboard =
    'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'

  return (
    <ColorPicker
      modal
      defaultFormat="rgb"
      value={live}
      open={open}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <ColorPickerTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'relative shrink-0 cursor-pointer overflow-hidden rounded-md shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            variant === 'ring' ? 'border-2' : 'border border-input',
            swatchClassName ?? 'size-9',
          )}
          style={variant === 'ring' ? swatchStyle : undefined}
          aria-label={ariaLabel}
        >
          {variant === 'filled' ? (
            <>
              <span
                className="absolute inset-0"
                style={{
                  backgroundImage: checkerboard,
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                }}
                aria-hidden
              />
              <span className="absolute inset-0" style={{ backgroundColor: display }} aria-hidden />
            </>
          ) : null}
        </button>
      </ColorPickerTrigger>
      <ColorPickerContent align="start">
        <ColorPickerArea />
        <div className="flex items-center gap-2">
          <ColorPickerEyeDropper />
          <div className="flex flex-1 flex-col gap-2">
            <ColorPickerHueSlider />
            <ColorPickerAlphaSlider />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ColorPickerFormatSelect />
          <ColorPickerInput />
        </div>
      </ColorPickerContent>
    </ColorPicker>
  )
}

/** @deprecated Use normalizeFlowPickerColor from shared/flowColor */
export function normalizeFlowPickerHex(value: string): string {
  return normalizeFlowPickerColor(value)
}
