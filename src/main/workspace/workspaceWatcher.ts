import chokidar from 'chokidar'
import type { WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'

type WatchSession = {
  watcher: ReturnType<typeof chokidar.watch>
  rootPath: string
}

const sessions = new Map<number, WatchSession>()

const IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.vite/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.cursor/**',
  '**/.gitnexus/**',
]

export function watchWorkspace(sender: WebContents, rootPath: string): { success: boolean; error?: string } {
  const id = sender.id
  unwatchWorkspace(sender)

  if (!rootPath?.trim()) {
    return { success: false, error: 'No workspace root' }
  }

  try {
    const watcher = chokidar.watch(rootPath, {
      ignored: IGNORED,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      depth: 99,
    })

    const emit = (relativePath: string, event: 'add' | 'change' | 'unlink') => {
      if (!sender.isDestroyed()) {
        sender.send(IPC.SYSTEM.WORKSPACE_FILE_CHANGED, { relativePath, event })
      }
    }

    watcher.on('add', p => emit(normalizeRelative(rootPath, p), 'add'))
    watcher.on('change', p => emit(normalizeRelative(rootPath, p), 'change'))
    watcher.on('unlink', p => emit(normalizeRelative(rootPath, p), 'unlink'))
    watcher.on('error', err => l.warn('workspace watcher error:', err))

    sessions.set(id, { watcher, rootPath })
    return { success: true }
  } catch (err) {
    l.error('watchWorkspace failed:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function unwatchWorkspace(sender: WebContents): void {
  const id = sender.id
  const session = sessions.get(id)
  if (!session) return
  void session.watcher.close()
  sessions.delete(id)
}

export function unwatchAllWorkspaces(): void {
  for (const [, session] of sessions) {
    void session.watcher.close()
  }
  sessions.clear()
}

function normalizeRelative(rootPath: string, absolutePath: string): string {
  const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const abs = absolutePath.replace(/\\/g, '/')
  if (abs.startsWith(`${root}/`)) return abs.slice(root.length + 1)
  return abs
}
