'use client'

import {
  Download,
  Folder,
  FolderGit2,
  GitBranch,
  Key,
  LayoutGrid,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  User,
} from 'lucide-react'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCloneDialog } from '@/components/dialogs/git/GitCloneDialog'
import { GitInitDialog } from '@/components/dialogs/git/GitInitDialog'
import { UnlinkedFoldersDialog } from '@/components/dialogs/vcs/UnlinkedFoldersDialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VersionControlInfo } from '@/components/ui/VersionControlInfo'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import type { ConfigFieldKey } from '../../../stores/useConfigurationStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'
import { useSourceFolderStore } from '../../../stores/useSourceFolderStore'
import { useTaskAuthStore } from '../../../stores/useTaskAuthStore'
import { AddOrEditSourceFolderDialog } from './AddOrEditSourceFolderDialog'
import { FoldersByProjectDialog } from './FoldersByProjectDialog'
import { GitHooksSection } from './GitHooksSection'
import { VcsGitConfigDialog } from './VcsGitConfigDialog'
import { VcsGitStoredCredentialsDialog } from './VcsGitStoredCredentialsDialog'
import { VcsSvnCredentialsDialog } from './VcsSvnCredentialsDialog'
import { VersionControlInfoDialog } from './VersionControlInfoDialog'

export interface VersionControlTabContentProps {
  configDirty: boolean
  configDirtyTab: 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null
  onSetConfigDeferred: (key: ConfigFieldKey, value: string | boolean | string[]) => void
  onSave: (silent?: boolean) => void
  sourceFolder?: string
  versionControlSystem?: 'svn' | 'git'
  autoRefreshEnabled?: boolean
  multiRepoEnabled?: boolean
  sourceFolderDialogOpen: boolean
  setSourceFolderDialogOpen: (v: boolean) => void
  editSourceFolderDialogOpen: boolean
  setEditSourceFolderDialogOpen: (v: boolean) => void
  sourceFolderName: string
  setSourceFolderName: (v: string) => void
  sourceFolderPath: string
  setSourceFolderPath: (v: string) => void
  onAddSourceFolder: () => undefined | Promise<{ folder: { name: string; path: string } } | undefined>
  onUpdateSourceFolder: (projectId: string, options?: { oldPath?: string; oldProjectId?: string }) => void | Promise<void>
  onDeleteSourceFolder: (name: string) => void
  isSourceFolderActionLoading?: boolean
  draftProjectId: string | null
  setDraftProjectId: (id: string | null) => void
}

export const VersionControlTabContent = memo(function VersionControlTabContent({
  configDirty,
  configDirtyTab,
  onSetConfigDeferred,
  onSave,
  sourceFolderDialogOpen,
  setSourceFolderDialogOpen,
  editSourceFolderDialogOpen,
  setEditSourceFolderDialogOpen,
  sourceFolderName,
  setSourceFolderName,
  sourceFolderPath,
  setSourceFolderPath,
  onAddSourceFolder,
  onUpdateSourceFolder,
  onDeleteSourceFolder,
  isSourceFolderActionLoading = false,
  sourceFolder: sourceFolderProp,
  versionControlSystem: versionControlSystemProp,
  autoRefreshEnabled: autoRefreshEnabledProp,
  multiRepoEnabled: multiRepoEnabledProp,
  draftProjectId,
  setDraftProjectId,
}: VersionControlTabContentProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const sourceFolderFromStore = useConfigurationStore(s => s.sourceFolder)
  const versionControlSystemFromStore = useConfigurationStore(s => s.versionControlSystem)
  const autoRefreshEnabledFromStore = useConfigurationStore(s => s.autoRefreshEnabled)
  const multiRepoEnabledFromStore = useConfigurationStore(s => s.multiRepoEnabled)
  const sourceFolder = sourceFolderProp !== undefined ? sourceFolderProp : sourceFolderFromStore
  const versionControlSystem = versionControlSystemProp !== undefined ? versionControlSystemProp : versionControlSystemFromStore
  const autoRefreshEnabled = autoRefreshEnabledProp !== undefined ? autoRefreshEnabledProp : autoRefreshEnabledFromStore
  const multiRepoEnabled = multiRepoEnabledProp !== undefined ? multiRepoEnabledProp : multiRepoEnabledFromStore
  const user = useTaskAuthStore(s => s.user)
  const isLoggedIn = !!user
  const effectiveMultiRepo = multiRepoEnabled && isLoggedIn
  /** Git / detection: multi-repo nhưng chưa chọn project — không dùng sourceFolder single còn trong config. */
  const versionControlInfoFolder =
    versionControlSystem === 'git' && effectiveMultiRepo && !draftProjectId?.trim() ? '' : sourceFolder || ''
  const sourceFolderList = useSourceFolderStore(s => s.sourceFolderList)
  const loadSourceFolderConfig = useSourceFolderStore(s => s.loadSourceFolderConfig)
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  const isVersionControlTabDirty = configDirty && configDirtyTab === 'versioncontrol'
  const [projectId, setProjectId] = useState('')
  const [showGitCloneDialog, setShowGitCloneDialog] = useState(false)
  const [showGitInitDialog, setShowGitInitDialog] = useState(false)
  const [showVersionControlInfoDialog, setShowVersionControlInfoDialog] = useState(false)
  const [editingLinkOldPath, setEditingLinkOldPath] = useState<string | null>(null)
  const [editingLinkOldProjectId, setEditingLinkOldProjectId] = useState<string | null>(null)
  const [vcsSvnCredsDialogOpen, setVcsSvnCredsDialogOpen] = useState(false)
  const [vcsGitConfigDialogOpen, setVcsGitConfigDialogOpen] = useState(false)
  const [vcsGitCredsDialogOpen, setVcsGitCredsDialogOpen] = useState(false)
  const [isOpeningEditDialog, setIsOpeningEditDialog] = useState(false)
  const [linkMappings, setLinkMappings] = useState<{ projectId: string; sourceFolderPath: string }[]>([])
  const [foldersByProjectDialogOpen, setFoldersByProjectDialogOpen] = useState(false)
  const [unlinkedDialogOpen, setUnlinkedDialogOpen] = useState(false)

  const loadLinkMappings = useCallback(async () => {
    const res = await window.api.task.getUserProjectSourceFolderMappings()
    if (res.status === 'success' && res.data) setLinkMappings(res.data)
    else setLinkMappings([])
  }, [])

  useEffect(() => {
    if (!effectiveMultiRepo || versionControlSystem !== 'git') {
      setProjectList([])
      return
    }
    let cancelled = false
    setProjectsLoading(true)
    window.api.task
      .getProjectsForUser()
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && Array.isArray(res.data)) {
          setProjectList(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
        } else {
          setProjectList([])
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [effectiveMultiRepo, versionControlSystem])

  useEffect(() => {
    if (foldersByProjectDialogOpen && effectiveMultiRepo && versionControlSystem === 'git') {
      loadLinkMappings()
    }
  }, [foldersByProjectDialogOpen, effectiveMultiRepo, versionControlSystem, loadLinkMappings])

  const handleEditFolderFromDialog = useCallback((folder: { name: string; path: string }, projectIdFromFolder: string) => {
    setSourceFolderName(folder.name)
    setSourceFolderPath(folder.path)
    setProjectId(projectIdFromFolder)
    setEditingLinkOldPath(folder.path)
    setEditingLinkOldProjectId(projectIdFromFolder)
    setEditSourceFolderDialogOpen(true)
  }, [])

  const handleOpenFoldersByProject = useCallback(() => {
    loadLinkMappings()
    setFoldersByProjectDialogOpen(true)
  }, [loadLinkMappings])

  const handleUnlinkFolder = useCallback(
    async (path: string) => {
      const res = await window.api.task.deleteUserProjectSourceFolder(path)
      if (res.status === 'success') {
        await loadLinkMappings()
        window.dispatchEvent(new CustomEvent('multi-repo-links-changed'))
      }
    },
    [loadLinkMappings]
  )

  const handleOpenAddDialog = useCallback(() => {
    setProjectId('')
    setSourceFolderName('')
    setSourceFolderPath('')
    setSourceFolderDialogOpen(true)
  }, [])

  const handleAddSourceFolder = useCallback(async () => {
    await onAddSourceFolder()
  }, [onAddSourceFolder])

  const handleOpenEditDialog = useCallback(async () => {
    const folder = sourceFolderList.find(f => f.path === sourceFolder)
    if (!folder) return
    setIsOpeningEditDialog(true)
    try {
      setSourceFolderName(folder.name)
      setSourceFolderPath(folder.path)
      const projRes = await window.api.task.getProjectIdByUserAndPath(folder.path)
      const linkedProjectId = projRes.status === 'success' && projRes.data ? projRes.data : ''
      setProjectId(linkedProjectId)
      setEditingLinkOldPath(folder.path)
      setEditingLinkOldProjectId(linkedProjectId || null)
      setEditSourceFolderDialogOpen(true)
    } finally {
      setIsOpeningEditDialog(false)
    }
  }, [sourceFolder, sourceFolderList])

  const sectionTriggerClass = 'hover:no-underline py-3 px-1 sm:px-2 items-center [&>svg:last-child]:self-center'
  const showGitHooksAccordionItem =
    versionControlSystem === 'git' && (effectiveMultiRepo ? !!draftProjectId?.trim() : !!sourceFolder?.trim())

  return (
    <>
      <div className="space-y-4">
        <Card className="gap-0 overflow-hidden rounded-md py-0">
          <CardContent className="p-0">
            <Accordion type="single" collapsible defaultValue="workspace" className="w-full px-3 sm:px-4">
              <AccordionItem value="workspace">
                <AccordionTrigger className={sectionTriggerClass}>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left text-base font-semibold">
                    <Folder className="size-5 shrink-0" />
                    <span className="min-w-0 shrink">{t('settings.versioncontrol.sourceFolderAndWorkspace', 'Source Folder & workspace')}</span>
                    {!(versionControlSystem === 'git' && multiRepoEnabled && !draftProjectId?.trim()) && (
                      <VersionControlInfo
                        sourceFolder={versionControlInfoFolder}
                        versionControlSystem={versionControlSystem}
                        onVersionControlChange={type => onSetConfigDeferred('versionControlSystem', type)}
                        onSave={() => onSave(true)}
                        deferDetection={isVersionControlTabDirty}
                        badgeOnly
                        onBadgeClick={() => setShowVersionControlInfoDialog(true)}
                      />
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-1 pb-4 pt-0 sm:px-2">
            {versionControlSystem === 'git' && isLoggedIn && (
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                <Label htmlFor="multi-repo-workspace" className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                  <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                  {t('settings.versioncontrol.multiRepoWorkspace')}
                </Label>
                <Switch id="multi-repo-workspace" checked={multiRepoEnabled} onCheckedChange={checked => onSetConfigDeferred('multiRepoEnabled', checked)} />
              </div>
            )}

            {effectiveMultiRepo && versionControlSystem === 'git' ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-muted-foreground" />
                  {t('settings.versioncontrol.multiRepoByProjectTitle', 'Repo theo Project')}
                </Label>
                <div className="flex items-center gap-2">
                  <Combobox
                    value={draftProjectId ?? ''}
                    onValueChange={v => setDraftProjectId(v?.trim() ? v : null)}
                    options={projectList.map(p => ({ value: p.id, label: p.name }))}
                    placeholder={projectsLoading ? t('common.loading', 'Đang tải ...') : t('settings.versioncontrol.multiRepoSelectProject', 'Chọn Project')}
                    emptyText={t('settings.versioncontrol.multiRepoNoProjects', 'Chưa có Project. Đăng nhập Task để xem danh sách.')}
                    size="sm"
                    className="w-full"
                    disabled={projectsLoading}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={buttonVariant} size="icon-sm" onClick={handleOpenFoldersByProject}>
                        <Folder className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('settings.versioncontrol.foldersByProject', 'Source Folders by Project')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={buttonVariant} size="icon-sm" onClick={() => setUnlinkedDialogOpen(true)}>
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('settings.versioncontrol.unlinkedFolders', 'Source Folders not linked to project')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div id="settings-source-folder" className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Folder className="w-4 h-4 text-muted-foreground" />
                    {t('settings.versioncontrol.sourceFolder', 'Source Folder')}
                  </Label>
                  <div className="flex items-center justify-between gap-2">
                    <Combobox
                      value={sourceFolder}
                      onValueChange={value => onSetConfigDeferred('sourceFolder', value)}
                      options={sourceFolderList.map(folder => ({ value: folder.path, label: folder.name }))}
                      placeholder="Select Source Folder"
                      size="sm"
                      className="w-full"
                    />

                    <div className="flex gap-2">
                      {versionControlSystem === 'git' && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant={buttonVariant} size="icon-sm" onClick={() => setShowGitCloneDialog(true)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('git.clone.title')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant={buttonVariant} size="icon-sm" onClick={() => setShowGitInitDialog(true)}>
                                <GitBranch className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('git.init.title')}</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      <Button variant={buttonVariant} size="icon-sm" onClick={handleOpenAddDialog}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      {sourceFolder && (
                        <>
                          <Button variant={buttonVariant} size="icon-sm" onClick={handleOpenEditDialog} disabled={isOpeningEditDialog}>
                            {isOpeningEditDialog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant={buttonVariant}
                            size="icon-sm"
                            disabled={isSourceFolderActionLoading}
                            onClick={() => onDeleteSourceFolder(sourceFolderList.find(f => f.path === sourceFolder)?.name || '')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <AddOrEditSourceFolderDialog
                  open={sourceFolderDialogOpen}
                  onOpenChange={setSourceFolderDialogOpen}
                  isEditMode={false}
                  folderName={sourceFolderName}
                  folderPath={sourceFolderPath}
                  setFolderName={setSourceFolderName}
                  setFolderPath={setSourceFolderPath}
                  showProjectInEditMode={false}
                  onAdd={handleAddSourceFolder}
                  onUpdate={() => { }}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-transparent bg-muted/10 px-3 py-2 pt-3 mt-1">
              <Label htmlFor="auto-refresh" className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                <RefreshCw className="w-3.5 h-3.5" />
                {t('settings.versioncontrol.autoRefresh')}
              </Label>
              <Switch id="auto-refresh" checked={autoRefreshEnabled} onCheckedChange={checked => onSetConfigDeferred('autoRefreshEnabled', checked)} />
            </div>
                </AccordionContent>
              </AccordionItem>

              {showGitHooksAccordionItem && (
                <AccordionItem value="git-hooks">
                  <AccordionTrigger className={sectionTriggerClass}>
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <GitBranch className="size-5 shrink-0" />
                      {t('settings.versioncontrol.gitSection')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 px-1 pb-4 pt-0 sm:px-2">
                    {isVersionControlTabDirty && (
                      <span className="block text-sm font-normal text-amber-600 dark:text-amber-500">
                        {t('settings.versioncontrol.saveBeforeGitOps', 'Lưu thay đổi trước khi sử dụng các thao tác Git (tránh thao tác nhầm folder).')}
                      </span>
                    )}
                    <div className={`rounded-lg border p-3 ${isVersionControlTabDirty ? 'pointer-events-none opacity-60' : ''}`}>
                      <GitHooksSection
                        embedded
                        selectedProjectId={effectiveMultiRepo ? draftProjectId : null}
                        selectedSourceFolder={!effectiveMultiRepo ? sourceFolder ?? null : null}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              <AccordionItem value="vcs-users">
                <AccordionTrigger className={sectionTriggerClass}>
                  <span className="flex items-center gap-2 text-base font-semibold">
                    <User className="size-5 shrink-0" />
                    {t('settings.vcsUsers.title', 'VCS Users & Credentials')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-1 pb-4 pt-0 sm:px-2">
                  <div className={`flex flex-wrap items-center gap-2 ${isVersionControlTabDirty ? 'pointer-events-none opacity-60' : ''}`}>
                    {versionControlSystem === 'svn' ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant={buttonVariant} size="sm" className="gap-1.5" onClick={() => setVcsSvnCredsDialogOpen(true)} disabled={isVersionControlTabDirty}>
                            <User className="h-4 w-4" />
                            {t('settings.vcsUsers.svnCredentials', 'SVN Credentials')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{isVersionControlTabDirty ? t('settings.versioncontrol.saveBeforeUse', 'Lưu thay đổi trước') : t('settings.vcsUsers.svnCredentials', 'SVN Credentials')}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant={buttonVariant} size="sm" className="gap-1.5" onClick={() => setVcsGitConfigDialogOpen(true)} disabled={isVersionControlTabDirty}>
                              <Settings className="h-4 w-4" />
                              {t('settings.vcsUsers.gitConfig', 'Git Configuration')}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isVersionControlTabDirty ? t('settings.versioncontrol.saveBeforeUse', 'Lưu thay đổi trước') : t('settings.vcsUsers.gitConfig', 'Git Configuration')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant={buttonVariant} size="sm" className="gap-1.5" onClick={() => setVcsGitCredsDialogOpen(true)} disabled={isVersionControlTabDirty}>
                              <Key className="h-4 w-4" />
                              {t('settings.vcsUsers.gitStoredCredentials', 'Git Stored Credentials')}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isVersionControlTabDirty ? t('settings.versioncontrol.saveBeforeUse', 'Lưu thay đổi trước') : t('settings.vcsUsers.gitStoredCredentials', 'Git Stored Credentials')}</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <GitCloneDialog
        open={showGitCloneDialog}
        onOpenChange={setShowGitCloneDialog}
        onCloneComplete={() => {
          loadSourceFolderConfig()
          onSave(true)
        }}
      />
      <GitInitDialog
        open={showGitInitDialog}
        onOpenChange={setShowGitInitDialog}
        onInitComplete={() => {
          loadSourceFolderConfig()
          onSave(true)
        }}
      />
      <VersionControlInfoDialog
        open={
          showVersionControlInfoDialog &&
          !(versionControlSystem === 'git' && multiRepoEnabled && !draftProjectId?.trim())
        }
        onOpenChange={setShowVersionControlInfoDialog}
        sourceFolder={versionControlInfoFolder}
        versionControlSystem={versionControlSystem}
        onVersionControlChange={type => onSetConfigDeferred('versionControlSystem', type)}
        onSave={() => onSave(true)}
        deferDetection={isVersionControlTabDirty}
      />
      <VcsSvnCredentialsDialog open={vcsSvnCredsDialogOpen} onOpenChange={setVcsSvnCredsDialogOpen} />
      <VcsGitConfigDialog
        open={vcsGitConfigDialogOpen}
        onOpenChange={setVcsGitConfigDialogOpen}
        selectedProjectId={effectiveMultiRepo ? draftProjectId : null}
        selectedSourceFolder={!effectiveMultiRepo ? sourceFolder ?? null : null}
      />
      <VcsGitStoredCredentialsDialog open={vcsGitCredsDialogOpen} onOpenChange={setVcsGitCredsDialogOpen} />

      <FoldersByProjectDialog
        open={foldersByProjectDialogOpen}
        onOpenChange={open => {
          setFoldersByProjectDialogOpen(open)
          if (!open) loadLinkMappings()
        }}
        projectList={projectList}
        mappings={linkMappings}
        initialProjectId={draftProjectId}
        onEditFolder={handleEditFolderFromDialog}
        onUnlinkFolder={handleUnlinkFolder}
      />
      {editSourceFolderDialogOpen && (
        <AddOrEditSourceFolderDialog
          open={editSourceFolderDialogOpen}
          onOpenChange={open => {
            setEditSourceFolderDialogOpen(open)
            if (!open) {
              setEditingLinkOldPath(null)
              setEditingLinkOldProjectId(null)
              if (foldersByProjectDialogOpen) loadLinkMappings()
            }
          }}
          isEditMode={true}
          folderName={sourceFolderName}
          folderPath={sourceFolderPath}
          setFolderName={setSourceFolderName}
          setFolderPath={setSourceFolderPath}
          projectId={projectId}
          setProjectId={setProjectId}
          showProjectInEditMode={effectiveMultiRepo}
          onUpdate={projectIdToUpdate =>
            onUpdateSourceFolder(projectIdToUpdate, {
              oldPath: editingLinkOldPath ?? undefined,
              oldProjectId: editingLinkOldProjectId ?? undefined,
            })
          }
          onAdd={() => { }}
        />
      )}
      <UnlinkedFoldersDialog
        open={unlinkedDialogOpen}
        onOpenChange={open => {
          setUnlinkedDialogOpen(open)
          if (!open) loadLinkMappings()
        }}
      />

      <div className="flex justify-center pt-4">
        <Button
          variant={isVersionControlTabDirty ? 'default' : buttonVariant}
          onClick={() => onSave(false)}
          className={isVersionControlTabDirty ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md' : ''}
        >
          <Save className="h-4 w-4" />
          {t('common.save')}
          {isVersionControlTabDirty && ` (${t('settings.configuration.unsavedChanges')})`}
        </Button>
      </div>
    </>
  )
})
