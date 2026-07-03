import { useCallback, useState } from 'react'
import { readTerminalPrefs, resetTerminalPrefs, writeTerminalPrefs, type TerminalPrefs } from '@/lib/terminal/terminalPrefs'

export function useTerminalPrefs() {
  const [prefs, setPrefs] = useState<TerminalPrefs>(() => readTerminalPrefs())

  const updatePrefs = useCallback((next: TerminalPrefs) => {
    setPrefs(next)
    writeTerminalPrefs(next)
  }, [])

  const patchPrefs = useCallback((patch: Partial<TerminalPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      writeTerminalPrefs(next)
      return next
    })
  }, [])

  const resetPrefs = useCallback(() => {
    const defaults = resetTerminalPrefs()
    setPrefs(defaults)
    return defaults
  }, [])

  return { prefs, updatePrefs, patchPrefs, resetPrefs }
}
