'use client'

import { Search, Trash2, User, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

interface ProjectMember {
  userId: string
  name: string
  userCode: string
}

interface ProjectMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  users: { id: string; name: string; userCode: string }[]
  onSuccess?: () => void
  /** Dùng từ API getProjectMembers (canManagePl/Pm/Dev). Nếu không truyền thì lấy từ response khi fetch. */
  canManagePl?: boolean
  canManagePm?: boolean
  canManageDev?: boolean
}

export function ProjectMembersDialog({ open, onOpenChange, projectId, projectName, users, onSuccess, canManagePl: canManagePlProp, canManagePm: canManagePmProp, canManageDev: canManageDevProp }: ProjectMembersDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const token = useTaskAuthStore(s => s.token)
  const currentUser = useTaskAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin'
  const [pls, setPls] = useState<ProjectMember[]>([])
  const [devs, setDevs] = useState<ProjectMember[]>([])
  const [pms, setPms] = useState<ProjectMember[]>([])
  const [selectedPlIds, setSelectedPlIds] = useState<Set<string>>(new Set())
  const [selectedDevIds, setSelectedDevIds] = useState<Set<string>>(new Set())
  const [selectedPmIds, setSelectedPmIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [canManagePl, setCanManagePl] = useState(false)
  const [canManagePm, setCanManagePm] = useState(false)
  const [canManageDev, setCanManageDev] = useState(false)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string | null>>({})

  const resolveAvatarSrc = (userId: string) =>
    userId === currentUser?.id ? (currentUser?.avatarUrl ?? avatarUrls[userId] ?? null) : (avatarUrls[userId] ?? null)

  useEffect(() => {
    if (!open) {
      setAvatarUrls({})
      return
    }
    if (isLoading) return
    const ids = new Set<string>()
    for (const u of users) ids.add(u.id)
    for (const m of pls) ids.add(m.userId)
    for (const m of devs) ids.add(m.userId)
    for (const m of pms) ids.add(m.userId)
    for (const id of ids) {
      window.api.user.getAvatarUrl(id).then(url => {
        setAvatarUrls(prev => ({ ...prev, [id]: url }))
      })
    }
  }, [open, isLoading, users, pls, devs, pms])

  useEffect(() => {
    if (open && projectId) {
      setIsLoading(true)
      window.api.task
        .getProjectMembers(projectId)
        .then(res => {
          if (res.status === 'success' && res.data) {
            setPls(res.data.pls ?? [])
            setDevs(res.data.devs ?? [])
            setPms(res.data.pms ?? [])
            setCanManagePl(isAdmin || canManagePlProp || (res.data.canManagePl ?? false))
            setCanManagePm(isAdmin || canManagePmProp || (res.data.canManagePm ?? false))
            setCanManageDev(isAdmin || canManageDevProp || (res.data.canManageDev ?? false))
          } else {
            setPls([])
            setDevs([])
            setPms([])
            setCanManagePl(isAdmin || (canManagePlProp ?? false))
            setCanManagePm(isAdmin || (canManagePmProp ?? false))
            setCanManageDev(isAdmin || (canManageDevProp ?? false))
          }
        })
        .finally(() => setIsLoading(false))
    } else {
      setPls([])
      setDevs([])
      setPms([])
      setSelectedPlIds(new Set())
      setSelectedDevIds(new Set())
      setSelectedPmIds(new Set())
      setColumnFilters({})
    }
  }, [open, projectId, isAdmin, canManagePlProp, canManagePmProp, canManageDevProp])

  useEffect(() => {
    if (open && isAdmin) {
      setCanManagePl(true)
      setCanManagePm(true)
      setCanManageDev(true)
    }
  }, [open, isAdmin])

  const togglePl = (userId: string) => {
    setSelectedPlIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleDev = (userId: string) => {
    setSelectedDevIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const togglePm = (userId: string) => {
    setSelectedPmIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleAddPl = async () => {
    if (!token || selectedPlIds.size === 0) return
    setIsSubmitting(true)
    try {
      for (const uid of selectedPlIds) {
        const res = await window.api.user.setUserProjectRole(token, uid, projectId, 'pl')
        if (res.status === 'success') {
          const u = users.find(x => x.id === uid)
          if (u) setPls(prev => [...prev, { userId: u.id, name: u.name, userCode: u.userCode }])
        } else {
          toast.error(res.message || 'Thêm PL thất bại')
          break
        }
      }
      setSelectedPlIds(new Set())
      onSuccess?.()
      toast.success(t('taskManagement.membersUpdated', 'Đã cập nhật thành viên'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddDev = async () => {
    if (!token || selectedDevIds.size === 0) return
    setIsSubmitting(true)
    try {
      for (const uid of selectedDevIds) {
        const res = await window.api.user.setUserProjectRole(token, uid, projectId, 'dev')
        if (res.status === 'success') {
          const u = users.find(x => x.id === uid)
          if (u) setDevs(prev => [...prev, { userId: u.id, name: u.name, userCode: u.userCode }])
        } else {
          toast.error(res.message || 'Thêm Dev thất bại')
          break
        }
      }
      setSelectedDevIds(new Set())
      onSuccess?.()
      toast.success(t('taskManagement.membersUpdated', 'Đã cập nhật thành viên'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemovePl = async (userId: string) => {
    if (!token) return
    setIsSubmitting(true)
    try {
      const res = await window.api.user.removeUserProjectRole(token, userId, projectId, 'pl')
      if (res.status === 'success') {
        setPls(prev => prev.filter(m => m.userId !== userId))
        onSuccess?.()
        toast.success(t('taskManagement.roleRemovedSuccess', 'Đã xóa role'))
      } else {
        toast.error(res.message || 'Xóa PL thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveDev = async (userId: string) => {
    if (!token) return
    setIsSubmitting(true)
    try {
      const res = await window.api.user.removeUserProjectRole(token, userId, projectId, 'dev')
      if (res.status === 'success') {
        setDevs(prev => prev.filter(m => m.userId !== userId))
        onSuccess?.()
        toast.success(t('taskManagement.roleRemovedSuccess', 'Đã xóa role'))
      } else {
        toast.error(res.message || 'Xóa Dev thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddPm = async () => {
    if (!token || selectedPmIds.size === 0) return
    setIsSubmitting(true)
    try {
      for (const uid of selectedPmIds) {
        const res = await window.api.user.setUserProjectRole(token, uid, projectId, 'pm')
        if (res.status === 'success') {
          const u = users.find(x => x.id === uid)
          if (u) setPms(prev => [...prev, { userId: u.id, name: u.name, userCode: u.userCode }])
        } else {
          toast.error(res.message || 'Thêm PM thất bại')
          break
        }
      }
      setSelectedPmIds(new Set())
      onSuccess?.()
      toast.success(t('taskManagement.membersUpdated', 'Đã cập nhật thành viên'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemovePm = async (userId: string) => {
    if (!token) return
    setIsSubmitting(true)
    try {
      const res = await window.api.user.removeUserProjectRole(token, userId, projectId, 'pm')
      if (res.status === 'success') {
        setPms(prev => prev.filter(m => m.userId !== userId))
        onSuccess?.()
        toast.success(t('taskManagement.roleRemovedSuccess', 'Đã xóa role'))
      } else {
        toast.error(res.message || 'Xóa PM thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  const availableForPl = users.filter(u => !pls.some(p => p.userId === u.id))
  const availableForDev = users.filter(u => !devs.some(d => d.userId === u.id))
  const availableForPm = users.filter(u => !pms.some(p => p.userId === u.id))

  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .map(s => s[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const matchSearch = (q: string, name: string, userCode: string) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return name.toLowerCase().includes(s) || userCode.toLowerCase().includes(s)
  }

  const renderRoleColumn = (
    columnKey: string,
    title: string,
    members: ProjectMember[],
    availableUsers: { id: string; name: string; userCode: string }[],
    selectedIds: Set<string>,
    toggle: (id: string) => void,
    onAdd: () => void,
    onRemove: (id: string) => void,
    canManage: boolean,
    addLabel: string,
    accentColor: string
  ) => {
    const currentFilter = columnFilters[`${columnKey}-current`] ?? ''
    const availableFilter = columnFilters[`${columnKey}-available`] ?? ''
    const filteredMembers = members.filter(m => matchSearch(currentFilter, m.name, m.userCode))
    const filteredAvailable = availableUsers.filter(u => matchSearch(availableFilter, u.name, u.userCode))

    return (
      <div className="flex flex-col min-w-0 flex-1 rounded-xl border-0 bg-muted/40 text-card-foreground shadow-sm overflow-hidden min-h-[400px]">
        <div className={`px-4 py-2.5 border-b shrink-0 ${accentColor}`}>
          <Label className="font-semibold text-sm">{title}</Label>
        </div>
        <div className="flex flex-col flex-1 min-h-0 p-3 gap-3 overflow-hidden">
          {/* Danh sách đã chọn */}
          <div className="flex flex-col gap-1.5 min-h-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
              <User className="h-3.5 w-3.5" />
              {t('taskManagement.currentMembers', 'Thành viên hiện tại')} ({filteredMembers.length}{members.length !== filteredMembers.length ? `/${members.length}` : ''})
            </div>
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t('common.search', 'Tìm kiếm...')}
                value={currentFilter}
                onChange={e => setColumnFilters(prev => ({ ...prev, [`${columnKey}-current`]: e.target.value }))}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <ScrollArea className="h-[170px] rounded-lg border bg-muted/30 overflow-y-auto!">
              <div className="p-2 space-y-1">
                {filteredMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <User className="h-8 w-8 opacity-40 mb-1" />
                    <span className="text-xs">
                      {members.length === 0 ? t('taskManagement.noMembers', 'Chưa có') : t('taskManagement.noSearchResults', 'Không tìm thấy')}
                    </span>
                  </div>
                ) : (
                  filteredMembers.map(m => {
                    const memberAvatarSrc = resolveAvatarSrc(m.userId)
                    return (
                      <div
                        key={m.userId}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-background hover:bg-muted/50 transition-colors group"
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          {memberAvatarSrc ? (
                            <AvatarImage src={memberAvatarSrc} alt={m.name} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{getInitials(m.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.userCode}</div>
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onRemove(m.userId)}
                            disabled={isSubmitting}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Danh sách chưa chọn - thêm vào */}
          {canManage && (
            <div className="flex flex-col gap-1.5 min-h-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
                <UserPlus className="h-3.5 w-3.5" />
                {t('taskManagement.availableToAdd', 'Chưa có - thêm vào')} ({filteredAvailable.length}{availableUsers.length !== filteredAvailable.length ? `/${availableUsers.length}` : ''})
              </div>
              {availableUsers.length === 0 ? (
                <div className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground shrink-0">
                  {t('taskManagement.allMembersAdded', 'Đã thêm hết')}
                </div>
              ) : (
                <>
                  <div className="relative shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={t('common.search', 'Tìm kiếm...')}
                      value={availableFilter}
                      onChange={e => setColumnFilters(prev => ({ ...prev, [`${columnKey}-available`]: e.target.value }))}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <ScrollArea className="h-[170px] rounded-lg border bg-muted/20 overflow-y-auto!">
                    <div className="p-2 space-y-1">
                      {filteredAvailable.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                          <UserPlus className="h-8 w-8 opacity-40 mb-1" />
                          <span className="text-xs">{t('taskManagement.noSearchResults', 'Không tìm thấy')}</span>
                        </div>
                      ) : (
                        filteredAvailable.map(u => {
                          const isSelected = selectedIds.has(u.id)
                          const availAvatarSrc = resolveAvatarSrc(u.id)
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggle(u.id)}
                              disabled={isSubmitting}
                              className={cn(
                                'flex w-full cursor-pointer items-center gap-2 rounded-md border-0 px-2 py-1.5 text-left text-inherit transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                isSelected ? 'bg-primary/15' : 'bg-background hover:bg-muted/50',
                                isSubmitting && 'pointer-events-none opacity-60'
                              )}
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                {availAvatarSrc ? (
                                  <AvatarImage src={availAvatarSrc} alt={u.name} className="object-cover" />
                                ) : null}
                                <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">{getInitials(u.name)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{u.name}</div>
                                <div className="text-xs text-muted-foreground">{u.userCode}</div>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </ScrollArea>
                  <Button variant={buttonVariant} size="sm" onClick={onAdd} disabled={isSubmitting || selectedIds.size === 0} className="w-full shrink-0">
                    {addLabel}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl! max-h-[90vh]! flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t('taskManagement.manageProjectMembers', 'Quản lý thành viên')} - {projectName}
          </DialogTitle>
          <DialogDescription>{t('taskManagement.manageProjectMembersDescription', 'Thêm/xóa PL, PM và Dev cho dự án.')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-auto! h-full">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading', 'Đang tải...')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 min-h-[500px]!">
              {renderRoleColumn(
                'pm',
                t('taskManagement.rolePm', 'PM (Project Manager)'),
                pms,
                availableForPm,
                selectedPmIds,
                togglePm,
                handleAddPm,
                handleRemovePm,
                canManagePm,
                `${t('taskManagement.add', 'Thêm')} PM`,
                'bg-amber-500/10 border-amber-500/20'
              )}
              {renderRoleColumn(
                'pl',
                t('taskManagement.projectLeadPlural', 'PL (Project Lead)'),
                pls,
                availableForPl,
                selectedPlIds,
                togglePl,
                handleAddPl,
                handleRemovePl,
                canManagePl,
                `${t('taskManagement.add', 'Thêm')} PL`,
                'bg-blue-500/10 border-blue-500/20'
              )}
              {renderRoleColumn(
                'dev',
                t('taskManagement.devs', 'Dev'),
                devs,
                availableForDev,
                selectedDevIds,
                toggleDev,
                handleAddDev,
                handleRemoveDev,
                canManageDev,
                `${t('taskManagement.add', 'Thêm')} Dev`,
                'bg-emerald-500/10 border-emerald-500/20'
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
