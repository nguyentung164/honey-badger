'use client'

import Editor, { type OnMount, useMonaco } from '@monaco-editor/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SETTINGS_FONT_MICRO, SettingsPreviewHintChips } from '@/components/settings/settingsDialogUi'
import { onAppMonacoBeforeMount, useAppMonacoThemeId, useSyncAppMonacoTheme } from '@/hooks/useAppMonacoTheme'
import { TERMINAL_FONT_FAMILY_LABEL_KEYS } from '@/lib/terminal/terminalPrefs'
import { cn } from '@/lib/utils'
import { EditorSettingsWorkbenchPreview } from '@/pages/editor/EditorSettingsWorkbenchPreview'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { editorSettingsFingerprint, refreshEditorMonacoAfterSettings } from '@/pages/editor/lib/applyEditorMonacoSettings'
import { buildEditorSettingsPreviewOptions } from '@/pages/editor/lib/buildEditorSettingsPreviewOptions'
import { buildEditorPreviewSample, resolveEditorMonacoFontStyle, resolveEditorPreviewMonacoLanguage } from '@/pages/editor/lib/editorMonacoTheme'
import { applyEditorSettingsPreview } from '@/pages/editor/lib/editorSettingsPreviewEffects'
import { collectEditorSettingsPreviewBehaviorHints } from '@/pages/editor/lib/editorSettingsPreviewHints'
import { EDITOR_SETTINGS_PREVIEW_MODEL_PATH, ensureEditorSettingsPreviewLanguageService } from '@/pages/editor/lib/editorSettingsPreviewLanguageService'

const EDITOR_SETTINGS_PREVIEW_THEME_OPTS = { includeDiff: false, includeEditorRules: true } as const

export type EditorSettingsPreviewVariant = 'monaco' | 'workbench'

type EditorSettingsPreviewProps = {
  variant?: EditorSettingsPreviewVariant
  className?: string
  /** When false, Monaco is not mounted (avoids zero-size layout while the dialog is closed). */
  dialogOpen?: boolean
}

function EditorSettingsMonacoPreview({ className, dialogOpen = true }: { className?: string; dialogOpen?: boolean }) {
  const { t } = useTranslation()
  const settings = useEditorMonacoSettings()
  const settingsKey = useMemo(() => editorSettingsFingerprint(settings), [settings])
  const monaco = useMonaco()
  const theme = useAppMonacoThemeId()
  useSyncAppMonacoTheme(monaco, EDITOR_SETTINGS_PREVIEW_THEME_OPTS)
  useEffect(() => {
    if (!monaco) return
    ensureEditorSettingsPreviewLanguageService(monaco)
  }, [monaco])
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const fontStyle = useMemo(() => resolveEditorMonacoFontStyle(settings), [settings])
  const editorOptions = useMemo(() => buildEditorSettingsPreviewOptions(settings), [settings, settingsKey])
  const previewLanguage = useMemo(() => resolveEditorPreviewMonacoLanguage(settings.previewSampleLanguage), [settings.previewSampleLanguage, settingsKey])
  const previewSample = useMemo(
    () => buildEditorPreviewSample(settings.tabSize, settings.insertSpaces, settings.previewSampleLanguage),
    [settings.insertSpaces, settings.previewSampleLanguage, settings.tabSize, settingsKey]
  )

  const handleMount: OnMount = useCallback(editor => {
    editorRef.current = editor
    applyEditorSettingsPreview(editor, settingsRef.current)
    refreshEditorMonacoAfterSettings(editor)
  }, [])

  useEffect(() => {
    if (!dialogOpen) {
      editorRef.current = null
      return
    }
    const editor = editorRef.current
    if (!editor) return
    applyEditorSettingsPreview(editor, settings)
    refreshEditorMonacoAfterSettings(editor)
  }, [dialogOpen, settings, settingsKey])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !dialogOpen) return
    const model = editor.getModel()
    if (model && model.getValue() !== previewSample) {
      editor.setValue(previewSample)
      applyEditorSettingsPreview(editor, settings)
    }
  }, [dialogOpen, previewSample, settings])

  const previewBehaviorHints = useMemo(() => collectEditorSettingsPreviewBehaviorHints(settings, t, 'monaco'), [settings, t])

  return (
    <div className={cn('flex h-full min-h-[18rem] flex-col overflow-hidden rounded-md border border-border/60 shadow-sm', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/12 px-2.5 py-1">
        <span className={cn(SETTINGS_FONT_MICRO, 'font-medium uppercase tracking-wider text-muted-foreground')}>{t('editor.settings.preview')}</span>
        <span className={cn('max-w-[65%] truncate tabular-nums text-muted-foreground/80', SETTINGS_FONT_MICRO)}>
          {settings.fontSize}px · {t(TERMINAL_FONT_FAMILY_LABEL_KEYS[settings.fontFamilyId])}
        </span>
      </div>
      <div className="hb-monaco-editor-root min-h-0 flex-1 w-full" style={fontStyle}>
        {dialogOpen ? (
          <Editor
            key={`editor-settings-preview-${previewLanguage}`}
            path={EDITOR_SETTINGS_PREVIEW_MODEL_PATH}
            height="100%"
            language={previewLanguage}
            theme={theme}
            defaultValue={previewSample}
            options={editorOptions}
            beforeMount={onAppMonacoBeforeMount}
            onMount={handleMount}
            loading={null}
          />
        ) : null}
      </div>
      <SettingsPreviewHintChips hints={previewBehaviorHints} />
    </div>
  )
}

export function EditorSettingsPreview({ variant = 'monaco', className, dialogOpen = true }: EditorSettingsPreviewProps) {
  if (variant === 'workbench') {
    return <EditorSettingsWorkbenchPreview className={className} />
  }
  return <EditorSettingsMonacoPreview className={className} dialogOpen={dialogOpen} />
}
