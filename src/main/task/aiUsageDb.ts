import l from 'electron-log'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { ApiProvider } from '../store/ConfigurationStore'
import { getTokenFromStore, verifyToken } from './auth'
import { isBooleanColumn, toDbBoolValue } from './stores/pgPrTrackingStore'
import { hasDbConfig, query } from './schema/db'

export type AiUsageEvent = {
  id: string
  userId: string
  ts: number
  feature: string
  provider: ApiProvider
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  costUsd: number | null
  pricingKnown: boolean
}

export type AiUsageUserTotals = {
  userId: string
  userName: string
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number | null
}

export type AiDisplayCurrency = 'USD' | 'VND' | 'JPY'

const MAX_EVENTS = 2500

function normalizeAiDisplayCurrency(raw: unknown): AiDisplayCurrency {
  if (raw == null) return 'USD'
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim()
  const u = s.toUpperCase()
  if (u === 'USD' || u === 'VND' || u === 'JPY') return u
  return 'USD'
}

function resolveCurrentUserId(): string | null {
  const token = getTokenFromStore()
  const session = token ? verifyToken(token) : null
  return session?.userId ?? null
}

function mapRow(r: Record<string, unknown>): AiUsageEvent {
  const created = r.created_at as Date
  const ts = created instanceof Date ? created.getTime() : new Date(String(created)).getTime()
  return {
    id: String(r.id),
    userId: String(r.user_id),
    ts: Number.isFinite(ts) ? ts : Date.now(),
    feature: String(r.feature),
    provider: r.provider as ApiProvider,
    model: String(r.model),
    inputTokens: Number(r.input_tokens) || 0,
    outputTokens: Number(r.output_tokens) || 0,
    cachedInputTokens: Number(r.cached_input_tokens) || 0,
    costUsd: r.cost_usd != null ? Number(r.cost_usd) : null,
    pricingKnown: Boolean(r.pricing_known),
  }
}

export async function appendAiUsageEvent(event: Omit<AiUsageEvent, 'id' | 'ts' | 'userId'>): Promise<boolean> {
  if (!hasDbConfig()) return false
  const userId = resolveCurrentUserId()
  if (!userId) return false
  try {
    const pricingKnownColIsBoolean = await isBooleanColumn('ai_usage_events', 'pricing_known')
    const pricingKnownDb = toDbBoolValue(event.pricingKnown, pricingKnownColIsBoolean)
    await query(
      `INSERT INTO ai_usage_events (id, user_id, created_at, feature, provider, model, input_tokens, output_tokens, cached_input_tokens, cost_usd, pricing_known)
       VALUES (?, ?, CURRENT_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUuidV7(),
        userId,
        event.feature,
        event.provider,
        event.model,
        event.inputTokens,
        event.outputTokens,
        event.cachedInputTokens,
        event.costUsd,
        pricingKnownDb,
      ]
    )
    const cntRows = await query<{ c: number }>('SELECT COUNT(*) AS c FROM ai_usage_events WHERE user_id = ?', [userId])
    const c = Number(cntRows?.[0]?.c) || 0
    if (c > MAX_EVENTS) {
      const excess = c - MAX_EVENTS
      await query(
        `DELETE FROM ai_usage_events WHERE id IN (
           SELECT id FROM ai_usage_events WHERE user_id = ? ORDER BY created_at ASC LIMIT ?
         )`,
        [userId, excess]
      )
    }
    return true
  } catch (e) {
    l.warn('aiUsageDb: append failed:', e)
    return false
  }
}

export async function getAiUsageEvents(userId: string): Promise<AiUsageEvent[]> {
  if (!hasDbConfig()) return []
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM ai_usage_events WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    )
    if (!Array.isArray(rows)) return []
    return rows.map(mapRow)
  } catch (e) {
    l.warn('aiUsageDb: get events failed:', e)
    return []
  }
}

function mapUserTotalsRow(r: {
  user_id: string
  user_name: string | null
  calls: number
  input_tokens: number
  output_tokens: number
  unknown_pricing_calls: number
  cost_usd_sum: number | null
}): AiUsageUserTotals {
  const unknown = Number(r.unknown_pricing_calls) || 0
  const calls = Number(r.calls) || 0
  return {
    userId: String(r.user_id),
    userName: r.user_name?.trim() ? String(r.user_name) : '',
    calls,
    inputTokens: Number(r.input_tokens) || 0,
    outputTokens: Number(r.output_tokens) || 0,
    costUsd: unknown > 0 ? null : calls === 0 ? 0 : r.cost_usd_sum != null ? Number(r.cost_usd_sum) : 0,
  }
}

export async function getAiUsageTotalsByUser(): Promise<AiUsageUserTotals[]> {
  if (!hasDbConfig()) return []
  try {
    const userRows = await query<{
      user_id: string
      user_name: string | null
      calls: number
      input_tokens: number
      output_tokens: number
      unknown_pricing_calls: number
      cost_usd_sum: number | null
    }>(
      `SELECT u.id AS user_id,
              u.name AS user_name,
              COUNT(e.id)::int AS calls,
              COALESCE(SUM(e.input_tokens), 0)::int AS input_tokens,
              COALESCE(SUM(e.output_tokens), 0)::int AS output_tokens,
              SUM(CASE WHEN e.id IS NOT NULL AND e.cost_usd IS NULL THEN 1 ELSE 0 END)::int AS unknown_pricing_calls,
              SUM(e.cost_usd) AS cost_usd_sum
       FROM users u
       LEFT JOIN ai_usage_events e ON e.user_id = u.id
       GROUP BY u.id, u.name
       ORDER BY u.name ASC NULLS LAST, u.id ASC`
    )
    if (!Array.isArray(userRows)) return []
    return userRows.map(mapUserTotalsRow)
  } catch (e) {
    l.warn('aiUsageDb: get totals by user failed:', e)
    return []
  }
}

export async function clearAiUsageEvents(userId: string): Promise<boolean> {
  if (!hasDbConfig()) return false
  try {
    await query('DELETE FROM ai_usage_events WHERE user_id = ?', [userId])
    return true
  } catch (e) {
    l.warn('aiUsageDb: clear failed:', e)
    return false
  }
}

export async function getDisplayCurrency(): Promise<AiDisplayCurrency> {
  if (!hasDbConfig()) return 'USD'
  try {
    const rows = await query<{ display_currency: unknown }>('SELECT display_currency FROM ai_usage_settings WHERE id = 1')
    const v = rows?.[0]?.display_currency
    return normalizeAiDisplayCurrency(v)
  } catch {
    return 'USD'
  }
}

export async function setDisplayCurrency(currency: AiDisplayCurrency): Promise<boolean> {
  if (!hasDbConfig()) return false
  try {
    /** Row id=1 may be missing on older DBs; plain UPDATE would affect 0 rows and still "succeed". */
    await query(
      `INSERT INTO ai_usage_settings (id, display_currency) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET display_currency = EXCLUDED.display_currency`,
      [currency]
    )
    return true
  } catch (e) {
    l.warn('aiUsageDb: setDisplayCurrency failed:', e)
    return false
  }
}

export async function getFxState(): Promise<{
  usdToVnd: number | null
  usdToJpy: number | null
  updatedAt: number | null
}> {
  if (!hasDbConfig()) {
    return { usdToVnd: null, usdToJpy: null, updatedAt: null }
  }
  try {
    const rows = await query<{ fx_usd_to_vnd: unknown; fx_usd_to_jpy: unknown; fx_updated_at: unknown }>(
      'SELECT fx_usd_to_vnd, fx_usd_to_jpy, fx_updated_at FROM ai_usage_settings WHERE id = 1'
    )
    const r = rows?.[0]
    if (!r) return { usdToVnd: null, usdToJpy: null, updatedAt: null }
    return {
      usdToVnd: r.fx_usd_to_vnd != null ? Number(r.fx_usd_to_vnd) : null,
      usdToJpy: r.fx_usd_to_jpy != null ? Number(r.fx_usd_to_jpy) : null,
      updatedAt: r.fx_updated_at != null ? Number(r.fx_updated_at) : null,
    }
  } catch {
    return { usdToVnd: null, usdToJpy: null, updatedAt: null }
  }
}

export async function setFxRates(usdToVnd: number, usdToJpy: number): Promise<boolean> {
  if (!hasDbConfig()) return false
  const now = Date.now()
  try {
    await query('UPDATE ai_usage_settings SET fx_usd_to_vnd = ?, fx_usd_to_jpy = ?, fx_updated_at = ? WHERE id = 1', [usdToVnd, usdToJpy, now])
    return true
  } catch (e) {
    l.warn('aiUsageDb: setFxRates failed:', e)
    return false
  }
}
