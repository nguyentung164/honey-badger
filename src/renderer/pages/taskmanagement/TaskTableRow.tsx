'use client'

import { format } from 'date-fns'
import type { enUS, ja, vi } from 'date-fns/locale'
import { Copy, MoreVertical, Pencil, Star, Trash2 } from 'lucide-react'
import type { TaskType } from 'main/task/mysqlTaskStore'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateDisplay, getDateOnlyPattern, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { storedDescriptionToPlainText } from '@/lib/taskDescriptionEditorState'
import { cn, getProgressColor } from '@/lib/utils'

export interface TaskTableRowTask {
  id: string
  title: string
  description: string
  assigneeUserId: string | null
  status: string
  progress: number
  priority: string
  type?: string
  source?: string
  ticketId?: string
  project?: string
  projectId?: string
  planStartDate: string
  planEndDate: string
  actualStartDate: string
  actualEndDate: string
  createdAt: string
  updatedAt: string
  createdBy: string
  version?: number
}

export interface TaskTableRowUser {
  id: string
  userCode: string
  name: string
  email: string
}

export interface TaskTableRowMasterItem {
  code: string
  name?: string
}

function TaskRowTooltipContent({
  task,
  assigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getTypeLabel,
}: {
  task: TaskTableRowTask
  assigneeDisplay: string
  getStatusLabel: (s: string) => string
  getPriorityLabel: (p: string) => string
  getTypeLabel: (ty?: string) => string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2.5 w-full min-w-[560px] max-w-[560px] text-popover-foreground">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs w-full">
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.taskTitle')}</span>
        <span className="text-popover-foreground break-words min-w-0">{task.title}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.assignee')}</span>
        <span className="text-popover-foreground">{assigneeDisplay}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.status')}</span>
        <span className="text-popover-foreground">{getStatusLabel(task.status)}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.priority')}</span>
        <span className="text-popover-foreground">{getPriorityLabel(task.priority ?? 'medium')}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.type')}</span>
        <span className="text-popover-foreground">{getTypeLabel(task.type)}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.project')}</span>
        <span className="text-popover-foreground">{task.project || '-'}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.ticketId')}</span>
        <span className="text-popover-foreground">{task.ticketId || '-'}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.planStartDate')}</span>
        <span className="text-popover-foreground">{formatDateDisplay(task.planStartDate, i18n.language)}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.deadline')}</span>
        <span className="text-popover-foreground">{formatDateDisplay(task.planEndDate, i18n.language)}</span>
      </div>
      <div className="border-t border-border pt-2">
        <span className="text-muted-foreground font-medium text-xs block mb-1">{t('taskManagement.description')}</span>
        <span className="text-popover-foreground text-xs whitespace-pre-wrap break-words block max-h-[200px] overflow-y-auto leading-relaxed">
          {storedDescriptionToPlainText(task.description) || '-'}
        </span>
      </div>
    </div>
  )
}

const REDMINE_BASE_URL = 'https://repo.system-exe.co.jp/redmine/issues'

interface TaskTableRowProps {
  task: TaskTableRowTask
  rowNumber?: number
  getAssigneeDisplay: (id: string | null) => string
  getStatusLabel: (s: string) => string
  getPriorityLabel: (p: string) => string
  getTypeLabel: (ty?: string) => string
  getStatusIcon: (s: string) => React.ReactNode
  getPriorityIcon: (p: string) => React.ReactNode
  getTypeIcon: (ty: string) => React.ReactNode
  getTypeBadgeClass: (code: string) => string
  getStatusBadgeClass: (code: string) => string
  getPriorityRowClass: (p: string, isDone: boolean) => string
  statusColorMap?: Record<string, string>
  priorityColorMap?: Record<string, string>
  typeColorMap?: Record<string, string>
  getBadgeStyle?: (code: string, colorMap: Record<string, string>) => React.CSSProperties | undefined
  getPriorityRowStyle?: (p: string, isDone: boolean) => React.CSSProperties | undefined
  locale: typeof enUS | typeof ja | typeof vi
  onOpenDialog: (task: TaskTableRowTask) => void
  onDelete: (task: TaskTableRowTask) => void
  onCopy: (task: TaskTableRowTask) => void
  onToggleFavorite: (taskId: string) => void
  isFavorite: boolean
  visibleColumnIds?: string[]
}

function TaskTableRowComponent({
  task,
  rowNumber,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getTypeLabel,
  getStatusIcon,
  getPriorityIcon,
  getTypeIcon,
  getTypeBadgeClass,
  getStatusBadgeClass,
  getPriorityRowClass,
  statusColorMap = {},
  priorityColorMap = {},
  typeColorMap = {},
  getBadgeStyle,
  getPriorityRowStyle,
  locale,
  onOpenDialog,
  onDelete,
  onCopy,
  onToggleFavorite,
  isFavorite,
  visibleColumnIds = ['type', 'ticketId', 'project', 'title', 'assigneeUserId', 'status', 'priority', 'progress', 'planStartDate', 'planEndDate', 'actualStartDate', 'actualEndDate'],
}: TaskTableRowProps) {
  const { t } = useTranslation()
  const dateDisplayPattern = getDateOnlyPattern(i18n.language)
  const priority = (task.priority ?? 'medium') as string
  const isDone = task.status === 'done'
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const planEndDateObj = task.planEndDate ? new Date(task.planEndDate) : null
  if (planEndDateObj) planEndDateObj.setHours(0, 0, 0, 0)
  const isOverdue = Boolean(planEndDateObj && planEndDateObj < todayStart)
  const isOverdueInProgress = isOverdue && !isDone
  const isOverdueDone = isOverdue && isDone
  const daysOverdue =
    planEndDateObj && todayStart > planEndDateObj
      ? Math.floor((todayStart.getTime() - planEndDateObj.getTime()) / (24 * 60 * 60 * 1000))
      : 0
  const overdueTier = daysOverdue <= 3 ? 0 : daysOverdue <= 6 ? 1 : daysOverdue <= 9 ? 2 : daysOverdue <= 14 ? 3 : 4
  const overdueBgClass = isOverdueInProgress
    ? (['bg-rose-50/50 dark:bg-rose-950/25', 'bg-rose-100/55 dark:bg-rose-900/30', 'bg-rose-200/55 dark:bg-rose-800/38', 'bg-rose-300/50 dark:bg-rose-700/42', 'bg-rose-400/55 dark:bg-rose-600/48'] as const)[overdueTier]
    : isOverdueDone
      ? (['bg-rose-50/30 dark:bg-rose-950/20', 'bg-rose-50/35 dark:bg-rose-950/25', 'bg-rose-100/40 dark:bg-rose-900/28', 'bg-rose-200/45 dark:bg-rose-800/35', 'bg-rose-300/50 dark:bg-rose-700/40'] as const)[overdueTier]
      : ''

  const taskTooltipContent = (
    <TooltipContent side="top" sideOffset={2} className="w-[560px] min-w-[560px] p-3 shadow-lg">
      <TaskRowTooltipContent
        task={task}
        assigneeDisplay={getAssigneeDisplay(task.assigneeUserId)}
        getStatusLabel={getStatusLabel}
        getPriorityLabel={getPriorityLabel}
        getTypeLabel={getTypeLabel}
      />
    </TooltipContent>
  )

  const show = (col: string) => visibleColumnIds.includes(col)
  const displayStatus = task.status
  const displayProgress = task.progress

  return (
    <TableRow
      className={cn(getPriorityRowClass(priority, isDone), isDone && 'opacity-65', overdueBgClass, 'cursor-pointer hover:opacity-90')}
      style={getPriorityRowStyle?.(priority, isDone)}
      onClick={() => onOpenDialog(task)}
    >
      {rowNumber != null && (
        <TableCell className="text-center w-10 min-w-10 tabular-nums text-muted-foreground text-sm" onClick={e => e.stopPropagation()}>
          {rowNumber}
        </TableCell>
      )}
      {show('type') && (
        <TableCell className="text-center w-[88px] min-w-[88px] max-w-[88px]">
          <div className="w-full flex justify-center items-center min-w-0">
            <span
              className={cn(
                'flex w-full min-w-0 items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                !typeColorMap[(task.type ?? 'bug') as TaskType] && getTypeBadgeClass((task.type ?? 'bug') as TaskType)
              )}
              style={getBadgeStyle?.((task.type ?? 'bug') as TaskType, typeColorMap)}
            >
              <span className="shrink-0">{getTypeIcon((task.type ?? 'bug') as TaskType)}</span>
              <span className="min-w-0 flex-1 truncate text-center">{getTypeLabel(task.type)}</span>
            </span>
          </div>
        </TableCell>
      )}
      {show('ticketId') && (
        <TableCell className="text-center w-[70px]">
          {task.ticketId ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                const id = String(task.ticketId).replace(/^#/, '')
                if (/^\d+$/.test(id)) {
                  window.api.system.open_external_url(`${REDMINE_BASE_URL}/${id}`)
                }
              }}
              className="truncate block max-w-[80px] mx-auto text-primary underline cursor-pointer hover:opacity-80"
            >
              {task.ticketId}
            </button>
          ) : (
            <span className="truncate block max-w-[80px] mx-auto">-</span>
          )}
        </TableCell>
      )}
      {show('project') && (
        <TableCell className="text-center">
          <span className="truncate block max-w-[120px] mx-auto" title={task.project}>
            {task.project || '-'}
          </span>
        </TableCell>
      )}
      {show('title') && (
        <TableCell className="text-left max-w-[350px]">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="w-full min-h-full min-w-0 overflow-hidden cursor-default flex items-center gap-2">
                {isFavorite && (
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-label={t('taskManagement.favorite')} />
                )}
                <span className="truncate block flex-1 min-w-0">{task.title}</span>
              </div>
            </TooltipTrigger>
            {taskTooltipContent}
          </Tooltip>
        </TableCell>
      )}
      {show('assigneeUserId') && (
        <TableCell className="text-center">
          <span className="block w-full">{getAssigneeDisplay(task.assigneeUserId)}</span>
        </TableCell>
      )}
      {show('status') && (
        <TableCell className="text-center min-w-[120px] w-[120px]">
          <div className="w-full flex justify-center items-center">
            <span
              className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium w-full justify-center', !statusColorMap[displayStatus] && getStatusBadgeClass(displayStatus))}
              style={getBadgeStyle?.(displayStatus, statusColorMap)}
            >
              {getStatusIcon(displayStatus)}
              {getStatusLabel(displayStatus)}
            </span>
          </div>
        </TableCell>
      )}
      {show('priority') && (
        <TableCell className="text-center min-w-[120px] w-[120px]">
          <span
            className={cn('flex items-center justify-center gap-1.5 w-full', priorityColorMap[priority] && 'inline-flex px-2 py-1 rounded-md')}
            style={getBadgeStyle?.(priority, priorityColorMap)}
          >
            {getPriorityIcon(priority)}
            {getPriorityLabel(priority)}
          </span>
        </TableCell>
      )}
      {show('progress') && (
        <TableCell className="text-center min-w-[120px] w-[120px]">
          <div className="flex items-center justify-center gap-2 w-full">
            <Progress value={displayProgress} className="h-2 flex-1" indicatorStyle={{ backgroundColor: getProgressColor(displayProgress / 100) }} />
            <span className="w-8 shrink-0">{displayProgress}%</span>
          </div>
        </TableCell>
      )}
      {show('planStartDate') && (
        <TableCell className="text-center w-[90px]">
          {task.planStartDate ? format(parseLocalDate(task.planStartDate) ?? new Date(task.planStartDate), dateDisplayPattern, { locale }) : '-'}
        </TableCell>
      )}
      {show('planEndDate') && (
        <TableCell className="text-center w-[90px]">{task.planEndDate ? format(parseLocalDate(task.planEndDate) ?? new Date(task.planEndDate), dateDisplayPattern, { locale }) : '-'}</TableCell>
      )}
      {show('actualStartDate') && (
        <TableCell className="text-center w-[90px]">
          <span className="block w-full text-center">
            {task.actualStartDate ? format(parseLocalDate(task.actualStartDate) ?? new Date(task.actualStartDate), dateDisplayPattern, { locale }) : '-'}
          </span>
        </TableCell>
      )}
      {show('actualEndDate') && (
        <TableCell className="text-center w-[90px]">
          <span className="block w-full text-center">
            {task.actualEndDate ? format(parseLocalDate(task.actualEndDate) ?? new Date(task.actualEndDate), dateDisplayPattern, { locale }) : '-'}
          </span>
        </TableCell>
      )}
      <TableCell onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem
                onClick={() => {
                  onOpenDialog(task)
                }}
              >
                <Pencil className="h-4 w-4" />
                {t('common.edit')}
              </DropdownMenuItem>
              {String(task.source || 'in_app')
                .toLowerCase()
                .replace(/\s+/g, '_') !== 'redmine' && (
                <DropdownMenuItem onClick={() => onCopy(task)}>
                  <Copy className="h-4 w-4" />
                  {t('taskManagement.makeCopy')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onToggleFavorite(task.id)}>
                <Star className={cn('h-4 w-4', isFavorite && 'fill-amber-400 text-amber-500')} />
                {isFavorite ? t('taskManagement.unfavorite') : t('taskManagement.favorite')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)}>
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

export const TaskTableRow = memo(TaskTableRowComponent, (prev, next) => {
  if (prev.task.id !== next.task.id) return false
  if (prev.rowNumber !== next.rowNumber) return false
  if (prev.task !== next.task) return false
  if (prev.visibleColumnIds !== next.visibleColumnIds) return false
  if (prev.isFavorite !== next.isFavorite) return false
  if (prev.locale !== next.locale) return false
  if (prev.getAssigneeDisplay !== next.getAssigneeDisplay) return false
  if (prev.statusColorMap !== next.statusColorMap) return false
  if (prev.priorityColorMap !== next.priorityColorMap) return false
  if (prev.typeColorMap !== next.typeColorMap) return false
  return true
})
