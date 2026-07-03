import type { Terminal } from '@xterm/xterm'
import type { TerminalRightClickBehavior, TerminalShortcutModifier } from '@/lib/terminal/terminalPrefs'

export type PasteConfirmHandler = (text: string) => Promise<boolean>

export type TerminalContextMenuActions = {
  copy: () => void
  paste: () => void
  selectAll: () => void
}

export async function copyTerminalSelection(term: Terminal): Promise<boolean> {
  const selection = term.getSelection()
  if (!selection) return false
  try {
    await navigator.clipboard.writeText(selection)
    return true
  } catch {
    return false
  }
}

export async function pasteToTerminal(
  write: (data: string) => void,
  options?: { confirmMultiLine?: PasteConfirmHandler }
): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText()
    if (!text) return false
    if ((text.includes('\n') || text.includes('\r')) && options?.confirmMultiLine) {
      const ok = await options.confirmMultiLine(text)
      if (!ok) return false
    }
    write(text)
    return true
  } catch {
    return false
  }
}

function modifierMatches(event: KeyboardEvent, modifier: TerminalShortcutModifier): boolean {
  const key = event.key.toLowerCase()
  if (key !== 'c' && key !== 'v') return false
  switch (modifier) {
    case 'ctrlShift':
      return event.ctrlKey && event.shiftKey && !event.altKey
    case 'ctrl':
      return event.ctrlKey && !event.shiftKey && !event.altKey
    case 'alt':
      return event.altKey && !event.ctrlKey && !event.shiftKey
    default:
      return false
  }
}

export function attachTerminalShortcutHandler(
  term: Terminal,
  options: {
    copyShortcut: TerminalShortcutModifier
    pasteShortcut: TerminalShortcutModifier
    write: (data: string) => void
    confirmMultiLine?: PasteConfirmHandler
  }
): () => void {
  term.attachCustomKeyEventHandler(event => {
    if (event.type !== 'keydown') return true
    const key = event.key.toLowerCase()

    if (key === 'c' && modifierMatches(event, options.copyShortcut)) {
      if (term.hasSelection()) {
        void copyTerminalSelection(term)
        return false
      }
      return true
    }

    if (key === 'v' && modifierMatches(event, options.pasteShortcut)) {
      event.preventDefault()
      void pasteToTerminal(options.write, { confirmMultiLine: options.confirmMultiLine })
      return false
    }

    return true
  })

  return () => {
    term.attachCustomKeyEventHandler(() => true)
  }
}

export function attachCopyOnSelect(container: HTMLElement, term: Terminal, enabled: boolean): () => void {
  if (!enabled) return () => {}

  const onMouseUp = () => {
    const selection = term.getSelection()
    if (!selection) return
    void navigator.clipboard.writeText(selection).catch(() => {})
  }
  container.addEventListener('mouseup', onMouseUp)
  return () => container.removeEventListener('mouseup', onMouseUp)
}

function getCellFromMouse(term: Terminal, event: MouseEvent): { col: number; row: number } | null {
  const screen = term.element?.querySelector('.xterm-screen')
  if (!screen) return null

  const rect = screen.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const cellWidth = rect.width / term.cols
  const cellHeight = rect.height / term.rows
  const col = Math.floor((event.clientX - rect.left) / cellWidth)
  const row = term.buffer.active.viewportY + Math.floor((event.clientY - rect.top) / cellHeight)

  if (col < 0 || col >= term.cols || row < 0) return null
  return { col, row }
}

function isWordChar(char: string): boolean {
  return /[\w./@:$~_-]/.test(char)
}

function selectWordAt(term: Terminal, col: number, row: number): void {
  const line = term.buffer.active.getLine(row)
  if (!line) return

  const text = line.translateToString(true)
  if (!text) return

  const clampedCol = Math.max(0, Math.min(col, Math.max(0, text.length - 1)))
  let start = clampedCol
  let end = clampedCol

  while (start > 0 && isWordChar(text[start - 1] ?? '')) start -= 1
  while (end < text.length && isWordChar(text[end] ?? '')) end += 1

  if (end > start) {
    term.select(start, row, end - start)
  }
}

export function attachRightClickBehavior(
  container: HTMLElement,
  term: Terminal,
  options: {
    behavior: TerminalRightClickBehavior
    write: (data: string) => void
    confirmMultiLine?: PasteConfirmHandler
    onContextMenu?: (event: MouseEvent, actions: TerminalContextMenuActions) => void
  }
): () => void {
  if (options.behavior === 'nothing') return () => {}

  const actions: TerminalContextMenuActions = {
    copy: () => void copyTerminalSelection(term),
    paste: () => void pasteToTerminal(options.write, { confirmMultiLine: options.confirmMultiLine }),
    selectAll: () => term.selectAll(),
  }

  const onContextMenu = (event: MouseEvent) => {
    switch (options.behavior) {
      case 'paste':
        event.preventDefault()
        void pasteToTerminal(options.write, { confirmMultiLine: options.confirmMultiLine })
        break
      case 'copyPaste':
        event.preventDefault()
        if (term.hasSelection()) {
          void copyTerminalSelection(term)
        } else {
          void pasteToTerminal(options.write, { confirmMultiLine: options.confirmMultiLine })
        }
        break
      case 'selectWord': {
        event.preventDefault()
        const cell = getCellFromMouse(term, event)
        if (cell) selectWordAt(term, cell.col, cell.row)
        options.onContextMenu?.(event, actions)
        break
      }
      case 'default':
        event.preventDefault()
        options.onContextMenu?.(event, actions)
        break
      default:
        break
    }
  }

  container.addEventListener('contextmenu', onContextMenu)
  return () => container.removeEventListener('contextmenu', onContextMenu)
}
