'use client'

import { GitBranchPlus, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitConflictPanel } from '@/components/conflict/GitConflictPanel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

type RebaseAction = 'pick' | 'squash' | 'fixup' | 'drop'

interface CommitItem {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  date: string
}

interface TodoItem {
  hash: string
  shortHash: string
  action: RebaseAction
  message: string
  author: string
  date: string
}

interface GitInteractiveRebaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  baseRef?: string
  onComplete?: () => void
}

export function GitInteractiveRebaseDialog({ open, onOpenChange, baseRef: initialBaseRef = 'HEAD~10', onComplete }: GitInteractiveRebaseDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const sourceFolder = useConfigurationStore(s => s.sourceFolder)
  const [baseRef, setBaseRef] = useState(initialBaseRef || 'HEAD~10')
  const [commits, setCommits] = useState<CommitItem[]>([])
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRebasing, setIsRebasing] = useState(false)
  const [rebaseStatus, setRebaseStatus] = useState<{ isInRebase: boolean; conflictedFiles: string[] } | null>(null)
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false)

  const loadCommits = useCallback(
    async (overrideBaseRef?: string) => {
      const ref = overrideBaseRef ?? baseRef
      if (!sourceFolder || !ref.trim()) return
      setIsLoading(true)
      try {
        const result = await window.api.git.get_interactive_rebase_commits(ref, sourceFolder)
        if (result.status === 'success' && result.data) {
          setCommits(result.data)
          setTodoItems(
            result.data.map((c: CommitItem) => ({
              hash: c.hash,
              shortHash: c.shortHash,
              action: 'pick' as RebaseAction,
              message: c.subject,
              author: c.author,
              date: c.date,
            }))
          )
        } else {
          toast.error(result.message || t('git.interactiveRebase.loadError', 'Failed to load commits'))
          setCommits([])
          setTodoItems([])
        }
      } catch (_err) {
        toast.error(t('git.interactiveRebase.loadError', 'Failed to load commits'))
        setCommits([])
        setTodoItems([])
      } finally {
        setIsLoading(false)
      }
    },
    [sourceFolder, baseRef, t]
  )

  const loadRebaseStatus = useCallback(async () => {
    try {
      const result = await window.api.git.get_rebase_status(sourceFolder || undefined)
      if (result.status === 'success' && result.data) {
        setRebaseStatus({
          isInRebase: result.data.isInRebase,
          conflictedFiles: result.data.conflictedFiles || [],
        })
      }
    } catch {
      setRebaseStatus(null)
    }
  }, [sourceFolder])

  useEffect(() => {
    if (initialBaseRef) {
      setBaseRef(initialBaseRef)
    }
  }, [initialBaseRef])

  useEffect(() => {
    if (open && sourceFolder) {
      loadRebaseStatus()
      const ref = initialBaseRef || baseRef
      if (ref.trim()) {
        void loadCommits(ref)
      } else {
        setCommits([])
        setTodoItems([])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on open only; Refresh button for baseRef change
  }, [open, sourceFolder, initialBaseRef])

  const setAction = (index: number, action: RebaseAction) => {
    setTodoItems(prev => {
      const next = [...prev]
      next[index] = { ...next[index], action }
      return next
    })
  }

  const handleStartRebase = async () => {
    const hasPick = todoItems.some(t => t.action === 'pick')
    if (!hasPick) {
      toast.error(t('git.interactiveRebase.needPick', 'At least one commit must be kept (pick)'))
      return
    }

    const firstPickIndex = todoItems.findIndex(t => t.action === 'pick')
    if (firstPickIndex >= 0) {
      const hasSquashFixupBeforeFirstPick = todoItems.slice(0, firstPickIndex).some(t => t.action === 'squash' || t.action === 'fixup')
      if (hasSquashFixupBeforeFirstPick) {
        toast.error(t('git.interactiveRebase.firstMustBePick', 'First kept commit must be pick'))
        return
      }
    }

    setIsRebasing(true)
    try {
      const payload = todoItems.map(t => ({
        hash: t.hash,
        shortHash: t.shortHash,
        action: t.action,
        message: t.message,
        author: t.author,
        date: t.date,
      }))
      const result = await window.api.git.start_interactive_rebase(baseRef, payload, sourceFolder || undefined)

      if (result.status === 'success') {
        toast.success(t('git.interactiveRebase.success', 'Interactive rebase completed'))
        onComplete?.()
        onOpenChange(false)
        window.dispatchEvent(new CustomEvent('git-branch-changed'))
      } else if (result.status === 'conflict') {
        toast.warning(t('git.interactiveRebase.conflicts', 'Rebase conflicts detected'))
        await loadRebaseStatus()
      } else {
        toast.error(result.message || t('git.interactiveRebase.error', 'Interactive rebase failed'))
      }
    } catch (_err) {
      toast.error(t('git.interactiveRebase.error', 'Interactive rebase failed'))
    } finally {
      setIsRebasing(false)
    }
  }

  const handleAbortRebaseClick = () => {
    setAbortConfirmOpen(true)
  }

  const handleAbortRebaseConfirm = async () => {
    setAbortConfirmOpen(false)
    setIsRebasing(true)
    try {
      const result = await window.api.git.abort_rebase(sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('git.rebase.abortSuccess'))
        setRebaseStatus(null)
        onComplete?.()
      } else {
        toast.error(result.message || t('git.rebase.abortError'))
      }
    } catch {
      toast.error(t('git.rebase.abortError'))
    } finally {
      setIsRebasing(false)
    }
  }

  const isInRebase = rebaseStatus?.isInRebase
  const hasConflicts = (rebaseStatus?.conflictedFiles?.length ?? 0) > 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranchPlus className="h-5 w-5" />
              {t('git.interactiveRebase.title', 'Interactive Rebase')}
            </DialogTitle>
            <DialogDescription>
              {isInRebase
                ? t('git.interactiveRebase.inRebaseDescription', 'Rebase in progress. Resolve conflicts or abort.')
                : t('git.interactiveRebase.description', 'Edit commit history: pick, squash, fixup, or drop commits.')}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {isInRebase && hasConflicts ? (
              <GitConflictPanel
                sourceFolder={sourceFolder || undefined}
                onResolved={() => {
                  loadRebaseStatus()
                  onComplete?.()
                  onOpenChange(false)
                }}
              />
            ) : isInRebase ? (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t('git.rebase.rebaseInProgress')}</p>
                <Button variant="destructive" size="sm" onClick={handleAbortRebaseClick} disabled={isRebasing}>
                  {t('git.rebase.abortRebase')}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('git.interactiveRebase.baseRef', 'Base (parent of first commit to edit)')}</Label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                      value={baseRef}
                      onChange={e => setBaseRef(e.target.value)}
                      placeholder="HEAD~10"
                    />
                    <Button variant={buttonVariant} size="sm" onClick={() => loadCommits()} disabled={isLoading || !baseRef.trim()}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.refresh')}
                    </Button>
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : commits.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {baseRef.trim()
                      ? t('git.interactiveRebase.noCommits', 'No commits found. Try a different base ref.')
                      : t('git.interactiveRebase.enterBaseRef', 'Enter base ref (e.g. HEAD~10) and load.')}
                  </div>
                ) : (
                  <ScrollArea className="h-[280px] border rounded-md">
                    <div className="p-2 space-y-1">
                      {todoItems.map((item, idx) => (
                        <div key={item.hash} className="flex items-center gap-2 py-2 px-3 rounded hover:bg-muted/50">
                          <Combobox
                            value={item.action}
                            onValueChange={v => setAction(idx, v as RebaseAction)}
                            options={[
                              { value: 'pick', label: t('git.interactiveRebase.pick', 'pick') },
                              { value: 'squash', label: t('git.interactiveRebase.squash', 'squash'), disabled: idx === 0 },
                              { value: 'fixup', label: t('git.interactiveRebase.fixup', 'fixup'), disabled: idx === 0 },
                              { value: 'drop', label: t('git.interactiveRebase.drop', 'drop') },
                            ]}
                            className="w-[100px]"
                            triggerClassName="h-8"
                            size="sm"
                          />
                          <span className="font-mono text-xs text-muted-foreground w-16">{item.shortHash}</span>
                          <span className="flex-1 truncate text-sm">{item.message}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant={buttonVariant} onClick={() => onOpenChange(false)}>
              {t('common.close')}
            </Button>
            {!isInRebase && commits.length > 0 && (
              <Button variant={buttonVariant} onClick={handleStartRebase} disabled={isRebasing}>
                {isRebasing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitBranchPlus className="h-4 w-4 mr-2" />}
                {t('git.interactiveRebase.startRebase', 'Start Rebase')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={abortConfirmOpen} onOpenChange={setAbortConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.rebase.abortRebase')}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.rebase.abortConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleAbortRebaseConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('git.rebase.abortRebase')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
