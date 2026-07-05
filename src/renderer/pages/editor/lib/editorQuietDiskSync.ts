import { resolveMonacoLanguageId } from '@/lib/monacoLanguage'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { emitTextModelReady } from '@/pages/editor/lib/editorModelLifecycle'
import { commitModelBaseline, setModelBaselineVersion } from '@/pages/editor/lib/editorTextModels'
import {
  bindEditorModelRegistry,
  getExistingModel,
  getModelAlternativeVersionId,
} from '@/pages/editor/lib/editorModelRegistry'

export type QuietDiskApplyResult = 'unchanged' | 'updated' | 'no-model'

/**
 * VS Code TextFileEditorModel.updateContentFromDisk — mutate ITextModel only.
 * No React/Zustand, no loadGeneration bump, no editor widget remount.
 */
export async function applyDiskContentQuiet(
  repoCwd: string,
  relativePath: string,
  content: string,
  languageId: string
): Promise<QuietDiskApplyResult> {
  const monaco = await import('monaco-editor')
  bindEditorModelRegistry(monaco)

  const model = getExistingModel(monaco, repoCwd, relativePath)
  if (!model) return 'no-model'

  const normalized = content.replace(/\r\n/g, '\n')
  if (model.getValue() === normalized) return 'unchanged'

  const bridge = editorCommandBridge.get()
  const editor = bridge?.getMonacoEditor?.() ?? null
  const isActiveModel = editor?.getModel()?.uri.toString() === model.uri.toString()
  const position = isActiveModel ? editor?.getPosition() : null
  const scrollTop = isActiveModel ? editor?.getScrollTop() : null

  model.pushEditOperations(
    [],
    [{ range: model.getFullModelRange(), text: normalized }],
    () => null
  )

  const resolvedLanguage = resolveMonacoLanguageId(languageId, relativePath)
  if (model.getLanguageId() !== resolvedLanguage) {
    monaco.editor.setModelLanguage(model, resolvedLanguage)
  }

  const versionId = model.getAlternativeVersionId()
  setModelBaselineVersion(repoCwd, relativePath, versionId)

  if (isActiveModel && editor && position) {
    const line = Math.min(position.lineNumber, model.getLineCount())
    const column = Math.min(position.column, model.getLineMaxColumn(line))
    editor.setPosition({ lineNumber: line, column })
    if (scrollTop != null) editor.setScrollTop(scrollTop)
  }

  emitTextModelReady({
    repoCwd,
    relativePath,
    content: normalized,
    languageId: resolvedLanguage,
    reason: 'disk-reload',
  })

  return 'updated'
}

export async function syncOpenFileFromDiskQuiet(
  repoCwd: string,
  relativePath: string,
  languageId: string,
  preloadedContent?: string
): Promise<QuietDiskApplyResult | 'read-failed'> {
  const normalized = relativePath.replace(/\\/g, '/')
  try {
    const raw = preloadedContent ?? (await window.api.system.read_file(normalized, { cwd: repoCwd }))
    const meta = await window.api.system.detect_file_kind(normalized, { cwd: repoCwd })
    const result = await applyDiskContentQuiet(repoCwd, normalized, raw, languageId)
    if (result === 'unchanged' || result === 'updated') {
      const versionId = getModelAlternativeVersionId(repoCwd, normalized)
      commitModelBaseline(
        repoCwd,
        normalized,
        raw.replace(/\r\n/g, '\n'),
        versionId ?? undefined,
        meta.mtimeMs ?? null
      )
    }
    return result
  } catch {
    return 'read-failed'
  }
}
