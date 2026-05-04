'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { formatDateByLocale, formatDateDisplay, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'

function formatHistoryValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '—'
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parsed = parseLocalDate(trimmed.slice(0, 10)) ?? new Date(trimmed)
      if (!Number.isNaN(parsed.getTime())) return formatDateDisplay(parsed.toISOString(), i18n.language)
    }
    return raw
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

export function TaskChangeHistorySection({
  taskId,
  resolveUserLabel,
  variant = 'standalone',
}: {
  taskId: string
  resolveUserLabel: (userId: string | null | undefined) => string
  variant?: 'standalone' | 'embedded'
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<{ id: string; source: string; changes: Record<string, { from: unknown; to: unknown }>; createdAt: string; actorUserId: string | null }>>(
    []
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await window.api.task.listTaskChangeHistory(taskId, 80)
        if (cancelled) return
        if (res.status === 'success' && res.data) setRows(res.data)
        else setRows([])
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [taskId])

  const sourceLabel = (s: string) => {
    switch (s) {
      case 'bulk':
        return t('taskManagement.historySourceBulk')
      case 'status':
      case 'progress':
      case 'dates':
      case 'assign':
      case 'update':
        return t(`taskManagement.historySource_${s}`, s)
      default:
        return s
    }
  }

  const fieldLabel = (camel: string) => t(`taskManagement.historyField.${camel}`, camel)
  const embedded = variant === 'embedded'

  return (
    <div className={cn('text-sm', embedded ? 'rounded-md border border-border/40 bg-muted/10 p-2' : 'rounded-md border border-border/60 bg-muted/10 p-3')}>
      {!embedded ? <div className="mb-2 text-sm font-semibold text-foreground">{t('taskManagement.changeHistoryTitle')}</div> : null}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <GlowLoader className="h-6 w-6" />
          {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{t('taskManagement.changeHistoryEmpty')}</p>
      ) : (
        <ul className="max-h-56 space-y-3 overflow-y-auto pr-1">
          {rows.map(entry => (
            <li key={entry.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{formatDateByLocale(entry.createdAt, i18n.language) || formatDateDisplay(entry.createdAt, i18n.language)}</span>
                <span className="rounded bg-background/80 px-1.5 py-0.5 font-medium text-foreground">{sourceLabel(entry.source)}</span>
                {entry.actorUserId ? <span>{resolveUserLabel(entry.actorUserId)}</span> : null}
              </div>
              <ul className="ml-0 space-y-0.5 text-xs">
                {Object.entries(entry.changes).map(([field, { from, to }]) => (
                  <li key={field} className="break-words">
                    <span className="font-medium text-foreground">{fieldLabel(field)}:</span>{' '}
                    <span className="text-muted-foreground">
                      {field === 'assigneeUserId' ? (
                        <>
                          {resolveUserLabel(typeof from === 'string' ? from : null)} → {resolveUserLabel(typeof to === 'string' ? to : null)}
                        </>
                      ) : (
                        <>
                          {formatHistoryValue(from)} → {formatHistoryValue(to)}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
