'use client'

import { FileCode, Loader2, Pencil, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConflictEditor } from '@/components/conflict/ConflictEditor'
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
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'

type ConflictType = 'merge' | 'rebase' | 'cherry-pick'

function languageFromFilePath(p: string): string {
  const base = p.split(/[/\\]/).pop() ?? p
  const i = base.lastIndexOf('.')
  const ext = i >= 0 ? base.slice(i + 1).toLowerCase() : ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    sql: 'sql',
    sh: 'shell',
    vue: 'html',
  }
  return map[ext] ?? 'plaintext'
}

interface GitConflictPanelProps {
  sourceFolder?: string
  onResolved?: () => void
  onAbort?: () => void
  onStatusChanged?: () => void
  compact?: boolean
}

export function GitConflictPanel({ sourceFolder, onResolved, onAbort, onStatusChanged, compact = false }: GitConflictPanelProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [conflictData, setConflictData] = useState<{
    hasConflict: boolean
    conflictedFiles: string[]
    conflictType?: ConflictType
  } | null>(null)
  const [resolvingFile, setResolvingFile] = useState<string | null>(null)
  const [isAborting, setIsAborting] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null)
  const [editorSwitchLoading, setEditorSwitchLoading] = useState(false)
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false)
  const dataSnapshotRef = useRef<string | null>(null)

  const loadConflictStatus = useCallback(async () => {
    try {
      const result = await window.api.git.get_conflict_status(sourceFolder || undefined)
      if (result.status === 'success' && result.data) {
        setConflictData(result.data)
      } else {
        setConflictData({ hasConflict: false, conflictedFiles: [] })
      }
    } catch (error) {
      logger.error('Error loading conflict status:', error)
      setConflictData({ hasConflict: false, conflictedFiles: [] })
    }
  }, [sourceFolder])

  useEffect(() => {
    loadConflictStatus()
  }, [sourceFolder, loadConflictStatus])

  useEffect(() => {
    const handleConfigChange = () => {
      const newSnapshot = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
      if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
        return
      }
      dataSnapshotRef.current = newSnapshot
      loadConflictStatus()
    }
    const handleBranchChange = () => loadConflictStatus()
    window.addEventListener('git-branch-changed', handleBranchChange)
    window.addEventListener('configuration-changed', handleConfigChange)
    return () => {
      window.removeEventListener('git-branch-changed', handleBranchChange)
      window.removeEventListener('configuration-changed', handleConfigChange)
    }
  }, [loadConflictStatus])

  const handleResolve = async (filePath: string, resolution: 'ours' | 'theirs' | 'both') => {
    setResolvingFile(filePath)
    try {
      const result = await window.api.git.resolve_conflict(filePath, resolution, sourceFolder?.trim() || undefined)
      if (result.status === 'success') {
        toast.success(t('git.conflict.resolveSuccess'))
        await loadConflictStatus()
        onStatusChanged?.()
      } else {
        toast.error(result.message || t('git.conflict.resolveError'))
      }
    } catch (error) {
      logger.error('Error resolving conflict:', error)
      toast.error(t('git.conflict.resolveError'))
    } finally {
      setResolvingFile(null)
    }
  }

  const loadEditingContent = useCallback(
    async (filePath: string) => {
      const cwd = sourceFolder?.trim() || undefined
      const result = await window.api.git.read_conflict_working_content(filePath, cwd)
      if (result?.status !== 'success' || typeof result.data !== 'string') {
        toast.error(result?.message || t('git.conflict.resolveError'))
        return false
      }
      setEditingFile({ path: filePath, content: result.data })
      return true
    },
    [sourceFolder, t]
  )

  const handleEditManually = useCallback(
    async (filePath: string) => {
      setEditorSwitchLoading(true)
      try {
        await loadEditingContent(filePath)
      } catch (error) {
        logger.error('Error reading file for edit:', error)
        toast.error(t('git.conflict.resolveError'))
      } finally {
        setEditorSwitchLoading(false)
      }
    },
    [loadEditingContent, t]
  )

  const selectConflictFileForEditor = useCallback(
    async (filePath: string) => {
      if (editingFile?.path === filePath) return
      setEditorSwitchLoading(true)
      try {
        await loadEditingContent(filePath)
      } catch (error) {
        logger.error('Error switching conflict file:', error)
        toast.error(t('git.conflict.resolveError'))
      } finally {
        setEditorSwitchLoading(false)
      }
    },
    [editingFile?.path, loadEditingContent, t]
  )

  const handleSaveManualEdit = useCallback(
    async (content: string) => {
      if (!editingFile) return
      try {
        const writeOpts = sourceFolder?.trim() ? { cwd: sourceFolder.trim() } : undefined
        const writeResult = await window.api.system.write_file(editingFile.path, content, writeOpts)
        if (!writeResult.success) {
          throw new Error(writeResult.error)
        }
        const addResult = await window.api.git.add([editingFile.path], sourceFolder ? { cwd: sourceFolder } : undefined)
        if (addResult?.status !== 'success') {
          throw new Error(addResult?.message || 'Failed to stage file')
        }
        toast.success(t('git.conflict.resolveSuccess'))
        setEditingFile(null)
        await loadConflictStatus()
        onStatusChanged?.()
        onResolved?.()
      } catch (error) {
        logger.error('Error saving manual conflict resolution:', error)
        throw error
      }
    },
    [editingFile, loadConflictStatus, onResolved, onStatusChanged, sourceFolder, t]
  )

  const handleAbortClick = () => {
    setAbortConfirmOpen(true)
  }

  const handleAbortConfirm = async () => {
    setAbortConfirmOpen(false)
    const conflictType = conflictData?.conflictType
    if (!conflictType) return

    setIsAborting(true)
    try {
      let result: { status: string; message?: string }
      if (conflictType === 'merge') {
        result = await window.api.git.abort_merge(sourceFolder?.trim() || undefined)
      } else if (conflictType === 'rebase') {
        result = await window.api.git.abort_rebase(sourceFolder || undefined)
      } else {
        result = await window.api.git.abort_cherry_pick(sourceFolder || undefined)
      }
      if (result.status === 'success') {
        toast.success(t('git.conflict.abortSuccess'))
        await loadConflictStatus()
        onStatusChanged?.()
        onAbort?.()
      } else {
        toast.error(result.message || t('git.conflict.abortError'))
      }
    } catch (error) {
      logger.error('Error aborting:', error)
      toast.error(t('git.conflict.abortError'))
    } finally {
      setIsAborting(false)
    }
  }

  const handleContinue = async () => {
    const conflictType = conflictData?.conflictType
    if (conflictType !== 'rebase' && conflictType !== 'cherry-pick') return

    setIsContinuing(true)
    try {
      let result: { status: string; message?: string }
      if (conflictType === 'rebase') {
        result = await window.api.git.continue_rebase(sourceFolder || undefined)
      } else {
        result = await window.api.git.continue_cherry_pick(sourceFolder || undefined)
      }
      if (result.status === 'success') {
        toast.success(t('git.conflict.continueSuccess'))
        await loadConflictStatus()
        onStatusChanged?.()
        onResolved?.()
      } else if (result.status === 'conflict') {
        toast.warning(t('git.conflict.conflicts'))
        await loadConflictStatus()
        onStatusChanged?.()
      } else {
        toast.error(result.message || t('git.conflict.continueError'))
      }
    } catch (error) {
      logger.error('Error continuing:', error)
      toast.error(t('git.conflict.continueError'))
    } finally {
      setIsContinuing(false)
    }
  }

  if (conflictData === null) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!conflictData.hasConflict || conflictData.conflictedFiles.length === 0) {
    if (conflictData.conflictType && conflictData.conflictedFiles.length === 0) {
      const isMerge = conflictData.conflictType === 'merge'
      return (
        <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
          <p className="text-sm font-medium">{t('git.conflict.readyToCommit')}</p>
          {!isMerge && (
            <Button size="sm" onClick={handleContinue} disabled={isContinuing}>
              {isContinuing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
              {t('git.conflict.continue')}
            </Button>
          )}
        </div>
      )
    }
    return null
  }

  const canAbort = !!conflictData.conflictType

  const abortLabel =
    conflictData.conflictType === 'merge'
      ? t('git.merge.abortMerge')
      : conflictData.conflictType === 'rebase'
        ? t('git.rebase.abortRebase')
        : t('git.conflict.abortCherryPick')

  const abortConfirmMessage =
    conflictData.conflictType === 'merge'
      ? t('git.merge.abortConfirm')
      : conflictData.conflictType === 'rebase'
        ? t('git.rebase.abortConfirm')
        : t('git.conflict.abortCherryPickConfirm')

  if (editingFile && !compact) {
    return (
      <TooltipProvider>
        <div className="border rounded-lg p-4 space-y-3 bg-destructive/5 border-destructive/30">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-destructive font-medium">{t('git.conflict.title')}</Label>
            {canAbort && (
              <Button variant="destructive" size="sm" onClick={handleAbortClick} disabled={isAborting}>
                {isAborting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                {abortLabel}
              </Button>
            )}
          </div>
          <div className="flex rounded-lg border border-destructive/20 bg-background overflow-hidden min-h-[min(70vh,560px)]">
            <aside className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/20 min-h-0">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border shrink-0">
                {t('conflictEditor.conflictingFilesCount', { count: conflictData.conflictedFiles.length })}
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="py-1">
                  {conflictData.conflictedFiles.map(file => {
                    const base = file.split(/[/\\]/).pop() ?? file
                    const active = editingFile.path === file
                    return (
                      <button
                        key={file}
                        type="button"
                        onClick={() => void selectConflictFileForEditor(file)}
                        className={cn(
                          'w-full text-left px-3 py-2 border-b border-border/40 last:border-b-0 transition-colors',
                          active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
                        )}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <FileCode className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{base}</div>
                            <div className="text-[10px] text-muted-foreground truncate" title={file}>
                              {file}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </aside>
            <div className="flex-1 min-w-0 flex flex-col min-h-0 relative">
              {editorSwitchLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : null}
              <ConflictEditor
                key={editingFile.path}
                filePath={editingFile.path}
                initialContent={editingFile.content}
                language={languageFromFilePath(editingFile.path)}
                onSave={handleSaveManualEdit}
                onCancel={() => setEditingFile(null)}
                primaryAction="markResolved"
                disablePrimaryWhenConflicted
              />
            </div>
          </div>
        </div>
        <AlertDialog open={abortConfirmOpen} onOpenChange={setAbortConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{abortLabel}</AlertDialogTitle>
              <AlertDialogDescription>{abortConfirmMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleAbortConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {abortLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className={`border rounded-lg ${compact ? 'p-2' : 'p-4'} space-y-3 bg-destructive/5 border-destructive/30`}>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-destructive font-medium">{t('git.conflict.title')}</Label>
          {canAbort && (
            <Button variant="destructive" size="sm" onClick={handleAbortClick} disabled={isAborting}>
              {isAborting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              {abortLabel}
            </Button>
          )}
        </div>
        <ScrollArea className={`rounded-md border ${compact ? 'h-[120px]' : 'h-[200px]'}`}>
          <div className="p-3 space-y-2">
            {conflictData.conflictedFiles.map((file: string) => (
              <div key={file} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                <span className="text-sm truncate flex-1" title={file}>
                  {file}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                  {!compact && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant={buttonVariant} onClick={() => handleEditManually(file)} disabled={!!editingFile} title={t('conflictEditor.editManually')}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('conflictEditor.editManually')}</TooltipContent>
                    </Tooltip>
                  )}
                  <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file, 'ours')} disabled={resolvingFile === file} title={t('git.conflict.ours')}>
                    {resolvingFile === file ? <Loader2 className="h-3 w-3 animate-spin" /> : t('git.conflict.ours')}
                  </Button>
                  <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file, 'theirs')} disabled={resolvingFile === file} title={t('git.conflict.theirs')}>
                    {resolvingFile === file ? <Loader2 className="h-3 w-3 animate-spin" /> : t('git.conflict.theirs')}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file, 'both')} disabled={resolvingFile === file}>
                        {resolvingFile === file ? <Loader2 className="h-3 w-3 animate-spin" /> : t('git.conflict.both')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('git.conflict.bothTooltip')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <AlertDialog open={abortConfirmOpen} onOpenChange={setAbortConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{abortLabel}</AlertDialogTitle>
              <AlertDialogDescription>{abortConfirmMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleAbortConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {abortLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
