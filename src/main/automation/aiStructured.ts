import Anthropic from '@anthropic-ai/sdk'
import type { ImageBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'
import { GoogleGenAI } from '@google/genai'
import l from 'electron-log'
import OpenAI from 'openai'
import { estimateCostUsd, type NormalizedUsage } from '../ai/aiPricing'
import type { ApiProvider } from '../store/ConfigurationStore'
import configurationStore from '../store/ConfigurationStore'
import { appendAiUsageEvent } from '../task/aiUsageDb'

/** Ảnh kèm prompt (multimodal). `mimeType`: ví dụ image/png; `base64` không kèm prefix data:. */
export interface StructuredImagePart {
  mimeType: string
  base64: string
}

interface StructuredCall {
  prompt: string
  schema: Record<string, unknown>
  schemaName: string
  feature: string
  maxTokens?: number
  /** Khi có, gửi kèm text prompt tới các model vision. */
  images?: StructuredImagePart[]
}

interface StructuredResult<T> {
  data: T
  raw: string
  provider: ApiProvider
  model: string
}

/**
 * Google GenAI hỗ trợ JSON schema một phần. Loại bỏ `additionalProperties`
 * (chưa hỗ trợ) và đệ quy chuẩn hoá enum/required.
 */
function sanitizeForGoogle(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties') continue
    if (k === '$schema') continue
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeForGoogle(v as Record<string, unknown>)
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        item && typeof item === 'object' ? sanitizeForGoogle(item as Record<string, unknown>) : item
      )
    } else {
      out[k] = v
    }
  }
  return out
}

function pickProvider(): ApiProvider {
  const { activeApiProvider, openaiApiKey, claudeApiKey, googleApiKey } = configurationStore.store
  switch (activeApiProvider) {
    case 'claude':
      if (claudeApiKey) return 'claude'
      break
    case 'google':
      if (googleApiKey) return 'google'
      break
    default:
      if (openaiApiKey) return 'openai'
      break
  }
  if (openaiApiKey) return 'openai'
  if (claudeApiKey) return 'claude'
  if (googleApiKey) return 'google'
  throw new Error('No AI provider API key is configured.')
}

async function recordUsage(
  feature: string,
  provider: ApiProvider,
  model: string,
  usage: NormalizedUsage | null
): Promise<void> {
  if (!usage) {
    await appendAiUsageEvent({
      feature,
      provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costUsd: null,
      pricingKnown: false,
    })
    return
  }
  const { usd, knownModel } = estimateCostUsd(provider, model, usage)
  await appendAiUsageEvent({
    feature,
    provider,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    costUsd: usd,
    pricingKnown: knownModel,
  })
}

async function callOpenAIStructured<T>(req: StructuredCall): Promise<StructuredResult<T>> {
  const { openaiApiKey, openaiModel, openaiReasoningEffort } = configurationStore.store
  if (!openaiApiKey) throw new Error('OpenAI API key is not configured.')
  const openai = new OpenAI({ apiKey: openaiApiKey })
  const model = openaiModel?.trim() || 'gpt-5.4'
  const inputParam: Parameters<typeof openai.responses.create>[0]['input'] =
    req.images?.length ?
      [
        {
          role: 'user',
          type: 'message',
          content: [
            { type: 'input_text', text: req.prompt },
            ...req.images.map(img => ({
              type: 'input_image' as const,
              detail: 'auto' as const,
              image_url: `data:${img.mimeType};base64,${img.base64}`,
            })),
          ],
        },
      ]
    : (req.prompt as Parameters<typeof openai.responses.create>[0]['input'])
  const response = await openai.responses.create({
    model,
    input: inputParam,
    reasoning: { effort: openaiReasoningEffort ?? 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: req.schemaName,
        strict: true,
        schema: req.schema,
      },
    },
  } as unknown as Parameters<typeof openai.responses.create>[0])
  const raw = (response as unknown as { output_text?: string }).output_text ?? ''
  let usage: NormalizedUsage | null = null
  const u = (response as unknown as {
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
  }).usage
  if (u && typeof u.input_tokens === 'number') {
    usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
    }
  }
  await recordUsage(req.feature, 'openai', model, usage)
  const data = JSON.parse(raw) as T
  return { data, raw, provider: 'openai', model }
}

async function callClaudeStructured<T>(req: StructuredCall): Promise<StructuredResult<T>> {
  const { claudeApiKey } = configurationStore.store
  if (!claudeApiKey) throw new Error('Claude API key is not configured.')
  const anthropic = new Anthropic({ apiKey: claudeApiKey })
  const model = 'claude-sonnet-4-6'
  const toolName = req.schemaName
  const imageBlocks: ImageBlockParam[] = (req.images ?? []).map(img => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: img.base64,
    },
  }))
  const textBlock: TextBlockParam = { type: 'text', text: req.prompt }
  const userContent: string | Array<ImageBlockParam | TextBlockParam> =
    imageBlocks.length > 0 ? [...imageBlocks, textBlock] : req.prompt

  const message = await anthropic.messages.create({
    max_tokens: req.maxTokens ?? 8192,
    model,
    messages: [{ role: 'user', content: userContent }],
    tools: [
      {
        name: toolName,
        description: `Emit structured ${toolName} payload.`,
        input_schema: req.schema as unknown as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
  })
  let payload: unknown = null
  for (const block of message.content) {
    if (block.type === 'tool_use') {
      payload = (block as { input: unknown }).input
      break
    }
  }
  if (payload == null) {
    throw new Error('Claude did not return a tool_use payload.')
  }
  let usage: NormalizedUsage | null = null
  const mu = message.usage as { input_tokens?: number; output_tokens?: number } | undefined
  if (mu && typeof mu.input_tokens === 'number') {
    usage = { inputTokens: mu.input_tokens, outputTokens: mu.output_tokens ?? 0, cachedInputTokens: 0 }
  }
  await recordUsage(req.feature, 'claude', model, usage)
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return { data: payload as T, raw, provider: 'claude', model }
}

async function callGoogleStructured<T>(req: StructuredCall): Promise<StructuredResult<T>> {
  const { googleApiKey } = configurationStore.store
  if (!googleApiKey) throw new Error('Google API key is not configured.')
  const ai = new GoogleGenAI({ apiKey: googleApiKey })
  const model = 'gemini-3-flash-preview'
  const sanitized = sanitizeForGoogle(req.schema)
  const contents =
    req.images?.length ?
      {
        role: 'user',
        parts: [
          { text: req.prompt },
          ...req.images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
        ],
      }
    : req.prompt

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: sanitized as unknown as Parameters<typeof ai.models.generateContent>[0]['config'] extends infer C
        ? C extends { responseSchema?: infer S }
          ? S
          : unknown
        : unknown,
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
    },
  })
  const raw = response.text ?? ''
  let usage: NormalizedUsage | null = null
  const meta = (response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
    ?.usageMetadata
  if (meta && typeof meta.promptTokenCount === 'number') {
    usage = {
      inputTokens: meta.promptTokenCount,
      outputTokens: meta.candidatesTokenCount ?? 0,
      cachedInputTokens: 0,
    }
  }
  await recordUsage(req.feature, 'google', model, usage)
  const data = JSON.parse(raw) as T
  return { data, raw, provider: 'google', model }
}

/**
 * Gọi LLM với schema cố định và trả về object đã parse. Helper tự chọn provider
 * theo `configurationStore.activeApiProvider`. Hỗ trợ override để feature riêng
 * có thể chốt một provider.
 */
export async function callStructuredJSON<T>(
  req: StructuredCall & { providerOverride?: ApiProvider }
): Promise<StructuredResult<T>> {
  const provider = req.providerOverride ?? pickProvider()
  l.info(`[automation] structured AI call provider=${provider} feature=${req.feature} schema=${req.schemaName}`)
  switch (provider) {
    case 'openai':
      return callOpenAIStructured<T>(req)
    case 'claude':
      return callClaudeStructured<T>(req)
    case 'google':
      return callGoogleStructured<T>(req)
    default:
      return callOpenAIStructured<T>(req)
  }
}
