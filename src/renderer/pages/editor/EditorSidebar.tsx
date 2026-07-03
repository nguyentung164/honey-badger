'use client'

import { Files, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { EditorSidebarView } from '@/pages/editor/hooks/useEditorSidebarView'

type EditorSidebarProps = {
  activeView: EditorSidebarView
  onViewChange: (view: EditorSidebarView) => void
  children: ReactNode
}

export function EditorSidebar({ activeView, onViewChange, children }: EditorSidebarProps) {
  const { t } = useTranslation()
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
        <div className="min-w-0 flex-1 truncate px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
