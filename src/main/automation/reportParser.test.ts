import { unlinkSync, writeFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFailureStepsList, mergeHbFullStepsFromDisk, overallStatusFromSummary, parsePlaywrightReport, readReportJsonWithRetry } from './reportParser'

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
    expect(tc2?.failureSteps?.[0].summary).toContain('selector not found')
    expect(tc2?.failureSteps?.[0].screenshotPaths).toContain('/tmp/a.png')
  })

  it('extracts nested report steps for UI (preorder)', () => {
    const report = {
      stats: { duration: 1, startTime: '2026-05-12T12:00:00.000Z' },
      suites: [
        {
          specs: [
            {
              title: 'x',
              file: 'a.spec.ts',
              tests: [
                {
                  title: 'my test',
                  projectName: 'chromium',
                  results: [
                    {
                      status: 'passed',
                      duration: 10,
                      steps: [
                        { title: 'Before Hooks', category: 'hook', duration: 2 },
                        {
                          title: 'Navigate',
                          category: 'pw:api',
                          duration: 100,
                          location: { file: 'tests/Test.spec.ts', line: 4 },
                          steps: [{ title: 'Inner', duration: 50, location: { file: 'tests/Test.spec.ts', line: 9 } }],
                        },
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
    const r = parsed.results[0]
    expect(r?.reportSteps?.map(s => ({ t: s.title, d: s.depth, loc: s.location?.line, nested: s.hasNestedSteps }))).toEqual([
      { t: 'Before Hooks', d: 0, loc: undefined, nested: undefined },
      { t: 'Navigate', d: 0, loc: 4, nested: true },
      { t: 'Inner', d: 1, loc: 9, nested: undefined },
    ])
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
  it('maps errorContext from errors[] onto each failure step (Playwright 1.60+)', () => {
    const last = {
      status: 'failed',
      errors: [
        { message: 'first', errorContext: '  aria: button "OK"  \n' },
        { message: 'second', errorContext: '- heading "Title" [level=1]' },
      ],
      attachments: [
        { name: 'failure-highlight-1.png', path: '/h1.png', contentType: 'image/png' },
        { name: 'failure-highlight-2.png', path: '/h2.png', contentType: 'image/png' },
      ],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps).toHaveLength(2)
    expect(steps[0].errorContext).toBe('aria: button "OK"')
    expect(steps[1].errorContext).toBe('- heading "Title" [level=1]')
  })

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

  it('carries errorContext from nested test.step errors', () => {
    const last = {
      status: 'failed',
      attachments: [],
      steps: [
        {
          title: 'Login',
          error: { message: 'bad creds', errorContext: '- textbox [active]' },
          attachments: [],
        },
      ],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps).toHaveLength(1)
    expect(steps[0].errorContext).toBe('- textbox [active]')
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

  it('fills summary and prefers JSON error.location over stack', () => {
    const last = {
      status: 'failed',
      errors: [
        {
          message: `Error: timeout\n\n  at tests/foo.spec.ts:10:5`,
          location: { file: 'tests/bar.spec.ts', line: 99, column: 1 },
        },
      ],
      attachments: [],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps).toHaveLength(1)
    expect(steps[0].location?.file).toBe('tests/bar.spec.ts')
    expect(steps[0].location?.line).toBe(99)
    expect(steps[0].summary).toContain('timeout')
  })

  it('derives location from stack when JSON location missing', () => {
    const last = {
      status: 'failed',
      errors: [
        {
          message: `Error: boom\n\n  at tests/e2e/login.spec.ts:42:10`,
        },
      ],
      attachments: [],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].location?.file).toContain('login.spec.ts')
    expect(steps[0].location?.line).toBe(42)
  })

  it('omits Call log from summary for long Playwright messages', () => {
    const last = {
      status: 'failed',
      errors: [
        {
          message: `Error: expect(locator).toBeVisible() failed\n\nLocator: here\n\nCall log:\n  - timeout 5000ms`,
        },
      ],
      attachments: [],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].summary).toContain('expect(locator)')
    expect(steps[0].summary).not.toContain('timeout 5000ms')
  })

  it('fills assertionHints from Playwright-style message and matcherResult', () => {
    const last = {
      status: 'failed',
      errors: [
        {
          message: `Error: expect failed

Expected: 1
Received: 2

Call log:
x`,
          matcherResult: { expected: 9, actual: 9 },
        },
      ],
      attachments: [],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].assertionHints?.expected).toContain('1')
    expect(steps[0].assertionHints?.received).toContain('2')
  })

  it('uses matcherResult expected/actual when message has no Received', () => {
    const last = {
      status: 'failed',
      errors: [{ message: 'Error: boom\n', matcherResult: { expected: 'a', actual: 'b' } }],
      attachments: [],
    }
    const steps = buildFailureStepsList(last as any)
    expect(steps[0].assertionHints?.expected).toBe('a')
    expect(steps[0].assertionHints?.received).toBe('b')
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

describe('mergeHbFullStepsFromDisk', () => {
  it('overlays reportSteps from hb file by Playwright test id', () => {
    const report = {
      stats: { duration: 1, startTime: '2026-05-12T12:00:00.000Z' },
      suites: [
        {
          specs: [
            {
              id: 'tid-hb-1',
              title: 't',
              file: 'a.spec.ts',
              tests: [
                {
                  title: 't',
                  projectName: 'chromium',
                  results: [{ status: 'passed', duration: 10, steps: [] }],
                },
              ],
            },
          ],
        },
      ],
    }
    const parsed = parsePlaywrightReport(report as any)
    const hb = path.join(os.tmpdir(), `hb-full-steps-merge-${Date.now()}.json`)
    try {
      writeFileSync(
        hb,
        JSON.stringify({
          v: 1,
          tests: { 'tid-hb-1': [{ title: 'Click me', depth: 0, durationMs: 12 }] },
        }),
        'utf8'
      )
      mergeHbFullStepsFromDisk(parsed, hb)
      expect(parsed.results[0].reportSteps?.[0]?.title).toBe('Click me')
    } finally {
      try {
        unlinkSync(hb)
      } catch {
        // ignore
      }
    }
  })
})
