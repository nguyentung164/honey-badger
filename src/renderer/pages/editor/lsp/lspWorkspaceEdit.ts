import type * as Monaco from 'monaco-editor'
import { fileUriToPath, joinRepoPath } from 'shared/fileUri'
import { type LspRange, lspRangeToMonaco } from '@/pages/editor/lsp/lspMonacoConvert'

type WorkspaceTextEdit = {
  range: LspRange
  newText: string
}

export type WorkspaceEditPayload = {
  changes?: Record<string, WorkspaceTextEdit[]>
  documentChanges?: Array<
    | { textDocument: { uri: string; version?: number | null }; edits: WorkspaceTextEdit[] }
    | { kind: 'create'; uri: string }
    | { kind: 'rename'; oldUri: string; newUri: string }
    | { kind: 'delete'; uri: string }
  >
}

function uriToRelativePath(repoCwd: string, uri: string): string {
  const abs = fileUriToPath(uri).replace(/\\/g, '/')
  const root = joinRepoPath(repoCwd, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const absLower = abs.toLowerCase()
  if (absLower.startsWith(`${root}/`)) {
    return abs.slice(root.length + 1)
  }
  return abs
}

function sortEditsDescending<T extends { range: LspRange }>(edits: T[]): T[] {
  return [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line
    return b.range.start.character - a.range.start.character
  })
}

function applyTextWorkspaceEdit(monaco: typeof Monaco, edit: WorkspaceEditPayload): boolean {
  let applied = false

  if (edit.changes) {
    for (const [uri, textEdits] of Object.entries(edit.changes)) {
      const model = monaco.editor.getModel(monaco.Uri.parse(uri))
      if (!model || textEdits.length === 0) continue
      const ops = sortEditsDescending(textEdits).map(te => ({ range: lspRangeToMonaco(te.range), text: te.newText }))
      model.pushEditOperations([], ops, () => null)
      applied = true
    }
  }

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if ('edits' in change && change.textDocument?.uri) {
        const model = monaco.editor.getModel(monaco.Uri.parse(change.textDocument.uri))
        if (!model || change.edits.length === 0) continue
        const ops = sortEditsDescending(change.edits).map(te => ({ range: lspRangeToMonaco(te.range), text: te.newText }))
        model.pushEditOperations([], ops, () => null)
        applied = true
      }
    }
  }

  return applied
}

async function applyFileWorkspaceChanges(repoCwd: string, edit: WorkspaceEditPayload): Promise<boolean> {
  if (!edit.documentChanges?.length) return false
  let applied = false

  for (const change of edit.documentChanges) {
    if ('kind' in change && change.kind === 'create') {
      const rel = uriToRelativePath(repoCwd, change.uri)
      const result = await window.api.system.write_file(rel, '', { cwd: repoCwd })
      if (result.success) applied = true
      continue
    }
    if ('kind' in change && change.kind === 'rename') {
      const from = uriToRelativePath(repoCwd, change.oldUri)
      const to = uriToRelativePath(repoCwd, change.newUri)
      const result = await window.api.system.rename_path({ from, to, cwd: repoCwd })
      if (result.success) applied = true
      continue
    }
    if ('kind' in change && change.kind === 'delete') {
      const rel = uriToRelativePath(repoCwd, change.uri)
      const result = await window.api.system.delete_path(rel, { cwd: repoCwd })
      if (result.success) applied = true
    }
  }

  return applied
}

export async function applyWorkspaceEditAsync(monaco: typeof Monaco, edit: WorkspaceEditPayload | null | undefined, repoCwd: string): Promise<boolean> {
  if (!edit) return false
  const fileApplied = await applyFileWorkspaceChanges(repoCwd, edit)
  const textApplied = applyTextWorkspaceEdit(monaco, edit)
  return fileApplied || textApplied
}

export function workspaceEditFromCodeAction(action: { edit?: WorkspaceEditPayload | null }): WorkspaceEditPayload | null {
  return action.edit ?? null
}

export function lspWorkspaceEditToMonaco(monaco: typeof Monaco, edit: WorkspaceEditPayload): Monaco.languages.WorkspaceEdit {
  const edits: Monaco.languages.IWorkspaceTextEdit[] = []

  if (edit.changes) {
    for (const [uri, textEdits] of Object.entries(edit.changes)) {
      for (const te of textEdits) {
        edits.push({
          resource: monaco.Uri.parse(uri),
          textEdit: { range: lspRangeToMonaco(te.range), text: te.newText },
          versionId: undefined,
        })
      }
    }
  }

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if ('edits' in change && change.textDocument?.uri) {
        for (const te of change.edits) {
          edits.push({
            resource: monaco.Uri.parse(change.textDocument.uri),
            textEdit: { range: lspRangeToMonaco(te.range), text: te.newText },
            versionId: undefined,
          })
        }
      }
    }
  }

  return { edits }
}
