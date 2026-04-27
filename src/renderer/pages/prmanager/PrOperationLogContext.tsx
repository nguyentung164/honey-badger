'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { VcsOperationLogDialog } from '@/components/dialogs/vcs/VcsOperationLogDialog'
import toast from '@/components/ui-elements/Toast'

type OpStatus = 'success' | 'error' | undefined

export type StartPrOperationOpts = {
  /** true: ghi log/ghi trạng thái nhưng không mở VcsOperationLogDialog (vd. gợi ý tiêu đề hàng loạt). */
  silent?: boolean
}

export type PrOperationLogContextValue = {
  /** Bắt đầu phiên log; trả về false nếu đang có tác vụ (đã toast). */
  startOperation: (
    titleKey: string,
    titleParams?: Record<string, string | number>,
    opts?: StartPrOperationOpts
  ) => boolean
  /** Nối một dòng (có thể gọi nhiều lần). */
  appendLine: (line: string) => void
  /** Kết thúc thành công. */
  finishSuccess: () => void
  /** Kết thúc lỗi; tùy chọn nối thêm dòng lỗi. */
  finishError: (message?: string) => void
  isBusy: boolean
  /** Đóng sớm / huỷ trạng thái (không đổi kết quả nếu đã finish). */
  resetAndClose: () => void
}

const PrOperationLogContext = createContext<PrOperationLogContextValue | null>(null)

export function usePrOperationLog(): PrOperationLogContextValue {
  const v = useContext(PrOperationLogContext)
  if (!v) {
    throw new Error('usePrOperationLog must be used within PrOperationLogProvider')
  }
  return v
}

/** Dùng khi component có thể nằm ngoài provider (an toàn, không throw). */
export function usePrOperationLogOptional(): PrOperationLogContextValue | null {
  return useContext(PrOperationLogContext)
}

type Props = { children: ReactNode }

export function PrOperationLogProvider({ children }: Props) {
  const { t } = useTranslation()
  const [logOpen, setLogOpen] = useState(false)
  const [streamingLog, setStreamingLog] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [operationStatus, setOperationStatus] = useState<OpStatus>(undefined)
  const [titleKey, setTitleKey] = useState('prManager.operationLog.defaultTitle')
  const [titleParams, setTitleParams] = useState<Record<string, string | number> | undefined>(undefined)

  const appendLine = useCallback((line: string) => {
    setStreamingLog(prev => (prev ? `${prev}\n${line}` : line))
  }, [])

  const startOperation = useCallback(
    (key: string, params?: Record<string, string | number>, opts?: StartPrOperationOpts) => {
      if (isStreaming) {
        toast.info(t('prManager.operationLog.busy'))
        return false
      }
      setTitleKey(key)
      setTitleParams(params)
      setStreamingLog('')
      setOperationStatus(undefined)
      setIsStreaming(true)
      if (!opts?.silent) {
        setLogOpen(true)
      }
      return true
    },
    [isStreaming, t]
  )

  const finishSuccess = useCallback(() => {
    setIsStreaming(false)
    setOperationStatus('success')
  }, [])

  const finishError = useCallback(
    (message?: string) => {
      if (message) {
        setStreamingLog(prev => (prev ? `${prev}\n${message}` : message))
      }
      setIsStreaming(false)
      setOperationStatus('error')
    },
    []
  )

  const resetAndClose = useCallback(() => {
    setLogOpen(false)
    setIsStreaming(false)
    setOperationStatus(undefined)
    setStreamingLog('')
  }, [])

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (isStreaming) {
          toast.info(t('prManager.operationLog.cannotCloseWhileRunning'))
          return
        }
        setLogOpen(false)
        setStreamingLog('')
        setOperationStatus(undefined)
        return
      }
      setLogOpen(true)
    },
    [isStreaming, t]
  )

  const title = t(titleKey, titleParams as Record<string, string>)

  const value = useMemo<PrOperationLogContextValue>(
    () => ({
      startOperation,
      appendLine,
      finishSuccess,
      finishError,
      isBusy: isStreaming,
      resetAndClose,
    }),
    [startOperation, appendLine, finishSuccess, finishError, isStreaming, resetAndClose]
  )

  return (
    <PrOperationLogContext.Provider value={value}>
      {children}
      <VcsOperationLogDialog
        open={logOpen}
        onOpenChange={onOpenChange}
        vcsType="git"
        streamingLog={streamingLog}
        isStreaming={isStreaming}
        title={title}
        operationStatus={operationStatus}
        completionMessage="prManager.operationLog.completed"
        failureMessage="prManager.operationLog.failed"
      />
    </PrOperationLogContext.Provider>
  )
}
