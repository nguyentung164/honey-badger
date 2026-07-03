'use client'

import { type ChangeEvent, type ComponentProps, type MutableRefObject, memo, type ReactNode, type RefObject, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
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
  generateAction?: ReactNode
  actions?: ReactNode
  actionsPlacement?: 'header' | 'footer'
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
  generateAction,
  actions,
  actionsPlacement = 'header',
  className,
}: CommitMessagePanelProps) {
  const { t } = useTranslation()
  const showHeaderActions = actions && actionsPlacement === 'header'
  const showFooterActions = actions && actionsPlacement === 'footer'

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', compact ? 'p-1.5' : 'p-0', className)}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <OverlayLoader isLoading={isLoadingGenerate} />
        <div
          className={cn(
            'mb-1.5 flex shrink-0 items-center',
            compact ? 'w-full gap-2' : 'mb-2 w-full max-w-full gap-2.5',
            showHeaderActions && 'min-w-0'
          )}
        >
          <Input
            id={compact ? 'reference-id-input-embedded' : 'reference-id-input'}
            placeholder={t('placeholder.referenceId')}
            className={cn('shrink-0 text-xs', compact ? 'h-7 max-w-[35%]' : 'h-9 w-52 max-w-[min(280px,40%)]')}
            onChange={onReferenceIdChange}
            ref={referenceIdRef}
            spellCheck={false}
          />
          {generateAction}
          {showHeaderActions ? <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        <div className="relative min-h-0 flex-1">
          <IsolatedTextarea
            id={compact ? 'commit-message-area-embedded' : 'commit-message-area'}
            placeholder={t('placeholder.commitMessage')}
            className="absolute inset-0 h-full w-full resize-none p-2 text-xs"
            valueRef={commitMessageRef}
            initialValue={commitMessageSeed}
            spellCheck={false}
            disabled={isAnyLoading}
          />
        </div>
      </div>
      {showFooterActions ? (
        <div className="mt-1.5 flex shrink-0 items-center justify-end border-t border-border/50 pt-1.5">{actions}</div>
      ) : null}
    </div>
  )
})
