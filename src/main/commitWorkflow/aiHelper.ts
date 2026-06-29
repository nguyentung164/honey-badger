import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import l from 'electron-log'
import OpenAI from 'openai'
import { PROMPT } from 'main/constants'
import { estimateCostUsd, type NormalizedUsage } from '../ai/aiPricing'
import type { ApiProvider } from '../store/ConfigurationStore'
import configurationStore from '../store/ConfigurationStore'
import { appendAiUsageEvent } from '../task/aiUsageDb'
import { getCodingRuleContentByIdOrName } from '../task/stores/pgTaskStore'

type AiCallSuccess = {
  text: string
  usage: NormalizedUsage | null
  model: string
  provider: ApiProvider
}

async function callOpenAI(prompt: string, apiKey: string, modelArg?: string): Promise<AiCallSuccess> {
  const openai = new OpenAI({ apiKey })
  const model = modelArg?.trim() || 'gpt-5.4'
  const response = await openai.responses.create({
    model,
    input: prompt,
    reasoning: { effort: configurationStore.store.openaiReasoningEffort ?? 'low' },
  })
  let usage: NormalizedUsage | null = null
  const u = response.usage as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | undefined
  if (u && typeof u.input_tokens === 'number') {
    usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
    }
  }
  return { text: response.output_text ?? '', usage, model, provider: 'openai' }
}

async function callClaude(prompt: string, apiKey: string): Promise<AiCallSuccess> {
  const model = 'claude-sonnet-4-6'
  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    max_tokens: 4096,
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
  const mu = message.usage as { input_tokens?: number; output_tokens?: number } | undefined
  const usage =
    mu && typeof mu.input_tokens === 'number'
      ? { inputTokens: mu.input_tokens, outputTokens: mu.output_tokens ?? 0, cachedInputTokens: 0 }
      : null
  return { text, usage, model, provider: 'claude' }
}

async function callGoogle(prompt: string, apiKey: string): Promise<AiCallSuccess> {
  const model = 'gemini-3-flash-preview'
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({ model, contents: prompt })
  const text = response.text ?? ''
  const meta = (response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })?.usageMetadata
  const usage =
    meta && typeof meta.promptTokenCount === 'number'
      ? { inputTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount ?? 0, cachedInputTokens: 0 }
      : null
  return { text, usage, model, provider: 'google' }
}

async function recordUsage(feature: string, result: AiCallSuccess): Promise<void> {
  if (!result.usage) {
    await appendAiUsageEvent({
      feature,
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
    feature,
    provider: result.provider,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedInputTokens: result.usage.cachedInputTokens ?? 0,
    costUsd: usd,
    pricingKnown: knownModel,
  })
}

export async function sendCheckViolationsPrompt(
  diffContent: string,
  options: { codingRuleId?: string; codingRuleName?: string; userId?: string; sourceFolderPath?: string; language?: string }
): Promise<string> {
  const idOrName = options.codingRuleId || options.codingRuleName || configurationStore.store.codingRuleId || configurationStore.store.codingRule || ''
  let rulesContent = 'No specific coding rules provided.'
  if (idOrName) {
    const content = await getCodingRuleContentByIdOrName(idOrName, {
      sourceFolderPath: options.sourceFolderPath,
      userId: options.userId,
    })
    if (content) rulesContent = content
  }
  let prompt = PROMPT.CHECK_VIOLATIONS.replace('{coding_rules}', rulesContent).replace('{diff_content}', diffContent)
  if (options.language) {
    prompt += `\n\nRespond in ${options.language}.`
  }

  const { openaiApiKey, claudeApiKey, googleApiKey, activeApiProvider, openaiModel } = configurationStore.store
  let result: AiCallSuccess | string
  switch (activeApiProvider) {
    case 'claude':
      if (!claudeApiKey) return 'Error: Claude API key is not configured.'
      result = await callClaude(prompt, claudeApiKey)
      break
    case 'google':
      if (!googleApiKey) return 'Error: Google AI API key is not configured.'
      result = await callGoogle(prompt, googleApiKey)
      break
    default:
      if (!openaiApiKey) return 'Error: OpenAI API key is not configured.'
      result = await callOpenAI(prompt, openaiApiKey, openaiModel)
  }
  if (typeof result === 'string') return result
  await recordUsage('COMMIT_WORKFLOW_CODING_RULES', result)
  return result.text
}
