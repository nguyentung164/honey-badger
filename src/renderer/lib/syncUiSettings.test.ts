import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({ default: { changeLanguage: vi.fn() } }))

describe('appearance theme mode', () => {
  let classes: Set<string>
  let attributes: Map<string, string>
  let media: EventTarget & { matches: boolean }

  beforeEach(() => {
    vi.resetModules()
    classes = new Set(['system', 'dark', 'theme-nord'])
    attributes = new Map()
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('document', {
      documentElement: {
        classList: {
          add: (...tokens: string[]) => {
            for (const token of tokens) classes.add(token)
          },
          remove: (...tokens: string[]) => {
            for (const token of tokens) classes.delete(token)
          },
          [Symbol.iterator]: () => classes.values(),
        },
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
    })
    vi.stubGlobal('window', Object.assign(new EventTarget(), { matchMedia: vi.fn(() => media) }))
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) })
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([false, true])('resolves fresh-install system mode (dark preference: %s)', async dark => {
    media.matches = dark
    const { applyAppearanceToDocument } = await import('./syncUiSettings')
    const preference = { themeMode: 'system', theme: 'theme-default' }
    applyAppearanceToDocument(preference)

    const mode = dark ? 'dark' : 'light'
    expect(attributes.get('data-theme-mode')).toBe(mode)
    expect([...classes].sort()).toEqual([mode, 'theme-default'].sort())
    expect(preference.themeMode).toBe('system')
  })

  it.each(['light', 'dark'])('keeps explicit %s mode regardless of system preference', async mode => {
    media.matches = mode === 'light'
    const { applyThemeToDocument } = await import('./syncUiSettings')
    applyThemeToDocument({ themeMode: mode, theme: 'theme-dracula' })

    expect(attributes.get('data-theme-mode')).toBe(mode)
    expect([...classes].sort()).toEqual([mode, 'theme-dracula'].sort())
  })

  it('follows system changes once and preserves the selected palette', async () => {
    const addListener = vi.spyOn(media, 'addEventListener')
    const { applyThemeToDocument, initSyncUiSettings } = await import('./syncUiSettings')
    initSyncUiSettings()
    initSyncUiSettings()
    applyThemeToDocument({ themeMode: 'system', theme: 'theme-nord' })
    // Palette changes do not go through the theme-mode setter.
    classes.delete('theme-nord')
    classes.add('theme-dracula')
    media.matches = true
    media.dispatchEvent(new Event('change'))

    expect(attributes.get('data-theme-mode')).toBe('dark')
    expect([...classes].sort()).toEqual(['dark', 'theme-dracula'])
    expect(addListener).toHaveBeenCalledTimes(1)
  })

  it('stops following system changes after selecting an explicit mode', async () => {
    const { applyThemeToDocument, initSyncUiSettings } = await import('./syncUiSettings')
    initSyncUiSettings()
    applyThemeToDocument({ themeMode: 'system', theme: 'theme-default' })
    applyThemeToDocument({ themeMode: 'light', theme: 'theme-default' })
    media.matches = true
    media.dispatchEvent(new Event('change'))

    expect(attributes.get('data-theme-mode')).toBe('light')
    expect([...classes].sort()).toEqual(['light', 'theme-default'])
  })
})
