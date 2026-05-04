'use client'

import { Bookmark, Check, Trash2 } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { MAX_TASK_SAVED_VIEWS, normalizeSnapshot, type TaskManagementSavedView, type TaskManagementSavedViewSnapshot } from './taskManagementSavedViews'

export function TaskSavedViewsPopover({
  disabled,
  variant,
  savedViews,
  currentSnapshot,
  activeSavedViewId,
  pinnedViewDirty,
  onChangeSavedViews,
  onApplySnapshot,
  onSelectSavedViewItem,
}: {
  disabled?: boolean
  variant: ComponentProps<typeof Button>['variant']
  savedViews: TaskManagementSavedView[]
  currentSnapshot: TaskManagementSavedViewSnapshot
  activeSavedViewId: string | null
  /** True khi bộ lọc hiện tại khác snapshot của view đang “ghim” sau khi user chọn view đã lưu */
  pinnedViewDirty?: boolean
  onChangeSavedViews: (next: TaskManagementSavedView[]) => void
  onApplySnapshot: (snapshot: TaskManagementSavedViewSnapshot) => void
  onSelectSavedViewItem?: (view: TaskManagementSavedView) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [overwriteTarget, setOverwriteTarget] = useState<TaskManagementSavedView | null>(null)

  const trimmedDraft = nameDraft.trim().slice(0, 80)
  const findDupByName = (nameLower: string) => savedViews.find(v => v.name.trim().toLowerCase() === nameLower.trim().toLowerCase()) ?? null

  const handleSaveCurrent = () => {
    const name = trimmedDraft
    if (!name) {
      toast.error(t('taskManagement.savedViewsNameRequired'))
      return
    }
    const snap = normalizeSnapshot(currentSnapshot)
    const dup = findDupByName(name)
    if (dup) {
      setOverwriteTarget(dup)
      return
    }
    if (savedViews.length >= MAX_TASK_SAVED_VIEWS) {
      toast.error(t('taskManagement.savedViewsLimit', { max: MAX_TASK_SAVED_VIEWS }))
      return
    }
    onChangeSavedViews([...savedViews, { id: crypto.randomUUID(), name, snapshot: snap }])
    setNameDraft('')
    toast.success(t('taskManagement.savedViewsSaved'))
  }

  const confirmOverwrite = () => {
    const v = overwriteTarget
    setOverwriteTarget(null)
    if (!v) return
    const snap = normalizeSnapshot(currentSnapshot)
    const name = trimmedDraft || v.name.trim().slice(0, 80)
    const next = savedViews.map(x => (x.id === v.id ? { ...x, name, snapshot: snap } : x))
    onChangeSavedViews(next)
    setNameDraft('')
    toast.success(t('taskManagement.savedViewsSaved'))
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-8 shrink-0 gap-1.5 relative border-dashed border-primary/45 bg-muted/40 font-medium text-foreground shadow-none hover:bg-muted/55 dark:border-primary/35 dark:bg-muted/25 dark:hover:bg-muted/40',
              disabled && 'pointer-events-none opacity-50',
            )}
            disabled={disabled}
            title={pinnedViewDirty ? t('taskManagement.savedViewDirtyTooltip') : undefined}
          >
            <Bookmark className="h-3.5 w-3.5 shrink-0" />
            {pinnedViewDirty ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-background" aria-hidden />
            ) : null}
            {t('taskManagement.savedViews')}
            {savedViews.length > 0 && <span className="text-muted-foreground">({savedViews.length})</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-3 border-b">
            <div className="text-sm font-medium">{t('taskManagement.savedViews')}</div>
            {pinnedViewDirty ? (
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400/95">{t('taskManagement.savedViewDirtyHint')}</p>
            ) : null}
          </div>
          <div className="max-h-[220px] overflow-y-auto px-2 py-1">
            {savedViews.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">{t('taskManagement.savedViewsEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {savedViews.map(v => (
                  <li key={v.id} className="flex items-center gap-1 rounded-md hover:bg-muted/70">
                    <button
                      type="button"
                      title={v.name}
                      className="flex flex-1 min-w-0 items-center gap-1.5 px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        onSelectSavedViewItem?.(v)
                        onApplySnapshot(v.snapshot)
                        setOpen(false)
                      }}
                    >
                      {activeSavedViewId === v.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      className="shrink-0 p-2 text-muted-foreground hover:text-destructive"
                      onClick={() => onChangeSavedViews(savedViews.filter(x => x.id !== v.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-2 border-t space-y-2">
            <Input
              placeholder={t('taskManagement.savedViewsPlaceholder')}
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSaveCurrent()
                }
              }}
              className="h-8"
              disabled={disabled}
            />
            <Button type="button" size="sm" className="w-full h-8" variant={variant} onClick={handleSaveCurrent} disabled={disabled}>
              {t('taskManagement.savedViewsSave')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={overwriteTarget !== null} onOpenChange={o => !o && setOverwriteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taskManagement.savedViewsOverwriteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {overwriteTarget && t('taskManagement.savedViewsOverwriteDescription', { name: overwriteTarget.name.trim().slice(0, 80) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOverwrite}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
