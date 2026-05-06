'use client'

import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, startOfDay, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronRight, Crown, Lock, Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'

export type WorkloadDayCell = {
  userId: string
  date: string
  derivedHours: number
  overrideHours: number | null
  taskCount: number
  taskIds: string[]
}

export type WorkloadUserMeta = {
  userId: string
  name: string
  userCode: string
  role: 'pm' | 'pl' | 'dev'
}

export type WorkloadData = {
  users: WorkloadUserMeta[]
  days: WorkloadDayCell[]
  hoursPerDay: number
  nonWorkingDates: string[]
  canEditAll: boolean
  selfUserId: string
}

export type WorkloadScale = 'week' | 'twoWeek' | 'month' | 'monthly'

export type WorkloadDisplayMode = 'hours' | 'tasks'

export type WorkloadOverrideUpsertInput = {
  userId: string
  workDate: string
  overrideHours: number | null
  note: string | null
}

type WorkloadProps = {
  data: WorkloadData | null | undefined
  scale: WorkloadScale
  start: Date
  totalDays: number
  pixelPerDay: number
  leftBlockWidth: number
  chartWidth: number
  weekendColumnRects: { left: number; width: number }[]
  verticalGridLeftPx: number[]
  showGridBorders: boolean
  locale: Locale
  language: string
  loading?: boolean
  /** Hiển thị banner khi đa project (data sẽ là null). */
  multiProject?: boolean
  /** Slot mini-Gantt khi expand row → render filtered GanttTaskRow của user. Component không tự render task. */
  renderMiniGanttForUser?: (userId: string) => ReactNode
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
}

function isWeekend(d: Date): boolean {
  const dow = getDay(d)
  return dow === 0 || dow === 6
}

const HEADER_H = 40
const ROW_H = 40
const CAPACITY_ROW_H = 28

type Bucket = { left: number; width: number; startDate: Date; endDate: Date; days: Date[] }

/** Sinh các bucket theo `scale` để bucket workload. */
function buildBuckets(scale: WorkloadScale, start: Date, totalDays: number, pixelPerDay: number): Bucket[] {
  const s0 = startOfDay(start)
  const out: Bucket[] = []
  if (scale === 'week') {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(s0, i)
      out.push({ left: i * pixelPerDay, width: pixelPerDay, startDate: d, endDate: d, days: [d] })
    }
    return out
  }
  if (scale === 'monthly') {
    const endExclusive = addDays(s0, totalDays)
    let cur = startOfMonth(s0)
    while (cur < endExclusive) {
      const next = addMonths(cur, 1)
      const startIdx = Math.max(0, differenceInCalendarDays(cur, s0))
      const endIdx = Math.min(totalDays, differenceInCalendarDays(next, s0))
      if (endIdx > startIdx) {
        const left = startIdx * pixelPerDay
        const width = (endIdx - startIdx) * pixelPerDay
        const days: Date[] = []
        for (let i = startIdx; i < endIdx; i++) days.push(addDays(s0, i))
        out.push({ left, width, startDate: addDays(s0, startIdx), endDate: addDays(s0, endIdx - 1), days })
      }
      cur = next
    }
    return out
  }
  for (let i = 0; i < totalDays; i += 7) {
    const span = Math.min(7, totalDays - i)
    const days: Date[] = []
    for (let k = 0; k < span; k++) days.push(addDays(s0, i + k))
    out.push({
      left: i * pixelPerDay,
      width: span * pixelPerDay,
      startDate: days[0],
      endDate: days[days.length - 1],
      days,
    })
  }
  return out
}

function effectiveHoursOfCell(cell: WorkloadDayCell | undefined): number {
  if (!cell) return 0
  if (cell.overrideHours != null) return Number(cell.overrideHours) || 0
  return Number(cell.derivedHours) || 0
}

function formatHours(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  if (n >= 100) return `${Math.round(n)}h`
  return n % 1 === 0 ? `${n.toFixed(0)}h` : `${n.toFixed(1)}h`
}

function bucketTone(loadRatio: number): { bg: string; text: string } {
  if (loadRatio <= 0) return { bg: 'bg-muted/30', text: 'text-muted-foreground' }
  if (loadRatio < 0.6) return { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' }
  if (loadRatio < 1.0) return { bg: 'bg-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300' }
  if (loadRatio < 1.2) return { bg: 'bg-amber-500/30', text: 'text-amber-800 dark:text-amber-300' }
  return { bg: 'bg-rose-500/30', text: 'text-rose-700 dark:text-rose-300' }
}

function userInitials(meta: WorkloadUserMeta): string {
  const src = (meta.name || meta.userCode || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TaskGanttWorkload({
  data,
  scale,
  start,
  totalDays,
  pixelPerDay,
  leftBlockWidth,
  chartWidth,
  weekendColumnRects,
  verticalGridLeftPx,
  showGridBorders,
  locale,
  language: _language,
  loading = false,
  multiProject = false,
  renderMiniGanttForUser,
  onUpsertOverride,
  getUserAvatarUrl,
}: WorkloadProps) {
  const { t } = useTranslation()
  const [displayMode, setDisplayMode] = useState<WorkloadDisplayMode>('hours')
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())

  const buckets = useMemo(() => buildBuckets(scale, start, totalDays, pixelPerDay), [scale, start, totalDays, pixelPerDay])

  const cellMap = useMemo(() => {
    const m = new Map<string, WorkloadDayCell>()
    if (!data) return m
    for (const d of data.days) {
      m.set(`${d.userId}|${d.date}`, d)
    }
    return m
  }, [data])

  const nonWorkingSet = useMemo(() => new Set<string>(data?.nonWorkingDates ?? []), [data])

  const aggregateBucketForUser = useCallback(
    (userId: string, bucket: Bucket): { hours: number; tasks: number; workingDays: number; isFullyNonWorking: boolean; hasOverride: boolean } => {
      let hours = 0
      let tasks = 0
      let workingDays = 0
      let nonWorking = 0
      let hasOverride = false
      const seen = new Set<string>()
      for (const d of bucket.days) {
        const iso = toYyyyMmDd(d) || ''
        const isNw = isWeekend(d) || nonWorkingSet.has(iso)
        if (isNw) {
          nonWorking++
        } else {
          workingDays++
        }
        const cell = cellMap.get(`${userId}|${iso}`)
        if (cell) {
          hours += effectiveHoursOfCell(cell)
          if (cell.overrideHours != null) hasOverride = true
          for (const tid of cell.taskIds) {
            if (!seen.has(tid)) {
              seen.add(tid)
              tasks++
            }
          }
        }
      }
      return { hours, tasks, workingDays, isFullyNonWorking: nonWorking === bucket.days.length && bucket.days.length > 0, hasOverride }
    },
    [cellMap, nonWorkingSet]
  )

  const totalHoursPerUser = useMemo(() => {
    const totals = new Map<string, number>()
    if (!data) return totals
    for (const d of data.days) {
      totals.set(d.userId, (totals.get(d.userId) ?? 0) + effectiveHoursOfCell(d))
    }
    return totals
  }, [data])

  const toggleUser = useCallback((userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])

  const dailyCapacity = data?.hoursPerDay ?? 8

  if (multiProject) {
    return (
      <div className="border-t border-border" style={{ width: leftBlockWidth + chartWidth }}>
        <div
          className="sticky left-0 z-[30] flex items-center justify-between gap-2 bg-muted/80 px-3 py-2 backdrop-blur-sm"
          style={{ width: leftBlockWidth + Math.min(chartWidth, 1200) }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          <div className="text-xs text-muted-foreground italic">{t('taskManagement.workloadNeedsSingleProject')}</div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border-t border-border" style={{ width: leftBlockWidth + chartWidth }}>
        <div className="sticky left-0 z-[30] flex items-center gap-2 bg-muted/80 px-3 py-2 backdrop-blur-sm" style={{ width: leftBlockWidth + Math.min(chartWidth, 1200) }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          {loading ? <span className="text-xs text-muted-foreground">…</span> : null}
        </div>
      </div>
    )
  }

  const users = data.users
  const empty = users.length === 0 || data.days.length === 0

  return (
    <div
      className={cn('relative border-t border-border bg-background', showGridBorders ? 'divide-y divide-border/60' : 'divide-y divide-border/40')}
      style={{ width: leftBlockWidth + chartWidth }}
    >
      <div
        className={cn('sticky top-0 z-[30] flex items-stretch bg-muted/85 backdrop-blur-sm', showGridBorders ? 'border-b border-b-border/70' : 'border-b border-b-border/40')}
        style={{ height: HEADER_H }}
      >
        <div className="sticky left-0 z-[31] flex shrink-0 items-center justify-between gap-2 border-r border-border/50 bg-muted/95 px-3" style={{ width: leftBlockWidth }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          <ToggleGroup type="single" value={displayMode} onValueChange={v => v && setDisplayMode(v as WorkloadDisplayMode)} variant="outline" size="sm" className="gap-px">
            <ToggleGroupItem value="hours" className="h-6 px-2 text-[10px]">
              {t('taskManagement.workloadHours')}
            </ToggleGroupItem>
            <ToggleGroupItem value="tasks" className="h-6 px-2 text-[10px]">
              {t('taskManagement.workloadTasks')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="relative shrink-0 text-[10px] text-muted-foreground" style={{ width: chartWidth }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            {weekendColumnRects.map((r, i) => (
              <div key={`wl-hdr-wk-${r.left}-${i}`} className="absolute top-0 bottom-0 bg-slate-500/[0.10] dark:bg-slate-400/[0.05]" style={{ left: r.left, width: r.width }} />
            ))}
          </div>
          {showGridBorders ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
              {verticalGridLeftPx.map(left => (
                <div key={`wl-grid-${left}`} className="absolute top-0 bottom-0 w-px bg-border/70 dark:bg-border/55" style={{ left }} />
              ))}
            </div>
          ) : null}
          <div className="absolute inset-y-0 right-3 flex items-center justify-end text-[10px] text-muted-foreground/80">
            {t('taskManagement.workloadHoursPerDayLabel', { hours: dailyCapacity })}
          </div>
        </div>
      </div>

      {empty ? (
        <div className="sticky left-0 z-[2] bg-background px-3 py-3 text-xs text-muted-foreground" style={{ width: leftBlockWidth + Math.min(chartWidth, 720) }}>
          {t('taskManagement.workloadEmpty')}
        </div>
      ) : null}

      {users.map(user => {
        const expanded = expandedUsers.has(user.userId)
        const totalH = totalHoursPerUser.get(user.userId) ?? 0
        const allowEditRow = data.canEditAll || user.userId === data.selfUserId

        return (
          <div key={user.userId} className="flex flex-col">
            {/* biome-ignore lint/a11y/useSemanticElements: không dùng <button> bọc hàng — các ô có PopoverTrigger là <button> (invalid nesting). */}
            <div
              role="button"
              tabIndex={0}
              className={cn(
                'group relative flex cursor-pointer items-stretch text-left transition-colors hover:bg-muted/40',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
              )}
              style={{ height: ROW_H }}
              onClick={() => toggleUser(user.userId)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleUser(user.userId)
                }
              }}
              aria-expanded={expanded}
              aria-label={user.name || user.userCode}
            >
              <div className="sticky left-0 z-[20] flex shrink-0 items-center gap-2 border-r border-border/50 bg-background px-3" style={{ width: leftBlockWidth }}>
                <span className="text-muted-foreground/80 transition-transform" aria-hidden>
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={getUserAvatarUrl?.(user.userId) ?? undefined} alt={user.name || user.userCode} />
                  <AvatarFallback className="text-[10px]">{userInitials(user)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">{user.name || user.userCode}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {user.role === 'pm' ? <Crown className="h-3 w-3 text-amber-500" aria-hidden /> : null}
                    {user.role === 'pl' ? <Crown className="h-3 w-3 text-sky-500" aria-hidden /> : null}
                    <span className="uppercase tracking-wide">{user.role}</span>
                    {!allowEditRow ? <Lock className="ml-1 h-3 w-3" aria-hidden /> : null}
                  </span>
                </div>
                <span className="ml-auto shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">{formatHours(totalH) || '0h'}</span>
              </div>
              <div className="relative shrink-0" style={{ width: chartWidth }}>
                <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                  {weekendColumnRects.map((r, i) => (
                    <div
                      key={`wl-row-wk-${user.userId}-${r.left}-${i}`}
                      className="absolute top-0 bottom-0 bg-slate-500/[0.07] dark:bg-slate-400/[0.04]"
                      style={{ left: r.left, width: r.width }}
                    />
                  ))}
                </div>
                {showGridBorders ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
                    {verticalGridLeftPx.map(left => (
                      <div key={`wl-row-grid-${user.userId}-${left}`} className="absolute top-0 bottom-0 w-px bg-border/55 dark:bg-border/35" style={{ left }} />
                    ))}
                  </div>
                ) : null}
                <div className="absolute inset-0 flex items-stretch">
                  {buckets.map((bucket, idx) => (
                    <WorkloadBucketCell
                      key={`${user.userId}-${idx}-${bucket.left}`}
                      bucket={bucket}
                      userId={user.userId}
                      displayMode={displayMode}
                      dailyCapacity={dailyCapacity}
                      aggregate={aggregateBucketForUser}
                      allowEdit={allowEditRow}
                      cellMap={cellMap}
                      canEditAll={data.canEditAll}
                      onUpsertOverride={onUpsertOverride}
                      locale={locale}
                    />
                  ))}
                </div>
              </div>
            </div>

            {expanded ? (
              <div className={cn('flex flex-col bg-muted/15', showGridBorders ? 'border-t border-border/60' : 'border-t border-border/30')}>
                <div className="flex items-stretch" style={{ height: CAPACITY_ROW_H }}>
                  <div
                    className="sticky left-0 z-[18] flex shrink-0 items-center gap-2 border-r border-border/40 bg-muted/40 px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    style={{ width: leftBlockWidth }}
                  >
                    {t('taskManagement.workloadCapacityRow')}
                  </div>
                  <div className="relative shrink-0" style={{ width: chartWidth }}>
                    <div className="absolute inset-0 flex items-stretch">
                      {buckets.map((bucket, idx) => {
                        const agg = aggregateBucketForUser(user.userId, bucket)
                        const cap = Math.max(1, agg.workingDays * dailyCapacity)
                        const ratio = cap > 0 ? agg.hours / cap : 0
                        const tone = bucketTone(ratio)
                        const fillPct = Math.min(100, ratio * 100)
                        return (
                          <div
                            key={`cap-${user.userId}-${idx}`}
                            className={cn('relative h-full border-r border-border/30 last:border-r-0', tone.bg)}
                            style={{ left: 0, width: bucket.width }}
                            title={ratio > 1 ? t('taskManagement.workloadOverloadTooltip') : undefined}
                          >
                            <div
                              aria-hidden
                              className={cn('absolute inset-y-1 left-0 rounded-sm', ratio > 1 ? 'bg-rose-500/55' : ratio >= 1 ? 'bg-amber-500/55' : 'bg-emerald-500/55')}
                              style={{ width: `${fillPct}%`, maxWidth: '100%' }}
                            />
                            <div className={cn('relative z-[1] flex h-full items-center justify-center px-1 text-[10px] font-semibold tabular-nums', tone.text)}>
                              {agg.workingDays > 0 ? `${formatHours(agg.hours) || '0h'} / ${formatHours(cap) || '0h'}` : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                {renderMiniGanttForUser ? <div className="flex flex-col">{renderMiniGanttForUser(user.userId)}</div> : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function WorkloadBucketCell({
  bucket,
  userId,
  displayMode,
  dailyCapacity,
  aggregate,
  allowEdit,
  cellMap,
  canEditAll,
  onUpsertOverride,
  locale,
}: {
  bucket: Bucket
  userId: string
  displayMode: WorkloadDisplayMode
  dailyCapacity: number
  aggregate: (userId: string, bucket: Bucket) => { hours: number; tasks: number; workingDays: number; isFullyNonWorking: boolean; hasOverride: boolean }
  allowEdit: boolean
  cellMap: Map<string, WorkloadDayCell>
  canEditAll: boolean
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  locale: Locale
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [hoursInput, setHoursInput] = useState<string>('')
  const [noteInput, setNoteInput] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const agg = aggregate(userId, bucket)
  const cap = Math.max(1, agg.workingDays * dailyCapacity)
  const ratio = agg.workingDays > 0 ? agg.hours / cap : 0
  const tone = bucketTone(ratio)

  const display = (() => {
    if (displayMode === 'tasks') return agg.tasks > 0 ? String(agg.tasks) : ''
    return formatHours(agg.hours)
  })()

  const choices = useMemo(() => {
    return bucket.days.map(d => {
      const iso = toYyyyMmDd(d) || ''
      const cell = cellMap.get(`${userId}|${iso}`)
      return { iso, cell, weekend: isWeekend(d), label: format(d, 'EEE dd/MM', { locale }) }
    })
  }, [bucket, cellMap, userId, locale])

  const openPopover = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!allowEdit) return
    const firstWorking = choices.find(c => !c.weekend) ?? choices[0]
    if (!firstWorking) return
    setEditingDate(firstWorking.iso)
    setHoursInput(firstWorking.cell?.overrideHours != null ? String(firstWorking.cell.overrideHours) : '')
    setNoteInput('')
    setOpen(true)
  }

  const submit = useCallback(async () => {
    if (!onUpsertOverride || !editingDate) return
    setSubmitting(true)
    try {
      const trimmed = hoursInput.trim()
      const parsed = trimmed === '' ? null : Number(trimmed)
      const value = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
      await onUpsertOverride({ userId, workDate: editingDate, overrideHours: value, note: noteInput.trim() ? noteInput.trim() : null })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, editingDate, hoursInput, noteInput, userId])

  const reset = useCallback(async () => {
    if (!onUpsertOverride || !editingDate) return
    setSubmitting(true)
    try {
      await onUpsertOverride({ userId, workDate: editingDate, overrideHours: null, note: null })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, editingDate, userId])

  return (
    <Popover open={open} onOpenChange={v => (allowEdit ? setOpen(v) : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={openPopover}
          className={cn(
            'relative flex h-full items-center justify-center border-r border-border/30 px-1 text-[10px] font-semibold tabular-nums transition-colors last:border-r-0',
            tone.bg,
            tone.text,
            agg.isFullyNonWorking && 'opacity-50',
            !allowEdit && 'cursor-default'
          )}
          style={{ width: bucket.width }}
          title={!allowEdit && !canEditAll ? t('taskManagement.workloadOverrideReadOnly') : ratio > 1 ? t('taskManagement.workloadOverloadTooltip') : undefined}
          aria-label={display ? `${display} ${userId}` : ''}
        >
          {display}
          {agg.hasOverride ? <Pencil className="absolute right-0.5 top-0.5 h-2.5 w-2.5 opacity-60" aria-hidden /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>{t('taskManagement.workloadOverrideTitle')}</span>
          </div>
          {choices.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {choices.map(c => (
                <Button
                  key={c.iso}
                  type="button"
                  variant={editingDate === c.iso ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-7 px-2 text-[11px]', c.weekend && 'opacity-70')}
                  onClick={() => {
                    setEditingDate(c.iso)
                    setHoursInput(c.cell?.overrideHours != null ? String(c.cell.overrideHours) : '')
                    setNoteInput('')
                  }}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          ) : null}
          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={hoursInput}
            onChange={e => setHoursInput(e.target.value)}
            placeholder={t('taskManagement.workloadOverridePlaceholder')}
            className="h-8 text-xs"
            disabled={submitting}
          />
          <Textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder={t('taskManagement.workloadOverrideNotePlaceholder')}
            className="min-h-[60px] text-xs"
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={submitting}>
              <Trash2 className="mr-1 h-3 w-3" />
              {t('taskManagement.workloadOverrideReset')}
            </Button>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
                {t('taskManagement.workloadOverrideCancel')}
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={submitting}>
                {t('taskManagement.workloadOverrideSave')}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
