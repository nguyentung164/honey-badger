import { nativeTheme } from 'electron'
import type { ThemeMode } from '../store/AppearanceStore'
import appearanceStore from '../store/AppearanceStore'

export function getWindowBackgroundColor(): string {
  const themeMode = appearanceStore.get('themeMode') as ThemeMode | undefined
  const useDark = themeMode === 'dark' || (themeMode === 'system' && nativeTheme.shouldUseDarkColors)
  return useDark ? '#1a1a1a' : '#ffffff'
}
