import type {
  ButtonVariant,
  FontFamily,
  FontSize,
  Language,
  Theme,
  ThemeMode,
} from 'main/store/AppearanceStore'
import { applyAppearanceToDocument } from '@/lib/syncUiSettings'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

type AppearanceSnapshot = {
  theme?: string
  themeMode?: string
  fontSize?: string
  fontFamily?: string
  buttonVariant?: string
  language?: string
  panelHeight?: number
}

function isUiSettingsEmpty(): boolean {
  try {
    const raw = localStorage.getItem('ui-settings')
    if (!raw) return true
    const state = JSON.parse(raw)?.state
    return !state || typeof state !== 'object'
  } catch {
    return true
  }
}

/** Load disk-backed settings into Zustand before the first paint. */
export async function bootstrapPersistedState(): Promise<void> {
  const tasks: Promise<void>[] = []

  if (window.api?.configuration?.get) {
    tasks.push(
      window.api.configuration.get().then(data => {
        if (!data || typeof data !== 'object') return
        const state = useConfigurationStore.getState()
        const updates: Record<string, unknown> = { isConfigLoaded: true }
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
          if (key in state) updates[key] = value
        }
        useConfigurationStore.setState(updates as Partial<typeof state>)
      })
    )
  }

  if (window.api?.appearance?.get) {
    tasks.push(
      window.api.appearance.get().then(data => {
        const appearance = data as AppearanceSnapshot | null
        if (!appearance || typeof appearance !== 'object') return

        const shouldPreferMain = isUiSettingsEmpty()
        const current = useAppearanceStoreSelect.getState()

        const next = {
          theme: ((shouldPreferMain ? appearance.theme : current.theme) ?? appearance.theme ?? current.theme) as Theme,
          themeMode: ((shouldPreferMain ? appearance.themeMode : current.themeMode) ??
            appearance.themeMode ??
            current.themeMode) as ThemeMode,
          fontSize: ((shouldPreferMain ? appearance.fontSize : current.fontSize) ??
            appearance.fontSize ??
            current.fontSize) as FontSize,
          fontFamily: ((shouldPreferMain ? appearance.fontFamily : current.fontFamily) ??
            appearance.fontFamily ??
            current.fontFamily) as FontFamily,
          buttonVariant: ((shouldPreferMain ? appearance.buttonVariant : current.buttonVariant) ??
            appearance.buttonVariant ??
            current.buttonVariant) as ButtonVariant,
          language: ((shouldPreferMain ? appearance.language : current.language) ??
            appearance.language ??
            current.language) as Language,
          panelHeight: typeof appearance.panelHeight === 'number' ? appearance.panelHeight : current.panelHeight,
        }

        useAppearanceStoreSelect.setState(next)
        applyAppearanceToDocument(next)
        try {
          localStorage.setItem('ui-settings', JSON.stringify({ state: next, version: 0 }))
        } catch {
          /* ignore quota */
        }
      })
    )
  }

  await Promise.all(tasks)
}
