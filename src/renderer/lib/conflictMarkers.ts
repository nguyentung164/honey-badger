/**
 * Parse Git/SVN conflict markers in file content.
 * Returns ranges for deltaDecorations to highlight conflict blocks.
 */

export interface ConflictBlock {
  type: 'ours' | 'separator' | 'theirs'
  startLine: number
  endLine: number
}

const OURS_START = /^\s*<<<<<<</
const SEPARATOR = /^\s*=======/
const THEIRS_END = /^\s*>>>>>>>/

/**
 * Parse file content and return conflict marker blocks for decoration.
 */
export function parseConflictMarkers(content: string): ConflictBlock[] {
  if (!content.includes('<<<<<<<')) return []
  const blocks: ConflictBlock[] = []
  const lines = content.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const lineNum = i + 1

    if (OURS_START.test(line)) {
      blocks.push({ type: 'ours', startLine: lineNum, endLine: lineNum })
      i++
      continue
    }

    if (SEPARATOR.test(line)) {
      blocks.push({ type: 'separator', startLine: lineNum, endLine: lineNum })
      i++
      continue
    }

    if (THEIRS_END.test(line)) {
      blocks.push({ type: 'theirs', startLine: lineNum, endLine: lineNum })
      i++
      continue
    }

    i++
  }

  return blocks
}

/**
 * Check if content still has unresolved conflict markers.
 */
export function hasConflictMarkers(content: string): boolean {
  return content.split('\n').some(line => OURS_START.test(line) || SEPARATOR.test(line) || THEIRS_END.test(line))
}

/** Một khối conflict chuẩn Git: <<<<<<< … ======= … >>>>>>> */
export interface GitConflictHunkRegion {
  start: number
  end: number
  ours: string
  theirs: string
}

export function extractGitConflictHunks(content: string): GitConflictHunkRegion[] {
  const text = content.replace(/\r\n/g, '\n')
  if (!text.includes('<<<<<<<')) return []
  const hunks: GitConflictHunkRegion[] = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('<<<<<<<', i)
    if (start === -1) break
    const line1End = text.indexOf('\n', start)
    if (line1End === -1) break
    const sep = text.indexOf('\n=======\n', line1End)
    if (sep === -1) break
    // Bao gồm \n ngay trước ======= (kết thúc block ours) — slice(..., sep) đã vô tình bỏ mất nó.
    const ours = text.slice(line1End + 1, sep + 1)
    const theirsStart = sep + '\n=======\n'.length
    const endMarker = text.indexOf('\n>>>>>>>', theirsStart)
    if (endMarker === -1) break
    // Bao gồm \n ngay trước >>>>>>> (kết thúc block theirs).
    const theirs = text.slice(theirsStart, endMarker + 1)
    const lineAfterEnd = text.indexOf('\n', endMarker + 1)
    const end = lineAfterEnd === -1 ? text.length : lineAfterEnd + 1
    hunks.push({ start, end, ours, theirs })
    i = end
  }
  return hunks
}

/** Dòng 1-based tương ứng với offset (0-based) trong chuỗi. */
export function lineNumberAtOffset(content: string, offset: number): number {
  if (offset <= 0) return 1
  const slice = content.slice(0, Math.min(offset, content.length))
  let n = 1
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === '\n') n++
  }
  return n
}

/** Giải quyết một hunk conflict (giữ các hunk khác nguyên). */
export function resolveSingleConflictHunk(
 content: string,
 hunkIndex: number,
 choice: 'ours' | 'theirs' | 'both',
): string {
  const normalized = content.replace(/\r\n/g, '\n')
  const hunks = extractGitConflictHunks(normalized)
  if (hunkIndex < 0 || hunkIndex >= hunks.length) return content
  const h = hunks[hunkIndex]
  let replacement: string
  if (choice === 'ours') {
    replacement = h.ours
  } else if (choice === 'theirs') {
    replacement = h.theirs
  } else {
    const o = h.ours
    const th = h.theirs
    if (o.length === 0) replacement = th
    else if (th.length === 0) replacement = o
    else if (o.endsWith('\n') || th.startsWith('\n')) replacement = o + th
    else replacement = `${o}\n${th}`
  }
  return normalized.slice(0, h.start) + replacement + normalized.slice(h.end)
}

export function buildResolvedFromHunkChoices(
  original: string,
  choices: ('ours' | 'theirs')[],
): { ok: true; result: string } | { ok: false; error: string } {
  const normalized = original.replace(/\r\n/g, '\n')
  const hunks = extractGitConflictHunks(normalized)
  if (hunks.length !== choices.length) {
    return { ok: false, error: 'conflict_hunk_count_mismatch' }
  }
  let result = ''
  let pos = 0
  for (let i = 0; i < hunks.length; i++) {
    result += normalized.slice(pos, hunks[i].start)
    result += choices[i] === 'ours' ? hunks[i].ours : hunks[i].theirs
    pos = hunks[i].end
  }
  result += normalized.slice(pos)
  return { ok: true, result }
}
