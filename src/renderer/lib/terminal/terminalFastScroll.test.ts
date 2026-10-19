import type { Terminal } from '@xterm/xterm'
import { describe, expect, it, vi } from 'vitest'
import { attachTerminalFastScroll } from './terminalFastScroll'
import type { TerminalFastScrollModifier } from './terminalPrefs'

function createTerminal() {
  const element = new EventTarget()
  const term: Pick<Terminal, 'element' | 'options'> = { element: element as HTMLElement, options: {} }
  const wheel = (keys: Partial<Pick<WheelEvent, 'altKey' | 'ctrlKey' | 'shiftKey'>> = {}) => {
    element.dispatchEvent(Object.assign(new Event('wheel'), { altKey: false, ctrlKey: false, shiftKey: false, ...keys }))
  }
  return { element, term, wheel }
}

describe('terminal fast scrolling with xterm 6', () => {
  it.each([
    ['alt', { altKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
  ] as const)('accelerates only while the configured %s modifier is held', (fastScrollModifier, keys) => {
    const { term, wheel } = createTerminal()
    attachTerminalFastScroll(term, () => ({ fastScrollModifier, fastScrollSensitivity: 5 }))
    expect(term.options.fastScrollSensitivity).toBe(1)
    wheel(keys)
    expect(term.options.scrollSensitivity).toBe(5)
    wheel()
    expect(term.options.scrollSensitivity).toBe(1)
  })

  it('uses updated preferences on the next wheel event and disables acceleration for none', () => {
    const { term, wheel } = createTerminal()
    let prefs: { fastScrollModifier: TerminalFastScrollModifier; fastScrollSensitivity: number } = {
      fastScrollModifier: 'ctrl',
      fastScrollSensitivity: 3,
    }
    attachTerminalFastScroll(term, () => prefs)
    wheel({ altKey: true })
    expect(term.options.scrollSensitivity).toBe(1)
    wheel({ ctrlKey: true })
    expect(term.options.scrollSensitivity).toBe(3)
    prefs = { fastScrollModifier: 'shift', fastScrollSensitivity: 8 }
    wheel({ shiftKey: true })
    expect(term.options.scrollSensitivity).toBe(8)
    prefs = { fastScrollModifier: 'none', fastScrollSensitivity: 8 }
    wheel({ altKey: true, ctrlKey: true, shiftKey: true })
    expect(term.options.scrollSensitivity).toBe(1)
  })

  it('registers before viewport handling and detaches on disposal', () => {
    const { element, term, wheel } = createTerminal()
    const addListener = vi.spyOn(element, 'addEventListener')
    const removeListener = vi.spyOn(element, 'removeEventListener')
    const detach = attachTerminalFastScroll(term, () => ({ fastScrollModifier: 'alt', fastScrollSensitivity: 5 }))
    expect(addListener).toHaveBeenCalledWith('wheel', expect.any(Function), { capture: true, passive: true })
    detach()
    expect(removeListener).toHaveBeenCalledWith('wheel', expect.any(Function), { capture: true })
    wheel({ altKey: true })
    expect(term.options.scrollSensitivity).toBe(1)
  })
})
