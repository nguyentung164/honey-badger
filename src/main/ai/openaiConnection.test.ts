import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenAIConnectionSettings } from '../../shared/openaiConnection'
import { createOpenAIResponse, isOpenAIConfigured } from './openaiConnection'

const output = [{ type: 'message', id: 'msg-1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }]
const completed = { id: 'response-1', object: 'response', status: 'completed', model: 'test-model', output, usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } }
const sse = (...events: object[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

describe('OpenAI connection transport', () => {
  let directory: string
  let settings: OpenAIConnectionSettings
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'honey-badger-responses-'))
    const path = join(directory, 'auth.json')
    await writeFile(path, JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'codex-secret', account_id: 'account-1' } }))
    settings = { openaiConnectionMode: 'codex', codexAuthPath: path, codexModel: 'gpt-6-luna', openaiApiKey: '', openaiModel: 'test-model', openaiReasoningEffort: 'low' }
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(directory, { recursive: true, force: true })
  })

  it.each(['gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.6-luna'])('routes the selected model %s to Codex, normalizes input, and collects final text and usage', async model => {
    settings.codexModel = ` ${model} `
    fetchMock.mockResolvedValue(sse({ type: 'response.completed', response: completed }))
    const result = await createOpenAIResponse({ model: 'test-model', input: 'Hello', max_output_tokens: 10, temperature: 1 }, settings)
    expect(result).toMatchObject({ output_text: 'OK', usage: { input_tokens: 3 } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer codex-secret')
    expect(new Headers(init?.headers).get('chatgpt-account-id')).toBe('account-1')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model, stream: true, store: false, instructions: expect.any(String), input: [{ role: 'user', content: [{ type: 'input_text', text: 'Hello' }] }] })
    expect(body).not.toHaveProperty('max_output_tokens')
    expect(body).not.toHaveProperty('temperature')
  })

  it('preserves multimodal input and JSON schema for automation', async () => {
    fetchMock.mockResolvedValue(sse({ type: 'response.completed', response: completed }))
    const input = [
      {
        role: 'user' as const,
        content: [
          { type: 'input_text' as const, text: 'Describe' },
          { type: 'input_image' as const, image_url: 'data:image/png;base64,aGVsbG8=', detail: 'auto' as const },
        ],
      },
    ]
    const text = { format: { type: 'json_schema' as const, name: 'result', strict: true, schema: { type: 'object', properties: {} } } }
    await createOpenAIResponse({ model: 'test-model', input, text }, settings)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.input).toEqual(input)
    expect(body.text).toEqual(text)
  })

  it.each(['response.failed', 'response.incomplete'])('rejects %s instead of reporting success', async type => {
    fetchMock.mockResolvedValue(sse({ type, response: { ...completed, status: type.split('.')[1], error: { message: 'generation failed' } } }))
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)).rejects.toThrow('generation failed')
  })

  it('rejects a stream ending without a completed response', async () => {
    fetchMock.mockResolvedValue(sse({ type: 'response.output_text.delta', delta: 'partial' }))
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)).rejects.toThrow('bị ngắt')
  })

  it('rejects empty output', async () => {
    fetchMock.mockResolvedValue(sse({ type: 'response.completed', response: { ...completed, output: [] } }))
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)).rejects.toThrow('nội dung văn bản')
  })

  it('aborts a stalled stream when the connection deadline expires', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation(async (_url, init) => {
      signal = init?.signal as AbortSignal
      const body = new ReadableStream({
        start(controller) {
          signal?.addEventListener('abort', () => controller.error(signal?.reason), { once: true })
        },
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings, 200)).rejects.toThrow()
    expect(signal?.aborted).toBe(true)
  })

  it('reports HTTP authentication failure without retrying a Codex request', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Please log in again' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)).rejects.toThrow('Please log in again')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps API-key traffic on the public Responses API', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(completed), { headers: { 'content-type': 'application/json' } }))
    settings.openaiConnectionMode = 'api-key'
    settings.openaiApiKey = 'api-key-secret'
    const result = await createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)
    expect(result.output_text).toBe('OK')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.openai.com/v1/responses')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer api-key-secret')
    expect(new Headers(init?.headers).has('chatgpt-account-id')).toBe(false)
  })

  it.each(['', '   '])('requires an explicitly selected Codex model (%j) without falling back to CLI or API-key settings', async codexModel => {
    settings.codexModel = codexModel
    await writeFile(join(directory, 'config.toml'), 'model = "cli-model"\n')
    await expect(createOpenAIResponse({ model: 'api-key-model', input: 'Hello' }, settings)).rejects.toThrow('Hãy chọn model Codex')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['gpt-6-astra', 'unknown-model'])('rejects models outside the permitted list (%s) before making a request', async model => {
    settings.codexModel = model
    await expect(createOpenAIResponse({ model: 'api-key-model', input: 'Hello' }, settings)).rejects.toThrow('Hãy chọn lại model')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows Codex detail errors, including unsupported models', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'The selected model is not supported.' }), { status: 400 }))
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)).rejects.toThrow('The selected model is not supported.')
  })

  it('allows Codex without an API key, while API-key mode requires one', async () => {
    expect(isOpenAIConfigured(settings)).toBe(true)
    settings.openaiConnectionMode = 'api-key'
    expect(isOpenAIConfigured(settings)).toBe(false)
    await expect(createOpenAIResponse({ model: 'test-model', input: 'Hello' }, settings)).rejects.toThrow('API key')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
