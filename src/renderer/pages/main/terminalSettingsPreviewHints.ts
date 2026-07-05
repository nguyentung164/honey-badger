import type { TFunction } from 'i18next'
import type { TerminalPrefs } from '@/lib/terminal/terminalPrefs'

export type TerminalSettingsPreviewScope =
  | 'typography'
  | 'cursor'
  | 'shell'
  | 'session'
  | 'clipboard'
  | 'sound'
  | 'all'

const ALL_TERMINAL_PREVIEW_SCOPES = ['typography', 'shell', 'session', 'clipboard', 'sound'] as const satisfies readonly Exclude<
  TerminalSettingsPreviewScope,
  'cursor' | 'all'
>[]

/** Footer hints for unified settings view (all groups). */
export function collectAllTerminalSettingsPreviewBehaviorHints(prefs: TerminalPrefs, t: TFunction): string[] {
  return ALL_TERMINAL_PREVIEW_SCOPES.flatMap(scope => collectTerminalSettingsPreviewBehaviorHints(prefs, t, scope))
}

/** Non-visual terminal settings surfaced as footer labels in the settings preview. */
export function collectTerminalSettingsPreviewBehaviorHints(
  prefs: TerminalPrefs,
  t: TFunction,
  scope: TerminalSettingsPreviewScope
): string[] {
  const hints: Array<string | null> = []

  if (scope === 'typography') {
    hints.push(`${t('terminal.settings.scrollback')}: ${prefs.scrollback.toLocaleString()}`)
    if (prefs.smoothScrolling) hints.push(t('terminal.settings.smoothScrolling'))
    if (prefs.scrollOnUserInput) hints.push(t('terminal.settings.scrollOnUserInput'))
    if (prefs.fastScrollModifier !== 'none') {
      hints.push(
        `${t('terminal.settings.fastScrollModifier')}: ${t(`terminal.settings.fastScrollModifierOptions.${prefs.fastScrollModifier}`)} · ${prefs.fastScrollSensitivity}`
      )
    }
    if (prefs.enableWebGlRenderer) hints.push(t('terminal.settings.enableWebGlRenderer'))
  }

  if (scope === 'shell') {
    hints.push(`${t('terminal.settings.defaultShell')}: ${t(`terminal.shell.${prefs.defaultShellProfileId}`)}`)
    hints.push(`${t('terminal.settings.workingDirectory')}: ${t(`terminal.settings.cwdMode.${prefs.cwdMode}`)}`)
    if (prefs.cwdMode === 'custom' && prefs.cwdCustom.trim()) {
      hints.push(prefs.cwdCustom.trim())
    }
  }

  if (scope === 'session') {
    if (prefs.keepSessionsWhenPanelClosed) hints.push(t('terminal.settings.keepSessions'))
    if (prefs.confirmOnKill) hints.push(t('terminal.settings.confirmOnKill'))
    if (prefs.enableShellIntegration) hints.push(t('terminal.settings.enableShellIntegration'))
    if (prefs.reviveTabsOnLaunch) hints.push(t('terminal.settings.reviveTabsOnLaunch'))
    hints.push(`${t('terminal.settings.tabTitle')}: ${t(`terminal.settings.tabTitleOptions.${prefs.tabTitleMode}`)}`)
    if (prefs.tabTitleMode === 'custom' && prefs.tabTitleCustom.trim()) {
      hints.push(prefs.tabTitleCustom.trim())
    }
  }

  if (scope === 'clipboard') {
    if (prefs.copyOnSelect) hints.push(t('terminal.settings.copyOnSelect'))
    hints.push(
      `${t('terminal.settings.rightClickBehavior')}: ${t(`terminal.settings.rightClickBehaviorOptions.${prefs.rightClickBehavior}`)}`
    )
    if (prefs.altClickMovesCursor) hints.push(t('terminal.settings.altClickMovesCursor'))
    if (prefs.enableMultiLinePasteWarning) hints.push(t('terminal.settings.multiLinePasteWarning'))
    hints.push(
      `${t('terminal.settings.copyShortcut')}: ${t(`terminal.settings.copyShortcutOptions.${prefs.copyShortcut}`)}`
    )
    hints.push(
      `${t('terminal.settings.pasteShortcut')}: ${t(`terminal.settings.pasteShortcutOptions.${prefs.pasteShortcut}`)}`
    )
  }

  if (scope === 'sound') {
    hints.push(prefs.bellEnabled ? t('terminal.settings.bell') : t('terminal.settings.previewBellOff'))
  }

  return hints.filter((label): label is string => Boolean(label))
}
