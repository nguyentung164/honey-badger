'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'

interface GitInitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInitComplete?: () => void
}

export function GitInitDialog({ open, onOpenChange, onInitComplete }: GitInitDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const addSourceFolder = useSourceFolderStore(s => s.addSourceFolder)
  const setFieldConfiguration = useConfigurationStore(s => s.setFieldConfiguration)

  const [targetPath, setTargetPath] = useState('')
  const [folderName, setFolderName] = useState('')
  const [isIniting, setIsIniting] = useState(false)

  const handleBrowse = async () => {
    const folder = await window.api.system.select_folder()
    if (folder) {
      setTargetPath(folder)
      if (!folderName) {
        const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean)
        setFolderName(parts[parts.length - 1] || 'new-repo')
      }
    }
  }

  const handleInit = async () => {
    const trimmedPath = targetPath.trim()
    const name = folderName.trim() || 'new-repo'

    if (!trimmedPath) {
      toast.warning(t('git.init.targetPathRequired'))
      return
    }

    setIsIniting(true)
    try {
      const result = await window.api.git.init(trimmedPath)

      if (result.status === 'success') {
        const added = await addSourceFolder({ name, path: trimmedPath })
        if (added) {
          setFieldConfiguration('sourceFolder', trimmedPath)
          setFieldConfiguration('versionControlSystem', 'git')
          toast.success(t('git.init.success'))
          setTargetPath('')
          setFolderName('')
          onInitComplete?.()
          onOpenChange(false)
          window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
        } else {
          toast.warning(t('git.init.addedButExists'))
        }
      } else {
        toast.error(result.message || t('git.init.error'))
      }
    } catch (error) {
      logger.error('Init error:', error)
      toast.error(t('git.init.error'))
    } finally {
      setIsIniting(false)
    }
  }

  const handleClose = () => {
    if (!isIniting) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('git.init.title')}</DialogTitle>
          <DialogDescription>{t('git.init.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>{t('git.init.targetPath')}</Label>
            <div className="flex gap-2">
              <Input placeholder={t('git.init.targetPathPlaceholder')} value={targetPath} onChange={e => setTargetPath(e.target.value)} disabled={isIniting} />
              <Button variant={buttonVariant} onClick={handleBrowse} disabled={isIniting}>
                {t('common.browse')}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('common.name')}</Label>
            <Input placeholder="new-repo" value={folderName} onChange={e => setFolderName(e.target.value)} disabled={isIniting} />
            <p className="text-xs text-muted-foreground">{t('git.init.nameHint')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant={buttonVariant} onClick={handleClose} disabled={isIniting}>
            {t('common.cancel')}
          </Button>
          <Button variant={buttonVariant} onClick={handleInit} disabled={isIniting || !targetPath.trim()}>
            {isIniting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('git.init.init')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
