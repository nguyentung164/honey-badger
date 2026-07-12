'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { MainShellView } from 'shared/mainShellView'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getShellTabsInOrder } from '@/lib/shellTabDefs'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { SHELL_TAB_ICON_CLASS, SHELL_TAB_LABEL_CLASS, shellTabItemClass } from '@/pages/main/shellTabStyles'

type ShellTabSwitcherProps = {
  shellView: MainShellView
  onShellViewChange: (view: MainShellView) => void
  tasksDetached?: boolean
  prManagerDetached?: boolean
  automationDetached?: boolean
  devPipelinesDetached?: boolean
  showLogDetached?: boolean
}

export function ShellTabSwitcher({
  shellView,
  onShellViewChange,
  tasksDetached = false,
  prManagerDetached = false,
  automationDetached = false,
  devPipelinesDetached = false,
  showLogDetached = false,
}: ShellTabSwitcherProps) {
  const { t } = useTranslation()
  const hiddenShellTabs = useAppearanceStoreSelect(s => s.hiddenShellTabs)
  const shellTabOrder = useAppearanceStoreSelect(s => s.shellTabOrder)

  const tabs = useMemo(() => {
    return getShellTabsInOrder(shellTabOrder).filter(tab => {
      if (hiddenShellTabs.includes(tab.value)) return false
      if (tab.value === 'tasks') return !tasksDetached
      if (tab.value === 'prManager') return !prManagerDetached
      if (tab.value === 'automation') return !automationDetached
      if (tab.value === 'devPipelines') return !devPipelinesDetached
      if (tab.value === 'showLog') return !showLogDetached
      return true
    })
  }, [automationDetached, devPipelinesDetached, hiddenShellTabs, prManagerDetached, shellTabOrder, showLogDetached, tasksDetached])

  return (
    <ToggleGroup
      type="single"
      value={shellView}
      onValueChange={v => {
        if (v === 'editor' || v === 'vcs' || v === 'tasks' || v === 'prManager' || v === 'automation' || v === 'devPipelines' || v === 'showLog') {
          onShellViewChange(v)
        }
      }}
      variant="default"
      size="md"
      spacing={0}
      className={cn(
        'h-[25px] shrink-0 rounded-md border-0 shadow-none p-0.5 gap-0.5',
        'bg-muted/90 text-muted-foreground dark:bg-muted/45 dark:text-muted-foreground'
      )}
    >
      {tabs.map(tab => {
        const Icon = tab.icon
        const active = shellView === tab.value
        const label = tab.defaultLabel != null ? t(tab.labelKey, tab.defaultLabel) : t(tab.labelKey)

        return (
          <ToggleGroupItem key={tab.value} value={tab.value} aria-label={label} className={shellTabItemClass(tab.value)}>
            {!active ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 items-center">
                    <Icon className={SHELL_TAB_ICON_CLASS} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {label}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Icon className={SHELL_TAB_ICON_CLASS} />
            )}
            {active ? (
              <span className={cn(SHELL_TAB_LABEL_CLASS, 'animate-in fade-in duration-150')}>{label}</span>
            ) : null}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
