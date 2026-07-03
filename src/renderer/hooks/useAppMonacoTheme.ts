import type * as Monaco from 'monaco-editor'
import { useEffect, useMemo } from 'react'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import { type AppMonacoThemeRegisterOptions, applyAppMonacoTheme, onAppMonacoBeforeMount, registerAppMonacoThemes, resolveAppMonacoThemeId } from '@/lib/monaco/appMonacoTheme'
import { SYNCED_EVENT } from '@/lib/syncUiSettings'
import { resolveAppIsDarkFromDocument } from '@/lib/theme/appThemeMode'

export { onAppMonacoBeforeMount }

/** Theme id for `<Editor theme={...} />` — updates when app appearance changes. */
export function useAppMonacoThemeId(): string {
  const appAppearanceKey = useAppAppearanceThemeKey()

  return useMemo(() => {
    void appAppearanceKey
    return resolveAppMonacoThemeId(resolveAppIsDarkFromDocument())
  }, [appAppearanceKey])
}

/** Re-register Monaco themes from CSS vars and apply the active theme globally. */
export function useSyncAppMonacoTheme(monaco: typeof Monaco | null | undefined, options?: AppMonacoThemeRegisterOptions): void {
  const appAppearanceKey = useAppAppearanceThemeKey()

  useEffect(() => {
    if (!monaco) return
    const appIsDark = resolveAppIsDarkFromDocument()
    const frame = requestAnimationFrame(() => {
      applyAppMonacoTheme(monaco, appIsDark)
    })
    return () => cancelAnimationFrame(frame)
  }, [monaco, appAppearanceKey])

  useEffect(() => {
    if (!monaco) return
    const sync = () => {
      requestAnimationFrame(() => {
        registerAppMonacoThemes(monaco, options)
        applyAppMonacoTheme(monaco, resolveAppIsDarkFromDocument())
      })
    }
    window.addEventListener(SYNCED_EVENT, sync)
    return () => window.removeEventListener(SYNCED_EVENT, sync)
  }, [monaco, options])
}

/** Sync all Monaco editors when appearance changes (no useMonaco instance required). */
export function useGlobalAppMonacoThemeSync(_options?: AppMonacoThemeRegisterOptions): string {
  const themeId = useAppMonacoThemeId()
  const appAppearanceKey = useAppAppearanceThemeKey()

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void import('monaco-editor').then(monaco => {
        const appIsDark = resolveAppIsDarkFromDocument()
        registerAppMonacoThemes(monaco, _options)
        applyAppMonacoTheme(monaco, appIsDark, themeId)
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [appAppearanceKey, themeId])

  return themeId
}
