'use client'

import { Languages, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { cn } from '@/lib/utils'

const TARGET_LANGUAGES = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
] as const

export interface TranslatePanelProps {
  text: string | (() => string)
  onTranslated?: (translated: string) => void
  onApplyTranslation?: (translated: string) => void
  placeholder?: string
  readOnly?: boolean
  variant?: 'inline' | 'popover'
  className?: string
  disabled?: boolean
  title?: React.ReactNode
  renderContent?: (displayText: string, isTranslated: boolean) => React.ReactNode
  resetKey?: string | number
  renderHeader?: (controls: { translateButton: React.ReactNode; viewToggleButton: React.ReactNode | null }) => React.ReactNode
}

function hasApiKeyConfigured(
  activeApiProvider: string,
  openaiApiKey: string,
  claudeApiKey: string,
  googleApiKey: string
): boolean {
  switch (activeApiProvider) {
    case 'openai':
      return !!openaiApiKey?.trim()
    case 'claude':
      return !!claudeApiKey?.trim()
    case 'google':
      return !!googleApiKey?.trim()
    default:
      return !!openaiApiKey?.trim()
  }
}

export function TranslatePanel({
  text,
  onTranslated,
  onApplyTranslation,
  placeholder,
  readOnly = true,
  variant = 'inline',
  className,
  disabled = false,
  title,
  renderContent,
  resetKey,
  renderHeader,
}: TranslatePanelProps) {
  const { t, i18n } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const { openaiApiKey, claudeApiKey, googleApiKey, activeApiProvider } = useConfigurationStore()
  const [isTranslating, setIsTranslating] = useState(false)
  const [translatedText, setTranslatedText] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [targetLanguage, setTargetLanguage] = useState<string>(() => i18n.language || 'en')
  const [popoverOpen, setPopoverOpen] = useState(false)

  const resolvedText = typeof text === 'function' ? text() : text

  useEffect(() => {
    setTranslatedText(null)
    setShowOriginal(false)
  }, [resetKey ?? resolvedText])

  const apiKeyConfigured = hasApiKeyConfigured(
    activeApiProvider,
    openaiApiKey,
    claudeApiKey,
    googleApiKey
  )

  const targetLangLabel = TARGET_LANGUAGES.find(l => l.value === targetLanguage)?.label ?? targetLanguage
  const displayText = translatedText && !showOriginal ? translatedText : resolvedText
  const isTranslated = !!translatedText && !showOriginal

  const handleTranslate = useCallback(
    async (lang: string) => {
      const rawText = typeof text === 'function' ? text() : text
      const trimmed = rawText?.trim()
      if (!trimmed) {
        toast.error(t('translation.textEmpty'))
        return
      }
      if (!apiKeyConfigured) {
        toast.error(t('translation.apiKeyRequired'))
        return
      }
      if (trimmed.length > 4000) {
        toast.warning(t('translation.textTooLong'))
      }

      setIsTranslating(true)
      setTargetLanguage(lang)
      try {
        const targetLangLabel = TARGET_LANGUAGES.find(l => l.value === lang)?.label ?? lang
        const params = {
          type: 'AI_TRANSLATE' as const,
          values: {
            text: trimmed.slice(0, 4000),
            target_language: targetLangLabel,
            source_language: 'auto',
          },
        }
        const result = await window.api.openai.send_message(params)
        if (result.startsWith('Error')) {
          toast.error(result)
          return
        }
        setTranslatedText(result.trim())
        setShowOriginal(false)
        onTranslated?.(result.trim())
        toast.success(t('translation.success'))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(t('translation.error') + ': ' + msg)
      } finally {
        setIsTranslating(false)
      }
    },
    [text, apiKeyConfigured, onTranslated, t]
  )

  const handleApply = useCallback(() => {
    if (translatedText) {
      onApplyTranslation?.(translatedText)
      setPopoverOpen(false)
    }
  }, [translatedText, onApplyTranslation])

  const canTranslate = !!resolvedText?.trim() && apiKeyConfigured && !disabled

  const translateButton = (
    <Button
      variant={buttonVariant}
      size="icon-sm"
      className="shrink-0"
      disabled={!resolvedText?.trim() || isTranslating || disabled}
      title={t('translation.translate')}
    >
      {isTranslating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Languages className="h-3.5 w-3.5" />
      )}
    </Button>
  )

  if (variant === 'popover') {
    return (
      <div className={cn('inline-flex items-center gap-1', className)}>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>{translateButton}</PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-3">
              <div className="text-sm font-medium">{t('translation.targetLanguage')}</div>
              <div className="flex flex-wrap gap-1">
                {TARGET_LANGUAGES.map(lang => (
                  <Button
                    key={lang.value}
                    variant={targetLanguage === lang.value ? 'default' : buttonVariant}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleTranslate(lang.value)}
                    disabled={!canTranslate || isTranslating}
                  >
                    {lang.label}
                  </Button>
                ))}
              </div>
              {translatedText && (
                <div className="space-y-2">
                  <div className="rounded border bg-muted/30 p-2 text-sm max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                    {translatedText}
                  </div>
                  {onApplyTranslation && (
                    <Button variant={buttonVariant} size="sm" className="w-full" onClick={handleApply}>
                      {t('translation.applyTranslation')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  const translateDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{translateButton}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TARGET_LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.value}
            onClick={() => handleTranslate(lang.value)}
            disabled={!canTranslate || isTranslating}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const viewToggleButton = translatedText ? (
    <Button
      variant={buttonVariant}
      size="xs"
      className="h-6 text-xs"
      onClick={() => setShowOriginal(prev => !prev)}
    >
      {showOriginal ? t('translation.viewTranslation') : t('translation.viewOriginal')}
    </Button>
  ) : null

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {renderHeader ? (
        renderHeader({ translateButton: translateDropdown, viewToggleButton })
      ) : (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            {title && <span className="font-medium py-2">{title}</span>}
            {translateDropdown}
            {viewToggleButton}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {renderContent ? (
          renderContent(displayText, isTranslated)
        ) : (
          <div className="w-full min-h-[60px] overflow-auto resize-none border rounded-md p-2 text-sm break-words whitespace-pre-wrap">
            {displayText || placeholder || ''}
          </div>
        )}
      </div>
    </div>
  )
}
