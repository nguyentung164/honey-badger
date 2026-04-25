'use client'

import { format } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import type { SerializedEditorState } from 'lexical'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Ban,
  Bug,
  CalendarIcon,
  CheckCircle,
  Circle,
  Clock,
  Eye,
  Headphones,
  Link2,
  ListTodo,
  Loader2,
  MessageCircle,
  Minus,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TaskDescriptionEditor } from '@/components/dialogs/task/TaskDescriptionEditor'
import { TaskPickerCombobox } from '@/components/dialogs/task/TaskPickerCombobox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import toast from '@/components/ui-elements/Toast'
import { getDateOnlyPattern, getDateTimeDisplayPattern, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { isSerializedStateEmpty } from '@/lib/taskDescriptionEditorState'
import { cn, getProgressColor } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { Separator } from '../../ui/separator'

const LINK_TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; badgeClass: string }> = {
  blocks: {
    icon: Ban,
    badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  },
  blocked_by: {
    icon: Clock,
    badgeClass: 'bg-red-500/20 text-red-700 dark:text-red-400',
  },
  relates_to: {
    icon: Link2,
    badgeClass: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
  },
  duplicates: {
    icon: Link2,
    badgeClass: 'bg-slate-500/20 text-slate-700 dark:text-slate-400',
  },
}

const TASK_LINK_TYPE_FALLBACK_BADGE = 'bg-slate-500/15 text-slate-700 dark:text-slate-400'

type TaskStatus = string
type TaskType = string
type TaskPriority = string

interface MasterItem {
  code: string
  name: string
  sort_order?: number
  color?: string
  is_active?: boolean
}

const getStatusIcon = (code: string, colorClass?: string) => {
  const cls = cn('h-4 w-4 shrink-0', colorClass)
  switch (code) {
    case 'new':
      return <Circle className={cls} />
    case 'in_progress':
      return <Loader2 className={cls} />
    case 'in_review':
      return <Eye className={cls} />
    case 'fixed':
      return <Wrench className={cls} />
    case 'cancelled':
      return <XCircle className={cls} />
    case 'feedback':
      return <MessageCircle className={cls} />
    case 'done':
      return <CheckCircle className={cls} />
    default:
      return <Circle className={cls} />
  }
}

const getPriorityIcon = (code: string, colorClass?: string) => {
  const cls = cn('h-4 w-4 shrink-0', colorClass)
  switch (code) {
    case 'critical':
      return <AlertCircle className={cls} />
    case 'high':
      return <ArrowUp className={cls} />
    case 'low':
      return <ArrowDown className={cls} />
    case 'medium':
      return <Minus className={cls} />
    default:
      return <Minus className={cls} />
  }
}

/** Màu icon + text combobox Type - đồng bộ với TaskManagement */
const TYPE_COLOR: Record<string, string> = {
  bug: 'text-amber-700 dark:text-amber-400',
  feature: 'text-violet-700 dark:text-violet-400',
  support: 'text-teal-700 dark:text-teal-400',
  task: 'text-blue-700 dark:text-blue-400',
}

/** Màu icon + text combobox Status - đồng bộ với TaskManagement */
const STATUS_COLOR: Record<string, string> = {
  new: 'text-sky-700 dark:text-sky-400',
  in_progress: 'text-amber-700 dark:text-amber-400',
  in_review: 'text-violet-700 dark:text-violet-400',
  fixed: 'text-cyan-700 dark:text-cyan-400',
  feedback: 'text-orange-700 dark:text-orange-400',
  cancelled: 'text-red-700 dark:text-red-400',
  done: 'text-emerald-700 dark:text-emerald-400',
}

/** Màu icon + text combobox Priority - đồng bộ với TaskManagement */
/** Bảng màu priority: Red(urgent) → Orange → Sky(trung tính, nổi bật) → Green(calm) */
const PRIORITY_COLOR: Record<string, string> = {
  critical: 'text-red-700 dark:text-red-400',
  high: 'text-orange-700 dark:text-orange-400',
  medium: 'text-sky-600 dark:text-sky-400',
  low: 'text-emerald-700 dark:text-emerald-400',
}

const getDateFnsLocale = (language: string) => {
  switch (language) {
    case 'ja':
      return ja
    case 'vi':
      return vi
    default:
      return enUS
  }
}

/** Compact dialog: thấp hơn bảng task một nấc để tối đa nội dung trên màn hình. */
const TASK_DIALOG_FIELD_INPUT_CLASS = 'h-8 text-sm'
const TASK_DIALOG_COMBOBOX_FIELD = { size: 'sm' as const, triggerClassName: 'h-8 py-1 text-sm' }

/** Nút mở lịch — dùng chung 3 popover ngày. */
const TASK_DIALOG_DATE_TRIGGER_CLASS = 'w-full justify-start text-left font-normal shadow-none focus-visible:ring-0 h-8 text-sm px-3'

/** Cột phải dialog: 2 field / hàng (≥sm). */
const TASK_DIALOG_RIGHT_GRID = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-2'

/** Nhãn field — giữ nguyên chữ hoa/thường theo bản dịch, không ép uppercase. */
const TASK_DIALOG_LABEL_CLASS = 'text-sm font-medium text-muted-foreground leading-tight'

/** Hàng danh sách sub-task / link — khoảng cách dọc nhỏ. */
const TASK_DIALOG_LIST_ROW_CLASS =
  'flex min-w-0 items-center gap-1.5 overflow-hidden rounded-sm px-1.5 py-1 text-sm leading-snug transition-colors duration-200 ease-out motion-reduce:transition-none hover:bg-muted/50'

function recordUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function TaskDialogSection({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-h-[0.875rem] items-center gap-2">
        <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</span>
        <span className="h-px min-w-4 flex-1 bg-border/80" aria-hidden />
      </div>
      {children}
    </div>
  )
}

/** Input cô lập - state nội bộ, không gây re-render form cha. Tránh lag + cursor jump. */
const IsolatedInput = memo(function IsolatedInput({
  valueRef,
  initialValue,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { valueRef: React.MutableRefObject<string>; initialValue: string }) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])
  useEffect(() => {
    valueRef.current = value
  }, [value, valueRef])
  return <Input value={value} onChange={e => setValue(e.target.value)} {...props} />
})

/** Progress slider - chỉ cập nhật parent khi thả chuột (onValueCommit), tránh lag khi kéo. Màu thanh theo giá trị (getProgressColor). */
function ProgressSliderCommit({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Slider>, 'value' | 'onValueChange' | 'onValueCommit' | 'onChange'> & { value: number; onChange: (v: number) => void }) {
  const [localValue, setLocalValue] = useState(value)
  useEffect(() => {
    setLocalValue(value)
  }, [value])
  const color = getProgressColor(localValue / 100)
  return (
    <div style={{ '--progress-slider-color': color } as React.CSSProperties} className="w-full">
      <Slider
        value={[localValue]}
        onValueChange={([v]) => setLocalValue(v ?? 0)}
        onValueCommit={([v]) => onChange(v ?? 0)}
        max={100}
        step={10}
        className={cn('[&_[data-slot=slider-range]]:bg-[var(--progress-slider-color)]', className)}
        {...props}
      />
    </div>
  )
}

export interface TaskForDialog {
  id: string
  title: string
  description: string
  assigneeUserId: string | null
  status: TaskStatus
  progress: number
  priority: TaskPriority
  type?: TaskType
  source?: string
  ticketId?: string
  project?: string
  projectId?: string
  planStartDate: string
  planEndDate: string
  actualStartDate: string
  actualEndDate: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
  createdByName?: string
  createdByAvatarUrl?: string | null
  updatedByName?: string
  updatedByAvatarUrl?: string | null
  version?: number
}

interface AddOrEditTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: { id: string; userCode: string; name: string }[]
  projects: { id: string; name: string }[]
  statuses?: MasterItem[]
  priorities?: MasterItem[]
  types?: MasterItem[]
  sources?: MasterItem[]
  task?: TaskForDialog | null
  onRelationsChange?: () => void
  onSubmit: (input: {
    title: string
    description?: string
    assigneeUserId?: string | null
    status?: TaskStatus
    progress?: number
    priority?: TaskPriority
    type?: TaskType
    source?: string
    ticketId?: string
    project?: string
    projectId?: string
    planStartDate?: string
    planEndDate?: string
    actualStartDate?: string
    actualEndDate?: string
  }) => void | Promise<void>
  onUpdate?: (id: string, data: Record<string, unknown>) => Promise<{ success: boolean }>
  onDelete?: (id: string, version?: number) => Promise<{ success: boolean; closeDialog?: boolean }>
}

export function AddOrEditTaskDialog({
  open,
  onOpenChange,
  users,
  projects,
  statuses = [],
  priorities = [],
  types = [],
  sources = [],
  task,
  onRelationsChange,
  onSubmit,
  onUpdate,
  onDelete,
}: AddOrEditTaskDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const titleRef = useRef<string>('')
  const descriptionRef = useRef<string>('')
  const ticketIdRef = useRef<string>('')
  const addChildTitleRef = useRef<string>('')
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus>('new')
  const [progress, setProgress] = useState(0)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [type, setType] = useState<TaskType>('bug')
  const [source, setSource] = useState('in_app')
  const [project, setProject] = useState('')
  const [projectId, setProjectId] = useState('')
  const [planStartDate, setPlanStartDate] = useState('')
  const [planEndDate, setPlanEndDate] = useState('')
  const [actualStartDate, setActualStartDate] = useState('')
  const [actualEndDate, setActualEndDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [planStartDateOpen, setPlanStartDateOpen] = useState(false)
  const [planEndDateOpen, setPlanEndDateOpen] = useState(false)
  const [children, setChildren] = useState<{ id: string; title: string; ticketId?: string }[]>([])
  const [links, setLinks] = useState<{
    outgoing: { id: string; toTaskId: string; linkType: string; toTitle?: string; toTicketId?: string }[]
    incoming: { id: string; fromTaskId: string; linkType: string; fromTitle?: string; fromTicketId?: string }[]
  }>({ outgoing: [], incoming: [] })
  const [addChildTaskId, setAddChildTaskId] = useState('')
  const [addChildResetKey, setAddChildResetKey] = useState(0)
  const [addLinkToTaskId, setAddLinkToTaskId] = useState('')
  const [addLinkType, setAddLinkType] = useState('blocks')
  const [linkTypes, setLinkTypes] = useState<{ code: string; name: string }[]>([])
  const [actualStartOpen, setActualStartOpen] = useState(false)
  const [actualEndDateOpen, setActualEndDateOpen] = useState(false)
  const [canEdit, setCanEdit] = useState(true)
  const [canDelete, setCanDelete] = useState(true)
  const [recordExtraAvatars, setRecordExtraAvatars] = useState<Record<string, string | null>>({})

  const subTaskPickerExcludeIds = useMemo(() => children.map(c => c.id), [children])

  const isEditMode = !!task
  const isReadOnly = isEditMode && !canEdit

  useEffect(() => {
    if (!open || !task?.id) {
      setCanEdit(true)
      setCanDelete(true)
      return
    }
    let cancelled = false
    setCanEdit(false)
    setCanDelete(false)
    window.api.task
      .canEditTask(task.id)
      .then((res: { status: string; data?: { canEdit: boolean; canDelete: boolean } }) => {
        if (cancelled) return
        if (res.status === 'success' && res.data) {
          setCanEdit(res.data.canEdit)
          setCanDelete(res.data.canDelete)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanEdit(false)
          setCanDelete(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, task?.id])

  useEffect(() => {
    setRecordExtraAvatars({})
    if (!open || !task?.id) return
    let cancelled = false
    const run = async () => {
      const ids: string[] = []
      const cb = task.createdBy?.trim()
      if (cb && !task.createdByAvatarUrl) ids.push(cb)
      const ub = task.updatedBy?.trim()
      if (ub && !task.updatedByAvatarUrl) ids.push(ub)
      const unique = [...new Set(ids)]
      for (const id of unique) {
        try {
          const url = await window.api.user.getAvatarUrl(id)
          if (!cancelled) setRecordExtraAvatars(prev => ({ ...prev, [id]: url ?? null }))
        } catch {
          if (!cancelled) setRecordExtraAvatars(prev => ({ ...prev, [id]: null }))
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, task?.id, task?.createdBy, task?.updatedBy, task?.createdByAvatarUrl, task?.updatedByAvatarUrl])

  useEffect(() => {
    if (open) {
      if (task) {
        setAssigneeUserId(task.assigneeUserId ?? null)
        setStatus(task.status)
        setProgress(task.progress)
        setPriority(task.priority ?? priorities[0]?.code ?? 'medium')
        setType((task as { type?: string }).type ?? types[0]?.code ?? 'bug')
        setSource((task as { source?: string }).source ?? 'in_app')
        setProject((task as { project?: string }).project ?? '')
        setProjectId((task as { projectId?: string }).projectId ?? '')
        setPlanStartDate(task.planStartDate ?? '')
        setPlanEndDate(task.planEndDate ?? '')
        setActualStartDate(task.actualStartDate ?? '')
        setActualEndDate(task.actualEndDate ?? '')
      } else {
        setAssigneeUserId(null)
        setStatus(statuses[0]?.code ?? 'new')
        setProgress(0)
        setPriority(priorities[0]?.code ?? 'medium')
        setType(types[0]?.code ?? 'bug')
        setSource('in_app')
        setProject('')
        setProjectId(projects[0]?.id ?? '')
        setPlanStartDate('')
        setPlanEndDate('')
        setActualStartDate('')
        setActualEndDate('')
      }
    }
  }, [open, task, projects, statuses, priorities, types])

  const [isLoadingRelations, setIsLoadingRelations] = useState(false)
  const loadRelations = useCallback(async () => {
    if (!task?.id || !open) return
    setIsLoadingRelations(true)
    try {
      const [childrenRes, linksRes] = await Promise.all([window.api.task.getTaskChildren(task.id), window.api.task.getTaskLinks(task.id)])
      if (childrenRes.status === 'success' && childrenRes.data) {
        setChildren(childrenRes.data.map((c: any) => ({ id: c.id, title: c.title, ticketId: c.ticketId })))
      }
      if (linksRes.status === 'success' && linksRes.data) {
        setLinks(linksRes.data)
      }
    } finally {
      setIsLoadingRelations(false)
    }
  }, [task?.id, open])

  useEffect(() => {
    loadRelations()
  }, [loadRelations])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.api.master.getMasterTaskLinkTypesAll().then(res => {
      if (cancelled) return
      if (res.status === 'success' && res.data) {
        setLinkTypes(res.data)
        setAddLinkType(prev => {
          const codes = res.data?.map(d => d.code)
          return codes?.includes(prev) ? prev : codes?.[0] ?? 'blocks'
        })
      } else {
        setLinkTypes([{ code: 'blocks', name: 'Blocks' }, { code: 'blocked_by', name: 'Blocked By' }, { code: 'relates_to', name: 'Relates To' }])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const taskLinkTypeLabel = useCallback(
    (code: string) =>
      t(`taskManagement.linkType.${code}`, {
        defaultValue: linkTypes.find(lt => lt.code === code)?.name?.trim() || code,
      }),
    [t, linkTypes]
  )

  const linkTypeComboboxOptions = useMemo(() => {
    if (linkTypes.length > 0) {
      return linkTypes.map(lt => ({
        value: lt.code,
        label: t(`taskManagement.linkType.${lt.code}`, { defaultValue: lt.name }),
      }))
    }
    return [
      { value: 'blocks', label: t('taskManagement.linkType.blocks') },
      { value: 'blocked_by', label: t('taskManagement.linkType.blocked_by') },
      { value: 'relates_to', label: t('taskManagement.linkType.relates_to') },
    ]
  }, [linkTypes, t])

  const sourceDisplayName = useMemo(() => {
    const raw = (source ?? '').trim() || 'in_app'
    const byCode = sources.find(s => s.code === raw)
    if (byCode?.name) return byCode.name
    const normalized = raw.toLowerCase().replace(/\s+/g, '_')
    const byNorm = sources.find(s => s.code === normalized)
    return byNorm?.name ?? raw
  }, [sources, source])

  const locale = useMemo(() => getDateFnsLocale(i18n.language), [i18n.language])
  const dateDisplayPattern = useMemo(() => getDateOnlyPattern(i18n.language), [i18n.language])
  const dateTimeDisplayPattern = useMemo(() => getDateTimeDisplayPattern(i18n.language), [i18n.language])

  const typeOptions = useMemo(() => {
    const opts = types.length > 0 ? [...types] : []
    if (type && !opts.find(tp => tp.code === type)) opts.push({ code: type, name: type })
    const colorCls = (code: string) => TYPE_COLOR[code] ?? 'text-foreground'
    const getIcon = (code: string, item?: { color?: string }) => {
      const cls = item?.color ? '' : colorCls(code)
      const style = item?.color ? { color: item.color } : undefined
      switch (code) {
        case 'feature':
          return <Sparkles className={cn('h-4 w-4 shrink-0', cls)} style={style} />
        case 'support':
          return <Headphones className={cn('h-4 w-4 shrink-0', cls)} style={style} />
        case 'task':
          return <ListTodo className={cn('h-4 w-4 shrink-0', cls)} style={style} />
        case 'bug':
        default:
          return <Bug className={cn('h-4 w-4 shrink-0', cls)} style={style} />
      }
    }
    const wrap = (item: { code: string; color?: string }, icon: React.ReactNode, label: string) =>
      item.color ? (
        <span className="flex items-center gap-2" style={{ color: item.color }}>
          {icon}
          {label}
        </span>
      ) : (
        <span className={cn('flex items-center gap-2', colorCls(item.code))}>
          {icon}
          {label}
        </span>
      )
    const fallback = [
      { value: 'bug', label: t('taskManagement.typeBug'), render: wrap({ code: 'bug' }, getIcon('bug'), t('taskManagement.typeBug')) },
      { value: 'feature', label: t('taskManagement.typeFeature'), render: wrap({ code: 'feature' }, getIcon('feature'), t('taskManagement.typeFeature')) },
      { value: 'support', label: t('taskManagement.typeSupport'), render: wrap({ code: 'support' }, getIcon('support'), t('taskManagement.typeSupport')) },
      { value: 'task', label: t('taskManagement.typeTask'), render: wrap({ code: 'task' }, getIcon('task'), t('taskManagement.typeTask')) },
    ]
    return opts.length > 0 ? opts.map(tp => ({ value: tp.code, label: tp.name, render: wrap(tp, getIcon(tp.code, tp), tp.name) })) : fallback
  }, [types, type, t])

  const projectOptions = useMemo(() => projects.map(p => ({ value: p.id, label: p.name })), [projects])

  const assigneeOptions = useMemo(() => [{ value: '_empty', label: '-' }, ...users.map(u => ({ value: u.id, label: `${u.name} (${u.userCode})` }))], [users])

  const recordCreatedDisplay = useMemo(() => {
    if (!task) return { nameOut: '-', avatarSrc: null as string | null, initials: '?' }
    const uid = task.createdBy?.trim() ?? ''
    const rawName = task.createdByName?.trim() || (uid ? users.find(u => u.id === uid)?.name : '') || ''
    const nameOut = rawName || (uid || '-')
    const avatarSrc =
      (task.createdByAvatarUrl && String(task.createdByAvatarUrl)) || (uid ? recordExtraAvatars[uid] : null) || null
    return { nameOut, avatarSrc, initials: recordUserInitials(rawName || uid || '?') }
  }, [task, users, recordExtraAvatars])

  const recordUpdatedDisplay = useMemo(() => {
    if (!task) return { nameOut: '-', avatarSrc: null as string | null, initials: '?' }
    const uid = task.updatedBy?.trim() ?? ''
    if (!uid) return { nameOut: '-', avatarSrc: null, initials: '?' }
    const rawName = task.updatedByName?.trim() || users.find(u => u.id === uid)?.name || ''
    const nameOut = rawName || uid
    const avatarSrc =
      (task.updatedByAvatarUrl && String(task.updatedByAvatarUrl)) || recordExtraAvatars[uid] || null
    return { nameOut, avatarSrc, initials: recordUserInitials(rawName || uid) }
  }, [task, users, recordExtraAvatars])

  const statusOptions = useMemo(() => {
    const opts = statuses.length > 0 ? [...statuses] : []
    if (status && !opts.find(s => s.code === status)) opts.push({ code: status, name: status })
    const labels: Record<string, string> = {
      new: t('taskManagement.statusNew'),
      in_progress: t('taskManagement.statusInProgress'),
      in_review: t('taskManagement.statusInReview'),
      fixed: t('taskManagement.statusFixed'),
      cancelled: t('taskManagement.statusCancelled'),
      feedback: t('taskManagement.statusFeedback'),
      done: t('taskManagement.statusDone'),
    }
    const colorCls = (code: string) => STATUS_COLOR[code] ?? 'text-foreground'
    const wrap = (item: { code: string; color?: string }, icon: React.ReactNode, label: string) =>
      item.color ? (
        <span className="flex items-center gap-2" style={{ color: item.color }}>
          {icon}
          {label}
        </span>
      ) : (
        <span className={cn('flex items-center gap-2', colorCls(item.code))}>
          {icon}
          {label}
        </span>
      )
    const getIcon = (code: string, item?: { color?: string }) => getStatusIcon(code, item?.color ? '' : colorCls(code))
    return opts.length > 0
      ? opts.map(s => ({ value: s.code, label: s.name, render: wrap(s, getIcon(s.code, s), s.name) }))
      : [
        { value: 'new', label: labels.new, render: wrap({ code: 'new' }, getStatusIcon('new', colorCls('new')), labels.new) },
        { value: 'in_progress', label: labels.in_progress, render: wrap({ code: 'in_progress' }, getStatusIcon('in_progress', colorCls('in_progress')), labels.in_progress) },
        { value: 'in_review', label: labels.in_review, render: wrap({ code: 'in_review' }, getStatusIcon('in_review', colorCls('in_review')), labels.in_review) },
        { value: 'fixed', label: labels.fixed, render: wrap({ code: 'fixed' }, getStatusIcon('fixed', colorCls('fixed')), labels.fixed) },
        { value: 'cancelled', label: labels.cancelled, render: wrap({ code: 'cancelled' }, getStatusIcon('cancelled', colorCls('cancelled')), labels.cancelled) },
        { value: 'feedback', label: labels.feedback, render: wrap({ code: 'feedback' }, getStatusIcon('feedback', colorCls('feedback')), labels.feedback) },
        { value: 'done', label: labels.done, render: wrap({ code: 'done' }, getStatusIcon('done', colorCls('done')), labels.done) },
      ]
  }, [statuses, status, t])

  const priorityOptions = useMemo(() => {
    const opts = priorities.length > 0 ? [...priorities] : []
    if (priority && !opts.find(p => p.code === priority)) opts.push({ code: priority, name: priority })
    const labels: Record<string, string> = {
      critical: t('taskManagement.priorityCritical'),
      high: t('taskManagement.priorityHigh'),
      medium: t('taskManagement.priorityMedium'),
      low: t('taskManagement.priorityLow'),
    }
    const colorCls = (code: string) => PRIORITY_COLOR[code] ?? 'text-foreground'
    const wrap = (item: { code: string; color?: string }, icon: React.ReactNode, label: string) =>
      item.color ? (
        <span className="flex items-center gap-2" style={{ color: item.color }}>
          {icon}
          {label}
        </span>
      ) : (
        <span className={cn('flex items-center gap-2', colorCls(item.code))}>
          {icon}
          {label}
        </span>
      )
    return opts.length > 0
      ? opts.map(p => ({ value: p.code, label: p.name, render: wrap(p, getPriorityIcon(p.code, p.color ? '' : colorCls(p.code)), p.name) }))
      : [
        { value: 'critical', label: labels.critical, render: wrap({ code: 'critical' }, getPriorityIcon('critical', colorCls('critical')), labels.critical) },
        { value: 'high', label: labels.high, render: wrap({ code: 'high' }, getPriorityIcon('high', colorCls('high')), labels.high) },
        { value: 'medium', label: labels.medium, render: wrap({ code: 'medium' }, getPriorityIcon('medium', colorCls('medium')), labels.medium) },
        { value: 'low', label: labels.low, render: wrap({ code: 'low' }, getPriorityIcon('low', colorCls('low')), labels.low) },
      ]
  }, [priorities, priority, t])

  const ticketIdDisabled = true

  const handleSubmit = async () => {
    if (isReadOnly) return
    const titleVal = (titleRef.current ?? '').trim()
    const rawDesc = (descriptionRef.current ?? '').trim()
    let descVal: string | undefined
    if (!rawDesc) {
      descVal = undefined
    } else {
      try {
        const parsed = JSON.parse(rawDesc) as SerializedEditorState
        descVal = isSerializedStateEmpty(parsed) ? undefined : rawDesc
      } catch {
        descVal = rawDesc || undefined
      }
    }
    if (!titleVal) {
      toast.error(t('taskManagement.taskTitlePlaceholder'))
      return
    }
    if (!isEditMode && !projectId) return
    setIsSubmitting(true)
    try {
      if (isEditMode && task && onUpdate) {
        const result = await onUpdate(task.id, {
          title: titleVal,
          description: descVal,
          assigneeUserId: assigneeUserId ?? undefined,
          status,
          progress,
          priority,
          type,
          source,
          ticketId: undefined,
          projectId: projectId || undefined,
          planStartDate: planStartDate || undefined,
          planEndDate: planEndDate || undefined,
          actualStartDate: actualStartDate || undefined,
          actualEndDate: actualEndDate || undefined,
          version: task.version,
        })
        if (result?.success) onOpenChange(false)
      } else {
        const selectedProject = projects.find(p => p.id === projectId)
        await onSubmit({
          title: titleVal,
          description: descVal,
          assigneeUserId: assigneeUserId ?? undefined,
          status,
          progress,
          priority,
          type,
          source,
          ticketId: undefined,
          project: selectedProject?.name,
          projectId,
          planStartDate: planStartDate || undefined,
          planEndDate: planEndDate || undefined,
          actualStartDate: actualStartDate || undefined,
          actualEndDate: actualEndDate || undefined,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!task || !onDelete || !canDelete || isReadOnly) return
    setIsSubmitting(true)
    try {
      const result = await onDelete(task.id, task.version)
      if (result?.success || result?.closeDialog) {
        setShowDeleteConfirm(false)
        onOpenChange(false)
      } else {
        setShowDeleteConfirm(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const toDate = (s: string) => (s ? (parseLocalDate(s) ?? new Date(s)) : undefined)
  const fromDate = (d: Date | undefined) => (d ? format(d, 'yyyy-MM-dd') : '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl! max-h-[90vh] flex flex-col gap-3 overflow-hidden overflow-x-hidden p-4 sm:max-w-[min(94vw,58rem)] sm:p-4"
        onInteractOutside={e => {
          const el = e.target as HTMLElement | null
          if (el?.closest?.('[data-radix-popper-content-wrapper]')) return
          if (el?.closest?.('[data-radix-select-content]')) return
          if (el?.closest?.('[data-slot="dropdown-menu-content"]')) return
          e.preventDefault()
        }}
        onPointerDownOutside={e => {
          const el = e.target as HTMLElement | null
          if (el?.closest?.('[data-radix-popper-content-wrapper]')) return
          if (el?.closest?.('[data-radix-select-content]')) return
          if (el?.closest?.('[data-slot="dropdown-menu-content"]')) return
          e.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 space-y-1 pb-0 text-left sm:text-left">
          <DialogTitle className="text-lg font-semibold leading-tight">
            {isReadOnly ? t('taskManagement.viewTask') : isEditMode ? t('taskManagement.editTask') : t('taskManagement.createTask')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2">
          <div key={task?.id ?? 'create'} className="flex min-w-0 flex-col gap-3 py-1">
            <div className="grid min-h-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(17.5rem,22rem)] lg:gap-4">
              {/* Trái: Content — textarea giãn theo chiều cao hàng (cùng cao cột phải trên lg) */}
              <div className="flex min-h-[14rem] flex-col min-w-0 lg:min-h-0 lg:h-full">
                <TaskDialogSection className="flex min-h-0 flex-1 flex-col" title={t('taskManagement.dialogSectionContent')}>
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <div className="grid shrink-0 gap-1">
                      <Label htmlFor="task-title" className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.taskTitle')}</Label>
                      <IsolatedInput
                        key={task?.id ?? 'create'}
                        valueRef={titleRef}
                        initialValue={task?.title ?? ''}
                        id="task-title"
                        placeholder={t('taskManagement.taskTitlePlaceholder')}
                        className={cn('w-full', TASK_DIALOG_FIELD_INPUT_CLASS)}
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-1">
                      <Label htmlFor="task-description" className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.description')}</Label>
                      <TaskDescriptionEditor
                        key={`${task?.id ?? 'create'}-desc`}
                        valueRef={descriptionRef}
                        initialValue={task?.description ?? ''}
                        id="task-description"
                        placeholder={t('taskManagement.descriptionPlaceholder')}
                        disabled={isReadOnly}
                        className="w-full min-h-0"
                      />
                    </div>
                  </div>
                </TaskDialogSection>
              </div>

              {/* Phải: General, Assignment, Timeline, Record — 2 ô / hàng */}
              <div className="flex min-w-0 flex-col gap-3 lg:h-full lg:min-h-0">
                <TaskDialogSection title={t('taskManagement.dialogSectionGeneral', 'General')}>
                  <div className={TASK_DIALOG_RIGHT_GRID}>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.type')}</Label>
                      <Combobox value={type} onValueChange={setType} options={typeOptions} className="w-full" disabled={isReadOnly} {...TASK_DIALOG_COMBOBOX_FIELD} />
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.source')}</Label>
                      <Input value={sourceDisplayName} disabled className={cn('w-full bg-muted', TASK_DIALOG_FIELD_INPUT_CLASS)} />
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label htmlFor="task-ticketId" className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.ticketId')}</Label>
                      <IsolatedInput
                        key={task?.id ?? 'create'}
                        valueRef={ticketIdRef}
                        initialValue={(task as { ticketId?: string })?.ticketId ?? ''}
                        id="task-ticketId"
                        disabled={ticketIdDisabled || isReadOnly}
                        placeholder={t('taskManagement.ticketIdAuto')}
                        className={cn('w-full', TASK_DIALOG_FIELD_INPUT_CLASS, (ticketIdDisabled || isReadOnly) && 'bg-muted')}
                      />
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label htmlFor="task-project" className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.project')}</Label>
                      {isEditMode ? (
                        <Input id="task-project" value={project} disabled className={cn('w-full bg-muted', TASK_DIALOG_FIELD_INPUT_CLASS)} />
                      ) : (
                        <Combobox
                          value={projectId}
                          onValueChange={setProjectId}
                          options={projectOptions}
                          placeholder={t('taskManagement.selectProject')}
                          className="w-full"
                          disabled={isReadOnly}
                          {...TASK_DIALOG_COMBOBOX_FIELD}
                        />
                      )}
                    </div>
                  </div>
                </TaskDialogSection>

                <TaskDialogSection title={t('taskManagement.dialogSectionAssignment')}>
                  <div className={TASK_DIALOG_RIGHT_GRID}>
                    <div className="grid min-w-0 gap-2 sm:col-span-2 sm:grid-cols-2 sm:items-end sm:gap-x-3">
                      <div className="grid min-w-0 gap-1">
                        <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.assignee')}</Label>
                        <Combobox
                          value={assigneeUserId || '_empty'}
                          onValueChange={v => setAssigneeUserId(v === '_empty' ? null : v)}
                          options={assigneeOptions}
                          placeholder={t('taskManagement.selectAssignee')}
                          className="w-full"
                          disabled={isReadOnly}
                          {...TASK_DIALOG_COMBOBOX_FIELD}
                        />
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <Label className={TASK_DIALOG_LABEL_CLASS}>
                          {t('taskManagement.progress')} ({progress}%)
                        </Label>
                        <div className="flex min-h-[28px] items-center pt-0.5">
                          <ProgressSliderCommit value={progress} onChange={v => setProgress(v)} className="w-full" disabled={isReadOnly} />
                        </div>
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.status')}</Label>
                      <Combobox value={status} onValueChange={setStatus} options={statusOptions} className="w-full" disabled={isReadOnly} {...TASK_DIALOG_COMBOBOX_FIELD} />
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.priority')}</Label>
                      <Combobox value={priority} onValueChange={setPriority} options={priorityOptions} className="w-full" disabled={isReadOnly} {...TASK_DIALOG_COMBOBOX_FIELD} />
                    </div>
                  </div>
                </TaskDialogSection>

                <TaskDialogSection title={t('taskManagement.dialogSectionDates', 'Timeline')}>
                  <div className={TASK_DIALOG_RIGHT_GRID}>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.planStartDate')}</Label>
                      <Popover open={planStartDateOpen} onOpenChange={setPlanStartDateOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={isReadOnly ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isReadOnly}
                            className={cn(TASK_DIALOG_DATE_TRIGGER_CLASS, TASK_DIALOG_FIELD_INPUT_CLASS, !planStartDate && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-primary" />
                            {planStartDate
                              ? format(parseLocalDate(planStartDate) ?? new Date(planStartDate), dateDisplayPattern, { locale })
                              : t('taskManagement.selectDate')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            locale={locale}
                            mode="single"
                            selected={toDate(planStartDate)}
                            onSelect={d => {
                              setPlanStartDateOpen(false)
                              setPlanStartDate(fromDate(d))
                            }}
                            disabled={date => {
                              const max = planEndDate ? (parseLocalDate(planEndDate) ?? new Date(planEndDate)) : undefined
                              return max ? date > max : false
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.deadline')}</Label>
                      <Popover open={planEndDateOpen} onOpenChange={setPlanEndDateOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={isReadOnly ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isReadOnly}
                            className={cn(TASK_DIALOG_DATE_TRIGGER_CLASS, TASK_DIALOG_FIELD_INPUT_CLASS, !planEndDate && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-primary" />
                            {planEndDate ? format(parseLocalDate(planEndDate) ?? new Date(planEndDate), dateDisplayPattern, { locale }) : t('taskManagement.selectDate')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            locale={locale}
                            mode="single"
                            selected={toDate(planEndDate)}
                            onSelect={d => {
                              setPlanEndDateOpen(false)
                              setPlanEndDate(fromDate(d))
                            }}
                            disabled={date => {
                              const max = actualEndDate ? (parseLocalDate(actualEndDate) ?? new Date(actualEndDate)) : undefined
                              const min = planStartDate ? (parseLocalDate(planStartDate) ?? new Date(planStartDate)) : undefined
                              if (max && date > max) return true
                              if (min && date < min) return true
                              return false
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.actualStartDate')}</Label>
                      <Popover open={actualStartOpen} onOpenChange={setActualStartOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={isReadOnly ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isReadOnly}
                            className={cn(TASK_DIALOG_DATE_TRIGGER_CLASS, TASK_DIALOG_FIELD_INPUT_CLASS, !actualStartDate && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-primary" />
                            {actualStartDate ? format(parseLocalDate(actualStartDate) ?? new Date(actualStartDate), dateDisplayPattern, { locale }) : t('taskManagement.selectDate')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            locale={locale}
                            mode="single"
                            selected={toDate(actualStartDate)}
                            onSelect={d => {
                              setActualStartOpen(false)
                              setActualStartDate(fromDate(d))
                            }}
                            disabled={date => {
                              const maxStr = actualEndDate || planEndDate
                              const max = maxStr ? (parseLocalDate(maxStr) ?? new Date(maxStr)) : undefined
                              const min = planStartDate ? (parseLocalDate(planStartDate) ?? new Date(planStartDate)) : undefined
                              if (max && date > max) return true
                              if (min && date < min) return true
                              return false
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.actualCompletionDate')}</Label>
                      <Popover open={actualEndDateOpen} onOpenChange={setActualEndDateOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={isReadOnly ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isReadOnly}
                            className={cn(TASK_DIALOG_DATE_TRIGGER_CLASS, TASK_DIALOG_FIELD_INPUT_CLASS, !actualEndDate && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-primary" />
                            {actualEndDate ? format(parseLocalDate(actualEndDate) ?? new Date(actualEndDate), dateDisplayPattern, { locale }) : t('taskManagement.selectDate')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            locale={locale}
                            mode="single"
                            selected={toDate(actualEndDate)}
                            onSelect={d => {
                              setActualEndDateOpen(false)
                              setActualEndDate(fromDate(d))
                            }}
                            disabled={date => {
                              let min: Date | undefined = actualStartDate ? (parseLocalDate(actualStartDate) ?? new Date(actualStartDate)) : undefined
                              if (planStartDate) {
                                const ps = parseLocalDate(planStartDate) ?? new Date(planStartDate)
                                if (!min || ps.getTime() < min.getTime()) min = ps
                              }
                              return min ? date < min : false
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </TaskDialogSection>

                {isEditMode && task && (
                  <TaskDialogSection title={t('taskManagement.dialogSectionMeta')}>
                    <div className={TASK_DIALOG_RIGHT_GRID}>
                      <div className="grid min-w-0 gap-1">
                        <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.createdAt')}</Label>
                        <Input
                          value={task.createdAt ? format(new Date(task.createdAt), dateTimeDisplayPattern, { locale }) : '-'}
                          disabled
                          readOnly
                          tabIndex={-1}
                          className={cn('w-full bg-muted', TASK_DIALOG_FIELD_INPUT_CLASS)}
                        />
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.updatedAt')}</Label>
                        <Input
                          value={task.updatedAt ? format(new Date(task.updatedAt), dateTimeDisplayPattern, { locale }) : '-'}
                          disabled
                          readOnly
                          tabIndex={-1}
                          className={cn('w-full bg-muted', TASK_DIALOG_FIELD_INPUT_CLASS)}
                        />
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.recordCreatedBy')}</Label>
                        <div
                          className={cn(
                            'flex min-h-8 w-full items-center gap-2 rounded-md bg-muted px-2',
                            TASK_DIALOG_FIELD_INPUT_CLASS
                          )}
                        >
                          <Avatar className="h-5 w-5 shrink-0">
                            {recordCreatedDisplay.avatarSrc ? (
                              <AvatarImage src={recordCreatedDisplay.avatarSrc} alt="" className="object-cover" />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                              {recordCreatedDisplay.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{recordCreatedDisplay.nameOut}</span>
                        </div>
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <Label className={TASK_DIALOG_LABEL_CLASS}>{t('taskManagement.recordUpdatedBy')}</Label>
                        <div
                          className={cn(
                            'flex min-h-8 w-full items-center gap-2 rounded-md bg-muted px-2',
                            TASK_DIALOG_FIELD_INPUT_CLASS
                          )}
                        >
                          <Avatar className="h-5 w-5 shrink-0">
                            {recordUpdatedDisplay.avatarSrc ? (
                              <AvatarImage src={recordUpdatedDisplay.avatarSrc} alt="" className="object-cover" />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                              {recordUpdatedDisplay.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{recordUpdatedDisplay.nameOut}</span>
                        </div>
                      </div>
                    </div>
                  </TaskDialogSection>
                )}
              </div>
            </div>

            {isEditMode && task && (
              <TaskDialogSection title={t('taskManagement.dialogSectionRelations')}>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-3 min-w-0">
                  {/* Sub-tasks - cột trái */}
                  <div className="min-w-0 overflow-hidden rounded-md bg-muted p-3">
                    <Label className="mb-1 flex items-center gap-1 truncate text-sm font-semibold leading-none text-foreground">
                      {t('taskManagement.subTasks', 'Sub-tasks')} ({children.length})
                      {isLoadingRelations && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </Label>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="max-h-28 min-w-0 overflow-y-auto overflow-x-hidden [&>*+*]:mt-px">
                        {isLoadingRelations ? (
                          <p className="flex items-center gap-1 py-0.5 text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</p>
                        ) : children.length === 0 ? (
                          <p className="py-0.5 text-sm text-muted-foreground">{t('taskManagement.noSubTasks', 'Chưa có sub-task')}</p>
                        ) : (
                          children.map(c => (
                            <div key={c.id} className={TASK_DIALOG_LIST_ROW_CLASS}>
                              <span className="flex-1 truncate min-w-0">{c.ticketId ? `${c.ticketId} - ${c.title}` : c.title}</span>
                              {!isReadOnly && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 min-h-8 min-w-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive"
                                  onClick={async () => {
                                    const res = await window.api.task.updateTask(c.id, { parentId: null })
                                    if (res.status === 'success') {
                                      loadRelations()
                                      onRelationsChange?.()
                                    } else {
                                      toast.error(res.message || t('taskManagement.updateError'))
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      {!isReadOnly && (
                        <>
                          <Separator />
                          <div className="flex min-w-0 flex-wrap gap-1.5 pt-0.5">
                            <TaskPickerCombobox
                              pickerMode="subtask"
                              currentTaskId={task.id}
                              contextProjectId={task.projectId ?? null}
                              extraExcludeIds={subTaskPickerExcludeIds}
                              value={addChildTaskId}
                              onValueChange={setAddChildTaskId}
                              emptyOptionLabel={t('taskManagement.selectTaskToAdd', 'Select task to add')}
                              placeholder={t('taskManagement.selectTaskToAdd', 'Select task to add')}
                              className="min-w-[100px] flex-1"
                              triggerClassName={TASK_DIALOG_COMBOBOX_FIELD.triggerClassName}
                              size={TASK_DIALOG_COMBOBOX_FIELD.size}
                            />
                            <Button
                              size="sm"
                              className="h-8 shrink-0 px-3 text-sm"
                              disabled={!addChildTaskId}
                              onClick={async () => {
                                if (!addChildTaskId) return
                                const res = await window.api.task.updateTask(addChildTaskId, { parentId: task.id })
                                if (res.status === 'success') {
                                  setAddChildTaskId('')
                                  loadRelations()
                                  onRelationsChange?.()
                                } else {
                                  toast.error(res.message || t('taskManagement.updateError'))
                                }
                              }}
                            >
                              {t('common.add')}
                            </Button>
                          </div>
                          <div className="flex gap-1.5">
                            <IsolatedInput
                              key={`addChild-${addChildResetKey}`}
                              valueRef={addChildTitleRef}
                              initialValue=""
                              placeholder={t('taskManagement.subTaskTitlePlaceholder', 'Sub-task title')}
                              className="h-8 flex-1 text-sm"
                            />
                            <Button
                              size="sm"
                              className="h-8 shrink-0 px-3 text-sm"
                              onClick={async () => {
                                const val = (addChildTitleRef.current ?? '').trim()
                                if (!val) return
                                const res = await window.api.task.createTaskChild(task.id, {
                                  title: val,
                                  status: 'new',
                                })
                                if (res.status === 'success') {
                                  setAddChildResetKey(k => k + 1)
                                  loadRelations()
                                  onRelationsChange?.()
                                } else {
                                  toast.error(res.message || t('taskManagement.createError'))
                                }
                              }}
                            >
                              {t('common.add')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Links - cột phải */}
                  <div className="min-w-0 overflow-hidden rounded-md bg-muted p-3">
                    <Label className="mb-1 flex items-center gap-1 truncate text-sm font-semibold leading-none text-foreground">
                      {t('taskManagement.links', 'Links')} ({links.outgoing.length + links.incoming.length})
                      {isLoadingRelations && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </Label>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="max-h-28 min-w-0 overflow-y-auto overflow-x-hidden [&>*+*]:mt-px">
                        {isLoadingRelations ? (
                          <p className="flex items-center gap-1 py-0.5 text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</p>
                        ) : links.outgoing.length === 0 && links.incoming.length === 0 ? (
                          <p className="py-0.5 text-sm text-muted-foreground">{t('taskManagement.noLinks', 'Chưa có link')}</p>
                        ) : (
                          <>
                            {links.outgoing.map(l => {
                              const config = LINK_TYPE_CONFIG[l.linkType] ?? { icon: Link2, badgeClass: TASK_LINK_TYPE_FALLBACK_BADGE }
                              const Icon = config.icon
                              return (
                                <div key={l.id} className={TASK_DIALOG_LIST_ROW_CLASS}>
                                  <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-sm font-medium', config.badgeClass)}>
                                    <Icon className="size-3.5" />
                                    {taskLinkTypeLabel(l.linkType)}
                                  </span>
                                  <span className="flex-1 truncate min-w-0">{l.toTicketId ? `${l.toTicketId} - ${l.toTitle || l.toTaskId}` : l.toTitle || l.toTaskId}</span>
                                  {!isReadOnly && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 min-h-8 min-w-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive"
                                      onClick={async () => {
                                        const res = await window.api.task.deleteTaskLink(task.id, l.id)
                                        if (res.status === 'success') {
                                          loadRelations()
                                          onRelationsChange?.()
                                        } else {
                                          toast.error(res.message || t('taskManagement.updateError'))
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              )
                            })}
                            {links.incoming.map(l => {
                              const config = LINK_TYPE_CONFIG[l.linkType] ?? { icon: Link2, badgeClass: TASK_LINK_TYPE_FALLBACK_BADGE }
                              const Icon = config.icon
                              return (
                                <div key={l.id} className={cn(TASK_DIALOG_LIST_ROW_CLASS, 'text-muted-foreground')}>
                                  <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-sm font-medium', config.badgeClass)}>
                                    <Icon className="size-3.5" />← {taskLinkTypeLabel(l.linkType)}
                                  </span>
                                  <span className="flex-1 truncate min-w-0">
                                    {l.fromTicketId ? `${l.fromTicketId} - ${l.fromTitle || l.fromTaskId}` : l.fromTitle || l.fromTaskId}
                                  </span>
                                </div>
                              )
                            })}
                          </>
                        )}
                      </div>
                      {!isReadOnly && (
                        <>
                          <Separator />
                          <div className="flex gap-2 flex-wrap pt-1 min-w-0">
                            <TaskPickerCombobox
                              pickerMode="link"
                              currentTaskId={task.id}
                              value={addLinkToTaskId}
                              onValueChange={setAddLinkToTaskId}
                              emptyOptionLabel={t('taskManagement.selectTaskToLink', 'Select task')}
                              placeholder={t('taskManagement.selectTaskToLink', 'Select task')}
                              className="min-w-[100px] flex-1"
                              triggerClassName={TASK_DIALOG_COMBOBOX_FIELD.triggerClassName}
                              size={TASK_DIALOG_COMBOBOX_FIELD.size}
                            />
                            <Combobox
                              value={addLinkType}
                              onValueChange={setAddLinkType}
                              options={linkTypeComboboxOptions}
                              className="w-auto min-w-[10rem] max-w-[min(100%,18rem)] shrink-0"
                              {...TASK_DIALOG_COMBOBOX_FIELD}
                            />
                            <Button
                              size="sm"
                              className="h-8 shrink-0 px-3 text-sm"
                              disabled={!addLinkToTaskId}
                              onClick={async () => {
                                const res = await window.api.task.createTaskLink(task.id, addLinkToTaskId, addLinkType)
                                if (res.status === 'success') {
                                  setAddLinkToTaskId('')
                                  loadRelations()
                                  onRelationsChange?.()
                                } else {
                                  toast.error(res.message || t('taskManagement.updateError'))
                                }
                              }}
                            >
                              {t('common.add')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </TaskDialogSection>
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:justify-between">
          <div className="flex gap-1.5">
            {isEditMode && onDelete && task && canDelete && !isReadOnly && (
              <Button
                variant="outline"
                className="h-8 border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSubmitting}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('common.delete')}
              </Button>
            )}
          </div>
          <div className="flex gap-1.5">
            {!isReadOnly && (
              <Button
                variant={buttonVariant}
                onClick={handleSubmit}
                disabled={isSubmitting || (!isEditMode && !projectId)}
                className={cn(
                  'h-8 px-3 text-sm font-medium',
                  isEditMode && 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300'
                )}
              >
                {isSubmitting ? t('common.sending') : isEditMode ? t('common.update') : t('taskManagement.create')}
              </Button>
            )}
          </div>
        </DialogFooter>
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('taskManagement.deleteTaskConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('taskManagement.deleteTaskConfirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
