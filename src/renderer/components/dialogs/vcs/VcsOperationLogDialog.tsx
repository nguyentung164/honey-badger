'use client'
import { AlertCircle, CheckCircle2, Clock, Copy, ExternalLink, FileDiff, FileText, FolderOpen, GitBranch, Hash, History, Info, Loader2, Tag } from 'lucide-react'
import { IPC } from 'main/constants'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import type { GitStatusCode, SvnStatusCode, SvnUpdateStatusCode } from '../../shared/constants'
import { StatusIcon } from '../../ui-elements/StatusIcon'
import toast from '../../ui-elements/Toast'

export interface UpdatedFile {
  action: string
  path: string
}

interface VcsOperationLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vcsType: 'svn' | 'git'
  /** @deprecated No longer used - files shown in log only */
  updatedFiles?: UpdatedFile[]
  message?: string
  /** Realtime log output (streaming) */
  streamingLog?: string
  /** Whether operation is still in progress */
  isStreaming?: boolean
  /** Custom dialog title (overrides default vcsType-based title) */
  title?: string
  /** Custom completion message key (overrides default) */
  completionMessage?: string
  /** Operation result: 'success' = green completed, 'error' = red failed, undefined = no status line */
  operationStatus?: 'success' | 'error'
  /** Custom failure message key (used when operationStatus === 'error') */
  failureMessage?: string
  /** Folder path where the operation was performed */
  folderPath?: string
  /** Repository URL (SVN URL or Git remote origin) */
  repoUrl?: string
  /** Git branch name */
  branch?: string
  /** SVN revision */
  revision?: string
  /** Project/repo label (multi-repo) */
  label?: string
  /** Completion timestamp (ISO string or Date) */
  completedAt?: string | Date
}

/** Git diff --name-status returns R100, C100 etc. - use first char for icon */
function normalizeActionCode(action: string): string {
  return action.length > 0 ? action[0] : action
}

/** Format path for rename/copy: "old\tnew" -> "old → new" */
function formatPathForDisplay(action: string, path: string): string {
  if ((action.startsWith('R') || action.startsWith('C')) && path.includes('\t')) {
    const [oldPath, newPath] = path.split('\t')
    return `${oldPath} → ${newPath}`
  }
  return path
}

const SVN_LOG_STATUS = ['U', 'A', 'D', 'G', 'C', 'E'] as const
const GIT_LOG_STATUS = ['A', 'M', 'D', 'R', 'C', 'U', 'T'] as const

interface ParsedLogLine {
  type: 'status' | 'updating' | 'revision' | 'info' | 'git-remote' | 'section' | 'plain'
  action?: string
  path?: string
  text: string
}

function parseLogLine(line: string, vcsType: 'svn' | 'git'): ParsedLogLine {
  const trimmed = line.trim()
  if (!trimmed) return { type: 'plain', text: line }

  // Multi-repo synthetic headers: "[Frontend]", "[push: Backend]" (MainPage performCommit)
  if (/^\[[^\]]+\]$/.test(trimmed)) {
    return { type: 'section', text: trimmed }
  }

  const statusMatch = trimmed.match(/^\s*([UAGDCEMT]|R\d*|C\d*)[\sA-Z]*?\s+(.+)$/)
  if (statusMatch) {
    const action = statusMatch[1]
    const path = statusMatch[2].trim()
    const validCodes = vcsType === 'svn' ? SVN_LOG_STATUS : GIT_LOG_STATUS
    if (validCodes.includes(action[0] as any)) {
      return { type: 'status', action, path, text: trimmed }
    }
  }

  // Update patterns
  if (/^Updating\s+/.test(trimmed)) return { type: 'updating', text: trimmed }
  if (/^(At|Updated to) revision \d+\.?$/i.test(trimmed)) return { type: 'revision', text: trimmed }
  if (/^Already up to date/i.test(trimmed)) return { type: 'revision', text: trimmed }
  if (/^(From|remote:|Fetching|Merge|Unpacking)/i.test(trimmed)) return { type: 'git-remote', text: trimmed }
  if (/^(Updating|Fetching|Merge)/i.test(trimmed)) return { type: 'info', text: trimmed }

  // SVN commit patterns: "Sending ...", "Adding ...", "Deleting ...", "Transmitting file data"
  if (/^(Sending|Transmitting file data)/i.test(trimmed)) return { type: 'info', text: trimmed }
  // SVN "Committed revision N."
  if (/^Committed revision \d+/i.test(trimmed)) return { type: 'revision', text: trimmed }
  // SVN "Committing transaction..."
  if (/^Committing transaction/i.test(trimmed)) return { type: 'info', text: trimmed }

  // Git commit patterns: "[branch hash] message"
  if (/^\[.+\s+[a-f0-9]+\]/.test(trimmed)) return { type: 'revision', text: trimmed }
  // Git commit summary: "X file(s) changed, Y insertion(s)(+), Z deletion(s)(-)"
  if (/^\d+\s+file.*changed/i.test(trimmed)) return { type: 'info', text: trimmed }

  // Git push patterns: "Enumerating objects:", "Counting objects:", "Compressing objects:", "Writing objects:", "Total ..."
  if (/^(Enumerating|Counting|Compressing|Writing|Total\s+\d)/i.test(trimmed)) return { type: 'info', text: trimmed }
  // Git push: "To https://..." or "To git@..."
  if (/^To\s+(https?:|git@)/i.test(trimmed)) return { type: 'git-remote', text: trimmed }
  // Git push: "abc1234..def5678  branch -> branch"
  if (/^[a-f0-9]+\.\.[a-f0-9]+\s+/.test(trimmed)) return { type: 'revision', text: trimmed }
  // Git push: " * [new branch]  branch -> branch"
  if (/^\*\s+\[new (branch|tag)\]/.test(trimmed)) return { type: 'revision', text: trimmed }
  // Git push: "Everything up-to-date"
  if (/^Everything up-to-date/i.test(trimmed)) return { type: 'revision', text: trimmed }

  // Synthetic progress messages: "Staging ...", "Committing ...", "Checking ...", "Pushing ...", "Deleting ...", "Adding ..."
  if (/^(Staging|Committing|Checking|Pushing|Deleting|Adding)\s+/i.test(trimmed)) return { type: 'info', text: trimmed }

  return { type: 'plain', text: trimmed }
}

type FileActionHandlers = {
  onRevealInExplorer: (action: string, path: string) => void
  onOpenInEditor: (action: string, path: string) => void
  onCopyPath: (action: string, path: string) => void
  onCopyFullPath: (action: string, path: string) => void
  onShowLog: (action: string, path: string) => void
  onViewDiff: (action: string, path: string) => void | Promise<void>
}

function StreamLogViewer({
  log,
  vcsType,
  isStreaming,
  operationStatus,
  fileHandlers,
  completionMessage,
  failureMessage,
}: {
  log: string
  vcsType: 'svn' | 'git'
  isStreaming: boolean
  operationStatus?: 'success' | 'error'
  fileHandlers?: FileActionHandlers
  completionMessage?: string
  failureMessage?: string
}) {
  const { t } = useTranslation()
  const lines = useMemo(() => log.split('\n').filter(Boolean), [log])
  const completionKey = completionMessage || (vcsType === 'svn' ? 'dialog.updateResult.completedSvn' : 'dialog.updateResult.completedGit')
  const failureKey = failureMessage || (vcsType === 'svn' ? 'dialog.updateResult.failedSvn' : 'dialog.updateResult.failedGit')

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const parsed = parseLogLine(line, vcsType)
        switch (parsed.type) {
          case 'status': {
            const iconCode = (parsed.action?.length ? parsed.action[0] : parsed.action) as SvnStatusCode | SvnUpdateStatusCode | GitStatusCode
            const displayPath = parsed.path ? formatPathForDisplay(parsed.action ?? '', parsed.path) : parsed.text
            const action = parsed.action ?? ''
            const path = parsed.path ?? ''
            const lineContent = (
              <div className="flex items-start gap-2 py-0.5 group hover:bg-muted/50 rounded px-1 -mx-1 cursor-context-menu">
                <StatusIcon
                  code={iconCode ?? 'U'}
                  vcsType={vcsType}
                  svnUpdateMode={vcsType === 'svn' && ['U', 'G', 'E'].includes(iconCode ?? '')}
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span className="font-mono text-xs break-all">{displayPath}</span>
              </div>
            )
            return fileHandlers ? (
              <ContextMenu key={i}>
                <ContextMenuTrigger asChild>{lineContent}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => fileHandlers.onRevealInExplorer(action, path)}>
                    <ExternalLink className="h-4 w-4" />
                    {t('contextMenu.revealInExplorer')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => fileHandlers.onOpenInEditor(action, path)}>
                    <FileText className="h-4 w-4" />
                    {t('contextMenu.openInExternalEditor')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => fileHandlers.onCopyPath(action, path)}>
                    <Copy className="h-4 w-4" />
                    {t('contextMenu.copyPath')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => fileHandlers.onCopyFullPath(action, path)}>
                    <Copy className="h-4 w-4" />
                    {t('contextMenu.copyFullPath')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => fileHandlers.onShowLog(action, path)}>
                    <History className="h-4 w-4" />
                    {t('contextMenu.showLog')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => fileHandlers.onViewDiff(action, path)}>
                    <FileDiff className="h-4 w-4" />
                    {t('contextMenu.viewDiff')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : (
              <div key={i}>{lineContent}</div>
            )
          }
          case 'updating':
            return (
              <div key={i} className="flex items-center gap-2 py-0.5 text-muted-foreground">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="font-mono text-xs">{parsed.text}</span>
              </div>
            )
          case 'revision':
            return (
              <div key={i} className="flex items-center gap-2 py-0.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-mono text-xs">{parsed.text}</span>
              </div>
            )
          case 'git-remote':
          case 'info':
            return (
              <div key={i} className="flex items-center gap-2 py-0.5 text-muted-foreground">
                <Info className="w-4 h-4 shrink-0" />
                <span className="font-mono text-xs">{parsed.text}</span>
              </div>
            )
          case 'section':
            return (
              <div
                key={i}
                className="flex items-center gap-2 py-1.5 mt-1 first:mt-0 border-b border-border/60 text-foreground font-medium"
              >
                <Tag className="w-4 h-4 shrink-0 text-primary" />
                <span className="font-mono text-xs tracking-tight">{parsed.text}</span>
              </div>
            )
          default:
            return (
              <div key={i} className="font-mono text-xs py-0.5 text-muted-foreground">
                {parsed.text}
              </div>
            )
        }
      })}
      {isStreaming && (
        <div className="flex items-center gap-2 py-1 text-muted-foreground">
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          <span className="text-xs">...</span>
        </div>
      )}
      {operationStatus === 'success' && !isStreaming && (
        <div className="flex items-center gap-2 py-0.5 text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-mono text-xs">{t(completionKey)}</span>
        </div>
      )}
      {operationStatus === 'error' && !isStreaming && (
        <div className="flex items-center gap-2 py-0.5 text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-mono text-xs">{t(failureKey)}</span>
        </div>
      )}
    </div>
  )
}

/** Extract file path for operations (R/C use new path after \t) */
function getPathForOperation(action: string, path: string): string {
  if ((action.startsWith('R') || action.startsWith('C')) && path.includes('\t')) {
    return path.split('\t')[1] ?? path
  }
  return path
}

export function VcsOperationLogDialog({
  open,
  onOpenChange,
  vcsType,
  message,
  streamingLog = '',
  isStreaming = false,
  title: titleProp,
  completionMessage,
  operationStatus,
  failureMessage,
  folderPath: folderPathProp,
  repoUrl,
  branch: branchProp,
  revision: revisionProp,
  label,
  completedAt: completedAtProp,
}: VcsOperationLogDialogProps) {
  const { t, i18n } = useTranslation()
  const { sourceFolder } = useConfigurationStore()
  const title = titleProp || (vcsType === 'svn' ? t('dialog.updateResult.titleSvn') : t('dialog.updateResult.titleGit'))
  const folderPath = folderPathProp ?? sourceFolder ?? ''
  const [fetchedDetails, setFetchedDetails] = useState<{ url?: string; branch?: string; revision?: string } | null>(null)
  const effectiveRepoUrl = repoUrl ?? fetchedDetails?.url ?? undefined
  const effectiveBranch = branchProp ?? fetchedDetails?.branch ?? undefined
  const effectiveRevision = revisionProp ?? fetchedDetails?.revision ?? undefined
  const logScrollRef = useRef<HTMLDivElement>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !folderPath || repoUrl != null) {
      if (!open) {
        setFetchedDetails(null)
        setCompletedAt(null)
      }
      return
    }
    let cancelled = false
    window.api.system
      .get_version_control_details(folderPath)
      .then(result => {
        if (!cancelled && result.status === 'success' && result.data?.details) {
          const d = result.data.details
          setFetchedDetails({ url: d.url, branch: d.branch, revision: d.revision })
        }
      })
      .catch(() => { })
    return () => {
      cancelled = true
    }
  }, [open, folderPath, repoUrl])

  useEffect(() => {
    if (operationStatus === 'success' && !isStreaming) {
      setCompletedAt(prev => prev ?? new Date().toISOString())
    }
  }, [operationStatus, isStreaming])

  const displayCompletedAt = completedAtProp
    ? typeof completedAtProp === 'string'
      ? completedAtProp
      : completedAtProp.toISOString()
    : completedAt

  useEffect(() => {
    if (streamingLog && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight
    }
  }, [streamingLog])

  const basePath = folderPath || sourceFolder || undefined

  const fileHandlers: FileActionHandlers = useMemo(
    () => ({
      onRevealInExplorer: (action, path) => {
        const p = getPathForOperation(action, path)
        const fullPath = basePath ? `${basePath.replace(/\\/g, '/')}/${p.replace(/\\/g, '/')}`.replace(/\/+/g, '/') : p
        window.api.system.reveal_in_file_explorer(fullPath)
      },
      onOpenInEditor: (action, path) => {
        const p = getPathForOperation(action, path)
        const fullPath = basePath ? `${basePath.replace(/\\/g, '/')}/${p.replace(/\\/g, '/')}`.replace(/\/+/g, '/') : p
        window.api.system.open_in_external_editor(fullPath).then(r => {
          if (!r.success && r.error) toast.error(r.error)
        })
      },
      onCopyPath: async (action, path) => {
        try {
          await navigator.clipboard.writeText(getPathForOperation(action, path))
          toast.success(t('dashboard.copySuccess'))
        } catch {
          toast.error(t('appLogs.copyError'))
        }
      },
      onCopyFullPath: async (action, path) => {
        const p = getPathForOperation(action, path)
        const fullPath = basePath ? `${basePath.replace(/\\/g, '/')}/${p.replace(/\\/g, '/')}`.replace(/\/+/g, '/') : p
        try {
          await navigator.clipboard.writeText(fullPath)
          toast.success(t('dashboard.copySuccess'))
        } catch {
          toast.error(t('appLogs.copyError'))
        }
      },
      onShowLog: (action, path) => {
        const data: { path: string; isGit: boolean; sourceFolder?: string; versionControlSystem?: 'git' | 'svn' } = {
          path: getPathForOperation(action, path),
          isGit: vcsType === 'git',
          versionControlSystem: vcsType,
        }
        if (basePath) data.sourceFolder = basePath
        window.api.electron.send(IPC.WINDOW.SHOW_LOG, data)
      },
      onViewDiff: async (action, path) => {
        const p = getPathForOperation(action, path)
        const code = normalizeActionCode(action)
        const cwd = basePath ?? undefined
        try {
          if (vcsType === 'svn') {
            const currentRev = await window.api.svn.getCurrentRevision(cwd)
            if (currentRev) {
              // revision=currentRev để cat(revision) và cat(revision-1). currentRevision=currentRev để swap=false → Trái=cũ, Phải=mới
              window.api.svn.open_diff(p, { fileStatus: code, revision: currentRev, currentRevision: currentRev, cwd })
            } else {
              window.api.svn.open_diff(p, { fileStatus: code, cwd })
            }
          } else {
            const parentHash = await window.api.git.getParentCommit('HEAD', cwd ? { cwd } : undefined)
            window.api.git.open_diff(p, {
              fileStatus: code,
              commitHash: 'HEAD',
              currentCommitHash: parentHash ?? undefined,
              isRootCommit: !parentHash,
              cwd,
            })
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t('dialog.updateResult.failedToOpenDiff'))
        }
      },
    }),
    [basePath, vcsType, t]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[80vw]! max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {(folderPath || effectiveRepoUrl || effectiveBranch || effectiveRevision || label || displayCompletedAt) && (
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs items-center">
                {folderPath && (
                  <>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-0">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                      {t('dialog.updateResult.folder')}
                    </span>
                    <span className="font-mono truncate min-w-0" title={folderPath}>{folderPath}</span>
                  </>
                )}
                {effectiveRepoUrl && (
                  <>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-0">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {t('dialog.updateResult.repository')}
                    </span>
                    <span className="font-mono truncate min-w-0" title={effectiveRepoUrl}>{effectiveRepoUrl}</span>
                  </>
                )}
                {vcsType === 'git' && effectiveBranch && (
                  <>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-0">
                      {t('dialog.updateResult.branch')}
                    </span>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit font-mono">
                      <GitBranch className="h-2.5 w-2.5 shrink-0" />
                      {effectiveBranch}
                    </span>
                  </>
                )}
                {vcsType === 'svn' && effectiveRevision && (
                  <>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-0">
                      <Hash className="h-3.5 w-3.5 shrink-0" />
                      {t('dialog.updateResult.revision')}
                    </span>
                    <span className="font-mono">r{effectiveRevision}</span>
                  </>
                )}
                {label && (
                  <>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-0">
                      <Tag className="h-3.5 w-3.5 shrink-0" />
                      {t('dialog.updateResult.label')}
                    </span>
                    <span className="truncate min-w-0">{label}</span>
                  </>
                )}
                {displayCompletedAt && (
                  <>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-0">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {t('dialog.updateResult.completedAt')}
                    </span>
                    <span className="tabular-nums">
                      {(() => {
                        const d = new Date(displayCompletedAt)
                        const dd = d.getDate().toString().padStart(2, '0')
                        const mm = (d.getMonth() + 1).toString().padStart(2, '0')
                        const yyyy = d.getFullYear()
                        const hh = d.getHours().toString().padStart(2, '0')
                        const min = d.getMinutes().toString().padStart(2, '0')
                        const ss = d.getSeconds().toString().padStart(2, '0')
                        const time = `${hh}:${min}:${ss}`
                        return i18n.language.startsWith('ja') ? `${yyyy}/${mm}/${dd} ${time}` : `${dd}/${mm}/${yyyy} ${time}`
                      })()}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {(streamingLog || isStreaming) && (
            <div className="flex flex-col gap-1 flex-1 min-h-0">
              <p className="text-sm font-medium">{t('dialog.updateResult.log')}</p>
              <div ref={logScrollRef} className="flex-1 min-h-[280px] border rounded-lg bg-muted/20 p-2.5 overflow-auto font-mono text-xs">
                {streamingLog ? (
                  <StreamLogViewer
                    log={streamingLog}
                    vcsType={vcsType}
                    isStreaming={isStreaming}
                    operationStatus={operationStatus}
                    fileHandlers={fileHandlers}
                    completionMessage={completionMessage}
                    failureMessage={failureMessage}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('dialog.updateResult.waiting')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
