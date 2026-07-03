'use client'

import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { onAppMonacoBeforeMount, useGlobalAppMonacoThemeSync } from '@/hooks/useAppMonacoTheme'
import { TERMINAL_FONT_FAMILY_LABEL_KEYS } from '@/lib/terminal/terminalPrefs'
import { cn } from '@/lib/utils'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import {
  buildEditorSettingsPreviewOptions,
  EDITOR_SETTINGS_PREVIEW_HEIGHT,
} from '@/pages/editor/lib/buildEditorSettingsPreviewOptions'
import { buildEditorPreviewSample, resolveEditorMonacoFontStyle } from '@/pages/editor/lib/editorMonacoTheme'
import { EditorSettingsWorkbenchPreview } from '@/pages/editor/EditorSettingsWorkbenchPreview'

export type EditorSettingsPreviewVariant = 'monaco' | 'workbench'

type EditorSettingsPreviewProps = {
  settings: EditorSettings
  variant?: EditorSettingsPreviewVariant
  className?: string
}

function EditorSettingsMonacoPreview({ settings, className }: { settings: EditorSettings; className?: string }) {
  const { t } = useTranslation()
  const theme = useGlobalAppMonacoThemeSync({ includeDiff: false, includeEditorRules: true })
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const fontStyle = useMemo(() => resolveEditorMonacoFontStyle(settings), [settings])
  const editorOptions = useMemo(() => buildEditorSettingsPreviewOptions(settings), [settings])
  const previewSample = useMemo(
    () => buildEditorPreviewSample(settings.tabSize, settings.insertSpaces),
    [settings.insertSpaces, settings.tabSize]
  )

  const handleMount: OnMount = useCallback(editor => {
    editorRef.current = editor
  }, [])

  useEffect(() => {
    editorRef.current?.updateOptions(editorOptions)
    void import('monaco-editor').then(monaco => monaco.editor.remeasureFonts())
  }, [editorOptions, fontStyle])

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/70 shadow-inner', className)}>
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/15 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('editor.settings.preview')}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/80">
          {settings.fontSize}px · {t(TERMINAL_FONT_FAMILY_LABEL_KEYS[settings.fontFamilyId])}
        </span>
      </div>
      <div className="hb-monaco-editor-root min-h-0" style={{ ...fontStyle, height: EDITOR_SETTINGS_PREVIEW_HEIGHT }}>
        <Editor
          height={EDITOR_SETTINGS_PREVIEW_HEIGHT}
          language="typescript"
          theme={theme}
          value={previewSample}
          options={editorOptions}
          beforeMount={onAppMonacoBeforeMount}
          onMount={handleMount}
          loading={null}
        />
      </div>
    </div>
  )
}

export function EditorSettingsPreview({ settings, variant = 'monaco', className }: EditorSettingsPreviewProps) {
  if (variant === 'workbench') {
    return <EditorSettingsWorkbenchPreview settings={settings} className={className} />
  }
  return <EditorSettingsMonacoPreview settings={settings} className={className} />
}
