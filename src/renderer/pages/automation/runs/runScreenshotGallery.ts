import type { TestCaseFailureStep, TestCaseResult } from 'shared/automation/types'
import { isPlaywrightDefaultFailureScreenshotPath } from 'shared/automation/playwrightFailureScreenshots'

export function pathDedupeKey(p: string): string {
  return p.trim().replace(/\\/g, '/').toLowerCase()
}

function artifactBasename(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).pop()?.trim() ?? ''
}

export function isFailureHighlightPath(p: string): boolean {
  return /^failure-highlight(?:-\d+)?\.png$/i.test(artifactBasename(p))
}

/** 1-based index từ tên file `failure-highlight-2.png` → 2; `failure-highlight.png` → 1. */
export function failureHighlightNumericIndex(p: string): number {
  const leaf = artifactBasename(p)
  const m = /^failure-highlight(?:-(\d+))?\.png$/i.exec(leaf)
  if (!m) return Number.MAX_SAFE_INTEGER
  return m[1] ? parseInt(m[1], 10) : 1
}

/** Quét toàn bộ path của case → map index N → path `failure-highlight-N` (dedupe). */
export function scanFailureHighlightPathsByIndex(r: TestCaseResult): Map<number, string> {
  const map = new Map<number, string>()
  const consider = (p: string | undefined) => {
    const x = p?.trim()
    if (!x || !isFailureHighlightPath(x)) return
    const n = failureHighlightNumericIndex(x)
    if (n === Number.MAX_SAFE_INTEGER) return
    if (!map.has(n)) map.set(n, x)
  }
  for (const s of r.failureSteps ?? []) {
    for (const p of s.failureHighlightPaths ?? []) consider(p)
  }
  for (const s of r.failureSteps ?? []) {
    for (const p of s.screenshotPaths ?? []) consider(p)
  }
  for (const p of r.screenshotPaths ?? []) consider(p)
  return map
}

function sortHl(paths: string[]): string[] {
  return [...paths].sort((a, b) => failureHighlightNumericIndex(a) - failureHighlightNumericIndex(b))
}

function parseFailureLabelNumber(label: string): number | undefined {
  const m = /^Failure (\d+)$/.exec(label.trim())
  return m ? Number(m[1]) : undefined
}

/**
 * Ảnh mở cho một dòng failure: ưu tiên `failureHighlightPaths`, rồi basename trong screenshotPaths,
 * rồi map theo nhãn `Failure N`, rồi theo thứ tự dòng (1-based) khớp `failure-highlight-{index}` trên toàn case.
 */
export function pathsToOpenForFailureStep(
  step: TestCaseFailureStep,
  caseResult: TestCaseResult,
  stepIndexZero: number,
  scan?: Map<number, string>
): string[] {
  const byIndex = scan ?? scanFailureHighlightPathsByIndex(caseResult)

  const direct = step.failureHighlightPaths ?? []
  if (direct.length > 0) return sortHl(direct)

  const leaf = (p: string) => p.split(/[/\\]/).filter(Boolean).pop() ?? ''
  const fromScreens = (step.screenshotPaths ?? []).filter(p => /failure-highlight(?:-\d+)?\.png$/i.test(leaf(p)))
  if (fromScreens.length > 0) return sortHl(fromScreens)

  const nLabel = parseFailureLabelNumber(step.label)
  if (nLabel != null) {
    const hit = byIndex.get(nLabel)
    if (hit) return [hit]
  }

  const byOrder = byIndex.get(stepIndexZero + 1)
  if (byOrder) return [byOrder]

  const hasHl = byIndex.size > 0
  const shots = step.screenshotPaths ?? []
  return shots.filter(p => !hasHl || !isPlaywrightDefaultFailureScreenshotPath(p))
}

/**
 * Gallery nút Image cột cuối: mọi `failure-highlight-{N}` của case (theo N tăng dần), sau đó các ảnh khác.
 */
export function allResultScreenshotGalleryPaths(r: TestCaseResult): string[] {
  const scan = scanFailureHighlightPathsByIndex(r)
  const hlSorted = [...scan.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p)

  const seen = new Set(hlSorted.map(pathDedupeKey))
  const out: string[] = [...hlSorted]

  const addRest = (raw: string | undefined) => {
    const x = raw?.trim()
    if (!x) return
    const k = pathDedupeKey(x)
    if (seen.has(k)) return
    if (isFailureHighlightPath(x)) return
    if (scan.size > 0 && isPlaywrightDefaultFailureScreenshotPath(x)) return
    seen.add(k)
    out.push(x)
  }

  for (const s of r.failureSteps ?? []) {
    for (const p of s.screenshotPaths ?? []) addRest(p)
  }
  for (const p of r.screenshotPaths ?? []) addRest(p)
  return out
}
