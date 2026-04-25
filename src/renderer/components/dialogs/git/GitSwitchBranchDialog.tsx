'use client'

import { AlertTriangle, Archive, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

export interface GitFile {
  filePath: string
  status: string
}

interface GitSwitchBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentBranch: string
  targetBranch: string
  changedFiles: GitFile[]
  onStashAndSwitch: () => void
  onForceSwitch: () => void
  onCancel: () => void
}

export function GitSwitchBranchDialog({ open, onOpenChange, currentBranch, targetBranch, changedFiles, onStashAndSwitch, onForceSwitch, onCancel }: GitSwitchBranchDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [selectedAction, setSelectedAction] = useState<'stash' | 'force' | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedAction(null)
    }
  }, [open])

  const handleConfirm = () => {
    if (selectedAction === 'stash') {
      onStashAndSwitch()
    } else if (selectedAction === 'force') {
      onForceSwitch()
    }
    onOpenChange(false)
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'modified':
      case 'm':
        return 'text-blue-600 dark:text-blue-400'
      case 'added':
      case 'a':
      case 'untracked':
      case '?':
        return 'text-green-600 dark:text-green-400'
      case 'deleted':
      case 'd':
        return 'text-red-600 dark:text-red-400'
      case 'renamed':
      case 'r':
        return 'text-purple-600 dark:text-purple-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    if (statusLower === 'modified' || statusLower === 'm') return 'M'
    if (statusLower === 'added' || statusLower === 'a') return 'A'
    if (statusLower === 'deleted' || statusLower === 'd') return 'D'
    if (statusLower === 'renamed' || statusLower === 'r') return 'R'
    if (statusLower === 'untracked' || statusLower === '?') return 'U'
    return '?'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {t('git.switchBranch.title')}
          </DialogTitle>
          <DialogDescription>{t('git.switchBranch.description', { currentBranch, targetBranch })}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-2">
              {changedFiles.length > 0 ? t('git.switchBranch.changesWarning', { count: changedFiles.length }) : t('git.switchBranch.changesWarningGeneric')}
            </p>
            <div className="h-[200px] max-h-[40vh] border rounded-md overflow-y-auto overflow-x-hidden">
              <div className="p-3 space-y-1">
                {changedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm py-1 min-w-0">
                    <div
                      className={`flex-shrink-0 w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold text-white ${
                        file.status.toLowerCase() === 'modified' || file.status === 'M'
                          ? 'bg-blue-500'
                          : file.status.toLowerCase() === 'added' || file.status === 'A' || file.status === '?'
                            ? 'bg-green-500'
                            : file.status.toLowerCase() === 'deleted' || file.status === 'D'
                              ? 'bg-red-500'
                              : file.status.toLowerCase() === 'renamed' || file.status === 'R'
                                ? 'bg-purple-500'
                                : 'bg-gray-500'
                      }`}
                    >
                      {getStatusBadge(file.status)}
                    </div>
                    <span className={`flex-1 min-w-0 truncate ${getStatusColor(file.status)}`} title={file.filePath}>
                      {file.filePath}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Chọn hành động:</p>

            {/* Stash Option */}
            <button
              type="button"
              onClick={() => setSelectedAction('stash')}
              className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                selectedAction === 'stash' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <Archive className={`h-5 w-5 mt-0.5 ${selectedAction === 'stash' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <div className="font-semibold mb-1">{t('git.switchBranch.stashAndSwitch')}</div>
                  <div className="text-sm text-muted-foreground">{t('git.switchBranch.stashDescription')}</div>
                </div>
              </div>
            </button>

            {/* Force Option */}
            <button
              type="button"
              onClick={() => setSelectedAction('force')}
              className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                selectedAction === 'force' ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-border hover:border-red-300 dark:hover:border-red-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <XCircle className={`h-5 w-5 mt-0.5 ${selectedAction === 'force' ? 'text-red-500' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <div className="font-semibold mb-1 text-red-600 dark:text-red-400">{t('git.switchBranch.forceSwitch')}</div>
                  <div className="text-sm text-muted-foreground">{t('git.switchBranch.forceDescription')}</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant={buttonVariant} onClick={onCancel}>
            {t('git.switchBranch.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedAction} variant={selectedAction === 'force' ? 'destructive' : buttonVariant}>
            {selectedAction === 'stash' && (
              <>
                <Archive className="h-4 w-4 mr-2" />
                {t('git.switchBranch.stashAndSwitch')}
              </>
            )}
            {selectedAction === 'force' && (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                {t('git.switchBranch.forceSwitch')}
              </>
            )}
            {!selectedAction && t('git.switchBranch.selectAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
