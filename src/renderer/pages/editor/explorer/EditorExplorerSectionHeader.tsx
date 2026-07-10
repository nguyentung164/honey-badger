'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EditorExplorerSectionId } from '@/pages/editor/hooks/useEditorExplorerSectionPrefs'
import { EXPLORER_SECTION_HEADER_HEIGHT } from '@/pages/editor/explorer/explorerSectionRows'

type EditorExplorerSectionHeaderProps = {
  sectionId: EditorExplorerSectionId
  expanded: boolean
  count?: number
  label?: string
  isActiveFolder?: boolean
  onToggle: (sectionId: EditorExplorerSectionId) => void
  onCloseAll?: () => void
}

export const EditorExplorerSectionHeader = memo(function EditorExplorerSectionHeader({
  sectionId,
  expanded,
  count,
  label,
  isActiveFolder = false,
  onToggle,
  onCloseAll,
}: EditorExplorerSectionHeaderProps) {
  const { t } = useTranslation()
  const defaultLabel =
    sectionId === 'open-editors'
      ? t('editor.openEditors')
      : t('editor.workspace')
  const displayLabel = label ?? defaultLabel

  return (
    <div
      className={cn(
        'sticky top-0 z-[1] flex w-full items-center gap-1 bg-muted/50 px-1 text-left text-[11px] font-bold tracking-wide text-foreground',
        sectionId === 'open-editors' ? 'uppercase' : 'normal-case'
      )}
      style={{ height: EXPLORER_SECTION_HEADER_HEIGHT }}
    >
      <button
        type="button"
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1 px-1 hover:bg-muted/60',
          isActiveFolder && 'text-primary'
        )}
        onClick={() => onToggle(sectionId)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{displayLabel}</span>
        {count != null && count > 0 ? <span className="text-muted-foreground">({count})</span> : null}
      </button>
      {sectionId === 'open-editors' && onCloseAll && count != null && count > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 px-1.5 text-[10px] font-normal normal-case"
          onClick={e => {
            e.stopPropagation()
            onCloseAll()
          }}
        >
          {t('editor.closeAllEditors')}
        </Button>
      ) : null}
    </div>
  )
})
