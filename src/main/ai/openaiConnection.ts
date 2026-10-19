import OpenAI from 'openai'
import type { Response, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import { CODEX_MODELS, type OpenAIConnectionSettings } from '../../shared/openaiConnection'
import { getCodexCredentials } from './codexAuth'

export function isOpenAIConfigured(settings: Pick<OpenAIConnectionSettings, 'openaiConnectionMode' | 'openaiApiKey'>): boolean {
  return settings.openaiConnectionMode === 'codex' || Boolean(settings.openaiApiKey?.trim())
}

/** In-process Responses proxy: no local server or credentials in the renderer. */
export async function createOpenAIResponse(params: ResponseCreateParamsNonStreaming, settings: OpenAIConnectionSettings, timeout = 10 * 60_000): Promise<Response> {
  const signal = AbortSignal.timeout(timeout)
  if (settings.openaiConnectionMode !== 'codex') {
    if (!settings.openaiApiKey?.trim()) throw new Error('OpenAI API key is not configured.')
    return new OpenAI({ apiKey: settings.openaiApiKey }).responses.create(params, { timeout, signal })
  }
  const model = settings.codexModel?.trim()
  if (!model) throw new Error('Hãy chọn model Codex trong Settings trước khi kết nối.')
  if (!CODEX_MODELS.some(allowedModel => allowedModel === model)) throw new Error('Model Codex không nằm trong danh sách cho phép. Hãy chọn lại model trong Settings.')
  const { token, accountId } = await getCodexCredentials(settings.codexAuthPath || '')
  const client = new OpenAI({
    apiKey: token,
    baseURL: 'https://chatgpt.com/backend-api/codex',
    defaultHeaders: accountId ? { 'chatgpt-account-id': accountId } : {},
    maxRetries: 0,
    fetch: async (url, init) => {
      const response = await fetch(url, { ...init, redirect: 'error' })
      if (response.ok) return response
      // Codex reports some errors as { detail }, which the SDK otherwise hides.
      const body = await response.json().catch(() => null) as { detail?: string; error?: { message?: string } } | null
      const message = body?.error?.message || (typeof body?.detail === 'string' ? body.detail : `Codex HTTP ${response.status}. Kiểm tra phiên đăng nhập và model.`)
      return new globalThis.Response(JSON.stringify({ error: { message } }), { status: response.status, headers: { 'content-type': 'application/json' } })
    },
  })
  // Codex requires streaming, no server-side storage, and an array input.
  const stream = await client.responses.create(
    {
      model,
      input: typeof params.input === 'string' ? [{ role: 'user', content: [{ type: 'input_text', text: params.input }] }] : params.input,
      instructions: params.instructions || 'You are a helpful assistant.',
      reasoning: params.reasoning,
      text: params.text,
      store: false,
      stream: true,
    },
    { timeout, signal }
  )
  try {
    for await (const event of stream) {
      if (event.type === 'response.failed' || event.type === 'response.incomplete') {
        throw new Error(event.response.error?.message || `Codex response ${event.response.status}. Hãy thử lại.`)
      }
      if (event.type === 'error') throw new Error(event.message || 'Codex trả về lỗi khi xử lý yêu cầu.')
      if (event.type === 'response.completed') {
        const response = event.response
        if (response.status !== 'completed' || response.error) throw new Error(response.error?.message || 'Codex chưa hoàn thành yêu cầu.')
        const text = response.output.flatMap(item => (item.type === 'message' ? item.content.filter(part => part.type === 'output_text').map(part => part.text) : [])).join('')
        if (!text.trim()) throw new Error('Codex hoàn thành nhưng không trả về nội dung văn bản.')
        return { ...response, output_text: text }
      }
    }
    throw new Error('Kết nối Codex bị ngắt trước khi hoàn thành phản hồi.')
  } finally {
    stream.controller.abort()
  }
}
