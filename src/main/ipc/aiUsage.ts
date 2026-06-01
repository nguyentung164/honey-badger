import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import type { AiDisplayCurrency, AiUsageEvent } from '../task/aiUsageDb'
import {
  clearAiUsageEvents,
  getAiUsageEvents,
  getAiUsageTotalsByUser,
  getDisplayCurrency,
  getFxState,
  setDisplayCurrency,
  setFxRates,
} from '../task/aiUsageDb'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { hasDbConfig, query } from '../task/schema/db'

export type AiUsageSummary = {
  byFeature: Array<{
    feature: string
    calls: number
    inputTokens: number
    outputTokens: number
    costUsd: number | null
    unknownPricingCalls: number
  }>
  /** One row per (feature, provider, model) for detailed table */
  byDetail: Array<{
    feature: string
    provider: string
    model: string
    calls: number
    inputTokens: number
    outputTokens: number
    costUsd: number | null
    unknownPricingCalls: number
  }>
  byDay: Array<{ date: string; costUsd: number }>
  totals: {
    calls: number
    inputTokens: number
    outputTokens: number
    costUsd: number | null
  }
  displayCurrency: AiDisplayCurrency
  fx: { usdToVnd: number | null; usdToJpy: number | null; updatedAt: number | null }
  dbAvailable: boolean
  userId: string | null
  userName: string | null
}

export type AiUsageUsersSummaryRow = {
  userId: string | null
  userName: string
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number | null
}

function getSession() {
  const token = getTokenFromStore()
  return token ? verifyToken(token) : null
}

async function resolveTargetDisplayName(targetUserId: string, session: { userId: string; name: string }, userName?: string): Promise<string | null> {
  if (userName?.trim()) return userName.trim()
  if (targetUserId === session.userId) return session.name
  if (!hasDbConfig()) return null
  try {
    const rows = await query<{ name: string }>('SELECT name FROM users WHERE id = ? LIMIT 1', [targetUserId])
    const n = rows?.[0]?.name
    return n?.trim() ? n : null
  } catch {
    return null
  }
}

function startOfUtcDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export async function buildAiUsageSummary(events: AiUsageEvent[], userId: string | null, userName: string | null): Promise<AiUsageSummary> {
  const dbAvailable = hasDbConfig()
  const byFeatureMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number; unknownPricingCalls: number }>()
  const byDetailMap = new Map<
    string,
    {
      feature: string
      provider: string
      model: string
      calls: number
      inputTokens: number
      outputTokens: number
      costUsd: number
      unknownPricingCalls: number
    }
  >()
  const byDayMap = new Map<string, number>()

  let totalInput = 0
  let totalOutput = 0

  for (const e of events) {
    totalInput += e.inputTokens
    totalOutput += e.outputTokens

    const cur = byFeatureMap.get(e.feature) ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unknownPricingCalls: 0 }
    cur.calls += 1
    cur.inputTokens += e.inputTokens
    cur.outputTokens += e.outputTokens
    if (e.costUsd != null) {
      cur.costUsd += e.costUsd
    } else {
      cur.unknownPricingCalls += 1
    }
    byFeatureMap.set(e.feature, cur)

    const detailKey = `${e.feature}\0${e.provider}\0${e.model}`
    const dcur = byDetailMap.get(detailKey) ?? {
      feature: e.feature,
      provider: e.provider,
      model: e.model,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      unknownPricingCalls: 0,
    }
    dcur.calls += 1
    dcur.inputTokens += e.inputTokens
    dcur.outputTokens += e.outputTokens
    if (e.costUsd != null) {
      dcur.costUsd += e.costUsd
    } else {
      dcur.unknownPricingCalls += 1
    }
    byDetailMap.set(detailKey, dcur)

    if (e.costUsd != null) {
      const day = startOfUtcDay(e.ts)
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + e.costUsd)
    }
  }

  const totalCost = events.some(e => e.costUsd == null) ? null : events.reduce((s, e) => s + (e.costUsd ?? 0), 0)

  const byFeature = [...byFeatureMap.entries()]
    .map(([feature, v]) => ({
      feature,
      calls: v.calls,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      costUsd: v.unknownPricingCalls > 0 ? null : v.costUsd,
      unknownPricingCalls: v.unknownPricingCalls,
    }))
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))

  const byDetail = [...byDetailMap.values()]
    .map(v => ({
      feature: v.feature,
      provider: v.provider,
      model: v.model,
      calls: v.calls,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      costUsd: v.unknownPricingCalls > 0 ? null : v.costUsd,
      unknownPricingCalls: v.unknownPricingCalls,
    }))
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))

  const byDay = [...byDayMap.entries()].map(([date, costUsd]) => ({ date, costUsd })).sort((a, b) => a.date.localeCompare(b.date))

  const fx = await getFxState()
  return {
    byFeature,
    byDetail,
    byDay,
    totals: {
      calls: events.length,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      costUsd: totalCost,
    },
    displayCurrency: await getDisplayCurrency(),
    fx: { usdToVnd: fx.usdToVnd, usdToJpy: fx.usdToJpy, updatedAt: fx.updatedAt },
    dbAvailable,
    userId,
    userName,
  }
}

async function fetchUsdRatesFromErApi(): Promise<{ vnd: number; jpy: number }> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { result?: string; conversion_rates?: Record<string, number>; rates?: Record<string, number> }
  if (data.result && data.result !== 'success') throw new Error('API result not success')
  const rates = data.conversion_rates ?? data.rates
  if (!rates) throw new Error('Missing rates')
  const vnd = rates.VND
  const jpy = rates.JPY
  if (typeof vnd !== 'number' || typeof jpy !== 'number') throw new Error('Missing VND or JPY rate')
  return { vnd, jpy }
}

async function fetchUsdRatesFallback(): Promise<{ vnd: number; jpy: number }> {
  const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=VND,JPY')
  if (!res.ok) throw new Error(`exchangerate.host HTTP ${res.status}`)
  const data = (await res.json()) as { success?: boolean; rates?: Record<string, number> }
  if (!data.success || !data.rates) throw new Error('exchangerate.host failed')
  const vnd = data.rates.VND
  const jpy = data.rates.JPY
  if (typeof vnd !== 'number' || typeof jpy !== 'number') throw new Error('Missing VND or JPY')
  return { vnd, jpy }
}

type AiUsageUserParams = { userId?: string; userName?: string }

function parseUserParams(raw: unknown): AiUsageUserParams {
  if (raw == null) return {}
  if (typeof raw === 'string') return { userId: raw }
  if (typeof raw === 'object' && 'userId' in raw) {
    const o = raw as AiUsageUserParams
    return { userId: o.userId, userName: o.userName }
  }
  return {}
}

export function registerAiUsageIpcHandlers(): void {
  ipcMain.handle(IPC.AI_USAGE.GET_SUMMARY, async (_e, rawParams?: AiUsageUserParams | string) => {
    const session = getSession()
    if (!session) {
      return buildAiUsageSummary([], null, null)
    }
    const { userId, userName } = parseUserParams(rawParams)
    const targetUserId = userId ?? session.userId
    if (targetUserId !== session.userId && session.role !== 'admin') {
      return buildAiUsageSummary([], null, null)
    }
    const events = await getAiUsageEvents(targetUserId)
    const name = await resolveTargetDisplayName(targetUserId, session, userName)
    return buildAiUsageSummary(events, targetUserId, name)
  })

  ipcMain.handle(IPC.AI_USAGE.GET_USERS_SUMMARY, async () => {
    const session = getSession()
    if (!session || session.role !== 'admin') {
      return { ok: false as const, error: 'FORBIDDEN' as const, rows: [] as AiUsageUsersSummaryRow[] }
    }
    const rows = await getAiUsageTotalsByUser()
    return { ok: true as const, rows }
  })

  ipcMain.handle(IPC.AI_USAGE.CLEAR, async (_e, rawParams?: { userId?: string } | string) => {
    const session = getSession()
    if (!session) return { ok: false as const, error: 'unauthorized' }
    const { userId } = parseUserParams(rawParams)
    const targetUserId = userId ?? session.userId
    if (targetUserId !== session.userId && session.role !== 'admin') {
      return { ok: false as const, error: 'FORBIDDEN' }
    }
    const ok = await clearAiUsageEvents(targetUserId)
    return { ok: ok as boolean }
  })

  ipcMain.handle(IPC.AI_USAGE.GET_EXCHANGE_STATE, async () => ({
    ...(await getFxState()),
    displayCurrency: await getDisplayCurrency(),
  }))

  ipcMain.handle(IPC.AI_USAGE.SET_DISPLAY_CURRENCY, async (_e, currency: AiDisplayCurrency) => {
    if (currency !== 'USD' && currency !== 'VND' && currency !== 'JPY') {
      return { ok: false as const, error: 'invalid currency' }
    }
    if (!hasDbConfig()) {
      return { ok: false as const, error: 'database not configured' }
    }
    const ok = await setDisplayCurrency(currency)
    return ok ? ({ ok: true as const } as const) : ({ ok: false as const, error: 'database error' } as const)
  })

  ipcMain.handle(IPC.AI_USAGE.FETCH_EXCHANGE_RATES, async () => {
    if (!hasDbConfig()) {
      return { ok: false as const, error: 'database not configured' }
    }
    try {
      const { vnd, jpy } = await fetchUsdRatesFromErApi().catch(() => fetchUsdRatesFallback())
      const ok = await setFxRates(vnd, jpy)
      if (!ok) return { ok: false as const, error: 'failed to save rates' }
      l.info('AI usage FX: updated USD→VND/JPY')
      return { ok: true as const, usdToVnd: vnd, usdToJpy: jpy, updatedAt: Date.now() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      l.warn('AI usage FX fetch failed:', msg)
      return { ok: false as const, error: msg }
    }
  })
}
