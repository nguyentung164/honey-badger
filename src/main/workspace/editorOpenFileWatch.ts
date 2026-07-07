import path from 'node:path'
import type { WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from 'main/constants'

/** Absolute paths for files open in the embedded editor — fast reload lane (always on). */
const openFilesBySender = new Map<number, Set<string>>()

let dedicatedWatcher: FSWatcher | null = null
let watchedPathSignature = ''

/** Paths to ignore editor-open-file watch briefly after app self-write (ms). */
const suppressWatchUntil = new Map<string, number>()
const SELF_WRITE_SUPPRESS_MS = 250

function normalizeAbs(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/').toLowerCase()
}

function pathsMatch(a: string, b: string): boolean {
  return normalizeAbs(a) === normalizeAbs(b)
}

function collectOpenFilePaths(): string[] {
  const paths = new Set<string>()
  for (const set of openFilesBySender.values()) {
    for (const p of set) paths.add(p)
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

function pathSignature(paths: string[]): string {
  return paths.map(normalizeAbs).join('\0')
}

function syncDedicatedOpenFileWatcher(): void {
  const pathList = collectOpenFilePaths()
  const nextSignature = pathSignature(pathList)
  if (nextSignature === watchedPathSignature) return
  watchedPathSignature = nextSignature

  if (dedicatedWatcher) {
    void dedicatedWatcher.close()
    dedicatedWatcher = null
  }

  if (pathList.length === 0) return

  dedicatedWatcher = chokidar.watch(pathList, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
  })

  const handler = (eventPath: string) => {
    emitEditorOpenFileChangedIfWatched(eventPath)
  }

  dedicatedWatcher.on('change', handler)
  dedicatedWatcher.on('unlink', handler)
}

export function isEditorOpenFileWatched(absolutePath: string): boolean {
  const resolved = normalizeAbs(absolutePath)
  if (!resolved) return false
  for (const set of openFilesBySender.values()) {
    for (const watchedPath of set) {
      if (pathsMatch(watchedPath, absolutePath)) return true
    }
  }
  return false
}

export function setEditorOpenFiles(sender: WebContents, absolutePaths: string[]): void {
  if (sender.isDestroyed()) return
  const next = new Set(absolutePaths.map(p => path.resolve(p)).filter(Boolean))
  openFilesBySender.set(sender.id, next)
  syncDedicatedOpenFileWatcher()
}

export function clearEditorOpenFiles(sender: WebContents): void {
  if (sender.isDestroyed()) return
  openFilesBySender.delete(sender.id)
  syncDedicatedOpenFileWatcher()
}

export function suppressEditorOpenFileWatch(absolutePath: string, durationMs = SELF_WRITE_SUPPRESS_MS): void {
  const resolved = normalizeAbs(absolutePath)
  if (!resolved) return
  suppressWatchUntil.set(resolved, Date.now() + durationMs)
}

/** Immediate notify when a watched open file changes on disk (bypasses staging debounce). */
export function emitEditorOpenFileChangedIfWatched(absolutePath: string): void {
  const resolved = normalizeAbs(absolutePath)
  if (!resolved) return

  const suppressUntil = suppressWatchUntil.get(resolved)
  if (suppressUntil != null) {
    if (Date.now() < suppressUntil) return
    suppressWatchUntil.delete(resolved)
  }

  for (const win of BrowserWindow.getAllWindows()) {
    const wc = win.webContents
    if (wc.isDestroyed()) continue
    const watched = openFilesBySender.get(wc.id)
    if (!watched) continue
    let matched = false
    for (const watchedPath of watched) {
      if (pathsMatch(watchedPath, absolutePath)) {
        matched = true
        break
      }
    }
    if (!matched) continue
    wc.send(IPC.SYSTEM.EDITOR_OPEN_FILE_CHANGED, { absolutePath })
  }
}
