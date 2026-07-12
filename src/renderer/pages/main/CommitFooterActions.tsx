'use client'

import { Bug, CheckCircle, GitPullRequest, SendHorizontal, SlidersHorizontal } from 'lucide-react'
import { IPC } from 'main/constants'
import type { ButtonVariant } from 'main/store/AppearanceStore'
import { type MutableRefObject, memo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { CommitWorkflowStatusBar } from '@/components/commit-workflow/CommitWorkflowStatusBar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'

export type CommitFooterActionsProps = {
  compact?: boolean
  variant: ButtonVariant
  isAnyLoading: boolean
  isLoadingCommit: boolean
  versionControlSystem: 'git' | 'svn'
  isMultiRepo: boolean
  effectivePaths: string[]
  gitMultiTableRefs: RefObject<Record<string, { getAllStagedFiles?: () => Array<{ filePath: string }> } | null>>
  gitDualTableRef: RefObject<{ getAllStagedFiles?: () => Array<{ filePath: string }> } | null>
  tableRef: RefObject<{ table?: { getSelectedRowModel: () => { rows: Array<{ original: { filePath: string } }> } } } | null>
  autoPush: boolean
  commitAmend: boolean
  commitSignOff: boolean
  setCommitAmend: (value: boolean) => void
  setCommitSignOff: (value: boolean) => void
  setAutoPush: (value: boolean) => void
  isGuest: boolean
  userId?: string | null
  activeRepoPath?: string
  sourceFolder: string
  quickPrCwd?: string
  hasCheckSpotbugsRef: MutableRefObject<boolean>
  onCheck: () => void
  onCommit: () => void
  onQuickPrOpen: () => void
  className?: string
}

export const CommitFooterActions = memo(function CommitFooterActions({
  compact = false,
  variant,
  isAnyLoading,
  isLoadingCommit,
  versionControlSystem,
  isMultiRepo,
  effectivePaths,
  gitMultiTableRefs,
  gitDualTableRef,
  tableRef,
  autoPush,
  commitAmend,
  commitSignOff,
  setCommitAmend,
  setCommitSignOff,
  setAutoPush,
  isGuest,
  userId,
  activeRepoPath,
  sourceFolder,
  quickPrCwd,
  hasCheckSpotbugsRef,
  onCheck,
  onCommit,
  onQuickPrOpen,
  className,
}: CommitFooterActionsProps) {
  const { t } = useTranslation()
  const iconOnly = compact
  const iconClass = compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'
  const iconBtnClass = compact ? 'h-7 w-7 shrink-0' : 'h-9 w-9 shrink-0'
  const actionsGap = compact ? 'gap-1.5' : 'gap-2'

  const handleSpotbugs = () => {
    if (isAnyLoading) return

    let selectedFiles: string[] = []

    if (versionControlSystem === 'git') {
      if (isMultiRepo && effectivePaths.length > 0) {
        const stagedFiles = effectivePaths.flatMap(path => gitMultiTableRefs.current[path]?.getAllStagedFiles?.() ?? [])
        selectedFiles = stagedFiles.filter(file => file.filePath.endsWith('.java')).map(file => file.filePath)
      } else if (gitDualTableRef.current) {
        const stagedFiles = gitDualTableRef.current.getAllStagedFiles?.() ?? []
        selectedFiles = stagedFiles.filter(file => file.filePath.endsWith('.java')).map(file => file.filePath)
      } else {
        toast.warning(t('message.noFilesWarning'))
        return
      }
    } else {
      const selectedRows = tableRef.current?.table?.getSelectedRowModel().rows ?? []
      selectedFiles = selectedRows.filter(row => row.original.filePath.endsWith('.java')).map(row => row.original.filePath)
    }

    if (selectedFiles.length === 0) {
      toast.warning(t('toast.leastOneJavaFile'))
      return
    }

    window.api.electron.send(IPC.WINDOW.SPOTBUGS, selectedFiles)
    hasCheckSpotbugsRef.current = true
  }

  const handleQuickPr = () => {
    if (!userId || isGuest) {
      toast.warning(t('git.quickCreatePr.needLogin'))
      return
    }
    const cwd = activeRepoPath ?? sourceFolder
    if (!cwd?.trim()) {
      toast.warning(t('git.notAGitRepo'))
      return
    }
    onQuickPrOpen()
  }

  const checkButton = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="check-button"
          variant={variant}
          size="icon"
          className={cn(iconBtnClass, 'relative text-yellow-600 dark:text-yellow-400', isAnyLoading && 'cursor-progress')}
          onClick={() => {
            if (!isAnyLoading) onCheck()
          }}
        >
          <CheckCircle className={iconClass} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('common.check')}</TooltipContent>
    </Tooltip>
  ) : (
    <Button
      id="check-button"
      className={cn('relative text-yellow-600 dark:text-yellow-400', isAnyLoading && 'cursor-progress')}
      variant={variant}
      onClick={() => {
        if (!isAnyLoading) onCheck()
      }}
    >
      <CheckCircle className={iconClass} /> {t('common.check')}
    </Button>
  )

  const spotbugsButton = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="spotbugs-button"
          variant={variant}
          size="icon"
          className={cn(iconBtnClass, 'relative text-yellow-600 dark:text-yellow-400', isAnyLoading && 'cursor-progress')}
          onClick={handleSpotbugs}
        >
          <Bug className={iconClass} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('SpotBugs')}</TooltipContent>
    </Tooltip>
  ) : (
    <Button id="spotbugs-button" className={cn('relative text-yellow-600 dark:text-yellow-400', isAnyLoading && 'cursor-progress')} variant={variant} onClick={handleSpotbugs}>
      <Bug className={iconClass} /> {t('SpotBugs')}
    </Button>
  )

  const commitOptionsButton = (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant={variant} size="icon" className={cn(iconBtnClass, 'relative border-r border-border text-foreground')} aria-label={t('git.commitOptions')}>
              <SlidersHorizontal className={iconClass} />
              {autoPush ? (
                <span
                  className="pointer-events-none absolute right-0.5 top-0.5 flex size-[9px] items-center justify-center rounded-[2px] bg-emerald-600/80 px-px text-[7px] leading-none text-white shadow-sm dark:bg-emerald-500/70"
                  aria-hidden
                >
                  A
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t('git.commitOptions')}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-56 p-3" align="end" side="top">
        <div className="space-y-3">
          {autoPush ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <label htmlFor="commit-amend-popover" className="flex cursor-not-allowed select-none items-center gap-2 opacity-60">
                  <Checkbox id="commit-amend-popover" checked={commitAmend} onCheckedChange={c => setCommitAmend(c === true)} disabled />
                  <span className="text-sm">{t('git.commitAmend')}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="top">{t('git.commitAmendDisabledHint')}</TooltipContent>
            </Tooltip>
          ) : (
            <label htmlFor="commit-amend-popover" className="flex cursor-pointer select-none items-center gap-2">
              <Checkbox id="commit-amend-popover" checked={commitAmend} onCheckedChange={c => setCommitAmend(c === true)} />
              <span className="text-sm">{t('git.commitAmend')}</span>
            </label>
          )}
          <label htmlFor="commit-signoff-popover" className="flex cursor-pointer select-none items-center gap-2">
            <Checkbox id="commit-signoff-popover" checked={commitSignOff} onCheckedChange={c => setCommitSignOff(c === true)} />
            <span className="text-sm">{t('git.commitSignOff')}</span>
          </label>
          <label htmlFor="auto-push-popover" className="flex cursor-pointer select-none items-center gap-2">
            <Checkbox id="auto-push-popover" checked={autoPush} onCheckedChange={checked => setAutoPush(checked === true)} />
            <span className="text-sm">{t('git.autoPush')}</span>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )

  const commitButton = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="commit-button"
          variant={variant}
          size="icon"
          className={cn(
            iconBtnClass,
            'relative',
            isLoadingCommit && 'border-effect',
            isAnyLoading && 'cursor-progress',
            autoPush ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
          )}
          onClick={() => {
            if (!isAnyLoading) onCommit()
          }}
        >
          {isLoadingCommit ? <GlowLoader className={iconClass} /> : <SendHorizontal className={iconClass} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{autoPush ? t('common.commitAndPush') : t('common.commit')}</TooltipContent>
    </Tooltip>
  ) : (
    <Button
      id="commit-button"
      className={cn(
        'relative gap-1.5',
        isLoadingCommit && 'border-effect',
        isAnyLoading && 'cursor-progress',
        autoPush ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
      )}
      variant={variant}
      onClick={() => {
        if (!isAnyLoading) onCommit()
      }}
    >
      {isLoadingCommit ? <GlowLoader /> : <SendHorizontal className={iconClass} />}
      {autoPush ? t('common.commitAndPush') : t('common.commit')}
    </Button>
  )

  const quickPrColorClass = 'text-emerald-600 dark:text-emerald-400'

  const quickPrButton = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          id="quick-create-pr-button"
          variant={variant}
          size="icon"
          className={cn(iconBtnClass, 'shrink-0', quickPrColorClass)}
          disabled={isAnyLoading}
          onClick={handleQuickPr}
        >
          <GitPullRequest className={iconClass} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{t('git.quickCreatePr.tooltip')}</TooltipContent>
    </Tooltip>
  ) : (
    <Button type="button" id="quick-create-pr-button" variant={variant} className={cn('shrink-0 gap-1.5', quickPrColorClass)} disabled={isAnyLoading} onClick={handleQuickPr}>
      <GitPullRequest className={iconClass} /> {t('git.quickCreatePr.button')}
    </Button>
  )

  const svnCommitButton = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="commit-button"
          variant={variant}
          size="icon"
          className={cn(iconBtnClass, 'relative text-foreground', isLoadingCommit && 'border-effect', isAnyLoading && 'cursor-progress')}
          onClick={() => {
            if (!isAnyLoading) onCommit()
          }}
        >
          {isLoadingCommit ? <GlowLoader className={iconClass} /> : <SendHorizontal className={iconClass} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('common.commit')}</TooltipContent>
    </Tooltip>
  ) : (
    <Button
      id="commit-button"
      className={cn('relative gap-1.5 text-foreground', isLoadingCommit && 'border-effect', isAnyLoading && 'cursor-progress')}
      variant={variant}
      onClick={() => {
        if (!isAnyLoading) onCommit()
      }}
    >
      {isLoadingCommit ? <GlowLoader /> : <SendHorizontal className={iconClass} />} {t('common.commit')}
    </Button>
  )

  return (
    <div className={cn('flex shrink-0 flex-wrap items-center', actionsGap, className)}>
      {checkButton}
      {spotbugsButton}

      {versionControlSystem === 'git' ? (
        <>
          {quickPrButton}
          <div className="inline-flex overflow-hidden rounded-md [&_button:first-child]:rounded-l-md [&_button:last-child]:rounded-r-md [&_button]:rounded-none">
            {commitOptionsButton}
            {commitButton}
          </div>
        </>
      ) : (
        svnCommitButton
      )}

      <CommitWorkflowStatusBar repoPath={quickPrCwd} compact={compact} className="flex shrink-0 items-center" />
    </div>
  )
})
