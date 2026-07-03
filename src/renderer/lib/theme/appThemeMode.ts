import type { AppThemeId } from '@/lib/theme/appCodePaletteTypes'
import { resolveCurrentAppThemeId } from '@/lib/theme/appCodePalettes'

/** Single source of truth: Settings → Appearance light/dark (not next-themes). */
export function resolveAppIsDarkFromDocument(): boolean {
  if (typeof document === 'undefined') return false
  const mode = document.documentElement.getAttribute('data-theme-mode')
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return document.documentElement.classList.contains('dark')
}

export function resolveAppThemeMode(): 'light' | 'dark' {
  return resolveAppIsDarkFromDocument() ? 'dark' : 'light'
}

let themeProbe: HTMLElement | null = null

/** Read a CSS custom property for a specific appearance theme + mode (independent of current DOM). */
export function readCssVarForAppearance(
  varName: string,
  themeId: AppThemeId,
  appIsDark: boolean,
  fallback: string,
  read: (el: HTMLElement, varName: string, fallback: string) => string
): string {
  if (typeof document === 'undefined') return fallback

  if (!themeProbe) {
    themeProbe = document.createElement('div')
    themeProbe.setAttribute('aria-hidden', 'true')
    themeProbe.hidden = true
    themeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px;width:0;height:0'
    document.documentElement.appendChild(themeProbe)
  }

  const mode = appIsDark ? 'dark' : 'light'
  themeProbe.setAttribute('data-theme-mode', mode)
  themeProbe.className = `${mode} ${themeId}`

  return read(themeProbe, varName, fallback)
}

export function resolveActiveAppearanceContext(): { themeId: AppThemeId; appIsDark: boolean } {
  return {
    themeId: resolveCurrentAppThemeId(),
    appIsDark: resolveAppIsDarkFromDocument(),
  }
}
