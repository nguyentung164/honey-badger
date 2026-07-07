/** Ctrl/Cmd+` (Backquote) — match physical key for non-US layouts. */
export function isTerminalToggleShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey) return false
  if (!event.ctrlKey && !event.metaKey) return false
  return event.code === 'Backquote' || event.key === '`'
}

function isFocusableElement(value: unknown): value is HTMLElement {
  return (
    typeof value === 'object' &&
    value != null &&
    'tagName' in value &&
    typeof (value as HTMLElement).tagName === 'string' &&
    'closest' in value &&
    typeof (value as HTMLElement).closest === 'function'
  )
}

function resolveShortcutFocusElement(event: KeyboardEvent): HTMLElement | null {
  if (isFocusableElement(document.activeElement)) return document.activeElement
  if (isFocusableElement(event.target)) return event.target
  return null
}

function isTypingSurface(el: HTMLElement): boolean {
  if (el.closest('.monaco-editor, .hb-monaco-editor-root')) return false
  if (el.closest('.xterm')) return false

  if (el.closest('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')) return true
  if (el.closest('.editor-search-find-input, .editor-search-replace-input, .editor-search-pattern-input')) {
    return true
  }

  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (el.isContentEditable) return true

  return false
}

/**
 * Block toggle only when keyboard focus is in a real text-entry surface.
 * Monaco and xterm use textareas for input but should still accept the workbench shortcut.
 */
export function shouldBlockTerminalToggleShortcut(event: KeyboardEvent): boolean {
  const focused = resolveShortcutFocusElement(event)
  if (!focused) return false
  return isTypingSurface(focused)
}
