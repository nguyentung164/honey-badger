'use client'
import { format } from 'date-fns'
import { forwardRef, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useHistoryStore } from '@/stores/useHistoryStore'
import { Loader2 } from 'lucide-react'
import { CommitMessageHistoryToolbar } from './CommitMessageHistoryToolbar'

type CommitHistory = {
  message: string
  date: string
}
export function CommitMessageHistory() {
  const { t } = useTranslation()
  const { loadHistoryConfig } = useHistoryStore()
  const [result, setResult] = useState<CommitHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleRefresh = useCallback(async () => {
    setIsLoading(true)
    try {
      logger.info('Đang tải dữ liệu từ MySQL...')
      const res = await window.api.commitMessageHistory.get()
      const messages = res.status === 'success' && res.data ? res.data : []
      logger.info('Dữ liệu từ MySQL:', messages)

      const sortedMessages = [...messages].sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
      setResult(sortedMessages)
      logger.info('Đã cập nhật state với dữ liệu từ MySQL')
    } catch (error) {
      logger.error('Lỗi khi tải dữ liệu từ MySQL:', error)
      const fallbackMessages = useHistoryStore.getState().commitMessages
      logger.info('Sử dụng dữ liệu từ store:', fallbackMessages)
      const sortedMessages = [...fallbackMessages].sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
      setResult(sortedMessages)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true)
      try {
        await loadHistoryConfig()
        await handleRefresh()
      } catch (error) {
        logger.error('Lỗi khi khởi tạo dữ liệu:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initData()
  }, [loadHistoryConfig, handleRefresh])

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success('Đã copy vào clipboard')
      })
      .catch(err => {
        logger.error('Không thể copy vào clipboard:', err)
        toast.error('Không thể copy vào clipboard')
      })
  }

  const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, ...props }, ref) => {
    return (
      <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
        <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
      </div>
    )
  })
  Table.displayName = 'Table'

  return (
    <div className="flex flex-col h-screen w-full relative">
      <CommitMessageHistoryToolbar onRefresh={handleRefresh} isLoading={isLoading} />
      <div className="p-4 space-y-4 flex-1 h-full flex flex-col overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col border rounded-md overflow-auto h-full">
          <ScrollArea className="h-full w-full">
            <Table wrapperClassName={cn('overflow-clip', result.length === 0 && 'h-full')}>
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
                    <TableCell colSpan={3} className="h-24 text-center">
                      {t('common.noData')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
