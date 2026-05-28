import { cn } from '@/lib/utils'

/** Shared sky → violet → emerald tones for project / page / flow across breadcrumb + catalog rail. */
export const catalogHierarchyTone = {
  project: {
    badge: 'bg-sky-500/20 text-sky-950 dark:bg-sky-500/25 dark:text-sky-50',
    icon: 'text-sky-700 dark:text-sky-300',
    itemSelected: 'bg-sky-500/20 font-medium text-sky-950 dark:bg-sky-500/25 dark:text-sky-50',
    itemHover: 'hover:bg-sky-500/12',
    rail: 'border-sky-500/35',
  },
  page: {
    badge: 'bg-violet-500/20 text-violet-950 dark:bg-violet-500/25 dark:text-violet-50',
    icon: 'text-violet-700 dark:text-violet-300',
    itemSelected: 'bg-violet-500/20 font-medium text-violet-950 dark:bg-violet-500/25 dark:text-violet-50',
    itemHover: 'hover:bg-violet-500/12',
    rail: 'border-violet-500/35',
    addButton:
      'border border-dashed border-violet-600/55 bg-transparent text-violet-800 shadow-none hover:bg-violet-500/8 dark:border-violet-500/50 dark:text-violet-300 dark:hover:bg-violet-500/10',
  },
  flow: {
    badge: 'bg-emerald-500/20 text-emerald-950 dark:bg-emerald-500/25 dark:text-emerald-50',
    icon: 'text-emerald-700 dark:text-emerald-300',
    itemSelected: 'bg-emerald-500/20 font-medium text-emerald-950 dark:bg-emerald-500/25 dark:text-emerald-50',
    itemHover: 'hover:bg-emerald-500/12',
    rail: 'border-emerald-500/35',
    addButton:
      'border border-dashed border-emerald-600/55 bg-transparent text-emerald-800 shadow-none hover:bg-emerald-500/8 dark:border-emerald-500/50 dark:text-emerald-300 dark:hover:bg-emerald-500/10',
  },
} as const

export type CatalogHierarchyLevel = keyof typeof catalogHierarchyTone

export function catalogHierarchyBadgeClass(level: CatalogHierarchyLevel, className?: string) {
  return cn(
    'inline-flex max-w-[9rem] items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium sm:max-w-[11rem]',
    catalogHierarchyTone[level].badge,
    className,
  )
}

export function catalogHierarchyIconClass(level: CatalogHierarchyLevel) {
  return cn('size-3 shrink-0', catalogHierarchyTone[level].icon)
}

export const catalogBreadcrumbAnimateClass =
  'animate-in fade-in-0 slide-in-from-left-2 zoom-in-95 duration-200 motion-reduce:animate-none'
