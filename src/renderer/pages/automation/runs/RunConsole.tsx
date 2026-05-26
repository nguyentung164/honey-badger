import { useVirtualizer } from '@tanstack/react-virtual'
import { FileText, Loader2, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from '@/components/ui-elements/Toast'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAutomationStore } from '@/stores/useAutomationStore'

interface Props {
  projectId: string
}

export function RunConsole({ projectId }: Props) {
  const { t } = useTranslation()
  const log = useAutomationStore(s => s.streamLog)
  const current = useAutomationStore(s => s.current)
  const parentRef = useRef<HTMLDivElement>(null)
  const lastDetailToastRef = useRef<string>('')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const d = current.finishDetail?.trim()
    if (!d || d === lastDetailToastRef.current) return
    lastDetailToastRef.current = d
    const short = d.length > 500 ? `${d.slice(0, 500)}…` : d
    toast.error(t('automation.runs.errorDetailToast', { detail: short }))
  }, [current.finishDetail, t])

  useEffect(() => {
    if (current.runId && current.status === 'running') {
      lastDetailToastRef.current = ''
    }
  }, [current.runId, current.status])

  /** Sau khi IPC cancel thành công, stream có thể đã đặt status ≠ running trước khi `finally` chạy — giữ spinner đến khi store khớp. */
  useEffect(() => {
    if (!cancelling) return
    if (current.status !== 'running') {
      setCancelling(false)
    }
  }, [cancelling, current.status])

  useEffect(() => {
    if (!cancelling || current.status !== 'running') return
    const id = window.setTimeout(() => setCancelling(false), 120_000)
    return () => window.clearTimeout(id)
  }, [cancelling, current.status])
  const rowVirtualizer = useVirtualizer({
    count: log.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 18,
    overscan: 50,
  })

  useEffect(() => {
    if (log.length > 0 && parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight
    }
  }, [log.length])

  const total = current.tally.total
  const completed = current.tally.passed + current.tally.failed + current.tally.skipped
  const percent = total > 0 ? Math.round((completed / total) * 100) : current.status === 'running' ? 5 : 0

  const handleCancel = async () => {
    if (!current.runId || cancelling) return
    flushSync(() => {
      setCancelling(true)
    })
    let keepLoadingUntilStream = false
    try {
      const res = await window.api.automation.run.cancel(current.runId)
      if (res.status !== 'success') {
        toast.error(res.message ?? t('automation.runs.cancelFailed'))
        return
      }
      if (!res.data?.cancelled) {
        toast.error(t('automation.runs.cancelNotActive'))
        return
      }
      keepLoadingUntilStream = true
    } finally {
      if (!keepLoadingUntilStream) {
        setCancelling(false)
      }
    }
  }

  const handleOpenLog = async () => {
    if (current.runId) {
      await window.api.automation.run.openLog({ projectId, runId: current.runId })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {current.status === 'idle'
                ? t('automation.runs.idle')
                : t('automation.runs.status', { status: current.status })}
            </span>
            <span>
              {current.tally.passed}P / {current.tally.failed}F / {current.tally.skipped}S {total ? `/ ${total}T` : ''}
            </span>
          </div>
          <Progress value={percent} />
          {current.finishDetail ? (
            <div className="max-h-28 overflow-y-auto rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap break-words">
              <div className="mb-0.5 font-medium text-destructive">{t('automation.runs.errorDetailTitle')}</div>
              {current.finishDetail}
            </div>
          ) : null}
          {current.tally.currentTest ? (
            <div className="truncate text-xs text-muted-foreground">{current.tally.currentTest}</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenLog} disabled={!current.runId}>
            <FileText className="size-4" />
            {t('automation.runs.openLog')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-2"
            onClick={() => void handleCancel()}
            disabled={current.status !== 'running' || cancelling}
          >
            {cancelling ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Square className="size-4 shrink-0" />}
            {t('automation.runs.cancel')}
          </Button>
        </div>
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto rounded-md border bg-zinc-950 p-2 text-[11px] text-zinc-100">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map(v => (
            <div
              key={v.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: v.size,
                transform: `translateY(${v.start}px)`,
                whiteSpace: 'pre',
              }}
            >
              {log[v.index]}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
