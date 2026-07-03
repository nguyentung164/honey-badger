'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerTrigger,
} from '@/components/editor/editor-ui/color-picker'
import { cn } from '@/lib/utils'

const HEX6 = /^#[0-9a-fA-F]{6}$/

export function normalizeTerminalCursorHex(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (HEX6.test(trimmed)) return trimmed.toLowerCase()

  const short = trimmed.match(/^#?([0-9a-fA-F]{3})$/)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0')
    return `#${toHex(Number(rgb[1]))}${toHex(Number(rgb[2]))}${toHex(Number(rgb[3]))}`
  }

  return fallback
}

type TerminalCursorColorPickerProps = {
  value: string
  /** Persisted when the popover closes or a valid hex is committed from input. */
  onCommit: (color: string) => void
  /** Live preview while dragging — update DOM directly; avoid parent React state. */
  onLiveChange?: (color: string) => void
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export function TerminalCursorColorPicker({
  value,
  onCommit,
  onLiveChange,
  onOpenChange,
  disabled,
  ariaLabel,
}: TerminalCursorColorPickerProps) {
  const [open, setOpen] = useState(false)
  const committed = normalizeTerminalCursorHex(value, '#528bff')
  const swatchRef = useRef<HTMLSpanElement>(null)
  const liveColorRef = useRef(committed)

  useEffect(() => {
    if (!open) {
      liveColorRef.current = committed
      if (swatchRef.current) swatchRef.current.style.backgroundColor = committed
    }
  }, [committed, open])

  const flush = (next: string) => {
    const normalized = normalizeTerminalCursorHex(next, committed)
    if (normalized !== committed) onCommit(normalized)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      liveColorRef.current = committed
      if (swatchRef.current) swatchRef.current.style.backgroundColor = committed
    } else if (open) {
      flush(liveColorRef.current)
    }
    setOpen(next)
    onOpenChange?.(next)
  }

  const handleValueChange = (next: string) => {
    const normalized = normalizeTerminalCursorHex(next, liveColorRef.current)
    liveColorRef.current = normalized
    if (swatchRef.current) swatchRef.current.style.backgroundColor = normalized
    onLiveChange?.(normalized)
  }

  return (
    <div className="flex h-9 shrink-0 items-center">
      <ColorPicker
        modal
        defaultFormat="hex"
        defaultValue={committed}
        value={open ? undefined : committed}
        open={open}
        onOpenChange={handleOpenChange}
        onValueChange={handleValueChange}
        disabled={disabled}
        className="inline-flex h-9 items-center"
      >
        <ColorPickerTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-input shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
            )}
            aria-label={ariaLabel}
          >
            <span
              ref={swatchRef}
              className="absolute inset-0"
              style={{ backgroundColor: committed }}
              aria-hidden
            />
          </button>
        </ColorPickerTrigger>
        <ColorPickerContent align="start">
          <ColorPickerArea />
          <div className="flex items-center gap-2">
            <ColorPickerEyeDropper />
            <div className="flex flex-1 flex-col gap-2">
              <ColorPickerHueSlider />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ColorPickerFormatSelect />
            <ColorPickerInput />
          </div>
        </ColorPickerContent>
      </ColorPicker>
    </div>
  )
}
