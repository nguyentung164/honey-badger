'use client'

import { Folder, Link2, Minus, MoreVertical, Pencil, Plus, RefreshCw, Shield, Square, Trash2, User as UserIcon, UserPlus, Users2, X } from 'lucide-react'
import { IPC } from 'main/constants'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

import type { EVMProject } from 'shared/types/evm'
import type { LinkProjectToolbarApi } from './LinkProjectTabContent'

const AddOrEditUserDialog = lazy(() => import('@/components/dialogs/task/AddOrEditUserDialog').then(m => ({ default: m.AddOrEditUserDialog })))
const EvmProjectInfoDialogLazy = lazy(() =>
  import('@/pages/evm/components/EvmProjectInfoDialog').then(m => ({ default: m.EvmProjectInfoDialog }))
)
const SetPasswordDialog = lazy(() => import('@/components/dialogs/task/SetPasswordDialog').then(m => ({ default: m.SetPasswordDialog })))
const SetRoleDialog = lazy(() => import('@/components/dialogs/task/SetRoleDialog').then(m => ({ default: m.SetRoleDialog })))
const ProjectMembersDialog = lazy(() => import('@/components/dialogs/task/ProjectMembersDialog').then(m => ({ default: m.ProjectMembersDialog })))
const MasterTabContent = lazy(() => import('../taskmanagement/MasterTabContent').then(m => ({ default: m.MasterTabContent })))
const LinkProjectTabContent = lazy(() => import('./LinkProjectTabContent').then(m => ({ default: m.LinkProjectTabContent })))
const CodingRulesTabContent = lazy(() => import('./CodingRulesTabContent').then(m => ({ default: m.CodingRulesTabContent })))

interface User {
  id: string
  userCode: string
  name: string
  email: string
  receiveCommitNotification?: boolean
  createdAt: string
}

function UserRowTooltipContent({ user }: { user: User }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 min-w-[180px] max-w-[480px] text-popover-foreground">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.userCode')}</span>
        <span className="text-popover-foreground font-mono">{user.userCode}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.userName')}</span>
        <span className="text-popover-foreground">{user.name}</span>
        <span className="text-muted-foreground font-medium shrink-0">{t('taskManagement.userEmail')}</span>
        <span className="text-popover-foreground break-words">{user.email || '-'}</span>
      </div>
    </div>
  )
}

type MasterTabId = 'users' | 'projects' | 'master' | 'codingrules'

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

const EVM_PROJECT_CREATE_STUB_MASTER: EVMProject = {
  id: '',
  projectName: '',
  startDate: '',
  endDate: '',
  reportDate: '',
}

export function Master() {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const user = useTaskAuthStore(s => s.user)
  const clearSession = useTaskAuthStore(s => s.clearSession)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<MasterTabId>('users')
  const [isLoading, setIsLoading] = useState(true)

  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string; version?: number }[]>([])
  const [projectMembersMap, setProjectMembersMap] = useState<
    Record<
      string,
      {
        pls: { userId: string; name: string }[]
        devs: { userId: string; name: string }[]
        pms: { userId: string; name: string }[]
        canManagePl?: boolean
        canManagePm?: boolean
        canManageDev?: boolean
      }
    >
  >({})
  const [projectReminderTimeMap, setProjectReminderTimeMap] = useState<Record<string, string | null>>({})

  const [showUserDialog, setShowUserDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editingUserHasPlRole, setEditingUserHasPlRole] = useState(false)
  const [userToSetPassword, setUserToSetPassword] = useState<User | null>(null)
  const [userToSetRole, setUserToSetRole] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)

  const [showEvmProjectInfo, setShowEvmProjectInfo] = useState(false)
  const [evmProjectDialogMode, setEvmProjectDialogMode] = useState<'edit' | 'create'>('edit')
  const [evmProjectForDialog, setEvmProjectForDialog] = useState<EVMProject | null>(null)
  const [projectToManageMembers, setProjectToManageMembers] = useState<{ id: string; name: string } | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string; version?: number } | null>(null)
  const [masterAddTriggerTimestamp, setMasterAddTriggerTimestamp] = useState(0)
  const [rulesAddTriggerTimestamp, setRulesAddTriggerTimestamp] = useState(0)
  const handleMasterAddTriggered = useCallback(() => setMasterAddTriggerTimestamp(0), [])
  const handleRulesAddTriggered = useCallback(() => setRulesAddTriggerTimestamp(0), [])

  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState(25)
  const [projectPage, setProjectPage] = useState(1)
  const [projectPageSize, setProjectPageSize] = useState(25)
  const [linkProjectToolbar, setLinkProjectToolbar] = useState<LinkProjectToolbarApi | null>(null)

  const userTotalPages = Math.max(1, Math.ceil(users.length / userPageSize))
  const paginatedUsers = useMemo(
    () => users.slice((userPage - 1) * userPageSize, userPage * userPageSize),
    [users, userPage, userPageSize]
  )

  const projectTotalPages = Math.max(1, Math.ceil(projects.length / projectPageSize))
  const paginatedProjects = useMemo(
    () => projects.slice((projectPage - 1) * projectPageSize, projectPage * projectPageSize),
    [projects, projectPage, projectPageSize]
  )

  useEffect(() => {
    if (userPage > userTotalPages) setUserPage(1)
  }, [userPage, userTotalPages])

  useEffect(() => {
    if (projectPage > projectTotalPages) setProjectPage(1)
  }, [projectPage, projectTotalPages])

  useEffect(() => {
    setUserPage(1)
  }, [userPageSize])

  useEffect(() => {
    setProjectPage(1)
  }, [projectPageSize])

  const handleWindow = (action: string) => {
    window.api.electron.send(IPC.WINDOW.ACTION, action)
  }

  const loadData = useCallback(async () => {
    const check = await window.api.task.checkTaskApi()
    if (!check.ok) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const [usersRes, projectsRes] = await Promise.all([window.api.user.getUsers(), window.api.task.getProjects()])
      if (usersRes.status === 'error' && (usersRes.code === 'UNAUTHORIZED' || usersRes.code === 'FORBIDDEN')) {
        toast.error(t('taskManagement.tokenExpired'))
        setUsers([])
        clearSession()
        return
      }
      if (usersRes.status === 'success' && usersRes.data) setUsers(usersRes.data)
      else setUsers([])
      if (projectsRes.status === 'success' && projectsRes.data) setProjects(projectsRes.data)
      else setProjects([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [t, clearSession])

  const loadProjectMembers = useCallback(async () => {
    if (projects.length === 0) return
    const results = await Promise.all(
      projects.map(p => window.api.task.getProjectMembers(p.id).then(res => (res.status === 'success' && res.data ? { id: p.id, data: res.data } : null)))
    )
    const map: Record<
      string,
      {
        pls: { userId: string; name: string }[]
        devs: { userId: string; name: string }[]
        pms: { userId: string; name: string }[]
        canManagePl?: boolean
        canManagePm?: boolean
        canManageDev?: boolean
      }
    > = {}
    for (const r of results) {
      if (r) map[r.id] = r.data
    }
    setProjectMembersMap(map)
  }, [projects])

  const loadProjectReminderTimes = useCallback(async () => {
    if (projects.length === 0) return
    const results = await Promise.all(
      projects.map(p => window.api.task.getProjectReminderTime(p.id).then(res => (res.status === 'success' ? { id: p.id, time: res.data ?? null } : null)))
    )
    const map: Record<string, string | null> = {}
    for (const r of results) {
      if (r) map[r.id] = r.time
    }
    setProjectReminderTimeMap(map)
  }, [projects])

  useEffect(() => {
    let cancelled = false
    verifySession().then(loggedIn => {
      if (!cancelled) {
        setIsAuthChecked(true)
        if (loggedIn) loadData()
      }
    })
    return () => {
      cancelled = true
    }
  }, [verifySession, loadData])

  useEffect(() => {
    if (activeTab === 'projects' && projects.length > 0) {
      loadProjectMembers()
      loadProjectReminderTimes()
    }
  }, [activeTab, projects.length, loadProjectMembers, loadProjectReminderTimes])

  useEffect(() => {
    if (editingUser && showUserDialog) {
      window.api.task.hasPlRole(editingUser.id).then(res => {
        if (res.status === 'success' && res.data !== undefined) {
          setEditingUserHasPlRole(res.data)
        } else {
          setEditingUserHasPlRole(false)
        }
      })
    } else {
      setEditingUserHasPlRole(false)
    }
  }, [editingUser?.id, showUserDialog])

  const handleCreateUser = async (input: { userCode: string; name: string; email?: string }) => {
    const res = await window.api.user.createUser(input)
    if (res.status === 'success') {
      toast.success(t('taskManagement.userCreateSuccess'))
      setShowUserDialog(false)
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.userCreateError'))
    }
  }

  const handleUpdateUser = async (id: string, data: { userCode?: string; name?: string; email?: string; receiveCommitNotification?: boolean }) => {
    const res = await window.api.user.updateUser(id, data)
    if (res.status === 'success') {
      toast.success(t('taskManagement.userUpdateSuccess'))
      setShowUserDialog(false)
      setEditingUser(null)
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.userUpdateError'))
    }
  }

  const handleDeleteUser = async (id: string) => {
    const res = await window.api.user.deleteUser(id)
    if (res.status === 'success') {
      toast.success(t('taskManagement.userDeleteSuccess'))
      setUserToDelete(null)
      setUserToSetPassword(prev => (prev?.id === id ? null : prev))
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.userDeleteError'))
    }
  }

  const openEvmProjectCreate = useCallback(() => {
    setEvmProjectForDialog(null)
    setEvmProjectDialogMode('create')
    setShowEvmProjectInfo(true)
  }, [])

  const openEvmProjectEdit = useCallback(async (proj: { id: string; name: string; version?: number }) => {
    try {
      const res = await window.api.evm.ensureProjectForEvm(proj.id)
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? t('taskManagement.updateError'))
        return
      }
      setEvmProjectForDialog(res.data as EVMProject)
      setEvmProjectDialogMode('edit')
      setShowEvmProjectInfo(true)
    } catch {
      toast.error(t('taskManagement.updateError'))
    }
  }, [t])

  const handleMasterEvmPersistSuccess = useCallback(async () => {
    await loadData()
    await loadProjectReminderTimes()
  }, [loadData, loadProjectReminderTimes])

  const handleDeleteProject = async (id: string, version?: number) => {
    const res = await window.api.task.deleteProject(id, version)
    if (res.status === 'success') {
      toast.success(t('taskManagement.projectDeleteSuccess'))
      setProjectToDelete(null)
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.projectDeleteError'))
    }
  }

  if (!isAuthChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <GlowLoader className="w-10 h-10" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as MasterTabId)} className="flex-1 flex flex-col min-h-0">
        <div
          className="flex items-center justify-between h-8 text-sm select-none shrink-0 pl-2"
          style={
            {
              WebkitAppRegion: 'drag',
              backgroundColor: 'var(--main-bg)',
              color: 'var(--main-fg)',
            } as React.CSSProperties
          }
        >
          <div className="flex items-center h-full gap-3 flex-1 min-w-0">
            <div className="w-15 h-6 flex justify-center pt-1.5 pl-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
            </div>
            <TabsList className="h-6! p-0.5 rounded-md shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <TabsTrigger value="users" className="h-5 px-2 text-xs data-[state=active]:shadow-none" onClick={() => setActiveTab('users')}>
                {t('taskManagement.tabUsers')}
              </TabsTrigger>
              <TabsTrigger value="projects" className="h-5 px-2 text-xs data-[state=active]:shadow-none" onClick={() => setActiveTab('projects')}>
                {t('taskManagement.tabProjects')}
              </TabsTrigger>
              <TabsTrigger value="master" className="h-5 px-2 text-xs data-[state=active]:shadow-none" onClick={() => setActiveTab('master')}>
                {t('taskManagement.tabMaster')}
              </TabsTrigger>
              <TabsTrigger value="codingrules" className="h-5 px-2 text-xs data-[state=active]:shadow-none" onClick={() => setActiveTab('codingrules')}>
                {t('settings.tab.rules')}
              </TabsTrigger>
            </TabsList>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="icon"
                  onClick={loadData}
                  disabled={isLoading}
                  className="shadow-none h-6 w-6 shrink-0"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.refresh')}</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-0.5 ml-auto shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {activeTab === 'projects' && linkProjectToolbar ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="link"
                        size="icon"
                        onClick={() => linkProjectToolbar.openFoldersByProject()}
                        disabled={linkProjectToolbar.loading}
                        className="relative shadow-none h-6 w-6 shrink-0 overflow-visible text-[var(--main-fg)] hover:text-[var(--main-fg)]"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      >
                        <Folder className="h-3.5 w-3.5" />
                        {linkProjectToolbar.projectLinkedCount > 0 ? (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary/40 px-0.5 text-[9px] font-semibold leading-none tabular-nums">
                            {linkProjectToolbar.projectLinkedCount > 99 ? '99+' : linkProjectToolbar.projectLinkedCount}
                          </span>
                        ) : null}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('settings.versioncontrol.foldersByProject', 'Source Folders theo Project')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="link"
                        size="icon"
                        onClick={() => linkProjectToolbar.openUnlinked()}
                        disabled={linkProjectToolbar.loading}
                        className="shadow-none relative h-6 w-6 shrink-0 overflow-visible text-[var(--main-fg)] hover:text-[var(--main-fg)]"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {linkProjectToolbar.unlinkedCount > 0 ? (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-semibold leading-none text-white tabular-nums">
                            {linkProjectToolbar.unlinkedCount > 9 ? '9+' : linkProjectToolbar.unlinkedCount}
                          </span>
                        ) : null}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('settings.versioncontrol.unlinkedFolders', 'Source Folders chưa liên kết project')}</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
              {(activeTab === 'users' && user?.role === 'admin') || activeTab === 'projects' || activeTab === 'master' || activeTab === 'codingrules' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="link"
                      size="sm"
                      className="shadow-none h-6 px-2 text-xs gap-1"
                      onClick={() => {
                        if (activeTab === 'users') {
                          setEditingUser(null)
                          setShowUserDialog(true)
                        } else if (activeTab === 'projects') {
                          openEvmProjectCreate()
                        } else if (activeTab === 'master') {
                          setMasterAddTriggerTimestamp(Date.now())
                        } else if (activeTab === 'codingrules') {
                          setRulesAddTriggerTimestamp(Date.now())
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      {t('common.add')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.add')}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button type="button" onClick={() => handleWindow('minimize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
              <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
            </button>
            <button type="button" onClick={() => handleWindow('maximize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
              <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
            </button>
            <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
              <X size={20} strokeWidth={1} absoluteStrokeWidth />
            </button>
          </div>
        </div>

        {userToSetPassword && (
          <Suspense fallback={null}>
            <SetPasswordDialog
              open={!!userToSetPassword}
              onOpenChange={open => !open && setUserToSetPassword(null)}
              userId={userToSetPassword.id}
              userName={userToSetPassword.name}
            />
          </Suspense>
        )}
        {userToSetRole && (
          <Suspense fallback={null}>
            <SetRoleDialog
              open={!!userToSetRole}
              onOpenChange={open => !open && setUserToSetRole(null)}
              userId={userToSetRole.id}
              userName={userToSetRole.name}
              onSuccess={loadData}
            />
          </Suspense>
        )}
        {projectToManageMembers && (
          <Suspense fallback={null}>
            <ProjectMembersDialog
              open={!!projectToManageMembers}
              onOpenChange={open => !open && setProjectToManageMembers(null)}
              projectId={projectToManageMembers.id}
              projectName={projectToManageMembers.name}
              users={users}
              onSuccess={loadProjectMembers}
              canManagePl={user?.role === 'admin' || (projectMembersMap[projectToManageMembers.id]?.canManagePl ?? false)}
              canManagePm={user?.role === 'admin' || (projectMembersMap[projectToManageMembers.id]?.canManagePm ?? false)}
              canManageDev={user?.role === 'admin' || (projectMembersMap[projectToManageMembers.id]?.canManageDev ?? false)}
            />
          </Suspense>
        )}
        <AlertDialog open={userToDelete !== null} onOpenChange={open => !open && setUserToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('taskManagement.deleteUserConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {userToDelete && (
                  <>
                    {t('taskManagement.deleteUserConfirmDescription')}
                    <span className="mt-2 block font-medium text-foreground">
                      {t('taskManagement.userCode')}: {userToDelete.userCode} — {t('taskManagement.userName')}: {userToDelete.name}
                    </span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => userToDelete && handleDeleteUser(userToDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('taskManagement.deleteUser')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={projectToDelete !== null} onOpenChange={open => !open && setProjectToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('taskManagement.deleteProjectConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {projectToDelete && (
                  <>
                    {t('taskManagement.deleteProjectConfirmDescription')}
                    <span className="mt-2 block font-medium text-foreground">{projectToDelete.name}</span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => projectToDelete && handleDeleteProject(projectToDelete.id, projectToDelete.version)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {showUserDialog && (
          <Suspense fallback={null}>
            <AddOrEditUserDialog
              open={showUserDialog}
              onOpenChange={open => {
                setShowUserDialog(open)
                if (!open) setEditingUser(null)
              }}
              user={editingUser}
              hasPlRole={editingUserHasPlRole}
              onSubmit={editingUser ? data => handleUpdateUser(editingUser.id, data) : handleCreateUser}
            />
          </Suspense>
        )}
        {showEvmProjectInfo && (
          <Suspense fallback={null}>
            <EvmProjectInfoDialogLazy
              open={showEvmProjectInfo}
              onOpenChange={open => {
                setShowEvmProjectInfo(open)
                if (!open) setEvmProjectForDialog(null)
              }}
              project={evmProjectDialogMode === 'create' ? EVM_PROJECT_CREATE_STUB_MASTER : (evmProjectForDialog ?? EVM_PROJECT_CREATE_STUB_MASTER)}
              mode={evmProjectDialogMode}
              useStore={false}
              canEditReminder={
                evmProjectDialogMode === 'edit' && !!evmProjectForDialog?.id
                  ? user?.role === 'admin' ||
                    !!projectMembersMap[evmProjectForDialog.id]?.canManagePl ||
                    !!projectMembersMap[evmProjectForDialog.id]?.canManagePm ||
                    !!projectMembersMap[evmProjectForDialog.id]?.canManageDev
                  : false
              }
              onStandalonePersistSuccess={handleMasterEvmPersistSuccess}
            />
          </Suspense>
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center min-h-0">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : (
          <>
            <TabsContent value="users" className="flex-1 flex flex-col min-h-0 mt-0">
              <div className="flex-1 flex flex-col min-h-0 p-3">
                {users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                    <p>{t('taskManagement.noUsers')}</p>
                    {user?.role === 'admin' && (
                      <Button
                        variant={buttonVariant}
                        size="sm"
                        onClick={() => {
                          setEditingUser(null)
                          setShowUserDialog(true)
                        }}
                        className="mt-2"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        {t('taskManagement.addUser')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
                    <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
                      <Table className="w-max min-w-full">
                        <TableHeader sticky>
                          <TableRow>
                            <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.userCode')}</TableHead>
                            <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.userName')}</TableHead>
                            <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.userEmail')}</TableHead>
                            <TableHead className="!text-[var(--table-header-fg)] w-24 text-center">{t('taskManagement.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedUsers.map(u => (
                            <Tooltip key={u.id} delayDuration={300}>
                              <TooltipTrigger asChild>
                                <TableRow>
                                  <TableCell className="font-medium">{u.userCode}</TableCell>
                                  <TableCell className="font-medium">{u.name}</TableCell>
                                  <TableCell className="text-muted-foreground">{u.email || '-'}</TableCell>
                                  <TableCell className="text-center">
                                    {user?.role === 'admin' ? (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7">
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[180px]">
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setEditingUser(u)
                                              setShowUserDialog(true)
                                            }}
                                          >
                                            <Pencil className="h-4 w-4" />
                                            {t('common.edit')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => setUserToSetPassword(u)}>
                                            <UserIcon className="h-4 w-4" />
                                            {t('taskManagement.changePassword')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => setUserToSetRole(u)}>
                                            <Shield className="h-4 w-4" />
                                            {t('taskManagement.setRole', 'Gán quyền')}
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem variant="destructive" onClick={() => setUserToDelete(u)}>
                                            <Trash2 className="h-4 w-4" />
                                            {t('common.delete')}
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              </TooltipTrigger>
                              <TooltipContent side="top" sideOffset={2} className="max-w-[480px] p-3 shadow-lg">
                                <UserRowTooltipContent user={u} />
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <TablePaginationBar
                      page={userPage}
                      totalPages={userTotalPages}
                      totalItems={users.length}
                      pageSize={userPageSize}
                      onPageChange={setUserPage}
                      onPageSizeChange={setUserPageSize}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="projects" className="flex-1 flex flex-col min-h-0 mt-0">
              <div className="flex flex-1 flex-col min-h-0 gap-3 p-3">
                <Suspense fallback={null}>
                  <LinkProjectTabContent onToolbarReady={setLinkProjectToolbar} />
                </Suspense>
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  {projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground py-12">
                      <p>{t('taskManagement.noProjects', 'No projects yet.')}</p>
                      <Button
                        variant={buttonVariant}
                        size="sm"
                        onClick={() => openEvmProjectCreate()}
                        className="mt-2"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('taskManagement.addProject')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
                      <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
                        <Table className="w-max min-w-full">
                          <TableHeader sticky>
                            <TableRow>
                              <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.project')}</TableHead>
                              <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.rolePm', 'PMs')}</TableHead>
                              <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.projectLeadPlural', 'PLs')}</TableHead>
                              <TableHead className="!text-[var(--table-header-fg)]">{t('taskManagement.devs', 'Devs')}</TableHead>
                              <TableHead className="!text-[var(--table-header-fg)] w-28">{t('taskManagement.dailyReportReminderTime')}</TableHead>
                              <TableHead className="!text-[var(--table-header-fg)] w-24 text-center">{t('taskManagement.actions')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedProjects.map(proj => {
                              const members = projectMembersMap[proj.id]
                              const plNames = members?.pls?.map(p => p.name).join(', ') ?? '-'
                              const pmNames = members?.pms?.map(p => p.name).join(', ') ?? '-'
                              const devNames = members?.devs?.map(d => d.name).join(', ') ?? '-'
                              return (
                                <TableRow key={proj.id}>
                                  <TableCell className="font-medium">{proj.name}</TableCell>
                                  <TableCell className="text-muted-foreground text-sm max-w-[120px] truncate" title={pmNames}>
                                    {pmNames}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm max-w-[120px] truncate" title={plNames}>
                                    {plNames}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm max-w-[120px] truncate" title={devNames}>
                                    {devNames}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <span className="text-muted-foreground">{projectReminderTimeMap[proj.id] ?? '-'}</span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="min-w-[160px]">
                                        <DropdownMenuItem
                                          onClick={() => {
                                            void openEvmProjectEdit(proj)
                                          }}
                                        >
                                          <Pencil className="h-4 w-4" />
                                          {t('common.edit')}
                                        </DropdownMenuItem>
                                        {(user?.role === 'admin' ||
                                          projectMembersMap[proj.id]?.canManagePl ||
                                          projectMembersMap[proj.id]?.canManagePm ||
                                          projectMembersMap[proj.id]?.canManageDev) && (
                                            <DropdownMenuItem onClick={() => setProjectToManageMembers({ id: proj.id, name: proj.name })}>
                                              <Users2 className="h-4 w-4" />
                                              {t('taskManagement.manageMembers', 'Quản lý thành viên')}
                                            </DropdownMenuItem>
                                          )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem variant="destructive" onClick={() => setProjectToDelete(proj)}>
                                          <Trash2 className="h-4 w-4" />
                                          {t('common.delete')}
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <TablePaginationBar
                        page={projectPage}
                        totalPages={projectTotalPages}
                        totalItems={projects.length}
                        pageSize={projectPageSize}
                        onPageChange={setProjectPage}
                        onPageSizeChange={setProjectPageSize}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                      />
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="master" className="flex-1 flex flex-col min-h-0 mt-0 p-3">
              <Suspense fallback={null}>
                <div className="flex flex-1 flex-col min-h-0">
                  <MasterTabContent onMasterChange={loadData} triggerAddTimestamp={masterAddTriggerTimestamp} onAddTriggered={handleMasterAddTriggered} />
                </div>
              </Suspense>
            </TabsContent>

            <TabsContent value="codingrules" className="flex-1 flex flex-col min-h-0 mt-0 p-3">
              <Suspense fallback={null}>
                <div className="flex flex-1 flex-col min-h-0">
                  <CodingRulesTabContent triggerAddTimestamp={rulesAddTriggerTimestamp} onAddTriggered={handleRulesAddTriggered} />
                </div>
              </Suspense>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
