import { join, resolve } from 'node:path'
import { format } from 'node:url'
import { BrowserWindow, ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getCommitDiff } from '../git/diff'
import { onSpotBugs } from '../task/achievementService'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { getWindowBackgroundColor } from 'main/utils/windowBackground'
import { ENVIRONMENT } from 'shared/constants'
import { parseSpotBugsResult, runSpotBugs } from '../utils/spotbugs'
import { focusSingletonWindow, registerSingletonWindow } from 'main/utils/singletonWindow'

const pendingDiffDataByWindowId = new Map<number, Record<string, unknown>>()
const pendingConflictDataByWindowId = new Map<number, { path?: string; versionControlSystem?: 'git' | 'svn' }>()

async function sendSpotBugsResultToWindow(win: BrowserWindow, filePaths: string[]): Promise<void> {
  try {
    const result = await runSpotBugs(filePaths)
    const parsedResult = result.status === 'success' ? parseSpotBugsResult(result.data) : null
    const dataToSend = result.status === 'success' ? { filePaths, spotbugsResult: parsedResult } : { filePaths, error: result.message }
    pendingDiffDataByWindowId.set(win.id, dataToSend)
    win.webContents.send('load-diff-data', dataToSend)
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (session?.userId) {
      const bugCount = parsedResult?.bugInstances?.length ?? (result.status === 'error' ? 1 : 0)
      onSpotBugs(session.userId, bugCount).catch(() => {})
    }
  } catch (error) {
    l.error('Error running SpotBugs:', error)
    const dataToSend = { filePaths, error: error instanceof Error ? error.message : String(error) }
    pendingDiffDataByWindowId.set(win.id, dataToSend)
    win.webContents.send('load-diff-data', dataToSend)
  }
}

export function registerWindowIpcHandlers() {
  l.info('🔄 Registering Window IPC Handlers...')

  ipcMain.on(IPC.WINDOW.ACTION, async (_event, action, _data) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return

    switch (action) {
      case 'minimize':
        win.minimize()
        break
      case 'maximize':
        win.isMaximized() ? win.unmaximize() : win.maximize()
        break
      case 'close':
        win.hide()
        break
      case 'refresh-spotbugs':
        try {
          const filePaths = (win as any).filePaths || []
          l.info(`Refreshing SpotBugs for window: ${win.webContents.getTitle()} with paths: ${filePaths.join(', ')}`)
          if (filePaths.length > 0) {
            const result = await runSpotBugs(filePaths)
            let dataToSend: Record<string, unknown>
            if (result.status === 'success') {
              const parsedResult = parseSpotBugsResult(result.data)
              dataToSend = { filePaths, spotbugsResult: parsedResult }
              const token = getTokenFromStore()
              const session = token ? verifyToken(token) : null
              if (session?.userId) {
                const bugCount = parsedResult?.bugInstances?.length ?? 0
                onSpotBugs(session.userId, bugCount).catch(() => {})
              }
            } else {
              dataToSend = { filePaths, error: result.message }
            }
            pendingDiffDataByWindowId.set(win.id, dataToSend)
            win.webContents.send('load-diff-data', dataToSend)
          } else {
            l.warn('No file paths found for SpotBugs refresh.')
            const dataToSend = { filePaths: [], error: 'No file paths available for SpotBugs analysis in this window.' }
            pendingDiffDataByWindowId.set(win.id, dataToSend)
            win.webContents.send('load-diff-data', dataToSend)
          }
        } catch (error) {
          l.error('Error refreshing SpotBugs:', error)
          const dataToSend = { filePaths: (win as any).filePaths || [], error: error instanceof Error ? error.message : String(error) }
          pendingDiffDataByWindowId.set(win.id, dataToSend)
          win.webContents.send('load-diff-data', dataToSend)
        }
        break
    }
  })

  ipcMain.on(IPC.WINDOW.DIFF_WINDOWS, (_event, data) => {
    const filePath = typeof data === 'string' ? data : data.filePath
    const fileStatus = typeof data === 'object' && data.fileStatus ? data.fileStatus : undefined
    const revision = typeof data === 'object' && data.revision ? data.revision : undefined
    const currentRevision = typeof data === 'object' && data.currentRevision ? data.currentRevision : undefined
    const isGit = typeof data === 'object' && data.isGit ? data.isGit : false
    const commitHash = typeof data === 'object' && data.commitHash ? data.commitHash : undefined
    const currentCommitHash = typeof data === 'object' && data.currentCommitHash ? data.currentCommitHash : undefined
    const isRootCommit = typeof data === 'object' && data.isRootCommit === true
    const cwd = typeof data === 'object' && data.cwd ? data.cwd : undefined

    const diffData = {
      filePath,
      fileStatus,
      revision,
      currentRevision,
      isGit,
      commitHash,
      currentCommitHash,
      isRootCommit,
      cwd,
    }

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Diff Viewer',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/code-diff-viewer'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/code-diff-viewer',
        })
    pendingDiffDataByWindowId.set(window.id, diffData)
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      // Không gửi ngay - CodeDiffViewer lazy load có thể chưa mount. Gửi khi renderer request.
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
    window.on('closed', () => pendingDiffDataByWindowId.delete(window.id))
  })

  ipcMain.on(IPC.WINDOW.REQUEST_DIFF_DATA, event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const data = pendingDiffDataByWindowId.get(win.id)
    if (data) {
      win.webContents.send('load-diff-data', data)
      pendingDiffDataByWindowId.delete(win.id)
    }
  })

  // Handle Git diff window
  ipcMain.handle(IPC.GIT.GET_COMMIT_DIFF, async (_event, commitHash: string, filePath?: string, options?: { cwd?: string }) => {
    try {
      const result = await getCommitDiff(commitHash, filePath, options?.cwd)

      if (result.status === 'success' && result.data) {
        const diffData = {
          filePath: filePath ?? '',
          fileStatus: 'M',
          revision: commitHash,
          currentRevision: commitHash,
          commitHash,
          currentCommitHash: commitHash,
          isGit: true,
          diffContent: result.data?.diffContent,
          isGitDiff: true,
        }

        const window = new BrowserWindow({
          width: 1365,
          height: 768,
          minWidth: 1366,
          minHeight: 768,
          center: true,
          frame: false,
          show: false,
          backgroundColor: getWindowBackgroundColor(),
          autoHideMenuBar: true,
          title: 'Git Diff Viewer',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
          },
        })

        const url = ENVIRONMENT.IS_DEV
          ? 'http://localhost:4927/#/code-diff-viewer'
          : format({
              pathname: resolve(__dirname, '../renderer/index.html'),
              protocol: 'file:',
              slashes: true,
              hash: '/code-diff-viewer',
            })
        pendingDiffDataByWindowId.set(window.id, diffData)
        window.loadURL(url)

        window.webContents.on('did-finish-load', () => {
          if (ENVIRONMENT.IS_DEV) {
            window.webContents.openDevTools({ mode: 'bottom' })
          }
        })
        window.on('closed', () => pendingDiffDataByWindowId.delete(window.id))
      }

      return result
    } catch (error) {
      l.error('Error handling Git commit diff:', error)
      return { status: 'error', message: 'Error opening Git diff' }
    }
  })

  ipcMain.on(IPC.WINDOW.TASK_MANAGEMENT, () => {
    if (focusSingletonWindow('task-management')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Task Management',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('task-management', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/task-management'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/task-management',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.MASTER, () => {
    if (focusSingletonWindow('master')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Master',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('master', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/master'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/master',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.DASHBOARD, () => {
    if (focusSingletonWindow('dashboard')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Dashboard',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('dashboard', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/dashboard'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/dashboard',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.EVM_TOOL, () => {
    if (focusSingletonWindow('evm-tool')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'EVM Tool',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('evm-tool', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/evm-tool'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/evm-tool',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.DAILY_REPORT, () => {
    if (focusSingletonWindow('daily-report')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Progress Tracking',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('daily-report', window)

    const hash = '/progress?section=dailyreport'
    const url = ENVIRONMENT.IS_DEV
      ? `http://localhost:4927/#${hash}`
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash,
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.APP_LOGS, () => {
    if (focusSingletonWindow('app-logs')) return

    const win = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Application Logs',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('app-logs', win)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/app-logs'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/app-logs',
        })
    win.loadURL(url)

    win.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        win.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.SHOW_LOG, (_event, data) => {
    const dataToSend = typeof data === 'string' ? { path: data } : data

    const existingShowLog = focusSingletonWindow('show-log')
    if (existingShowLog) {
      pendingDiffDataByWindowId.set(existingShowLog.id, dataToSend)
      existingShowLog.webContents.send('load-diff-data', dataToSend)
      return
    }

    const win = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Logs',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('show-log', win)

    pendingDiffDataByWindowId.set(win.id, dataToSend)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/show-log'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/show-log',
        })
    win.loadURL(url)

    win.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        win.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.CHECK_CODING_RULES, (_event, { selectedFiles, codingRuleId, codingRuleName }) => {
    const existingRules = focusSingletonWindow('check-coding-rules')
    if (existingRules) {
      const payload = { selectedFiles, codingRuleId, codingRuleName }
      pendingDiffDataByWindowId.set(existingRules.id, payload)
      existingRules.webContents.send('load-diff-data', payload)
      return
    }

    const win = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Check Coding Rules',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('check-coding-rules', win)

    pendingDiffDataByWindowId.set(win.id, { selectedFiles, codingRuleId, codingRuleName })

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/check-coding-rules'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/check-coding-rules',
        })
    win.loadURL(url)

    win.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        win.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.SPOTBUGS, (_event, filePaths) => {
    const existingSpotbugs = focusSingletonWindow('spotbugs')
    if (existingSpotbugs) {
      Object.defineProperty(existingSpotbugs, 'filePaths', {
        value: filePaths,
        writable: true,
        configurable: true,
      })
      void sendSpotBugsResultToWindow(existingSpotbugs, filePaths)
      return
    }

    const win = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Spotbugs',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('spotbugs', win)

    Object.defineProperty(win, 'filePaths', {
      value: filePaths,
      writable: true,
      configurable: true,
    })

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/spotbugs'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/spotbugs',
        })
    win.loadURL(url)

    win.webContents.on('did-finish-load', async () => {
      await sendSpotBugsResultToWindow(win, filePaths)
      if (ENVIRONMENT.IS_DEV) {
        win.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.COMMIT_MESSAGE_HISTORY, _event => {
    if (focusSingletonWindow('commit-message-history')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Commit Message History',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('commit-message-history', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/commit-message-history'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/commit-message-history',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.MERGE_SVN, _event => {
    if (focusSingletonWindow('merge-svn')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Merge SVN',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('merge-svn', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/merge-svn'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/merge-svn',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.CONFLICT_RESOLVER, (_event, data?: { path?: string; versionControlSystem?: 'git' | 'svn' }) => {
    const existingConflict = focusSingletonWindow('conflict-resolver')
    if (existingConflict) {
      if (data) {
        pendingConflictDataByWindowId.set(existingConflict.id, data)
        existingConflict.webContents.send('load-conflict-resolver-data', data)
      }
      return
    }

    const window = new BrowserWindow({
      width: 1366,
      height: 800,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Conflict Resolver',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('conflict-resolver', window)

    if (data) {
      pendingConflictDataByWindowId.set(window.id, data)
    }
    window.on('closed', () => pendingConflictDataByWindowId.delete(window.id))

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/conflict-resolver'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/conflict-resolver',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.REQUEST_CONFLICT_RESOLVER_DATA, event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const data = pendingConflictDataByWindowId.get(win.id)
    if (data) {
      win.webContents.send('load-conflict-resolver-data', data)
      pendingConflictDataByWindowId.delete(win.id)
    }
  })

  ipcMain.on(IPC.WINDOW.NOTIFY_CONFLICT_RESOLVED, () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents && !w.webContents.isDestroyed()) {
        w.webContents.send('git-conflict-resolved')
      }
    }
  })

  ipcMain.on(IPC.WINDOW.SHOW_GIT_BLAME, (_event, data) => {
    const filePath = typeof data === 'string' ? data : data.path
    const url = ENVIRONMENT.IS_DEV
      ? `http://localhost:4927/#/gitblame?filePath=${encodeURIComponent(filePath)}`
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: `/gitblame?filePath=${encodeURIComponent(filePath)}`,
        })

    const existingBlame = focusSingletonWindow('git-blame')
    if (existingBlame) {
      existingBlame.loadURL(url)
      return
    }

    const window = new BrowserWindow({
      width: 1365,
      height: 768,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Git Blame',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('git-blame', window)

    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.PROGRESS, () => {
    if (focusSingletonWindow('progress')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 800,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Progress Tracking',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('progress', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/progress'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/progress',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.TEAM_PROGRESS, () => {
    if (focusSingletonWindow('team-progress')) return

    const window = new BrowserWindow({
      width: 1365,
      height: 800,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Team Progress',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('team-progress', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/team-progress'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/team-progress',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.REPORT_MANAGER, () => {
    if (focusSingletonWindow('report-manager')) return

    const window = new BrowserWindow({
      width: 1200,
      height: 760,
      minWidth: 1366,
      minHeight: 768,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'Report Manager',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('report-manager', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/report-manager'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/report-manager',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  ipcMain.on(IPC.WINDOW.PR_MANAGER, () => {
    if (focusSingletonWindow('pr-manager')) return

    const window = new BrowserWindow({
      width: 1366,
      height: 820,
      minWidth: 1280,
      minHeight: 720,
      center: true,
      frame: false,
      show: true,
      backgroundColor: getWindowBackgroundColor(),
      autoHideMenuBar: true,
      title: 'PR Manager',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    registerSingletonWindow('pr-manager', window)

    const url = ENVIRONMENT.IS_DEV
      ? 'http://localhost:4927/#/pr-manager'
      : format({
          pathname: resolve(__dirname, '../renderer/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/pr-manager',
        })
    window.loadURL(url)

    window.webContents.on('did-finish-load', () => {
      if (ENVIRONMENT.IS_DEV) {
        window.webContents.openDevTools({ mode: 'bottom' })
      }
    })
  })

  l.info('✅ Window IPC Handlers Registered')
}
