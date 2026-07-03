import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

/** Changes when app light/dark mode or color theme (Settings → Appearance) changes. */
export function useAppAppearanceThemeKey(): string {
  const themeMode = useAppearanceStoreSelect(s => s.themeMode)
  const theme = useAppearanceStoreSelect(s => s.theme)
  return `${themeMode}:${theme}`
}
