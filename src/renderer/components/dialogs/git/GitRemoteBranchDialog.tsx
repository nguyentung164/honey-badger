'use client'

import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

export type GitRemoteBranchMode = 'pull' | 'push'

interface GitRemoteBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: GitRemoteBranchMode
  currentBranch?: string
  onConfirm: (remote: string, branch: string) => void | Promise<void>
  /** Git working directory (repo root). When provided, remotes/branches use this repo (multi-repo). */
  cwd?: string
}

export function GitRemoteBranchDialog({
  open,
  onOpenChange,
  mode,
  currentBranch,
  onConfirm,
  cwd,
}: GitRemoteBranchDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [remotes, setRemotes] = useState<string[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [remote, setRemote] = useState('origin')
  const [branch, setBranch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    if (!open) return
    setIsLoading(true)
    try {
      const [remotesRes, branchesRes] = await Promise.all([
        window.api.git.get_remotes(cwd),
        window.api.git.get_branches(cwd),
      ])
      const remoteNames =
        remotesRes?.status === 'success' && remotesRes.data
          ? Object.keys(remotesRes.data as Record<string, unknown>)
          : ['origin']
      setRemotes(remoteNames)
      if (remoteNames.length && !remoteNames.includes(remote)) setRemote(remoteNames[0])

      const localAll =
        branchesRes?.status === 'success' && branchesRes.data?.local?.all
          ? (branchesRes.data.local.all as string[])
          : []
      setBranches(localAll)
      const defaultBranch = currentBranch && localAll.includes(currentBranch) ? currentBranch : localAll[0] ?? ''
      setBranch(defaultBranch)
    } catch (error) {
      logger.error('Error loading remotes/branches:', error)
      toast.error(t('git.remoteBranch.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [open, remote, currentBranch, cwd])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  const handleConfirm = async () => {
    if (!remote || !branch) return
    setIsSubmitting(true)
    try {
      await onConfirm(remote, branch)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const titleKey = mode === 'pull' ? 'git.remoteBranch.pullFromTitle' : 'git.remoteBranch.pushToTitle'
  const confirmKey = mode === 'pull' ? 'git.remoteBranch.pull' : 'git.remoteBranch.push'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] gap-3 p-4 sm:max-w-sm">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base leading-tight">{t(titleKey)}</DialogTitle>
          <DialogDescription className="text-xs leading-snug text-muted-foreground">
            {t('git.remoteBranch.description')}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-5">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">{t('git.remoteBranch.remote')}</Label>
              <Select value={remote} onValueChange={setRemote}>
                <SelectTrigger size="sm" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {remotes.map(r => (
                    <SelectItem key={r} value={r} className="py-1.5 text-sm">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">{t('git.remoteBranch.branch')}</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger size="sm" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {branches.map(b => {
                    const isRepoHead = Boolean(currentBranch && b === currentBranch)
                    return (
                      <SelectItem
                        key={b}
                        value={b}
                        showCheck={false}
                        className={cn(
                          'py-1.5 text-sm',
                          isRepoHead &&
                            'font-medium text-green-600 focus:bg-green-500/10 focus:text-green-700 dark:text-green-400 dark:focus:bg-green-500/15 dark:focus:text-green-300'
                        )}
                      >
                        {b}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            size="sm"
            variant={buttonVariant}
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant={buttonVariant}
            onClick={handleConfirm}
            disabled={isLoading || isSubmitting || !remote || !branch}
            className="gap-1.5"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t(confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
