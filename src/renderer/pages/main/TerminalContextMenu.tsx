import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TerminalContextMenuActions } from '@/lib/terminal/terminalInput'
import { cn } from '@/lib/utils'

export type TerminalContextMenuState = {
  x: number
  y: number
  actions: TerminalContextMenuActions
}

type TerminalContextMenuProps = {
  menu: TerminalContextMenuState | null
  labels: { copy: string; paste: string; selectAll: string }
  onClose: () => void
}

export function TerminalContextMenu({ menu, labels, onClose }: TerminalContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu, onClose])

  if (!menu) return null

  const run = (action: () => void) => {
    action()
    onClose()
  }

  const items = [
    { key: 'copy', label: labels.copy, action: menu.actions.copy },
    { key: 'paste', label: labels.paste, action: menu.actions.paste },
    { key: 'selectAll', label: labels.selectAll, action: menu.actions.selectAll },
  ] as const

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[200] min-w-[9rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={cn(
            'flex w-full rounded-sm px-2 py-1.5 text-left text-sm outline-none',
            'hover:bg-accent hover:text-accent-foreground'
          )}
          onClick={() => run(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
