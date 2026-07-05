import { fileUriToPath, joinRepoPath, normalizeAbsolutePath } from 'shared/fileUri'

const MODULE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
const WORKSPACE_MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs']
const INDEX_EXTENSIONS = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs']
const WORKSPACE_INDEX_EXTENSIONS = ['index.tsx', 'index.ts', 'index.jsx', 'index.js']

const resolveCache = new Map<string, string | null>()

function resolveCacheKey(specifier: string, fromRelativePath: string, repoCwd: string): string {
  return `${repoCwd}|${fromRelativePath}|${specifier}`
}

function isWorkspaceSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('~/')
}

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

function expandFileCandidates(basePath: string, workspaceStyle: boolean): string[] {
  const normalized = normalizeRelativePath(basePath)
  const extensions = workspaceStyle ? WORKSPACE_MODULE_EXTENSIONS : MODULE_EXTENSIONS
  const indexFiles = workspaceStyle ? WORKSPACE_INDEX_EXTENSIONS : INDEX_EXTENSIONS
  const out = new Set<string>()
  for (const ext of extensions) {
    out.add(normalized + ext)
  }
  for (const indexFile of indexFiles) {
    out.add(`${normalized}/${indexFile}`)
  }
  return [...out]
}

async function findFirstExistingFile(
  candidates: readonly string[],
  repoCwd: string
): Promise<string | null> {
  const batchSize = 6
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)
    const hits = await Promise.all(
      batch.map(async candidate => {
        const kind = await pathEntryKind(candidate, repoCwd)
        return kind === 'file' ? candidate : null
      })
    )
    const found = hits.find(Boolean)
    if (found) return found
  }
  return null
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

  const cacheKey = resolveCacheKey(specifier, fromRelativePath, repoCwd)
  if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey) ?? null

  const workspaceStyle = isWorkspaceSpecifier(specifier)
  const bases = buildBaseCandidates(specifier, fromRelativePath)
  for (const base of bases) {
    const found = await findFirstExistingFile(expandFileCandidates(base, workspaceStyle), repoCwd)
    if (found) {
      resolveCache.set(cacheKey, found)
      return found
    }
    if (!workspaceStyle) {
      const dirKind = await pathEntryKind(base, repoCwd)
      if (dirKind === 'directory') {
        const indexFound = await findFirstExistingFile(
          INDEX_EXTENSIONS.map(indexFile => `${base}/${indexFile}`),
          repoCwd
        )
        if (indexFound) {
          resolveCache.set(cacheKey, indexFound)
          return indexFound
        }
      }
    }
  }

  resolveCache.set(cacheKey, null)
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
