/**
 * Parse đường dẫn file spec từ chuỗi list reporter / `currentTest` (Playwright).
 * Dùng chung main + renderer để map tiến độ → màn hình catalog.
 */

/** Stem an toàn cho tên file spec — khớp `getSpecStemForCaseCode` / `getSpecFile` ở main. */
export function caseCodeToSpecStem(caseCode: string): string {
  return caseCode.replace(/[^A-Za-z0-9._-]/g, '_')
}

/**
 * Trích đường dẫn tương đối kiểu `tests/foo.spec.ts` từ hậu tố dòng list reporter
 * (ví dụ `[chromium] › tests/TC-01.spec.ts › Title`).
 */
export function parseSpecRelPathFromReporterLine(line: string): string | null {
  if (!line?.trim()) return null
  const normalized = line.replace(/\\/g, '/')
  // Playwright: ... › path/to/file.spec.ts › test title
  const arrow = /[›>]\s*([^\s›]+\.spec\.(?:ts|tsx|js|jsx))\s*[›>]/i.exec(normalized)
  if (arrow?.[1]) return arrow[1].replace(/\\/g, '/')
  const tail = /[›>]\s*([^\s›]+\.spec\.(?:ts|tsx|js|jsx))\s*$/i.exec(normalized)
  if (tail?.[1]) return tail[1].replace(/\\/g, '/')
  const bare = /\b(tests\/[^\s›]+\.spec\.(?:ts|tsx|js|jsx))\b/i.exec(normalized)
  if (bare?.[1]) return bare[1]
  return null
}

/** Từ `tests/TC_01.spec.ts` → `TC_01`. */
export function specRelPathToStem(relPath: string): string | null {
  const seg = relPath.replace(/\\/g, '/').split('/').pop()
  if (!seg || !/\.spec\.(ts|tsx|js|jsx)$/i.test(seg)) return null
  return seg.replace(/\.spec\.(ts|tsx|js|jsx)$/i, '')
}
