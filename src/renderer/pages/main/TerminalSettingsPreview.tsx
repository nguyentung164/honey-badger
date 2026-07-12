import { Eraser, Loader, Plus, RotateCcw, Settings2, X } from 'lucide-react'
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
import { TerminalShellTabIcon } from '@/pages/main/TerminalShellTabIcon'
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

function resolvePreviewCursorColor(prefs: TerminalPrefs): string {
  const theme = buildXtermThemeForPrefs(prefs.cursorColorMode, prefs.cursorColor, prefs.cursorStyle)
  return theme.cursor ?? getTerminalThemeColors().cursor
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

type TerminalSettingsPreviewTabProps = {
  shellId: TerminalShellProfileId
  label: string
  active: boolean
  running: boolean
}

function TerminalSettingsPreviewTab({ shellId, label, active, running }: TerminalSettingsPreviewTabProps) {
  return (
    <div
      className={cn(
        'group flex h-6 max-w-[11rem] shrink-0 items-center gap-0.5 rounded-sm pl-2 pr-1 text-xs',
        running
          ? active
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'text-emerald-600/90 dark:text-emerald-400/90'
          : active
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground'
      )}
      aria-current={active ? 'true' : undefined}
    >
      <span
        className={cn('min-w-0 flex-1 truncate text-left', running && 'text-emerald-600 dark:text-emerald-400')}
        title={label}
      >
        {label}
      </span>
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {running ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <Loader className="size-3 animate-spin text-emerald-600 dark:text-emerald-400" />
          </span>
        ) : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <TerminalShellTabIcon shellProfileId={shellId} />
          </span>
        )}
        <span className="flex h-full w-full items-center justify-center p-0.5 opacity-0" aria-hidden>
          <X className="size-3 text-red-500 dark:text-red-400" />
        </span>
      </div>
    </div>
  )
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
  const previewRunning = prefs.enableShellIntegration
  const isCmdShell = prefs.defaultShellProfileId === 'cmd'

  useEffect(() => {
    cursorRef?.current?.style.setProperty('--terminal-cursor-color', cursorColor)
  }, [cursorColor, cursorRef])

  return (
    <div className={cn('flex h-full min-h-[18rem] flex-col overflow-hidden rounded-md border border-border/60 bg-background shadow-sm', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/10 px-2.5 py-1">
        <span className={cn(SETTINGS_FONT_MICRO, 'font-medium uppercase tracking-wider text-muted-foreground')}>
          {t('terminal.settings.preview')}
        </span>
        <span className={cn('max-w-[65%] truncate text-right tabular-nums text-muted-foreground/80', SETTINGS_FONT_MICRO)}>
          {headerMeta}
        </span>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {previewTabs.map(shellId => {
            const active = shellId === prefs.defaultShellProfileId
            const label = resolveTerminalTabTitle({
              mode: prefs.tabTitleMode,
              customTitle: prefs.tabTitleCustom,
              shellLabel: resolvePreviewShellLabel(shellId, t),
              cwd,
            })
            return (
              <TerminalSettingsPreviewTab
                key={shellId}
                shellId={shellId}
                label={label}
                active={active}
                running={active && previewRunning}
              />
            )
          })}
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground"
            aria-hidden
          >
            <Plus className="size-3.5" />
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/40 pl-1 text-muted-foreground">
          <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden>
            <Settings2 className="size-3.5" />
          </span>
          <span className="inline-flex h-6 px-1.5 items-center justify-center" aria-hidden>
            <Eraser className="size-3" />
          </span>
          <span className="inline-flex h-6 px-1.5 items-center justify-center" aria-hidden>
            <RotateCcw className="size-3" />
          </span>
          <span className="inline-flex h-6 px-1.5 items-center justify-center" aria-hidden>
            <X className="size-3.5" />
          </span>
        </div>
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
            backgroundColor: colors.background,
            color: colors.foreground,
            ...ligatureCss,
          } as React.CSSProperties
        }
      >
        {!isCmdShell ? (
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

      <SettingsPreviewHintChips hints={behaviorHints} className="border-border/50" />
    </div>
  )
}
