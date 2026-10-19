export type OpenAIConnectionMode = 'api-key' | 'codex'

export const CODEX_MODELS = ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.6-luna'] as const

/** Only connection preferences cross IPC; Codex tokens stay in the main process. */
export interface OpenAIConnectionSettings {
  openaiConnectionMode: OpenAIConnectionMode
  openaiApiKey: string
  codexAuthPath: string
  codexModel: string
  openaiModel: string
  openaiReasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
}

export type OpenAIConnectionTestResult = { ok: true; model: string } | { ok: false; error: string }
