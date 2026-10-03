/**
 * Centralized UI settings sync from localStorage (ui-settings).
 * Registers a single storage listener to avoid duplicates across ShowLog, CheckCodingRules, CodeDiffViewer.
 * Components that need Monaco theme updates should listen for 'ui-settings-synced' custom event.
 */
import i18n from '@/lib/i18n'

const UI_SETTINGS_KEY = 'ui-settings'
const SYNCED_EVENT = 'ui-settings-synced'
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'
let currentThemeMode = 'light'

export interface UiSettingsSyncedDetail {
  themeMode: string
  theme: string
}

/** Keep the saved preference (`system`) separate from the resolved CSS mode. */
export function applyThemeModeToDocument(themeMode: string) {
  const html = document.documentElement
  currentThemeMode = themeMode
  const resolvedMode = themeMode === 'system' ? (window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light') : themeMode

  html.classList.remove('dark', 'light', 'system')
  html.setAttribute('data-theme-mode', resolvedMode)
  html.classList.add(resolvedMode)
}

export function applyThemeToDocument(state: { themeMode?: string; theme?: string }) {
  const html = document.documentElement
  const theme = state.theme || 'theme-default'
  applyThemeModeToDocument(state.themeMode || 'light')

  for (const cls of Array.from(html.classList)) {
    if (cls.startsWith('theme-')) html.classList.remove(cls)
  }
  html.classList.add(theme)
}

/** Apply appearance prefs to the document only — no Zustand/IPC/localStorage writes. */
export function applyAppearanceToDocument(state: {
  themeMode?: string
  theme?: string
  fontSize?: string
  fontFamily?: string
  buttonVariant?: string
}) {
  applyThemeToDocument(state)
  const html = document.documentElement
  if (state.fontSize) html.setAttribute('data-font-size', state.fontSize)
  if (state.fontFamily) html.setAttribute('data-font-family', state.fontFamily)
  if (state.buttonVariant) html.setAttribute('data-button-variant', state.buttonVariant)
}

function handleStorage(event: StorageEvent) {
  if (event.key !== UI_SETTINGS_KEY) return
  try {
    const storage = JSON.parse(event.newValue || '{}')
    const state = storage?.state
    if (!state) return

    applyThemeToDocument(state)
    const html = document.documentElement
    if (state.fontSize) html.setAttribute('data-font-size', state.fontSize)
    if (state.fontFamily) html.setAttribute('data-font-family', state.fontFamily)
    if (state.buttonVariant) html.setAttribute('data-button-variant', state.buttonVariant)
    if (state.language) i18n.changeLanguage(state.language)

    window.dispatchEvent(
      new CustomEvent<UiSettingsSyncedDetail>(SYNCED_EVENT, {
        detail: { themeMode: state.themeMode, theme: state.theme },
      })
    )
  } catch {
    // Ignore parse errors
  }
}

let initialized = false

export function initSyncUiSettings() {
  if (initialized) return
  initialized = true

  // Áp dụng theme ngay khi load (trước React) từ localStorage để tránh flash sai màu
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY)
    const state = raw ? JSON.parse(raw)?.state : null
    const s = state || { themeMode: 'light', theme: 'theme-default' }
    applyThemeToDocument(s)
    if (s.fontSize) document.documentElement.setAttribute('data-font-size', s.fontSize)
    if (s.fontFamily) document.documentElement.setAttribute('data-font-family', s.fontFamily)
    if (s.buttonVariant) document.documentElement.setAttribute('data-button-variant', s.buttonVariant)
  } catch {
    // Ignore parse errors
  }

  window.addEventListener('storage', handleStorage)
  window.matchMedia(SYSTEM_THEME_QUERY).addEventListener('change', () => {
    if (currentThemeMode === 'system') applyThemeModeToDocument(currentThemeMode)
  })
}

export { SYNCED_EVENT }
