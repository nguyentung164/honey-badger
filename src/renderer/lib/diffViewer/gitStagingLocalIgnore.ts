import { gitStagingRepoRootKey } from '@/lib/diffViewer/openDiffViewer'
import type { DiffViewerFileEntry } from '@/pages/diffviewer/diffViewerPayload'

export const GIT_CHANGES_LOCAL_IGNORE_STORAGE_KEY = 'git-changes-local-ignore-regexes'

export function readLocalIgnoreRegexMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(GIT_CHANGES_LOCAL_IGNORE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every(x => typeof x === 'string')) out[k] = v as string[]
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function readLocalIgnorePatternsForRepo(repoKey: string): string[] {
  return readLocalIgnoreRegexMap()[repoKey] ?? []
}

export function writeLocalIgnorePatternsForRepo(repoKey: string, patterns: string[]): void {
  const map = readLocalIgnoreRegexMap()
  if (patterns.length === 0) delete map[repoKey]
  else map[repoKey] = patterns
  localStorage.setItem(GIT_CHANGES_LOCAL_IGNORE_STORAGE_KEY, JSON.stringify(map))
}

function tryCompileRegex(p: string): RegExp | null {
  try {
    return new RegExp(p)
  } catch {
    return null
  }
}

function basenameFromFilePath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}

function normalizeGitPath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/** Each pattern is tested against basename and against normalized path (forward slashes). */
export function pathMatchesLocalIgnore(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false
  const norm = normalizeGitPath(filePath)
  const basename = basenameFromFilePath(filePath)
  for (const p of patterns) {
    const re = tryCompileRegex(p)
    if (re && (re.test(basename) || re.test(norm))) return true
  }
  return false
}

export function filterDiffViewerFilesByLocalIgnore(files: DiffViewerFileEntry[], repoCwd?: string | null): DiffViewerFileEntry[] {
  const patterns = readLocalIgnorePatternsForRepo(gitStagingRepoRootKey(repoCwd))
  if (patterns.length === 0) return files
  return files.filter(f => !pathMatchesLocalIgnore(f.filePath, patterns))
}
