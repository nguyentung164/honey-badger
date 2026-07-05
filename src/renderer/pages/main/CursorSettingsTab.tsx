import { TextCursor } from 'lucide-react'
import type { RefObject } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsFieldBlock, SettingsToggleRow, SETTINGS_CONTROL_CLASS } from '@/components/settings/settingsDialogUi'
import { TerminalSettingsAccordionSection } from '@/pages/main/TerminalSettingsAccordion'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import {
  TERMINAL_CURSOR_STYLE_ORDER,
  type TerminalCursorColorMode,
  type TerminalCursorStyle,
  type TerminalPrefs,
} from '@/lib/terminal/terminalPrefs'
import { buildXtermThemeForPrefs, getTerminalThemeColors } from '@/lib/terminal/xtermTheme'
import { TerminalCursorColorPicker } from '@/pages/main/TerminalCursorColorPicker'
import { cn } from '@/lib/utils'

function resolvePreviewCursorColor(prefs: TerminalPrefs): string {
  const colors = getTerminalThemeColors()
  const theme = buildXtermThemeForPrefs(prefs.cursorColorMode, prefs.cursorColor, prefs.cursorStyle)
  return theme.cursor ?? colors.cursor
}

type CursorSettingsAccordionSectionProps = {
  prefs: TerminalPrefs
  onPatch: (partial: Partial<TerminalPrefs>) => void
  previewCursorRef: RefObject<HTMLSpanElement | null>
}

export function CursorSettingsAccordionSection({ prefs, onPatch, previewCursorRef }: CursorSettingsAccordionSectionProps) {
  const { t } = useTranslation()
  const appAppearanceKey = useAppAppearanceThemeKey()

  const resetPreviewCursorColor = useCallback(() => {
    const color = resolvePreviewCursorColor(prefs)
    previewCursorRef.current?.style.setProperty('--terminal-cursor-color', color)
  }, [prefs, appAppearanceKey, previewCursorRef])

  const handleLiveCursorColor = useCallback(
    (color: string) => {
      previewCursorRef.current?.style.setProperty('--terminal-cursor-color', color)
    },
    [previewCursorRef]
  )

  return (
    <TerminalSettingsAccordionSection value="cursor" icon={TextCursor} title={t('terminal.settings.sections.cursor')} hint={t('terminal.settings.sections.cursorHint')}>
      <SettingsToggleRow
        id="terminal-cursor-blink"
        label={t('terminal.settings.cursorBlink')}
        description={t('terminal.settings.cursorBlinkHint')}
        checked={prefs.cursorBlink}
        onCheckedChange={checked => onPatch({ cursorBlink: checked })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsFieldBlock label={t('terminal.settings.cursorStyle')} htmlFor="terminal-cursor-style" className="min-w-0">
          <Select value={prefs.cursorStyle} onValueChange={(value: TerminalCursorStyle) => onPatch({ cursorStyle: value })}>
            <SelectTrigger id="terminal-cursor-style" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_CURSOR_STYLE_ORDER.map(id => (
                <SelectItem key={id} value={id}>
                  {t(`terminal.settings.cursorStyleOptions.${id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFieldBlock>

        <SettingsFieldBlock label={t('terminal.settings.cursorColor')} htmlFor="terminal-cursor-color-mode" className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Select value={prefs.cursorColorMode} onValueChange={(value: TerminalCursorColorMode) => onPatch({ cursorColorMode: value })}>
                <SelectTrigger id="terminal-cursor-color-mode" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">{t('terminal.settings.cursorColorTheme')}</SelectItem>
                  <SelectItem value="custom">{t('terminal.settings.cursorColorCustom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TerminalCursorColorPicker
              value={prefs.cursorColor}
              disabled={prefs.cursorColorMode !== 'custom'}
              ariaLabel={t('terminal.settings.cursorColorPicker')}
              onLiveChange={handleLiveCursorColor}
              onOpenChange={open => {
                if (!open) resetPreviewCursorColor()
              }}
              onCommit={color => onPatch({ cursorColor: color })}
            />
          </div>
        </SettingsFieldBlock>
      </div>
    </TerminalSettingsAccordionSection>
  )
}
