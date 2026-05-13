import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { overallStatusFromSummary, parsePlaywrightReport, readReportJsonWithRetry } from './reportParser'

describe('parsePlaywrightReport', () => {
  it('aggregates totals and detects flaky results', () => {
    const report = {
      stats: { duration: 12345, startTime: '2026-05-12T12:00:00.000Z' },
      suites: [
        {
          specs: [],
          suites: [
            {
              specs: [
                {
                  title: 'TC-1 login',
                  file: 'tests/TC-1.spec.ts',
                  tests: [
                    {
                      title: 'TC-1 login',
                      projectName: 'chromium',
                      results: [
                        { status: 'failed', duration: 100, attachments: [], errors: [{ message: 'boom' }] },
                        { status: 'passed', duration: 250, attachments: [{ name: 'trace', path: '/tmp/trace.zip' }] },
                      ],
                    },
                  ],
                },
                {
                  title: 'TC-2 search',
                  file: 'tests/TC-2.spec.ts',
                  tests: [
                    {
                      title: 'TC-2 search',
                      projectName: 'firefox',
                      results: [
                        { status: 'failed', duration: 500, errors: [{ message: 'selector not found' }], attachments: [{ name: 'screenshot', path: '/tmp/a.png', contentType: 'image/png' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const parsed = parsePlaywrightReport(report as any)
    expect(parsed.summary.total).toBe(2)
    expect(parsed.summary.passed).toBe(1)
    expect(parsed.summary.failed).toBe(1)
    expect(parsed.summary.flaky).toBe(1)
    expect(parsed.summary.durationMs).toBe(12345)

    const tc1 = parsed.results.find(r => r.caseCode === 'TC-1')
    expect(tc1?.status).toBe('flaky')
    expect(tc1?.browser).toBe('chromium')
    expect(tc1?.tracePath).toBe('/tmp/trace.zip')

    const tc2 = parsed.results.find(r => r.caseCode === 'TC-2')
    expect(tc2?.status).toBe('failed')
    expect(tc2?.browser).toBe('firefox')
    expect(tc2?.screenshotPaths).toContain('/tmp/a.png')
    expect(tc2?.errorMessage).toContain('selector not found')
  })

  it('derives overall status correctly', () => {
    expect(overallStatusFromSummary({ total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0, durationMs: 1 })).toBe('passed')
    expect(overallStatusFromSummary({ total: 1, passed: 0, failed: 1, skipped: 0, flaky: 0, durationMs: 1 })).toBe('failed')
    expect(overallStatusFromSummary({ total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0 })).toBe('error')
    expect(overallStatusFromSummary({ total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0, durationMs: 1 }, true)).toBe('cancelled')
  })
})

describe('readReportJsonWithRetry', () => {
  it('waits until report file appears', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-rj-'))
    const file = path.join(dir, 'report.json')
    const payload = JSON.stringify({ suites: [], stats: { duration: 0 } })
    setTimeout(() => {
      void fs.writeFile(file, payload, 'utf8')
    }, 120)
    const parsed = await readReportJsonWithRetry(file, { maxWaitMs: 5000, intervalMs: 30 })
    expect(Array.isArray(parsed.suites)).toBe(true)
    await fs.rm(dir, { recursive: true, force: true })
  })
})
