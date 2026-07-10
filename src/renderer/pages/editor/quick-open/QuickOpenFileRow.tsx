'use client'

import { memo } from 'react'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { CommandItem } from '@/components/ui/command'
import { QuickOpenHighlightLabel } from '@/pages/editor/quick-open/QuickOpenHighlightLabel'
import { formatQuickOpenDirname } from 'shared/editor/quickOpenFuzzy'
import { cn } from '@/lib/utils'

export type QuickOpenFileRowProps = {
  path: string
  fileName: string
  dirname: string
  /** Workspace folder name — shown as a badge when Quick Open searches multiple roots. */
  folderLabel?: string
  matchIndices: readonly number[]
  locationSuffix?: string
  onSelect: () => void
}

export const QuickOpenFileRow = memo(function QuickOpenFileRow({
  path,
  fileName,
  dirname,
  folderLabel,
  matchIndices,
  locationSuffix,
  onSelect,
}: QuickOpenFileRowProps) {
  const displayDir = dirname ? formatQuickOpenDirname(dirname) : ''

  return (
    <CommandItem
      value={path}
      onSelect={onSelect}
      onPointerDown={event => {
        // Prevent Radix dialog click-through reopening/focus glitches after selection.
        event.preventDefault()
      }}
      className={cn(
        'hb-quick-open-item gap-2 rounded-none px-2 py-0',
        'text-[var(--hb-quick-open-filename)]',
        'data-[selected=true]:bg-[var(--hb-quick-open-selection)] data-[selected=true]:text-[var(--hb-quick-open-filename)]',
        'aria-selected:bg-[var(--hb-quick-open-selection)]'
      )}
      style={{ minHeight: 22, height: 22 }}
    >
      <MaterialFileIcon name={fileName} size={16} className="opacity-90" />
      <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <QuickOpenHighlightLabel label={fileName} matchIndices={matchIndices} className="text-[13px] leading-[22px]" />
        {displayDir ? (
          <span className="truncate text-[13px] leading-[22px] text-[var(--hb-quick-open-path)]">{displayDir}</span>
        ) : null}
        {locationSuffix ? (
          <span className="shrink-0 text-[13px] leading-[22px] text-[var(--hb-quick-open-path)]">{locationSuffix}</span>
        ) : null}
        {folderLabel ? (
          <span className="ml-auto shrink-0 truncate rounded-full bg-muted px-1.5 text-[11px] leading-[18px] text-muted-foreground">
            {folderLabel}
          </span>
        ) : null}
      </span>
    </CommandItem>
  )
})
