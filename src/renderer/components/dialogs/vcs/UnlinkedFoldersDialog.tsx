'use client'

import { Link2, Loader2 } from 'lucide-react'
import { MAX_REPOS_PER_PROJECT } from 'main/constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectOption } from '@/components/dialogs/settings/AddOrEditSourceFolderDialog'
import { LinkFolderToProjectDialog } from '@/components/dialogs/settings/LinkFolderToProjectDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '') || p

interface UnlinkedFoldersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UnlinkedFoldersDialog({ open, onOpenChange }: UnlinkedFoldersDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const user = useTaskAuthStore(s => s.user)
  const sourceFolderList = useSourceFolderStore(s => s.sourceFolderList)
  const [mappings, setMappings] = useState<{ projectId: string; sourceFolderPath: string }[]>([])
  const [projectList, setProjectList] = useState<ProjectOption[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [folderToLink, setFolderToLink] = useState<{ name: string; path: string } | null>(null)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const unlinkedFolders = useMemo(() => {
    const linkedPaths = new Set(mappings.map(m => normPath(m.sourceFolderPath)))
    return sourceFolderList.filter(f => !linkedPaths.has(normPath(f.path)))
  }, [sourceFolderList, mappings])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const userRes = await window.api.user.getCurrentUser()
      if (userRes.status !== 'success' || !userRes.data) {
        setIsLoggedIn(false)
        setProjectList([])
        setMappings([])
        return
      }
      setIsLoggedIn(true)
      const [projRes, mapRes] = await Promise.all([window.api.task.getProjectsForUser(), window.api.task.getUserProjectSourceFolderMappings()])
      if (projRes.status === 'success' && projRes.data) {
        setProjectList(projRes.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      } else {
        setProjectList([])
      }
      if (mapRes.status === 'success' && mapRes.data) {
        setMappings(mapRes.data)
      } else {
        setMappings([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  const handleOpenLinkDialog = useCallback((folder: { name: string; path: string }) => {
    setFolderToLink(folder)
    setLinkDialogOpen(true)
  }, [])

  const handleLinked = useCallback(
    async (projectId: string) => {
      if (!folderToLink) return
      const count = mappings.filter(m => m.projectId === projectId).length
      if (count >= MAX_REPOS_PER_PROJECT) {
        toast.error(t('settings.versioncontrol.maxReposPerProjectReached', 'Project đã đạt tối đa {{max}} repo.', { max: MAX_REPOS_PER_PROJECT }))
        return
      }
      const res = await window.api.task.upsertUserProjectSourceFolder(projectId, folderToLink.path, folderToLink.name)
      if (res.status === 'success') {
        toast.success(t('settings.versioncontrol.folderLinked', 'Đã liên kết folder với project'))
        setLinkDialogOpen(false)
        setFolderToLink(null)
        await loadData()
        window.dispatchEvent(new CustomEvent('multi-repo-links-changed'))
      } else {
        toast.error(res.message ?? t('toast.error'))
      }
    },
    [folderToLink, loadData, mappings, t]
  )

  const handleCreateProject = useCallback(
    async (name: string): Promise<{ id: string; name: string } | null> => {
      const trimmed = name.trim()
      if (!trimmed) return null
      const userRes = await window.api.user.getCurrentUser()
      const userId = userRes.status === 'success' && userRes.data ? userRes.data.id : null
      const res = await window.api.task.createProject(trimmed, userId)
      if (res.status === 'success' && res.data) {
        const project = { id: res.data.id, name: res.data.name }
        await loadData()
        return project
      }
      toast.error(res.message ?? t('taskManagement.projectCreateError', 'Không thể tạo project'))
      return null
    },
    [loadData, t]
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              {t('settings.versioncontrol.unlinkedFolders', 'Source Folders chưa liên kết project')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[320px] overflow-y-auto relative">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !isLoggedIn ? (
              <p className="text-sm text-muted-foreground py-4">{t('dialog.sourcefolder.loginToLinkProject')}</p>
            ) : unlinkedFolders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t('settings.versioncontrol.allFoldersLinked', 'Tất cả folder đã được liên kết project.')}</p>
            ) : (
              unlinkedFolders.map(f => (
                <div key={f.path} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm truncate flex-1 min-w-0">
                    {f.name} <span className="text-muted-foreground">({f.path})</span>
                  </span>
                  <Button variant={buttonVariant} size="sm" onClick={() => handleOpenLinkDialog(f)}>
                    {t('settings.versioncontrol.linkProject', 'Liên kết project')}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LinkFolderToProjectDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        folder={folderToLink}
        projectList={projectList}
        onLinked={handleLinked}
        onCreateProject={user?.role === 'admin' ? handleCreateProject : undefined}
      />
    </>
  )
}
