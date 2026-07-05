import type * as Monaco from 'monaco-editor'
import { buildEditorSettingsPreviewInlayHints } from '@/pages/editor/lib/editorSettingsPreviewInlayHints'

/** Stable Monaco model path for the settings dialog preview editor. */
export const EDITOR_SETTINGS_PREVIEW_MODEL_PATH = 'editor-settings-preview/sample.ts'

export function isEditorSettingsPreviewModel(model: Monaco.editor.ITextModel): boolean {
  const path = model.uri.path.replace(/\\/g, '/')
  return path === `/${EDITOR_SETTINGS_PREVIEW_MODEL_PATH}` || path.endsWith(`/${EDITOR_SETTINGS_PREVIEW_MODEL_PATH}`)
}

export function findEditorSettingsPreviewLine(
  model: Monaco.editor.ITextModel,
  predicate: (line: string, lineNumber: number) => boolean
): number | null {
  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    if (predicate(model.getLineContent(lineNumber), lineNumber)) return lineNumber
  }
  return null
}

export function findEditorSettingsPreviewIdentifierRange(
  model: Monaco.editor.ITextModel,
  lineNumber: number,
  identifier: string
): Monaco.IRange | null {
  const line = model.getLineContent(lineNumber)
  const index = line.indexOf(identifier)
  if (index < 0) return null
  return {
    startLineNumber: lineNumber,
    startColumn: index + 1,
    endLineNumber: lineNumber,
    endColumn: index + identifier.length + 1,
  }
}

let previewLanguageServiceRegistered = false

/** Mock LSP features for the settings preview (inlay hints, CodeLens). */
export function ensureEditorSettingsPreviewLanguageService(monaco: typeof Monaco): void {
  if (previewLanguageServiceRegistered) return
  previewLanguageServiceRegistered = true

  monaco.languages.registerInlayHintsProvider(['typescript', 'javascript'], {
    provideInlayHints: async (model, range) => {
      if (!isEditorSettingsPreviewModel(model)) {
        return { hints: [], dispose: () => {} }
      }
      return {
        hints: buildEditorSettingsPreviewInlayHints(monaco, model, range),
        dispose: () => {},
      }
    },
  })

  monaco.languages.registerCodeLensProvider(['typescript', 'javascript'], {
    provideCodeLenses: async model => {
      if (!isEditorSettingsPreviewModel(model)) {
        return { lenses: [], dispose: () => {} }
      }
      const lineNumber = findEditorSettingsPreviewLine(model, line =>
        /^export function parseConfig\(input: string\)/.test(line)
      )
      if (!lineNumber) {
        return { lenses: [], dispose: () => {} }
      }
      return {
        lenses: [
          {
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            id: 'editor-settings-preview-references',
            command: { id: 'noop', title: '2 references' },
          },
        ],
        dispose: () => {},
      }
    },
  })
}
