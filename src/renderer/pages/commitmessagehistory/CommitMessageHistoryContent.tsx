'use client'

import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useHistoryStore } from '@/stores/useHistoryStore'

type CommitHistory = {
  message: string
  date: string
}

const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, ...props }, ref) => {
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
})
Table.displayName = 'Table'

export function CommitMessageHistoryContent({
  enabled = true,
  reloadNonce = 0,
  onLoadingChange,
  variant = 'page',
}: {
  enabled?: boolean
  reloadNonce?: number
  onLoadingChange?: (loading: boolean) => void
  variant?: 'page' | 'dialog'
}) {
  const { t } = useTranslation()
  const { loadHistoryConfig } = useHistoryStore()
  const [result, setResult] = useState<CommitHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchMessages = useCallback(async () => {
    logger.info('Commit message history: loading...')
    const res = await window.api.commitMessageHistory.get()
    const messages = res.status === 'success' && res.data ? res.data : []
    logger.info('Loaded commit message history:', messages)

    const sortedMessages = [...messages].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
    setResult(sortedMessages)
    logger.info('Commit message history: state updated')
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const initData = async () => {
      setIsLoading(true)
      onLoadingChange?.(true)
      try {
        await loadHistoryConfig()
        if (cancelled) return
        try {
          await fetchMessages()
        } catch (error) {
          logger.error('Commit message history load failed:', error)
          const fallbackMessages = useHistoryStore.getState().commitMessages
          logger.info('Sử dụng dữ liệu từ store:', fallbackMessages)
          const sortedMessages = [...fallbackMessages].sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime()
          })
          if (!cancelled) setResult(sortedMessages)
        }
      } catch (error) {
        logger.error('Lỗi khi khởi tạo dữ liệu:', error)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          onLoadingChange?.(false)
        }
      }
    }

    void initData()

    return () => {
      cancelled = true
    }
  }, [enabled, reloadNonce, loadHistoryConfig, fetchMessages, onLoadingChange])

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(t('toast.copied'))
      })
      .catch(err => {
        logger.error('Không thể copy vào clipboard:', err)
        toast.error(t('toast.copyFailed'))
      })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-md border',
          variant === 'dialog' ? 'max-h-[min(calc(90vh-9rem),32rem)]' : 'min-h-0'
        )}
      >
        <Table>
          <TableHeader sticky>
            <TableRow>
              <TableHead className={cn('relative group h-9 px-2', '!text-[var(--table-header-fg)]', 'w-[150px]')}>{t('dialog.commitMessageHistroy.date')}</TableHead>
              <TableHead className={cn('relative group h-9 px-2', '!text-[var(--table-header-fg)]')}>{t('dialog.commitMessageHistroy.commitMessage')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.length > 0 ? (
              result.map((item, index) => (
                <TableRow key={index} className="cursor-pointer hover:bg-muted/50" onClick={() => copyToClipboard(item.message)}>
                  <TableCell>
                    {(() => {
                      try {
                        return format(new Date(item.date), 'yyyy-MM-dd HH:mm:ss')
                      } catch (_e) {
                        return item.date
                      }
                    })()}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap">{item.message}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="h-24 text-center">
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
