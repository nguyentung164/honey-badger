import type { MainShellView } from 'shared/mainShellView'
import { cn } from '@/lib/utils'

/** Per-tab accent colors (light + dark). Eight distinct hues across shell tabs. */
const SHELL_TAB_ACTIVE_COLORS: Record<MainShellView, string> = {
  editor:
    'data-[state=on]:!text-emerald-600 data-[state=on]:hover:!text-emerald-700 dark:data-[state=on]:!text-emerald-400 dark:data-[state=on]:hover:!text-emerald-300',
  vcs:
    'data-[state=on]:!text-sky-600 data-[state=on]:hover:!text-sky-700 dark:data-[state=on]:!text-sky-400 dark:data-[state=on]:hover:!text-sky-300',
  tasks:
    'data-[state=on]:!text-amber-600 data-[state=on]:hover:!text-amber-700 dark:data-[state=on]:!text-amber-400 dark:data-[state=on]:hover:!text-amber-300',
  prManager:
    'data-[state=on]:!text-rose-600 data-[state=on]:hover:!text-rose-700 dark:data-[state=on]:!text-rose-400 dark:data-[state=on]:hover:!text-rose-300',
  automation:
    'data-[state=on]:!text-violet-600 data-[state=on]:hover:!text-violet-700 dark:data-[state=on]:!text-violet-400 dark:data-[state=on]:hover:!text-violet-300',
  devPipelines:
    'data-[state=on]:!text-orange-600 data-[state=on]:hover:!text-orange-700 dark:data-[state=on]:!text-orange-400 dark:data-[state=on]:hover:!text-orange-300',
  showLog:
    'data-[state=on]:!text-indigo-600 data-[state=on]:hover:!text-indigo-700 dark:data-[state=on]:!text-indigo-400 dark:data-[state=on]:hover:!text-indigo-300',
}

const SHELL_TAB_DOCK_COLORS: Record<MainShellView, string> = {
  editor: 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300',
  vcs: 'text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300',
  tasks: 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300',
  prManager: 'text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300',
  automation: 'text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300',
  devPipelines: 'text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300',
  showLog: 'text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300',
}

export const SHELL_TAB_ICON_CLASS = 'relative z-10 h-3.5 w-3.5 shrink-0'

const SHELL_TAB_ACTIVE_BG: Record<MainShellView, string> = {
  editor: 'data-[state=on]:!bg-emerald-500/14 dark:data-[state=on]:!bg-emerald-400/16 data-[state=on]:shadow-none',
  vcs: 'data-[state=on]:!bg-sky-500/14 dark:data-[state=on]:!bg-sky-400/16 data-[state=on]:shadow-none',
  tasks: 'data-[state=on]:!bg-amber-500/14 dark:data-[state=on]:!bg-amber-400/16 data-[state=on]:shadow-none',
  prManager: 'data-[state=on]:!bg-rose-500/14 dark:data-[state=on]:!bg-rose-400/16 data-[state=on]:shadow-none',
  automation: 'data-[state=on]:!bg-violet-500/14 dark:data-[state=on]:!bg-violet-400/16 data-[state=on]:shadow-none',
  devPipelines: 'data-[state=on]:!bg-orange-500/14 dark:data-[state=on]:!bg-orange-400/16 data-[state=on]:shadow-none',
  showLog: 'data-[state=on]:!bg-indigo-500/14 dark:data-[state=on]:!bg-indigo-400/16 data-[state=on]:shadow-none',
}

export const SHELL_TAB_LABEL_CLASS = 'max-w-[7rem] truncate'

export function shellTabItemClass(view: MainShellView): string {
  return cn(
    'group h-[21px] px-1.5 group-data-[state=on]:px-2 sm:group-data-[state=on]:px-2.5 py-0 text-xs gap-1 !rounded-md !border-0 !shadow-none',
    'transition-[color,padding,background-color] duration-150 ease-out motion-reduce:transition-none',
    'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    SHELL_TAB_ACTIVE_COLORS[view],
    SHELL_TAB_ACTIVE_BG[view]
  )
}

export function shellTabDockButtonClass(view: MainShellView): string {
  return cn('h-[25px] w-[25px] shrink-0 rounded-sm hover:bg-muted', SHELL_TAB_DOCK_COLORS[view])
}
