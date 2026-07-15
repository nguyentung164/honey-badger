import type * as Monaco from 'monaco-editor'

type TsDefaults = {
  modeConfiguration?: Record<string, boolean>
  setDiagnosticsOptions: (options: {
    noSemanticValidation?: boolean
    noSyntaxValidation?: boolean
    noSuggestionDiagnostics?: boolean
  }) => void
  setModeConfiguration: (config: Record<string, boolean>) => void
}

type MonacoWithTypeScript = typeof Monaco & {
  typescript?: {
    typescriptDefaults: TsDefaults
    javascriptDefaults: TsDefaults
  }
}

/** Monaco TS worker features we turn off — LSP/tsserver owns these in the Editor tab. */
const MONACO_TS_LSP_ONLY_MODE_CONFIGURATION = {
  completionItems: false,
  hovers: false,
  documentSymbols: false,
  definitions: false,
  references: false,
  documentHighlights: false,
  rename: false,
  diagnostics: false,
  documentRangeFormattingEdits: false,
  signatureHelp: false,
  onTypeFormattingEdits: false,
  codeActions: false,
  inlayHints: false,
} as const

/**
 * Monaco ships its own TypeScript worker without the workspace tsconfig `paths`.
 * VS Code uses only tsserver via LSP — disable Monaco worker features to avoid false errors
 * like "Cannot find module '@/…'" while LSP/tsserver provides the real diagnostics.
 *
 * Must run before the first typescript/javascript model is created (see onAppMonacoBeforeMount).
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

  const disableWorkerFeatures = (defaults: TsDefaults) => {
    defaults.setModeConfiguration(MONACO_TS_LSP_ONLY_MODE_CONFIGURATION)
  }
  disableWorkerFeatures(ts.typescriptDefaults)
  disableWorkerFeatures(ts.javascriptDefaults)

  for (const model of monaco.editor.getModels()) {
    monaco.editor.setModelMarkers(model, 'typescript', [])
  }
}
