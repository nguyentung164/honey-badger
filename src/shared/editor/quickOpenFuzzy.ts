export type QuickOpenParsedQuery = {
  fileQuery: string
  line?: number
  column?: number
}

export type QuickOpenFuzzyMatch = {
  score: number
  fileName: string
  dirname: string
  /** Match indices within `fileName` for highlight rendering. */
  matchIndices: readonly number[]
}

const SEPARATOR_RE = /[-_./\\ ]/
const LINE_SUFFIX_RE = /:(\d+)(?::(\d+))?$/

/** Normalize path portion of a Quick Open query (forward slashes, no trailing spaces). */
export function normalizeQuickOpenFileQuery(fileQuery: string): string {
  return fileQuery.replace(/\\/g, '/').trim()
}

/**
 * VS Code Quick Open: `path:line` or `path:line:column`.
 * Line suffix is parsed from the end so Windows drive letters (`C:\…`) still work.
 */
export function parseQuickOpenQuery(raw: string): QuickOpenParsedQuery {
  const trimmed = raw.trim()
  const suffixMatch = trimmed.match(LINE_SUFFIX_RE)
  if (!suffixMatch?.[1] || suffixMatch.index == null) return { fileQuery: trimmed }

  const fileQuery = trimmed.slice(0, suffixMatch.index).trimEnd()
  if (!fileQuery) return { fileQuery: trimmed }

  const line = Number.parseInt(suffixMatch[1], 10)
  const column = suffixMatch[2] ? Number.parseInt(suffixMatch[2], 10) : undefined
  if (!Number.isFinite(line) || line <= 0) return { fileQuery: trimmed }

  return {
    fileQuery: normalizeQuickOpenFileQuery(fileQuery),
    line,
    column: column != null && Number.isFinite(column) && column > 0 ? column : undefined,
  }
}

/**
 * Resolve pasted absolute or partial paths to a repo-relative path from the file index.
 * e.g. `E:\repo\src\foo.ts` or `src\foo.ts` → `src/foo.ts`
 */
export function tryResolveQuickOpenFilePath(
  fileQuery: string,
  repoCwd: string,
  files: readonly string[],
): string | null {
  const q = normalizeQuickOpenFileQuery(fileQuery)
  if (!q) return null

  const fileSet = new Set(files)
  if (fileSet.has(q)) return q

  const qLower = q.toLowerCase()
  for (const f of files) {
    if (f.toLowerCase() === qLower) return f
  }

  const repo = normalizeQuickOpenFileQuery(repoCwd).replace(/\/+$/, '')
  const repoLower = repo.toLowerCase()
  if (repo && qLower.startsWith(`${repoLower}/`)) {
    const rel = q.slice(repo.length + 1)
    if (fileSet.has(rel)) return rel
    for (const f of files) {
      if (f.toLowerCase() === rel.toLowerCase()) return f
    }
  }

  let best: string | null = null
  for (const f of files) {
    const fl = f.toLowerCase()
    if (qLower === fl || qLower.endsWith(`/${fl}`)) {
      if (!best || f.length > best.length) best = f
    }
  }
  return best
}

function charAt(value: string, index: number): string {
  return value.charAt(index)
}

function isSeparatorAt(value: string, index: number): boolean {
  if (index < 0 || index >= value.length) return false
  return SEPARATOR_RE.test(charAt(value, index))
}

function isUpperCaseAt(value: string, index: number): boolean {
  const ch = value[index]
  if (!ch) return false
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase()
}

function charMatchScore(
  pattern: string,
  patternLow: string,
  patternPos: number,
  word: string,
  wordLow: string,
  wordPos: number,
  consecutive: number,
): number {
  if (patternLow[patternPos] !== wordLow[wordPos]) return Number.MIN_SAFE_INTEGER

  let score = 1

  if (wordPos === patternPos) {
    score = pattern[patternPos] === word[wordPos] ? 7 : 5
  } else if (isUpperCaseAt(word, wordPos) && (wordPos === 0 || !isUpperCaseAt(word, wordPos - 1))) {
    score = pattern[patternPos] === word[wordPos] ? 7 : 5
  } else if (isSeparatorAt(word, wordPos) && (wordPos === 0 || !isSeparatorAt(word, wordPos - 1))) {
    score = 5
  } else if (wordPos > 0 && (isSeparatorAt(word, wordPos - 1) || word[wordPos - 1] === ' ' || word[wordPos - 1] === '\t')) {
    score = 5
  }

  if (consecutive > 1) score += (consecutive - 1) * 4
  if (patternPos === 0 && wordPos > 0) score -= 5

  return score
}

/** Cheap subsequence prefilter — run before the DP scorer on large indexes. */
export function isPatternSubsequence(patternLow: string, wordLow: string): boolean {
  let pi = 0
  for (let wi = 0; wi < wordLow.length && pi < patternLow.length; wi++) {
    if (patternLow[pi] === wordLow[wi]) pi++
  }
  return pi === patternLow.length
}

/** VS Code-style fuzzy score for a single label (filename or path). */
export function fuzzyScoreLabel(pattern: string, word: string): { score: number; matchIndices: number[] } | null {
  if (!pattern) return { score: 0, matchIndices: [] }
  if (pattern.length > word.length) return null

  const patternLow = pattern.toLowerCase()
  const wordLow = word.toLowerCase()
  if (!isPatternSubsequence(patternLow, wordLow)) return null

  const pLen = pattern.length
  const wLen = word.length
  const neg = Number.MIN_SAFE_INTEGER / 4

  const table = Array.from({ length: pLen + 1 }, () => Array<number>(wLen + 1).fill(neg))
  const diag = Array.from({ length: pLen + 1 }, () => Array<number>(wLen + 1).fill(0))
  const fromDiag = Array.from({ length: pLen + 1 }, () => Array<boolean>(wLen + 1).fill(false))

  const baseRow = table[0]
  if (!baseRow) return null
  for (let w = 0; w <= wLen; w++) baseRow[w] = 0

  for (let p = 1; p <= pLen; p++) {
    const row = table[p]
    const prevRow = table[p - 1]
    const diagRow = diag[p]
    const prevDiagRow = diag[p - 1]
    const fromDiagRow = fromDiag[p]
    if (!row || !prevRow || !diagRow || !prevDiagRow || !fromDiagRow) continue

    for (let w = 1; w <= wLen; w++) {
      row[w] = row[w - 1] ?? neg

      if (patternLow[p - 1] !== wordLow[w - 1]) continue

      const consecutive = (prevDiagRow[w - 1] ?? 0) + 1
      const matchScore = charMatchScore(pattern, patternLow, p - 1, word, wordLow, w - 1, consecutive)
      const candidate = (prevRow[w - 1] ?? neg) + matchScore

      if (candidate > (row[w] ?? neg)) {
        row[w] = candidate
        diagRow[w] = consecutive
        fromDiagRow[w] = true
      }
    }
  }

  const finalRow = table[pLen]
  if (!finalRow) return null

  let bestW = -1
  let bestScore = neg
  for (let w = pLen; w <= wLen; w++) {
    const s = finalRow[w] ?? neg
    if (s > bestScore) {
      bestScore = s
      bestW = w
    }
  }

  if (bestW < 0 || bestScore <= neg / 2) return null

  const matchIndices: number[] = []
  let p = pLen
  let w = bestW
  while (p > 0 && w > 0) {
    const fromDiagRow = fromDiag[p]
    if (fromDiagRow?.[w]) {
      matchIndices.push(w - 1)
      p--
      w--
    } else {
      w--
    }
  }

  matchIndices.reverse()
  return { score: bestScore, matchIndices }
}

export function splitQuickOpenPath(relativePath: string): { fileName: string; dirname: string } {
  const normalized = relativePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  if (slash < 0) return { fileName: normalized, dirname: '' }
  return { fileName: normalized.slice(slash + 1), dirname: normalized.slice(0, slash) }
}

export function formatQuickOpenDirname(dirname: string): string {
  return dirname.replace(/\//g, '\\')
}

export function scoreQuickOpenPath(fileQuery: string, relativePath: string): QuickOpenFuzzyMatch | null {
  const { fileName, dirname } = splitQuickOpenPath(relativePath)
  const normalized = relativePath.replace(/\\/g, '/')
  const query = normalizeQuickOpenFileQuery(fileQuery)

  const fileMatch = fuzzyScoreLabel(query, fileName)
  if (fileMatch) {
    return {
      score: fileMatch.score * 1000 + Math.max(0, 200 - fileName.length),
      fileName,
      dirname,
      matchIndices: fileMatch.matchIndices,
    }
  }

  const pathMatch = fuzzyScoreLabel(query, normalized)
  if (!pathMatch) return null

  const fileStart = normalized.lastIndexOf('/') + 1
  const fileIndices = pathMatch.matchIndices.filter(i => i >= fileStart).map(i => i - fileStart)

  return {
    score: pathMatch.score * 10 + Math.max(0, 100 - normalized.length),
    fileName,
    dirname,
    matchIndices: fileIndices,
  }
}
