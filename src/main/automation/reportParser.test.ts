import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFailureStepsList, overallStatusFromSummary, parsePlaywrightReport, readReportJsonWithRetry } from './reportParser'

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
    expect(tc2?.failureSteps).toHaveLength(1)
    expect(tc2?.failureSteps?.[0].label).toBe('Failure')
    expect(tc2?.failureSteps?.[0].message).toContain('selector not found')
    expect(tc2?.failureSteps?.[0].screenshotPaths).toContain('/tmp/a.png')
  })

  it('puts failure-highlight paths before other screenshots on the case row', () => {
    const report = {
      stats: { duration: 1, startTime: '2026-05-12T12:00:00.000Z' },
      suites: [
        {
          specs: [
            {
              title: 'TC-HL',
              file: 'tests/hl.spec.ts',
              tests: [
                {
                  title: 'TC-HL',
                  projectName: 'chromium',
                  results: [
                    {
                      status: 'failed',
                      duration: 10,
                      errors: [{ message: 'x' }],
                      attachments: [
                        { name: 'screenshot', path: '/plain.png', contentType: 'image/png' },
                        { name: 'failure-highlight-1.png', path: '/hl.png', contentType: 'image/png' },
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
    const row = parsed.results.find(r => r.caseCode === 'TC-HL')
    expect(row?.screenshotPaths?.[0]).toBe('/hl.png')
    expect(row?.screenshotPaths).toContain('/plain.png')
  })

  it('does not let unrelated zip attachments overwrite trace path', () => {
    const report = {
      stats: { duration: 100, startTime: '2026-05-12T12:00:00.000Z' },
      suites: [
        {
          specs: [
            {
              title: 'TC-Z',
              file: 'tests/z.spec.ts',
              tests: [
                {
                  title: 'TC-Z',
                  projectName: 'chromium',
                  results: [
                    {
                      status: 'failed',
                      duration: 50,
                      errors: [{ message: 'fail' }],
                      attachments: [
                        { name: 'trace', path: '/tmp/real-trace.zip' },
                        { name: 'artifact', path: '/tmp/other.zip', contentType: 'application/zip' },
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
    const row = parsed.results.find(r => r.caseCode === 'TC-Z')
    expect(row?.tracePath).toBe('/tmp/real-trace.zip')
  })

  it('derives overall status correctly', () => {
    expect(overallStatusFromSummary({ total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0, durationMs: 1 })).toBe('passed')
    expect(overallStatusFromSummary({ total: 1, passed: 0, failed: 1, skipped: 0, flaky: 0, durationMs: 1 })).toBe('failed')
    expect(overallStatusFromSummary({ total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0 })).toBe('error')
    expect(overallStatusFromSummary({ total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0, durationMs: 1 }, true)).toBe('cancelled')
  })
})

describe('buildFailureStepsList', () => {
  it('splits multiple errors[] into numbered failure steps with shared root media', () => {
    const last = {
      status: 'failed',
      errors: [{ message: 'first' }, { message: 'second' }],
      attachments: [
        { name: 'screenshot', path: '/r.png', contentType: 'image/png' },
        { name: 'failure-highlight-2.png', path: '/h2.png', contentType: 'image/png' },
        { name: 'failure-highlight-1.png', path: '/h1.png', contentType: 'image/png' },
      ],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps).toHaveLength(2)
    expect(steps[0].label).toBe('Failure 1')
    expect(steps[0].message).toBe('first')
    expect(steps[1].label).toBe('Failure 2')
    expect(steps[1].message).toBe('second')
    expect(steps[0].screenshotPaths).toEqual(['/r.png'])
    expect(steps[1].screenshotPaths).toEqual(['/r.png'])
    expect(steps[0].failureHighlightPaths).toEqual(['/h1.png'])
    expect(steps[1].failureHighlightPaths).toEqual(['/h2.png'])
  })

  it('prefers multiple errors[] over nested steps (soft failures + internal steps)', () => {
    const last = {
      status: 'failed',
      errors: [{ message: 'first' }, { message: 'second' }],
      steps: [{ title: 'Internal', error: { message: 'inner' }, attachments: [] }],
      attachments: [
        { name: 'failure-highlight-1.png', path: '/h1.png', contentType: 'image/png' },
        { name: 'failure-highlight-2.png', path: '/h2.png', contentType: 'image/png' },
      ],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps).toHaveLength(2)
    expect(steps[0].message).toBe('first')
    expect(steps[1].message).toBe('second')
  })

  it('detects failure-highlight from attachment path when name is missing', () => {
    const last = {
      status: 'failed',
      errors: [{ message: 'e' }],
      attachments: [{ path: '/tmp/out/failure-highlight-1.png', contentType: 'image/png' }],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].failureHighlightPaths).toEqual(['/tmp/out/failure-highlight-1.png'])
  })

  it('detects failure-highlight from attachment name when on-disk path is hashed (HTML reporter data/)', () => {
    const hashed =
      '/report/playwright-report/run-1/data/d792a33e45f588c61f3841a1ca5f64007dfe8e5a.png'
    const last = {
      status: 'failed',
      errors: [{ message: 'e' }],
      attachments: [{ name: 'failure-highlight-1.png', path: hashed, contentType: 'image/png' }],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].failureHighlightPaths).toEqual([hashed])
  })

  it('drops Playwright test-failed-*.png from root screenshots when failure-highlight exists', () => {
    const last = {
      status: 'failed',
      errors: [{ message: 'e' }],
      attachments: [
        { name: 'screenshot', path: '/tmp/test-failed-1.png', contentType: 'image/png' },
        { path: '/tmp/failure-highlight-1.png', contentType: 'image/png' },
      ],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].screenshotPaths).not.toContain('/tmp/test-failed-1.png')
    expect(steps[0].failureHighlightPaths).toEqual(['/tmp/failure-highlight-1.png'])
  })

  it('prefers nested step attachments and falls back to root for steps without media', () => {
    const last = {
      status: 'failed',
      attachments: [
        { name: 'screenshot', path: '/root.png', contentType: 'image/png' },
        { name: 'video', path: '/root.webm', contentType: 'video/webm' },
      ],
      steps: [
        {
          title: 'Login',
          error: { message: 'bad creds' },
          attachments: [],
        },
        {
          title: 'Checkout',
          error: { message: 'empty cart' },
          attachments: [{ name: 'screenshot', path: '/step.png', contentType: 'image/png' }],
        },
      ],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps).toHaveLength(2)
    expect(steps[0].label).toBe('Login')
    expect(steps[0].screenshotPaths).toEqual(['/root.png'])
    expect(steps[0].failureHighlightPaths).toBeUndefined()
    expect(steps[1].label).toBe('Checkout')
    expect(steps[1].screenshotPaths).toEqual(['/step.png'])
    expect(steps[1].failureHighlightPaths).toBeUndefined()
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

  it('retries when file exists but JSON is incomplete then becomes valid', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-rj2-'))
    const file = path.join(dir, 'report.json')
    await fs.writeFile(file, '{"suites":[', 'utf8')
    const payload = JSON.stringify({ suites: [], stats: { duration: 0 } })
    setTimeout(() => {
      void fs.writeFile(file, payload, 'utf8')
    }, 150)
    const parsed = await readReportJsonWithRetry(file, { maxWaitMs: 5000, intervalMs: 30 })
    expect(Array.isArray(parsed.suites)).toBe(true)
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('retries when file is empty then filled', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-rj3-'))
    const file = path.join(dir, 'report.json')
    await fs.writeFile(file, '', 'utf8')
    const payload = JSON.stringify({ suites: [], stats: { duration: 0 } })
    setTimeout(() => {
      void fs.writeFile(file, payload, 'utf8')
    }, 150)
    const parsed = await readReportJsonWithRetry(file, { maxWaitMs: 5000, intervalMs: 30 })
    expect(Array.isArray(parsed.suites)).toBe(true)
    await fs.rm(dir, { recursive: true, force: true })
  })
})
