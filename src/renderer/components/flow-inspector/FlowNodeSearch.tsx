'use client'

import { Panel } from '@xyflow/react'
import { Search, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

export type SearchableNode = {
  id: string
  label: string
  /** additional searchable blob (slug, description, etc.) */
  meta?: string
}

type Props = {
  nodes: SearchableNode[]
  onSelect: (nodeId: string) => void
  placeholder?: string
  noResultsText?: string
  className?: string
}

/**
 * A command-palette style node search rendered as a ReactFlow Panel.
 * - Opens with Ctrl+F / Cmd+F
 * - Arrow-key navigation + Enter to jump to a node
 * - Escape to close
 */
export const FlowNodeSearch = memo(function FlowNodeSearch({ nodes, onSelect, placeholder = 'Search nodes…', noResultsText = 'No results', className }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setOpen(prev => {
          if (!prev) setTimeout(() => inputRef.current?.focus(), 30)
          return !prev
        })
      }
      if (e.key === 'Escape' && open) {
        e.stopPropagation()
        setOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(n => {
      const blob = `${n.label}\n${n.meta ?? ''}`.toLowerCase()
      return blob.includes(q)
    })
  }, [nodes, query])

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id)
      setOpen(false)
      setQuery('')
    },
    [onSelect]
  )

  if (!open) {
    return (
      <Panel position="top-right" className={cn('pointer-events-auto mr-14 mt-2', className)}>
        <button
          type="button"
          title={`Search nodes (Ctrl+F)`}
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => {
            setOpen(true)
            setTimeout(() => inputRef.current?.focus(), 30)
          }}
        >
          <Search className="size-3.5" aria-hidden />
        </button>
      </Panel>
    )
  }

  return (
    <Panel position="top-right" className={cn('pointer-events-auto mr-2 mt-2 w-72', className)}>
      <Command shouldFilter={false} className="rounded-md border border-border bg-card/95 shadow-md backdrop-blur-sm">
        <div className="flex items-center border-b border-border px-2">
          <Search className="mr-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={placeholder}
            className="h-8 flex-1 border-0 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            className="ml-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false)
              setQuery('')
            }}
          >
            <X className="size-3" aria-hidden />
          </button>
        </div>
        <CommandList className="max-h-60 overflow-y-auto">
          <CommandEmpty>
            <span className="px-3 py-2 text-[11px] text-muted-foreground">{noResultsText}</span>
          </CommandEmpty>
          {filtered.map(n => (
            <CommandItem key={n.id} value={n.id} onSelect={() => handleSelect(n.id)} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {n.meta ? <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground/70 truncate max-w-[5rem]">{n.meta}</span> : null}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </Panel>
  )
})
