'use client'

import type { TFunction } from 'i18next'
import { AlertCircle, Calendar, CheckCircle, ChevronDown, Clock, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

export interface ReminderTaskItem {
  id: string
  title: string
  ticketId?: string
  planEndDate?: string
  updatedAt?: string
}

export interface ReminderStats {
  reminderSections?: { showDev: boolean; showPl: boolean }
  devStats: {
    todayCount: number
    tomorrowCount?: number
    nearDeadlineCount: number
    overdueCount: number
    todayTasks?: ReminderTaskItem[]
    tomorrowTasks?: ReminderTaskItem[]
    nearDeadlineTasks?: ReminderTaskItem[]
    overdueTasks?: ReminderTaskItem[]
  }
  plStats: {
    needReviewCount: number
    longUnreviewedCount: number
    needReviewTasks?: ReminderTaskItem[]
    longUnreviewedTasks?: ReminderTaskItem[]
  }
}

function ReminderAccordionContent({
  stats,
  t,
  onOpenTaskDetail,
}: {
  stats: ReminderStats
  t: TFunction
  onOpenTaskDetail?: (taskId: string) => void
}) {
  const showDev = stats.reminderSections?.showDev !== false
  const showPl = stats.reminderSections?.showPl !== false
  const devSections = [
    {
      key: 'today',
      label: t('taskManagement.reminderTodayCount'),
      count: stats.devStats?.todayCount ?? 0,
      tasks: stats.devStats?.todayTasks ?? [],
      icon: CheckCircle,
      badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
    },
    {
      key: 'tomorrow',
      label: t('taskManagement.reminderTomorrowCount'),
      count: stats.devStats?.tomorrowCount ?? 0,
      tasks: stats.devStats?.tomorrowTasks ?? [],
      icon: CheckCircle,
      badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
    },
    {
      key: 'nearDeadline',
      label: t('taskManagement.reminderNearDeadline'),
      count: stats.devStats?.nearDeadlineCount ?? 0,
      tasks: stats.devStats?.nearDeadlineTasks ?? [],
      icon: Clock,
      badgeClass: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    },
    {
      key: 'overdue',
      label: t('taskManagement.reminderOverdue'),
      count: stats.devStats?.overdueCount ?? 0,
      tasks: stats.devStats?.overdueTasks ?? [],
      icon: AlertCircle,
      badgeClass: 'bg-red-500/20 text-red-700 dark:text-red-400',
    },
  ]
  const plSections = [
    {
      key: 'needReview',
      label: t('taskManagement.reminderNeedReview'),
      count: stats.plStats?.needReviewCount ?? 0,
      tasks: stats.plStats?.needReviewTasks ?? [],
      icon: Eye,
      badgeClass: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
    },
    {
      key: 'longUnreviewed',
      label: t('taskManagement.reminderLongUnreviewed'),
      count: stats.plStats?.longUnreviewedCount ?? 0,
      tasks: stats.plStats?.longUnreviewedTasks ?? [],
      icon: Calendar,
      badgeClass: 'bg-rose-500/20 text-rose-700 dark:text-rose-400',
    },
  ]

  const [openAccordionKey, setOpenAccordionKey] = useState<string | null>(null)

  const TaskList = ({ tasks, tone }: { tasks: ReminderTaskItem[]; tone: 'dev' | 'pl' }) => {
    // Nền rất nhạt (opacity thấp); odd đậm hơn even ~2.5× để zebra rõ nhưng vẫn nhẹ
    const stripeEven =
      tone === 'pl'
        ? 'bg-violet-500/[0.055] dark:bg-violet-400/[0.045]'
        : 'bg-emerald-500/[0.055] dark:bg-emerald-400/[0.045]'
    const stripeOdd =
      tone === 'pl'
        ? 'bg-violet-500/[0.12] dark:bg-violet-400/[0.13]'
        : 'bg-emerald-500/[0.12] dark:bg-emerald-400/[0.13]'
    const hoverActive =
      tone === 'pl'
        ? 'hover:bg-violet-500/[0.18] dark:hover:bg-violet-400/[0.18] focus-visible:ring-violet-500/25 dark:focus-visible:ring-violet-400/30'
        : 'hover:bg-emerald-500/[0.18] dark:hover:bg-emerald-400/[0.18] focus-visible:ring-emerald-500/25 dark:focus-visible:ring-emerald-400/30'
    return (
      <ul className="text-sm text-muted-foreground w-full list-none m-0 p-0 space-y-px overflow-hidden">
        {tasks.map((task, index) => {
          const stripe = index % 2 === 0 ? stripeEven : stripeOdd
          const interactive = Boolean(onOpenTaskDetail)
          return (
            <li key={task.id} className="mb-0!">
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onOpenTaskDetail?.(task.id)}
                className={cn(
                  'w-full text-left px-2.5 py-2 flex flex-col gap-0.5 min-w-0',
                  stripe,
                  interactive &&
                  cn('cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background', hoverActive),
                  !interactive && 'cursor-default'
                )}
              >
                <span className="text-foreground font-medium line-clamp-2">{task.title || task.ticketId || task.id}</span>
                {(task.ticketId || task.planEndDate) && (
                  <span className="text-xs text-muted-foreground">
                    {[task.ticketId, task.planEndDate ? formatDateDisplay(task.planEndDate, i18n.language) : null].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  const AccordionSection = ({
    itemKey,
    label,
    count,
    tasks,
    icon: Icon,
    badgeClass,
    tone,
  }: {
    itemKey: string
    label: string
    count: number
    tasks: ReminderTaskItem[]
    icon: React.ComponentType<{ className?: string }>
    badgeClass: string
    tone: 'dev' | 'pl'
  }) => {
    if (count <= 0) return null
    const triggerBg =
      tone === 'pl'
        ? 'bg-violet-300/88 dark:bg-violet-900/50 hover:bg-violet-400/78 dark:hover:bg-violet-950/58 data-[state=open]:bg-violet-200/95 dark:data-[state=open]:bg-violet-950/45 data-[state=open]:hover:bg-violet-300/88 dark:data-[state=open]:hover:bg-violet-950/55'
        : 'bg-emerald-300/88 dark:bg-emerald-900/45 hover:bg-emerald-400/78 dark:hover:bg-emerald-950/55 data-[state=open]:bg-emerald-200/95 dark:data-[state=open]:bg-emerald-950/40 data-[state=open]:hover:bg-emerald-300/88 dark:data-[state=open]:hover:bg-emerald-950/52'
    const contentTint =
      tone === 'pl'
        ? 'bg-violet-500/[0.08] dark:bg-violet-400/[0.1]'
        : 'bg-emerald-500/[0.08] dark:bg-emerald-400/[0.1]'
    return (
      <Collapsible
        open={openAccordionKey === itemKey}
        onOpenChange={nextOpen => setOpenAccordionKey(nextOpen ? itemKey : null)}
        className="group"
      >
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-center gap-2 py-2.5 px-3 transition-colors text-left border-0 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            triggerBg,
          )}
        >
          <span className="flex items-center gap-1.5 text-sm flex-1 min-w-0 font-medium text-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </span>
          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ml-auto', badgeClass)}>{count}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className={cn('max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain', contentTint)}
          >
            <TaskList tasks={tasks} tone={tone} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <div className="w-full flex-1 min-h-0 overflow-y-auto max-h-[55vh] overscroll-contain">
      <div className="space-y-4 w-full">
        {showDev && (
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2 sticky top-0 bg-background py-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              {t('taskManagement.reminderDevSection')}
            </h4>
            <div className="rounded-lg w-full overflow-hidden bg-emerald-500/[0.13] dark:bg-emerald-950/30 shadow-sm divide-y divide-emerald-500/15 dark:divide-emerald-500/20">
              {devSections.map(s => (
                <AccordionSection
                  key={s.key}
                  itemKey={s.key}
                  tone="dev"
                  label={s.label}
                  count={s.count}
                  tasks={s.tasks}
                  icon={s.icon}
                  badgeClass={s.badgeClass}
                />
              ))}
            </div>
          </div>
        )}
        {showPl && (
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2 sticky top-0 bg-background py-1">
              <Eye className="h-4 w-4 text-violet-500" />
              {t('taskManagement.reminderPlSection')}
            </h4>
            <div className="rounded-lg w-full overflow-hidden bg-violet-500/[0.13] dark:bg-violet-950/30 shadow-sm">
              {plSections.map(s => (
                <AccordionSection
                  key={s.key}
                  itemKey={s.key}
                  tone="pl"
                  label={s.label}
                  count={s.count}
                  tasks={s.tasks}
                  icon={s.icon}
                  badgeClass={s.badgeClass}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface TaskReminderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenTaskDetail?: (taskId: string) => void | Promise<void>
  mockStats?: ReminderStats | 'loading' | 'error'
}

export function TaskReminderDialog({ open, onOpenChange, onOpenTaskDetail, mockStats }: TaskReminderDialogProps) {
  const { t } = useTranslation()
  const token = useTaskAuthStore(s => s.token)
  const clearSession = useTaskAuthStore(s => s.clearSession)
  const [stats, setStats] = useState<ReminderStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) {
      setStats(null)
      setLoading(false)
      return
    }
    if (mockStats !== undefined) {
      if (mockStats === 'loading') {
        setStats(null)
        setLoading(true)
      } else if (mockStats === 'error') {
        setStats(null)
        setLoading(false)
      } else {
        setStats(mockStats)
        setLoading(false)
      }
      return
    }
    if (!token) {
      setStats(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    window.api.task
      .getReminderStats(token)
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && res.data) {
          setStats(res.data)
        } else {
          setStats(null)
          if (res.status === 'error' && (res as { code?: string }).code === 'UNAUTHORIZED') {
            clearSession()
            toast.error(t('taskManagement.tokenExpired'))
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, token, mockStats, clearSession, t])

  const showDev = stats?.reminderSections?.showDev !== false
  const showPl = stats?.reminderSections?.showPl !== false
  const hasItems =
    stats &&
    ((showDev &&
      ((stats.devStats?.todayCount ?? 0) > 0 ||
        (stats.devStats?.tomorrowCount ?? 0) > 0 ||
        (stats.devStats?.nearDeadlineCount ?? 0) > 0 ||
        (stats.devStats?.overdueCount ?? 0) > 0)) ||
      (showPl && ((stats.plStats?.needReviewCount ?? 0) > 0 || (stats.plStats?.longUnreviewedCount ?? 0) > 0)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl! w-full max-h-[90vh]! flex flex-col overflow-hidden border-0 shadow-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('taskManagement.reminderTitle')}</DialogTitle>
          <DialogDescription>{t('taskManagement.reminderDescription')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden flex flex-col w-full">
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground text-sm">{t('common.loading')}</div>
          ) : !stats ? (
            <div className="text-muted-foreground text-sm text-center py-4">{t('taskManagement.reminderNoItems')}</div>
          ) : !hasItems ? (
            <div className="text-muted-foreground text-sm text-center py-4">{t('taskManagement.reminderNoItems')}</div>
          ) : (
            <ReminderAccordionContent stats={stats} t={t} onOpenTaskDetail={onOpenTaskDetail} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
