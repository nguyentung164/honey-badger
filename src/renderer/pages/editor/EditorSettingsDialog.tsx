'use client'

import { Brain, FileText, IndentIncrease, LayoutDashboard, ListTree, MousePointerClick, RotateCcw, Ruler, ScrollText, Sparkles, TextCursor, Type, WrapText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SETTINGS_CONTROL_CLASS,
  SETTINGS_FONT_MICRO,
  SETTINGS_PREVIEW_MIN_HEIGHT,
  SettingsAccordion,
  SettingsAccordionSection,
  SettingsDialogFrame,
  SettingsDialogSplitLayout,
  SettingsFieldBlock,
  SettingsSearchProvider,
  SettingsTabPanel,
  SettingsToggleRow,
  SettingsValueBadge,
} from '@/components/settings/settingsDialogUi'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  resolveFontWeightPreviewStyle,
  resolveTerminalFontFamily,
  TERMINAL_FONT_FAMILY_LABEL_KEYS,
  TERMINAL_FONT_FAMILY_ORDER,
  TERMINAL_FONT_WEIGHT_ORDER,
  type TerminalFontFamilyId,
  type TerminalFontWeightId,
} from '@/lib/terminal/terminalPrefs'
import { cn } from '@/lib/utils'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { EditorSettingsPreview } from '@/pages/editor/EditorSettingsPreview'
import {
  EDITOR_TAB_SIZE_OPTIONS,
  type EditorAutoSave,
  type EditorCursorStyle,
  type EditorLineNumbers,
  type EditorPreviewSampleLanguage,
  type EditorRenderWhitespace,
  type EditorSettings,
  type EditorWordWrap,
  formatRulersInput,
  parseRulersInput,
  useEditorMonacoSettings,
  useEditorSettings,
} from '@/pages/editor/hooks/useEditorSettings'
import { EDITOR_AUTO_SAVE_DELAY_MAX, EDITOR_AUTO_SAVE_DELAY_MIN, EDITOR_FONT_SIZE_MAX, EDITOR_FONT_SIZE_MIN } from '@/pages/editor/lib/editorMonacoTheme'

type EditorSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EDITOR_CURSOR_STYLE_ORDER: EditorCursorStyle[] = ['line', 'block', 'underline']

function RulersInputField({ rulers, onChange }: { rulers: number[]; onChange: (rulers: number[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => formatRulersInput(rulers))

  useEffect(() => {
    setDraft(formatRulersInput(rulers))
  }, [rulers])

  const commit = () => {
    const parsed = parseRulersInput(draft)
    const formatted = formatRulersInput(parsed)
    setDraft(formatted)
    if (formatted !== formatRulersInput(rulers)) {
      onChange(parsed)
    }
  }

  return (
    <Input
      id="editor-rulers"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      className={cn(SETTINGS_CONTROL_CLASS, 'font-mono tabular-nums')}
      placeholder={t('editor.settings.rulersPlaceholder')}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.currentTarget.blur()
      }}
    />
  )
}

function FontWeightPicker({ value, fontFamilyId, onChange }: { value: TerminalFontWeightId; fontFamilyId: TerminalFontFamilyId; onChange: (value: TerminalFontWeightId) => void }) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-6" role="radiogroup" aria-label={t('editor.settings.fontWeight')}>
      {TERMINAL_FONT_WEIGHT_ORDER.map(id => {
        const selected = value === id
        const weightStyle = resolveFontWeightPreviewStyle(fontFamilyId, id)
        const optionLabel = t(`terminal.settings.fontWeightOptions.${id}`)
        return (
          <label
            key={id}
            title={optionLabel}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border bg-background/80 px-0.5 py-1.5 transition-colors hover:bg-muted/40',
              selected ? 'border-primary ring-1 ring-primary/35' : 'border-border/60'
            )}
          >
            <input type="radio" name="editor-settings-font-weight" value={id} checked={selected} onChange={() => onChange(id)} className="sr-only" aria-label={optionLabel} />
            <span className="text-lg leading-none text-foreground" style={weightStyle} aria-hidden>
              Ag
            </span>
            <span className={cn('w-full truncate text-center leading-tight text-muted-foreground', SETTINGS_FONT_MICRO)}>{optionLabel}</span>
          </label>
        )
      })}
    </div>
  )
}

export function EditorSettingsDialog({ open, onOpenChange }: EditorSettingsDialogProps) {
  const { t } = useTranslation()
  const settings = useEditorMonacoSettings()
  const patchSettings = useEditorSettings(s => s.patchSettings)
  const resetSettings = useEditorSettings(s => s.resetSettings)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewMountReady, setPreviewMountReady] = useState(false)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setPreviewMountReady(false)
      return
    }
    // Wait for dialog layout/animation so Monaco automaticLayout does not spin on zero-size panels.
    let cancelled = false
    let outerFrame = 0
    const innerFrame = requestAnimationFrame(() => {
      outerFrame = requestAnimationFrame(() => {
        if (!cancelled) setPreviewMountReady(true)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(innerFrame)
      if (outerFrame) cancelAnimationFrame(outerFrame)
    }
  }, [open])

  const patch = (partial: Partial<EditorSettings>) => patchSettings(partial)

  const autoSaveDelayLabel = `${(settings.autoSaveDelayMs / 1000).toFixed(1)}s`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SettingsDialogFrame
        title={t('editor.settings.title')}
        description={t('editor.settings.description')}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder={t('settingsDialog.searchPlaceholder')}
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => resetSettings()}>
              <RotateCcw className="size-3.5" aria-hidden />
              {t('editor.settings.reset')}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        <SettingsSearchProvider query={searchQuery}>
          <SettingsDialogSplitLayout
            previewPanelId="editor-settings-preview"
            contentPanelId="editor-settings-content"
            preview={
              open && !previewMountReady ? (
                <div className={cn('flex h-full min-h-[18rem] items-center justify-center rounded-md border border-border/60 bg-muted/10', SETTINGS_PREVIEW_MIN_HEIGHT)}>
                  <GlowLoader className="h-8 w-8" />
                </div>
              ) : (
                <EditorSettingsPreview variant="monaco" dialogOpen={open && previewMountReady} className="h-full" />
              )
            }
          >
            <SettingsTabPanel>
              <SettingsAccordion>
                <SettingsAccordionSection value="typography-font" icon={Type} title={t('editor.settings.groups.font')} description={t('editor.settings.groups.fontHint')}>
                  <SettingsFieldBlock label={t('editor.settings.fontSize')} htmlFor="editor-font-size">
                    <div className="flex items-center gap-3">
                      <Slider
                        id="editor-font-size"
                        className="flex-1"
                        min={EDITOR_FONT_SIZE_MIN}
                        max={EDITOR_FONT_SIZE_MAX}
                        step={1}
                        value={[settings.fontSize]}
                        onValueChange={([value]) => {
                          if (typeof value !== 'number') return
                          patch({ fontSize: value })
                        }}
                      />
                      <SettingsValueBadge>{settings.fontSize}</SettingsValueBadge>
                    </div>
                  </SettingsFieldBlock>

                  <SettingsFieldBlock label={t('editor.settings.fontFamilyLabel')} htmlFor="editor-font-family">
                    <Select value={settings.fontFamilyId} onValueChange={(value: TerminalFontFamilyId) => patch({ fontFamilyId: value })}>
                      <SelectTrigger id="editor-font-family" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TERMINAL_FONT_FAMILY_ORDER.map(id => (
                          <SelectItem key={id} value={id}>
                            <span style={{ fontFamily: resolveTerminalFontFamily(id) }}>{t(TERMINAL_FONT_FAMILY_LABEL_KEYS[id])}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>

                  <SettingsFieldBlock label={t('editor.settings.fontWeight')}>
                    <FontWeightPicker value={settings.fontWeight} fontFamilyId={settings.fontFamilyId} onChange={fontWeight => patch({ fontWeight })} />
                  </SettingsFieldBlock>

                  <SettingsToggleRow
                    id="editor-ligatures"
                    label={t('editor.settings.ligatures')}
                    description={t('editor.settings.ligaturesHint')}
                    checked={settings.enableLigatures}
                    onCheckedChange={checked => patch({ enableLigatures: checked })}
                  />

                  <SettingsFieldBlock label={t('editor.settings.previewSampleLanguage')} htmlFor="editor-preview-language">
                    <Select value={settings.previewSampleLanguage} onValueChange={(value: EditorPreviewSampleLanguage) => patch({ previewSampleLanguage: value })}>
                      <SelectTrigger id="editor-preview-language" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="typescript">{t('editor.settings.previewSampleLanguageTypescript')}</SelectItem>
                        <SelectItem value="markdown">{t('editor.settings.previewSampleLanguageMarkdown')}</SelectItem>
                        <SelectItem value="html">{t('editor.settings.previewSampleLanguageHtml')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>
                </SettingsAccordionSection>

                <SettingsAccordionSection value="appearance-gutter" icon={ListTree} title={t('editor.settings.groups.gutter')} description={t('editor.settings.groups.gutterHint')}>
                  <SettingsFieldBlock label={t('editor.settings.lineNumbers')} htmlFor="editor-line-numbers">
                    <Select value={settings.lineNumbers} onValueChange={(value: EditorLineNumbers) => patch({ lineNumbers: value })}>
                      <SelectTrigger id="editor-line-numbers" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on">{t('editor.settings.lineNumbersOn')}</SelectItem>
                        <SelectItem value="off">{t('editor.settings.lineNumbersOff')}</SelectItem>
                        <SelectItem value="relative">{t('editor.settings.lineNumbersRelative')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>

                  <SettingsToggleRow id="editor-minimap" label={t('editor.settings.minimap')} checked={settings.minimap} onCheckedChange={checked => patch({ minimap: checked })} />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="appearance-guides" icon={Ruler} title={t('editor.settings.groups.guides')} description={t('editor.settings.groups.guidesHint')}>
                  <SettingsToggleRow
                    id="editor-bracket-colorization"
                    label={t('editor.settings.bracketPairColorization')}
                    checked={settings.bracketPairColorization}
                    onCheckedChange={checked => patch({ bracketPairColorization: checked })}
                  />

                  <SettingsFieldBlock label={t('editor.settings.renderWhitespace')} htmlFor="editor-render-whitespace">
                    <Select value={settings.renderWhitespace} onValueChange={(value: EditorRenderWhitespace) => patch({ renderWhitespace: value })}>
                      <SelectTrigger id="editor-render-whitespace" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('editor.settings.renderWhitespaceNone')}</SelectItem>
                        <SelectItem value="selection">{t('editor.settings.renderWhitespaceSelection')}</SelectItem>
                        <SelectItem value="all">{t('editor.settings.renderWhitespaceAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>

                  <SettingsToggleRow
                    id="editor-render-control-characters"
                    label={t('editor.settings.renderControlCharacters')}
                    description={t('editor.settings.renderControlCharactersHint')}
                    checked={settings.renderControlCharacters}
                    onCheckedChange={checked => patch({ renderControlCharacters: checked })}
                  />

                  <SettingsFieldBlock label={t('editor.settings.rulers')} hint={t('editor.settings.rulersHint')} htmlFor="editor-rulers">
                    <RulersInputField rulers={settings.rulers} onChange={next => patch({ rulers: next })} />
                  </SettingsFieldBlock>
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="appearance-cursor"
                  icon={TextCursor}
                  title={t('editor.settings.groups.cursor')}
                  description={t('editor.settings.groups.cursorHint')}
                >
                  <SettingsFieldBlock label={t('editor.settings.cursorStyle')} htmlFor="editor-cursor-style">
                    <Select value={settings.cursorStyle} onValueChange={(value: EditorCursorStyle) => patch({ cursorStyle: value })}>
                      <SelectTrigger id="editor-cursor-style" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITOR_CURSOR_STYLE_ORDER.map(id => (
                          <SelectItem key={id} value={id}>
                            {t(`editor.settings.cursorStyleOptions.${id}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>

                  <SettingsToggleRow
                    id="editor-cursor-blink"
                    label={t('editor.settings.cursorBlink')}
                    checked={settings.cursorBlink}
                    onCheckedChange={checked => patch({ cursorBlink: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="appearance-scrolling"
                  icon={ScrollText}
                  title={t('editor.settings.groups.scrolling')}
                  description={t('editor.settings.groups.scrollingHint')}
                >
                  <SettingsToggleRow
                    id="editor-smooth-scrolling"
                    label={t('editor.settings.smoothScrolling')}
                    checked={settings.smoothScrolling}
                    onCheckedChange={checked => patch({ smoothScrolling: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-scroll-beyond"
                    label={t('editor.settings.scrollBeyondLastLine')}
                    checked={settings.scrollBeyondLastLine}
                    onCheckedChange={checked => patch({ scrollBeyondLastLine: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="editing-indentation"
                  icon={IndentIncrease}
                  title={t('editor.settings.groups.indentation')}
                  description={t('editor.settings.groups.indentationHint')}
                >
                  <SettingsFieldBlock label={t('editor.settings.tabSize')} htmlFor="editor-tab-size">
                    <Select value={String(settings.tabSize)} onValueChange={value => patch({ tabSize: Number(value) })}>
                      <SelectTrigger id="editor-tab-size" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITOR_TAB_SIZE_OPTIONS.map(size => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>

                  <SettingsToggleRow
                    id="editor-insert-spaces"
                    label={t('editor.settings.insertSpaces')}
                    description={t('editor.settings.insertSpacesHint')}
                    checked={settings.insertSpaces}
                    onCheckedChange={checked => patch({ insertSpaces: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-detect-indentation"
                    label={t('editor.settings.detectIndentation')}
                    description={t('editor.settings.detectIndentationHint')}
                    checked={settings.detectIndentation}
                    onCheckedChange={checked => patch({ detectIndentation: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="editing-behavior"
                  icon={MousePointerClick}
                  title={t('editor.settings.groups.behavior')}
                  description={t('editor.settings.groups.behaviorHint')}
                >
                  <SettingsToggleRow
                    id="editor-linked-editing"
                    label={t('editor.settings.linkedEditing')}
                    description={t('editor.settings.linkedEditingHint')}
                    checked={settings.linkedEditing}
                    onCheckedChange={checked => patch({ linkedEditing: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-drag-drop"
                    label={t('editor.settings.dragAndDrop')}
                    description={t('editor.settings.dragAndDropHint')}
                    checked={settings.dragAndDrop}
                    onCheckedChange={checked => patch({ dragAndDrop: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-show-unused"
                    label={t('editor.settings.showUnused')}
                    description={t('editor.settings.showUnusedHint')}
                    checked={settings.showUnused}
                    onCheckedChange={checked => patch({ showUnused: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-links"
                    label={t('editor.settings.links')}
                    description={t('editor.settings.linksHint')}
                    checked={settings.links}
                    onCheckedChange={checked => patch({ links: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="editing-wrapping"
                  icon={WrapText}
                  title={t('editor.settings.groups.wrapping')}
                  description={t('editor.settings.groups.wrappingHint')}
                >
                  <SettingsFieldBlock label={t('editor.settings.wordWrap')} htmlFor="editor-word-wrap">
                    <Select value={settings.wordWrap} onValueChange={(value: EditorWordWrap) => patch({ wordWrap: value })}>
                      <SelectTrigger id="editor-word-wrap" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t('editor.settings.wordWrapOff')}</SelectItem>
                        <SelectItem value="on">{t('editor.settings.wordWrapOn')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="editing-formatting"
                  icon={Sparkles}
                  title={t('editor.settings.groups.formatting')}
                  description={t('editor.settings.groups.formattingHint')}
                >
                  <SettingsToggleRow
                    id="editor-format-on-save"
                    label={t('editor.settings.formatOnSave')}
                    description={t('editor.settings.formatOnSaveHint')}
                    checked={settings.formatOnSave}
                    onCheckedChange={checked => patch({ formatOnSave: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-trim-trailing-whitespace-on-save"
                    label={t('editor.settings.trimTrailingWhitespaceOnSave')}
                    description={t('editor.settings.trimTrailingWhitespaceOnSaveHint')}
                    checked={settings.trimTrailingWhitespaceOnSave}
                    onCheckedChange={checked => patch({ trimTrailingWhitespaceOnSave: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-insert-final-newline-on-save"
                    label={t('editor.settings.insertFinalNewlineOnSave')}
                    description={t('editor.settings.insertFinalNewlineOnSaveHint')}
                    checked={settings.insertFinalNewlineOnSave}
                    onCheckedChange={checked => patch({ insertFinalNewlineOnSave: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-format-on-paste"
                    label={t('editor.settings.formatOnPaste')}
                    checked={settings.formatOnPaste}
                    onCheckedChange={checked => patch({ formatOnPaste: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="editing-intellisense"
                  icon={Brain}
                  title={t('editor.settings.groups.intelliSense')}
                  description={t('editor.settings.groups.intelliSenseHint')}
                >
                  <SettingsToggleRow
                    id="editor-sticky-scroll"
                    label={t('editor.settings.stickyScroll')}
                    description={t('editor.settings.stickyScrollHint')}
                    checked={settings.stickyScroll}
                    onCheckedChange={checked => patch({ stickyScroll: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-code-lens"
                    label={t('editor.settings.codeLens')}
                    description={t('editor.settings.codeLensHint')}
                    checked={settings.codeLens}
                    onCheckedChange={checked => patch({ codeLens: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-inlay-hints"
                    label={t('editor.settings.inlayHints')}
                    description={t('editor.settings.inlayHintsHint')}
                    checked={settings.inlayHints}
                    onCheckedChange={checked => patch({ inlayHints: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-prefer-go-to-source-definition"
                    label={t('editor.settings.preferGoToSourceDefinition')}
                    description={t('editor.settings.preferGoToSourceDefinitionHint')}
                    checked={settings.preferGoToSourceDefinition}
                    onCheckedChange={checked => patch({ preferGoToSourceDefinition: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection
                  value="workbench-layout"
                  icon={LayoutDashboard}
                  title={t('editor.settings.groups.workbench')}
                  description={t('editor.settings.groups.workbenchHint')}
                >
                  <SettingsToggleRow
                    id="editor-breadcrumbs"
                    label={t('editor.settings.breadcrumbs')}
                    description={t('editor.settings.breadcrumbsHint')}
                    checked={settings.breadcrumbs}
                    onCheckedChange={checked => patch({ breadcrumbs: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-explorer-auto-reveal"
                    label={t('editor.settings.explorerAutoReveal')}
                    description={t('editor.settings.explorerAutoRevealHint')}
                    checked={settings.explorerAutoReveal}
                    onCheckedChange={checked => patch({ explorerAutoReveal: checked })}
                  />

                  <SettingsToggleRow
                    id="editor-restore-tabs"
                    label={t('editor.settings.restoreEditorTabs')}
                    description={t('editor.settings.restoreEditorTabsHint')}
                    checked={settings.restoreEditorTabs}
                    onCheckedChange={checked => patch({ restoreEditorTabs: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="workbench-files" icon={FileText} title={t('editor.settings.groups.files')} description={t('editor.settings.groups.filesHint')}>
                  <SettingsFieldBlock label={t('editor.settings.autoSave')} htmlFor="editor-auto-save">
                    <Select value={settings.autoSave} onValueChange={(value: EditorAutoSave) => patch({ autoSave: value })}>
                      <SelectTrigger id="editor-auto-save" className={SETTINGS_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t('editor.settings.autoSaveOff')}</SelectItem>
                        <SelectItem value="afterDelay">{t('editor.settings.autoSaveAfterDelay')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingsFieldBlock>

                  {settings.autoSave === 'afterDelay' ? (
                    <SettingsFieldBlock label={t('editor.settings.autoSaveDelay')} htmlFor="editor-auto-save-delay">
                      <div className="flex items-center gap-3">
                        <Slider
                          id="editor-auto-save-delay"
                          className="flex-1"
                          min={EDITOR_AUTO_SAVE_DELAY_MIN}
                          max={EDITOR_AUTO_SAVE_DELAY_MAX}
                          step={100}
                          value={[settings.autoSaveDelayMs]}
                          onValueChange={([value]) => {
                            if (typeof value !== 'number') return
                            patch({ autoSaveDelayMs: value })
                          }}
                        />
                        <SettingsValueBadge>{autoSaveDelayLabel}</SettingsValueBadge>
                      </div>
                    </SettingsFieldBlock>
                  ) : null}
                </SettingsAccordionSection>
              </SettingsAccordion>
            </SettingsTabPanel>
          </SettingsDialogSplitLayout>
        </SettingsSearchProvider>
      </SettingsDialogFrame>
    </Dialog>
  )
}
