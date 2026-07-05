import { Clipboard, Clock, Palette, Play, ScrollText, Settings2, Terminal, Type, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_TERMINAL_SHELL_PROFILE, TERMINAL_SHELL_PROFILE_LABEL_KEYS, type TerminalShellProfileId, type TerminalShellProfileInfo } from 'shared/terminal/shells'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  SettingsAccordion,
  SettingsDialogFrame,
  SettingsDialogSplitLayout,
  SettingsFieldBlock,
  SettingsSearchProvider,
  SettingsTabPanel,
  SettingsToggleRow,
  SettingsValueBadge,
  SETTINGS_CONTROL_CLASS,
  SETTINGS_FONT_CONTROL,
  SETTINGS_FONT_MICRO,
} from '@/components/settings/settingsDialogUi'
import { TerminalSettingsAccordionSection } from '@/pages/main/TerminalSettingsAccordion'
import { TerminalSettingsPreview } from '@/pages/main/TerminalSettingsPreview'
import { playTerminalBell } from '@/lib/terminal/terminalBell'
import {
  resetTerminalPrefs,
  resolveFontWeightPreviewStyle,
  TERMINAL_CWD_MODE_ORDER,
  TERMINAL_FAST_SCROLL_MODIFIER_ORDER,
  TERMINAL_FAST_SCROLL_SENSITIVITY_MAX,
  TERMINAL_FAST_SCROLL_SENSITIVITY_MIN,
  TERMINAL_FONT_FAMILY_LABEL_KEYS,
  TERMINAL_FONT_FAMILY_ORDER,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
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
} from '@/lib/terminal/terminalPrefs'
import { cn } from '@/lib/utils'
import { CursorSettingsAccordionSection } from '@/pages/main/CursorSettingsTab'

type TerminalSettingsDialogProps = {
  prefs: TerminalPrefs
  availableShells: TerminalShellProfileInfo[]
  onPrefsChange: (prefs: TerminalPrefs) => void
}

function FontWeightPicker({ value, fontFamilyId, onChange }: { value: TerminalFontWeightId; fontFamilyId: TerminalFontFamilyId; onChange: (value: TerminalFontWeightId) => void }) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={t('terminal.settings.fontWeight')}>
      {TERMINAL_FONT_WEIGHT_ORDER.map(id => {
        const selected = value === id
        const weightStyle = resolveFontWeightPreviewStyle(fontFamilyId, id)
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
            <span className="text-base leading-none text-foreground" style={weightStyle} aria-hidden>
              A
            </span>
            <span className={cn('w-full truncate text-center leading-none text-muted-foreground', SETTINGS_FONT_MICRO)}>{optionLabel}</span>
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
    <SettingsFieldBlock label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v: TerminalShortcutModifier) => onChange(v)}>
        <SelectTrigger id={id} className={cn(SETTINGS_CONTROL_CLASS, 'font-mono')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TERMINAL_SHORTCUT_MODIFIER_ORDER.map(modifier => (
            <SelectItem key={modifier} value={modifier} className={cn('font-mono', SETTINGS_FONT_CONTROL)}>
              {t(`terminal.settings.${labelKey}.${modifier}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsFieldBlock>
  )
}

export function TerminalSettingsDialog({ prefs, availableShells, onPrefsChange }: TerminalSettingsDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const previewCursorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) setSearchQuery('')
  }, [open])

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
      <SettingsDialogFrame
        title={t('terminal.settings.title')}
        description={t('terminal.settings.description')}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder={t('settingsDialog.searchPlaceholder')}
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => onPrefsChange(resetTerminalPrefs())}>
              {t('terminal.settings.resetDefaults')}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        <SettingsSearchProvider query={searchQuery}>
        <SettingsDialogSplitLayout
          previewPanelId="terminal-settings-preview"
          contentPanelId="terminal-settings-content"
          preview={<TerminalSettingsPreview prefs={prefs} scope="all" cursorRef={previewCursorRef} className="h-full" />}
        >
          <SettingsTabPanel>
            <SettingsAccordion>
                    <TerminalSettingsAccordionSection value="font" icon={Type} title={t('terminal.settings.groups.font')} hint={t('terminal.settings.groups.fontHint')}>
                      <SettingsFieldBlock label={t('terminal.settings.fontSize')} htmlFor="terminal-font-size">
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
                          <SettingsValueBadge>{prefs.fontSize}</SettingsValueBadge>
                        </div>
                      </SettingsFieldBlock>

                      <SettingsFieldBlock label={t('terminal.settings.fontFamilyLabel')} htmlFor="terminal-font-family">
                        <Select value={prefs.fontFamilyId} onValueChange={(value: TerminalFontFamilyId) => patch({ fontFamilyId: value })}>
                          <SelectTrigger id="terminal-font-family" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
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
                      </SettingsFieldBlock>

                      <SettingsFieldBlock label={t('terminal.settings.fontWeight')}>
                        <FontWeightPicker value={prefs.fontWeight} fontFamilyId={prefs.fontFamilyId} onChange={weight => patch({ fontWeight: weight })} />
                      </SettingsFieldBlock>

                      <SettingsFieldBlock label={t('terminal.settings.lineHeight')} htmlFor="terminal-line-height" hint={t('terminal.settings.lineHeightHint')}>
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
                          <SettingsValueBadge>{prefs.lineHeight.toFixed(1)}</SettingsValueBadge>
                        </div>
                      </SettingsFieldBlock>

                      <SettingsToggleRow
                        id="terminal-ligatures"
                        label={t('terminal.settings.ligatures')}
                        description={t('terminal.settings.ligaturesHint')}
                        checked={prefs.enableLigatures}
                        onCheckedChange={checked => patch({ enableLigatures: checked })}
                      />
                    </TerminalSettingsAccordionSection>

                    <TerminalSettingsAccordionSection value="scroll" icon={ScrollText} title={t('terminal.settings.groups.scroll')} hint={t('terminal.settings.groups.scrollHint')}>
                      <SettingsFieldBlock label={t('terminal.settings.scrollback')} htmlFor="terminal-scrollback" hint={t('terminal.settings.scrollbackHint')}>
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
                          <SettingsValueBadge>{prefs.scrollback.toLocaleString()}</SettingsValueBadge>
                        </div>
                      </SettingsFieldBlock>

                      <SettingsToggleRow
                        id="terminal-smooth-scrolling"
                        label={t('terminal.settings.smoothScrolling')}
                        description={t('terminal.settings.smoothScrollingHint')}
                        checked={prefs.smoothScrolling}
                        onCheckedChange={checked => patch({ smoothScrolling: checked })}
                      />

                      <SettingsToggleRow
                        id="terminal-scroll-on-input"
                        label={t('terminal.settings.scrollOnUserInput')}
                        description={t('terminal.settings.scrollOnUserInputHint')}
                        checked={prefs.scrollOnUserInput}
                        onCheckedChange={checked => patch({ scrollOnUserInput: checked })}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <SettingsFieldBlock label={t('terminal.settings.fastScrollModifier')} htmlFor="terminal-fast-scroll-modifier">
                          <Select value={prefs.fastScrollModifier} onValueChange={(value: TerminalFastScrollModifier) => patch({ fastScrollModifier: value })}>
                            <SelectTrigger id="terminal-fast-scroll-modifier" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
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
                        </SettingsFieldBlock>

                        <SettingsFieldBlock label={t('terminal.settings.fastScrollSensitivity')} htmlFor="terminal-fast-scroll-sensitivity">
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
                            <SettingsValueBadge>{prefs.fastScrollSensitivity}</SettingsValueBadge>
                          </div>
                        </SettingsFieldBlock>
                      </div>
                    </TerminalSettingsAccordionSection>

                    <TerminalSettingsAccordionSection value="rendering" icon={Palette} title={t('terminal.settings.groups.rendering')} hint={t('terminal.settings.groups.renderingHint')}>
                      <SettingsToggleRow
                        id="terminal-webgl"
                        label={t('terminal.settings.enableWebGlRenderer')}
                        description={t('terminal.settings.enableWebGlRendererHint')}
                        checked={prefs.enableWebGlRenderer}
                        onCheckedChange={checked => patch({ enableWebGlRenderer: checked })}
                      />
                    </TerminalSettingsAccordionSection>

                    <CursorSettingsAccordionSection prefs={prefs} onPatch={patch} previewCursorRef={previewCursorRef} />

                  <TerminalSettingsAccordionSection value="shell" icon={Terminal} title={t('terminal.settings.sections.shell')} hint={t('terminal.settings.sections.shellHint')}>
                    <div className="grid w-full grid-cols-2 gap-4">
                      <SettingsFieldBlock label={t('terminal.settings.defaultShell')} htmlFor="terminal-default-shell" className="min-w-0">
                        <Select value={prefs.defaultShellProfileId} onValueChange={(value: TerminalShellProfileId) => patch({ defaultShellProfileId: value })}>
                          <SelectTrigger id="terminal-default-shell" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
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
                      </SettingsFieldBlock>

                      <SettingsFieldBlock label={t('terminal.settings.workingDirectory')} htmlFor="terminal-cwd-mode" hint={t('terminal.settings.cwdModeHint')} className="min-w-0">
                        <Select value={prefs.cwdMode} onValueChange={(value: TerminalCwdMode) => patch({ cwdMode: value })}>
                          <SelectTrigger id="terminal-cwd-mode" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
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
                      </SettingsFieldBlock>

                      {prefs.cwdMode === 'custom' ? (
                        <SettingsFieldBlock label={t('terminal.settings.cwdCustom')} htmlFor="terminal-cwd-custom" className="min-w-0 sm:col-span-2">
                          <Input
                            id="terminal-cwd-custom"
                            className={cn(SETTINGS_CONTROL_CLASS, 'font-mono')}
                            value={prefs.cwdCustom}
                            placeholder={t('terminal.settings.cwdCustomPlaceholder')}
                            onChange={event => patch({ cwdCustom: event.target.value })}
                            spellCheck={false}
                          />
                        </SettingsFieldBlock>
                      ) : null}
                    </div>
                  </TerminalSettingsAccordionSection>

                  <TerminalSettingsAccordionSection value="session" icon={Clock} title={t('terminal.settings.sections.session')} hint={t('terminal.settings.sections.sessionHint')}>
                    <SettingsToggleRow
                      id="terminal-keep-sessions"
                      label={t('terminal.settings.keepSessions')}
                      description={t('terminal.settings.keepSessionsHint')}
                      checked={prefs.keepSessionsWhenPanelClosed}
                      onCheckedChange={checked => patch({ keepSessionsWhenPanelClosed: checked })}
                    />

                    <SettingsToggleRow
                      id="terminal-confirm-on-kill"
                      label={t('terminal.settings.confirmOnKill')}
                      description={t('terminal.settings.confirmOnKillHint')}
                      checked={prefs.confirmOnKill}
                      onCheckedChange={checked => patch({ confirmOnKill: checked })}
                    />

                    <SettingsToggleRow
                      id="terminal-shell-integration"
                      label={t('terminal.settings.enableShellIntegration')}
                      description={t('terminal.settings.enableShellIntegrationHint')}
                      checked={prefs.enableShellIntegration}
                      onCheckedChange={checked => patch({ enableShellIntegration: checked })}
                    />

                    <SettingsToggleRow
                      id="terminal-revive-tabs"
                      label={t('terminal.settings.reviveTabsOnLaunch')}
                      description={t('terminal.settings.reviveTabsOnLaunchHint')}
                      checked={prefs.reviveTabsOnLaunch}
                      onCheckedChange={checked => patch({ reviveTabsOnLaunch: checked })}
                    />

                    <SettingsFieldBlock label={t('terminal.settings.tabTitle')} htmlFor="terminal-tab-title-mode">
                      <Select value={prefs.tabTitleMode} onValueChange={(value: TerminalTabTitleMode) => patch({ tabTitleMode: value })}>
                        <SelectTrigger id="terminal-tab-title-mode" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
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
                    </SettingsFieldBlock>

                    {prefs.tabTitleMode === 'custom' ? (
                      <SettingsFieldBlock label={t('terminal.settings.tabTitleCustom')} htmlFor="terminal-tab-title-custom">
                        <Input
                          id="terminal-tab-title-custom"
                          className={SETTINGS_CONTROL_CLASS}
                          value={prefs.tabTitleCustom}
                          placeholder={t('terminal.settings.tabTitleCustomPlaceholder')}
                          onChange={event => patch({ tabTitleCustom: event.target.value })}
                        />
                      </SettingsFieldBlock>
                    ) : null}
                  </TerminalSettingsAccordionSection>

                  <TerminalSettingsAccordionSection value="clipboard" icon={Clipboard} title={t('terminal.settings.sections.clipboard')} hint={t('terminal.settings.sections.clipboardHint')}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SettingsToggleRow
                        id="terminal-copy-on-select"
                        label={t('terminal.settings.copyOnSelect')}
                        description={t('terminal.settings.copyOnSelectHint')}
                        checked={prefs.copyOnSelect}
                        onCheckedChange={checked => patch({ copyOnSelect: checked })}
                      />
                      <SettingsToggleRow
                        id="terminal-alt-click-cursor"
                        label={t('terminal.settings.altClickMovesCursor')}
                        description={t('terminal.settings.altClickMovesCursorHint')}
                        checked={prefs.altClickMovesCursor}
                        onCheckedChange={checked => patch({ altClickMovesCursor: checked })}
                      />
                    </div>

                    <SettingsFieldBlock label={t('terminal.settings.rightClickBehavior')} htmlFor="terminal-right-click-behavior">
                      <Select value={prefs.rightClickBehavior} onValueChange={(value: TerminalRightClickBehavior) => patch({ rightClickBehavior: value })}>
                        <SelectTrigger id="terminal-right-click-behavior" className={cn(SETTINGS_CONTROL_CLASS, 'w-full')}>
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
                    </SettingsFieldBlock>

                    <SettingsToggleRow
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

                  <TerminalSettingsAccordionSection value="sound" icon={Volume2} title={t('terminal.settings.sections.sound')} hint={t('terminal.settings.sections.soundHint')}>
                    <SettingsToggleRow
                      id="terminal-bell"
                      label={t('terminal.settings.bell')}
                      description={t('terminal.settings.bellHint')}
                      checked={prefs.bellEnabled}
                      onCheckedChange={checked => patch({ bellEnabled: checked })}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void playTerminalBell()}>
                      <Play className="size-3.5" aria-hidden />
                      {t('terminal.settings.playBellSound')}
                    </Button>
                  </TerminalSettingsAccordionSection>
            </SettingsAccordion>
          </SettingsTabPanel>
        </SettingsDialogSplitLayout>
        </SettingsSearchProvider>
      </SettingsDialogFrame>
    </Dialog>
  )
}
