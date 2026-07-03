import type { LucideIcon } from 'lucide-react'
import { ClipboardCopy, MousePointer2, Play, Settings2, TerminalSquare, Timer, Type, Volume2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_TERMINAL_SHELL_PROFILE, TERMINAL_SHELL_PROFILE_LABEL_KEYS, type TerminalShellProfileId, type TerminalShellProfileInfo } from 'shared/terminal/shells'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion } from '@/components/ui/accordion'
import { TerminalSettingsAccordionSection } from '@/pages/main/TerminalSettingsAccordion'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import { playTerminalBell } from '@/lib/terminal/terminalBell'
import {
  resetTerminalPrefs,
  resolveTerminalFontFamily,
  resolveTerminalFontWeight,
  resolveTerminalLigaturePreviewFontFamily,
  TERMINAL_CWD_MODE_ORDER,
  TERMINAL_FAST_SCROLL_MODIFIER_ORDER,
  TERMINAL_FAST_SCROLL_SENSITIVITY_MAX,
  TERMINAL_FAST_SCROLL_SENSITIVITY_MIN,
  TERMINAL_FONT_FAMILY_LABEL_KEYS,
  TERMINAL_FONT_FAMILY_ORDER,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_WEIGHT_CSS,
  TERMINAL_FONT_WEIGHT_ORDER,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  TERMINAL_RIGHT_CLICK_BEHAVIOR_ORDER,
  TERMINAL_SCROLLBACK_MAX,
  TERMINAL_SCROLLBACK_MIN,
  TERMINAL_SHORTCUT_MODIFIER_ORDER,
  TERMINAL_TAB_TITLE_MODE_ORDER,
  type TerminalCwdMode,
  type TerminalFastScrollModifier,
  type TerminalFontFamilyId,
  type TerminalFontWeightId,
  type TerminalPrefs,
  type TerminalRightClickBehavior,
  type TerminalShortcutModifier,
  type TerminalTabTitleMode,
  terminalLigatureCss,
} from '@/lib/terminal/terminalPrefs'
import { getTerminalThemeColors } from '@/lib/terminal/xtermTheme'
import { cn } from '@/lib/utils'
import { CursorSettingsTab } from '@/pages/main/CursorSettingsTab'

type TerminalSettingsDialogProps = {
  prefs: TerminalPrefs
  availableShells: TerminalShellProfileInfo[]
  onPrefsChange: (prefs: TerminalPrefs) => void
}

type SettingsTabId = 'typography' | 'cursor' | 'shell' | 'session' | 'clipboard' | 'sound'

const SETTINGS_TABS: { id: SettingsTabId; icon: LucideIcon }[] = [
  { id: 'typography', icon: Type },
  { id: 'cursor', icon: MousePointer2 },
  { id: 'shell', icon: TerminalSquare },
  { id: 'session', icon: Timer },
  { id: 'clipboard', icon: ClipboardCopy },
  { id: 'sound', icon: Volume2 },
]

function FieldBlock({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
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

function FontWeightPicker({ value, fontFamilyId, onChange }: { value: TerminalFontWeightId; fontFamilyId: TerminalFontFamilyId; onChange: (value: TerminalFontWeightId) => void }) {
  const { t } = useTranslation()
  const fontFamily = resolveTerminalFontFamily(fontFamilyId)

  return (
    <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={t('terminal.settings.fontWeight')}>
      {TERMINAL_FONT_WEIGHT_ORDER.map(id => {
        const selected = value === id
        const optionLabel = t(`terminal.settings.fontWeightOptions.${id}`)
        return (
          <label
            key={id}
            title={optionLabel}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col items-center justify-center gap-px rounded-md border bg-background/80 px-0.5 py-1 transition-colors hover:bg-muted/40',
              selected ? 'border-primary ring-1 ring-primary/35' : 'border-border/60'
            )}
          >
            <input
              type="radio"
              name="terminal-settings-font-weight"
              value={id}
              checked={selected}
              onChange={() => onChange(id)}
              className="sr-only"
              aria-label={optionLabel}
            />
            <span className="text-base leading-none text-foreground" style={{ fontFamily, fontWeight: TERMINAL_FONT_WEIGHT_CSS[id] }} aria-hidden>
              A
            </span>
            <span className="w-full truncate text-center text-[9px] leading-none text-muted-foreground">{optionLabel}</span>
          </label>
        )
      })}
    </div>
  )
}

function ShortcutSelect({
  id,
  label,
  value,
  kind,
  onChange,
}: {
  id: string
  label: string
  value: TerminalShortcutModifier
  kind: 'copy' | 'paste'
  onChange: (value: TerminalShortcutModifier) => void
}) {
  const { t } = useTranslation()
  const labelKey = kind === 'copy' ? 'copyShortcutOptions' : 'pasteShortcutOptions'

  return (
    <FieldBlock label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v: TerminalShortcutModifier) => onChange(v)}>
        <SelectTrigger id={id} className="h-9 w-full font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TERMINAL_SHORTCUT_MODIFIER_ORDER.map(modifier => (
            <SelectItem key={modifier} value={modifier} className="font-mono text-xs">
              {t(`terminal.settings.${labelKey}.${modifier}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldBlock>
  )
}

function FontPreview({ prefs }: { prefs: TerminalPrefs }) {
  const { t } = useTranslation()
  const appAppearanceKey = useAppAppearanceThemeKey()
  const fontFamily = resolveTerminalFontFamily(prefs.fontFamilyId)
  const ligatureDemoFontFamily = resolveTerminalLigaturePreviewFontFamily(prefs.fontFamilyId)
  const fontWeight = resolveTerminalFontWeight(prefs.fontWeight)
  const ligatureCss = terminalLigatureCss(prefs.enableLigatures)
  const colors = useMemo(() => getTerminalThemeColors(), [appAppearanceKey])

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
          {prefs.fontSize}px · {t(TERMINAL_FONT_FAMILY_LABEL_KEYS[prefs.fontFamilyId])}
          {' · '}
          {prefs.enableLigatures ? t('terminal.settings.ligaturesOn') : t('terminal.settings.ligaturesOff')}
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
            ...ligatureCss,
          } as React.CSSProperties
        }
      >
        <span style={{ color: colors.cyan }}>PS</span> <span style={{ color: colors.yellow }}>E:\project</span>
        <span style={{ color: colors.brightBlack }}>{'>'} </span>
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
      </pre>
    </div>
  )
}

export function TerminalSettingsDialog({ prefs, availableShells, onPrefsChange }: TerminalSettingsDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const shellOptions = useMemo(
    () => (availableShells.length > 0 ? availableShells : [{ id: DEFAULT_TERMINAL_SHELL_PROFILE, label: DEFAULT_TERMINAL_SHELL_PROFILE }]),
    [availableShells]
  )

  const patch = (partial: Partial<TerminalPrefs>) => onPrefsChange({ ...prefs, ...partial })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" aria-label={t('terminal.settings.title')}>
          <Settings2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex h-[min(92vh,48rem)] w-[min(100%-2rem,52rem)] max-w-[52rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[52rem]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-0.5 border-b border-border/60 px-6 py-4 text-left">
          <DialogTitle className="text-base font-semibold leading-tight">{t('terminal.settings.title')}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{t('terminal.settings.description')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="typography" orientation="vertical" className="flex min-h-0 flex-1 gap-0">
          <div className="w-[11.5rem] shrink-0 border-r border-border/60 bg-muted/10">
            <ScrollArea className="h-full">
              <TabsList variant="line" className="h-auto w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-2">
                {SETTINGS_TABS.map(tab => {
                  const Icon = tab.icon
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="h-9 w-full justify-start gap-2 rounded-md border-l-[3px] border-l-transparent px-2.5 text-xs after:hidden data-[state=active]:border-l-primary data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{t(`terminal.settings.sections.${tab.id}`)}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </ScrollArea>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-6 py-5">
              <TabsContent value="typography" className="mt-0 outline-none">
                <div className="space-y-5">
                  <FontPreview prefs={prefs} />

                  <Accordion type="multiple" className="w-full rounded-lg border border-border/60 bg-card/40 px-3">
                    <TerminalSettingsAccordionSection value="font" title={t('terminal.settings.groups.font')} hint={t('terminal.settings.groups.fontHint')}>
                      <FieldBlock label={t('terminal.settings.fontSize')} htmlFor="terminal-font-size">
                        <div className="flex items-center gap-3">
                          <Slider
                            id="terminal-font-size"
                            className="flex-1"
                            min={TERMINAL_FONT_SIZE_MIN}
                            max={TERMINAL_FONT_SIZE_MAX}
                            step={1}
                            value={[prefs.fontSize]}
                            onValueChange={([value]) => {
                              if (typeof value !== 'number') return
                              patch({ fontSize: value })
                            }}
                          />
                          <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">{prefs.fontSize}</span>
                        </div>
                      </FieldBlock>

                      <FieldBlock label={t('terminal.settings.fontFamilyLabel')} htmlFor="terminal-font-family">
                        <Select value={prefs.fontFamilyId} onValueChange={(value: TerminalFontFamilyId) => patch({ fontFamilyId: value })}>
                          <SelectTrigger id="terminal-font-family" className="h-9 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TERMINAL_FONT_FAMILY_ORDER.map(id => (
                              <SelectItem key={id} value={id}>
                                {t(TERMINAL_FONT_FAMILY_LABEL_KEYS[id])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldBlock>

                      <FieldBlock label={t('terminal.settings.fontWeight')}>
                        <FontWeightPicker value={prefs.fontWeight} fontFamilyId={prefs.fontFamilyId} onChange={weight => patch({ fontWeight: weight })} />
                      </FieldBlock>

                      <FieldBlock label={t('terminal.settings.lineHeight')} htmlFor="terminal-line-height" hint={t('terminal.settings.lineHeightHint')}>
                        <div className="flex items-center gap-3">
                          <Slider
                            id="terminal-line-height"
                            className="flex-1"
                            min={TERMINAL_LINE_HEIGHT_MIN}
                            max={TERMINAL_LINE_HEIGHT_MAX}
                            step={0.1}
                            value={[prefs.lineHeight]}
                            onValueChange={([value]) => {
                              if (typeof value !== 'number') return
                              patch({ lineHeight: Math.round(value * 10) / 10 })
                            }}
                          />
                          <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">{prefs.lineHeight.toFixed(1)}</span>
                        </div>
                      </FieldBlock>

                      <ToggleRow
                        id="terminal-ligatures"
                        label={t('terminal.settings.ligatures')}
                        description={t('terminal.settings.ligaturesHint')}
                        checked={prefs.enableLigatures}
                        onCheckedChange={checked => patch({ enableLigatures: checked })}
                      />
                    </TerminalSettingsAccordionSection>

                    <TerminalSettingsAccordionSection value="scroll" title={t('terminal.settings.groups.scroll')} hint={t('terminal.settings.groups.scrollHint')}>
                      <FieldBlock label={t('terminal.settings.scrollback')} htmlFor="terminal-scrollback" hint={t('terminal.settings.scrollbackHint')}>
                        <div className="flex items-center gap-3">
                          <Slider
                            id="terminal-scrollback"
                            className="flex-1"
                            min={TERMINAL_SCROLLBACK_MIN}
                            max={TERMINAL_SCROLLBACK_MAX}
                            step={1000}
                            value={[prefs.scrollback]}
                            onValueChange={([value]) => {
                              if (typeof value !== 'number') return
                              patch({ scrollback: value })
                            }}
                          />
                          <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">{prefs.scrollback.toLocaleString()}</span>
                        </div>
                      </FieldBlock>

                      <ToggleRow
                        id="terminal-smooth-scrolling"
                        label={t('terminal.settings.smoothScrolling')}
                        description={t('terminal.settings.smoothScrollingHint')}
                        checked={prefs.smoothScrolling}
                        onCheckedChange={checked => patch({ smoothScrolling: checked })}
                      />

                      <ToggleRow
                        id="terminal-scroll-on-input"
                        label={t('terminal.settings.scrollOnUserInput')}
                        description={t('terminal.settings.scrollOnUserInputHint')}
                        checked={prefs.scrollOnUserInput}
                        onCheckedChange={checked => patch({ scrollOnUserInput: checked })}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FieldBlock label={t('terminal.settings.fastScrollModifier')} htmlFor="terminal-fast-scroll-modifier">
                          <Select value={prefs.fastScrollModifier} onValueChange={(value: TerminalFastScrollModifier) => patch({ fastScrollModifier: value })}>
                            <SelectTrigger id="terminal-fast-scroll-modifier" className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TERMINAL_FAST_SCROLL_MODIFIER_ORDER.map(id => (
                                <SelectItem key={id} value={id}>
                                  {t(`terminal.settings.fastScrollModifierOptions.${id}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldBlock>

                        <FieldBlock label={t('terminal.settings.fastScrollSensitivity')} htmlFor="terminal-fast-scroll-sensitivity">
                          <div className="flex items-center gap-3">
                            <Slider
                              id="terminal-fast-scroll-sensitivity"
                              className="flex-1"
                              min={TERMINAL_FAST_SCROLL_SENSITIVITY_MIN}
                              max={TERMINAL_FAST_SCROLL_SENSITIVITY_MAX}
                              step={1}
                              value={[prefs.fastScrollSensitivity]}
                              onValueChange={([value]) => {
                                if (typeof value === 'number') patch({ fastScrollSensitivity: value })
                              }}
                            />
                            <span className="w-8 text-right text-sm tabular-nums text-muted-foreground">{prefs.fastScrollSensitivity}</span>
                          </div>
                        </FieldBlock>
                      </div>
                    </TerminalSettingsAccordionSection>

                    <TerminalSettingsAccordionSection value="rendering" title={t('terminal.settings.groups.rendering')} hint={t('terminal.settings.groups.renderingHint')}>
                      <ToggleRow
                        id="terminal-webgl"
                        label={t('terminal.settings.enableWebGlRenderer')}
                        description={t('terminal.settings.enableWebGlRendererHint')}
                        checked={prefs.enableWebGlRenderer}
                        onCheckedChange={checked => patch({ enableWebGlRenderer: checked })}
                      />
                    </TerminalSettingsAccordionSection>
                  </Accordion>
                </div>
              </TabsContent>

              <TabsContent value="cursor" className="mt-0 outline-none">
                <CursorSettingsTab prefs={prefs} onPatch={patch} />
              </TabsContent>

              <TabsContent value="shell" className="mt-0 outline-none">
                <Accordion type="single" collapsible className="w-full rounded-lg border border-border/60 bg-card/40 px-3">
                  <TerminalSettingsAccordionSection value="shell" title={t('terminal.settings.sections.shell')} hint={t('terminal.settings.sections.shellHint')}>
                    <div className="grid w-full grid-cols-2 gap-4">
                      <FieldBlock label={t('terminal.settings.defaultShell')} htmlFor="terminal-default-shell" className="min-w-0">
                        <Select value={prefs.defaultShellProfileId} onValueChange={(value: TerminalShellProfileId) => patch({ defaultShellProfileId: value })}>
                          <SelectTrigger id="terminal-default-shell" className="h-9 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {shellOptions.map(shell => (
                              <SelectItem key={shell.id} value={shell.id}>
                                {t(TERMINAL_SHELL_PROFILE_LABEL_KEYS[shell.id])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldBlock>

                      <FieldBlock label={t('terminal.settings.workingDirectory')} htmlFor="terminal-cwd-mode" hint={t('terminal.settings.cwdModeHint')} className="min-w-0">
                        <Select value={prefs.cwdMode} onValueChange={(value: TerminalCwdMode) => patch({ cwdMode: value })}>
                          <SelectTrigger id="terminal-cwd-mode" className="h-9 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TERMINAL_CWD_MODE_ORDER.map(id => (
                              <SelectItem key={id} value={id}>
                                {t(`terminal.settings.cwdMode.${id}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldBlock>

                      {prefs.cwdMode === 'custom' ? (
                        <FieldBlock label={t('terminal.settings.cwdCustom')} htmlFor="terminal-cwd-custom" className="min-w-0 sm:col-span-2">
                          <Input
                            id="terminal-cwd-custom"
                            className="h-9 font-mono text-xs"
                            value={prefs.cwdCustom}
                            placeholder={t('terminal.settings.cwdCustomPlaceholder')}
                            onChange={event => patch({ cwdCustom: event.target.value })}
                            spellCheck={false}
                          />
                        </FieldBlock>
                      ) : null}
                    </div>
                  </TerminalSettingsAccordionSection>
                </Accordion>
              </TabsContent>

              <TabsContent value="session" className="mt-0 outline-none">
                <Accordion type="single" collapsible className="w-full rounded-lg border border-border/60 bg-card/40 px-3">
                  <TerminalSettingsAccordionSection value="session" title={t('terminal.settings.sections.session')} hint={t('terminal.settings.sections.sessionHint')}>
                    <ToggleRow
                      id="terminal-keep-sessions"
                      label={t('terminal.settings.keepSessions')}
                      description={t('terminal.settings.keepSessionsHint')}
                      checked={prefs.keepSessionsWhenPanelClosed}
                      onCheckedChange={checked => patch({ keepSessionsWhenPanelClosed: checked })}
                    />

                    <ToggleRow
                      id="terminal-confirm-on-kill"
                      label={t('terminal.settings.confirmOnKill')}
                      description={t('terminal.settings.confirmOnKillHint')}
                      checked={prefs.confirmOnKill}
                      onCheckedChange={checked => patch({ confirmOnKill: checked })}
                    />

                    <ToggleRow
                      id="terminal-shell-integration"
                      label={t('terminal.settings.enableShellIntegration')}
                      description={t('terminal.settings.enableShellIntegrationHint')}
                      checked={prefs.enableShellIntegration}
                      onCheckedChange={checked => patch({ enableShellIntegration: checked })}
                    />

                    <ToggleRow
                      id="terminal-revive-tabs"
                      label={t('terminal.settings.reviveTabsOnLaunch')}
                      description={t('terminal.settings.reviveTabsOnLaunchHint')}
                      checked={prefs.reviveTabsOnLaunch}
                      onCheckedChange={checked => patch({ reviveTabsOnLaunch: checked })}
                    />

                    <FieldBlock label={t('terminal.settings.tabTitle')} htmlFor="terminal-tab-title-mode">
                      <Select value={prefs.tabTitleMode} onValueChange={(value: TerminalTabTitleMode) => patch({ tabTitleMode: value })}>
                        <SelectTrigger id="terminal-tab-title-mode" className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TERMINAL_TAB_TITLE_MODE_ORDER.map(id => (
                            <SelectItem key={id} value={id}>
                              {t(`terminal.settings.tabTitleOptions.${id}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldBlock>

                    {prefs.tabTitleMode === 'custom' ? (
                      <FieldBlock label={t('terminal.settings.tabTitleCustom')} htmlFor="terminal-tab-title-custom">
                        <Input
                          id="terminal-tab-title-custom"
                          className="h-9"
                          value={prefs.tabTitleCustom}
                          placeholder={t('terminal.settings.tabTitleCustomPlaceholder')}
                          onChange={event => patch({ tabTitleCustom: event.target.value })}
                        />
                      </FieldBlock>
                    ) : null}
                  </TerminalSettingsAccordionSection>
                </Accordion>
              </TabsContent>

              <TabsContent value="clipboard" className="mt-0 outline-none">
                <Accordion type="single" collapsible className="w-full rounded-lg border border-border/60 bg-card/40 px-3">
                  <TerminalSettingsAccordionSection value="clipboard" title={t('terminal.settings.sections.clipboard')} hint={t('terminal.settings.sections.clipboardHint')}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ToggleRow
                        id="terminal-copy-on-select"
                        label={t('terminal.settings.copyOnSelect')}
                        description={t('terminal.settings.copyOnSelectHint')}
                        checked={prefs.copyOnSelect}
                        onCheckedChange={checked => patch({ copyOnSelect: checked })}
                      />
                      <ToggleRow
                        id="terminal-alt-click-cursor"
                        label={t('terminal.settings.altClickMovesCursor')}
                        description={t('terminal.settings.altClickMovesCursorHint')}
                        checked={prefs.altClickMovesCursor}
                        onCheckedChange={checked => patch({ altClickMovesCursor: checked })}
                      />
                    </div>

                    <FieldBlock label={t('terminal.settings.rightClickBehavior')} htmlFor="terminal-right-click-behavior">
                      <Select value={prefs.rightClickBehavior} onValueChange={(value: TerminalRightClickBehavior) => patch({ rightClickBehavior: value })}>
                        <SelectTrigger id="terminal-right-click-behavior" className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TERMINAL_RIGHT_CLICK_BEHAVIOR_ORDER.map(id => (
                            <SelectItem key={id} value={id}>
                              {t(`terminal.settings.rightClickBehaviorOptions.${id}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldBlock>

                    <ToggleRow
                      id="terminal-multiline-paste-warning"
                      label={t('terminal.settings.multiLinePasteWarning')}
                      description={t('terminal.settings.multiLinePasteWarningHint')}
                      checked={prefs.enableMultiLinePasteWarning}
                      onCheckedChange={checked => patch({ enableMultiLinePasteWarning: checked })}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <ShortcutSelect
                        id="terminal-copy-shortcut"
                        label={t('terminal.settings.copyShortcut')}
                        kind="copy"
                        value={prefs.copyShortcut}
                        onChange={copyShortcut => patch({ copyShortcut })}
                      />
                      <ShortcutSelect
                        id="terminal-paste-shortcut"
                        label={t('terminal.settings.pasteShortcut')}
                        kind="paste"
                        value={prefs.pasteShortcut}
                        onChange={pasteShortcut => patch({ pasteShortcut })}
                      />
                    </div>
                  </TerminalSettingsAccordionSection>
                </Accordion>
              </TabsContent>

              <TabsContent value="sound" className="mt-0 outline-none">
                <Accordion type="single" collapsible className="w-full rounded-lg border border-border/60 bg-card/40 px-3">
                  <TerminalSettingsAccordionSection value="sound" title={t('terminal.settings.sections.sound')} hint={t('terminal.settings.sections.soundHint')}>
                    <ToggleRow
                      id="terminal-bell"
                      label={t('terminal.settings.bell')}
                      description={t('terminal.settings.bellHint')}
                      checked={prefs.bellEnabled}
                      onCheckedChange={checked => patch({ bellEnabled: checked })}
                    />
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void playTerminalBell()}>
                      <Play className="size-3.5" aria-hidden />
                      {t('terminal.settings.playBellSound')}
                    </Button>
                  </TerminalSettingsAccordionSection>
                </Accordion>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/15 px-6 py-3">
          <Button type="button" variant="ghost" size="sm" className="mr-auto text-muted-foreground" onClick={() => onPrefsChange(resetTerminalPrefs())}>
            {t('terminal.settings.resetDefaults')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
