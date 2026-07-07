import { execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import path from 'node:path'
import { mkdir, readdir, readFile, writeFile, cp, rename as fsRename, rm } from 'node:fs/promises'
import { dialog, ipcMain, shell, app } from 'electron'
import l from 'electron-log'
import { rgPath } from '@vscode/ripgrep'
import { ripgrepGlobArgs } from 'shared/editor/globPatterns'
import { applySearchReplace } from 'shared/editor/searchReplace'
import type { ReplaceInFilesResult, SearchInFilesOptions } from 'shared/editor/types'
import { DIFF_VIEWER_DATA_URL_MAX_BYTES, DIFF_VIEWER_IMAGE_EXTENSIONS, IPC } from 'main/constants'
import { unwatchWorkspace, watchWorkspace } from 'main/workspace/workspaceWatcher'
import { setEditorOpenFiles, suppressEditorOpenFileWatch } from 'main/workspace/editorOpenFileWatch'
import { catBuffer } from 'main/svn/cat'
import { isGitPathMissingAtRevisionError } from 'main/git/utils'
import { getAutomationRoot } from '../automation/workspace'
import configurationStore from '../store/ConfigurationStore'
import { isBinary } from '../utils/istextorbinary'
import { getResourcePath, resolvePathRelativeToBase } from '../utils/utils'
import { detectVersionControl, getVersionControlDetails } from '../utils/versionControlDetector'

const DEFAULT_HIDDEN_DIR_NAMES = new Set(['.git', 'node_modules', '.svn', '.hg'])

function shouldHideEntry(name: string, includeHidden: boolean): boolean {
  if (includeHidden) return false
  if (name.startsWith('.')) return true
  return DEFAULT_HIDDEN_DIR_NAMES.has(name)
}

async function listDirectoryEntries(
  relativePath: string,
  options?: { cwd?: string; includeHidden?: boolean }
): Promise<{ entries: { name: string; relativePath: string; kind: 'file' | 'directory' }[] }> {
  const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
  const basePath = await resolveReadWriteBase(basePathRaw)
  if (!basePath) return { entries: [] }

  const rel = relativePath?.trim() ? resolvePathRelativeToBase(basePath, relativePath) : ''
  const absolutePath = rel ? path.join(basePath, rel) : basePath

  if (!fs.existsSync(absolutePath)) return { entries: [] }
  const st = fs.statSync(absolutePath)
  if (!st.isDirectory()) return { entries: [] }

  const dirents = await readdir(absolutePath, { withFileTypes: true })
  const entries = dirents
    .filter(d => !shouldHideEntry(d.name, Boolean(options?.includeHidden)))
    .map(d => {
      const childRel = rel ? `${rel.replace(/\\/g, '/')}/${d.name}` : d.name
      return {
        name: d.name,
        relativePath: childRel.replace(/\\/g, '/'),
        kind: d.isDirectory() ? ('directory' as const) : ('file' as const),
      }
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

  return { entries }
}

async function searchInFilesRipgrep(
  query: string,
  options?: SearchInFilesOptions
): Promise<{ matches: { relativePath: string; line: number; column: number; preview: string; occurrences?: number }[]; truncated: boolean }> {
  const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
  const basePath = await resolveReadWriteBase(basePathRaw)
  if (!basePath || !query.trim()) return { matches: [], truncated: false }

  // VS Code default: search.maxResults = 20_000 (total occurrences, not lines).
  const maxResults = Math.min(Math.max(options?.maxResults ?? 20_000, 1), 20_000)
  const args = ['--json', '--line-number', '--column', '--hidden', '--no-require-git']
  if (!options?.caseSensitive) args.push('-i')
  if (options?.wholeWord) args.push('-w')
  if (options?.useExcludesAndIgnoreFiles === false) {
    args.push('--no-ignore', '--no-ignore-global')
  }
  if (options?.regex) {
    args.push('-e', query)
  } else {
    args.push('-F', query)
  }
  args.push(...ripgrepGlobArgs(options?.includePattern, options?.excludePattern))
  const onlyPaths = options?.onlyRelativePaths?.map(p => p.replace(/\\/g, '/')).filter(Boolean) ?? []
  if (onlyPaths.length > 0) {
    for (const relativePath of onlyPaths) {
      args.push(path.join(basePath, relativePath))
    }
  } else {
    args.push(basePath)
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(rgPath, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, cwd: basePath }, (err, out) => {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string | number }).code : undefined
      if (err && code !== 1 && code !== '1') {
        reject(err)
        return
      }
      resolve(out == null ? '' : typeof out === 'string' ? out : Buffer.from(out).toString('utf8'))
    })
  })

  const matches: { relativePath: string; line: number; column: number; preview: string; occurrences?: number }[] = []
  let occurrenceTotal = 0
  let truncated = false
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as {
        type?: string
        data?: {
          path?: { text?: string }
          line_number?: number
          submatches?: { start?: number; match?: { text?: string } }[]
          lines?: { text?: string }
        }
      }
      if (parsed.type !== 'match' || !parsed.data?.path?.text) continue
      const absPath = parsed.data.path.text.replace(/\\/g, '/')
      const root = basePath.replace(/\\/g, '/').replace(/\/+$/, '')
      const relativePath = absPath.startsWith(`${root}/`) ? absPath.slice(root.length + 1) : path.basename(absPath)
      const subs = parsed.data.submatches?.length ? parsed.data.submatches : [{ start: 0 }]
      const lineOccurrences = subs.length
      if (occurrenceTotal + lineOccurrences > maxResults) {
        truncated = true
        break
      }
      const sub = subs[0]
      matches.push({
        relativePath,
        line: parsed.data.line_number ?? 1,
        column: (sub?.start ?? 0) + 1,
        preview: (parsed.data.lines?.text ?? '').trimEnd(),
        occurrences: lineOccurrences,
      })
      occurrenceTotal += lineOccurrences
    } catch {
      /* skip malformed line */
    }
  }

  return { matches, truncated }
}

async function listWorkspaceFilesRipgrep(
  options?: { cwd?: string; maxFiles?: number }
): Promise<{ files: string[]; truncated: boolean }> {
  const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
  const basePath = await resolveReadWriteBase(basePathRaw)
  if (!basePath) return { files: [], truncated: false }

  const maxFiles = Math.min(Math.max(options?.maxFiles ?? 20_000, 1), 50_000)
  const args = ['--files', '--hidden', '--glob', '!.git/**', '--glob', '!node_modules/**', basePath]

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(rgPath, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true, cwd: basePath }, (err, out) => {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string | number }).code : undefined
      if (err && code !== 1 && code !== '1') {
        reject(err)
        return
      }
      resolve(out == null ? '' : typeof out === 'string' ? out : Buffer.from(out).toString('utf8'))
    })
  })

  const root = basePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const files: string[] = []
  for (const line of stdout.split('\n')) {
    const abs = line.trim().replace(/\\/g, '/')
    if (!abs) continue
    const relativePath = abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : path.basename(abs)
    files.push(relativePath)
    if (files.length >= maxFiles) break
  }

  files.sort((a, b) => a.localeCompare(b))
  return { files, truncated: files.length >= maxFiles }
}

const REPLACE_SKIP_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'zip', 'gz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'pdf',
])

function isReplaceableTextFile(relativePath: string): boolean {
  const ext = relativePath.split('.').pop()?.toLowerCase() ?? ''
  return !REPLACE_SKIP_EXTENSIONS.has(ext)
}

async function replaceInFilesWorkspace(
  query: string,
  replace: string,
  options?: SearchInFilesOptions & { relativePaths?: string[] }
): Promise<ReplaceInFilesResult> {
  const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
  const basePath = await resolveReadWriteBase(basePathRaw)
  if (!basePath || !query.trim()) {
    return { fileCount: 0, replacementCount: 0, relativePaths: [], failures: [] }
  }

  let targetPaths = options?.relativePaths?.map(p => p.replace(/\\/g, '/')).filter(Boolean) ?? []
  if (targetPaths.length === 0) {
    const search = await searchInFilesRipgrep(query, { ...options, maxResults: 5000 })
    targetPaths = [...new Set(search.matches.map(m => m.relativePath))]
  }

  const replaceOpts = {
    caseSensitive: Boolean(options?.caseSensitive),
    wholeWord: Boolean(options?.wholeWord),
    regex: Boolean(options?.regex),
  }

  let replacementCount = 0
  const changedPaths: string[] = []
  const failures: Array<{ relativePath: string; error: string }> = []

  for (const relativePath of targetPaths) {
    if (!isReplaceableTextFile(relativePath)) continue
    try {
      const { absolute } = await resolveWorkspacePath(relativePath, options?.cwd)
      const raw = await readFile(absolute, 'utf8')
      const usesCrLf = raw.includes('\r\n')
      const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const { content, count } = applySearchReplace(normalized, query, replace, replaceOpts)
      if (count === 0) continue
      const output = usesCrLf ? content.replace(/\n/g, '\r\n') : content
      await writeFile(absolute, output, 'utf8')
      replacementCount += count
      changedPaths.push(relativePath)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ relativePath, error: message })
    }
  }

  return {
    fileCount: changedPaths.length,
    replacementCount,
    relativePaths: changedPaths,
    failures,
  }
}

const execFilePromise = promisify(execFile)

/** Gắn đường dẫn từ git status với đúng thư mục gốc worktree (cwd có thể là folder con của repo). */
async function gitWorkTreeRoot(startDir: string): Promise<string | undefined> {
  const dir = startDir?.trim()
  if (!dir) return undefined
  try {
    const { stdout } = await execFile('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      windowsHide: true,
    })
    const top = (typeof stdout === 'string' ? stdout : '').trim().replace(/[/\\]+$/, '')
    return top || undefined
  } catch {
    return undefined
  }
}

async function resolveReadWriteBase(basePathInput: string | undefined): Promise<string | undefined> {
  if (!basePathInput?.trim()) return undefined
  const top = await gitWorkTreeRoot(basePathInput.trim())
  return top ?? basePathInput.trim()
}

async function resolveAbsoluteFilePath(filePath: string, cwd?: string): Promise<string> {
  const basePathRaw = cwd?.trim() || configurationStore.store.sourceFolder
  const basePath = await resolveReadWriteBase(basePathRaw)
  const relativePath = resolvePathRelativeToBase(basePath, filePath)
  return basePath ? path.join(basePath, relativePath) : path.resolve(relativePath)
}

async function resolveWorkspacePath(relativePath: string, cwd?: string): Promise<{ basePath: string; relative: string; absolute: string }> {
  const basePathRaw = cwd?.trim() || configurationStore.store.sourceFolder
  const basePath = await resolveReadWriteBase(basePathRaw)
  if (!basePath) throw new Error('No workspace folder configured')
  const relative = relativePath?.trim() ? resolvePathRelativeToBase(basePath, relativePath) : ''
  const absolute = relative ? path.join(basePath, relative) : basePath
  return { basePath, relative: relative.replace(/\\/g, '/'), absolute }
}

function mimeForImageExt(ext: string): string | undefined {
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.bmp') return 'image/bmp'
  return undefined
}

type FileKindResult = { kind: 'text' | 'image' | 'binary'; mime?: string; size?: number }

function detectKindFromExtension(filePath: string): FileKindResult | null {
  const ext = path.extname(filePath).toLowerCase()
  if (DIFF_VIEWER_IMAGE_EXTENSIONS.has(ext)) {
    return { kind: 'image', mime: mimeForImageExt(ext) }
  }
  if (isBinary(filePath) === true) return { kind: 'binary' }
  if (isBinary(filePath) === false) return { kind: 'text' }
  return null
}

/** Open file in configured external editor (or VS Code fallback), optionally at a line. */
function openFileInEditor(payload: { filePath: string; lineNumber?: number; cwd?: string }): { success: boolean; error?: string } {
  if (!payload?.filePath || typeof payload.filePath !== 'string') {
    l.warn('open-file-in-editor: No file path provided.')
    return { success: false, error: 'No file path provided' }
  }
  const { externalEditorPath, sourceFolder } = configurationStore.store
  const editor = externalEditorPath?.trim() || 'code'
  const baseFolder = payload.cwd?.trim() || sourceFolder
  const absolutePath = baseFolder ? path.resolve(baseFolder, payload.filePath) : path.resolve(payload.filePath)

  if (!fs.existsSync(absolutePath)) {
    l.warn(`open-file-in-editor: File not found: ${absolutePath}`)
    return { success: false, error: 'File not found' }
  }

  try {
    const lineNumber = payload.lineNumber && payload.lineNumber > 0 ? payload.lineNumber : undefined
    if (lineNumber) {
      spawn(editor, ['--goto', `${absolutePath}:${lineNumber}`], { detached: true, stdio: 'ignore', shell: true })
    } else {
      spawn(editor, [absolutePath], { detached: true, stdio: 'ignore', shell: true })
    }
    l.info(`Opened file in editor: ${absolutePath}${lineNumber ? `:${lineNumber}` : ''}`)
    return { success: true }
  } catch (err: any) {
    l.error('open-file-in-editor: Error spawning editor:', err)
    return { success: false, error: err?.message || String(err) }
  }
}

export function registerSystemIpcHandlers() {
  l.info('🔄 Registering System IPC Handlers...')

  ipcMain.handle(IPC.SYSTEM.OPEN_FOLDER, async () => {
    l.info('Opening folder dialog...')
    const { sourceFolder: defaultPath } = configurationStore.store
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: defaultPath || undefined,
    })
    if (result.canceled || result.filePaths.length === 0) {
      l.info('Folder selection cancelled.')
      return ''
    }
    const selectedPath = result.filePaths[0]
    l.info(`Folder selected: ${selectedPath}`)
    return selectedPath
  })

  ipcMain.handle(IPC.SYSTEM.OPEN_FOLDER_IN_EXPLORER, async (_event, folderPath: string) => {
    if (!folderPath || typeof folderPath !== 'string') {
      l.warn('Open folder in Explorer: No path provided.')
      return { ok: false as const, error: 'no_path' }
    }
    const absolutePath = path.normalize(path.resolve(folderPath.trim()))
    const automationRoot = path.normalize(getAutomationRoot())
    const underAutomation =
      absolutePath === automationRoot || absolutePath.startsWith(`${automationRoot}${path.sep}`)

    if (!fs.existsSync(absolutePath)) {
      if (underAutomation) {
        try {
          await mkdir(absolutePath, { recursive: true })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          l.warn('Open folder: could not create automation workspace dir', msg)
          return { ok: false as const, error: msg }
        }
      } else {
        l.warn(`Open folder in Explorer: Path not found: ${absolutePath}`)
        return { ok: false as const, error: 'not_found' }
      }
    }
    try {
      const errMsg = await shell.openPath(absolutePath)
      if (errMsg) {
        l.warn(`shell.openPath failed: ${errMsg}`, absolutePath)
        return { ok: false as const, error: errMsg }
      }
      l.info(`Opened folder in Explorer: ${absolutePath}`)
      return { ok: true as const }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      l.error('Error opening folder in Explorer:', err)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle(IPC.SYSTEM.REVEAL_IN_FILE_EXPLORER, async (_event, filePath: string) => {
    if (!filePath) {
      l.warn('Reveal in Explorer: No file path provided.')
      return
    }
    const { sourceFolder } = configurationStore.store
    const absolutePath = sourceFolder ? path.resolve(sourceFolder, filePath) : path.resolve(filePath)
    l.info(`Revealing item in file explorer: ${absolutePath}`)
    shell.showItemInFolder(absolutePath)
  })

  ipcMain.handle(IPC.SYSTEM.OPEN_EXTERNAL_URL, async (_event, url: string) => {
    if (!url || typeof url !== 'string') return
    try {
      await shell.openExternal(url)
    } catch (err: any) {
      l.error('Error opening external URL:', err)
    }
  })

  ipcMain.handle(IPC.SYSTEM.DETECT_FILE_KIND, async (_event, filePath: string, options?: { cwd?: string }) => {
    try {
      if (!filePath?.trim()) return { kind: 'text' as const }
      const extKind = detectKindFromExtension(filePath)
      const absolutePath = await resolveAbsoluteFilePath(filePath, options?.cwd)
      if (!fs.existsSync(absolutePath)) {
        return extKind ?? { kind: 'text' as const }
      }
      const st = fs.statSync(absolutePath)
      if (extKind?.kind === 'image') {
        return { kind: 'image' as const, mime: extKind.mime, size: st.size, mtimeMs: st.mtimeMs }
      }
      const sampleSize = Math.min(st.size, 8192)
      const buf = await readFile(absolutePath, { encoding: null })
      const sample = buf.subarray(0, sampleSize)
      if (isBinary(filePath, sample)) {
        return { kind: 'binary' as const, size: st.size, mtimeMs: st.mtimeMs }
      }
      return { kind: 'text' as const, size: st.size, mtimeMs: st.mtimeMs }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      l.error('detect-file-kind error:', err)
      return { kind: 'text' as const, error: msg }
    }
  })

  ipcMain.handle(
    IPC.SYSTEM.READ_FILE_DATA_URL,
    async (
      _event,
      filePath: string,
      options?: { cwd?: string; gitRevision?: string; svnRevision?: string; svnFileStatus?: string }
    ) => {
      try {
        if (!filePath?.trim()) throw new Error('Invalid file path')
        let buf: Buffer

        if (options && ('svnRevision' in options || options.gitRevision?.trim())) {
          if ('svnRevision' in options) {
            const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
            const svnResult = await catBuffer(filePath, options.svnFileStatus ?? '', options.svnRevision, basePathRaw)
            if (svnResult.status !== 'success') throw new Error(svnResult.message)
            buf = svnResult.data
          } else {
            const gitRevision = options.gitRevision?.trim()
            if (!gitRevision) throw new Error('Git revision is required')
            const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
            const basePath = await resolveReadWriteBase(basePathRaw)
            if (!basePath) throw new Error('Repository root not configured')
            const relativePath = resolvePathRelativeToBase(basePath, filePath).replace(/\\/g, '/')
            const spec = `${gitRevision}:${relativePath}`
            try {
              const gitShow = await execFilePromise('git', ['-C', basePath, 'show', spec], {
                encoding: 'buffer',
                maxBuffer: DIFF_VIEWER_DATA_URL_MAX_BYTES + 1024,
                windowsHide: true,
              })
              buf = gitShow.stdout
            } catch (err) {
              if (isGitPathMissingAtRevisionError(err)) {
                return { success: false as const, error: 'NOT_IN_REVISION' }
              }
              throw err
            }
          }
        } else {
          const absolutePath = await resolveAbsoluteFilePath(filePath, options?.cwd)
          if (!fs.existsSync(absolutePath)) throw new Error('File not found')
          const st = fs.statSync(absolutePath)
          if (st.size > DIFF_VIEWER_DATA_URL_MAX_BYTES) {
            return { success: false as const, error: 'FILE_TOO_LARGE', size: st.size }
          }
          buf = await readFile(absolutePath)
        }

        if (buf.byteLength > DIFF_VIEWER_DATA_URL_MAX_BYTES) {
          return { success: false as const, error: 'FILE_TOO_LARGE', size: buf.byteLength }
        }

        const mime = mimeForImageExt(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream'
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
        return { success: true as const, dataUrl, mime, size: buf.byteLength }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        l.error('read-file-data-url error:', err)
        return { success: false as const, error: msg }
      }
    }
  )

  ipcMain.handle(IPC.SYSTEM.GET_PATH_ENTRY_KIND, async (_event, payload: { relativePath: string; cwd?: string }) => {
    try {
      const filePath = typeof payload?.relativePath === 'string' ? payload.relativePath : ''
      if (!filePath.trim()) return 'missing' as const
      const basePathRaw = payload?.cwd?.trim() || configurationStore.store.sourceFolder
      const basePath = await resolveReadWriteBase(basePathRaw)
      if (!basePath) return 'missing' as const
      const relativePath = resolvePathRelativeToBase(basePath, filePath)
      const absolutePath = path.join(basePath, relativePath)
      if (!fs.existsSync(absolutePath)) return 'missing' as const
      const st = fs.statSync(absolutePath)
      return st.isDirectory() ? ('directory' as const) : ('file' as const)
    } catch {
      return 'missing' as const
    }
  })

  ipcMain.handle(
    IPC.SYSTEM.RESOLVE_NODE_MODULE,
    async (_event, payload: { specifier: string; cwd?: string; fromRelativePath: string }) => {
      try {
        const specifier = typeof payload?.specifier === 'string' ? payload.specifier.trim() : ''
        const fromRelativePath = typeof payload?.fromRelativePath === 'string' ? payload.fromRelativePath.trim() : ''
        if (!specifier || !fromRelativePath) return null
        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('~/')) return null

        const basePathRaw = payload?.cwd?.trim() || configurationStore.store.sourceFolder
        const basePath = await resolveReadWriteBase(basePathRaw)
        if (!basePath) return null

        const fromAbs = path.join(basePath, resolvePathRelativeToBase(basePath, fromRelativePath))
        const req = createRequire(fromAbs)
        const resolvedAbs = req.resolve(specifier)
        const relativePath = path.relative(basePath, resolvedAbs).replace(/\\/g, '/')
        if (!relativePath || relativePath.startsWith('..')) return null
        return relativePath
      } catch (err) {
        l.debug(`resolve_node_module failed for ${payload?.specifier}:`, err)
        return null
      }
    }
  )

  ipcMain.handle(IPC.SYSTEM.READ_FILE, async (_event, filePath: string, options?: { cwd?: string }) => {
    l.debug(`Reading file: ${filePath}`)
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid filePath provided for reading.')
      }
      const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
      const basePath = await resolveReadWriteBase(basePathRaw)
      const relativePath = resolvePathRelativeToBase(basePath, filePath)
      const absolutePath = basePath ? path.join(basePath, relativePath) : path.resolve(relativePath)
      const content = await readFile(absolutePath, 'utf-8')
      return content
    } catch (err: any) {
      l.error(`Error reading file ${filePath}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC.SYSTEM.WRITE_FILE, async (_event, filePath: string, content: string, options?: { cwd?: string }) => {
    l.info(`Attempting to write file: ${filePath}`)
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid filePath provided for writing.')
      }
      const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
      const basePath = await resolveReadWriteBase(basePathRaw)
      const relativePath = resolvePathRelativeToBase(basePath, filePath)
      const absolutePath = basePath ? path.join(basePath, relativePath) : path.resolve(relativePath)
      l.info(`Writing file to absolute path: ${absolutePath}`)
      const dir = path.dirname(absolutePath)
      if (!fs.existsSync(dir)) {
        l.info(`Directory ${dir} does not exist. Creating...`)
        await fs.promises.mkdir(dir, { recursive: true })
        l.info(`Directory created: ${dir}`)
      }
      await writeFile(absolutePath, content, 'utf-8')
      suppressEditorOpenFileWatch(absolutePath)
      l.info(`File written successfully to ${absolutePath}`)
      return { success: true }
    } catch (err: any) {
      l.error(`Error writing file ${filePath}:`, err)
      return { success: false, error: `Error writing file: ${err.message || 'Unknown error'}` }
    }
  })

  // Version Control Detection
  ipcMain.handle(IPC.SYSTEM.DETECT_VERSION_CONTROL, async (_, folderPath: string) => {
    try {
      const result = await detectVersionControl(folderPath)
      return { status: 'success', data: result }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle(IPC.SYSTEM.GET_VERSION_CONTROL_DETAILS, async (_, folderPath: string) => {
    try {
      const result = await getVersionControlDetails(folderPath)
      return { status: 'success', data: result }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle(IPC.SYSTEM.OPEN_IN_EXTERNAL_EDITOR, async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      l.warn('Open in external editor: No file path provided.')
      return { success: false, error: 'No file path provided' }
    }
    const { sourceFolder, externalEditorPath } = configurationStore.store
    if (!externalEditorPath?.trim()) {
      l.warn('Open in external editor: External editor not configured.')
      return { success: false, error: 'External editor not configured. Set it in Settings > Configuration.' }
    }
    const absolutePath = sourceFolder ? path.resolve(sourceFolder, filePath) : path.resolve(filePath)
    if (!fs.existsSync(absolutePath)) {
      l.warn(`Open in external editor: File not found: ${absolutePath}`)
      return { success: false, error: 'File not found' }
    }
    try {
      const editor = externalEditorPath.trim()
      spawn(editor, [absolutePath], { detached: true, stdio: 'ignore', shell: true })
      l.info(`Opened in external editor: ${absolutePath}`)
      return { success: true }
    } catch (err: any) {
      l.error('Error opening in external editor:', err)
      return { success: false, error: err?.message || String(err) }
    }
  })

  ipcMain.handle(IPC.SYSTEM.OPEN_FILE_IN_EDITOR, async (_event, payload: { filePath: string; lineNumber?: number; cwd?: string }) =>
    openFileInEditor(payload)
  )

  ipcMain.on('open-file-in-editor', (_event, payload: { filePath: string; lineNumber?: number; cwd?: string }) => {
    openFileInEditor(payload)
  })

  ipcMain.handle(IPC.SYSTEM.SELECT_AUDIO_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return ''
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.SYSTEM.GET_NOTIFICATION_SOUND_URL, async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) return null
    try {
      const absolutePath = path.resolve(filePath.trim())
      if (!fs.existsSync(absolutePath)) return null
      const buffer = await readFile(absolutePath)
      const base64 = buffer.toString('base64')
      const ext = path.extname(absolutePath).toLowerCase()
      const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg'
      return `data:${mime};base64,${base64}`
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.SYSTEM.GET_DEFAULT_NOTIFICATION_SOUND_URL, async () => {
    try {
      const defaultPath = getResourcePath('notification.wav')
      if (!fs.existsSync(defaultPath)) return null
      const buffer = await readFile(defaultPath)
      const base64 = buffer.toString('base64')
      return `data:audio/wav;base64,${base64}`
    } catch {
      return null
    }
  })

  ipcMain.handle(
    IPC.SYSTEM.LIST_DIR,
    async (_event, payload: { relativePath?: string; cwd?: string; includeHidden?: boolean }) => {
      try {
        return await listDirectoryEntries(payload?.relativePath ?? '', payload)
      } catch (err) {
        l.error('LIST_DIR error:', err)
        return { entries: [] }
      }
    }
  )

  ipcMain.handle(IPC.SYSTEM.CREATE_DIR, async (_event, relativePath: string, options?: { cwd?: string }) => {
    try {
      const { absolute } = await resolveWorkspacePath(relativePath, options?.cwd)
      await mkdir(absolute, { recursive: false })
      return { success: true as const }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      l.error('CREATE_DIR error:', err)
      return { success: false as const, error: message }
    }
  })

  ipcMain.handle(IPC.SYSTEM.DELETE_PATH, async (_event, relativePath: string, options?: { cwd?: string }) => {
    try {
      const { absolute } = await resolveWorkspacePath(relativePath, options?.cwd)
      if (!fs.existsSync(absolute)) return { success: false as const, error: 'not_found' }
      await shell.trashItem(absolute)
      return { success: true as const }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      l.error('DELETE_PATH error:', err)
      return { success: false as const, error: message }
    }
  })

  ipcMain.handle(
    IPC.SYSTEM.RENAME_PATH,
    async (_event, payload: { from: string; to: string; cwd?: string }) => {
      try {
        const from = await resolveWorkspacePath(payload.from, payload.cwd)
        const to = await resolveWorkspacePath(payload.to, payload.cwd)
        await fsRename(from.absolute, to.absolute)
        return { success: true as const }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        l.error('RENAME_PATH error:', err)
        return { success: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    IPC.SYSTEM.COPY_PATH,
    async (_event, payload: { from: string; to: string; cwd?: string }) => {
      try {
        const from = await resolveWorkspacePath(payload.from, payload.cwd)
        const to = await resolveWorkspacePath(payload.to, payload.cwd)
        if (!fs.existsSync(from.absolute)) return { success: false as const, error: 'not_found' }
        const st = fs.statSync(from.absolute)
        await cp(from.absolute, to.absolute, { recursive: st.isDirectory() })
        return { success: true as const }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        l.error('COPY_PATH error:', err)
        return { success: false as const, error: message }
      }
    }
  )

  ipcMain.handle(IPC.SYSTEM.STAGE_PATH_FOR_UNDO, async (_event, relativePath: string, options?: { cwd?: string }) => {
    try {
      const { absolute } = await resolveWorkspacePath(relativePath, options?.cwd)
      if (!fs.existsSync(absolute)) return { success: false as const, error: 'not_found' }
      const stagingId = crypto.randomUUID()
      const dest = path.join(app.getPath('userData'), 'explorer-undo', stagingId)
      await mkdir(path.dirname(dest), { recursive: true })
      const st = fs.statSync(absolute)
      await cp(absolute, dest, { recursive: st.isDirectory() })
      return { success: true as const, stagingId }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      l.error('STAGE_PATH_FOR_UNDO error:', err)
      return { success: false as const, error: message }
    }
  })

  ipcMain.handle(
    IPC.SYSTEM.RESTORE_UNDO_STAGING,
    async (_event, payload: { stagingId: string; relativePath: string; cwd?: string }) => {
      try {
        const staging = path.join(app.getPath('userData'), 'explorer-undo', payload.stagingId)
        if (!fs.existsSync(staging)) return { success: false as const, error: 'staging_missing' }
        const { absolute } = await resolveWorkspacePath(payload.relativePath, payload.cwd)
        const parent = path.dirname(absolute)
        if (!fs.existsSync(parent)) await mkdir(parent, { recursive: true })
        const st = fs.statSync(staging)
        await cp(staging, absolute, { recursive: st.isDirectory() })
        await rm(staging, { recursive: true, force: true })
        return { success: true as const }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        l.error('RESTORE_UNDO_STAGING error:', err)
        return { success: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    IPC.SYSTEM.SEARCH_IN_FILES,
    async (_event, payload: import('shared/editor/types').SearchInFilesOptions & { query: string }) => {
      try {
        return await searchInFilesRipgrep(payload.query, payload)
      } catch (err) {
        l.error('SEARCH_IN_FILES error:', err)
        return { matches: [], truncated: false }
      }
    }
  )

  ipcMain.handle(
    IPC.SYSTEM.LIST_WORKSPACE_FILES,
    async (_event, payload: { cwd?: string; maxFiles?: number }) => {
      try {
        return await listWorkspaceFilesRipgrep(payload)
      } catch (err) {
        l.error('LIST_WORKSPACE_FILES error:', err)
        return { files: [], truncated: false }
      }
    }
  )

  ipcMain.handle(
    IPC.SYSTEM.REPLACE_IN_FILES,
    async (_event, payload: import('shared/editor/types').ReplaceInFilesPayload) => {
      try {
        return await replaceInFilesWorkspace(payload.query, payload.replace, payload)
      } catch (err) {
        l.error('REPLACE_IN_FILES error:', err)
        return { fileCount: 0, replacementCount: 0, relativePaths: [], failures: [{ relativePath: '', error: String(err) }] }
      }
    }
  )

  ipcMain.handle(IPC.SYSTEM.WATCH_WORKSPACE, async (event, payload: { cwd?: string }) => {
    const basePathRaw = payload?.cwd?.trim() || configurationStore.store.sourceFolder
    const basePath = await resolveReadWriteBase(basePathRaw)
    return watchWorkspace(event.sender, basePath ?? basePathRaw ?? '')
  })

  ipcMain.handle(IPC.SYSTEM.UNWATCH_WORKSPACE, event => {
    unwatchWorkspace(event.sender)
    return { success: true }
  })

  ipcMain.handle(IPC.SYSTEM.SET_EDITOR_OPEN_FILES, (event, payload: { paths?: string[] }) => {
    const paths = Array.isArray(payload?.paths) ? payload.paths : []
    setEditorOpenFiles(event.sender, paths.filter((p): p is string => typeof p === 'string'))
    return { success: true }
  })

  l.info('✅ System IPC Handlers Registered')
}
