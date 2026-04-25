import type { ButtonVariant, FontFamily, FontSize, Language, Theme, ThemeMode } from 'main/store/AppearanceStore'
import { useTheme } from 'next-themes'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

function createDebouncedStorage<T>(baseStorage: ReturnType<typeof createJSONStorage<T>>, debounceMs: number) {
  if (!baseStorage) return undefined
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingKey: string | null = null
  let pendingValue: { state: T; version?: number } | null = null

  const flush = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (pendingKey && pendingValue && baseStorage) {
      baseStorage.setItem(pendingKey, pendingValue as any)
      pendingKey = null
      pendingValue = null
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
  }

  return {
    getItem: baseStorage.getItem.bind(baseStorage),
    setItem: (name: string, value: { state: T; version?: number }) => {
      pendingKey = name
      pendingValue = value
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, debounceMs)
    },
    removeItem: baseStorage.removeItem.bind(baseStorage),
  }
}

type AppearanceStore = {
  theme: Theme
  themeMode: ThemeMode
  fontSize: FontSize
  fontFamily: FontFamily
  buttonVariant: ButtonVariant
  language: Language
  panelHeight: number
  setTheme: (theme: Theme) => void
  setThemeMode: (mode: ThemeMode) => void
  setFontSize: (size: FontSize) => void
  setFontFamily: (font: FontFamily) => void
  setButtonVariant: (variant: ButtonVariant) => void
  setLanguage: (language: Language) => void
  setPanelHeight: (height: number) => void
}

let appearanceIpcTimer: ReturnType<typeof setTimeout> | null = null
const pendingAppearance: Record<string, unknown> = {}

function flushAppearanceIpc() {
  appearanceIpcTimer = null
  for (const [key, value] of Object.entries(pendingAppearance)) {
    window.api.appearance.set(key, value)
    delete pendingAppearance[key]
  }
}

function debouncedAppearanceSet(key: string, value: unknown) {
  pendingAppearance[key] = value
  if (!appearanceIpcTimer) {
    appearanceIpcTimer = setTimeout(flushAppearanceIpc, 120)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (appearanceIpcTimer) {
      clearTimeout(appearanceIpcTimer)
      appearanceIpcTimer = null
      flushAppearanceIpc()
    }
  })
}

const useStore = create<AppearanceStore>()(
  persist(
    set => ({
      theme: 'theme-default',
      themeMode: 'light',
      fontSize: 'medium',
      fontFamily: 'sans',
      buttonVariant: 'default',
      language: 'en',
      panelHeight: 150,
      setTheme: theme => {
        set({ theme })
        const html = document.documentElement
        for (const cls of html.classList) {
          if (cls.startsWith('theme-')) html.classList.remove(cls)
        }
        html.classList.add(theme)
        debouncedAppearanceSet('theme', theme)
      },
      setThemeMode: mode => {
        const html = document.documentElement
        html.classList.remove('dark', 'light')
        html.classList.add(mode)
        document.documentElement.setAttribute('data-theme-mode', mode)
        set({ themeMode: mode })
        debouncedAppearanceSet('themeMode', mode)
      },
      setFontSize: size => {
        document.documentElement.setAttribute('data-font-size', size)
        set({ fontSize: size })
        debouncedAppearanceSet('fontSize', size)
      },
      setFontFamily: font => {
        document.documentElement.setAttribute('data-font-family', font)
        set({ fontFamily: font })
        debouncedAppearanceSet('fontFamily', font)
      },
      setButtonVariant: variant => {
        document.documentElement.setAttribute('data-button-variant', variant)
        set({ buttonVariant: variant })
        debouncedAppearanceSet('buttonVariant', variant)
      },
      setLanguage: language => {
        set({ language })
        debouncedAppearanceSet('language', language)
      },
      setPanelHeight: height => {
        set({ panelHeight: height })
        debouncedAppearanceSet('panelHeight', height)
      },
    }),
    {
      name: 'ui-settings',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storage: (createDebouncedStorage(
        createJSONStorage<AppearanceStore>(() => localStorage),
        200
      ) ?? createJSONStorage(() => localStorage)) as any,
      partialize: state => ({
        theme: state.theme,
        themeMode: state.themeMode,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        buttonVariant: state.buttonVariant,
        language: state.language,
        panelHeight: state.panelHeight,
      }),
    }
  )
)

export const useAppearanceStore = () => {
  const { setTheme } = useTheme()
  const store = useStore()
  const setThemeWrapper = (theme: Theme) => {
    setTheme(theme)
    store.setTheme(theme)
  }
  return { ...store, setTheme: setThemeWrapper }
}

export const useButtonVariant = () => useStore(state => state.buttonVariant)
export const usePanelHeight = () => useStore(state => state.panelHeight)
export const useAppearanceStoreSelect = useStore
