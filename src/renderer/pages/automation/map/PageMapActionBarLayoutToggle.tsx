'use client'

import { LayoutGrid, LayoutList } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  getPageMapActionBarVertical,
  setPageMapActionBarVertical,
  subscribePageMapActionBarVertical,
} from '@/pages/automation/map/pageMapActionBarLayoutStore'

export type PageMapActionBarLayoutToggleProps = {
  className?: string
}

/** Toggles page map action bar dock (vertical strip vs horizontal bar). Synced via `pageMapActionBarLayoutStore`. */
export function PageMapActionBarLayoutToggle({ className }: PageMapActionBarLayoutToggleProps) {
  const { t } = useTranslation()
  const vertical = useSyncExternalStore(subscribePageMapActionBarVertical, getPageMapActionBarVertical, () => false)
  const toggle = useCallback(() => setPageMapActionBarVertical(!getPageMapActionBarVertical()), [])
  const label = vertical ? t('automation.pageMap.layoutHorizontal') : t('automation.pageMap.layoutVertical')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className={cn(
            'h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
            className
          )}
          onClick={toggle}
          aria-label={label}
        >
          {vertical ? (
            <LayoutGrid strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
          ) : (
            <LayoutList strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
