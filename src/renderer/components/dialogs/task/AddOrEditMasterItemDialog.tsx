'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export interface MasterItem {
  code: string
  name: string
  sort_order?: number
  color?: string
  is_active?: boolean | number
}

type MasterKind = 'statuses' | 'priorities' | 'types' | 'sources'

interface AddOrEditMasterItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: MasterKind
  hasColor: boolean
  item: MasterItem | null
  onSubmitCreate: (input: { code: string; name: string; sort_order: number; color?: string }) => void | Promise<void>
  onSubmitUpdate: (code: string, data: { name: string; sort_order: number; color?: string; is_active?: boolean }) => void | Promise<void>
}

const KIND_LABELS: Record<MasterKind, string> = {
  statuses: 'taskManagement.masterStatuses',
  priorities: 'taskManagement.masterPriorities',
  types: 'taskManagement.masterTypes',
  sources: 'taskManagement.masterSources',
}

export function AddOrEditMasterItemDialog({ open, onOpenChange, kind, hasColor, item, onSubmitCreate, onSubmitUpdate }: AddOrEditMasterItemDialogProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [color, setColor] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEdit = !!item

  useEffect(() => {
    if (open) {
      if (item) {
        setCode(item.code)
        setName(item.name)
        setSortOrder(item.sort_order ?? 0)
        setColor(item.color ?? '')
        setIsActive(item.is_active !== false && item.is_active !== 0)
      } else {
        setCode('')
        setName('')
        setSortOrder(0)
        setColor('')
        setIsActive(true)
      }
    }
  }, [open, item])

  const handleSubmit = async () => {
    if (!name.trim()) return
    if (!isEdit && !code.trim()) return
    setIsSubmitting(true)
    try {
      if (isEdit && item) {
        await onSubmitUpdate(item.code, {
          name: name.trim(),
          sort_order: sortOrder,
          ...(hasColor && { color: color || undefined }),
          is_active: isActive,
        })
      } else {
        await onSubmitCreate({
          code: code.trim(),
          name: name.trim(),
          sort_order: sortOrder,
          ...(hasColor && { color: color || undefined }),
        })
      }
      // Parent closes dialog on success
    } finally {
      setIsSubmitting(false)
    }
  }

  const kindLabel = t(KIND_LABELS[kind])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('common.edit') : t('common.add')} - {kindLabel}
          </DialogTitle>
          <DialogDescription>{isEdit ? t('taskManagement.editMasterItemDescription') : t('taskManagement.addMasterItemDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="master-code">Code</Label>
            <Input id="master-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Code" disabled={isEdit} className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="master-name">{t('common.name')}</Label>
            <Input id="master-name" value={name} onChange={e => setName(e.target.value)} placeholder={t('common.name')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="master-sort">No</Label>
            <Input id="master-sort" type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value) || 0)} />
          </div>
          {hasColor && (
            <div className="grid gap-2">
              <Label>Color</Label>
              <ColorPicker value={color} onChange={setColor} placeholder="#000000" />
            </div>
          )}
          {isEdit && (
            <div className="flex items-center justify-between space-x-2 py-2">
              <Label htmlFor="master-active" className="cursor-pointer flex-1">
                {t('common.active')}
              </Label>
              <Switch id="master-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || (!isEdit && !code.trim()) || isSubmitting}>
            {isSubmitting ? t('common.saving') : isEdit ? t('common.save') : t('taskManagement.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
