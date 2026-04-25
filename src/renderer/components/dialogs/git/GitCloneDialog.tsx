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
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'

function getRepoNameFromUrl(url: string): string {
  try {
    const trimmed = url.trim()
    const withoutTrailingSlash = trimmed.replace(/\/$/, '')
    const parts = withoutTrailingSlash.split('/')
    const last = parts[parts.length - 1] || 'repo'
    return last.replace(/\.git$/, '')
  } catch {
    return 'repo'
  }
}

interface GitCloneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloneComplete?: () => void
}

export function GitCloneDialog({ open, onOpenChange, onCloneComplete }: GitCloneDialogProps) {
  const { t } = useTranslation()
  const addSourceFolder = useSourceFolderStore(s => s.addSourceFolder)
  const setFieldConfiguration = useConfigurationStore(s => s.setFieldConfiguration)

  const [url, setUrl] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [branch, setBranch] = useState('')
  const [isCloning, setIsCloning] = useState(false)

  const handleBrowse = async () => {
    const folder = await window.api.system.select_folder()
    if (folder) setTargetPath(folder)
  }

  const handleClone = async () => {
    const trimmedUrl = url.trim()
    const trimmedPath = targetPath.trim()

    if (!trimmedUrl) {
      toast.warning(t('git.clone.urlRequired'))
      return
    }
    if (!trimmedPath) {
      toast.warning(t('git.clone.targetPathRequired'))
      return
    }

    setIsCloning(true)
    try {
      const options = branch.trim() ? { branch: branch.trim() } : undefined
      const result = await window.api.git.clone(trimmedUrl, trimmedPath, options)

      if (result.status === 'success') {
        const repoName = getRepoNameFromUrl(trimmedUrl)
        const normalizedPath = trimmedPath.replace(/\\/g, '/').replace(/\/$/, '')
        const fullPath = `${normalizedPath}/${repoName}`

        const added = await addSourceFolder({ name: repoName, path: fullPath })
        if (added) {
          setFieldConfiguration('sourceFolder', fullPath)
          setFieldConfiguration('versionControlSystem', 'git')
          toast.success(t('git.clone.success'))
          setUrl('')
          setTargetPath('')
          setBranch('')
          onCloneComplete?.()
          onOpenChange(false)
          window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
        } else {
          toast.warning(t('git.clone.addedButExists'))
        }
      } else {
        toast.error(result.message || t('git.clone.error'))
      }
    } catch (error) {
      logger.error('Clone error:', error)
      toast.error(t('git.clone.error'))
    } finally {
      setIsCloning(false)
    }
  }

  const handleClose = () => {
    if (!isCloning) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('git.clone.title')}</DialogTitle>
          <DialogDescription>{t('git.clone.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>{t('git.clone.url')}</Label>
            <Input placeholder="https://github.com/user/repo.git" value={url} onChange={e => setUrl(e.target.value)} disabled={isCloning} />
          </div>
          <div className="space-y-2">
            <Label>{t('git.clone.targetPath')}</Label>
            <div className="flex gap-2">
              <Input placeholder={t('git.clone.targetPathPlaceholder')} value={targetPath} onChange={e => setTargetPath(e.target.value)} disabled={isCloning} />
              <Button variant="outline" onClick={handleBrowse} disabled={isCloning}>
                {t('common.browse')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('git.clone.targetPathHint')}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('git.clone.branch')}</Label>
            <Input placeholder="main" value={branch} onChange={e => setBranch(e.target.value)} disabled={isCloning} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCloning}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleClone} disabled={isCloning || !url.trim() || !targetPath.trim()}>
            {isCloning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('git.clone.clone')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
