import fs from 'node:fs'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'
import l from 'electron-log'
import { IPC } from '../constants'

export const DEBOUNCE_MS = 500

/**
 * Đường dẫn chứa một trong các chuỗi này sẽ bị bỏ qua (chuẩn hóa `/`, tham khảo github/gitignore + stack phổ biến).
 * Dùng `/tên/` để giảm match nhầm segment tên tương tự.
 */
const IGNORE_SUBSTRINGS = [
  // VCS
  '/.git/',
  '/.svn/',
  '/.hg/',
  // Node / front-end build & cache
  'node_modules',
  '/dist/',
  '/build/',
  '/out/',
  '/.next/',
  '/.nuxt/',
  '/.output/',
  '/.turbo/',
  '/.parcel-cache/',
  '/.vite/',
  '/.svelte-kit/',
  '/.expo/',
  '/.nx/',
  '/storybook-static/',
  '/.yarn/cache/',
  '/.yarn/unplugged/',
  // Java / JVM
  '/target/',
  '/.gradle/',
  '/.kotlin/',
  // .NET (tránh `/bin/` chung — dễ trùng thư mục bin nguồn)
  '/obj/',
  '/bin/debug/',
  '/bin/release/',
  '/bin/x64/',
  '/bin/arm64/',
  '/publish/',
  // Python
  '/__pycache__/',
  '/.pytest_cache/',
  '/.mypy_cache/',
  '/.tox/',
  '/.venv/',
  '/venv/',
  '/.ipynb_checkpoints/',
  // PHP / Go / Ruby (composer / go mod / bundle nằm dưới vendor/)
  '/vendor/',
  // Elixir / Erlang
  '/_build/',
  '/deps/',
  // Dart / Flutter
  '/.dart_tool/',
  // iOS / macOS dev
  '/pods/',
  '/deriveddata/',
  // Swift PM
  '/.build/',
  '/.swiftpm/',
  // CMake / native
  '/cmakefiles/',
  '/cmake-build-debug/',
  '/cmake-build-release/',
  '/cmake-build-relwithdebinfo/',
  '/cmake-build-minsizerel/',
  // Haskell Cabal
  '/dist-newstyle/',
  // Terraform / infra cache
  '/.terraform/',
  '/.vagrant/',
  // Test & coverage output
  '/coverage/',
  '/.nyc_output/',
  '/cypress/videos/',
  '/cypress/screenshots/',
  '/test-results/',
  '/playwright-report/',
  // IDE / tooling (ít khi là nguồn cần refresh staging liên tục)
  '/.idea/',
  '/.vscode/',
  '/.vs/',
  '/.fleet/',
  // Misc caches
  '/.cache/',
  '/.sass-cache/',
  '/.angular/',
]

/** So khớp path với IGNORE_SUBSTRINGS (chuỗi luôn viết thường; path cũng lower để khớp Pods, Bin, Target, v.v.) */
function pathMatchesIgnoredSubstrings(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return IGNORE_SUBSTRINGS.some(s => normalized.includes(s))
}

function shouldIgnore(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  const base = path.basename(normalized).toLowerCase()
  if (/\.log$/i.test(normalized)) return true
  if (base === '.ds_store' || base === 'thumbs.db' || base === 'desktop.ini') return true
  return pathMatchesIgnoredSubstrings(filePath)
}

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let _lastEmittedPath: string | null = null

function emitFilesChanged(mainWindow: BrowserWindow | null) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC.FILES_CHANGED)
      l.info('File watcher: emitted FILES_CHANGED to renderer')
    }
  } catch (err) {
    // Window có thể đã bị destroy khi debounce timer chạy (race condition khi đóng app)
    l.debug('File watcher: skip emit, window destroyed:', (err as Error)?.message)
  }
}

function debouncedEmit(mainWindow: BrowserWindow | null, changedPath: string) {
  _lastEmittedPath = changedPath
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    emitFilesChanged(mainWindow)
    _lastEmittedPath = null
  }, DEBOUNCE_MS)
}

export function resolveAndValidatePaths(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : [input]
  const resolved: string[] = []
  for (const p of raw) {
    const trimmed = typeof p === 'string' ? p.trim() : ''
    if (!trimmed) continue
    try {
      const normalizedPath = path.resolve(trimmed)
      if (!fs.existsSync(normalizedPath)) {
        l.warn('File watcher: folder does not exist:', normalizedPath)
        continue
      }
      const stat = fs.statSync(normalizedPath)
      if (!stat.isDirectory()) {
        l.warn('File watcher: path is not a directory:', normalizedPath)
        continue
      }
      resolved.push(normalizedPath)
    } catch (err) {
      l.error('File watcher: cannot access folder:', trimmed, err)
    }
  }
  return resolved
}

export function startFileWatcher(
  folderPathOrPaths: string | string[],
  mainWindow: BrowserWindow | null,
  enabled: boolean
): void {
  stopFileWatcher()

  if (!enabled) {
    l.info('File watcher: disabled')
    return
  }

  const pathsToWatch = resolveAndValidatePaths(folderPathOrPaths)
  if (pathsToWatch.length === 0) {
    l.info('File watcher: no valid folder path(s)')
    return
  }

  const watchTarget: string | string[] = pathsToWatch.length === 1 ? (pathsToWatch[0] ?? '') : pathsToWatch
  watcher = chokidar.watch(watchTarget, {
    ignored: p => shouldIgnore(p),
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
  })

  const handler = (eventPath: string) => {
    l.debug('File watcher: change detected:', eventPath)
    debouncedEmit(mainWindow, eventPath)
  }

  watcher.on('add', handler)
  watcher.on('change', handler)
  watcher.on('unlink', handler)
  watcher.on('addDir', handler)
  watcher.on('unlinkDir', handler)

  watcher.on('error', (err: any) => {
    l.error('File watcher error:', err)
  })

  l.info('File watcher: started watching', pathsToWatch.length === 1 ? pathsToWatch[0] : pathsToWatch)
}

export function stopFileWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  _lastEmittedPath = null
  if (watcher) {
    watcher.close()
    watcher = null
    l.info('File watcher: stopped')
  }
}
