'use client'

import { format } from 'date-fns'
import { HelpCircle, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EVMProject, EvmProjectRoleUser } from 'shared/types/evm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { getDateFnsLocale, getDateOnlyPattern, parseLocalDate } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'

function sliceYmd(s: string | undefined): string {
  const t = (s ?? '').trim()
  return t.length >= 10 ? t.slice(0, 10) : t
}

/** Dùng khi `mode="create"` — không có id cho tới khi lưu. */
export const EVM_PROJECT_CREATE_STUB: EVMProject = {
  id: '',
  projectName: '',
  startDate: '',
  endDate: '',
  reportDate: '',
}

const REMINDER_OPTIONS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30'] as const

export function EvmProjectInfoDialog({
  open,
  onOpenChange,
  project,
  mode = 'edit',
  onAfterCreateSuccess,
  useStore = true,
  canEditReminder = true,
  onStandalonePersistSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: EVMProject
  mode?: 'edit' | 'create'
  /** Gọi sau khi tạo project và load store thành công (vd. refresh danh sách select). */
  onAfterCreateSuccess?: () => void | Promise<void>
  /** `false`: chỉ gọi IPC `evm` / `task` reminder — không đụng Zustand (vd. Master). */
  useStore?: boolean
  /** Hiển thị & lưu giờ nhắc báo cáo hằng ngày (`task.updateProjectReminderTime`). */
  canEditReminder?: boolean
  /** Khi `useStore=false`, gọi sau khi tạo/cập nhật thành công (vd. refresh danh sách Master). */
  onStandalonePersistSuccess?: () => void | Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const updateProject = useEVMStore(s => s.updateProject)
  const loadData = useEVMStore(s => s.loadData)
  const isCreate = mode === 'create'

  const [projectNo, setProjectNo] = useState('')
  const [projectName, setProjectName] = useState('')
  const [endUser, setEndUser] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [roleUsers, setRoleUsers] = useState<EvmProjectRoleUser[]>([])
  const [saving, setSaving] = useState(false)
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)
  const [reminderTime, setReminderTime] = useState<string | null>(null)
  const startDateFieldId = useId()
  const endDateFieldId = useId()

  const dateFnsLocale = useMemo(() => getDateFnsLocale(i18n.language), [i18n, i18n.language])
  const dateDisplayPattern = useMemo(() => getDateOnlyPattern(i18n.language), [i18n, i18n.language])

  const toCalendarDate = (s: string) => (s ? (parseLocalDate(s) ?? new Date(s)) : undefined)
  const fromCalendarDate = (d: Date | undefined) => (d ? format(d, 'yyyy-MM-dd') : '')

  const dateFieldsDisabled = !isCreate && !project.id

  useEffect(() => {
    if (!open || isCreate || !project.id) return
    setProjectNo(project.projectNo ?? '')
    setProjectName(project.projectName ?? '')
    setEndUser(project.endUser ?? '')
    setStartDate(sliceYmd(project.startDate))
    setEndDate(sliceYmd(project.endDate))
  }, [open, isCreate, project.id, project.projectNo, project.projectName, project.endUser, project.startDate, project.endDate])

  useEffect(() => {
    if (!open || !isCreate) return
    setProjectNo('')
    setProjectName('')
    setEndUser('')
    const start = format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    const end = format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    setStartDate(start)
    setEndDate(end)
  }, [open, isCreate])

  useEffect(() => {
    if (!open) {
      setStartDateOpen(false)
      setEndDateOpen(false)
      setReminderTime(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || isCreate || !project.id) {
      setReminderTime(null)
      return
    }
    let cancelled = false
    window.api.task.getProjectReminderTime(project.id).then(res => {
      if (!cancelled && res.status === 'success') setReminderTime(res.data ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [open, isCreate, project.id])

  useEffect(() => {
    if (!open || !project.id) {
      setRoleUsers([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.api.evm.getProjectPmPl(project.id)
        if (cancelled || res.status !== 'success' || !res.data) return
        setRoleUsers(res.data as EvmProjectRoleUser[])
      } catch {
        if (!cancelled) setRoleUsers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, project.id])

  const pmList = useMemo(() => roleUsers.filter(r => r.role === 'pm'), [roleUsers])
  const plList = useMemo(() => roleUsers.filter(r => r.role === 'pl'), [roleUsers])

  const requiredIncomplete = useMemo(() => {
    const req = [projectNo?.trim(), projectName?.trim(), endUser?.trim(), startDate?.trim(), endDate?.trim()]
    return req.some(s => !s)
  }, [projectNo, projectName, endUser, startDate, endDate])

  const requiredCn = (empty: boolean) =>
    cn(empty && 'border-rose-400/80 bg-rose-50/70 dark:border-rose-600/70 dark:bg-rose-950/35')

  const persistReminder = useCallback(
    async (projectId: string) => {
      if (!canEditReminder || isCreate || !projectId) return
      const reminderRes = await window.api.task.updateProjectReminderTime(projectId, reminderTime ?? null)
      if (reminderRes.status !== 'success') {
        toast.error(reminderRes.message ?? t('evm.saveFailed'))
      }
    },
    [canEditReminder, isCreate, reminderTime, t]
  )

  const handleSave = useCallback(async () => {
    if (!isCreate && !project.id) return
    if (requiredIncomplete) {
      toast.error(t('evm.projectInfoRequiredFieldsError'))
      return
    }
    const sd = startDate.trim().slice(0, 10)
    const ed = endDate.trim().slice(0, 10)
    if (sd > ed) {
      toast.error(t('evm.dashboardDateOrderError'))
      return
    }
    setSaving(true)
    try {
      if (isCreate) {
        const res = await window.api.evm.createProject({
          projectNo: projectNo.trim() || undefined,
          projectName: projectName.trim() || 'Untitled',
          endUser: endUser.trim() || undefined,
          startDate: sd,
          endDate: ed,
          reportDate: format(new Date(), 'yyyy-MM-dd'),
        })
        if (res.status === 'error' || !res.data) {
          throw new Error(res.message ?? 'create failed')
        }
        const created = res.data as EVMProject
        if (useStore) {
          await loadData(created.id)
          await onAfterCreateSuccess?.()
        } else {
          await onStandalonePersistSuccess?.()
        }
        toast.success(t('evm.created'))
        onOpenChange(false)
      } else if (useStore) {
        await updateProject({
          projectNo,
          projectName: projectName.trim() || 'Untitled',
          endUser,
          startDate,
          endDate,
        })
        await persistReminder(project.id)
        toast.success(t('common.save'))
        onOpenChange(false)
      } else {
        const res = await window.api.evm.updateProject(project.id, {
          projectNo,
          projectName: projectName.trim() || 'Untitled',
          endUser,
          startDate,
          endDate,
        })
        if (res.status === 'error') {
          throw new Error(res.message ?? 'update failed')
        }
        await persistReminder(project.id)
        await onStandalonePersistSuccess?.()
        toast.success(t('common.save'))
        onOpenChange(false)
      }
    } catch {
      toast.error(t('evm.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [
    isCreate,
    project.id,
    projectNo,
    projectName,
    endUser,
    startDate,
    endDate,
    updateProject,
    loadData,
    onAfterCreateSuccess,
    onStandalonePersistSuccess,
    persistReminder,
    requiredIncomplete,
    onOpenChange,
    t,
    useStore,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-md gap-0 overflow-y-auto p-0 sm:max-w-lg"
        onInteractOutside={e => {
          const el = e.target as HTMLElement | null
          if (el?.closest?.('[data-radix-popper-content-wrapper]')) e.preventDefault()
        }}
        onPointerDownOutside={e => {
          const el = e.target as HTMLElement | null
          if (el?.closest?.('[data-radix-popper-content-wrapper]')) e.preventDefault()
        }}
      >
        <DialogHeader className="space-y-1 border-b px-4 py-3">
          <DialogTitle className="text-base">
            {isCreate ? t('evm.newProjectDialogTitle') : t('evm.dashboardProjectInfo')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div
              className={cn(
                'space-y-1',
                !(!isCreate && project.id && canEditReminder) && 'sm:col-span-2'
              )}
            >
              <Label className="text-xs text-muted-foreground">{t('evm.dashboardProjectCode')}</Label>
              <Input
                className={cn('h-8 text-sm', requiredCn(!projectNo?.trim()))}
                value={projectNo}
                onChange={e => setProjectNo(e.target.value)}
                disabled={!isCreate && !project.id}
              />
            </div>
            {!isCreate && project.id && canEditReminder ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('taskManagement.dailyReportReminderTime')}</Label>
                <Select value={reminderTime ?? '__off__'} onValueChange={v => setReminderTime(v === '__off__' ? null : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__off__">{t('taskManagement.dailyReportReminderTimeOff')}</SelectItem>
                    {REMINDER_OPTIONS.map(tm => (
                      <SelectItem key={tm} value={tm}>
                        {tm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">{t('evm.dashboardProjectName')}</Label>
              <Input
                className={cn('h-8 text-sm', requiredCn(!projectName?.trim()))}
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                disabled={!isCreate && !project.id}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">{t('evm.dashboardEndUser')}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t('evm.dashboardEndUser')}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {t('evm.dashboardEndUser')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                className={cn('h-8 text-sm', requiredCn(!endUser?.trim()))}
                value={endUser}
                onChange={e => setEndUser(e.target.value)}
                disabled={!isCreate && !project.id}
              />
            </div>
            <Field>
              <FieldLabel htmlFor={startDateFieldId}>{t('evm.dashboardProjectStart')}</FieldLabel>
              <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={startDateFieldId}
                    type="button"
                    variant={dateFieldsDisabled ? 'ghost' : 'outline'}
                    size="sm"
                    disabled={dateFieldsDisabled}
                    className={cn(
                      'h-8 w-full justify-start px-3 text-left text-sm font-normal shadow-none focus-visible:ring-0',
                      requiredCn(!startDate?.trim()),
                      !startDate?.trim() && 'text-muted-foreground'
                    )}
                  >
                    {startDate?.trim()
                      ? format(parseLocalDate(startDate) ?? new Date(startDate), dateDisplayPattern, { locale: dateFnsLocale })
                      : t('taskManagement.selectDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                  <Calendar
                    locale={dateFnsLocale}
                    mode="single"
                    captionLayout="dropdown"
                    selected={toCalendarDate(startDate)}
                    defaultMonth={toCalendarDate(startDate)}
                    onSelect={d => {
                      setStartDateOpen(false)
                      setStartDate(fromCalendarDate(d))
                    }}
                    disabled={date => {
                      const max = endDate?.trim() ? (parseLocalDate(endDate) ?? new Date(endDate)) : undefined
                      return max ? date > max : false
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
            <Field>
              <FieldLabel htmlFor={endDateFieldId}>{t('evm.dashboardProjectEnd')}</FieldLabel>
              <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={endDateFieldId}
                    type="button"
                    variant={dateFieldsDisabled ? 'ghost' : 'outline'}
                    size="sm"
                    disabled={dateFieldsDisabled}
                    className={cn(
                      'h-8 w-full justify-start px-3 text-left text-sm font-normal shadow-none focus-visible:ring-0',
                      requiredCn(!endDate?.trim()),
                      !endDate?.trim() && 'text-muted-foreground'
                    )}
                  >
                    {endDate?.trim()
                      ? format(parseLocalDate(endDate) ?? new Date(endDate), dateDisplayPattern, { locale: dateFnsLocale })
                      : t('taskManagement.selectDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                  <Calendar
                    locale={dateFnsLocale}
                    mode="single"
                    captionLayout="dropdown"
                    selected={toCalendarDate(endDate)}
                    defaultMonth={toCalendarDate(endDate)}
                    onSelect={d => {
                      setEndDateOpen(false)
                      setEndDate(fromCalendarDate(d))
                    }}
                    disabled={date => {
                      const min = startDate?.trim() ? (parseLocalDate(startDate) ?? new Date(startDate)) : undefined
                      return min ? date < min : false
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
          </div>

          {!isCreate ? (
            <Card className="gap-0 rounded-md border border-border/50 bg-muted/20 py-2 shadow-none">
              <CardHeader className="space-y-0 border-0 p-0 px-2.5 pb-1.5">
                <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('evm.projectInfoRolesSection')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 px-2.5 pt-0 pb-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('evm.dashboardPM')}:</span>
                  {pmList.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    pmList.map(u => (
                      <Badge
                        key={`pm-${u.userId}`}
                        variant="secondary"
                        className="h-5 border-0 bg-amber-500/10 px-1.5 text-[11px] font-normal text-amber-900 shadow-none dark:text-amber-200"
                      >
                        {u.name ?? u.userCode ?? u.userId.slice(0, 8)}
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('evm.dashboardPL')}:</span>
                  {plList.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    plList.map(u => (
                      <Badge
                        key={`pl-${u.userId}`}
                        variant="secondary"
                        className="h-5 border-0 bg-blue-500/10 px-1.5 text-[11px] font-normal text-blue-900 shadow-none dark:text-blue-200"
                      >
                        {u.name ?? u.userCode ?? u.userId.slice(0, 8)}
                      </Badge>
                    ))
                  )}
                </div>
                <CardDescription className="text-[10px] leading-snug">{t('evm.projectInfoRolesHint')}</CardDescription>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <DialogFooter className="gap-2 border-t px-4 py-3 sm:justify-end">
          <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={buttonVariant}
            size="sm"
            className="h-8"
            disabled={(!isCreate && !project.id) || saving}
            aria-busy={saving}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
