import { normalizeRepoRelativePath } from '@/pages/editor/lib/fileTreePaths'
import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

export function resolveContextMenuPaths(selectedPaths: ReadonlySet<string>, targetPath: string): string[] {
  if (selectedPaths.size > 0 && selectedPaths.has(targetPath)) {
    return [...selectedPaths].sort()
  }
  return [targetPath]
}

export function rangeSelectPaths(rows: readonly FileTreeRow[], anchorPath: string, targetPath: string): Set<string> {
  const anchorIdx = rows.findIndex(r => r.node.relativePath === anchorPath)
  const targetIdx = rows.findIndex(r => r.node.relativePath === targetPath)
  if (anchorIdx < 0 || targetIdx < 0) return new Set([targetPath])

  const from = Math.min(anchorIdx, targetIdx)
  const to = Math.max(anchorIdx, targetIdx)
  return new Set(rows.slice(from, to + 1).map(r => r.node.relativePath))
}

export function toggleSelectionPath(selectedPaths: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selectedPaths)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  return next
}

export function selectedFilePaths(rows: readonly FileTreeRow[], selectedPaths: ReadonlySet<string>): string[] {
  return rows.filter(r => r.node.kind === 'file' && selectedPaths.has(r.node.relativePath)).map(r => r.node.relativePath)
}

export function remapSelectionPath(path: string, from: string, to: string): string {
  const normalized = normalizeRepoRelativePath(path)
  const fromNorm = normalizeRepoRelativePath(from)
  const toNorm = normalizeRepoRelativePath(to)
  if (normalized === fromNorm) return toNorm
  if (normalized.startsWith(`${fromNorm}/`)) return `${toNorm}${normalized.slice(fromNorm.length)}`
  return path
}

export function remapSelectionPaths(paths: ReadonlySet<string>, from: string, to: string): Set<string> {
  const next = new Set<string>()
  for (const path of paths) next.add(remapSelectionPath(path, from, to))
  return next
}

export function pruneDeletedSelectionPaths(paths: ReadonlySet<string>, deletedPath: string, isDir: boolean): Set<string> {
  const target = normalizeRepoRelativePath(deletedPath)
  const next = new Set<string>()
  for (const path of paths) {
    const current = normalizeRepoRelativePath(path)
    if (isDir) {
      if (current === target || current.startsWith(`${target}/`)) continue
    } else if (current === target) {
      continue
    }
    next.add(path)
  }
  return next
}
