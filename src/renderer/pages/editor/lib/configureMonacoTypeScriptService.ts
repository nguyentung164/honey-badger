import type * as Monaco from 'monaco-editor'

type TsDefaults = {
  setDiagnosticsOptions: (options: {
    noSemanticValidation?: boolean
    noSyntaxValidation?: boolean
    noSuggestionDiagnostics?: boolean
  }) => void
}

type MonacoWithTypeScript = typeof Monaco & {
  typescript?: {
    typescriptDefaults: TsDefaults
    javascriptDefaults: TsDefaults
  }
}

/**
 * Monaco ships its own TypeScript worker (CDN) without the workspace tsconfig `paths`.
 * VS Code uses only tsserver via LSP — disable Monaco validation to avoid false errors
 * like "Cannot find module '@/…'" when aliases are defined in tsconfig.json.
 */
export function disableMonacoTypeScriptValidation(monaco: typeof Monaco): void {
  const root = monaco as MonacoWithTypeScript
  const legacy = (monaco.languages as unknown as MonacoWithTypeScript).typescript
  const ts = root.typescript ?? legacy
  if (!ts) return

  const diagnostics = {
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  }
  ts.typescriptDefaults.setDiagnosticsOptions(diagnostics)
  ts.javascriptDefaults.setDiagnosticsOptions(diagnostics)

  for (const model of monaco.editor.getModels()) {
    monaco.editor.setModelMarkers(model, 'typescript', [])
  }
}
