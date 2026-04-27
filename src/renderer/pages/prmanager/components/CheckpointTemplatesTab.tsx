'use client'

import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import {
  CHECKPOINT_HEADER_GROUP_IDS,
  CHECKPOINT_HEADER_GROUP_SWATCH,
  checkpointSwatchFrameClass,
  checkpointSwatchInnerClass,
  clampCheckpointHeaderGroupId,
} from '../checkpointHeaderGroup'
import type { PrCheckpointTemplate } from '../hooks/usePrData'
import { PR_MANAGER_ACCENT_OUTLINE_BTN } from '../prManagerButtonStyles'

type Props = {
  projectId: string
  templates: PrCheckpointTemplate[]
  onRefresh: () => void
}

export function CheckpointTemplatesTab({ projectId, templates, onRefresh }: Props) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [adding, setAdding] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [headerPickerOpenId, setHeaderPickerOpenId] = useState<string | null>(null)

  const sorted = [...templates].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleAdd = async () => {
    if (!code.trim() || !label.trim()) {
      toast.error(t('prManager.checkpointTemplates.toastCodeLabel'))
      return
    }
    setAdding(true)
    try {
      const res = await window.api.pr.templateUpsert({
        projectId,
        code: code.trim(),
        label: label.trim(),
        targetBranch: targetBranch.trim() || null,
        sortOrder: sorted.length,
        isActive: true,
      })
      if (res.status === 'success') {
        toast.success(t('prManager.checkpointTemplates.addOk'))
        setCode('')
        setLabel('')
        setTargetBranch('')
        onRefresh()
      } else {
        toast.error(res.message || t('prManager.checkpointTemplates.addFail'))
      }
    } finally {
      setAdding(false)
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await window.api.pr.templateSeedDefault(projectId)
      if (res.status === 'success') {
        toast.success(t('prManager.checkpointTemplates.seedOk'))
        onRefresh()
      } else toast.error(res.message || t('prManager.checkpointTemplates.seedFail'))
    } finally {
      setSeeding(false)
    }
  }

  const toggleActive = async (tpl: PrCheckpointTemplate) => {
    const res = await window.api.pr.templateUpsert({
      id: tpl.id,
      projectId,
      code: tpl.code,
      label: tpl.label,
      targetBranch: tpl.targetBranch,
      sortOrder: tpl.sortOrder,
      isActive: !tpl.isActive,
    })
    if (res.status === 'success') onRefresh()
    else toast.error(res.message || t('prManager.checkpointTemplates.updateFail'))
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const next = [...sorted]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    const res = await window.api.pr.templateReorder(projectId, next.map(t => t.id))
    if (res.status === 'success') onRefresh()
  }

  const moveDown = async (idx: number) => {
    if (idx === sorted.length - 1) return
    const next = [...sorted]
      ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
    const res = await window.api.pr.templateReorder(projectId, next.map(t => t.id))
    if (res.status === 'success') onRefresh()
  }

  const handleDelete = async (id: string) => {
    const res = await window.api.pr.templateDelete(id)
    if (res.status === 'success') {
      toast.success(t('prManager.checkpointTemplates.deleteOk'))
      onRefresh()
    } else toast.error(res.message || t('prManager.checkpointTemplates.deleteFail'))
  }

  const setHeaderGroup = async (tpl: PrCheckpointTemplate, headerGroupId: number | null): Promise<boolean> => {
    const res = await window.api.pr.templateUpsert({
      projectId,
      code: tpl.code,
      label: tpl.label,
      targetBranch: tpl.targetBranch,
      sortOrder: tpl.sortOrder,
      isActive: tpl.isActive,
      headerGroupId,
    })
    if (res.status === 'success') {
      onRefresh()
      return true
    }
    toast.error(res.message || t('prManager.checkpointTemplates.updateFail'))
    return false
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="mb-3 text-sm font-medium">{t('prManager.checkpointTemplates.sectionTitle')}</div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.checkpointTemplates.code')}</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder={t('prManager.checkpointTemplates.codePh')} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.checkpointTemplates.label')}</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={t('prManager.checkpointTemplates.labelPh')} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.checkpointTemplates.targetBranch')}</Label>
            <Input
              value={targetBranch}
              onChange={e => setTargetBranch(e.target.value)}
              placeholder={t('prManager.checkpointTemplates.targetPh')}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAdd}
            disabled={adding}
            className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN)}
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t('prManager.checkpointTemplates.add')}
          </Button>
        </div>
        {sorted.length === 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <span>{t('prManager.checkpointTemplates.emptyHint')}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSeed}
              disabled={seeding}
              className={cn('shrink-0', PR_MANAGER_ACCENT_OUTLINE_BTN)}
            >
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {t('prManager.checkpointTemplates.seedDefault')}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">{t('prManager.checkpointTemplates.colOrder')}</TableHead>
              <TableHead>{t('prManager.checkpointTemplates.colCode')}</TableHead>
              <TableHead>{t('prManager.checkpointTemplates.colLabel')}</TableHead>
              <TableHead>{t('prManager.checkpointTemplates.colTarget')}</TableHead>
              <TableHead className="w-[90px]">{t('prManager.checkpointTemplates.colActive')}</TableHead>
              <TableHead className="w-[76px]" title={t('prManager.checkpointTemplates.headerGroupColumnHelp')}>
                {t('prManager.checkpointTemplates.colHeaderGroup')}
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((tpl, idx) => {
              const headerPreviewId = clampCheckpointHeaderGroupId(tpl.headerGroupId)
              return (
                <TableRow key={tpl.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => moveUp(idx)} disabled={idx === 0} className="h-6 w-6">
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => moveDown(idx)} disabled={idx === sorted.length - 1} className="h-6 w-6">
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{tpl.code}</TableCell>
                  <TableCell>{tpl.label}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{tpl.targetBranch ?? '—'}</TableCell>
                  <TableCell>
                    <Checkbox checked={tpl.isActive} onCheckedChange={() => toggleActive(tpl)} />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Popover open={headerPickerOpenId === tpl.id} onOpenChange={open => setHeaderPickerOpenId(open ? tpl.id : null)}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="border-none shrink-0 p-0 leading-none"
                          title={t('prManager.checkpointTemplates.headerGroupOpenButton')}
                          aria-label={t('prManager.checkpointTemplates.headerGroupOpenButton')}
                          aria-expanded={headerPickerOpenId === tpl.id}
                        >
                          {headerPreviewId === null ? (
                            <span
                              className="block size-4 shrink-0 rounded-sm border border-dashed border-muted-foreground/45 bg-muted/40"
                              aria-hidden
                            />
                          ) : (
                            <span className={cn('block size-4 shrink-0 rounded-sm', CHECKPOINT_HEADER_GROUP_SWATCH[headerPreviewId])} />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2.5" align="start" sideOffset={6}>
                        <p className="mb-2 max-w-[200px] text-xs text-muted-foreground">{t('prManager.checkpointTemplates.headerGroupPopoverHint')}</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          <button
                            type="button"
                            title={t('prManager.checkpointTemplates.headerGroupNoneTitle')}
                            onClick={async () => {
                              const ok = await setHeaderGroup(tpl, null)
                              if (ok) setHeaderPickerOpenId(null)
                            }}
                            className={cn(
                              'col-span-5 flex h-7 items-center justify-center rounded-md border border-dashed border-muted-foreground/45 text-xs font-medium text-muted-foreground hover:bg-muted/50',
                              tpl.headerGroupId == null && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                            )}
                          >
                            {t('prManager.checkpointTemplates.headerGroupDefaultShort')}
                          </button>
                          {CHECKPOINT_HEADER_GROUP_IDS.map(id => (
                            <button
                              key={id}
                              type="button"
                              title={t('prManager.checkpointTemplates.headerGroupSwatchTitle', { n: id + 1 })}
                              aria-label={t('prManager.checkpointTemplates.headerGroupSwatchTitle', { n: id + 1 })}
                              onClick={async () => {
                                const ok = await setHeaderGroup(tpl, id)
                                if (ok) setHeaderPickerOpenId(null)
                              }}
                              className={checkpointSwatchFrameClass(tpl.headerGroupId === id)}
                            >
                              <span className={checkpointSwatchInnerClass(id)} aria-hidden />
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(tpl.id)} className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
