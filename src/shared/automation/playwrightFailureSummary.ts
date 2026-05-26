/**
 * Trích thông tin hiển thị từ message lỗi kiểu Playwright JSON reporter
 * (thường có khối "Call log:" tách phần assertion và phần log timeout).
 */

import type { TestCaseFailureAssertionHints } from 'shared/automation/types'

export interface PlaywrightFailureHeadSplit {
  head: string
  callLog?: string
}

/** Bỏ ANSI để parse / hiển thị ổn định. */
export function stripAnsiForFailureDisplay(s: string): string {
  const esc = String.fromCharCode(27)
  let t = s.replace(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, 'g'), '')
  t = t.replace(new RegExp(`${esc}\\][\\s\\S]*?(?:${esc}\\\\|\\u0007)`, 'g'), '')
  t = t.replace(/Error:\s*\[(?:\d+;)*\d+m/g, 'Error: ')
  return t
}

/** Tách phần đầu (assertion / timeout message) và Call log như HTML reporter. */
export function splitPlaywrightFailureHeadAndCallLog(raw: string): PlaywrightFailureHeadSplit {
  const clean = stripAnsiForFailureDisplay(raw)
  const m = /\nCall log:\s*\n/i.exec(clean)
  if (m?.index != null) {
    const head = clean.slice(0, m.index).trim()
    const callLog = clean.slice(m.index + m[0].length).trim()
    return { head, callLog: callLog || undefined }
  }
  return { head: clean.trim() }
}

/**
 * Khớp cuối dạng `…path.spec.ts:line:col` trong message (bỏ qua node_modules).
 */
export function extractPlaywrightStackLocation(
  message: string
): { file: string; line: number; column?: number } | undefined {
  const clean = stripAnsiForFailureDisplay(message)
  const re = /([^\s'"<>()|]+\.(?:spec|test)\.[mc]?[tj]sx?):(\d+):(\d+)/gi
  let last: { file: string; line: number; column?: number } | undefined
  let match = re.exec(clean)
  while (match !== null) {
    const file = match[1]?.trim()
    if (!file) {
      match = re.exec(clean)
      continue
    }
    const lower = file.toLowerCase()
    if (lower.includes('node_modules')) {
      match = re.exec(clean)
      continue
    }
    last = { file, line: parseInt(match[2], 10), column: parseInt(match[3], 10) }
    match = re.exec(clean)
  }
  return last
}

/** Vài dòng đầu của phần head (không gồm Call log). */
export function summarizePlaywrightFailureHead(head: string, maxLines = 3, maxChars = 300): string {
  const lines = head.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    const t = line.trimEnd()
    if (!t.trim() && out.length === 0) continue
    if (!t.trim() && out.length > 0) break
    if (t.trim()) out.push(t.trimEnd())
    if (out.length >= maxLines) break
  }
  let s = out.join('\n').trim()
  if (s.length > maxChars) s = `${s.slice(0, maxChars - 1).trimEnd()}…`
  return s || head.slice(0, maxChars).trimEnd() + (head.length > maxChars ? '…' : '')
}

function trimHintField(s: string | undefined, max = 1200): string | undefined {
  if (!s) return undefined
  const t = s.trim()
  if (!t) return undefined
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

function trimHints(h: TestCaseFailureAssertionHints): TestCaseFailureAssertionHints {
  return {
    locator: trimHintField(h.locator),
    expected: trimHintField(h.expected),
    received: trimHintField(h.received),
  }
}

/** Dòng `Locator:` / `Expected:` / `Received:` trong phần head (trước Call log). */
export function parseAssertionHintsFromPlaywrightHead(head: string): TestCaseFailureAssertionHints {
  type Key = 'locator' | 'expected' | 'received'
  const lines = head.split(/\r?\n/)
  let bucket: Key | null = null
  const chunks: Record<Key, string[]> = { locator: [], expected: [], received: [] }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    if (/^at\s+/i.test(trimmed)) {
      bucket = null
      continue
    }

    const m = trimmed.match(/^(Locator|Expected|Received)\s*:\s*(.*)$/i)
    if (m) {
      const key = m[1].toLowerCase() as Key
      bucket = key
      const rest = (m[2] ?? '').trimEnd()
      chunks[key] = rest ? [rest] : []
      continue
    }

    if (bucket) chunks[bucket].push(trimmed)
  }

  const join = (key: Key): string | undefined => {
    const a = chunks[key]
    if (!a.length) return undefined
    const s = a.join('\n').trim()
    return s || undefined
  }

  return { locator: join('locator'), expected: join('expected'), received: join('received') }
}

function formatMatcherField(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') {
    const t = v.trim()
    return t || undefined
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** `matcherResult` trên object lỗi Playwright (expected / actual). */
export function parseHintsFromMatcherResult(mr: unknown): TestCaseFailureAssertionHints {
  if (!mr || typeof mr !== 'object') return {}
  const o = mr as Record<string, unknown>
  return {
    expected: formatMatcherField(o.expected),
    received: formatMatcherField(o.actual ?? o.received),
  }
}

function mergeAssertionHints(
  fromMatcher: TestCaseFailureAssertionHints,
  fromMessage: TestCaseFailureAssertionHints
): TestCaseFailureAssertionHints {
  return {
    locator: fromMessage.locator ?? fromMatcher.locator,
    expected: fromMessage.expected ?? fromMatcher.expected,
    received: fromMessage.received ?? fromMatcher.received,
  }
}

/** Dòng đầu (Error / Timeout) trước khối Locator/Expected/Received. */
export function headlineForFailureDisplay(head: string): string {
  const lines = head.split(/\r?\n/)
  const out: string[] = []
  for (const rawLine of lines) {
    const t = rawLine.trim()
    if (!t) {
      if (out.length > 0) break
      continue
    }
    if (/^(Locator|Expected|Received)\s*:/i.test(t)) break
    if (/^at\s+/i.test(t)) break
    out.push(rawLine.trimEnd())
    if (out.length >= 2) break
  }
  let s = out.join('\n').trim()
  if (!s) {
    const first = lines.map(l => l.trim()).find(Boolean)
    s = first ?? ''
  }
  if (s.length > 240) s = `${s.slice(0, 239).trimEnd()}…`
  return s
}

export function derivePlaywrightFailureDisplay(
  raw: string,
  matcherResult?: unknown
): { summary: string; hasCallLog: boolean; assertionHints?: TestCaseFailureAssertionHints } {
  const { head, callLog } = splitPlaywrightFailureHeadAndCallLog(raw)
  const fromMessage = parseAssertionHintsFromPlaywrightHead(head)
  const fromMatcher = parseHintsFromMatcherResult(matcherResult)
  const merged = trimHints(mergeAssertionHints(fromMatcher, fromMessage))

  let summary = headlineForFailureDisplay(head)
  if (!summary) summary = summarizePlaywrightFailureHead(head)

  const hasAny = !!(merged.locator?.trim() || merged.expected?.trim() || merged.received?.trim())

  return {
    summary: summary.trim(),
    hasCallLog: !!callLog?.trim(),
    assertionHints: hasAny ? merged : undefined,
  }
}

export function summarizePlaywrightFailureMessage(raw: string): { summary: string; hasCallLog: boolean } {
  const d = derivePlaywrightFailureDisplay(raw, undefined)
  return { summary: d.summary, hasCallLog: d.hasCallLog }
}

/** Có nội dung đáng mở "raw" (call log hoặc message dài hơn phần tóm tắt). */
export function failureMessageNeedsRawPanel(message: string, summary: string): boolean {
  const { hasCallLog } = summarizePlaywrightFailureMessage(message)
  if (hasCallLog) return true
  const a = stripAnsiForFailureDisplay(message).trim()
  const b = summary.replace(/…\s*$/, '').trim()
  return a.length > b.length + 24
}
