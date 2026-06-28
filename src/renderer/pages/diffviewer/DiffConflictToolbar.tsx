'use client'

import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  GitMerge,
  Layers,
  Loader2,
  Minus,
  Play,
  RefreshCw,
  SkipForward,
  Square,
  X,
  XCircle,
} from 'lucide-react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { GitConflictType } from './diffViewerPayload'
import { DiffViewerFilePicker } from './DiffViewerFilePicker'
import type { DiffViewerFileEntry } from './diffViewerPayload'

export type DiffConflictToolbarProps = {
  embedded?: boolean
  headerPortalTarget?: HTMLElement | null
  onCloseRequest?: () => void
  conflictType?: GitConflictType
  resolvedCount: number
  totalCount: number
  filePath: string
  files: DiffViewerFileEntry[]
  activeFile?: DiffViewerFileEntry
  onSelectFile: (index: number) => void
  onPrevFile?: () => void
  onNextFile?: () => void
  disableFileNav?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
  onResolveOurs?: () => void
  onResolveTheirs?: () => void
  onResolveBoth?: () => void
  isResolving?: boolean
  onAbort?: () => void
  isAborting?: boolean
  onContinue?: () => void
  isContinuing?: boolean
  showContinue?: boolean
  readyToContinue?: boolean
  autoAdvance?: boolean
  onToggleAutoAdvance?: () => void
}

const toggleBtnClass =
  'shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]'
const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function ConflictToolbarControls(props: DiffConflictToolbarProps) {
  const { t } = useTranslation()
  const {
    conflictType,
    resolvedCount,
    totalCount,
    filePath,
    files,
    activeFile,
    onPrevFile,
    onNextFile,
    disableFileNav,
    onRefresh,
    isRefreshing,
    onResolveOurs,
    onResolveTheirs,
    onResolveBoth,
    isResolving,
    onAbort,
    isAborting,
    onContinue,
    isContinuing,
    showContinue,
    readyToContinue,
    headerPortalTarget,
    autoAdvance,
    onToggleAutoAdvance,
  } = props

  const sessionLabel =
    conflictType === 'merge'
      ? t('dialog.diffViewer.conflictMode.merge')
      : conflictType === 'rebase'
        ? t('dialog.diffViewer.conflictMode.rebase')
        : conflictType === 'cherry-pick'
          ? t('dialog.diffViewer.conflictMode.cherryPick')
          : t('git.conflict.title')

  const progressLabel =
    totalCount > 0
      ? t('dialog.diffViewer.conflictMode.progress', { resolved: resolvedCount, total: totalCount })
      : ''

  return (
    <div
      className={cn(
        'flex items-center gap-1 min-w-0',
        headerPortalTarget ? 'h-7 flex-1 overflow-hidden' : 'shrink'
      )}
      style={noDragStyle}
    >
      <span className="hidden sm:inline text-xs font-medium text-destructive truncate max-w-[8rem]" title={sessionLabel}>
        <GitMerge className="inline h-3 w-3 mr-1" />
        {sessionLabel}
      </span>
      {progressLabel ? (
        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap shrink-0">{progressLabel}</span>
      ) : null}

      {files.length > 1 ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" className={toggleBtnClass} onClick={onPrevFile} disabled={disableFileNav}>
                <ChevronLeft className="h-4 w-4" strokeWidth={1.25} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.prevFile')}</TooltipContent>
          </Tooltip>
          <DiffViewerFilePicker
            filePath={filePath}
            files={files}
            activeEntry={activeFile}
            disabled={disableFileNav}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" className={toggleBtnClass} onClick={onNextFile} disabled={disableFileNav}>
                <ChevronRight className="h-4 w-4" strokeWidth={1.25} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dialog.diffViewer.nextFile')}</TooltipContent>
          </Tooltip>
        </>
      ) : filePath ? (
        <span className="text-xs font-mono truncate max-w-[12rem] text-muted-foreground" title={filePath}>
          {filePath.split(/[/\\]/).pop()}
        </span>
      ) : null}

      <div className="min-w-2 flex-1" aria-hidden />

      {readyToContinue && showContinue ? (
        <Button size="sm" className="h-7 text-xs" onClick={onContinue} disabled={isContinuing}>
          {isContinuing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          {t('git.conflict.continue')}
        </Button>
      ) : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={onResolveOurs} disabled={isResolving || !filePath}>
                <GitBranch className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('git.conflict.ours')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={onResolveTheirs} disabled={isResolving || !filePath}>
                <ArrowDownToLine className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('git.conflict.theirs')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={onResolveBoth} disabled={isResolving || !filePath}>
                <Layers className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('git.conflict.bothTooltip')}</TooltipContent>
          </Tooltip>
        </>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="link" size="sm" className={toggleBtnClass} onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" strokeWidth={1.25} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('common.refresh')}</TooltipContent>
      </Tooltip>

      {onToggleAutoAdvance ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              className={cn(toggleBtnClass, autoAdvance && 'bg-muted')}
              onClick={onToggleAutoAdvance}
              aria-pressed={autoAdvance}
            >
              <SkipForward className="h-4 w-4" strokeWidth={1.25} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.autoAdvanceMenu')}</TooltipContent>
        </Tooltip>
      ) : null}

      {conflictType && onAbort ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onAbort} disabled={isAborting}>
              {isAborting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              {conflictType === 'merge'
                ? t('git.merge.abortMerge')
                : conflictType === 'rebase'
                  ? t('git.rebase.abortRebase')
                  : t('git.conflict.abortCherryPick')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('dialog.diffViewer.conflictMode.abortHint')}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

export function DiffConflictToolbar(props: DiffConflictToolbarProps) {
  const { embedded = false, headerPortalTarget, onCloseRequest } = props

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  if (embedded && headerPortalTarget) {
    return createPortal(<ConflictToolbarControls {...props} />, headerPortalTarget)
  }

  return (
    <div
      className="flex items-center h-8 text-sm select-none shrink-0 border-b"
      style={{ backgroundColor: 'var(--main-bg)', color: 'var(--main-fg)' } as React.CSSProperties}
    >
      <div className="flex items-center h-full pl-3 shrink-0" style={noDragStyle}>
        <div className="w-10 h-6 flex justify-center items-center shrink-0">
          <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
        </div>
      </div>
      <div className="flex-1 flex items-center min-w-0 px-2" style={dragStyle}>
        <ConflictToolbarControls {...props} />
      </div>
      {!embedded ? (
        <div className="flex gap-1 shrink-0" style={noDragStyle}>
          <button
            type="button"
            onClick={() => handleWindow('minimize')}
            className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)]"
          >
            <Minus size={15.5} strokeWidth={1} />
          </button>
          <button
            type="button"
            onClick={() => handleWindow('maximize')}
            className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)]"
          >
            <Square size={14.5} strokeWidth={1} />
          </button>
          <button
            type="button"
            onClick={() => (onCloseRequest ? onCloseRequest() : handleWindow('close'))}
            className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white"
          >
            <X size={20} strokeWidth={1} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
