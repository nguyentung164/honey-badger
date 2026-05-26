/** Trạng thế đếm từ stdout/stderr của Playwright `list` reporter (không phụ thuộc Electron). */

export interface ProgressTally {
  /** Từ dòng `Running N tests` — mẫu số cho thanh tiến độ. */
  plannedTotal: number
  passed: number
  failed: number
  skipped: number
  currentTest?: string
}

export function tallyCompleted(tally: ProgressTally): number {
  return tally.passed + tally.failed + tally.skipped
}

/** Dòng `Running N tests` / `Running 1 test` ở list reporter. */
export function parseRunningBannerLine(line: string, tally: ProgressTally): boolean {
  const t = line.trim()
  const m = /^Running\s+(\d+)\s+tests?\b/i.exec(t)
  if (!m) return false
  const n = parseInt(m[1], 10)
  if (Number.isNaN(n) || n < 1) return false
  if (n <= tally.plannedTotal) return false
  tally.plannedTotal = n
  return true
}

function mapListStatusSymbol(sym: string): 'ok' | 'x' | '-' | null {
  if (sym === 'ok' || sym === '✓' || sym === '✔' || sym === '\u2713' || sym === '\u2714') return 'ok'
  if (sym === 'x' || sym === '✘' || sym === '✖' || sym === '×' || sym === '\u2717' || sym === '\u2718' || sym === '\u2716' || sym === '\u00d7') return 'x'
  if (sym === '-' || sym === '−' || sym === '\u2212') return '-'
  const lower = sym.toLowerCase()
  if (lower === 'ok') return 'ok'
  if (lower === 'x') return 'x'
  if (lower === '-') return '-'
  return null
}

/**
 * Một dòng kết quả của `list` reporter (ASCII trên Windows hoặc ký tự UTF-8 trên TTY).
 */
export function parseListReporterLine(line: string, tally: ProgressTally): boolean {
  let changed = false
  const trimmed = line.trimEnd()
  const m = /^\s*(ok|x|\u2713|\u2714|\u2717|\u2718|\u2716|\u00d7|-|−)\s+(\d+)\s+(.*)$/i.exec(trimmed)
  if (m) {
    const mark = mapListStatusSymbol(m[1])
    if (mark) {
      if (mark === 'ok') tally.passed += 1
      else if (mark === 'x') tally.failed += 1
      else tally.skipped += 1
      tally.currentTest = m[3]?.trim() ? m[3] : undefined
      changed = true
    }
  }
  if (!changed) {
    const totals = /(\d+)\s+passed/.exec(trimmed)
    if (totals) {
      const n = Number(totals[1])
      if (!Number.isNaN(n) && n > tally.passed) {
        tally.passed = n
        changed = true
      }
    }
  }
  return changed
}

function processReporterLine(line: string, tally: ProgressTally): boolean {
  return parseRunningBannerLine(line, tally) || parseListReporterLine(line, tally)
}

export function drainReporterBuffer(buffer: { s: string }, tally: ProgressTally, emitProgress: () => void): void {
  for (;;) {
    const idx = buffer.s.indexOf('\n')
    if (idx === -1) break
    const line = buffer.s.slice(0, idx)
    buffer.s = buffer.s.slice(idx + 1)
    if (processReporterLine(line, tally)) emitProgress()
  }
}

export function flushReporterTail(buffer: { s: string }, tally: ProgressTally, emitProgress: () => void): void {
  const tail = buffer.s.trimEnd()
  buffer.s = ''
  if (!tail) return
  for (const line of tail.split('\n')) {
    if (processReporterLine(line, tally)) emitProgress()
  }
}
