'use client'

import { Folder, Link2, Loader2 } from 'lucide-react'
import { MAX_REPOS_PER_PROJECT } from 'main/constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectOption } from '@/components/dialogs/settings/AddOrEditSourceFolderDialog'
import { AddOrEditSourceFolderDialog } from '@/components/dialogs/settings/AddOrEditSourceFolderDialog'
import { FoldersByProjectDialog } from '@/components/dialogs/settings/FoldersByProjectDialog'
import { UnlinkedFoldersDialog } from '@/components/dialogs/vcs/UnlinkedFoldersDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '') || p

export type LinkProjectToolbarApi = {
  openFoldersByProject: () => void
  openUnlinked: () => void
  projectLinkedCount: number
  unlinkedCount: number
  loading: boolean
}

type LinkProjectTabContentProps = {
  /** Khi có, không render hàng nút inline — dùng API này trên header (Master). */
  onToolbarReady?: (api: LinkProjectToolbarApi | null) => void
}

export function LinkProjectTabContent({ onToolbarReady }: LinkProjectTabContentProps) {
  const { t } = useTranslation()
  const sourceFolderList = useSourceFolderStore(s => s.sourceFolderList)
  const loadSourceFolderConfig = useSourceFolderStore(s => s.loadSourceFolderConfig)
  const loadConfigurationConfig = useConfigurationStore(s => s.loadConfigurationConfig)

  const [projectList, setProjectList] = useState<ProjectOption[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [mappings, setMappings] = useState<{ projectId: string; sourceFolderPath: string }[]>([])
  const [unlinkedDialogOpen, setUnlinkedDialogOpen] = useState(false)
  const [foldersByProjectDialogOpen, setFoldersByProjectDialogOpen] = useState(false)
  const [editSourceFolderDialogOpen, setEditSourceFolderDialogOpen] = useState(false)
  const [sourceFolderName, setSourceFolderName] = useState('')
  const [sourceFolderPath, setSourceFolderPath] = useState('')
  const [projectId, setProjectId] = useState('')
  const [editingLinkOldPath, setEditingLinkOldPath] = useState<string | null>(null)
  const [editingLinkOldProjectId, setEditingLinkOldProjectId] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)

  const loadMappings = useCallback(async () => {
    if (!isLoggedIn) return
    const res = await window.api.task.getUserProjectSourceFolderMappings()
    if (res.status === 'success' && res.data) {
      setMappings(res.data)
    } else {
      setMappings([])
    }
  }, [isLoggedIn])

  const loadProjectList = useCallback(async () => {
    setIsLoadingData(true)
    try {
      const res = await window.api.user.getCurrentUser()
      if (res.status === 'success' && res.data) {
        setIsLoggedIn(true)
        const projRes = await window.api.task.getProjectsForUser()
        if (projRes.status === 'success' && projRes.data) {
          setProjectList(projRes.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
        }
      } else {
        setIsLoggedIn(false)
        setProjectList([])
      }
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    loadConfigurationConfig().then(() => {
      loadSourceFolderConfig()
    })
  }, [loadConfigurationConfig, loadSourceFolderConfig])

  useEffect(() => {
    loadProjectList()
  }, [loadProjectList])

  useEffect(() => {
    if (isLoggedIn) loadMappings()
    else setMappings([])
  }, [isLoggedIn, loadMappings])

  const unlinkedFolders = useMemo(() => {
    const linkedPaths = new Set(mappings.map(m => normPath(m.sourceFolderPath)))
    return sourceFolderList.filter(f => !linkedPaths.has(normPath(f.path)))
  }, [sourceFolderList, mappings])

  const mappingsByProject = useMemo(() => {
    const byProject = new Map<string, { path: string; name: string }[]>()
    for (const m of mappings) {
      const name = sourceFolderList.find(f => normPath(f.path) === normPath(m.sourceFolderPath))?.name ?? m.sourceFolderPath
      const arr = byProject.get(m.projectId) ?? []
      arr.push({ path: m.sourceFolderPath, name })
      byProject.set(m.projectId, arr)
    }
    return byProject
  }, [mappings, sourceFolderList])

  const loading = isLoadingData || isActionLoading

  useEffect(() => {
    if (!onToolbarReady) return
    if (!isLoggedIn) {
      onToolbarReady(null)
      return
    }
    onToolbarReady({
      openFoldersByProject: () => setFoldersByProjectDialogOpen(true),
      openUnlinked: () => setUnlinkedDialogOpen(true),
      projectLinkedCount: mappingsByProject.size,
      unlinkedCount: unlinkedFolders.length,
      loading,
    })
    return () => onToolbarReady(null)
  }, [onToolbarReady, isLoggedIn, mappingsByProject.size, unlinkedFolders.length, loading])

  const handleEditFolderFromDialog = useCallback((folder: { name: string; path: string }, projectIdFromFolder: string) => {
    setSourceFolderName(folder.name)
    setSourceFolderPath(folder.path)
    setProjectId(projectIdFromFolder)
    setEditingLinkOldPath(folder.path)
    setEditingLinkOldProjectId(projectIdFromFolder)
    setFoldersByProjectDialogOpen(false)
    setEditSourceFolderDialogOpen(true)
  }, [])

  const handleUnlinkFolder = useCallback(
    async (path: string) => {
      setIsActionLoading(true)
      try {
        const res = await window.api.task.deleteUserProjectSourceFolder(path)
        if (res.status !== 'success') throw new Error(res.message ?? t('toast.error'))
        await loadMappings()
      } finally {
        setIsActionLoading(false)
      }
    },
    [loadMappings, t]
  )

  const handleUpdateFolderProjectLink = useCallback(
    async (newProjectId: string) => {
      if (!editingLinkOldPath || !sourceFolderPath.trim() || !sourceFolderName.trim()) return
      if (editingLinkOldProjectId !== newProjectId) {
        const count = mappings.filter(m => m.projectId === newProjectId).length
        if (count >= MAX_REPOS_PER_PROJECT) {
          toast.error(t('settings.versioncontrol.maxReposPerProjectReached', 'Project đã đạt tối đa {{max}} repo.', { max: MAX_REPOS_PER_PROJECT }))
          return
        }
      }
      setIsActionLoading(true)
      try {
        if (editingLinkOldProjectId) {
          const delRes = await window.api.task.deleteUserProjectSourceFolder(editingLinkOldPath)
          if (delRes.status !== 'success') {
            toast.error(delRes.message ?? t('toast.error'))
            return
          }
        }
        const res = await window.api.task.upsertUserProjectSourceFolder(newProjectId, sourceFolderPath.trim(), sourceFolderName.trim())
        if (res.status === 'success') {
          toast.success(t('settings.versioncontrol.folderLinked', 'Đã liên kết folder với project'))
          setEditSourceFolderDialogOpen(false)
          setEditingLinkOldPath(null)
          setEditingLinkOldProjectId(null)
          await loadMappings()
        } else {
          toast.error(res.message ?? t('toast.error'))
        }
      } finally {
        setIsActionLoading(false)
      }
    },
    [editingLinkOldPath, editingLinkOldProjectId, mappings, sourceFolderPath, sourceFolderName, loadMappings, t]
  )

  return (
    <>
      {!onToolbarReady && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="relative gap-1.5" onClick={() => setFoldersByProjectDialogOpen(true)} disabled={loading}>
                  {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Folder className="h-4 w-4" />}
                  {t('settings.versioncontrol.foldersByProject', 'Source Folders theo Project')}
                  {mappingsByProject.size > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 text-primary px-1.5 text-xs font-medium">
                      {mappingsByProject.size}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.versioncontrol.foldersByProject', 'Source Folders theo Project')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="relative gap-1.5" onClick={() => setUnlinkedDialogOpen(true)} disabled={loading}>
                  <Link2 className="h-4 w-4" />
                  {t('settings.versioncontrol.unlinkedFolders', 'Source Folders chưa liên kết project')}
                  {unlinkedFolders.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">
                      {unlinkedFolders.length > 9 ? '9+' : unlinkedFolders.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.versioncontrol.unlinkedFolders', 'Source Folders chưa liên kết project')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <UnlinkedFoldersDialog
        open={unlinkedDialogOpen}
        onOpenChange={open => {
          setUnlinkedDialogOpen(open)
          if (!open && isLoggedIn) loadMappings()
        }}
      />
      <FoldersByProjectDialog
        open={foldersByProjectDialogOpen}
        onOpenChange={open => {
          setFoldersByProjectDialogOpen(open)
          if (!open && isLoggedIn) loadMappings()
        }}
        projectList={projectList}
        mappings={mappings}
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
            }
          }}
          isEditMode={true}
          folderName={sourceFolderName}
          folderPath={sourceFolderPath}
          setFolderName={setSourceFolderName}
          setFolderPath={setSourceFolderPath}
          projectId={projectId}
          setProjectId={setProjectId}
          projectList={projectList}
          isLoggedIn={isLoggedIn}
          onUpdate={handleUpdateFolderProjectLink}
          onAdd={() => { }}
        />
      )}
    </>
  )
}
