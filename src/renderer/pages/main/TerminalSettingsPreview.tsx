import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TERMINAL_SHELL_PROFILE_LABEL_KEYS, type TerminalShellProfileId } from 'shared/terminal/shells'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import {
  resolveFontWeightPreviewStyle,
  resolveTerminalFontFamily,
  resolveTerminalLigaturePreviewFontFamily,
  resolveTerminalTabTitle,
  TERMINAL_FONT_FAMILY_LABEL_KEYS,
  terminalLigatureCss,
  type TerminalPrefs,
} from '@/lib/terminal/terminalPrefs'
import { buildXtermThemeForPrefs, getTerminalThemeColors } from '@/lib/terminal/xtermTheme'
import { SETTINGS_FONT_MICRO, SettingsPreviewHintChips } from '@/components/settings/settingsDialogUi'
import { cn } from '@/lib/utils'
import {
  collectAllTerminalSettingsPreviewBehaviorHints,
  collectTerminalSettingsPreviewBehaviorHints,
  type TerminalSettingsPreviewScope,
} from '@/pages/main/terminalSettingsPreviewHints'

const PREVIEW_REPO_CWD = 'E:\\project\\honey-badger'
const PREVIEW_HOME_CWD = 'C:\\Users\\dev'
const PREVIEW_RESTORED_TABS = ['pwsh', 'powershell', 'cmd'] as const satisfies readonly TerminalShellProfileId[]

function resolvePreviewCwdPath(prefs: TerminalPrefs): string {
  if (prefs.cwdMode === 'home') return PREVIEW_HOME_CWD
  if (prefs.cwdMode === 'custom') {
    const custom = prefs.cwdCustom.trim()
    return custom || 'C:\\custom\\path'
  }
  return PREVIEW_REPO_CWD
}

function resolvePreviewShellLabel(shellId: TerminalShellProfileId, t: (key: string) => string): string {
  return t(TERMINAL_SHELL_PROFILE_LABEL_KEYS[shellId])
}

function resolvePreviewPrompt(shellId: TerminalShellProfileId, cwd: string): { accent: 'ps' | 'path' } {
  void cwd
  void shellId
  return shellId === 'cmd' ? { accent: 'path' } : { accent: 'ps' }
}

function resolvePreviewCursorColor(prefs: TerminalPrefs): string {
  const colors = getTerminalThemeColors()
  const theme = buildXtermThemeForPrefs(prefs.cursorColorMode, prefs.cursorColor, prefs.cursorStyle)
  return theme.cursor ?? colors.cursor
}

function resolvePreviewHeaderMeta(
  prefs: TerminalPrefs,
  t: (key: string) => string,
  scope: TerminalSettingsPreviewScope,
  tabTitle: string
): string {
  if (scope === 'all' || scope === 'typography') {
    return [
      `${prefs.fontSize}px`,
      t(TERMINAL_FONT_FAMILY_LABEL_KEYS[prefs.fontFamilyId]),
      prefs.lineHeight.toFixed(1),
      prefs.enableLigatures ? t('terminal.settings.ligaturesOn') : t('terminal.settings.ligaturesOff'),
    ].join(' · ')
  }

  if (scope === 'cursor') {
    return [
      t(`terminal.settings.cursorStyleOptions.${prefs.cursorStyle}`),
      prefs.cursorBlink ? t('terminal.settings.cursorBlinkOn') : t('terminal.settings.cursorBlinkOff'),
      prefs.cursorColorMode === 'custom' ? t('terminal.settings.cursorColorCustom') : t('terminal.settings.cursorColorTheme'),
    ].join(' · ')
  }

  return tabTitle
}

export type TerminalSettingsPreviewProps = {
  prefs: TerminalPrefs
  scope: TerminalSettingsPreviewScope
  cursorRef?: React.RefObject<HTMLSpanElement | null>
  className?: string
}

export function TerminalSettingsPreview({ prefs, scope, cursorRef, className }: TerminalSettingsPreviewProps) {
  const { t } = useTranslation()
  const appAppearanceKey = useAppAppearanceThemeKey()
  const weightStyle = useMemo(
    () => resolveFontWeightPreviewStyle(prefs.fontFamilyId, prefs.fontWeight),
    [prefs.fontFamilyId, prefs.fontWeight]
  )
  const fontFamily = resolveTerminalFontFamily(prefs.fontFamilyId)
  const ligatureDemoFontFamily = resolveTerminalLigaturePreviewFontFamily(prefs.fontFamilyId)
  const ligatureCss = terminalLigatureCss(prefs.enableLigatures)
  const colors = useMemo(() => getTerminalThemeColors(), [appAppearanceKey])
  const cwd = resolvePreviewCwdPath(prefs)
  const shellLabel = resolvePreviewShellLabel(prefs.defaultShellProfileId, t)
  const tabTitle = resolveTerminalTabTitle({
    mode: prefs.tabTitleMode,
    customTitle: prefs.tabTitleCustom,
    shellLabel,
    cwd,
  })
  const prompt = resolvePreviewPrompt(prefs.defaultShellProfileId, cwd)
  const cursorColor = useMemo(() => resolvePreviewCursorColor(prefs), [prefs, appAppearanceKey])
  const behaviorHints = useMemo(
    () =>
      scope === 'all'
        ? collectAllTerminalSettingsPreviewBehaviorHints(prefs, t)
        : collectTerminalSettingsPreviewBehaviorHints(prefs, t, scope),
    [prefs, scope, t]
  )
  const headerMeta = resolvePreviewHeaderMeta(prefs, t, scope, tabTitle)
  const previewTabs = prefs.reviveTabsOnLaunch ? PREVIEW_RESTORED_TABS : [prefs.defaultShellProfileId]

  useEffect(() => {
    cursorRef?.current?.style.setProperty('--terminal-cursor-color', cursorColor)
  }, [cursorColor, cursorRef])

  return (
    <div className={cn('flex h-full min-h-[18rem] flex-col overflow-hidden rounded-md border border-border/60 shadow-sm', className)} style={{ backgroundColor: colors.background }}>
      <div
        className="flex shrink-0 items-center justify-between border-b px-2.5 py-1"
        style={{
          borderColor: `${colors.foreground}18`,
          backgroundColor: `${colors.foreground}08`,
        }}
      >
        <span className={cn(SETTINGS_FONT_MICRO, 'font-medium uppercase tracking-wider')} style={{ color: `${colors.foreground}70` }}>
          {t('terminal.settings.preview')}
        </span>
        <span className={cn('max-w-[65%] truncate text-right tabular-nums', SETTINGS_FONT_MICRO)} style={{ color: `${colors.foreground}55` }}>
          {headerMeta}
        </span>
      </div>

      <div
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-1 py-0.5"
        style={{
          borderColor: `${colors.foreground}12`,
          backgroundColor: `${colors.foreground}05`,
        }}
      >
        {previewTabs.map(shellId => {
          const label = resolveTerminalTabTitle({
            mode: prefs.tabTitleMode,
            customTitle: prefs.tabTitleCustom,
            shellLabel: resolvePreviewShellLabel(shellId, t),
            cwd,
          })
          const active = shellId === prefs.defaultShellProfileId
          return (
            <div
              key={shellId}
              className={cn(
                'flex max-w-[8rem] shrink-0 items-center rounded-sm px-1.5 py-0.5',
                SETTINGS_FONT_MICRO,
                active ? 'ring-1' : 'opacity-70'
              )}
              style={
                active
                  ? {
                      color: colors.foreground,
                      backgroundColor: `${colors.foreground}10`,
                      boxShadow: `inset 0 0 0 1px ${colors.foreground}22`,
                    }
                  : { color: `${colors.foreground}88` }
              }
            >
              <span className="truncate">{label}</span>
              {prefs.enableShellIntegration && active ? (
                <span className="ml-1 shrink-0 opacity-70">{t('terminal.shellIntegration.running')}</span>
              ) : null}
            </div>
          )
        })}
      </div>

      <pre
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-2.5 py-2 text-[length:var(--terminal-preview-size)]"
        style={
          {
            '--terminal-preview-size': `${prefs.fontSize}px`,
            fontFamily: weightStyle.fontFamily,
            fontWeight: weightStyle.fontWeight,
            fontVariationSettings: weightStyle.fontVariationSettings,
            fontSynthesis: weightStyle.fontSynthesis,
            lineHeight: prefs.lineHeight,
            color: colors.foreground,
            ...ligatureCss,
          } as React.CSSProperties
        }
      >
        {prompt.accent === 'ps' ? (
          <>
            <span style={{ color: colors.cyan }}>PS</span> <span style={{ color: colors.yellow }}>{cwd}</span>
            <span style={{ color: colors.brightBlack }}>{'>'} </span>
          </>
        ) : (
          <>
            <span style={{ color: colors.yellow }}>{cwd}</span>
            <span style={{ color: colors.brightBlack }}>{'>'} </span>
          </>
        )}
        <span style={{ color: colors.green }}>git status</span>
        {'\n'}
        <span style={{ color: colors.brightBlack }}>On branch </span>
        <span style={{ color: colors.brightGreen }}>main</span>
        {'\n'}
        <span style={{ color: colors.foreground }}>plain </span>
        <span style={{ color: colors.red }}>error </span>
        <span style={{ color: colors.blue }}>info </span>
        <span style={{ color: colors.magenta }}>type </span>
        <span style={{ color: colors.brightYellow }}>warn</span>
        {'\n'}
        <span
          style={{
            color: colors.cyan,
            fontFamily: prefs.enableLigatures ? ligatureDemoFontFamily : fontFamily,
            ...ligatureCss,
          }}
        >
          {'=>  !=  >=  <=  ->  ::  ..  ...'}
        </span>
        {'\n'}
        <span style={{ color: colors.green }}>$</span>
        {' echo '}
        <span style={{ color: colors.cyan }}>"hello"</span>
        <span
          ref={cursorRef}
          className={cn(
            'terminal-settings-cursor',
            `terminal-settings-cursor--${prefs.cursorStyle}`,
            prefs.cursorBlink && 'terminal-settings-cursor--blink'
          )}
          style={{ '--terminal-cursor-color': cursorColor } as React.CSSProperties}
          aria-hidden
        />
      </pre>

      <SettingsPreviewHintChips
        hints={behaviorHints}
        style={{ borderColor: `${colors.foreground}12` } as React.CSSProperties}
      />
    </div>
  )
}
