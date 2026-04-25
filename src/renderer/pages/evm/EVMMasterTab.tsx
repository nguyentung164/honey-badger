'use client'

import { Check, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import type { EvmMasterSubTab } from '@/stores/useEvmToolbarLayoutStore'
import { useEvmToolbarLayoutStore } from '@/stores/useEvmToolbarLayoutStore'

function MasterTable({
  items,
  onAdd,
  onUpdate,
  onDelete,
  columns,
  toolbarAddSignal = 0,
  applyToolbarAdd = false,
  toolbarContextKey,
}: {
  items: { code: string; name?: string; userCode?: string }[]
  onAdd: (code: string, name?: string) => void | Promise<void>
  onUpdate: (code: string, name: string) => void | Promise<void>
  onDelete: (code: string) => void | Promise<void>
  columns: { codeLabel: string; nameLabel: string }
  toolbarAddSignal?: number
  applyToolbarAdd?: boolean
  toolbarContextKey: string
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addName, setAddName] = useState('')
  const [toDelete, setToDelete] = useState<string | null>(null)
  const lastToolbarAddRef = useRef<number | null>(null)
  const lastToolbarCtxRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastToolbarCtxRef.current !== toolbarContextKey) {
      lastToolbarCtxRef.current = toolbarContextKey
      lastToolbarAddRef.current = toolbarAddSignal
      return
    }
    if (!applyToolbarAdd) {
      lastToolbarAddRef.current = toolbarAddSignal
      return
    }
    if (toolbarAddSignal <= 0 || toolbarAddSignal === lastToolbarAddRef.current) return
    lastToolbarAddRef.current = toolbarAddSignal
    setShowAdd(true)
  }, [toolbarAddSignal, applyToolbarAdd, toolbarContextKey])

  const handleCreate = useCallback(async () => {
    if (!addCode.trim()) return
    await onAdd(addCode.trim(), addName.trim() || undefined)
    setShowAdd(false)
    setAddCode('')
    setAddName('')
  }, [addCode, addName, onAdd])

  const handleUpdate = useCallback(async () => {
    if (!editingCode) return
    await onUpdate(editingCode, editName.trim())
    setEditingCode(null)
  }, [editingCode, editName, onUpdate])

  const handleDelete = useCallback(async () => {
    if (toDelete) {
      await onDelete(toDelete)
      setToDelete(null)
    }
  }, [toDelete, onDelete])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showAdd && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 shrink-0">
          <Input placeholder={columns.codeLabel} value={addCode} onChange={e => setAddCode(e.target.value)} className="w-28" />
          <Input placeholder={columns.nameLabel} value={addName} onChange={e => setAddName(e.target.value)} className="w-40" />
          <Button variant={buttonVariant} size="sm" onClick={handleCreate} disabled={!addCode.trim()}>
            <Check className="h-4 w-4 mr-1" />
            {t('common.add')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/40 shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto overflow-x-auto">
          <Table className="w-max min-w-full">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-12 text-center">{t('evm.tableNo')}</TableHead>
                <TableHead className="w-28">{columns.codeLabel}</TableHead>
                <TableHead>{columns.nameLabel}</TableHead>
                <TableHead className="w-24 text-center">{t('taskManagement.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.code}>
                  <TableCell className="text-center font-mono text-sm">{index + 1}</TableCell>
                  <TableCell className="font-mono text-sm">{item.code}</TableCell>
                  <TableCell>
                    {editingCode === item.code ? (
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="max-w-xs" onKeyDown={e => e.key === 'Enter' && handleUpdate()} />
                    ) : (
                      item.name || '-'
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[140px]">
                        {editingCode === item.code ? (
                          <>
                            <DropdownMenuItem onClick={handleUpdate}>
                              <Check className="h-4 w-4 mr-2" />
                              {t('common.save')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingCode(null)}>
                              <X className="h-4 w-4 mr-2" />
                              {t('common.cancel')}
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingCode(item.code)
                                setEditName(item.name || '')
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(item.code)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('common.delete')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {!applyToolbarAdd && !showAdd && (
        <Button variant={buttonVariant} size="sm" className="w-fit shrink-0" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('common.add')}
        </Button>
      )}
      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
          <AlertDialogDescription>{t('common.delete')}?</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function EVMMasterTab() {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const master = useEVMStore(s => s.master)
  const setMaster = useEVMStore(s => s.setMaster)
  const masterSubTab = useEvmToolbarLayoutStore(s => s.masterSubTab)
  const setMasterSubTab = useEvmToolbarLayoutStore(s => s.setMasterSubTab)
  const masterAddSignal = useEvmToolbarLayoutStore(s => s.masterAddSignal)
  const [hoursDraft, setHoursDraft] = useState(String(master.hoursPerDay ?? 8))

  useEffect(() => {
    setHoursDraft(String(master.hoursPerDay ?? 8))
  }, [master.hoursPerDay])

  const saveHoursPerDay = useCallback(async () => {
    const v = Number(hoursDraft)
    if (!Number.isFinite(v) || v <= 0) {
      toast.error(t('evm.saveFailed'))
      return
    }
    try {
      await setMaster({ hoursPerDay: v })
      toast.success(t('common.save'))
    } catch {
      toast.error(t('evm.saveFailed'))
    }
  }, [hoursDraft, setMaster, t])

  const handleAddPhase = useCallback(
    async (code: string, name?: string) => {
      if (master.phases.some(p => p.code === code)) {
        toast.error(t('evm.masterDuplicatePhase'))
        return
      }
      try {
        await setMaster({ phases: [...master.phases, { code, name }] })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.phases, setMaster, t]
  )

  const handleUpdatePhase = useCallback(
    async (code: string, name: string) => {
      try {
        await setMaster({
          phases: master.phases.map(p => (p.code === code ? { ...p, name } : p)),
        })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.phases, setMaster, t]
  )

  const handleDeletePhase = useCallback(
    async (code: string) => {
      try {
        await setMaster({ phases: master.phases.filter(p => p.code !== code) })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.phases, setMaster, t]
  )

  const handleAddStatus = useCallback(
    async (code: string, name?: string) => {
      if (master.statuses.some(s => s.code === code)) {
        toast.error(t('evm.masterDuplicateStatus'))
        return
      }
      try {
        await setMaster({ statuses: [...master.statuses, { code, name }] })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.statuses, setMaster, t]
  )

  const handleUpdateStatus = useCallback(
    async (code: string, name: string) => {
      try {
        await setMaster({
          statuses: master.statuses.map(s => (s.code === code ? { ...s, name } : s)),
        })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.statuses, setMaster, t]
  )

  const handleDeleteStatus = useCallback(
    async (code: string) => {
      try {
        await setMaster({ statuses: master.statuses.filter(s => s.code !== code) })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.statuses, setMaster, t]
  )

  const handleAddNonWorking = useCallback(
    async (date: string, note?: string) => {
      if (master.nonWorkingDays.some(n => n.date === date)) {
        toast.error(t('evm.masterDuplicateDate'))
        return
      }
      try {
        await setMaster({ nonWorkingDays: [...master.nonWorkingDays, { date, note }].sort((a, b) => a.date.localeCompare(b.date)) })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.nonWorkingDays, setMaster, t]
  )

  const handleDeleteNonWorking = useCallback(
    async (date: string) => {
      try {
        await setMaster({ nonWorkingDays: master.nonWorkingDays.filter(n => n.date !== date) })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [master.nonWorkingDays, setMaster, t]
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div className="mb-3 shrink-0 flex flex-wrap items-end gap-2 rounded-md border border-border/40 bg-muted/20 p-3">
        <div className="flex min-w-[140px] flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t('evm.masterHoursPerDay')}</Label>
          <Input type="number" min={0.25} step={0.5} value={hoursDraft} onChange={e => setHoursDraft(e.target.value)} className="h-8 w-28 font-mono text-sm" />
        </div>
        <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={() => void saveHoursPerDay()}>
          {t('common.save')}
        </Button>
        <p className="w-full text-[11px] leading-snug text-muted-foreground">{t('evm.masterHoursPerDayHint')}</p>
      </div>
      <Tabs
        value={masterSubTab}
        onValueChange={v => {
          if (v === 'phases' || v === 'statuses' || v === 'nonworking') setMasterSubTab(v as EvmMasterSubTab)
        }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
      >
        <TabsList className="h-auto shrink-0 flex-wrap">
          <TabsTrigger value="phases">{t('evm.masterTabPhase')}</TabsTrigger>
          <TabsTrigger value="statuses">{t('evm.masterTabStatus')}</TabsTrigger>
          <TabsTrigger value="nonworking">{t('evm.masterTabNonworking')}</TabsTrigger>
        </TabsList>
        <TabsContent value="phases" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <MasterTable
            items={master.phases}
            onAdd={handleAddPhase}
            onUpdate={handleUpdatePhase}
            onDelete={handleDeletePhase}
            columns={{ codeLabel: t('evm.tableCode'), nameLabel: t('common.name') }}
            toolbarAddSignal={masterAddSignal}
            applyToolbarAdd={masterSubTab === 'phases'}
            toolbarContextKey={master.projectId}
          />
        </TabsContent>
        <TabsContent value="statuses" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <MasterTable
            items={master.statuses}
            onAdd={handleAddStatus}
            onUpdate={handleUpdateStatus}
            onDelete={handleDeleteStatus}
            columns={{ codeLabel: t('evm.tableCode'), nameLabel: t('common.name') }}
            toolbarAddSignal={masterAddSignal}
            applyToolbarAdd={masterSubTab === 'statuses'}
            toolbarContextKey={master.projectId}
          />
        </TabsContent>
        <TabsContent value="nonworking" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <NonWorkingTable
            items={master.nonWorkingDays}
            onAdd={handleAddNonWorking}
            onDelete={handleDeleteNonWorking}
            toolbarAddSignal={masterAddSignal}
            applyToolbarAdd={masterSubTab === 'nonworking'}
            toolbarContextKey={master.projectId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function NonWorkingTable({
  items,
  onAdd,
  onDelete,
  toolbarAddSignal = 0,
  applyToolbarAdd = false,
  toolbarContextKey,
}: {
  items: { date: string; note?: string }[]
  onAdd: (date: string, note?: string) => void | Promise<void>
  onDelete: (date: string) => void | Promise<void>
  toolbarAddSignal?: number
  applyToolbarAdd?: boolean
  toolbarContextKey: string
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [showAdd, setShowAdd] = useState(false)
  const [addDate, setAddDate] = useState('')
  const [addNote, setAddNote] = useState('')
  const [toDelete, setToDelete] = useState<string | null>(null)
  const lastToolbarAddRef = useRef<number | null>(null)
  const lastToolbarCtxRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastToolbarCtxRef.current !== toolbarContextKey) {
      lastToolbarCtxRef.current = toolbarContextKey
      lastToolbarAddRef.current = toolbarAddSignal
      return
    }
    if (!applyToolbarAdd) {
      lastToolbarAddRef.current = toolbarAddSignal
      return
    }
    if (toolbarAddSignal <= 0 || toolbarAddSignal === lastToolbarAddRef.current) return
    lastToolbarAddRef.current = toolbarAddSignal
    setShowAdd(true)
  }, [toolbarAddSignal, applyToolbarAdd, toolbarContextKey])

  const handleCreate = async () => {
    if (!addDate) return
    await onAdd(addDate, addNote.trim() || undefined)
    setShowAdd(false)
    setAddDate('')
    setAddNote('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showAdd && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
          <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="w-40" />
          <Input placeholder={t('evm.masterNotePlaceholder')} value={addNote} onChange={e => setAddNote(e.target.value)} className="w-48" />
          <Button variant={buttonVariant} size="sm" onClick={handleCreate} disabled={!addDate}>
            <Check className="h-4 w-4 mr-1" />
            {t('common.add')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/40 shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto overflow-x-auto">
          <Table className="w-max min-w-full">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-12 text-center">{t('evm.tableNo')}</TableHead>
                <TableHead className="w-40">{t('evm.tableDate')}</TableHead>
                <TableHead>{t('evm.tableNote')}</TableHead>
                <TableHead className="w-24 text-center">{t('taskManagement.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.date}>
                  <TableCell className="text-center font-mono text-sm">{index + 1}</TableCell>
                  <TableCell>{formatDateDisplay(item.date, i18n.language)}</TableCell>
                  <TableCell>{item.note || '-'}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setToDelete(item.date)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {!applyToolbarAdd && !showAdd && (
        <Button variant={buttonVariant} size="sm" className="w-fit shrink-0" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('common.add')}
        </Button>
      )}
      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
          <AlertDialogDescription>{t('common.delete')}?</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete) {
                  await onDelete(toDelete)
                  setToDelete(null)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
