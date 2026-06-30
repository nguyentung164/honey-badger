'use client'

import { CircleAlert, HelpCircle } from 'lucide-react'
import { memo, useEffect, useState, type ChangeEvent, type ComponentProps, type MutableRefObject, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { TranslatePanel } from '@/components/shared/TranslatePanel'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const IsolatedTextarea = memo(function IsolatedTextarea({
  valueRef,
  initialValue,
  ...props
}: Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  valueRef: MutableRefObject<string>
  initialValue: string
}) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])
  useEffect(() => {
    valueRef.current = value
  }, [value, valueRef])
  return <Textarea value={value} onChange={e => setValue(e.target.value)} {...props} />
})

export type CommitMessagePanelProps = {
  compact?: boolean
  isLoadingGenerate: boolean
  isAnyLoading: boolean
  commitMessageRef: MutableRefObject<string>
  commitMessageSeed: string
  referenceIdRef: RefObject<HTMLInputElement | null>
  onReferenceIdChange: (event: ChangeEvent<HTMLInputElement>) => void
  className?: string
}

export const CommitMessagePanel = memo(function CommitMessagePanel({
  compact = false,
  isLoadingGenerate,
  isAnyLoading,
  commitMessageRef,
  commitMessageSeed,
  referenceIdRef,
  onReferenceIdChange,
  className,
}: CommitMessagePanelProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', compact ? 'p-1.5' : 'p-0', className)}>
      <div className="relative min-h-0 flex-1">
        <OverlayLoader isLoading={isLoadingGenerate} />
        <TranslatePanel
          text={() => commitMessageRef.current}
          variant="inline"
          readOnly={false}
          disabled={isAnyLoading}
          placeholder={t('placeholder.commitMessage')}
          className="flex h-full min-h-0 flex-col"
          renderHeader={({ translateButton, viewToggleButton }) => (
            <div
              className={cn(
                'mb-1.5 flex shrink-0 items-center gap-1.5',
                compact ? 'w-full flex-wrap' : 'mb-2 w-[500px]'
              )}
            >
              <Input
                id={compact ? 'reference-id-input-embedded' : 'reference-id-input'}
                placeholder={t('placeholder.referenceId')}
                className="h-7 min-w-0 flex-1 text-xs"
                onChange={onReferenceIdChange}
                ref={referenceIdRef}
                spellCheck={false}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('joyride.main.referenceId')}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Ô này điền ticket id, issues id của Redmine, hoặc tên file tài liệu.</TooltipContent>
              </Tooltip>
              {translateButton}
              <span className="shrink-0 text-[10px] text-muted-foreground" title={t('translation.commitUsesEnglish')}>
                ({t('translation.commitUsesEnglish')})
              </span>
              {viewToggleButton}
            </div>
          )}
          renderContent={(displayText, isTranslated) => (
            <div className="absolute inset-0 h-full min-h-0 w-full">
              <IsolatedTextarea
                id={compact ? 'commit-message-area-embedded' : 'commit-message-area'}
                placeholder={t('placeholder.commitMessage')}
                className="absolute inset-0 h-full w-full resize-none p-2 text-xs"
                valueRef={commitMessageRef}
                initialValue={commitMessageSeed}
                spellCheck={false}
              />
              {isTranslated ? (
                <div className="absolute inset-0 h-full min-h-0 w-full cursor-default overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-2 text-xs">
                  {displayText}
                </div>
              ) : null}
            </div>
          )}
        />
      </div>
      <span
        className={cn(
          'mt-1.5 flex shrink-0 flex-row items-center gap-1.5 text-muted-foreground',
          compact ? 'text-[10px]' : 'mt-2 text-xs'
        )}
      >
        <CircleAlert className="h-3.5 w-3.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
        {t('message.aiContentWarning')}
      </span>
    </div>
  )
})
