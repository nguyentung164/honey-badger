type WorkspaceFileChangeEvent = 'add' | 'change' | 'unlink'

type FileIndexCache = {
  files: string[]
  updatedAt: number
}

const cacheByCwd = new Map<string, FileIndexCache>()
const inflightByCwd = new Map<string, Promise<string[]>>()

/** Lowercase (slash-normalized) paths per index array — computed once, keyed by array identity. */
const lowercasePathsByFiles = new WeakMap<readonly string[], readonly string[]>()

export function getQuickOpenLowercasePaths(files: readonly string[]): readonly string[] {
  const cached = lowercasePathsByFiles.get(files)
  if (cached) return cached
  const lows = files.map(path => path.replace(/\\/g, '/').toLowerCase())
  lowercasePathsByFiles.set(files, lows)
  return lows
}

/** VS Code file index via ripgrep --files (respects .gitignore). */
async function collectWorkspaceFilesRipgrep(cwd: string, maxFiles = 20_000): Promise<string[]> {
  const result = await window.api.system.list_workspace_files({ cwd, maxFiles })
  return result.files
}

function writeCache(cwd: string, files: string[]) {
  cacheByCwd.set(cwd, { files, updatedAt: Date.now() })
}

export function peekQuickOpenFiles(cwd: string): readonly string[] | null {
  return cacheByCwd.get(cwd)?.files ?? null
}

export function prewarmQuickOpenFileIndex(cwd: string): void {
  if (!cwd || cacheByCwd.has(cwd) || inflightByCwd.has(cwd)) return
  void getQuickOpenFiles(cwd)
}

export async function getQuickOpenFiles(cwd: string, opts?: { force?: boolean }): Promise<string[]> {
  if (!cwd) return []

  if (!opts?.force) {
    const cached = cacheByCwd.get(cwd)
    if (cached) return cached.files
  }

  const inflight = inflightByCwd.get(cwd)
  if (inflight) return inflight

  const promise = collectWorkspaceFilesRipgrep(cwd)
    .then(files => {
      writeCache(cwd, files)
      return files
    })
    .finally(() => {
      inflightByCwd.delete(cwd)
    })

  inflightByCwd.set(cwd, promise)
  return promise
}

export function patchQuickOpenFileIndex(cwd: string, relativePath: string, event: WorkspaceFileChangeEvent): void {
  const cached = cacheByCwd.get(cwd)
  if (!cached) return

  const normalized = relativePath.replace(/\\/g, '/')

  if (event === 'add') {
    if (!cached.files.includes(normalized)) {
      cached.files = [...cached.files, normalized].sort((a, b) => a.localeCompare(b))
      cached.updatedAt = Date.now()
    }
    return
  }

  if (event === 'unlink') {
    cached.files = cached.files.filter(path => path !== normalized && !path.startsWith(`${normalized}/`))
    cached.updatedAt = Date.now()
  }
}

// TODO(Plan 2): call when explorer refresh runs so Quick Open file index stays current.
export function invalidateQuickOpenFileIndex(cwd: string): void {
  cacheByCwd.delete(cwd)
  inflightByCwd.delete(cwd)
}
