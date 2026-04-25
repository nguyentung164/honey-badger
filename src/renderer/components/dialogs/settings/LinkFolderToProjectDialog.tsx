'use client'

import { Plus } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useButtonVariant } from '@/stores/useAppearanceStore'
import type { ProjectOption } from './AddOrEditSourceFolderDialog'

interface LinkFolderToProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: { name: string; path: string } | null
  projectList: ProjectOption[]
  onLinked: (projectId: string) => Promise<void>
  /** Khi có: hiển thị nút + tạo project mới. Gọi callback tạo project, insert DB, trả về project mới. */
  onCreateProject?: (name: string) => Promise<{ id: string; name: string } | null>
}

export const LinkFolderToProjectDialog = memo(function LinkFolderToProjectDialog({
  open,
  onOpenChange,
  folder,
  projectList,
  onLinked,
  onCreateProject,
}: LinkFolderToProjectDialogProps) {
  const { t } = useTranslation()
  const variant = useButtonVariant()
  const [projectId, setProjectId] = useState('')
  const [errorProject, setErrorProject] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const effectiveProjectList = projectList

  useEffect(() => {
    if (open) {
      setProjectId('')
      setErrorProject(false)
      setShowCreateInput(false)
      setNewProjectName('')
    }
  }, [open])

  const handleConfirm = async () => {
    const projectValid = projectId.trim().length > 0
    setErrorProject(!projectValid)
    if (!projectValid || !folder) return
    setIsSubmitting(true)
    try {
      await onLinked(projectId)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateProject = async () => {
    const trimmed = newProjectName.trim()
    if (!trimmed || !onCreateProject) return
    setIsCreating(true)
    try {
      const project = await onCreateProject(trimmed)
      if (project) {
        setProjectId(project.id)
        setErrorProject(false)
        setShowCreateInput(false)
        setNewProjectName('')
      }
    } finally {
      setIsCreating(false)
    }
  }

  const folderLine =
    folder != null
      ? `${folder.name} — ${folder.path}`
      : ''
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-4 sm:max-w-[min(100%,20rem)]">
        <DialogHeader className="space-y-1.5 pr-6">
          <DialogTitle className="text-base">{t('settings.versioncontrol.linkFolderToProject', 'Liên kết folder với project')}</DialogTitle>
          {folder && (
            <DialogDescription
              className="text-xs text-muted-foreground line-clamp-2 break-all"
              title={folderLine}
            >
              {folder.name}
              <span className="text-muted-foreground/80"> — </span>
              <span className="font-mono text-[0.7rem] leading-snug text-muted-foreground/90">
                {folder.path}
              </span>
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-1.5 pt-3">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="link-project" className="text-xs font-medium text-muted-foreground">
              {t('dialog.sourcefolder.project', 'Project')}
            </Label>
            {onCreateProject && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-1.5 text-xs gap-0.5"
                onClick={() => setShowCreateInput(!showCreateInput)}
              >
                <Plus className="h-3 w-3" />
                {t('dialog.sourcefolder.createNew', 'Tạo mới')}
              </Button>
            )}
          </div>
          {showCreateInput && onCreateProject ? (
            <div className="flex min-w-0 gap-1.5">
              <Input
                id="link-project"
                className="h-8 min-w-0 text-sm"
                placeholder={t('dialog.sourcefolder.newProjectName', 'Tên project')}
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
              />
              <Button
                className="h-8 shrink-0 px-2 text-xs"
                variant={variant}
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isCreating}
              >
                {isCreating ? t('common.saving', 'Đang lưu...') : t('common.add')}
              </Button>
            </div>
          ) : (
            <Select
              key={effectiveProjectList.map(p => p.id).join(',')}
              value={projectId}
              onValueChange={v => (setProjectId(v), setErrorProject(false))}
            >
              <SelectTrigger id="link-project" className={cn('h-8 w-full text-sm', errorProject && 'border-red-500')}>
                <SelectValue placeholder={t('dialog.sourcefolder.selectProject', 'Chọn project')} />
              </SelectTrigger>
              <SelectContent>
                {effectiveProjectList.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-sm">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errorProject && (
            <p className="text-xs text-red-500 leading-tight">{t('dialog.sourcefolder.error.projectRequired', 'Vui lòng chọn project')}</p>
          )}
        </div>
        <DialogFooter className="mt-3 gap-1.5 sm:gap-1.5">
          <Button
            className="h-8 text-sm"
            variant={variant}
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            className="h-8 text-sm"
            variant={variant}
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? t('common.saving', 'Đang lưu...') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
