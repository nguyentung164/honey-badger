'use client'
import { Loader2 } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useButtonVariant } from '@/stores/useAppearanceStore'

export interface ProjectOption {
  id: string
  name: string
}

interface AddOrEditSourceFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isEditMode: boolean
  folderName: string
  folderPath: string
  setFolderName: (name: string) => void
  setFolderPath: (path: string) => void
  projectId?: string
  setProjectId?: (id: string) => void
  projectList?: ProjectOption[]
  isLoggedIn?: boolean
  /** When false, hide project selector in edit mode (e.g. Settings only edit name/path). */
  showProjectInEditMode?: boolean
  /** Add mới: chỉ name + path. Link project qua Master window. */
  onAdd: () => void | Promise<void>
  onUpdate: (projectId: string) => void | Promise<void>
}

export const AddOrEditSourceFolderDialog = memo(function AddOrEditSourceFolderDialog({
  open,
  onOpenChange,
  isEditMode,
  folderName,
  folderPath,
  setFolderName,
  setFolderPath,
  projectId = '',
  setProjectId,
  projectList = [],
  isLoggedIn = false,
  showProjectInEditMode = true,
  onAdd,
  onUpdate,
}: AddOrEditSourceFolderDialogProps) {
  const { t } = useTranslation()
  const variant = useButtonVariant()
  const [errorName, setErrorName] = useState(false)
  const [errorPath, setErrorPath] = useState(false)
  const [errorProject, setErrorProject] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setErrorName(false)
      setErrorPath(false)
      setErrorProject(false)
    }
  }, [open])

  const handleSave = async () => {
    const nameValid = folderName.trim().length > 0
    const pathValid = folderPath.trim().length > 0
    const projectValid = !showProjectInEditMode || !isEditMode || (projectId ?? '').trim().length > 0
    setErrorName(!nameValid)
    setErrorPath(!pathValid)
    setErrorProject(showProjectInEditMode && isEditMode && !(projectId ?? '').trim().length)

    if (nameValid && pathValid && projectValid) {
      setIsSubmitting(true)
      try {
        if (isEditMode) {
          await Promise.resolve(onUpdate((projectId ?? '').trim()))
        } else {
          await onAdd()
        }
        onOpenChange(false)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('dialog.editSourceFolder') : t('dialog.addSourceFolder')}</DialogTitle>
          <DialogDescription>{isEditMode ? t('dialog.editSourceFolderDesc') : t('dialog.addSourceFolderDesc')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {isEditMode && showProjectInEditMode && projectList.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="project" className="text-left">
                {t('dialog.sourcefolder.project', 'Project')}
              </Label>
              <Select value={projectId} onValueChange={setProjectId!}>
                <SelectTrigger id="project" className={errorProject ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t('dialog.sourcefolder.selectProject', 'Chọn project')} />
                </SelectTrigger>
                <SelectContent>
                  {projectList.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorProject && <p className="text-sm text-red-500">{t('dialog.sourcefolder.error.projectRequired', 'Vui lòng chọn project')}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-left">
              {t('common.name')}
            </Label>
            <Input id="name" value={folderName} onChange={e => setFolderName(e.target.value)} className={errorName ? 'border-red-500' : ''} disabled={isEditMode} />
            {errorName && <p className="text-sm text-red-500">{t('dialog.sourcefolder.error.nameRequired')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="path" className="text-left">
              {t('common.path')}
            </Label>
            <div className="flex gap-2">
              <Input id="path" value={folderPath} onChange={e => setFolderPath(e.target.value)} className={`flex-1 ${errorPath ? 'border-red-500' : ''}`} />
              <Button
                variant="outline"
                onClick={async () => {
                  const folder = await window.api.system.select_folder()
                  if (folder) setFolderPath(folder)
                }}
              >
                {t('common.browse')}
              </Button>
            </div>
            {errorPath && <p className="text-sm text-red-500">{t('dialog.sourcefolder.error.pathRequired')}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant={variant} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEditMode ? t('common.save') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
