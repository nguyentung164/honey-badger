/**
 * Bảng giá USD / 1M token: mặc định trong ai-pricing.json; có thể ghi đè bằng
 * %userData%/ai-pricing.json (merge theo provider + model).
 *
 * Chi phí ước tính: uncached_input/1e6*pin + cached/1e6*pcached + output/1e6*pout
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

import type { ApiProvider } from '../store/ConfigurationStore'

import bundledPricing from './ai-pricing.json'

export type NormalizedUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

type ModelRates = {
  inputPer1M: number
  outputPer1M: number
  cachedInputPer1M?: number
}

type RawRates = {
  inputPer1M?: number
  outputPer1M?: number
  cachedInputPer1M?: number
}

type AiPricingDoc = {
  meta?: { updated?: string; notes?: string }
  openai?: Record<string, RawRates>
  claude?: Record<string, RawRates>
  google?: Record<string, RawRates>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function parseDoc(raw: unknown): AiPricingDoc | null {
  if (!isRecord(raw)) return null
  const meta = isRecord(raw.meta) ? raw.meta : undefined
  const pickMap = (key: string): Record<string, RawRates> | undefined => {
    const m = raw[key]
    if (!isRecord(m)) return undefined
    const out: Record<string, RawRates> = {}
    for (const [modelId, rates] of Object.entries(m)) {
      if (!isRecord(rates)) continue
      const inputPer1M =
        typeof rates.inputPer1M === 'number' ? rates.inputPer1M : undefined
      const outputPer1M =
        typeof rates.outputPer1M === 'number' ? rates.outputPer1M : undefined
      const cachedInputPer1M =
        typeof rates.cachedInputPer1M === 'number' ? rates.cachedInputPer1M : undefined
      out[modelId] = { inputPer1M, outputPer1M, cachedInputPer1M }
    }
    return out
  }
  return {
    meta: meta
      ? {
          updated: typeof meta.updated === 'string' ? meta.updated : undefined,
          notes: typeof meta.notes === 'string' ? meta.notes : undefined,
        }
      : undefined,
    openai: pickMap('openai'),
    claude: pickMap('claude'),
    google: pickMap('google'),
  }
}

function normalizeModelRates(
  raw: RawRates,
  previous?: ModelRates
): ModelRates | undefined {
  const inputPer1M =
    typeof raw.inputPer1M === 'number' ? raw.inputPer1M : previous?.inputPer1M
  const outputPer1M =
    typeof raw.outputPer1M === 'number' ? raw.outputPer1M : previous?.outputPer1M
  if (inputPer1M === undefined || outputPer1M === undefined) return undefined
  const cachedInputPer1M =
    typeof raw.cachedInputPer1M === 'number'
      ? raw.cachedInputPer1M
      : previous?.cachedInputPer1M
  return { inputPer1M, outputPer1M, cachedInputPer1M }
}

function mergeMaps(
  base: Record<string, ModelRates>,
  overlay?: Record<string, RawRates>
): Record<string, ModelRates> {
  const out: Record<string, ModelRates> = { ...base }
  if (!overlay) return out
  for (const [k, raw] of Object.entries(overlay)) {
    const merged = normalizeModelRates(raw, out[k])
    if (merged) out[k] = merged
  }
  return out
}

function bundledDoc(): AiPricingDoc {
  const parsed = parseDoc(bundledPricing as unknown)
  return parsed ?? {}
}

function readUserDoc(): AiPricingDoc | null {
  try {
    const userPath = path.join(app.getPath('userData'), 'ai-pricing.json')
    if (!fs.existsSync(userPath)) return null
    const raw = JSON.parse(fs.readFileSync(userPath, 'utf8'))
    return parseDoc(raw)
  } catch {
    return null
  }
}

function baseModelMapsFromDoc(doc: AiPricingDoc): {
  openai: Record<string, ModelRates>
  claude: Record<string, ModelRates>
  google: Record<string, ModelRates>
} {
  const fromOverlay = (m?: Record<string, RawRates>): Record<string, ModelRates> => {
    const acc: Record<string, ModelRates> = {}
    if (!m) return acc
    for (const [k, raw] of Object.entries(m)) {
      const n = normalizeModelRates(raw)
      if (n) acc[k] = n
    }
    return acc
  }
  return {
    openai: fromOverlay(doc.openai),
    claude: fromOverlay(doc.claude),
    google: fromOverlay(doc.google),
  }
}

let cachedTables: {
  openai: Record<string, ModelRates>
  claude: Record<string, ModelRates>
  google: Record<string, ModelRates>
} | null = null

function getTables() {
  if (cachedTables) return cachedTables
  const b = bundledDoc()
  const u = readUserDoc()
  const baseBundled = baseModelMapsFromDoc(b)
  if (!u) {
    cachedTables = baseBundled
    return cachedTables
  }
  cachedTables = {
    openai: mergeMaps(baseBundled.openai, u.openai),
    claude: mergeMaps(baseBundled.claude, u.claude),
    google: mergeMaps(baseBundled.google, u.google),
  }
  return cachedTables
}

/** Gọi khi cần đọc lại userData/ai-pricing.json (vd. sau khi user sửa file). */
export function invalidateAiPricingCache(): void {
  cachedTables = null
}

function resolveOpenAiRates(
  modelId: string,
  OPENAI_RATES: Record<string, ModelRates>
): ModelRates | undefined {
  const id = modelId.trim().toLowerCase()
  if (OPENAI_RATES[modelId]) return OPENAI_RATES[modelId]
  if (OPENAI_RATES[id]) return OPENAI_RATES[id]
  const entry = Object.entries(OPENAI_RATES).find(([k]) => id.includes(k) || k.includes(id))
  return entry?.[1]
}

function resolveClaudeRates(
  modelId: string,
  CLAUDE_RATES: Record<string, ModelRates>
): ModelRates | undefined {
  return CLAUDE_RATES[modelId] ?? CLAUDE_RATES['claude-sonnet-4-6']
}

function resolveGoogleRates(
  modelId: string,
  GOOGLE_RATES: Record<string, ModelRates>
): ModelRates | undefined {
  return GOOGLE_RATES[modelId] ?? GOOGLE_RATES['gemini-3-flash-preview']
}

export function estimateCostUsd(
  provider: ApiProvider,
  modelId: string,
  usage: NormalizedUsage
): { usd: number | null; knownModel: boolean } {
  const { openai, claude, google } = getTables()
  const { inputTokens, outputTokens, cachedInputTokens = 0 } = usage
  let rates: ModelRates | undefined
  switch (provider) {
    case 'openai':
      rates = resolveOpenAiRates(modelId, openai)
      break
    case 'claude':
      rates = resolveClaudeRates(modelId, claude)
      break
    case 'google':
      rates = resolveGoogleRates(modelId, google)
      break
    default:
      rates = resolveOpenAiRates(modelId, openai)
  }
  if (!rates) return { usd: null, knownModel: false }

  const cached = Math.min(cachedInputTokens, inputTokens)
  const uncached = Math.max(0, inputTokens - cached)
  const pCached = rates.cachedInputPer1M ?? rates.inputPer1M
  const usd =
    (uncached / 1_000_000) * rates.inputPer1M +
    (cached / 1_000_000) * pCached +
    (outputTokens / 1_000_000) * rates.outputPer1M

  return { usd, knownModel: true }
}
