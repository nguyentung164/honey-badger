'use client'

import { Sparkles } from 'lucide-react'
import { memo, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ButtonVariant } from 'main/store/AppearanceStore'

export type CommitGenerateButtonProps = {
  compact?: boolean
  variant: ButtonVariant
  isAnyLoading: boolean
  isLoadingGenerate: boolean
  onGenerate: () => void
  className?: string
}

export const CommitGenerateButton = memo(function CommitGenerateButton({
  compact = false,
  variant,
  isAnyLoading,
  isLoadingGenerate,
  onGenerate,
  className,
}: CommitGenerateButtonProps) {
  const { t } = useTranslation()
  const gradientId = useId().replace(/:/g, '')
  const iconClass = compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'
  const iconBtnClass = compact ? 'h-7 w-7 shrink-0' : 'h-9 w-9 shrink-0'

  const sparklesIcon = isLoadingGenerate ? (
    <GlowLoader className={iconClass} />
  ) : (
    <Sparkles className={iconClass} style={{ stroke: `url(#${gradientId})` }} />
  )

  const gradientDefs = (
    <svg width="0" height="0" className="pointer-events-none absolute" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  )

  if (compact) {
    return (
      <>
        {gradientDefs}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="generate-button"
              variant={variant}
              size="icon"
              className={cn(iconBtnClass, 'relative', isLoadingGenerate && 'border-effect', isAnyLoading && 'cursor-progress', className)}
              onClick={() => {
                if (!isAnyLoading) onGenerate()
              }}
            >
              {sparklesIcon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.generate')}</TooltipContent>
        </Tooltip>
      </>
    )
  }

  return (
    <>
      {gradientDefs}
      <Button
        id="generate-button"
        className={cn('relative shrink-0', isLoadingGenerate && 'border-effect', isAnyLoading && 'cursor-progress', className)}
        variant={variant}
        onClick={() => {
          if (!isAnyLoading) onGenerate()
        }}
      >
        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-amber-300">
          {sparklesIcon}
          {t('common.generate')}
        </span>
      </Button>
    </>
  )
})
