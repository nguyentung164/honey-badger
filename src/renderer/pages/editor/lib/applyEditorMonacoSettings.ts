import type * as Monaco from 'monaco-editor'
import { isLargeFileByMetrics } from 'shared/fileUri'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'

export function isEditorMonacoHeavy(editor: Monaco.editor.IStandaloneCodeEditor): boolean {
  const model = editor.getModel()
  if (!model) return false
  return isLargeFileByMetrics(model.getValueLength(), model.getLineCount())
}

/** Push persisted editor settings into a live Monaco widget + its model. */
export function applyEditorMonacoSettings(
  editor: Monaco.editor.IStandaloneCodeEditor,
  settings: EditorSettings,
  readOnly: boolean,
  heavy?: boolean
): void {
  const model = editor.getModel()
  const resolvedHeavy = heavy ?? (model ? isLargeFileByMetrics(model.getValueLength(), model.getLineCount()) : false)
  editor.updateOptions(buildMonacoEditorOptions(settings, resolvedHeavy, readOnly))
  model?.updateOptions({
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
  })
}

/** After font/option changes — Monaco needs a layout pass and font remeasure. */
export function refreshEditorMonacoAfterSettings(editor: Monaco.editor.IStandaloneCodeEditor | null | undefined): void {
  if (!editor) return
  requestAnimationFrame(() => {
    editor.layout()
    void import('monaco-editor').then(monaco => monaco.editor.remeasureFonts())
  })
}

/** Stable dependency string for settings-driven effects. */
export function editorSettingsFingerprint(settings: EditorSettings): string {
  return [
    settings.fontSize,
    settings.fontFamilyId,
    settings.fontWeight,
    settings.enableLigatures,
    settings.tabSize,
    settings.insertSpaces,
    settings.wordWrap,
    settings.minimap,
    settings.lineNumbers,
    settings.bracketPairColorization,
    settings.renderWhitespace,
    settings.smoothScrolling,
    settings.stickyScroll,
    settings.cursorBlink,
    settings.cursorStyle,
    settings.scrollBeyondLastLine,
    settings.formatOnSave,
    settings.trimTrailingWhitespaceOnSave,
    settings.insertFinalNewlineOnSave,
    settings.formatOnPaste,
    settings.codeLens,
    settings.inlayHints,
    settings.previewSampleLanguage,
    settings.linkedEditing,
    settings.dragAndDrop,
    settings.showUnused,
    settings.renderControlCharacters,
    settings.detectIndentation,
    settings.rulers.join(','),
    settings.links,
  ].join('\0')
}
