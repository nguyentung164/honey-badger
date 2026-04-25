'use client'

import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { AddOrEditCodingRuleDialog } from '@/components/dialogs/settings/AddOrEditCodingRuleDialog'

interface RuleItem {
  id: string
  name: string
  content?: string
  projectId: string | null
  scope: 'global' | 'project'
  projectName?: string
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export function CodingRulesTabContent({ triggerAddTimestamp = 0, onAddTriggered }: { triggerAddTimestamp?: number; onAddTriggered?: () => void } = {}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const user = useTaskAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'

  const [ruleList, setRuleList] = useState<RuleItem[]>([])
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const onAddTriggeredRef = useRef(onAddTriggered)
  useEffect(() => { onAddTriggeredRef.current = onAddTriggered }, [onAddTriggered])
  useEffect(() => {
    if (triggerAddTimestamp > 0) {
      setRuleName('')
      setRuleContent('')
      setAddDialogOpen(true)
      onAddTriggeredRef.current?.()
    }
  }, [triggerAddTimestamp])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [ruleName, setRuleName] = useState('')
  const [ruleContent, setRuleContent] = useState('')
  const [editingRuleId, setEditingRuleId] = useState('')
  const [ruleToDelete, setRuleToDelete] = useState<RuleItem | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const totalPages = Math.max(1, Math.ceil(ruleList.length / pageSize))
  const visibleRules = useMemo(() => ruleList.slice((page - 1) * pageSize, page * pageSize), [ruleList, page, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [pageSize])

  const loadRules = useCallback(async () => {
    const res = await window.api.task.codingRule.getForManagement()
    if (res?.status === 'success' && Array.isArray(res.data)) {
      setRuleList(res.data as RuleItem[])
    } else {
      setRuleList([])
    }
  }, [])

  const loadProjects = useCallback(async () => {
    const res = await window.api.task.getProjectsForUser()
    if (res?.status === 'success' && res.data) {
      setProjectList(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
    } else {
      setProjectList([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      await Promise.all([loadRules(), loadProjects()])
      if (!cancelled) setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [loadRules, loadProjects])

  const handleAdd = useCallback(
    async (projectId?: string | null) => {
      if (!ruleName.trim() || !ruleContent.trim()) return
      const res = await window.api.task.codingRule.create({
        name: ruleName.trim(),
        content: ruleContent.trim(),
        projectId: projectId ?? null,
      })
      if (res?.status === 'success') {
        toast.success(t('toast.success', 'Thành công'))
        setAddDialogOpen(false)
        setRuleName('')
        setRuleContent('')
        loadRules()
      } else {
        toast.error(res?.message ?? t('toast.error'))
      }
    },
    [ruleName, ruleContent, loadRules, t]
  )

  const handleUpdate = useCallback(async () => {
    if (!editingRuleId || (!ruleName.trim() && !ruleContent.trim())) return
    const res = await window.api.task.codingRule.update(editingRuleId, {
      name: ruleName.trim() || undefined,
      content: ruleContent.trim() || undefined,
    })
    if (res?.status === 'success') {
      toast.success(t('toast.success', 'Thành công'))
      setEditDialogOpen(false)
      setEditingRuleId('')
      loadRules()
    } else {
      toast.error(res?.message ?? t('toast.error'))
    }
  }, [editingRuleId, ruleName, ruleContent, loadRules, t])

  const handleDelete = useCallback(async () => {
    if (!ruleToDelete) return
    const res = await window.api.task.codingRule.delete(ruleToDelete.id)
    if (res?.status === 'success') {
      toast.success(t('toast.success', 'Thành công'))
      setRuleToDelete(null)
      loadRules()
    } else {
      toast.error(res?.message ?? t('toast.error'))
    }
  }, [ruleToDelete, loadRules, t])

  const openEdit = (rule: RuleItem) => {
    setRuleName(rule.name)
    setRuleContent(rule.content ?? '')
    setEditingRuleId(rule.id)
    setEditDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="text-muted-foreground">
        {t('common.loading', 'Đang tải...')}
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
          <Table className="w-max min-w-full">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="!text-[var(--table-header-fg)]">{t('common.name')}</TableHead>
                <TableHead className="!text-[var(--table-header-fg)]">{t('dialog.newCodingRule.scope', 'Phạm vi')}</TableHead>
                <TableHead className="!text-[var(--table-header-fg)] w-24 text-center">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ruleList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-center py-8">
                    {t('common.noData', 'Chưa có dữ liệu')}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{rule.scope === 'global' ? t('dialog.newCodingRule.scopeAll', 'Toàn bộ dự án') : (rule.projectName ?? rule.projectId ?? '-')}</TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant={buttonVariant} size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[140px]">
                          <DropdownMenuItem onClick={() => openEdit(rule)}>
                            <Pencil className="h-4 w-4" />
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setRuleToDelete(rule)}>
                            <Trash2 className="h-4 w-4" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {ruleList.length > 0 && (
          <TablePaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={ruleList.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        )}
      </div>

      <AddOrEditCodingRuleDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        isEditMode={false}
        ruleName={ruleName}
        ruleContent={ruleContent}
        setRuleName={setRuleName}
        setRuleContent={setRuleContent}
        projects={projectList}
        isAdmin={isAdmin}
        onAdd={handleAdd}
        onUpdate={() => {}}
      />
      <AddOrEditCodingRuleDialog
        open={editDialogOpen}
        onOpenChange={open => { setEditDialogOpen(open); if (!open) setEditingRuleId(''); }}
        isEditMode={true}
        ruleName={ruleName}
        ruleContent={ruleContent}
        setRuleName={setRuleName}
        setRuleContent={setRuleContent}
        editingRuleId={editingRuleId}
        projects={projectList}
        isAdmin={isAdmin}
        onUpdate={handleUpdate}
        onAdd={() => {}}
      />
      <AlertDialog open={!!ruleToDelete} onOpenChange={open => !open && setRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete', 'Xác nhận xóa')}</AlertDialogTitle>
            <AlertDialogDescription>
              {ruleToDelete ? t('dialog.deleteCodingRuleConfirm', 'Bạn có chắc muốn xóa rule "{{name}}"?', { name: ruleToDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
