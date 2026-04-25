'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ConfigInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: string
  onSync: (value: string) => void
  debounceMs?: number
}

export function ConfigInput({ value, onSync, debounceMs = 300, type, className, ...props }: ConfigInputProps) {
  const { t } = useTranslation()
  const [localValue, setLocalValue] = useState(value)
  const [showPassword, setShowPassword] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocusedRef = useRef(false)

  useEffect(() => {
    if (!isFocusedRef.current && value !== localValue) {
      setLocalValue(value)
    }
  }, [value])

  const flushDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  const syncToStore = useCallback(
    (newValue: string) => {
      if (newValue !== value) {
        onSync(newValue)
      }
    },
    [value, onSync]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setLocalValue(newValue)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        syncToStore(newValue)
      }, debounceMs)
    },
    [debounceMs, syncToStore]
  )

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false
    flushDebounce()
    syncToStore(localValue)
  }, [flushDebounce, localValue, syncToStore])

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true
  }, [])

  useEffect(() => {
    return () => flushDebounce()
  }, [flushDebounce])

  const isPassword = type === 'password'
  const inputType = isPassword && showPassword ? 'text' : type

  const inputEl = (
    <Input
      {...props}
      type={inputType}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={cn(isPassword && 'pr-9', className)}
    />
  )

  if (isPassword) {
    return (
      <div className="relative">
        {inputEl}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-muted/50"
          onClick={() => setShowPassword(prev => !prev)}
          tabIndex={-1}
          aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
        >
          {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
    )
  }

  return inputEl
}
