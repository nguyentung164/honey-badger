'use client'

import { useEffect, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const HEX_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

function normalizeHex(value: string): string {
  const v = value.trim().replace(/^#/, '')
  if (v.length === 3) return '#' + v.split('').map(c => c + c).join('')
  if (v.length === 6 && /^[0-9A-Fa-f]+$/.test(v)) return '#' + v
  return ''
}

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ColorPicker({ value, onChange, placeholder = '#000000', className, disabled }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const displayColor = value && HEX_REGEX.test(value) ? value : '#94a3b8'

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  const handlePickerChange = (hex: string) => {
    setInputValue(hex)
    onChange(hex)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === '') {
      setInputValue('')
      onChange('')
      return
    }
    const v = raw.startsWith('#') ? raw : '#' + raw
    if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
      setInputValue(v)
      const normalized = normalizeHex(v)
      if (normalized) onChange(normalized)
    }
  }

  const handleInputBlur = () => {
    const normalized = normalizeHex(inputValue)
    if (normalized) {
      setInputValue(normalized)
      onChange(normalized)
    } else if (inputValue && !normalized) {
      setInputValue(value || '')
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="h-9 w-9 shrink-0 rounded-md border border-input shadow-xs hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            style={{ backgroundColor: displayColor }}
            aria-label="Chọn màu"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <HexColorPicker color={displayColor} onChange={handlePickerChange} style={{ width: 200, height: 150 }} />
        </PopoverContent>
      </Popover>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="w-24 font-mono text-sm uppercase"
        disabled={disabled}
      />
    </div>
  )
}
