import { fileUriToPath, joinRepoPath, normalizeAbsolutePath } from 'shared/fileUri'

const MODULE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
const INDEX_EXTENSIONS = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs']

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

function dirname(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const idx = normalized.lastIndexOf('/')
  return idx < 0 ? '' : normalized.slice(0, idx)
}

function joinRelative(baseDir: string, segment: string): string {
  const parts = baseDir ? baseDir.split('/') : []
  for (const part of segment.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/** Map bare specifier using tsconfig paths (project aliases). */
function mapBareSpecifier(specifier: string): string[] {
  if (specifier.startsWith('@/')) {
    return [normalizeRelativePath(`src/renderer/${specifier.slice(2)}`)]
  }
  if (specifier.startsWith('~/')) {
    return [normalizeRelativePath(specifier.slice(2))]
  }
  return [normalizeRelativePath(specifier)]
}

function buildBaseCandidates(specifier: string, fromRelativePath: string): string[] {
  if (specifier.startsWith('.')) {
    return [joinRelative(dirname(fromRelativePath), specifier)]
  }
  return mapBareSpecifier(specifier)
}

function expandFileCandidates(basePath: string): string[] {
  const normalized = normalizeRelativePath(basePath)
  const out = new Set<string>()
  for (const ext of MODULE_EXTENSIONS) {
    out.add(normalized + ext)
  }
  for (const indexFile of INDEX_EXTENSIONS) {
    out.add(`${normalized}/${indexFile}`)
  }
  return [...out]
}

async function pathEntryKind(relativePath: string, repoCwd: string): Promise<'file' | 'directory' | 'missing'> {
  return window.api.system.get_path_entry_kind({ relativePath, cwd: repoCwd })
}

/**
 * Resolve a TS/JS import specifier to a repo-relative file path.
 * Uses tsconfig-style aliases and probes common extensions / index files.
 */
export async function resolveTypeScriptModulePath(
  specifier: string,
  fromRelativePath: string,
  repoCwd: string
): Promise<string | null> {
  if (!specifier || !repoCwd) return null
  if (specifier.startsWith('node:')) return null

  const bases = buildBaseCandidates(specifier, fromRelativePath)
  for (const base of bases) {
    for (const candidate of expandFileCandidates(base)) {
      const kind = await pathEntryKind(candidate, repoCwd)
      if (kind === 'file') return candidate
    }
    const dirKind = await pathEntryKind(base, repoCwd)
    if (dirKind === 'directory') {
      for (const indexFile of INDEX_EXTENSIONS) {
        const candidate = `${base}/${indexFile}`
        const kind = await pathEntryKind(candidate, repoCwd)
        if (kind === 'file') return candidate
      }
    }
  }
  return null
}

export function relativePathFromDocumentUri(uri: string, repoCwd: string): string | null {
  if (!uri.startsWith('file:') || !repoCwd) return null
  try {
    const abs = normalizeAbsolutePath(fileUriToPath(uri))
    const root = normalizeAbsolutePath(repoCwd)
    const absLower = abs.toLowerCase()
    const rootLower = root.toLowerCase()
    if (!absLower.startsWith(rootLower)) return null
    const rel = abs.slice(root.length).replace(/^[/\\]+/, '')
    return normalizeRelativePath(rel)
  } catch {
    return null
  }
}

export function isPathInsideWorkspace(absPath: string, repoCwd: string): boolean {
  const abs = normalizeAbsolutePath(absPath).toLowerCase()
  const root = normalizeAbsolutePath(repoCwd).toLowerCase()
  return abs === root || abs.startsWith(`${root}/`)
}

export function absolutePathFromRelative(relativePath: string, repoCwd: string): string {
  return joinRepoPath(repoCwd, relativePath)
}
