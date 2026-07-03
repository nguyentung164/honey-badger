import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion } from '@/components/ui/accordion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TerminalSettingsAccordionSection } from '@/pages/main/TerminalSettingsAccordion'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import {
  resolveTerminalFontFamily,
  resolveTerminalFontWeight,
  TERMINAL_CURSOR_STYLE_ORDER,
  type TerminalCursorColorMode,
  type TerminalCursorStyle,
  type TerminalPrefs,
} from '@/lib/terminal/terminalPrefs'
import { buildXtermThemeForPrefs, getTerminalThemeColors } from '@/lib/terminal/xtermTheme'
import { cn } from '@/lib/utils'
import { TerminalCursorColorPicker } from '@/pages/main/TerminalCursorColorPicker'

function FieldBlock({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  id,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/60 px-3.5 py-3 transition-colors hover:bg-muted/35">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  )
}

function resolvePreviewCursorColor(prefs: TerminalPrefs): string {
  const colors = getTerminalThemeColors()
  const theme = buildXtermThemeForPrefs(prefs.cursorColorMode, prefs.cursorColor, prefs.cursorStyle)
  return theme.cursor ?? colors.cursor
}

function CursorPreview({ prefs, cursorRef }: { prefs: TerminalPrefs; cursorRef: React.RefObject<HTMLSpanElement | null> }) {
  const { t } = useTranslation()
  const appAppearanceKey = useAppAppearanceThemeKey()
  const fontFamily = resolveTerminalFontFamily(prefs.fontFamilyId)
  const fontWeight = resolveTerminalFontWeight(prefs.fontWeight)
  const colors = useMemo(() => getTerminalThemeColors(), [appAppearanceKey])
  const cursorColor = useMemo(() => resolvePreviewCursorColor(prefs), [prefs, appAppearanceKey])

  useEffect(() => {
    cursorRef.current?.style.setProperty('--terminal-cursor-color', cursorColor)
  }, [cursorColor, cursorRef])

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 shadow-inner" style={{ backgroundColor: colors.background }}>
      <div
        className="flex items-center justify-between border-b px-3 py-1.5"
        style={{
          borderColor: `${colors.foreground}18`,
          backgroundColor: `${colors.foreground}08`,
        }}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: `${colors.foreground}70` }}>
          {t('terminal.settings.preview')}
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: `${colors.foreground}55` }}>
          {t(`terminal.settings.cursorStyleOptions.${prefs.cursorStyle}`)}
          {' · '}
          {prefs.cursorBlink ? t('terminal.settings.cursorBlinkOn') : t('terminal.settings.cursorBlinkOff')}
        </span>
      </div>
      <pre
        className="overflow-x-auto px-3 py-3 text-[length:var(--terminal-preview-size)] leading-relaxed"
        style={
          {
            '--terminal-preview-size': `${prefs.fontSize}px`,
            fontFamily,
            fontWeight,
            color: colors.foreground,
          } as React.CSSProperties
        }
      >
        <span style={{ color: colors.green }}>$</span>
        {' echo '}
        <span style={{ color: colors.cyan }}>"hello"</span>
        <span
          ref={cursorRef}
          className={cn('terminal-settings-cursor', `terminal-settings-cursor--${prefs.cursorStyle}`, prefs.cursorBlink && 'terminal-settings-cursor--blink')}
          style={{ '--terminal-cursor-color': cursorColor } as React.CSSProperties}
          aria-hidden
        />
      </pre>
    </div>
  )
}

type CursorSettingsTabProps = {
  prefs: TerminalPrefs
  onPatch: (partial: Partial<TerminalPrefs>) => void
}

export function CursorSettingsTab({ prefs, onPatch }: CursorSettingsTabProps) {
  const { t } = useTranslation()
  const appAppearanceKey = useAppAppearanceThemeKey()
  const previewCursorRef = useRef<HTMLSpanElement>(null)

  const resetPreviewCursorColor = useCallback(() => {
    const color = resolvePreviewCursorColor(prefs)
    previewCursorRef.current?.style.setProperty('--terminal-cursor-color', color)
  }, [prefs, appAppearanceKey])

  const handleLiveCursorColor = useCallback((color: string) => {
    previewCursorRef.current?.style.setProperty('--terminal-cursor-color', color)
  }, [])

  return (
    <div className="space-y-4">
      <CursorPreview prefs={prefs} cursorRef={previewCursorRef} />

      <Accordion type="single" collapsible className="w-full rounded-lg border border-border/60 bg-card/40 px-3">
        <TerminalSettingsAccordionSection value="cursor" title={t('terminal.settings.sections.cursor')} hint={t('terminal.settings.sections.cursorHint')}>
          <ToggleRow
            id="terminal-cursor-blink"
            label={t('terminal.settings.cursorBlink')}
            description={t('terminal.settings.cursorBlinkHint')}
            checked={prefs.cursorBlink}
            onCheckedChange={checked => onPatch({ cursorBlink: checked })}
          />

          <FieldBlock label={t('terminal.settings.cursorStyle')} htmlFor="terminal-cursor-style">
            <Select value={prefs.cursorStyle} onValueChange={(value: TerminalCursorStyle) => onPatch({ cursorStyle: value })}>
              <SelectTrigger id="terminal-cursor-style" className="h-9 w-full">
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
          </FieldBlock>

          <FieldBlock label={t('terminal.settings.cursorColor')} htmlFor="terminal-cursor-color-mode">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select value={prefs.cursorColorMode} onValueChange={(value: TerminalCursorColorMode) => onPatch({ cursorColorMode: value })}>
                  <SelectTrigger id="terminal-cursor-color-mode" className="h-9 w-full">
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
          </FieldBlock>
        </TerminalSettingsAccordionSection>
      </Accordion>
    </div>
  )
}
