/**
 * Ảnh fail mặc định của Playwright (vd `test-failed-1.png`).
 * Khi hb-fixtures đã đính `failure-highlight-*.png`, ảnh này thường trùng nội dung / gây nhầm — bỏ khỏi gallery & fallback highlight.
 */
export function isPlaywrightDefaultFailureScreenshotPath(p: string | undefined | null): boolean {
  if (!p?.trim()) return false
  const base = p.trim().split(/[/\\]/).filter(Boolean).pop() ?? ''
  return /^test-failed(?:-\d+)?\.png$/i.test(base)
}
