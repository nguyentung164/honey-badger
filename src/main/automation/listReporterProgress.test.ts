import { describe, expect, it } from 'vitest'
import { parseListReporterLine, parseRunningBannerLine, type ProgressTally } from './listReporterProgress'

function emptyTally(): ProgressTally {
  return { plannedTotal: 0, passed: 0, failed: 0, skipped: 0 }
}

describe('listReporterProgress', () => {
  it('parses ASCII ok/x/- lines', () => {
    const t = emptyTally()
    t.plannedTotal = 2
    expect(parseListReporterLine('  ok  1 [chromium] › a.spec.ts › t', t)).toBe(true)
    expect(t.passed).toBe(1)
    expect(parseListReporterLine('  x   2 [chromium] › a.spec.ts › t2', t)).toBe(true)
    expect(t.failed).toBe(1)
  })

  it('parses UTF-8 checkmark / cross (TTY list reporter)', () => {
    const t = emptyTally()
    t.plannedTotal = 2
    expect(parseListReporterLine('  ✓  1 [chromium] › a.spec.ts › t', t)).toBe(true)
    expect(t.passed).toBe(1)
    expect(parseListReporterLine('  ✘  2 [chromium] › a.spec.ts › t2', t)).toBe(true)
    expect(t.failed).toBe(1)
  })

  it('parses Running N tests banner', () => {
    const t = emptyTally()
    expect(parseRunningBannerLine('Running 42 tests using 2 workers', t)).toBe(true)
    expect(t.plannedTotal).toBe(42)
    expect(parseRunningBannerLine('Running 42 tests using 2 workers', t)).toBe(false)
  })

  it('parses Running 1 test singular', () => {
    const t = emptyTally()
    expect(parseRunningBannerLine('Running 1 test using 1 worker', t)).toBe(true)
    expect(t.plannedTotal).toBe(1)
  })
})
