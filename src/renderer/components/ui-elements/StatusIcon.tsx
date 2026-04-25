import { EyeOff, File, FileClock, FileDiff, FileMinus, FilePen, FilePlus, FileQuestion, FileType, FileWarning, FileX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import {
  GIT_STATUS_COLOR_CLASS_MAP,
  GIT_STATUS_TEXT,
  type GitStatusCode,
  STATUS_COLOR_CLASS_MAP,
  STATUS_TEXT,
  SVN_UPDATE_STATUS_TEXT,
  type SvnStatusCode,
  type SvnUpdateStatusCode,
} from '../shared/constants'

type Props = {
  code: SvnStatusCode | SvnUpdateStatusCode | GitStatusCode
  className?: string
  /** Override VCS (e.g. for Dashboard showing multiple repos) */
  vcsType?: 'git' | 'svn'
  /** Use SVN update status (U, G, E) instead of regular status */
  svnUpdateMode?: boolean
}

const UPDATE_STATUS_COLOR: Record<string, string> = {
  U: 'text-blue-600 dark:text-blue-400',
  G: 'text-indigo-600 dark:text-indigo-400',
  E: 'text-gray-600 dark:text-gray-400',
}

export const StatusIcon = ({ code, className, vcsType: vcsOverride, svnUpdateMode }: Props) => {
  const { t } = useTranslation()
  const { versionControlSystem } = useConfigurationStore()
  const effectiveVcs = vcsOverride ?? versionControlSystem

  // SVN update mode: U, G, E use SVN_UPDATE_STATUS_TEXT
  const isSvnUpdate = svnUpdateMode && ['U', 'G', 'E'].includes(code)
  const isGit = effectiveVcs === 'git' && !isSvnUpdate
  const statusText = isSvnUpdate ? SVN_UPDATE_STATUS_TEXT : isGit ? GIT_STATUS_TEXT : STATUS_TEXT
  const colorClassMap = isSvnUpdate ? UPDATE_STATUS_COLOR : isGit ? GIT_STATUS_COLOR_CLASS_MAP : STATUS_COLOR_CLASS_MAP

  // Type narrowing to suppress implicit 'any' error for indexing
  const iconKey = code as keyof typeof STATUS_ICON
  const Icon = STATUS_ICON[iconKey] ?? File
  const colorKey = code as keyof typeof colorClassMap
  const colorClass = (colorClassMap as Record<string, string>)[colorKey] ?? 'text-muted-foreground'

  const tooltipText = (statusText as Record<string, string>)[code] ? t((statusText as Record<string, string>)[code]) : code

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Icon strokeWidth={1.5} className={`${className ?? 'w-4 h-4'} ${colorClass}`} />
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  )
}

// Combined icon mapping for both SVN and Git (includes SVN update codes U, G, E)
export const STATUS_ICON: Record<SvnStatusCode | SvnUpdateStatusCode | GitStatusCode, React.ElementType> = {
  A: FilePlus,
  M: FilePen,
  D: FileMinus,
  R: FileDiff,
  C: FileWarning,
  X: FileClock,
  I: EyeOff,
  '?': FileQuestion,
  '!': FileX,
  '~': FileType,
  U: FilePen, // Git unmerged / SVN Updated
  T: FileType, // Git type changed
  G: FileDiff, // SVN Merged
  E: FileClock, // SVN Existed
}
