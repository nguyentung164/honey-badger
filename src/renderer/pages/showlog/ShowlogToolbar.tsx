'use client'

import { LayoutTemplate, Minus, Square, SquareArrowOutDownLeft, X } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WorkspaceRepoChrome } from '@/components/workspace/WorkspaceRepoChrome'
import { useStandaloneWorkspaceRepoChrome } from '@/hooks/useStandaloneWorkspaceRepoChrome'
import { cn } from '@/lib/utils'

interface ShowlogToolbarProps {
  filePath?: string
  isLoading: boolean
  onToggleLayout?: () => void
  versionControlSystem: 'svn' | 'git'
  contextSourceFolder?: string
  onFolderChange?: (sourceFolder: string, versionControlSystem: 'git' | 'svn') => void
  gitLogRevision?: string | null
  onGitLogRevisionChange?: (revision: string | null) => void
  embedded?: boolean
  onStandaloneDock?: () => void
}

const ShowlogToolbarEmbedded: React.FC<Pick<ShowlogToolbarProps, 'onToggleLayout'>> = ({ onToggleLayout }) => {
  return (
    <div className={cn('flex items-center justify-between h-8 min-w-0 flex-1 text-sm select-none gap-2 w-full')} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="min-h-0 min-w-0 flex-1 self-stretch" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} aria-hidden />
      <div className="flex min-w-0 shrink-0 items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {onToggleLayout ? (
          <Button
            variant="link"
            size="sm"
            onClick={onToggleLayout}
            className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] mr-2"
          >
            <LayoutTemplate className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const ShowlogToolbarStandalone: React.FC<ShowlogToolbarProps> = ({
  filePath,
  isLoading,
  onToggleLayout,
  versionControlSystem,
  contextSourceFolder,
  onFolderChange,
  gitLogRevision = null,
  onGitLogRevisionChange,
  onStandaloneDock,
}) => {
  const { t } = useTranslation()

  const standaloneChrome = useStandaloneWorkspaceRepoChrome({
    versionControlSystem,
    contextSourceFolder,
    gitLogRevision,
    onGitLogRevisionChange,
    onFolderChange,
    isLoading,
  })

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  return (
    <div
      className="flex items-center justify-between h-8 min-w-0 flex-1 text-sm select-none gap-2"
      style={{ WebkitAppRegion: 'drag', backgroundColor: 'var(--main-bg)', color: 'var(--main-fg)' } as React.CSSProperties}
    >
      <div className="w-10 h-6 flex justify-center items-center shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
      </div>

      <Button variant="ghost" className="min-w-0 flex-1 justify-center font-medium text-xs truncate px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {filePath !== '.' ? t('dialog.showLogs.titleWithPath', { 0: filePath }) : t('dialog.showLogs.title')}
      </Button>

      <div className="flex min-w-0 shrink-0 items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-1 pt-0.5">
          <WorkspaceRepoChrome shellView="showLog" branchMode="logRef" className="px-0 h-7" {...standaloneChrome} />
        </div>

        {onToggleLayout ? (
          <Button
            variant="link"
            size="sm"
            onClick={onToggleLayout}
            className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] mr-2"
          >
            <LayoutTemplate className="h-4 w-4" />
          </Button>
        ) : null}

        {onStandaloneDock ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                onClick={onStandaloneDock}
                aria-label={t('showlog.dock', 'Dock Show Log to main window')}
              >
                <SquareArrowOutDownLeft strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('showlog.dock', 'Dock Show Log to main window')}</TooltipContent>
          </Tooltip>
        ) : null}

        <button
          type="button"
          onClick={() => handleWindow('minimize')}
          className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
        >
          <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button
          type="button"
          onClick={() => handleWindow('maximize')}
          className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
        >
          <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
          <X size={20} strokeWidth={1} absoluteStrokeWidth />
        </button>
      </div>
    </div>
  )
}

export const ShowlogToolbar: React.FC<ShowlogToolbarProps> = props => {
  if (props.embedded) {
    return <ShowlogToolbarEmbedded onToggleLayout={props.onToggleLayout} />
  }
  return <ShowlogToolbarStandalone {...props} />
}
