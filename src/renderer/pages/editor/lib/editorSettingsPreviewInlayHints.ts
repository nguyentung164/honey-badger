import type * as Monaco from 'monaco-editor'

type PreviewInlayHintRule = {
  test: (line: string) => boolean
  column: (line: string) => number | null
  label: string
}

const PREVIEW_INLAY_HINT_RULES: PreviewInlayHintRule[] = [
  {
    test: line => /^export function parseConfig\(input: string\)/.test(line),
    column: line => {
      const index = line.indexOf(')')
      return index >= 0 ? index + 2 : null
    },
    label: ': { ok: true; value: string } | { ok: false }',
  },
  {
    test: line => /\bconst tokens =/.test(line),
    column: line => columnAfterIdentifier(line, 'tokens'),
    label: ': string[]',
  },
  {
    test: line => /\bconst pairs =/.test(line),
    column: line => columnAfterIdentifier(line, 'pairs'),
    label: ': [string, string][]',
  },
  {
    test: line => /\bconst appId =/.test(line),
    column: line => columnAfterIdentifier(line, 'appId'),
    label: ': string',
  },
  {
    test: line => /\bconst unusedPreview =/.test(line),
    column: line => columnAfterIdentifier(line, 'unusedPreview'),
    label: ': number',
  },
]

function columnAfterIdentifier(line: string, identifier: string): number | null {
  const index = line.indexOf(identifier)
  if (index < 0) return null
  return index + identifier.length + 1
}

export function buildEditorSettingsPreviewInlayHints(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  range: Monaco.IRange
): Monaco.languages.InlayHint[] {
  const hints: Monaco.languages.InlayHint[] = []
  for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
    const line = model.getLineContent(lineNumber)
    for (const rule of PREVIEW_INLAY_HINT_RULES) {
      if (!rule.test(line)) continue
      const column = rule.column(line)
      if (!column) continue
      hints.push({
        position: { lineNumber, column },
        label: rule.label,
        kind: monaco.languages.InlayHintKind.Type,
        paddingLeft: true,
      })
    }
  }
  return hints
}
