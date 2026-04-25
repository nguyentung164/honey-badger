'use client'

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VersionControlInfo } from '@/components/ui/VersionControlInfo'

interface VersionControlInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceFolder: string
  versionControlSystem: 'svn' | 'git'
  onVersionControlChange: (type: 'svn' | 'git') => void
  onSave?: () => void
  deferDetection?: boolean
}

export const VersionControlInfoDialog = memo(function VersionControlInfoDialog({
  open,
  onOpenChange,
  sourceFolder,
  versionControlSystem,
  onVersionControlChange,
  onSave,
  deferDetection = false,
}: VersionControlInfoDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle>{t('settings.versioncontrol.title', 'Version Control Info')}</DialogTitle>
        </DialogHeader>
        <Card>
          <CardContent className="px-4 py-0">
            <VersionControlInfo
              sourceFolder={sourceFolder}
              versionControlSystem={versionControlSystem}
              onVersionControlChange={onVersionControlChange}
              onSave={onSave}
              deferDetection={deferDetection}
              embedded
            />
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
})
