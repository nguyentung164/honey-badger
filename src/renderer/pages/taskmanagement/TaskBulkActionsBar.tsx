'use client'

import { ListChecks, Loader2 } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import toast from '@/components/ui-elements/Toast'

const UN = '_unchanged'
const CLEAR = '_assign_clear'

type MasterOpt = { value: string; label: string }

export function TaskBulkActionsBar({
  count,
  disabled,
  variant,
  statusOptions,
  priorityOptions,
  assigneeOptions,
  onBulkApply,
  onClearSelection,
}: {
  count: number
  disabled?: boolean
  variant: ComponentProps<typeof Button>['variant']
  statusOptions: MasterOpt[]
  priorityOptions: MasterOpt[]
  assigneeOptions: MasterOpt[]
  onBulkApply: (patch: { status?: string; priority?: string; assigneeUserId?: string | null }) => Promise<void>
  onClearSelection: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(UN)
  const [priority, setPriority] = useState(UN)
  const [assignee, setAssignee] = useState(UN)
  const [working, setWorking] = useState(false)

  const resetDraft = () => {
    setStatus(UN)
    setPriority(UN)
    setAssignee(UN)
  }

  const apply = async () => {
    const patch: { status?: string; priority?: string; assigneeUserId?: string | null } = {}
    if (status !== UN) patch.status = status
    if (priority !== UN) patch.priority = priority
    if (assignee !== UN) {
      patch.assigneeUserId = assignee === CLEAR ? null : assignee
    }
    if (Object.keys(patch).length === 0) {
      toast.error(t('taskManagement.bulkNoFieldSelected'))
      return
    }
    setWorking(true)
    try {
      await onBulkApply(patch)
      setOpen(false)
      resetDraft()
      onClearSelection()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/35 bg-primary/8 px-2 py-1.5 text-sm shrink-0">
      <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="tabular-nums font-medium">{t('taskManagement.bulkSelected', { count })}</span>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={onClearSelection}>
        {t('taskManagement.bulkClearSelection')}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant={variant} size="sm" className="h-7 gap-1 text-xs" disabled={disabled || working}>
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('taskManagement.bulkApply')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 space-y-3" align="start">
          <div className="text-sm font-medium">{t('taskManagement.bulkDialogTitle')}</div>
          <div className="grid gap-2">
            <Combobox
              value={status}
              onValueChange={setStatus}
              options={[{ value: UN, label: t('taskManagement.bulkLeaveUnchanged') }, ...statusOptions]}
              placeholder={t('taskManagement.status')}
              className="w-full"
            />
            <Combobox
              value={priority}
              onValueChange={setPriority}
              options={[{ value: UN, label: t('taskManagement.bulkLeaveUnchanged') }, ...priorityOptions]}
              placeholder={t('taskManagement.priority')}
              className="w-full"
            />
            <Combobox
              value={assignee}
              onValueChange={setAssignee}
              options={[{ value: UN, label: t('taskManagement.bulkLeaveUnchanged') }, { value: CLEAR, label: t('taskManagement.bulkAssigneeClear') }, ...assigneeOptions]}
              placeholder={t('taskManagement.assignee')}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setOpen(false)} disabled={working}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant={variant} size="sm" className="h-8" onClick={() => void apply()} disabled={disabled || working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.confirm')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
