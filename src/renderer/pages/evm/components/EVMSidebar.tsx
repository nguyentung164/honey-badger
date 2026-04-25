'use client'

import {
  BarChart3,
  BookOpen,
  ChartGantt,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type EVMTabId = 'dashboard' | 'gantt' | 'ev' | 'ac' | 'master' | 'report' | 'resource' | 'guideline'

type NavItem = { id: EVMTabId; icon: LucideIcon; labelKey: string }

const GROUPS: { groupLabelKey: string; items: NavItem[] }[] = [
  {
    groupLabelKey: 'evm.navGroupReporting',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, labelKey: 'evm.dashboard' },
      { id: 'report', icon: FileText, labelKey: 'evm.report' },
    ],
  },
  {
    groupLabelKey: 'evm.navGroupData',
    items: [
      { id: 'gantt', icon: ChartGantt, labelKey: 'evm.wbsSchedule' },
      { id: 'ac', icon: BarChart3, labelKey: 'evm.ac' },
      { id: 'resource', icon: Users, labelKey: 'evm.resourceUsage' },
    ],
  },
  {
    groupLabelKey: 'evm.navGroupComputed',
    items: [{ id: 'ev', icon: TrendingUp, labelKey: 'evm.ev' }],
  },
  {
    groupLabelKey: 'evm.navGroupSetup',
    items: [
      { id: 'master', icon: Database, labelKey: 'evm.master' },
      { id: 'guideline', icon: BookOpen, labelKey: 'evm.navGuideline' },
    ],
  },
]

const sidebarTransition =
  'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150 motion-reduce:transition-[width]'

const labelTransition =
  'transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150'

const EVM_SIDEBAR_COLLAPSED_KEY = 'evm-sidebar-collapsed'

function readEvmSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(EVM_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function EVMSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: EVMTabId
  onTabChange: (id: EVMTabId) => void
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(readEvmSidebarCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(EVM_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [collapsed])

  return (
    <nav
      className={cn(
        'flex shrink-0 flex-col overflow-hidden bg-muted/20',
        sidebarTransition,
        collapsed ? 'w-[52px] py-2 pl-1 pr-1' : 'w-[220px] py-3 pl-2 pr-1',
      )}
      aria-label={t('evm.sidebarNavLabel')}
    >
      <div
        className={cn(
          'mb-2 flex shrink-0 items-center',
          collapsed ? 'justify-center px-0' : 'justify-end pr-1',
        )}
      >
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCollapsed(c => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                'transition-colors duration-200 hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:duration-150" />
              ) : (
                <ChevronsLeft className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:duration-150" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[220px]">
            {collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
          </TooltipContent>
        </Tooltip>
      </div>

      {GROUPS.map((group, gi) => (
        <div
          key={group.groupLabelKey}
          className={cn(gi > 0 && 'border-t border-border/60', gi > 0 && (collapsed ? 'mt-2 pt-2' : 'mt-4 pt-4'))}
        >
          <p
            className={cn(
              'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
              labelTransition,
              collapsed ? 'mb-0 max-h-0 opacity-0 overflow-hidden py-0' : 'mb-1.5 max-h-8 opacity-100',
            )}
            aria-hidden={collapsed}
          >
            {t(group.groupLabelKey)}
          </p>
          <div className="flex flex-col gap-0.5" role="tablist" aria-orientation="vertical">
            {group.items.map(item => {
              const Icon = item.icon
              const active = activeTab === item.id
              const button = (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={0}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'flex min-h-9 w-full items-center rounded-md text-left text-sm',
                    'transition-[background-color,color,padding,gap] duration-200 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    collapsed ? 'justify-center gap-0 px-0 py-2' : 'gap-2.5 px-3 py-2',
                    active
                      ? 'bg-blue-500/15 font-medium text-blue-700 dark:text-blue-400'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-blue-500' : '')} aria-hidden />
                  <span
                    className={cn(
                      'min-w-0 truncate',
                      labelTransition,
                      collapsed ? 'ml-0 max-w-0 opacity-0 overflow-hidden' : 'max-w-[200px] opacity-100',
                    )}
                  >
                    {t(item.labelKey)}
                  </span>
                </button>
              )

              if (collapsed) {
                return (
                  <Tooltip key={item.id} delayDuration={400}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px]">
                      {t(item.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return <Fragment key={item.id}>{button}</Fragment>
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
