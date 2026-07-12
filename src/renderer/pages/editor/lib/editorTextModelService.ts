import type * as Monaco from 'monaco-editor'
import { getEditorLanguage } from '@/lib/monacoLanguage'
import { canonicalizeFileUri, fileUriToPath } from 'shared/fileUri'
import {
  ensureTextModel,
  isModelInRegistry,
  isModelOpenInTabs,
} from '@/pages/editor/lib/editorModelRegistry'
import { relativePathFromDocumentUri } from '@/pages/editor/lib/resolveTypeScriptModule'

type ModelReference = {
  object: { textEditorModel: Monaco.editor.ITextModel }
  dispose: () => void
}

const previewRefCounts = new Map<string, number>()

function modelRefKey(uriString: string): string {
  return canonicalizeFileUri(uriString)
}

function retainPreviewModel(uriString: string, model: Monaco.editor.ITextModel): ModelReference {
  const key = modelRefKey(uriString)
  previewRefCounts.set(key, (previewRefCounts.get(key) ?? 0) + 1)
  return {
    object: { textEditorModel: model },
    dispose() {
      const count = previewRefCounts.get(key) ?? 0
      if (count <= 1) {
        previewRefCounts.delete(key)
        if (!model.isDisposed() && !isModelOpenInTabs(model) && !isModelInRegistry(model)) {
          model.dispose()
        }
      } else {
        previewRefCounts.set(key, count - 1)
      }
    },
  }
}

function sharedModelRef(model: Monaco.editor.ITextModel): ModelReference {
  return {
    object: { textEditorModel: model },
    dispose() {
      /* Shared editor / registry models — refcount handled elsewhere */
    },
  }
}

/** Monaco standalone textModelService override: load models for peek/hover on unopened files. */
export function createEditorTextModelService(monaco: typeof Monaco, getRepoCwd: () => string) {
  return {
    createModelReference(resource: Monaco.Uri): Promise<ModelReference> {
      const uriString = canonicalizeFileUri(resource.toString())
      const uri = monaco.Uri.parse(uriString)
      const existing = monaco.editor.getModel(uri)
      if (existing) return Promise.resolve(sharedModelRef(existing))

      return (async () => {
        const repoCwd = getRepoCwd()
        const rel = repoCwd ? relativePathFromDocumentUri(uriString, repoCwd) : null
        const absPath = fileUriToPath(uriString)

        let content: string
        if (rel && repoCwd) {
          content = await window.api.system.read_file(rel, { cwd: repoCwd })
          const languageId = getEditorLanguage(rel)
          const model = ensureTextModel(monaco, repoCwd, rel, content.replace(/\r\n/g, '\n'), languageId, 0)
          return sharedModelRef(model)
        }

        const normalized = absPath.replace(/\\/g, '/')
        const slash = normalized.lastIndexOf('/')
        const parent = slash >= 0 ? normalized.slice(0, slash) : repoCwd
        const baseName = slash >= 0 ? normalized.slice(slash + 1) : normalized
        content = await window.api.system.read_file(baseName, { cwd: parent || repoCwd })

        const languageId = getEditorLanguage(absPath)
        let previewModel = monaco.editor.getModel(uri)
        if (!previewModel) {
          previewModel = monaco.editor.createModel(content.replace(/\r\n/g, '\n'), languageId, uri)
        }
        return retainPreviewModel(uriString, previewModel)
      })()
    },
  }
}
