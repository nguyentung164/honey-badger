import { describe, expect, it } from 'vitest'
import type { TestCaseResult } from 'shared/automation/types'
import { allResultScreenshotGalleryPaths, pathsToOpenForFailureStep, scanFailureHighlightPathsByIndex } from './runScreenshotGallery'

describe('allResultScreenshotGalleryPaths', () => {
  it('puts failure-highlight images first in numeric order, then other screenshots', () => {
    const r = {
      id: '1',
      runId: 'run',
      caseId: '',
      browser: 'chromium',
      status: 'failed',
      durationMs: 1,
      attempts: 1,
      screenshotPaths: ['/artifacts/failure-highlight-2.png', '/artifacts/failure-highlight-1.png', '/artifacts/playwright.png'],
      failureSteps: [
        {
          label: 'Failure 1',
          message: 'a',
          screenshotPaths: ['/artifacts/playwright.png'],
        },
        {
          label: 'Failure 2',
          message: 'b',
          screenshotPaths: ['/artifacts/playwright.png'],
        },
      ],
    } as unknown as TestCaseResult

    const g = allResultScreenshotGalleryPaths(r)
    expect(g[0]).toBe('/artifacts/failure-highlight-1.png')
    expect(g[1]).toBe('/artifacts/failure-highlight-2.png')
    expect(g[2]).toBe('/artifacts/playwright.png')
    expect(g).toHaveLength(3)
  })

  it('maps Failure 2 to failure-highlight-2 when step field is empty but row has paths', () => {
    const caseResult = {
      id: '1',
      runId: 'run',
      caseId: '',
      browser: 'chromium',
      status: 'failed',
      durationMs: 1,
      attempts: 1,
      screenshotPaths: ['/x/failure-highlight-1.png', '/x/failure-highlight-2.png'],
      failureSteps: [
        { label: 'Failure 1', message: 'a', screenshotPaths: [] },
        { label: 'Failure 2', message: 'b', screenshotPaths: [] },
      ],
    } as unknown as TestCaseResult
    const scan = scanFailureHighlightPathsByIndex(caseResult)
    expect(scan.get(1)).toBe('/x/failure-highlight-1.png')
    expect(scan.get(2)).toBe('/x/failure-highlight-2.png')
    const p2 = pathsToOpenForFailureStep(caseResult.failureSteps![1], caseResult, 1, scan)
    expect(p2).toEqual(['/x/failure-highlight-2.png'])
  })

  it('excludes test-failed from gallery rest when any failure-highlight exists', () => {
    const caseResult = {
      id: '1',
      runId: 'run',
      caseId: '',
      browser: 'chromium',
      status: 'failed',
      durationMs: 1,
      attempts: 1,
      screenshotPaths: ['/h/failure-highlight-1.png', '/h/test-failed-1.png'],
      failureSteps: [],
    } as unknown as TestCaseResult
    expect(allResultScreenshotGalleryPaths(caseResult)).toEqual(['/h/failure-highlight-1.png'])
  })
})
