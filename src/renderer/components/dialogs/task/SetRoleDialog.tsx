'use client'

import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

interface UserProjectRole {
  id: string
  userId: string
  projectId: string | null
  role: string
}

interface SetRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  onSuccess?: () => void
}

const ROLE_LABELS: Record<string, string> = {
  dev: 'Dev',
  pl: 'PL (Project Lead)',
  pm: 'PM (Project Manager)',
}

export function SetRoleDialog({ open, onOpenChange, userId, userName, onSuccess }: SetRoleDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const token = useTaskAuthStore(s => s.token)
  const [roles, setRoles] = useState<UserProjectRole[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [newRole, setNewRole] = useState<'dev' | 'pl' | 'pm'>('pl')
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open && userId) {
      setIsLoading(true)
      Promise.all([window.api.user.getUserRoles(userId), window.api.task.getProjects()])
        .then(([rolesRes, projectsRes]) => {
          if (rolesRes.status === 'success' && rolesRes.data) {
            setRoles(rolesRes.data)
          } else {
            setRoles([])
          }
          if (projectsRes.status === 'success' && projectsRes.data) {
            setProjects(projectsRes.data)
          } else {
            setProjects([])
          }
        })
        .finally(() => setIsLoading(false))
    } else {
      setRoles([])
      setSelectedScopes(new Set())
    }
  }, [open, userId])

  const getScopeName = (projectId: string | null) => {
    if (projectId === null) return t('taskManagement.global', 'Global (toàn app)')
    return projects.find(p => p.id === projectId)?.name ?? projectId
  }

  const handleRemove = async (projectId: string | null, role: string) => {
    if (!token) return
    setIsSubmitting(true)
    try {
      const res = await window.api.user.removeUserProjectRole(token, userId, projectId, role as 'dev' | 'pl' | 'pm')
      if (res.status === 'success') {
        setRoles(prev => prev.filter(r => !(r.projectId === projectId && r.role === role)))
        onSuccess?.()
        toast.success(t('taskManagement.roleRemovedSuccess', 'Đã xóa role'))
      } else {
        toast.error(res.message || 'Xóa role thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa role thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAdd = async () => {
    if (!token || selectedScopes.size === 0) {
      toast.error(t('taskManagement.selectAtLeastOneScope', 'Chọn ít nhất 1 phạm vi'))
      return
    }
    setIsSubmitting(true)
    try {
      let added = 0
      for (const scope of selectedScopes) {
        const projectId = scope === 'global' ? null : scope
        const exists = roles.some(r => (r.projectId ?? null) === (projectId ?? null) && r.role === newRole)
        if (exists) continue
        const res = await window.api.user.setUserProjectRole(token, userId, projectId, newRole)
        if (res.status === 'success') {
          setRoles(prev => [...prev, { id: '', userId, projectId, role: newRole }])
          added++
        } else {
          toast.error(res.message || 'Gán role thất bại')
          break
        }
      }
      if (added > 0) {
        setSelectedScopes(new Set())
        onSuccess?.()
        toast.success(t('taskManagement.roleSetSuccess', 'Đã gán role thành công'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gán role thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  const selectAllScopes = () => {
    setSelectedScopes(new Set(['global', ...projects.map(p => p.id)]))
  }

  const clearScopes = () => {
    setSelectedScopes(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl! max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t('taskManagement.setRole', 'Gán quyền')} - {userName}
          </DialogTitle>
          <DialogDescription>
            {t('taskManagement.setRoleDescription', 'Gán role PL, PM hoặc Dev cho user. Global = áp dụng toàn app. Một user có thể có nhiều role (VD: PL dự án A, Dev dự án B).')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-row gap-6 py-4 min-h-0 flex-1 overflow-hidden">
          {/* Cột trái: Thêm role */}
          <div className="flex flex-col gap-3 flex-1 min-w-0 border-r pr-6">
            <Label>{t('taskManagement.addRole', 'Thêm role')}</Label>
            <div className="flex flex-wrap gap-4">
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">{t('taskManagement.role', 'Role')}</Label>
                <Combobox
                  value={newRole}
                  onValueChange={v => setNewRole(v as 'dev' | 'pl' | 'pm')}
                  options={[
                    { value: 'dev', label: 'Dev' },
                    { value: 'pl', label: 'PL (Project Lead)' },
                    { value: 'pm', label: 'PM (Project Manager)' },
                  ]}
                  className="w-[140px]"
                />
              </div>
              <div className="grid gap-2 flex-1 min-w-[200px]">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t('taskManagement.scope', 'Phạm vi')} (multi)</Label>
                  <div className="flex gap-1">
                    <Button variant={buttonVariant} size="sm" className="h-6 text-xs" onClick={selectAllScopes}>
                      {t('taskManagement.selectAll', 'Chọn tất cả')}
                    </Button>
                    <Button variant={buttonVariant} size="sm" className="h-6 text-xs" onClick={clearScopes}>
                      {t('taskManagement.clear', 'Xóa chọn')}
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-[100px] rounded-md border p-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="scope-global" className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox id="scope-global" checked={selectedScopes.has('global')} onCheckedChange={() => toggleScope('global')} />
                      {t('taskManagement.global', 'Global (toàn app)')}
                    </label>
                    {projects.map(p => (
                      <label key={p.id} htmlFor={`scope-${p.id}`} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox id={`scope-${p.id}`} checked={selectedScopes.has(p.id)} onCheckedChange={() => toggleScope(p.id)} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
            <Button variant={buttonVariant} onClick={handleAdd} disabled={isSubmitting || selectedScopes.size === 0} size="sm">
              {isSubmitting ? t('common.sending') : t('taskManagement.addRole', 'Thêm role')}
            </Button>
          </div>
          {/* Cột phải: Các role hiện có + scroll dọc */}
          <div className="flex flex-col gap-2 min-w-0 flex-1 shrink-0" style={{ maxWidth: '320px' }}>
            <Label>{t('taskManagement.existingRoles', 'Các role hiện có')}</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading', 'Đang tải...')}</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('taskManagement.noRolesYet', 'Chưa có role nào')}</p>
            ) : (
              <div className="flex-1 min-h-0 rounded-md border overflow-hidden flex flex-col shadow-sm" style={{ maxHeight: '280px' }}>
                <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
                  <Table className="w-max min-w-full">
                    <TableHeader sticky>
                      <TableRow>
                        <TableHead className="py-2">{t('taskManagement.scope', 'Phạm vi')}</TableHead>
                        <TableHead className="py-2">{t('taskManagement.role', 'Role')}</TableHead>
                        <TableHead className="py-2 w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((r, i) => (
                        <TableRow key={r.id || `${r.projectId}-${r.role}-${i}`}>
                          <TableCell className="py-1.5 text-sm">{getScopeName(r.projectId)}</TableCell>
                          <TableCell className="py-1.5 text-sm">{ROLE_LABELS[r.role] ?? r.role}</TableCell>
                          <TableCell className="py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleRemove(r.projectId, r.role)}
                              disabled={isSubmitting}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant={buttonVariant} onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.close', 'Đóng')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
