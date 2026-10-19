import type * as Monaco from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { lspWorkspaceEditToMonaco, type WorkspaceEditPayload } from './lspWorkspaceEdit'

describe('LSP rename workspace edits', () => {
  it('converts both response formats to Monaco edits with one-based positions', () => {
    const parseUri = vi.fn((uri: string) => ({ uri }))
    const monaco = { Uri: { parse: parseUri } } as unknown as typeof Monaco
    const edit = { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 6 } }, newText: 'newName' }
    const payloads: WorkspaceEditPayload[] = [
      { changes: { 'file:///repo/a.ts': [edit] } },
      { documentChanges: [{ textDocument: { uri: 'file:///repo/a.ts', version: 1 }, edits: [edit] }] },
    ]

    for (const payload of payloads) {
      expect(lspWorkspaceEditToMonaco(monaco, payload)).toEqual({
        edits: [
          {
            resource: { uri: 'file:///repo/a.ts' },
            textEdit: { range: { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 7 }, text: 'newName' },
            versionId: undefined,
          },
        ],
      })
    }
    expect(parseUri).toHaveBeenCalledTimes(2)
  })

  it('keeps text edits when documentChanges also contains file operations', () => {
    const monaco = { Uri: { parse: (uri: string) => ({ uri }) } } as unknown as typeof Monaco
    const result = lspWorkspaceEditToMonaco(monaco, {
      documentChanges: [
        { kind: 'create', uri: 'file:///repo/new.ts' },
        { kind: 'rename', oldUri: 'file:///repo/old.ts', newUri: 'file:///repo/renamed.ts' },
        { kind: 'delete', uri: 'file:///repo/removed.ts' },
        { textDocument: { uri: 'file:///repo/a.ts' }, edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, newText: 'b' }] },
      ],
    })
    expect(result.edits).toHaveLength(1)
    expect(result.edits[0]).toMatchObject({ resource: { uri: 'file:///repo/a.ts' }, textEdit: { text: 'b' } })
  })
})
