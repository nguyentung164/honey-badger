'use client'

import type { LucideIcon } from 'lucide-react'
import { LayoutPanelLeft, Palette, RotateCcw, Settings2, Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { EditorSettingsPreview } from '@/pages/editor/EditorSettingsPreview'
import {
  EDITOR_TAB_SIZE_OPTIONS,
  type EditorAutoSave,
  type EditorCursorStyle,
  type EditorLineNumbers,
  type EditorRenderWhitespace,
  type EditorSettings,
  type EditorWordWrap,
  useEditorMonacoSettings,
  useEditorSettings,
} from '@/pages/editor/hooks/useEditorSettings'
import {
  EDITOR_AUTO_SAVE_DELAY_MAX,
  EDITOR_AUTO_SAVE_DELAY_MIN,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
} from '@/pages/editor/lib/editorMonacoTheme'

type EditorSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTabId = 'typography' | 'appearance' | 'editing' | 'workbench'

const SETTINGS_TABS: { id: SettingsTabId; icon: LucideIcon }[] = [
  { id: 'typography', icon: Type },
  { id: 'appearance', icon: Palette },
  { id: 'editing', icon: Settings2 },
  { id: 'workbench', icon: LayoutPanelLeft },
]

const EDITOR_CURSOR_STYLE_ORDER: EditorCursorStyle[] = ['line', 'block', 'underline']

const SETTINGS_TAB_TRIGGER_CLASS =
  'h-9 w-full justify-start gap-2 rounded-md border-l-[3px] border-l-transparent px-2.5 text-xs after:hidden data-[state=active]:border-l-primary data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none'

const SETTINGS_ACCORDION_TRIGGER_CLASS = 'hover:no-underline py-3 px-1 items-center [&>svg:last-child]:self-center'

function SettingsAccordionSection({
  value,
  title,
  description,
  children,
}: {
  value: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <AccordionItem value={value} className="border-border/60">
      <AccordionTrigger className={SETTINGS_ACCORDION_TRIGGER_CLASS}>
        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
          <span className="text-sm font-semibold leading-tight">{title}</span>
          {description ? <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span> : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 px-1 pb-4 pt-0">{children}</AccordionContent>
    </AccordionItem>
  )
}

function FieldBlock({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
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

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="radiogroup" aria-label={t('editor.settings.fontWeight')}>
      {TERMINAL_FONT_WEIGHT_ORDER.map(id => {
        const selected = value === id
        const weightStyle = resolveFontWeightPreviewStyle(fontFamilyId, id)
        const optionLabel = t(`terminal.settings.fontWeightOptions.${id}`)
        return (
          <label
            key={id}
            title={optionLabel}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border bg-background/80 px-1 py-2 transition-colors hover:bg-muted/40',
              selected ? 'border-primary ring-1 ring-primary/35' : 'border-border/60'
            )}
          >
            <input
              type="radio"
              name="editor-settings-font-weight"
              value={id}
              checked={selected}
              onChange={() => onChange(id)}
              className="sr-only"
              aria-label={optionLabel}
            />
            <span className="text-[22px] leading-none text-foreground" style={weightStyle} aria-hidden>
              Ag
            </span>
            <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground">{optionLabel}</span>
          </label>
        )
      })}
    </div>
  )
}

function PreviewSettingsTab({
  value,
  settings,
  previewVariant = 'monaco',
  children,
}: {
  value: SettingsTabId
  settings: EditorSettings
  previewVariant?: 'monaco' | 'workbench'
  children: React.ReactNode
}) {
  return (
    <TabsContent value={value} className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none">
      <div className="shrink-0 border-b border-border/50 bg-background px-6 pb-4 pt-5">
        <EditorSettingsPreview settings={settings} variant={previewVariant} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Accordion type="multiple" className="w-full px-6 py-5">
          {children}
        </Accordion>
      </div>
    </TabsContent>
  )
}

export function EditorSettingsDialog({ open, onOpenChange }: EditorSettingsDialogProps) {
  const { t } = useTranslation()
  const settings = useEditorMonacoSettings()
  const patchSettings = useEditorSettings(s => s.patchSettings)
  const resetSettings = useEditorSettings(s => s.resetSettings)

  const patch = (partial: Partial<EditorSettings>) => patchSettings(partial)

  const autoSaveDelayLabel = `${(settings.autoSaveDelayMs / 1000).toFixed(1)}s`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(88vh,48rem)] w-[min(100%-2rem,54rem)] max-w-[54rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[54rem]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-0.5 border-b border-border/60 px-6 py-4 text-left">
          <DialogTitle className="text-base font-semibold leading-tight">{t('editor.settings.title')}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{t('editor.settings.description')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="typography" orientation="vertical" className="flex min-h-0 flex-1 gap-0">
          <div className="w-[11.5rem] shrink-0 border-r border-border/60 bg-muted/10">
            <ScrollArea className="h-full">
              <TabsList variant="line" className="h-auto w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-2">
                {SETTINGS_TABS.map(tab => {
                  const Icon = tab.icon
                  return (
                    <TabsTrigger key={tab.id} value={tab.id} className={SETTINGS_TAB_TRIGGER_CLASS}>
                      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{t(`editor.settings.sections.${tab.id}`)}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PreviewSettingsTab value="typography" settings={settings}>
                <SettingsAccordionSection value="typography-font" title={t('editor.settings.groups.font')} description={t('editor.settings.groups.fontHint')}>
                  <FieldBlock label={t('editor.settings.fontSize')} htmlFor="editor-font-size">
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
                      <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">{settings.fontSize}</span>
                    </div>
                  </FieldBlock>

                  <FieldBlock label={t('editor.settings.fontFamilyLabel')} htmlFor="editor-font-family">
                    <Select value={settings.fontFamilyId} onValueChange={(value: TerminalFontFamilyId) => patch({ fontFamilyId: value })}>
                      <SelectTrigger id="editor-font-family" className="h-9 w-full">
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
                  </FieldBlock>

                  <FieldBlock label={t('editor.settings.fontWeight')}>
                    <FontWeightPicker value={settings.fontWeight} fontFamilyId={settings.fontFamilyId} onChange={fontWeight => patch({ fontWeight })} />
                  </FieldBlock>

                  <ToggleRow
                    id="editor-ligatures"
                    label={t('editor.settings.ligatures')}
                    description={t('editor.settings.ligaturesHint')}
                    checked={settings.enableLigatures}
                    onCheckedChange={checked => patch({ enableLigatures: checked })}
                  />
                </SettingsAccordionSection>
              </PreviewSettingsTab>

              <PreviewSettingsTab value="appearance" settings={settings}>
                <SettingsAccordionSection value="appearance-gutter" title={t('editor.settings.groups.gutter')} description={t('editor.settings.groups.gutterHint')}>
                  <FieldBlock label={t('editor.settings.lineNumbers')} htmlFor="editor-line-numbers">
                    <Select value={settings.lineNumbers} onValueChange={(value: EditorLineNumbers) => patch({ lineNumbers: value })}>
                      <SelectTrigger id="editor-line-numbers" className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on">{t('editor.settings.lineNumbersOn')}</SelectItem>
                        <SelectItem value="off">{t('editor.settings.lineNumbersOff')}</SelectItem>
                        <SelectItem value="relative">{t('editor.settings.lineNumbersRelative')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldBlock>

                  <ToggleRow id="editor-minimap" label={t('editor.settings.minimap')} checked={settings.minimap} onCheckedChange={checked => patch({ minimap: checked })} />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="appearance-guides" title={t('editor.settings.groups.guides')} description={t('editor.settings.groups.guidesHint')}>
                  <ToggleRow
                    id="editor-bracket-colorization"
                    label={t('editor.settings.bracketPairColorization')}
                    checked={settings.bracketPairColorization}
                    onCheckedChange={checked => patch({ bracketPairColorization: checked })}
                  />

                  <FieldBlock label={t('editor.settings.renderWhitespace')} htmlFor="editor-render-whitespace">
                    <Select value={settings.renderWhitespace} onValueChange={(value: EditorRenderWhitespace) => patch({ renderWhitespace: value })}>
                      <SelectTrigger id="editor-render-whitespace" className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('editor.settings.renderWhitespaceNone')}</SelectItem>
                        <SelectItem value="selection">{t('editor.settings.renderWhitespaceSelection')}</SelectItem>
                        <SelectItem value="all">{t('editor.settings.renderWhitespaceAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldBlock>
                </SettingsAccordionSection>

                <SettingsAccordionSection value="appearance-cursor" title={t('editor.settings.groups.cursor')} description={t('editor.settings.groups.cursorHint')}>
                  <FieldBlock label={t('editor.settings.cursorStyle')} htmlFor="editor-cursor-style">
                    <Select value={settings.cursorStyle} onValueChange={(value: EditorCursorStyle) => patch({ cursorStyle: value })}>
                      <SelectTrigger id="editor-cursor-style" className="h-9 w-full">
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
                  </FieldBlock>

                  <ToggleRow
                    id="editor-cursor-blink"
                    label={t('editor.settings.cursorBlink')}
                    checked={settings.cursorBlink}
                    onCheckedChange={checked => patch({ cursorBlink: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="appearance-scrolling" title={t('editor.settings.groups.scrolling')} description={t('editor.settings.groups.scrollingHint')}>
                  <ToggleRow
                    id="editor-smooth-scrolling"
                    label={t('editor.settings.smoothScrolling')}
                    checked={settings.smoothScrolling}
                    onCheckedChange={checked => patch({ smoothScrolling: checked })}
                  />

                  <ToggleRow
                    id="editor-scroll-beyond"
                    label={t('editor.settings.scrollBeyondLastLine')}
                    checked={settings.scrollBeyondLastLine}
                    onCheckedChange={checked => patch({ scrollBeyondLastLine: checked })}
                  />
                </SettingsAccordionSection>
              </PreviewSettingsTab>

              <PreviewSettingsTab value="editing" settings={settings}>
                <SettingsAccordionSection value="editing-indentation" title={t('editor.settings.groups.indentation')} description={t('editor.settings.groups.indentationHint')}>
                  <FieldBlock label={t('editor.settings.tabSize')} htmlFor="editor-tab-size">
                    <Select value={String(settings.tabSize)} onValueChange={value => patch({ tabSize: Number(value) })}>
                      <SelectTrigger id="editor-tab-size" className="h-9 w-full">
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
                  </FieldBlock>

                  <ToggleRow
                    id="editor-insert-spaces"
                    label={t('editor.settings.insertSpaces')}
                    description={t('editor.settings.insertSpacesHint')}
                    checked={settings.insertSpaces}
                    onCheckedChange={checked => patch({ insertSpaces: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="editing-wrapping" title={t('editor.settings.groups.wrapping')} description={t('editor.settings.groups.wrappingHint')}>
                  <FieldBlock label={t('editor.settings.wordWrap')} htmlFor="editor-word-wrap">
                    <Select value={settings.wordWrap} onValueChange={(value: EditorWordWrap) => patch({ wordWrap: value })}>
                      <SelectTrigger id="editor-word-wrap" className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t('editor.settings.wordWrapOff')}</SelectItem>
                        <SelectItem value="on">{t('editor.settings.wordWrapOn')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldBlock>
                </SettingsAccordionSection>

                <SettingsAccordionSection value="editing-formatting" title={t('editor.settings.groups.formatting')} description={t('editor.settings.groups.formattingHint')}>
                  <ToggleRow
                    id="editor-format-on-save"
                    label={t('editor.settings.formatOnSave')}
                    description={t('editor.settings.formatOnSaveHint')}
                    checked={settings.formatOnSave}
                    onCheckedChange={checked => patch({ formatOnSave: checked })}
                  />

                  <ToggleRow
                    id="editor-format-on-paste"
                    label={t('editor.settings.formatOnPaste')}
                    checked={settings.formatOnPaste}
                    onCheckedChange={checked => patch({ formatOnPaste: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="editing-intellisense" title={t('editor.settings.groups.intelliSense')} description={t('editor.settings.groups.intelliSenseHint')}>
                  <ToggleRow
                    id="editor-sticky-scroll"
                    label={t('editor.settings.stickyScroll')}
                    description={t('editor.settings.stickyScrollHint')}
                    checked={settings.stickyScroll}
                    onCheckedChange={checked => patch({ stickyScroll: checked })}
                  />

                  <ToggleRow
                    id="editor-code-lens"
                    label={t('editor.settings.codeLens')}
                    description={t('editor.settings.codeLensHint')}
                    checked={settings.codeLens}
                    onCheckedChange={checked => patch({ codeLens: checked })}
                  />

                  <ToggleRow
                    id="editor-inlay-hints"
                    label={t('editor.settings.inlayHints')}
                    description={t('editor.settings.inlayHintsHint')}
                    checked={settings.inlayHints}
                    onCheckedChange={checked => patch({ inlayHints: checked })}
                  />
                </SettingsAccordionSection>
              </PreviewSettingsTab>

              <PreviewSettingsTab value="workbench" settings={settings} previewVariant="workbench">
                <SettingsAccordionSection value="workbench-layout" title={t('editor.settings.groups.workbench')} description={t('editor.settings.groups.workbenchHint')}>
                  <ToggleRow
                    id="editor-breadcrumbs"
                    label={t('editor.settings.breadcrumbs')}
                    description={t('editor.settings.breadcrumbsHint')}
                    checked={settings.breadcrumbs}
                    onCheckedChange={checked => patch({ breadcrumbs: checked })}
                  />

                  <ToggleRow
                    id="editor-explorer-auto-reveal"
                    label={t('editor.settings.explorerAutoReveal')}
                    description={t('editor.settings.explorerAutoRevealHint')}
                    checked={settings.explorerAutoReveal}
                    onCheckedChange={checked => patch({ explorerAutoReveal: checked })}
                  />

                  <ToggleRow
                    id="editor-restore-tabs"
                    label={t('editor.settings.restoreEditorTabs')}
                    description={t('editor.settings.restoreEditorTabsHint')}
                    checked={settings.restoreEditorTabs}
                    onCheckedChange={checked => patch({ restoreEditorTabs: checked })}
                  />
                </SettingsAccordionSection>

                <SettingsAccordionSection value="workbench-files" title={t('editor.settings.groups.files')} description={t('editor.settings.groups.filesHint')}>
                  <FieldBlock label={t('editor.settings.autoSave')} htmlFor="editor-auto-save">
                    <Select value={settings.autoSave} onValueChange={(value: EditorAutoSave) => patch({ autoSave: value })}>
                      <SelectTrigger id="editor-auto-save" className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t('editor.settings.autoSaveOff')}</SelectItem>
                        <SelectItem value="afterDelay">{t('editor.settings.autoSaveAfterDelay')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldBlock>

                  {settings.autoSave === 'afterDelay' ? (
                    <FieldBlock label={t('editor.settings.autoSaveDelay')} htmlFor="editor-auto-save-delay">
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
                        <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">{autoSaveDelayLabel}</span>
                      </div>
                    </FieldBlock>
                  ) : null}
                </SettingsAccordionSection>
              </PreviewSettingsTab>
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/15 px-6 py-3 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => resetSettings()}>
            <RotateCcw className="size-3.5" aria-hidden />
            {t('editor.settings.reset')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
