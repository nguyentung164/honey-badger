'use client'

import { CircleArrowRight, CloudOff, GitBranch, GitBranchPlus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { type VariantProps } from 'class-variance-authority'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { type GitFile, GitSwitchBranchDialog } from '@/components/dialogs/git/GitSwitchBranchDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

const RESERVED_NAMES = ['HEAD', 'ORIG_HEAD', 'FETCH_HEAD', 'MERGE_HEAD']
const INVALID_CHARS_REGEX = /[~^:?*[\\]@{}]/
const EMPTY_BRANCH_LIST: string[] = []

interface BranchWithTracking {
  tracking?: string
  ahead?: number
  behind?: number
}

interface BranchesData {
  local: { all: string[]; current: string; branches?: Record<string, BranchWithTracking> }
  remote?: { all: string[] }
  current: string
}

function isUnmergedBranchDeleteError(message: string): boolean {
  const m = message.toLowerCase()
  const raw = message
  return m.includes('not fully merged') || m.includes('is not merged') || raw.includes('マージされていません') || m.includes('chưa được merge') || m.includes('chua duoc merge')
}

function validateBranchNameClient(name: string): { isValid: boolean; message?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { isValid: false, message: 'Branch name cannot be empty' }
  if (trimmed.length < 2) return { isValid: false, message: 'Branch name must be at least 2 characters long' }
  if (trimmed.length > 50) return { isValid: false, message: 'Branch name cannot exceed 50 characters' }
  if (INVALID_CHARS_REGEX.test(trimmed)) return { isValid: false, message: 'Branch name contains invalid characters' }
  if (RESERVED_NAMES.includes(trimmed.toUpperCase())) return { isValid: false, message: 'Branch name is reserved' }
  return { isValid: true }
}

type ButtonVariant = VariantProps<typeof buttonVariants>['variant']

/** Tách state ô tên branch khỏi dialog cha — gõ phím không re-render list (tránh giật layout). */
function BranchManageCreateSection({
  open,
  isLoading,
  branches,
  cwd,
  initialSourceBranch,
  buttonVariant,
  onSuccess,
  onClose,
}: {
  open: boolean
  isLoading: boolean
  branches: BranchesData | null
  cwd?: string
  initialSourceBranch: string
  buttonVariant: ButtonVariant
  onSuccess?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [newBranchName, setNewBranchName] = useState('')
  const [sourceBranchForCreate, setSourceBranchForCreate] = useState(initialSourceBranch)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const localBranches = branches?.local?.all ?? EMPTY_BRANCH_LIST
  const current = branches?.current ?? ''

  useEffect(() => {
    if (open) {
      setNewBranchName('')
      setSourceBranchForCreate(initialSourceBranch)
      setCreateError(null)
    }
  }, [open, initialSourceBranch])

  useEffect(() => {
    if (open && !isLoading && localBranches.length > 0 && !localBranches.includes(sourceBranchForCreate)) {
      setSourceBranchForCreate(current || localBranches[0])
    }
  }, [open, isLoading, localBranches, sourceBranchForCreate, current])

  const sourceBranchComboboxOptions = useMemo(
    () =>
      localBranches.map(b => {
        const isHead = b === current
        const label = isHead ? `${b} (${t('git.branchManage.current')})` : b
        return {
          value: b,
          label,
          listRender: (
            <span className={cn('inline-flex min-w-0 max-w-full items-baseline gap-1', isHead && 'font-medium text-green-600 dark:text-green-400')}>
              <span className="min-w-0 truncate">{b}</span>
              {isHead && <span className="shrink-0 text-green-600/80 dark:text-green-400/80">({t('git.branchManage.current')})</span>}
            </span>
          ),
        }
      }),
    [localBranches, current, t]
  )

  const handleCreateBranch = async () => {
    const name = newBranchName.trim()
    const validation = validateBranchNameClient(name)
    if (!validation.isValid) {
      setCreateError(validation.message ?? '')
      return
    }
    const localAll = branches?.local?.all ?? []
    if (localAll.includes(name)) {
      setCreateError(t('git.branchManage.duplicateName'))
      return
    }
    setCreateError(null)
    setIsCreating(true)
    try {
      let sourceRef = sourceBranchForCreate || undefined
      const tracking = sourceBranchForCreate ? branches?.local?.branches?.[sourceBranchForCreate]?.tracking : undefined
      if (tracking) {
        const remote = tracking.split('/')[0]
        const fetchResult = await window.api.git.fetch(remote, undefined, cwd)
        if (fetchResult.status !== 'success') {
          setCreateError(fetchResult.message ?? t('git.branchManage.fetchBeforeCreateError'))
          setIsCreating(false)
          return
        }
        sourceRef = tracking
      }
      const result = await window.api.git.create_branch(name, sourceRef)
      if (result.status === 'success') {
        toast.success(t('git.branchManage.createSuccess'))
        onSuccess?.()
        onClose()
      } else {
        setCreateError(result.message ?? t('git.branchManage.createError'))
      }
    } catch (error) {
      logger.error('Error creating branch:', error)
      setCreateError(t('git.branchManage.createError'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="shrink-0 space-y-1.5 rounded-md bg-muted/30 p-2">
      <Label className="text-xs font-medium">{t('git.branchManage.createBranch')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('git.branchManage.sourceBranch')}</Label>
          <Combobox
            value={sourceBranchForCreate}
            onValueChange={setSourceBranchForCreate}
            disabled={isCreating || isLoading || localBranches.length === 0}
            options={sourceBranchComboboxOptions}
            placeholder={isLoading ? t('common.loading') : localBranches.length === 0 ? t('git.branchManage.noBranches') : t('git.branchManage.sourceBranchPlaceholder')}
            searchPlaceholder={t('common.search')}
            emptyText={t('git.branchManage.sourceBranchEmpty')}
            size="sm"
            className="w-full"
          />
        </div>
        <div className="min-w-0 flex-[1.15] space-y-1 sm:min-w-[12rem]">
          <Label htmlFor="new-branch-name" className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('git.branchManage.newBranchName')}
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="new-branch-name"
              placeholder={t('git.branchManage.newBranchNamePlaceholder')}
              value={newBranchName}
              onChange={e => {
                setNewBranchName(e.target.value)
                setCreateError(null)
              }}
              onKeyDown={e => e.key === 'Enter' && handleCreateBranch()}
              disabled={isCreating}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <Button
              size="sm"
              variant={buttonVariant}
              onClick={handleCreateBranch}
              disabled={isCreating || !newBranchName.trim()}
              className="h-8 min-w-[4.5rem] shrink-0 px-2.5 text-xs sm:min-w-[5rem] sm:px-3"
            >
              {isCreating && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t('git.branchManage.create')}
            </Button>
          </div>
        </div>
      </div>
      <div className="min-h-[1.25rem]" aria-live="polite">
        {createError ? <p className="text-xs leading-tight text-destructive">{createError}</p> : null}
      </div>
    </div>
  )
}

interface GitBranchManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentBranch: string
  onSuccess?: () => void
  /** Git working directory (repo root). When provided, branch list and fetch use this repo (multi-repo). */
  cwd?: string
}

export function GitBranchManageDialog({ open, onOpenChange, currentBranch, onSuccess, cwd }: GitBranchManageDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [branches, setBranches] = useState<BranchesData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingBranch, setEditingBranch] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [offerForceDelete, setOfferForceDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteRemoteTarget, setDeleteRemoteTarget] = useState<{ remote: string; branchName: string } | null>(null)
  const [isDeletingRemote, setIsDeletingRemote] = useState(false)
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(() => new Set())
  const [bulkDeletePending, setBulkDeletePending] = useState<string[] | null>(null)
  const [bulkForcePending, setBulkForcePending] = useState<string[] | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [showSwitchBranchDialog, setShowSwitchBranchDialog] = useState(false)
  const [pendingSwitchBranch, setPendingSwitchBranch] = useState('')
  const [switchUncommittedFiles, setSwitchUncommittedFiles] = useState<GitFile[]>([])
  const [switchingToBranch, setSwitchingToBranch] = useState<string | null>(null)

  const localBranches = branches?.local?.all ?? EMPTY_BRANCH_LIST
  const remoteAll = branches?.remote?.all ?? []
  const current = branches?.current ?? currentBranch
  const defaultRemote = 'origin'
  const deletableLocalBranches = useMemo(() => localBranches.filter(b => b !== current), [localBranches, current])

  const isBranchOnRemote = (branchName: string, remote: string) => remoteAll.some(ref => ref === `${remote}/${branchName}`)

  const loadBranches = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await window.api.git.get_branches(cwd)
      if (result.status === 'success' && result.data) {
        setBranches({
          local: result.data.local,
          remote: result.data.remote,
          current: result.data.current,
        })
      } else {
        toast.error(result.message || t('git.branchManage.loadError'))
      }
    } catch (error) {
      logger.error('Error loading branches:', error)
      toast.error(t('git.branchManage.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [t, cwd])

  useEffect(() => {
    if (open) {
      loadBranches()
      setEditingBranch(null)
      setDeleteTarget(null)
      setOfferForceDelete(false)
      setDeleteRemoteTarget(null)
      setSelectedBranches(new Set())
      setBulkDeletePending(null)
      setBulkForcePending(null)
      setShowSwitchBranchDialog(false)
      setPendingSwitchBranch('')
      setSwitchUncommittedFiles([])
      setSwitchingToBranch(null)
    }
  }, [open, currentBranch, loadBranches])

  useEffect(() => {
    const allowed = new Set((branches?.local?.all ?? EMPTY_BRANCH_LIST).filter(b => b !== (branches?.current ?? currentBranch)))
    setSelectedBranches(prev => {
      let changed = false
      const next = new Set<string>()
      for (const b of prev) {
        if (allowed.has(b)) next.add(b)
        else changed = true
      }
      return changed || next.size !== prev.size ? next : prev
    })
  }, [branches, currentBranch])

  const startRename = (branchName: string) => {
    setSelectedBranches(prev => {
      if (!prev.has(branchName)) return prev
      const n = new Set(prev)
      n.delete(branchName)
      return n
    })
    setEditingBranch(branchName)
    setEditName(branchName)
  }

  const toggleBranchSelected = (branchName: string) => {
    setSelectedBranches(prev => {
      const n = new Set(prev)
      if (n.has(branchName)) n.delete(branchName)
      else n.add(branchName)
      return n
    })
  }

  const toggleSelectAllDeletable = () => {
    setSelectedBranches(prev => {
      if (deletableLocalBranches.length === 0) return prev
      const allOn = deletableLocalBranches.every(b => prev.has(b))
      return allOn ? new Set() : new Set(deletableLocalBranches)
    })
  }

  const selectAllCheckboxState: boolean | 'indeterminate' =
    deletableLocalBranches.length === 0 ? false : selectedBranches.size === deletableLocalBranches.length ? true : selectedBranches.size > 0 ? 'indeterminate' : false

  const runBulkDeleteSafe = async () => {
    if (!bulkDeletePending?.length) return
    const names = [...bulkDeletePending]
    setIsBulkDeleting(true)
    const successNames: string[] = []
    const unmergedNames: string[] = []
    try {
      for (const name of names) {
        const result = await window.api.git.delete_branch(name, false)
        if (result.status === 'success') {
          successNames.push(name)
        } else {
          const msg = result.message ?? ''
          if (isUnmergedBranchDeleteError(msg)) {
            unmergedNames.push(name)
          } else {
            toast.error(`${name}: ${msg || t('git.branchManage.deleteError')}`)
          }
        }
      }
      setBulkDeletePending(null)
      setSelectedBranches(prev => {
        const n = new Set(prev)
        for (const b of successNames) n.delete(b)
        return n
      })
      if (successNames.length > 0) {
        toast.success(t('git.branchManage.bulkDeleteSuccess', { count: successNames.length }))
        onSuccess?.()
        await loadBranches()
      }
      if (unmergedNames.length > 0) {
        setBulkForcePending(unmergedNames)
      }
    } catch (error) {
      logger.error('Error bulk-deleting branches:', error)
      toast.error(t('git.branchManage.deleteError'))
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const runBulkDeleteForce = async () => {
    if (!bulkForcePending?.length) return
    const names = [...bulkForcePending]
    setIsBulkDeleting(true)
    const successNames: string[] = []
    try {
      for (const name of names) {
        const result = await window.api.git.delete_branch(name, true)
        if (result.status === 'success') {
          successNames.push(name)
        } else {
          toast.error(`${name}: ${result.message ?? t('git.branchManage.deleteError')}`)
        }
      }
      setBulkForcePending(null)
      setSelectedBranches(prev => {
        const n = new Set(prev)
        for (const b of successNames) n.delete(b)
        return n
      })
      if (successNames.length > 0) {
        toast.success(t('git.branchManage.bulkDeleteSuccess', { count: successNames.length }))
        onSuccess?.()
        await loadBranches()
      }
    } catch (error) {
      logger.error('Error force bulk-deleting branches:', error)
      toast.error(t('git.branchManage.deleteError'))
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const cancelRename = () => {
    setEditingBranch(null)
    setEditName('')
  }

  const handleRename = async () => {
    if (!editingBranch) return
    const name = editName.trim()
    const validation = validateBranchNameClient(name)
    if (!validation.isValid) {
      toast.error(validation.message)
      return
    }
    if (name === editingBranch) {
      cancelRename()
      return
    }
    const localAll = branches?.local?.all ?? []
    if (localAll.includes(name)) {
      toast.error(t('git.branchManage.duplicateName'))
      return
    }
    setIsRenaming(true)
    try {
      const result = await window.api.git.rename_branch(editingBranch, name)
      if (result.status === 'success') {
        toast.success(t('git.branchManage.renameSuccess'))
        onSuccess?.()
        await loadBranches()
        cancelRename()
      } else {
        toast.error(result.message ?? t('git.branchManage.renameError'))
      }
    } catch (error) {
      logger.error('Error renaming branch:', error)
      toast.error(t('git.branchManage.renameError'))
    } finally {
      setIsRenaming(false)
    }
  }

  const confirmDelete = (branchName: string) => {
    setOfferForceDelete(false)
    setDeleteTarget(branchName)
  }

  const handleDelete = async (force: boolean) => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const result = await window.api.git.delete_branch(deleteTarget, force)
      if (result.status === 'success') {
        toast.success(t('git.branchManage.deleteSuccess'))
        onSuccess?.()
        setDeleteTarget(null)
        setOfferForceDelete(false)
        await loadBranches()
      } else {
        const msg = result.message ?? ''
        if (!force && isUnmergedBranchDeleteError(msg)) {
          setOfferForceDelete(true)
        } else {
          toast.error(msg || t('git.branchManage.deleteError'))
        }
      }
    } catch (error) {
      logger.error('Error deleting branch:', error)
      toast.error(t('git.branchManage.deleteError'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteRemote = async () => {
    if (!deleteRemoteTarget) return
    setIsDeletingRemote(true)
    try {
      const result = await window.api.git.delete_remote_branch(deleteRemoteTarget.remote, deleteRemoteTarget.branchName)
      if (result.status === 'success') {
        toast.success(t('git.branchManage.deleteRemoteSuccess'))
        onSuccess?.()
        setDeleteRemoteTarget(null)
        await loadBranches()
      } else {
        toast.error(result.message ?? t('git.branchManage.deleteRemoteError'))
      }
    } catch (error) {
      logger.error('Error deleting remote branch:', error)
      toast.error(t('git.branchManage.deleteRemoteError'))
    } finally {
      setIsDeletingRemote(false)
    }
  }

  const handleSwitchToBranch = async (branchName: string) => {
    const head = branches?.current ?? current
    if (branchName === head || !cwd) return
    setSwitchingToBranch(branchName)
    try {
      const result = await window.api.git.checkout_branch(branchName, undefined, cwd)
      if (result.status === 'error' && result.data?.hasUncommittedChanges) {
        setPendingSwitchBranch(branchName)
        const rawFiles = result.data.files || []
        setSwitchUncommittedFiles(
          Array.isArray(rawFiles)
            ? rawFiles.map((file: any) => ({
              filePath: typeof file === 'string' ? file : file.path,
              status: file.working_dir ?? file.index ?? 'M',
            }))
            : []
        )
        setShowSwitchBranchDialog(true)
        return
      }
      if (result.status === 'success') {
        toast.success(t('git.branchManage.switchSuccess', { name: branchName }))
        await loadBranches()
        onSuccess?.()
      } else {
        toast.error(result.message || t('git.branchManage.switchError'))
      }
    } catch (error) {
      logger.error('Error switching branch:', error)
      toast.error(t('git.branchManage.switchError'))
    } finally {
      setSwitchingToBranch(null)
    }
  }

  const handleSwitchStashAndContinue = async () => {
    if (!cwd || !pendingSwitchBranch) return
    const target = pendingSwitchBranch
    setShowSwitchBranchDialog(false)
    setSwitchingToBranch(target)
    try {
      const result = await window.api.git.checkout_branch(target, { stash: true }, cwd)
      if (result.status === 'success') {
        toast.success(t('git.branchManage.switchSuccess', { name: target }))
        setPendingSwitchBranch('')
        setSwitchUncommittedFiles([])
        await loadBranches()
        onSuccess?.()
      } else {
        toast.error(result.message || t('git.branchManage.switchError'))
      }
    } catch (error) {
      logger.error('Error stash and switch branch:', error)
      toast.error(t('git.branchManage.switchError'))
    } finally {
      setSwitchingToBranch(null)
    }
  }

  const handleSwitchForceContinue = async () => {
    if (!cwd || !pendingSwitchBranch) return
    const target = pendingSwitchBranch
    setShowSwitchBranchDialog(false)
    setSwitchingToBranch(target)
    try {
      const result = await window.api.git.checkout_branch(target, { force: true }, cwd)
      if (result.status === 'success') {
        toast.success(t('git.branchManage.switchSuccess', { name: target }))
        setPendingSwitchBranch('')
        setSwitchUncommittedFiles([])
        await loadBranches()
        onSuccess?.()
      } else {
        toast.error(result.message || t('git.branchManage.switchError'))
      }
    } catch (error) {
      logger.error('Error force switch branch:', error)
      toast.error(t('git.branchManage.switchError'))
    } finally {
      setSwitchingToBranch(null)
    }
  }

  const handleSwitchBranchDialogCancel = () => {
    setShowSwitchBranchDialog(false)
    setPendingSwitchBranch('')
    setSwitchUncommittedFiles([])
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,640px)]! min-h-0 max-w-md flex-col gap-3 overflow-hidden p-4">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="flex items-center gap-1.5 text-base leading-tight">
              <GitBranchPlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {t('git.branchManage.title')}
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug text-muted-foreground">{t('git.branchManage.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <BranchManageCreateSection
              open={open}
              isLoading={isLoading}
              branches={branches}
              cwd={cwd}
              initialSourceBranch={currentBranch}
              buttonVariant={buttonVariant ?? 'default'}
              onSuccess={() => {
                void loadBranches()
                onSuccess?.()
              }}
              onClose={() => onOpenChange(false)}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
                  <Label className="text-xs font-medium leading-none">{t('git.branchManage.localBranches')}</Label>
                  {!isLoading && deletableLocalBranches.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id="git-branch-select-all-delete"
                        checked={selectAllCheckboxState === 'indeterminate' ? 'indeterminate' : selectAllCheckboxState}
                        onCheckedChange={() => toggleSelectAllDeletable()}
                        disabled={isBulkDeleting}
                        className="shrink-0"
                      />
                      <Label htmlFor="git-branch-select-all-delete" className="cursor-pointer text-[10px] font-normal leading-none text-muted-foreground">
                        {t('git.branchManage.selectAllDeletable')}
                      </Label>
                    </div>
                  )}
                </div>
                <div className="flex h-7 flex-wrap items-center justify-end gap-2 pl-0.5 sm:pl-0">
                  {selectedBranches.size > 0 && (
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      className="h-6 shrink-0 gap-1 px-1.5 py-0 text-[10px] font-medium leading-tight"
                      disabled={isBulkDeleting}
                      onClick={() => setBulkDeletePending([...selectedBranches])}
                    >
                      {isBulkDeleting ? <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" /> : <Trash2 className="h-2.5 w-2.5 shrink-0" />}
                      {t('git.branchManage.deleteSelected', { count: selectedBranches.size })}
                    </Button>
                  )}
                  {!isLoading && localBranches.length > 0 && <span className="text-[10px] tabular-nums leading-none text-muted-foreground">{localBranches.length}</span>}
                </div>
              </div>
              {isLoading ? (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/70 py-10">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/70 bg-muted/10">
                  {/* flex + ScrollArea hay gãy chiều cao; overflow-y-auto + min-h-0 + h-0 để luôn có scroll dọc khi list dài */}
                  <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
                    <div className="p-1">
                      {localBranches.length === 0 ? (
                        <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-muted-foreground">{t('git.branchManage.noBranches')}</p>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {localBranches.map(branch => {
                            const isHead = branch === current
                            return (
                              <li key={branch}>
                                {editingBranch === branch ? (
                                  <div className="flex items-center gap-1 rounded-md border border-border/80 bg-background px-1 py-0.5 shadow-sm">
                                    <Input
                                      className="h-6 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-1"
                                      value={editName}
                                      onChange={e => setEditName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleRename()
                                        if (e.key === 'Escape') cancelRename()
                                      }}
                                      autoFocus
                                      disabled={isRenaming}
                                    />
                                    <Button
                                      size="sm"
                                      variant={buttonVariant}
                                      className="h-6 shrink-0 px-2 text-[11px]"
                                      onClick={handleRename}
                                      disabled={isRenaming || !editName.trim()}
                                    >
                                      {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : t('common.save')}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]" onClick={cancelRename} disabled={isRenaming}>
                                      {t('common.cancel')}
                                    </Button>
                                  </div>
                                ) : (
                                  <div
                                    className={cn(
                                      'group flex min-h-[30px] items-center gap-2 rounded-md px-2 py-1 transition-colors',
                                      isHead ? 'bg-green-500/[0.08] ring-1 ring-inset ring-green-500/15 dark:bg-green-500/[0.1] dark:ring-green-500/20' : 'hover:bg-muted/60'
                                    )}
                                  >
                                    {isHead ? (
                                      <span className="w-4 shrink-0" aria-hidden />
                                    ) : (
                                      <Checkbox
                                        id={`git-branch-del-${branch}`}
                                        checked={selectedBranches.has(branch)}
                                        onCheckedChange={() => toggleBranchSelected(branch)}
                                        disabled={isBulkDeleting || switchingToBranch !== null}
                                        className="shrink-0"
                                        onClick={e => e.stopPropagation()}
                                        aria-label={t('git.branchManage.selectBranchForBulkDelete', { name: branch })}
                                      />
                                    )}
                                    <GitBranch className={cn('h-3.5 w-3.5 shrink-0', isHead ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/55')} aria-hidden />
                                    <span
                                      className={cn(
                                        'min-w-0 flex-1 truncate text-xs leading-snug',
                                        isHead ? 'font-medium text-green-700 dark:text-green-400' : 'text-foreground/90'
                                      )}
                                      title={branch}
                                    >
                                      {branch}
                                    </span>
                                    {isHead && (
                                      <span
                                        className="max-w-[5.5rem] shrink-0 truncate rounded-sm bg-green-500/[0.12] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800 dark:border-green-500/35 dark:text-green-400"
                                        title={t('git.branchManage.current')}
                                      >
                                        {t('git.branchManage.current')}
                                      </span>
                                    )}
                                    <div className="ml-auto flex shrink-0 items-center gap-px opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                      {!isHead && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 w-5 shrink-0 p-0 text-primary hover:bg-primary/10 hover:text-primary"
                                          disabled={isBulkDeleting || switchingToBranch !== null}
                                          onClick={() => handleSwitchToBranch(branch)}
                                          title={t('git.branchManage.switchToBranch')}
                                        >
                                          {switchingToBranch === branch ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <CircleArrowRight className="h-3 w-3" />
                                          )}
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                                        disabled={isBulkDeleting || switchingToBranch !== null}
                                        onClick={() => startRename(branch)}
                                        title={t('git.branchManage.rename')}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      {isBranchOnRemote(branch, defaultRemote) && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                                          disabled={isBulkDeleting || switchingToBranch !== null}
                                          onClick={() => setDeleteRemoteTarget({ remote: defaultRemote, branchName: branch })}
                                          title={t('git.branchManage.deleteOnRemote')}
                                        >
                                          <CloudOff className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {branch !== current && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                          disabled={isBulkDeleting || switchingToBranch !== null}
                                          onClick={() => confirmDelete(branch)}
                                          title={t('git.branchManage.delete')}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-2">
            <Button size="sm" variant={buttonVariant} onClick={() => onOpenChange(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null)
            setOfferForceDelete(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.branchManage.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>{t('git.branchManage.deleteConfirm', { name: deleteTarget ?? '' })}</p>
                {offerForceDelete && <p className="text-amber-700 dark:text-amber-400">{t('git.branchManage.deleteNotMergedHint')}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            {offerForceDelete ? (
              <AlertDialogAction
                onClick={e => {
                  e.preventDefault()
                  void handleDelete(true)
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {t('git.branchManage.forceDelete')}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={e => {
                  e.preventDefault()
                  void handleDelete(false)
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {t('git.branchManage.delete')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeletePending !== null}
        onOpenChange={open => {
          if (!open && !isBulkDeleting) setBulkDeletePending(null)
        }}
      >
        <AlertDialogContent className="min-w-0 max-w-[min(100vw-2rem,32rem)]">
          <AlertDialogHeader className="min-w-0 sm:max-w-none">
            <AlertDialogTitle className="break-words">{t('git.branchManage.deleteBulkConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="min-w-0 w-full max-w-full space-y-2 text-left text-sm text-muted-foreground">
                <p className="break-words">
                  {t('git.branchManage.deleteBulkConfirm', {
                    count: bulkDeletePending?.length ?? 0,
                  })}
                </p>
                {bulkDeletePending && bulkDeletePending.length > 0 && (
                  <div className="max-h-36 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                    <ul className="list-none space-y-1.5">
                      {bulkDeletePending.map(name => (
                        <li key={name} className="flex min-w-0 gap-2 font-mono text-[11px] text-foreground/90" title={name}>
                          <span className="shrink-0 text-muted-foreground" aria-hidden>
                            •
                          </span>
                          <span className="min-w-0 flex-1 break-all">{name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                void runBulkDeleteSafe()
              }}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('git.branchManage.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkForcePending !== null}
        onOpenChange={open => {
          if (!open && !isBulkDeleting) setBulkForcePending(null)
        }}
      >
        <AlertDialogContent className="min-w-0 max-w-[min(100vw-2rem,32rem)]">
          <AlertDialogHeader className="min-w-0 sm:max-w-none">
            <AlertDialogTitle className="break-words">{t('git.branchManage.bulkForceDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="min-w-0 w-full max-w-full space-y-2 text-left text-sm text-muted-foreground">
                <p className="break-words">{t('git.branchManage.bulkForceDeleteDescription')}</p>
                {bulkForcePending && bulkForcePending.length > 0 && (
                  <>
                    <p className="break-words text-amber-700 dark:text-amber-400">{t('git.branchManage.deleteNotMergedHint')}</p>
                    <div className="max-h-36 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                      <ul className="list-none space-y-1.5">
                        {bulkForcePending.map(name => (
                          <li key={name} className="flex min-w-0 gap-2 font-mono text-[11px] text-foreground/90" title={name}>
                            <span className="shrink-0 text-muted-foreground" aria-hidden>
                              •
                            </span>
                            <span className="min-w-0 flex-1 break-all">{name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                void runBulkDeleteForce()
              }}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('git.branchManage.forceDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteRemoteTarget} onOpenChange={open => !open && setDeleteRemoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.branchManage.deleteRemoteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRemoteTarget
                ? t('git.branchManage.deleteRemoteConfirm', {
                    name: deleteRemoteTarget.branchName,
                    remote: deleteRemoteTarget.remote,
                  })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRemote}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRemote} disabled={isDeletingRemote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeletingRemote ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t('git.branchManage.deleteOnRemote')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GitSwitchBranchDialog
        open={showSwitchBranchDialog}
        onOpenChange={open => {
          if (!open) handleSwitchBranchDialogCancel()
        }}
        currentBranch={current}
        targetBranch={pendingSwitchBranch}
        changedFiles={switchUncommittedFiles}
        onStashAndSwitch={handleSwitchStashAndContinue}
        onForceSwitch={handleSwitchForceContinue}
        onCancel={handleSwitchBranchDialogCancel}
      />
    </>
  )
}
