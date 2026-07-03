'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { EXPLORER_TREE_ROW_HEIGHT } from '@/pages/editor/explorer/explorerTreeConstants'

type ExplorerRowInlineEditProps = {
  value: string
  className?: string
  selectAll?: boolean
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

export function ExplorerRowInlineEdit({ value, className, selectAll = false, onChange, onCommit, onCancel }: ExplorerRowInlineEditProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (selectAll) input.select()
  }, [selectAll])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit()
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      className={cn(
        'min-w-0 flex-1 rounded-sm border border-primary/50 bg-background px-1 text-[13px] outline-none ring-1 ring-primary/30',
        className
      )}
      style={{ height: EXPLORER_TREE_ROW_HEIGHT - 4 }}
      onChange={e => onChange(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          committedRef.current = true
          onCancel()
        }
      }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    />
  )
}
