'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { formatDateDisplay, parseLocalDate } from '@/lib/dateUtils'
import { cn, getProgressColor } from '@/lib/utils'
import { taskDisplayLabel, type TaskTableRowTask } from './TaskTableRow'

export type TaskBoardCardProps = {
  task: TaskTableRowTask
  assigneeDisplay: string
  getPriorityLabel: (p: string) => string
  getTypeLabel: (ty?: string) => string
  getPriorityIcon: (p: string) => React.ReactNode
  getTypeIcon: (ty: string) => React.ReactNode
  getTypeBadgeClass: (code: string) => string
  getBadgeStyle?: (code: string, colorMap: Record<string, string>) => React.CSSProperties | undefined
  priorityColorMap?: Record<string, string>
  typeColorMap?: Record<string, string>
  /** Mã status → hex (master). Dùng làm vạch trái card, thống nhất với bảng. */
  statusColorMap?: Record<string, string>
  /** Kanban: ví dụ icon mở chi tiết, đặt sát đầu dòng tiêu đề */
  titleStartSlot?: ReactNode
  /** Kanban: ví dụ checkbox bulk — cùng hàng với badge, canh phải */
  badgeRowTrailingSlot?: ReactNode
}

export function TaskBoardCard({
  task,
  assigneeDisplay,
  getPriorityLabel,
  getTypeLabel,
  getPriorityIcon,
  getTypeIcon,
  getTypeBadgeClass,
  getBadgeStyle,
  priorityColorMap = {},
  typeColorMap = {},
  statusColorMap = {},
  titleStartSlot,
  badgeRowTrailingSlot,
}: TaskBoardCardProps) {
  const { t, i18n } = useTranslation()
  const ty = task.type ?? 'bug'
  const statusHex = statusColorMap[task.status]?.trim()
  const stripColor = statusHex || 'hsl(var(--primary))'
  const progressPct = typeof task.progress === 'number' && task.progress >= 0 ? Math.min(100, Math.max(0, Math.round(Number(task.progress) || 0))) : null

  const kanbanMeta = useMemo(() => {
    const enteredRaw = (task.statusEnteredAt || task.updatedAt || '').trim()
    let daysInStatus: number | null = null
    if (enteredRaw) {
      try {
        const ed = enteredRaw.includes('T') ? parseISO(enteredRaw) : parseLocalDate(enteredRaw.slice(0, 10))
        if (ed && !Number.isNaN(ed.getTime())) {
          daysInStatus = Math.max(0, differenceInCalendarDays(startOfDay(new Date()), startOfDay(ed)))
        }
      } catch {
        /* ignore */
      }
    }

    const endRaw = (task.planEndDate || '').trim().slice(0, 10)
    const dueDate = endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? parseLocalDate(endRaw) : undefined
    let dueLabel: string | null = null
    let dueClass = 'text-muted-foreground'
    if (dueDate) {
      const delta = differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date()))
      if (delta < 0) {
        dueLabel = t('taskManagement.kanbanDueOverdue', { days: Math.abs(delta) })
        dueClass = 'text-red-600 dark:text-red-400'
      } else if (delta === 0) {
        dueLabel = t('taskManagement.kanbanDueToday')
        dueClass = 'text-amber-700 dark:text-amber-400'
      } else if (delta <= 7) {
        dueLabel = t('taskManagement.kanbanDueSoon', { days: delta })
        dueClass = 'text-amber-700/90 dark:text-amber-400/90'
      } else {
        dueLabel = t('taskManagement.kanbanDueDate', { date: formatDateDisplay(endRaw, i18n.language) })
      }
    }

    return { daysInStatus, dueLabel, dueClass }
  }, [task.planEndDate, task.statusEnteredAt, task.updatedAt, t, i18n.language])

  return (
    <div className="flex min-w-0 rounded-md bg-card shadow-sm transition-colors hover:bg-muted/30">
      <div className="w-1 shrink-0 self-stretch rounded-l-[calc(0.375rem-1px)]" style={{ backgroundColor: stripColor }} aria-hidden />
      <div className="relative min-w-0 flex-1 p-2 text-left">
        <div className={cn('flex min-w-0 gap-1', titleStartSlot ? 'items-start' : '')}>
          {titleStartSlot ? <span className="mt-0.5 shrink-0">{titleStartSlot}</span> : null}
          <p className="min-w-0 flex-1 overflow-hidden text-xs font-medium leading-snug line-clamp-2 text-ellipsis text-foreground">{taskDisplayLabel(task, '—')}</p>
        </div>
        <div className="mt-1.5 flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap content-start gap-1">
            <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]', getTypeBadgeClass(ty))} style={getBadgeStyle?.(ty, typeColorMap)}>
              {getTypeIcon(ty)}
              {getTypeLabel(ty)}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]',
                task.priority === 'critical'
                  ? 'bg-red-500/25 text-red-700 dark:text-red-400'
                  : task.priority === 'high'
                    ? 'bg-orange-500/25 text-orange-700 dark:text-orange-400'
                    : task.priority === 'medium'
                      ? 'bg-sky-500/20 text-sky-700 dark:text-sky-400'
                      : task.priority === 'low'
                        ? 'bg-emerald-500/25 text-emerald-700 dark:text-emerald-400'
                        : ''
              )}
              style={getBadgeStyle?.(task.priority ?? 'medium', priorityColorMap)}
            >
              {getPriorityIcon(task.priority ?? 'medium')}
              {getPriorityLabel(task.priority ?? 'medium')}
            </span>
          </div>
          {badgeRowTrailingSlot ? <div className="flex shrink-0 items-center self-start pt-px">{badgeRowTrailingSlot}</div> : null}
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground truncate">{assigneeDisplay}</div>
        {kanbanMeta.daysInStatus !== null || kanbanMeta.dueLabel ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            {kanbanMeta.daysInStatus !== null ? (
              <span
                className="inline-flex shrink-0 rounded bg-muted/80 px-1 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground"
                title={t('taskManagement.kanbanDaysInStatusTooltip')}
              >
                {t('taskManagement.kanbanDaysInStatus', { count: kanbanMeta.daysInStatus })}
              </span>
            ) : null}
            {kanbanMeta.dueLabel ? (
              <span className={cn('inline-flex shrink-0 truncate rounded bg-muted/50 px-1 py-0.5 text-[9px] font-medium tabular-nums', kanbanMeta.dueClass)}>
                {kanbanMeta.dueLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        {progressPct != null && (
          <div className="mt-1.5">
            <Progress value={progressPct} className="h-1" indicatorStyle={{ backgroundColor: getProgressColor(progressPct / 100) }} />
          </div>
        )}
      </div>
    </div>
  )
}
