'use client'

import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddOrEditMasterItemDialog, type MasterItem } from '@/components/dialogs/task/AddOrEditMasterItemDialog'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import toast from '@/components/ui-elements/Toast'

type MasterKind = 'statuses' | 'priorities' | 'types' | 'sources'

const API_MAP = {
  statuses: {
    getAll: () => window.api.master.getMasterStatusesAll(),
    create: (input: { code: string; name: string; sort_order?: number; color?: string }) => window.api.master.createMasterStatus(input),
    update: (code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => window.api.master.updateMasterStatus(code, data),
    delete: (code: string) => window.api.master.deleteMasterStatus(code),
  },
  priorities: {
    getAll: () => window.api.master.getMasterPrioritiesAll(),
    create: (input: { code: string; name: string; sort_order?: number; color?: string }) => window.api.master.createMasterPriority(input),
    update: (code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => window.api.master.updateMasterPriority(code, data),
    delete: (code: string) => window.api.master.deleteMasterPriority(code),
  },
  types: {
    getAll: () => window.api.master.getMasterTypesAll(),
    create: (input: { code: string; name: string; sort_order?: number; color?: string }) => window.api.master.createMasterType(input),
    update: (code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => window.api.master.updateMasterType(code, data),
    delete: (code: string) => window.api.master.deleteMasterType(code),
  },
  sources: {
    getAll: () => window.api.master.getMasterSourcesAll(),
    create: (input: { code: string; name: string; sort_order?: number }) => window.api.master.createMasterSource(input),
    update: (code: string, data: { name?: string; sort_order?: number; is_active?: boolean }) => window.api.master.updateMasterSource(code, data),
    delete: (code: string) => window.api.master.deleteMasterSource(code),
  },
} as const

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

function MasterTable({
  kind,
  items,
  onReload,
  onMasterChange,
  hasColor,
  onEdit,
}: {
  kind: MasterKind
  items: MasterItem[]
  onReload: () => void
  onMasterChange?: () => void
  hasColor: boolean
  onEdit: (item: MasterItem) => void
}) {
  const { t } = useTranslation()
  const [toDelete, setToDelete] = useState<MasterItem | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const api = API_MAP[kind]

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const visibleItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [pageSize])

  useEffect(() => {
    setPage(1)
  }, [kind])

  const handleDelete = useCallback(
    async (item: MasterItem) => {
      const res = await api.delete(item.code)
      if (res.status === 'success') {
        toast.success(t('taskManagement.updateSuccess'))
        setToDelete(null)
        onReload()
        onMasterChange?.()
      } else {
        toast.error(res.message || t('taskManagement.updateError'))
      }
    },
    [api, onReload, onMasterChange, t]
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
          <Table className="w-max min-w-full">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="!text-[var(--table-header-fg)] w-20 text-center">No</TableHead>
                <TableHead className="!text-[var(--table-header-fg)] w-28">Code</TableHead>
                <TableHead className="!text-[var(--table-header-fg)]">{t('common.name')}</TableHead>
                {hasColor && <TableHead className="!text-[var(--table-header-fg)] min-w-[140px]">Color</TableHead>}
                <TableHead className="!text-[var(--table-header-fg)] w-20 text-center">Active</TableHead>
                <TableHead className="!text-[var(--table-header-fg)] w-24 text-center">{t('taskManagement.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map(item => (
                <TableRow key={item.code} className={item.is_active === false || item.is_active === 0 ? 'opacity-50' : ''}>
                  <TableCell className="text-center">{item.sort_order ?? 0}</TableCell>
                  <TableCell className="font-mono text-sm">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  {hasColor && (
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {item.color && <span className="w-4 h-4 rounded border" style={{ backgroundColor: item.color }} title={item.color} />}
                        {item.color || '-'}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-center">{item.is_active !== false && item.is_active !== 0 ? t('common.yes', 'Yes') : t('common.no', 'No')}</TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[140px]">
                        <DropdownMenuItem onClick={() => onEdit(item)}>
                          <Pencil className="h-4 w-4" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setToDelete(item)}>
                          <Trash2 className="h-4 w-4" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {items.length > 0 && (
          <TablePaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={items.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        )}
      </div>
      <AlertDialog open={toDelete !== null} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{toDelete && t('taskManagement.deleteMasterConfirm', { code: toDelete.code, name: toDelete.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => toDelete && handleDelete(toDelete)}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type MasterSubTabId = 'statuses' | 'priorities' | 'types' | 'sources'

export function MasterTabContent({ onMasterChange, triggerAddTimestamp = 0, onAddTriggered }: { onMasterChange?: () => void; triggerAddTimestamp?: number; onAddTriggered?: () => void } = {}) {
  const { t } = useTranslation()
  const [activeSubTab, setActiveSubTab] = useState<MasterSubTabId>('statuses')
  const [statuses, setStatuses] = useState<MasterItem[]>([])
  const [priorities, setPriorities] = useState<MasterItem[]>([])
  const [types, setTypes] = useState<MasterItem[]>([])
  const [sources, setSources] = useState<MasterItem[]>([])
  const [loading, setLoading] = useState(true)
  const [masterDialogOpen, setMasterDialogOpen] = useState(false)
  const [masterDialogItem, setMasterDialogItem] = useState<MasterItem | null>(null)
  const [masterDialogKind, setMasterDialogKind] = useState<MasterSubTabId>('statuses')
  const onAddTriggeredRef = useRef(onAddTriggered)
  useEffect(() => { onAddTriggeredRef.current = onAddTriggered }, [onAddTriggered])
  useEffect(() => {
    if (triggerAddTimestamp > 0) {
      setMasterDialogKind(activeSubTab)
      setMasterDialogItem(null)
      setMasterDialogOpen(true)
      onAddTriggeredRef.current?.()
    }
  }, [triggerAddTimestamp, activeSubTab])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, pRes, tRes, srcRes] = await Promise.all([
        window.api.master.getMasterStatusesAll(),
        window.api.master.getMasterPrioritiesAll(),
        window.api.master.getMasterTypesAll(),
        window.api.master.getMasterSourcesAll(),
      ])
      if (sRes.status === 'success' && sRes.data) setStatuses(sRes.data)
      else if (sRes.status === 'error') setStatuses([])
      if (pRes.status === 'success' && pRes.data) setPriorities(pRes.data)
      else if (pRes.status === 'error') setPriorities([])
      if (tRes.status === 'success' && tRes.data) setTypes(tRes.data)
      else if (tRes.status === 'error') setTypes([])
      if (srcRes.status === 'success' && srcRes.data) setSources(srcRes.data)
      else if (srcRes.status === 'error') setSources([])
      const firstError = [sRes, pRes, tRes, srcRes].find(r => r.status === 'error')
      if (firstError && 'message' in firstError) {
        toast.error((firstError as { message?: string }).message || 'Failed to load master data')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openEditDialog = useCallback((kind: MasterSubTabId, item: MasterItem) => {
    setMasterDialogKind(kind)
    setMasterDialogItem(item)
    setMasterDialogOpen(true)
  }, [])

  const handleDialogCreate = useCallback(
    async (input: { code: string; name: string; sort_order: number; color?: string }) => {
      const api = API_MAP[masterDialogKind]
      const res = await api.create(masterDialogKind === 'sources' ? { code: input.code, name: input.name, sort_order: input.sort_order } : { ...input })
      if (res.status === 'success') {
        toast.success(t('taskManagement.updateSuccess'))
        setMasterDialogOpen(false)
        loadAll()
        onMasterChange?.()
      } else {
        toast.error(res.message || t('taskManagement.updateError'))
      }
    },
    [masterDialogKind, loadAll, onMasterChange, t]
  )

  const handleDialogUpdate = useCallback(
    async (code: string, data: { name: string; sort_order: number; color?: string; is_active?: boolean }) => {
      const api = API_MAP[masterDialogKind]
      const res = await api.update(code, data)
      if (res.status === 'success') {
        toast.success(t('taskManagement.updateSuccess'))
        setMasterDialogOpen(false)
        setMasterDialogItem(null)
        loadAll()
        onMasterChange?.()
      } else {
        toast.error(res.message || t('taskManagement.updateError'))
      }
    },
    [masterDialogKind, loadAll, onMasterChange, t]
  )

  if (loading) {
    return <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('common.loading')}</div>
  }

  return (
    <Tabs value={activeSubTab} onValueChange={v => setActiveSubTab(v as MasterSubTabId)} className="flex flex-col flex-1 min-h-0">
      <TabsList className="shrink-0">
        <TabsTrigger value="statuses">{t('taskManagement.masterStatuses')}</TabsTrigger>
        <TabsTrigger value="priorities">{t('taskManagement.masterPriorities')}</TabsTrigger>
        <TabsTrigger value="types">{t('taskManagement.masterTypes')}</TabsTrigger>
        <TabsTrigger value="sources">{t('taskManagement.masterSources')}</TabsTrigger>
      </TabsList>
      <TabsContent value="statuses" className="flex flex-col flex-1 min-h-0 mt-0">
        <MasterTable kind="statuses" items={statuses} onReload={loadAll} onMasterChange={onMasterChange} hasColor={true} onEdit={item => openEditDialog('statuses', item)} />
      </TabsContent>
      <TabsContent value="priorities" className="flex flex-col flex-1 min-h-0 mt-0">
        <MasterTable kind="priorities" items={priorities} onReload={loadAll} onMasterChange={onMasterChange} hasColor={true} onEdit={item => openEditDialog('priorities', item)} />
      </TabsContent>
      <TabsContent value="types" className="flex flex-col flex-1 min-h-0 mt-0">
        <MasterTable kind="types" items={types} onReload={loadAll} onMasterChange={onMasterChange} hasColor={true} onEdit={item => openEditDialog('types', item)} />
      </TabsContent>
      <TabsContent value="sources" className="flex flex-col flex-1 min-h-0 mt-0">
        <MasterTable kind="sources" items={sources} onReload={loadAll} onMasterChange={onMasterChange} hasColor={false} onEdit={item => openEditDialog('sources', item)} />
      </TabsContent>
      <AddOrEditMasterItemDialog
        open={masterDialogOpen}
        onOpenChange={open => {
          setMasterDialogOpen(open)
          if (!open) setMasterDialogItem(null)
        }}
        kind={masterDialogKind}
        hasColor={masterDialogKind !== 'sources'}
        item={masterDialogItem}
        onSubmitCreate={handleDialogCreate}
        onSubmitUpdate={handleDialogUpdate}
      />
    </Tabs>
  )
}
