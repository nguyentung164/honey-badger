import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dialog, ipcMain, shell } from 'electron'
import { getResourcePath, resolvePathRelativeToBase } from '../utils/utils'
import l from 'electron-log'
import { IPC } from 'main/constants'
import configurationStore from '../store/ConfigurationStore'
import { detectVersionControl, getVersionControlDetails } from '../utils/versionControlDetector'

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
      return
    }
    const absolutePath = path.resolve(folderPath)
    if (!fs.existsSync(absolutePath)) {
      l.warn(`Open folder in Explorer: Path not found: ${absolutePath}`)
      return
    }
    try {
      await shell.openPath(absolutePath)
      l.info(`Opened folder in Explorer: ${absolutePath}`)
    } catch (err: any) {
      l.error('Error opening folder in Explorer:', err)
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

  ipcMain.handle(IPC.SYSTEM.READ_FILE, async (_event, filePath: string, options?: { cwd?: string }) => {
    l.info(`Attempting to read file: ${filePath}`)
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid filePath provided for reading.')
      }
      const basePathRaw = options?.cwd?.trim() || configurationStore.store.sourceFolder
      const basePath = await resolveReadWriteBase(basePathRaw)
      const relativePath = resolvePathRelativeToBase(basePath, filePath)
      const absolutePath = basePath ? path.join(basePath, relativePath) : path.resolve(relativePath)
      l.info(`Reading file from absolute path: ${absolutePath}`)
      const content = await readFile(absolutePath, 'utf-8')
      l.info(`File read successfully: ${filePath}`)
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

  ipcMain.on('open-file-in-editor', (_event, payload: { filePath: string; lineNumber?: number }) => {
    if (!payload?.filePath || typeof payload.filePath !== 'string') {
      l.warn('open-file-in-editor: No file path provided.')
      return
    }
    const { externalEditorPath, sourceFolder } = configurationStore.store
    const editor = externalEditorPath?.trim() || 'code'
    const absolutePath = sourceFolder ? path.resolve(sourceFolder, payload.filePath) : path.resolve(payload.filePath)

    if (!fs.existsSync(absolutePath)) {
      l.warn(`open-file-in-editor: File not found: ${absolutePath}`)
      return
    }

    try {
      const lineNumber = payload.lineNumber && payload.lineNumber > 0 ? payload.lineNumber : undefined
      if (lineNumber) {
        spawn(editor, ['--goto', `${absolutePath}:${lineNumber}`], { detached: true, stdio: 'ignore', shell: true })
      } else {
        spawn(editor, [absolutePath], { detached: true, stdio: 'ignore', shell: true })
      }
      l.info(`Opened file in editor: ${absolutePath}${lineNumber ? `:${lineNumber}` : ''}`)
    } catch (err: any) {
      l.error('open-file-in-editor: Error spawning editor:', err)
    }
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

  ipcMain.handle(IPC.SYSTEM.OPEN_TERMINAL, async (_event, folderPathArg?: string) => {
    const folderPath = folderPathArg?.trim() ? path.resolve(folderPathArg.trim()) : path.resolve(configurationStore.store.sourceFolder || '')
    if (!folderPath || !fs.existsSync(folderPath)) {
      l.warn(`Open terminal: Folder not found or empty: ${folderPath}`)
      return { success: false, error: 'Folder not found or not configured' }
    }
    try {
      const isWin = process.platform === 'win32'
      if (isWin) {
        const openCmdFallback = () => {
          // Dùng start để mở cửa sổ cmd mới (cần thiết khi chạy từ Electron GUI)
          const escapedPath = folderPath.replace(/"/g, '""')
          const cmd = `start cmd /k "cd /d ""${escapedPath}"""`
          spawn(cmd, {
            shell: true,
            detached: true,
            stdio: 'ignore',
          })
          l.info(`Opened cmd.exe at: ${folderPath}`)
        }
        const cp = spawn('wt', ['-d', folderPath], { detached: true, stdio: 'ignore' })
        cp.on('error', (err: NodeJS.ErrnoException) => {
          if (err?.code === 'ENOENT') {
            openCmdFallback()
          } else {
            l.error('Error opening Windows Terminal:', err)
          }
        })
        cp.on('spawn', () => {
          l.info(`Opened Windows Terminal at: ${folderPath}`)
        })
      } else {
        const escapedPath = folderPath.replace(/'/g, "'\\''")
        spawn('x-terminal-emulator', ['-e', `bash -c 'cd "${escapedPath}" && exec bash'`], {
          detached: true,
          stdio: 'ignore',
        })
      }
      l.info(`Opened terminal at: ${folderPath}`)
      return { success: true }
    } catch (err: any) {
      l.error('Error opening terminal:', err)
      return { success: false, error: err?.message || String(err) }
    }
  })

  l.info('✅ System IPC Handlers Registered')
}
