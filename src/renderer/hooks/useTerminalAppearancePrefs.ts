import { useTerminalPrefs } from '@/hooks/useTerminalPrefs'

/** @deprecated Use useTerminalPrefs */
export function useTerminalAppearancePrefs() {
  const { prefs, updatePrefs } = useTerminalPrefs()
  return { prefs, updatePrefs }
}
