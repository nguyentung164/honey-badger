import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import type { AiFeatureId } from 'main/constants'
import OpenAI from 'openai'
import { estimateCostUsd, type NormalizedUsage } from '../ai/aiPricing'
import configurationStore from '../store/ConfigurationStore'
import type { ApiProvider } from '../store/ConfigurationStore'
import { appendAiUsageEvent } from '../task/aiUsageDb'
import { getTokenFromStore } from '../task/auth'
import { getCodingRuleContentByIdOrName } from '../task/mysqlTaskStore'
import { verifyToken } from '../task/auth'

type AiCallSuccess = {
  text: string
  usage: NormalizedUsage | null
  model: string
  provider: ApiProvider
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  modelArg?: string,
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
): Promise<AiCallSuccess> {
  const openai = new OpenAI({ apiKey })
  const model = modelArg?.trim() || 'gpt-5.4'
  const response = await openai.responses.create({
    model,
    input: prompt,
    reasoning: {
      effort: reasoningEffort ?? 'low',
    },
  })
  let usage: NormalizedUsage | null = null
  const u = response.usage as
    | {
        input_tokens?: number
        output_tokens?: number
        input_tokens_details?: { cached_tokens?: number }
      }
    | undefined
  if (u && typeof u.input_tokens === 'number') {
    usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
    }
  }
  return { text: response.output_text ?? '', usage, model, provider: 'openai' }
}

async function callClaude(prompt: string, apiKey: string, maxTokens?: number): Promise<AiCallSuccess> {
  const model = 'claude-sonnet-4-6'
  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    max_tokens: maxTokens ?? 4096,
    model,
    messages: [{ role: 'user', content: prompt }],
  })
  let text = ''
  for (const block of message.content) {
    if (block.type === 'text') {
      text = block.text ?? ''
      break
    }
  }
  let usage: NormalizedUsage | null = null
  const mu = message.usage as { input_tokens?: number; output_tokens?: number } | undefined
  if (mu && typeof mu.input_tokens === 'number') {
    usage = { inputTokens: mu.input_tokens, outputTokens: mu.output_tokens ?? 0, cachedInputTokens: 0 }
  }
  return { text, usage, model, provider: 'claude' }
}

async function callGoogle(prompt: string, apiKey: string, maxTokens?: number): Promise<AiCallSuccess> {
  const model = 'gemini-3-flash-preview'
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: maxTokens ? { maxOutputTokens: maxTokens } : undefined,
  })
  const text = response.text ?? ''
  let usage: NormalizedUsage | null = null
  const meta = (response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })?.usageMetadata
  if (meta && typeof meta.promptTokenCount === 'number') {
    usage = {
      inputTokens: meta.promptTokenCount,
      outputTokens: meta.candidatesTokenCount ?? 0,
      cachedInputTokens: 0,
    }
  }
  return { text, usage, model, provider: 'google' }
}

async function recordUsage(feature: AiFeatureId | string, result: AiCallSuccess): Promise<void> {
  if (!result.usage) {
    await appendAiUsageEvent({
      feature: String(feature),
      provider: result.provider,
      model: result.model,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costUsd: null,
      pricingKnown: false,
    })
    return
  }
  const { usd, knownModel } = estimateCostUsd(result.provider, result.model, result.usage)
  await appendAiUsageEvent({
    feature: String(feature),
    provider: result.provider,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedInputTokens: result.usage.cachedInputTokens ?? 0,
    costUsd: usd,
    pricingKnown: knownModel,
  })
}

export function registerOpenAiIpcHandlers() {
  l.info('🔄 Registering AI IPC Handlers (OpenAI, Claude, Google)...')
  ipcMain.handle(
    IPC.OPENAI.SEND_MESSAGE,
    async (
      _event,
      {
        prompt,
        codingRuleId,
        codingRuleName,
        maxTokens,
        feature,
      }: {
        prompt: string
        codingRuleId?: string
        codingRuleName?: string
        maxTokens?: number
        feature?: AiFeatureId | string
      }
    ) => {
      const featureTag = feature ?? 'UNKNOWN'
      try {
        let finalPrompt = prompt
        const idOrName = codingRuleId || codingRuleName || ''
        l.info(`Fetching coding rule: ${idOrName || '(none)'}`)
        if (idOrName) {
          const { sourceFolder } = configurationStore.store
          const token = getTokenFromStore()
          const session = token ? verifyToken(token) : null
          const content = await getCodingRuleContentByIdOrName(idOrName, {
            sourceFolderPath: sourceFolder || undefined,
            userId: session?.userId,
          })
          const rulesContent = content ?? 'No specific coding rules provided.'
          finalPrompt = prompt.replace('{coding_rules}', rulesContent)
        } else {
          finalPrompt = prompt.replace('{coding_rules}', 'No specific coding rules provided.')
        }

        const { openaiApiKey, claudeApiKey, googleApiKey, activeApiProvider, openaiModel, openaiReasoningEffort } =
          configurationStore.store

        const getApiKeyAndCall = (): Promise<AiCallSuccess | string> => {
          switch (activeApiProvider) {
            case 'openai':
              if (!openaiApiKey) {
                return Promise.resolve('Error: OpenAI API key is not configured.')
              }
              l.info('Sending message to OpenAI...')
              return callOpenAI(finalPrompt, openaiApiKey, openaiModel, openaiReasoningEffort)
            case 'claude':
              if (!claudeApiKey) {
                return Promise.resolve('Error: Claude API key is not configured.')
              }
              l.info('Sending message to Claude...')
              return callClaude(finalPrompt, claudeApiKey, maxTokens)
            case 'google':
              if (!googleApiKey) {
                return Promise.resolve('Error: Google AI API key is not configured.')
              }
              l.info('Sending message to Google AI...')
              return callGoogle(finalPrompt, googleApiKey, maxTokens)
            default:
              if (!openaiApiKey) {
                return Promise.resolve('Error: OpenAI API key is not configured.')
              }
              return callOpenAI(finalPrompt, openaiApiKey, openaiModel, openaiReasoningEffort)
          }
        }

        const result = await getApiKeyAndCall()
        if (typeof result === 'string') {
          return result
        }
        l.info(`Received response from ${activeApiProvider}.`)
        await recordUsage(featureTag, result)
        return result.text
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An unknown error occurred'
        l.error(`Error generating message with ${configurationStore.store.activeApiProvider}:`, err)
        return `Error generating message: ${msg}`
      }
    }
  )

  l.info('✅ AI IPC Handlers Registered')
}
