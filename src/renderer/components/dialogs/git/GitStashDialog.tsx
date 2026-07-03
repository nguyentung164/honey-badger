'use client'

import { DiffEditor, useMonaco } from '@monaco-editor/react'
import { useAppMonacoThemeId, useSyncAppMonacoTheme } from '@/hooks/useAppMonacoTheme'
import { Archive, Eye, GitBranch, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from 'shared/utils'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import toast from '@/components/ui-elements/Toast'
import { getEditorLanguage } from '@/lib/editorLanguage'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

interface StashEntry {
  index: number
  hash: string
  date: string
  message: string
  author_name?: string
  author_email?: string
}

function stashRenameErrorKey(code?: string): string {
  switch (code) {
    case 'STASH_MESSAGE_REQUIRED':
      return 'git.stash.renameErrorMessageRequired'
    case 'STASH_NOT_FOUND':
      return 'git.stash.renameErrorNotFound'
    case 'STASH_RENAME_DROP_FAILED':
      return 'git.stash.renameErrorDropFailed'
    case 'NOT_A_REPO':
      return 'git.stash.renameErrorNotRepo'
    default:
      return 'git.stash.renameError'
  }
}

interface GitStashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStashApplied?: () => void
  /** Git working directory (repo root). When provided, all stash operations use this repo (multi-repo). */
  cwd?: string
}

export function GitStashDialog({ open, onOpenChange, onStashApplied, cwd }: GitStashDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const language = useAppearanceStoreSelect(s => s.language)
  const monaco = useMonaco()
  const monacoTheme = useAppMonacoThemeId()
  useSyncAppMonacoTheme(monaco, { includeDiff: true, includeEditorRules: false })

  const stashEditorTheme = monacoTheme
  const stashEditorOptions = {
    readOnly: true,
    fontSize: 12,
    fontFamily: 'JetBrains Mono, Menlo, monospace',
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    minimap: { enabled: false },
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    renderValidationDecorations: 'off' as const,
  }
  const [stashList, setStashList] = useState<StashEntry[]>([])
  const [stashApplied, setStashApplied] = useState<Record<number, boolean>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [operatingIndex, setOperatingIndex] = useState<number | null>(null)
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false)
  const [dropConfirmIndex, setDropConfirmIndex] = useState<number | null>(null)
  const [stashMessage, setStashMessage] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [viewStashIndex, setViewStashIndex] = useState<number | null>(null)
  const [viewStashFiles, setViewStashFiles] = useState<{ path: string; status: string }[]>([])
  const [viewStashSelectedPath, setViewStashSelectedPath] = useState<string | null>(null)
  const [viewStashFileOriginal, setViewStashFileOriginal] = useState('')
  const [viewStashFileModified, setViewStashFileModified] = useState('')
  const [loadedPathForDiff, setLoadedPathForDiff] = useState<string | null>(null)
  const [isLoadingView, setIsLoadingView] = useState(false)
  const [isLoadingFileDiff, setIsLoadingFileDiff] = useState(false)
  const [branchDialogStashIndex, setBranchDialogStashIndex] = useState<number | null>(null)
  const [branchNameInput, setBranchNameInput] = useState('')
  const [isBranching, setIsBranching] = useState(false)
  const [renameDialogStashIndex, setRenameDialogStashIndex] = useState<number | null>(null)
  const [renameMessageInput, setRenameMessageInput] = useState('')
  const [renameOriginalMessage, setRenameOriginalMessage] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [restoreIndex, setRestoreIndex] = useState(false)

  const isStashListBusy = operatingIndex !== null || isRenaming || isBranching || isCreating

  const loadStashList = async () => {
    setIsLoading(true)
    try {
      const result = await window.api.git.stash_list(cwd)
      if (result.status === 'success') {
        const list = result.data || []
        setStashList(list)
        logger.info('Stash list loaded:', result.data)
        if (list.length > 0) {
          Promise.all(
            list.map(async (s: StashEntry) => {
              try {
                const r = await window.api.git.stash_is_likely_applied(s.index, cwd)
                return [s.index, r.status === 'success' && r.data === true] as const
              } catch {
                return [s.index, false] as const
              }
            })
          ).then(pairs => setStashApplied(Object.fromEntries(pairs)))
        } else {
          setStashApplied({})
        }
      } else {
        toast.error(result.message || t('git.stash.loadError'))
      }
    } catch (error) {
      logger.error('Error loading stash list:', error)
      toast.error(t('git.stash.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadStashList()
    }
  }, [open, cwd])

  useEffect(() => {
    if (renameDialogStashIndex === null) return
    const input = renameInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [renameDialogStashIndex])

  const handleApply = async (index: number) => {
    setOperatingIndex(index)
    try {
      const result = await window.api.git.stash_apply(index, { index: restoreIndex }, cwd)
      if (result.status === 'success') {
        toast.success(t('git.stash.applySuccess'))
        await loadStashList()
        onStashApplied?.()
      } else {
        toast.error(result.message || t('git.stash.applyError'))
      }
    } catch (error) {
      logger.error('Error applying stash:', error)
      toast.error(t('git.stash.applyError'))
    } finally {
      setOperatingIndex(null)
    }
  }

  const handlePop = async (index: number) => {
    setOperatingIndex(index)
    try {
      const result = await window.api.git.stash_pop(index, { index: restoreIndex }, cwd)
      if (result.status === 'success') {
        toast.success(t('git.stash.popSuccess'))
        await loadStashList()
        onStashApplied?.()
      } else {
        if (result.conflict) {
          toast.warning(t('git.stash.popConflictMessage'))
        } else {
          toast.error(result.message || t('git.stash.popError'))
        }
      }
    } catch (error) {
      logger.error('Error popping stash:', error)
      toast.error(t('git.stash.popError'))
    } finally {
      setOperatingIndex(null)
    }
  }

  const handleDropClick = (index: number) => {
    setDropConfirmIndex(index)
  }

  const handleDropConfirm = async () => {
    if (dropConfirmIndex === null) return
    const index = dropConfirmIndex
    setDropConfirmIndex(null)
    setOperatingIndex(index)
    try {
      const result = await window.api.git.stash_drop(index, cwd)
      if (result.status === 'success') {
        toast.success(t('git.stash.dropSuccess'))
        await loadStashList()
        onStashApplied?.()
      } else {
        toast.error(result.message || t('git.stash.dropError'))
      }
    } catch (error) {
      logger.error('Error dropping stash:', error)
      toast.error(t('git.stash.dropError'))
    } finally {
      setOperatingIndex(null)
    }
  }

  const handleCreateStash = async (options: { includeUntracked?: boolean; stagedOnly?: boolean }) => {
    setIsCreating(true)
    try {
      const result = await window.api.git.stash(stashMessage.trim() || undefined, options, cwd)
      if (result.status === 'success') {
        toast.success(t('git.stash.createSuccess'))
        setStashMessage('')
        await loadStashList()
        onStashApplied?.()
      } else {
        toast.error(result.message || t('git.stash.createError'))
      }
    } catch (error) {
      logger.error('Error creating stash:', error)
      toast.error(t('git.stash.createError'))
    } finally {
      setIsCreating(false)
    }
  }

  const handleViewStash = async (index: number) => {
    setViewStashIndex(index)
    setViewStashFiles([])
    setViewStashSelectedPath(null)
    setViewStashFileOriginal('')
    setViewStashFileModified('')
    setLoadedPathForDiff(null)
    setIsLoadingView(true)
    try {
      const result = await window.api.git.stash_show_files(index, cwd)
      if (result.status === 'success') {
        setViewStashFiles(result.data ?? [])
      } else {
        toast.error('message' in result ? result.message : t('git.stash.viewError'))
      }
    } catch (error) {
      logger.error('Error viewing stash:', error)
      toast.error(t('git.stash.viewError'))
    } finally {
      setIsLoadingView(false)
    }
  }

  const handleSelectStashFile = async (path: string) => {
    if (viewStashIndex === null) return
    setViewStashSelectedPath(path)
    setLoadedPathForDiff(null)
    setViewStashFileOriginal('')
    setViewStashFileModified('')
    setIsLoadingFileDiff(true)
    try {
      const result = await window.api.git.stash_show_file_content(viewStashIndex, path, cwd)
      if (result.status === 'success' && result.data) {
        setViewStashFileOriginal(result.data.original ?? '')
        setViewStashFileModified(result.data.modified ?? '')
        setLoadedPathForDiff(path)
      } else {
        toast.error(result.message || t('git.stash.viewError'))
      }
    } catch (error) {
      logger.error('Error loading file diff:', error)
      toast.error(t('git.stash.viewError'))
    } finally {
      setIsLoadingFileDiff(false)
    }
  }

  const handleClearAllClick = () => {
    setClearAllConfirmOpen(true)
  }

  const handleClearAllConfirm = async () => {
    setClearAllConfirmOpen(false)
    setIsLoading(true)
    try {
      const result = await window.api.git.stash_clear(cwd)
      if (result.status === 'success') {
        toast.success(t('git.stash.clearSuccess'))
        await loadStashList()
        onStashApplied?.()
      } else {
        toast.error(result.message || t('git.stash.clearError'))
      }
    } catch (error) {
      logger.error('Error clearing stashes:', error)
      toast.error(t('git.stash.clearError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenBranchDialog = (index: number) => {
    if (isStashListBusy) return
    setBranchDialogStashIndex(index)
    setBranchNameInput('')
  }

  const handleOpenRenameDialog = (index: number, currentMessage: string) => {
    if (isStashListBusy) return
    setRenameDialogStashIndex(index)
    setRenameMessageInput(currentMessage)
    setRenameOriginalMessage(currentMessage)
  }

  const handleStashRenameConfirm = async () => {
    if (renameDialogStashIndex === null || !renameMessageInput.trim()) return
    const index = renameDialogStashIndex
    const message = renameMessageInput.trim()

    if (renameOriginalMessage.trim() === message) {
      toast.info(t('git.stash.renameUnchanged'))
      setRenameDialogStashIndex(null)
      setRenameMessageInput('')
      setRenameOriginalMessage('')
      return
    }

    setIsRenaming(true)
    setOperatingIndex(index)
    try {
      const result = await window.api.git.stash_rename(index, message, cwd)
      if (result.status === 'success') {
        if (result.data?.unchanged) {
          toast.info(t('git.stash.renameUnchanged'))
        } else {
          toast.success(t('git.stash.renameSuccess'))
        }
        setRenameDialogStashIndex(null)
        setRenameMessageInput('')
        setRenameOriginalMessage('')
        await loadStashList()
      } else {
        toast.error(t(stashRenameErrorKey(result.code)))
        logger.error('Stash rename failed:', result.message)
      }
    } catch (error) {
      logger.error('Error renaming stash:', error)
      toast.error(t('git.stash.renameError'))
    } finally {
      setIsRenaming(false)
      setOperatingIndex(null)
    }
  }

  const handleStashBranchConfirm = async () => {
    if (branchDialogStashIndex === null || !branchNameInput.trim()) return
    const index = branchDialogStashIndex
    const name = branchNameInput.trim()
    setBranchDialogStashIndex(null)
    setBranchNameInput('')
    setIsBranching(true)
    setOperatingIndex(index)
    try {
      const result = await window.api.git.stash_branch(index, name, cwd)
      if (result.status === 'success') {
        toast.success(t('git.stash.branchSuccess'))
        await loadStashList()
        onStashApplied?.()
      } else {
        toast.error(result.message || t('git.stash.branchError'))
      }
    } catch (error) {
      logger.error('Error creating branch from stash:', error)
      toast.error(t('git.stash.branchError'))
    } finally {
      setIsBranching(false)
      setOperatingIndex(null)
    }
  }

  const formatStashDate = (dateStr: string) => {
    try {
      return formatDateTime(dateStr, language)
    } catch {
      return dateStr
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl! max-h-[80vh] min-w-0 overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              {t('git.stash.title')}
            </DialogTitle>
            <DialogDescription>{t('git.stash.description', { count: stashList.length })}</DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('git.stash.createSection')}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder={t('git.stash.messagePlaceholder')}
                  value={stashMessage}
                  onChange={e => setStashMessage(e.target.value)}
                  className="max-w-[200px]"
                  disabled={isCreating}
                />
                <Button variant={buttonVariant} size="sm" onClick={() => handleCreateStash({})} disabled={isCreating}>
                  {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {t('git.stash.create')}
                </Button>
                <Button variant={buttonVariant} size="sm" onClick={() => handleCreateStash({ includeUntracked: true })} disabled={isCreating}>
                  {t('git.stash.includeUntracked')}
                </Button>
                <Button variant={buttonVariant} size="sm" onClick={() => handleCreateStash({ stagedOnly: true })} disabled={isCreating}>
                  {t('git.stash.stagedOnly')}
                </Button>
              </div>
            </div>

            {stashList.length > 0 && (
              <div className="flex items-center space-x-2">
                <Checkbox id="stash-restore-index" checked={restoreIndex} onCheckedChange={checked => setRestoreIndex(checked === true)} />
                <label htmlFor="stash-restore-index" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                  {t('git.stash.restoreIndex')}
                </label>
              </div>
            )}

            <div>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : stashList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('git.stash.noStash')}</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] min-w-0 max-w-full pr-4">
                  <div className="min-w-0 space-y-3">
                    {stashList.map(stash => (
                      <div key={stash.index} className="min-w-0 max-w-full overflow-hidden border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-1">
                              <span className="shrink-0 text-xs font-mono bg-muted px-2 py-0.5 rounded">stash@{`{${stash.index}}`}</span>
                              <span className="min-w-0 break-words text-xs text-muted-foreground">{formatStashDate(stash.date)}</span>
                              {stashApplied[stash.index] && (
                                <span className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded" title={t('git.stash.alreadyApplied')}>
                                  {t('git.stash.alreadyApplied')}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="font-medium break-words [overflow-wrap:anywhere] text-left hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                              onClick={() => handleOpenRenameDialog(stash.index, stash.message)}
                              disabled={isStashListBusy}
                              title={t('git.stash.renameTitle')}
                            >
                              {stash.message}
                            </button>
                            {stash.author_name && (
                              <p className="text-xs text-muted-foreground mt-1 break-words [overflow-wrap:anywhere]">
                                {t('git.stash.byAuthor', { name: `${stash.author_name}${stash.author_email ? ` <${stash.author_email}>` : ''}` })}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{stash.hash}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                            <Button
                              size="sm"
                              variant={buttonVariant}
                              onClick={() => handleViewStash(stash.index)}
                              disabled={isStashListBusy}
                              title={t('git.stash.viewTitle')}
                              aria-label={t('git.stash.viewTitle')}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant={buttonVariant}
                              onClick={() => handleOpenRenameDialog(stash.index, stash.message)}
                              disabled={isStashListBusy}
                              title={t('git.stash.renameTitle')}
                              aria-label={t('git.stash.renameTitle')}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant={buttonVariant}
                              onClick={() => handleOpenBranchDialog(stash.index)}
                              disabled={isStashListBusy}
                              title={t('git.stash.branch')}
                              aria-label={t('git.stash.branchTitle')}
                            >
                              <GitBranch className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant={buttonVariant}
                              onClick={() => handleApply(stash.index)}
                              disabled={isStashListBusy}
                              title={t('git.stash.applyTitle')}
                              aria-label={t('git.stash.applyTitle')}
                            >
                              {operatingIndex === stash.index ? <Loader2 className="h-3 w-3 animate-spin" /> : t('git.stash.apply')}
                            </Button>
                            <Button
                              size="sm"
                              variant={buttonVariant}
                              onClick={() => handlePop(stash.index)}
                              disabled={isStashListBusy}
                              title={t('git.stash.popTitle')}
                              aria-label={t('git.stash.popTitle')}
                            >
                              {operatingIndex === stash.index ? <Loader2 className="h-3 w-3 animate-spin" /> : t('git.stash.pop')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDropClick(stash.index)}
                              disabled={isStashListBusy}
                              title={t('git.stash.dropTitle')}
                              aria-label={t('git.stash.dropTitle')}
                            >
                              {operatingIndex === stash.index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <div>
              {stashList.length > 0 && (
                <Button variant="destructive" size="sm" onClick={handleClearAllClick} disabled={isLoading || isStashListBusy}>
                  <Trash2 className="h-3 w-3 mr-2" />
                  {t('git.stash.clearAll')}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.stash.clearAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.stash.clearAllConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dropConfirmIndex !== null} onOpenChange={open => !open && setDropConfirmIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.stash.dropConfirmTitle', { n: dropConfirmIndex })}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.stash.dropConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDropConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={branchDialogStashIndex !== null} onOpenChange={open => !open && setBranchDialogStashIndex(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('git.stash.branchTitle')}</DialogTitle>
            <DialogDescription>{t('git.stash.branchDescription', { n: branchDialogStashIndex })}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="stash-branch-name">{t('git.stash.branchPlaceholder')}</Label>
            <Input
              id="stash-branch-name"
              className="mt-2"
              placeholder={t('git.stash.branchPlaceholder')}
              value={branchNameInput}
              onChange={e => setBranchNameInput(e.target.value)}
              disabled={isBranching}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleStashBranchConfirm()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant={buttonVariant} onClick={() => setBranchDialogStashIndex(null)} disabled={isBranching}>
              {t('common.cancel')}
            </Button>
            <Button variant={buttonVariant} onClick={handleStashBranchConfirm} disabled={!branchNameInput.trim() || isBranching}>
              {isBranching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('git.stash.branch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogStashIndex !== null}
        onOpenChange={open => {
          if (!open && !isRenaming) {
            setRenameDialogStashIndex(null)
            setRenameMessageInput('')
            setRenameOriginalMessage('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('git.stash.renameTitle')}</DialogTitle>
            <DialogDescription>{t('git.stash.renameDescription', { n: renameDialogStashIndex })}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="stash-rename-message">{t('git.stash.renamePlaceholder')}</Label>
            <Input
              id="stash-rename-message"
              ref={renameInputRef}
              className="mt-2"
              placeholder={t('git.stash.renamePlaceholder')}
              value={renameMessageInput}
              onChange={e => setRenameMessageInput(e.target.value)}
              disabled={isRenaming}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleStashRenameConfirm()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant={buttonVariant}
              onClick={() => {
                setRenameDialogStashIndex(null)
                setRenameMessageInput('')
                setRenameOriginalMessage('')
              }}
              disabled={isRenaming}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant={buttonVariant}
              onClick={handleStashRenameConfirm}
              disabled={
                !renameMessageInput.trim() ||
                isRenaming ||
                renameOriginalMessage.trim() === renameMessageInput.trim()
              }
            >
              {isRenaming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('git.stash.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewStashIndex !== null} onOpenChange={open => !open && setViewStashIndex(null)}>
        <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col overflow-hidden" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {t('git.stash.viewTitle')} {viewStashIndex !== null ? `stash@{${viewStashIndex}}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden min-h-[50vh]">
            <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 rounded-md border h-full">
              <ResizablePanel defaultSize={35} minSize={20} className="h-full min-h-0 overflow-hidden flex flex-col">
                <p className="text-sm font-medium px-3 py-2 border-b bg-muted/50 shrink-0">{t('git.stash.filesInStash')}</p>
                {isLoadingView ? (
                  <div className="flex items-center justify-center flex-1 p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : viewStashFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-4 shrink-0">{t('git.stash.noContent')}</p>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="p-1 space-y-0.5">
                      {viewStashFiles.map(({ path, status }) => (
                        <button
                          key={path}
                          type="button"
                          onClick={() => handleSelectStashFile(path)}
                          className={cn(
                            'w-full text-left text-xs font-mono px-2 py-1.5 rounded truncate block',
                            viewStashSelectedPath === path ? 'bg-primary/15 text-primary' : 'hover:bg-muted/70 text-foreground'
                          )}
                          title={path}
                        >
                          <span className="inline-block w-6 shrink-0 text-muted-foreground">{status}</span>
                          <span className="truncate">{path}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={65} minSize={30} className="h-full min-h-0 overflow-hidden flex flex-col">
                <p className="text-sm font-medium px-3 py-2 border-b bg-muted/50 shrink-0 truncate" title={viewStashSelectedPath ?? undefined}>
                  {viewStashSelectedPath ? viewStashSelectedPath : t('git.stash.selectFileToViewDiff')}
                </p>
                {isLoadingFileDiff ? (
                  <div className="flex items-center justify-center flex-1 p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : viewStashSelectedPath && loadedPathForDiff === viewStashSelectedPath ? (
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <DiffEditor
                      key={`stash-diff-${viewStashIndex}-${viewStashSelectedPath}`}
                      height="100%"
                      language={getEditorLanguage(viewStashSelectedPath)}
                      theme={stashEditorTheme}
                      original={viewStashFileOriginal}
                      modified={viewStashFileModified}
                      keepCurrentOriginalModel
                      keepCurrentModifiedModel
                      options={{
                        ...stashEditorOptions,
                        renderSideBySide: false,
                        readOnly: true,
                        diffAlgorithm: 'advanced',
                        renderIndicators: true,
                        renderWhitespace: 'selection',
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground px-3 py-8 shrink-0">{t('git.stash.selectFileToViewDiff')}</p>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
