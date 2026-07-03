type WorkspaceFileChangeEvent = 'add' | 'change' | 'unlink'

type FileIndexCache = {
  files: string[]
  updatedAt: number
}

const cacheByCwd = new Map<string, FileIndexCache>()
const inflightByCwd = new Map<string, Promise<string[]>>()

async function collectWorkspaceFiles(cwd: string, maxFiles = 4000): Promise<string[]> {
  const files: string[] = []
  const queue = ['']
  const seen = new Set<string>()

  while (queue.length > 0 && files.length < maxFiles) {
    const dir = queue.shift()
    if (dir === undefined) break
    if (seen.has(dir)) continue
    seen.add(dir)
    try {
      const result = await window.api.system.list_dir({ relativePath: dir, cwd })
      for (const entry of result.entries) {
        if (entry.kind === 'directory') {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            queue.push(entry.relativePath)
          }
        } else {
          files.push(entry.relativePath)
        }
      }
    } catch {
      /* skip unreadable dirs */
    }
  }

  return files.sort((a, b) => a.localeCompare(b))
}

function writeCache(cwd: string, files: string[]) {
  cacheByCwd.set(cwd, { files, updatedAt: Date.now() })
}

/** Cached file list for instant Quick Open (VS Code keeps a workspace index). */
export function peekQuickOpenFiles(cwd: string): readonly string[] | null {
  return cacheByCwd.get(cwd)?.files ?? null
}

/** Scan workspace in background when a folder is opened. */
export function prewarmQuickOpenFileIndex(cwd: string): void {
  if (!cwd || cacheByCwd.has(cwd) || inflightByCwd.has(cwd)) return
  void getQuickOpenFiles(cwd)
}

/** Returns cached files immediately when available; dedupes concurrent scans. */
export async function getQuickOpenFiles(cwd: string, opts?: { force?: boolean }): Promise<string[]> {
  if (!cwd) return []

  if (!opts?.force) {
    const cached = cacheByCwd.get(cwd)
    if (cached) return cached.files
  }

  const inflight = inflightByCwd.get(cwd)
  if (inflight) return inflight

  const promise = collectWorkspaceFiles(cwd)
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

/** Incremental updates from workspace watcher; full rescan only when unknown. */
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
    return
  }

  // File content changes do not affect the path list.
}

export function invalidateQuickOpenFileIndex(cwd: string): void {
  cacheByCwd.delete(cwd)
  inflightByCwd.delete(cwd)
}
