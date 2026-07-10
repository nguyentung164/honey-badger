import type { LucideIcon } from 'lucide-react'
import { Bot, CheckSquare, FileCode2, Folder, GitPullRequest, History, Rocket } from 'lucide-react'
import type { MainShellView } from 'shared/mainShellView'

export type ShellTabDef = {
  value: MainShellView
  icon: LucideIcon
  labelKey: string
  defaultLabel?: string
}

/** Metadata (icon + label) cho từng tab trên title bar, dùng chung cho ShellTabSwitcher và setting ẩn/hiện tab. */
export const SHELL_TAB_DEFS: ShellTabDef[] = [
  { value: 'editor', icon: FileCode2, labelKey: 'mainShell.editor' },
  { value: 'vcs', icon: Folder, labelKey: 'mainShell.sourceControl' },
  { value: 'showLog', icon: History, labelKey: 'mainShell.showLog', defaultLabel: 'Show Log' },
  { value: 'tasks', icon: CheckSquare, labelKey: 'mainShell.tasks' },
  { value: 'prManager', icon: GitPullRequest, labelKey: 'mainShell.prManager' },
  { value: 'automation', icon: Bot, labelKey: 'mainShell.automation' },
  { value: 'devPipelines', icon: Rocket, labelKey: 'mainShell.devPipelines', defaultLabel: 'Dev Pipelines' },
]
