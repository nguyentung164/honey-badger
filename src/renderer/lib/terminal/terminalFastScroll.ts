import type { Terminal } from '@xterm/xterm'
import type { TerminalPrefs } from './terminalPrefs'

type FastScrollPrefs = Pick<TerminalPrefs, 'fastScrollModifier' | 'fastScrollSensitivity'>

/** xterm 6 fixes its fast-scroll modifier to Alt; use public sensitivity options for other choices. */
export function attachTerminalFastScroll(term: Pick<Terminal, 'element' | 'options'>, getPrefs: () => FastScrollPrefs): () => void {
  const element = term.element
  if (!element) return () => {}

  term.options.fastScrollSensitivity = 1
  term.options.scrollSensitivity = 1
  const onWheel = (event: WheelEvent) => {
    const prefs = getPrefs()
    const pressed =
      (prefs.fastScrollModifier === 'alt' && event.altKey) || (prefs.fastScrollModifier === 'ctrl' && event.ctrlKey) || (prefs.fastScrollModifier === 'shift' && event.shiftKey)
    const sensitivity = pressed ? prefs.fastScrollSensitivity : 1
    if (term.options.scrollSensitivity !== sensitivity) term.options.scrollSensitivity = sensitivity
  }

  // Update before xterm's viewport handles this wheel event, including the first event after a modifier changes.
  element.addEventListener('wheel', onWheel, { capture: true, passive: true })
  return () => element.removeEventListener('wheel', onWheel, { capture: true })
}
