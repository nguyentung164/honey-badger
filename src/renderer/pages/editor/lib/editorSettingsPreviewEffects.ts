import type * as Monaco from 'monaco-editor'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildEditorSettingsPreviewOptions } from '@/pages/editor/lib/buildEditorSettingsPreviewOptions'
import {
  findEditorSettingsPreviewIdentifierRange,
  findEditorSettingsPreviewLine,
  isEditorSettingsPreviewModel,
} from '@/pages/editor/lib/editorSettingsPreviewLanguageService'

const PREVIEW_UNUSED_DECORATION_CLASS = 'hb-editor-settings-preview-unused'
const previewDecorationCollections = new WeakMap<
  Monaco.editor.IStandaloneCodeEditor,
  Monaco.editor.IEditorDecorationsCollection
>()

function applyPreviewUnusedHighlight(
  editor: Monaco.editor.IStandaloneCodeEditor,
  settings: EditorSettings,
  model: Monaco.editor.ITextModel
): void {
  let collection = previewDecorationCollections.get(editor)
  const clear = () => {
    collection?.clear()
  }

  if (!settings.showUnused || settings.previewSampleLanguage !== 'typescript') {
    clear()
    return
  }

  const lineNumber = findEditorSettingsPreviewLine(model, line => /\bconst unusedPreview =/.test(line))
  if (!lineNumber) {
    clear()
    return
  }

  const range = findEditorSettingsPreviewIdentifierRange(model, lineNumber, 'unusedPreview')
  if (!range) {
    clear()
    return
  }

  if (!collection) {
    collection = editor.createDecorationsCollection([])
    previewDecorationCollections.set(editor, collection)
  }

  collection.set([
    {
      range,
      options: { inlineClassName: PREVIEW_UNUSED_DECORATION_CLASS },
    },
  ])
}

function applyPreviewStickyScrollDemo(editor: Monaco.editor.IStandaloneCodeEditor, settings: EditorSettings, model: Monaco.editor.ITextModel): void {
  if (settings.previewSampleLanguage !== 'typescript') {
    return
  }

  if (!settings.stickyScroll) {
    editor.revealLine(1)
    return
  }

  const lineNumber = findEditorSettingsPreviewLine(model, line => /\bfor \(let i = 0; i < tokens\.length; i \+= 2\)/.test(line))
  if (!lineNumber) return

  editor.revealLineInCenterIfOutsideViewport(lineNumber)
}

function applyPreviewWhitespaceSelection(editor: Monaco.editor.IStandaloneCodeEditor, settings: EditorSettings, model: Monaco.editor.ITextModel): void {
  if (settings.previewSampleLanguage !== 'typescript') {
    editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 })
    return
  }

  if (settings.renderWhitespace !== 'selection') {
    editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 })
    return
  }

  const lineNumber = findEditorSettingsPreviewLine(model, line => /\bconst trailingSpaces =/.test(line))
  if (!lineNumber) return

  const line = model.getLineContent(lineNumber)
  const trailingStart = line.search(/\s+$/)
  if (trailingStart < 0) return

  editor.setSelection({
    startLineNumber: lineNumber,
    startColumn: trailingStart + 1,
    endLineNumber: lineNumber,
    endColumn: line.length + 1,
  })
}

/** Push preview-only visual effects that Monaco options alone cannot demonstrate. */
function applyEditorSettingsPreviewEffects(
  editor: Monaco.editor.IStandaloneCodeEditor,
  settings: EditorSettings
): void {
  const model = editor.getModel()
  if (!model || !isEditorSettingsPreviewModel(model)) return

  applyPreviewUnusedHighlight(editor, settings, model)
  applyPreviewWhitespaceSelection(editor, settings, model)
  applyPreviewStickyScrollDemo(editor, settings, model)
}

/** Apply Monaco + model options for the settings dialog preview editor. */
export function applyEditorSettingsPreview(
  editor: Monaco.editor.IStandaloneCodeEditor,
  settings: EditorSettings
): void {
  const model = editor.getModel()
  editor.updateOptions(buildEditorSettingsPreviewOptions(settings))
  model?.updateOptions({
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
  })
  applyEditorSettingsPreviewEffects(editor, settings)
}
