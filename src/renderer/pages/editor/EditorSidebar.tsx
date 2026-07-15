'use client'

import { Files, Search, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { EditorSettingsDialog } from '@/pages/editor/EditorSettingsDialog'
import type { EditorSidebarView } from '@/pages/editor/hooks/useEditorSidebarView'

type EditorSidebarProps = {
  activeView: EditorSidebarView
  onViewChange: (view: EditorSidebarView) => void
  children: ReactNode
}

export function EditorSidebar({ activeView, onViewChange, children }: EditorSidebarProps) {
  const { t } = useTranslation()
  const [showEditorSettings, setShowEditorSettings] = useState(false)
  const title = activeView === 'explorer' ? t('editor.explorer') : t('editor.search')

  const items = useMemo(
    () =>
      [
        { id: 'explorer' as const, icon: Files, label: t('editor.explorer') },
        { id: 'search' as const, icon: Search, label: t('editor.search') },
      ] as const,
    [t]
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-r bg-background">
      <div className="flex h-[36.5px] shrink-0 items-center border-b">
        <div className="flex h-full items-center gap-0.5 px-1">
          {items.map(item => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                title={item.label}
                aria-pressed={active}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'flex h-full w-10 items-center justify-center rounded-none text-muted-foreground transition-colors',
                  'hover:bg-muted hover:text-foreground',
                  active && 'border-b-2 border-b-primary bg-muted/50 text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 pr-1">
          <div className="min-w-0 flex-1 truncate px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowEditorSettings(true)}
                className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] shrink-0"
                aria-label={t('editor.settings.title')}
              >
                <Settings2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('editor.settings.title')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {showEditorSettings ? <EditorSettingsDialog open onOpenChange={setShowEditorSettings} /> : null}
    </div>
  )
}
