import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTerminalToggleShortcut, shouldBlockTerminalToggleShortcut } from './terminalToggleShortcut'

function keyEvent(init: {
  code?: string
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): KeyboardEvent {
  return {
    code: init.code ?? '',
    key: init.key ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: null,
  } as KeyboardEvent
}

function fakeElement(
  tagName: string,
  options?: {
    isContentEditable?: boolean
    closest?: (selector: string) => HTMLElement | null
  }
): HTMLElement {
  return {
    tagName,
    isContentEditable: options?.isContentEditable ?? false,
    closest: options?.closest ?? (() => null),
  } as HTMLElement
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isTerminalToggleShortcut', () => {
  it('matches Ctrl+Backquote', () => {
    expect(isTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(true)
  })

  it('matches Cmd+Backquote', () => {
    expect(isTerminalToggleShortcut(keyEvent({ metaKey: true, code: 'Backquote', key: '`' }))).toBe(true)
  })

  it('rejects bare Backquote', () => {
    expect(isTerminalToggleShortcut(keyEvent({ code: 'Backquote', key: '`' }))).toBe(false)
  })

  it('rejects Ctrl+Shift+Backquote', () => {
    expect(isTerminalToggleShortcut(keyEvent({ ctrlKey: true, shiftKey: true, code: 'Backquote', key: '`' }))).toBe(false)
  })
})

describe('shouldBlockTerminalToggleShortcut', () => {
  it('allows explorer tree container focus', () => {
    const tree = fakeElement('DIV')
    vi.stubGlobal('document', { activeElement: tree })
    expect(shouldBlockTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(false)
  })

  it('allows monaco textarea focus', () => {
    const textarea = fakeElement('TEXTAREA', {
      closest: selector => (selector.includes('monaco-editor') ? textarea : null),
    })
    vi.stubGlobal('document', { activeElement: textarea })
    expect(shouldBlockTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(false)
  })

  it('allows xterm textarea focus', () => {
    const textarea = fakeElement('TEXTAREA', {
      closest: selector => (selector.includes('xterm') ? textarea : null),
    })
    vi.stubGlobal('document', { activeElement: textarea })
    expect(shouldBlockTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(false)
  })

  it('blocks search query input focus', () => {
    const input = fakeElement('INPUT', {
      closest: selector => (selector.includes('editor-search-find-input') ? input : null),
    })
    vi.stubGlobal('document', { activeElement: input })
    expect(shouldBlockTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(true)
  })

  it('blocks dialog input focus', () => {
    const input = fakeElement('INPUT', {
      closest: selector => (selector.includes('dialog-content') ? input : null),
    })
    vi.stubGlobal('document', { activeElement: input })
    expect(shouldBlockTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(true)
  })

  it('allows sidebar button focus', () => {
    const button = fakeElement('BUTTON')
    vi.stubGlobal('document', { activeElement: button })
    expect(shouldBlockTerminalToggleShortcut(keyEvent({ ctrlKey: true, code: 'Backquote', key: '`' }))).toBe(false)
  })
})
