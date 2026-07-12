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

const SHELL_TAB_DEF_BY_VALUE = new Map(SHELL_TAB_DEFS.map(def => [def.value, def]))

/** Thứ tự mặc định trên title bar (khớp SHELL_TAB_DEFS). */
export const DEFAULT_SHELL_TAB_ORDER: MainShellView[] = SHELL_TAB_DEFS.map(def => def.value)

/** Chuẩn hóa thứ tự đã lưu: bỏ tab lạ, thêm tab mới ở cuối. */
export function normalizeShellTabOrder(order: MainShellView[] | null | undefined): MainShellView[] {
  const seen = new Set<MainShellView>()
  const normalized: MainShellView[] = []
  for (const tab of order ?? []) {
    if (!SHELL_TAB_DEF_BY_VALUE.has(tab) || seen.has(tab)) continue
    seen.add(tab)
    normalized.push(tab)
  }
  for (const tab of DEFAULT_SHELL_TAB_ORDER) {
    if (!seen.has(tab)) normalized.push(tab)
  }
  return normalized
}

/** Trả về metadata một tab theo value. */
export function getShellTabDef(value: MainShellView): ShellTabDef | undefined {
  return SHELL_TAB_DEF_BY_VALUE.get(value)
}

/** Trả về metadata tab theo thứ tự người dùng đã cấu hình. */
export function getShellTabsInOrder(order: MainShellView[] | null | undefined): ShellTabDef[] {
  return normalizeShellTabOrder(order)
    .map(value => SHELL_TAB_DEF_BY_VALUE.get(value))
    .filter((def): def is ShellTabDef => def != null)
}
