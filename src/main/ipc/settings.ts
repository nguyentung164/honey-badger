import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import appearanceStore from '../store/AppearanceStore'
import configurationStore, { type Schema as ConfigurationSchema } from '../store/ConfigurationStore'
import externalEditorStore from '../store/ExternalEditorStore'
import mailServerStore from '../store/MailServerStore'
import sourceFolderStore from '../store/SourceFolderStore'
import webhookStore from '../store/WebhookStore'
import { resetPool } from '../task/db'
import { getCodingRulesGlobalOnly, getFirstAdminUserId, createCodingRule } from '../task/mysqlTaskStore'
import { startFileWatcher } from '../utils/fileWatcher'

const BACKUP_VERSION = 1

/** Paths đã set từ renderer (multi-repo). Khi CONFIGURATION.SET chạy, dùng lại để không ghi đè watcher multi-repo. */
let lastMultirepoWatchPaths: string[] = []

/**
 * Single-repo: `sourceFolder`. Multi-repo: chỉ `lastMultirepoWatchPaths` — không fallback `sourceFolder`
 * khi chưa chọn project / chưa có repo (tránh watch nhầm repo single cũ).
 */
export function getResolvedWatchPathsForFileWatcher(): string | string[] {
  const { sourceFolder, multiRepoEnabled } = configurationStore.store
  if (multiRepoEnabled) {
    return lastMultirepoWatchPaths.length > 0 ? lastMultirepoWatchPaths : []
  }
  return sourceFolder
}

export function notifyConfigurationChangedAndRestartWatcher() {
  resetPool()
  const mainWindow = BrowserWindow.getAllWindows()[0] ?? null
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.webContents && !w.webContents.isDestroyed()) {
      w.webContents.send(IPC.CONFIG_UPDATED)
    }
  }
  const { autoRefreshEnabled } = configurationStore.store
  startFileWatcher(getResolvedWatchPathsForFileWatcher(), mainWindow, autoRefreshEnabled ?? true)
}

export interface ConfigBackup {
  version: number
  exportedAt: string
  configuration: Record<string, unknown>
  appearance: Record<string, unknown>
  mailServer: Record<string, unknown>
  webhooks: { name: string; url: string }[]
  codingRules: { id?: string; name: string; content: string; projectId?: string | null }[]
  sourceFolders: { name: string; path: string }[]
  externalEditors: { name: string; path: string }[]
}

export function registerSettingsIpcHandlers() {
  l.info('🔄 Registering Settings IPC Handlers...')

  // Appearance Settings
  ipcMain.handle(IPC.SETTING.APPEARANCE.SET, (_, key, value) => appearanceStore.set(key, value))

  // Configuration Settings
  ipcMain.handle(IPC.SETTING.CONFIGURATION.GET, () => configurationStore.store)
  ipcMain.handle(IPC.SETTING.CONFIGURATION.SET, (_, config) => {
    configurationStore.set(config)
    notifyConfigurationChangedAndRestartWatcher()
  })
  /** Merge partial vào config trên disk — tránh ghi đè toàn bộ bằng snapshot Zustand chưa load (vd. logout). */
  ipcMain.handle(IPC.SETTING.CONFIGURATION.PATCH, (_, partial: Partial<ConfigurationSchema>) => {
    if (!partial || typeof partial !== 'object') return
    const delta = Object.fromEntries(
      Object.entries(partial).filter(([, v]) => v !== undefined),
    ) as Partial<ConfigurationSchema>
    if (Object.keys(delta).length === 0) return
    configurationStore.set({ ...configurationStore.store, ...delta })
    if (delta.multiRepoEnabled === false) {
      lastMultirepoWatchPaths = []
    }
    notifyConfigurationChangedAndRestartWatcher()
  })

  ipcMain.handle(IPC.SETTING.CONFIGURATION.PATCH_SILENT, (_, partial: Partial<ConfigurationSchema>) => {
    if (!partial || typeof partial !== 'object') return
    const delta = Object.fromEntries(
      Object.entries(partial).filter(([, v]) => v !== undefined),
    ) as Partial<ConfigurationSchema>
    if (Object.keys(delta).length === 0) return
    configurationStore.set({ ...configurationStore.store, ...delta })
    if (delta.multiRepoEnabled === false) {
      lastMultirepoWatchPaths = []
    }
    resetPool()
  })

  ipcMain.handle(IPC.SETTING.SET_MULTIREPO_WATCH_PATHS, (_, paths: string[]) => {
    const mainWindow = BrowserWindow.getAllWindows()[0] ?? null
    const { autoRefreshEnabled } = configurationStore.store
    lastMultirepoWatchPaths = Array.isArray(paths) && paths.length > 0 ? paths : []
    startFileWatcher(getResolvedWatchPathsForFileWatcher(), mainWindow, autoRefreshEnabled ?? true)
  })

  // Mail Server Settings
  ipcMain.handle(IPC.SETTING.MAIL_SERVER.GET, () => mailServerStore.store)
  ipcMain.handle(IPC.SETTING.MAIL_SERVER.SET, (_, config) => mailServerStore.set(config))
  ipcMain.handle(IPC.SETTING.MAIL_SERVER.TEST, async (_, config: { smtpServer: string; port: string; email: string; password: string }) => {
    try {
      const { smtpServer, port, email, password } = config || mailServerStore.store
      if (!smtpServer?.trim() || !port?.trim() || !email?.trim() || !password?.trim()) {
        return { success: false, error: 'Please fill in all required fields (SMTP server, port, email, password)' }
      }
      const smtpOptions: SMTPTransport.Options = {
        host: smtpServer,
        port: Number(port),
        secure: false,
        auth: { user: email, pass: password },
      }
      const transporter = nodemailer.createTransport(smtpOptions)
      await transporter.verify()
      return { success: true }
    } catch (err: any) {
      l.error('Mail server test failed:', err)
      return { success: false, error: err?.message || String(err) }
    }
  })

  // Config Backup & Restore
  ipcMain.handle(IPC.SETTING.CONFIG.EXPORT, async () => {
    let codingRules: { id?: string; name: string; content: string; projectId?: string | null }[] = []
    try {
      codingRules = (await getCodingRulesGlobalOnly()).map(r => ({ id: r.id, name: r.name, content: r.content, projectId: r.projectId }))
    } catch {
      // DB not configured or table doesn't exist
    }
    const backup: ConfigBackup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      configuration: configurationStore.store as unknown as Record<string, unknown>,
      appearance: appearanceStore.store as unknown as Record<string, unknown>,
      mailServer: mailServerStore.store as unknown as Record<string, unknown>,
      webhooks: webhookStore.store.webhooks || [],
      codingRules,
      sourceFolders: sourceFolderStore.store.sourceFolders || [],
      externalEditors: externalEditorStore.store.externalEditors || [],
    }
    return JSON.stringify(backup, null, 2)
  })

  ipcMain.handle(IPC.SETTING.CONFIG.IMPORT, async (_, jsonString: string) => {
    try {
      const backup = JSON.parse(jsonString) as ConfigBackup
      if (!backup.version || !backup.configuration) {
        return { success: false, error: 'Invalid backup format' }
      }
      if (backup.configuration) {
        configurationStore.set(backup.configuration as any)
        resetPool()
      }
      if (backup.appearance) appearanceStore.set(backup.appearance as any)
      if (backup.mailServer) mailServerStore.set(backup.mailServer as any)
      if (Array.isArray(backup.webhooks)) webhookStore.set({ webhooks: backup.webhooks })
      if (Array.isArray(backup.codingRules) && backup.codingRules.length > 0) {
        try {
          const adminId = await getFirstAdminUserId()
          if (adminId) {
            for (const r of backup.codingRules) {
              if (r?.name && r?.content) {
                try {
                  await createCodingRule({ name: r.name, content: r.content, projectId: null, createdBy: adminId })
                } catch {
                  // Duplicate or other error - skip
                }
              }
            }
          }
        } catch {
          // DB not configured - skip
        }
      }
      if (Array.isArray(backup.sourceFolders)) sourceFolderStore.set({ sourceFolders: backup.sourceFolders })
      if (Array.isArray(backup.externalEditors)) externalEditorStore.set({ externalEditors: backup.externalEditors })
      // Restart file watcher
      const mainWindow = BrowserWindow.getAllWindows()[0] ?? null
      const { autoRefreshEnabled } = configurationStore.store
      startFileWatcher(getResolvedWatchPathsForFileWatcher(), mainWindow, autoRefreshEnabled ?? true)
      // Broadcast config updated
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.webContents && !w.webContents.isDestroyed()) {
          w.webContents.send(IPC.CONFIG_UPDATED)
        }
      }
      return { success: true }
    } catch (err: any) {
      l.error('Config import failed:', err)
      return { success: false, error: err?.message || String(err) }
    }
  })

  ipcMain.handle('setting:config:export-to-file', async (_, defaultPath?: string) => {
    let codingRules: { id?: string; name: string; content: string; projectId?: string | null }[] = []
    try {
      codingRules = (await getCodingRulesGlobalOnly()).map(r => ({ id: r.id, name: r.name, content: r.content, projectId: r.projectId }))
    } catch {
      // DB not configured
    }
    const backup: ConfigBackup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      configuration: configurationStore.store as unknown as Record<string, unknown>,
      appearance: appearanceStore.store as unknown as Record<string, unknown>,
      mailServer: mailServerStore.store as unknown as Record<string, unknown>,
      webhooks: webhookStore.store.webhooks || [],
      codingRules,
      sourceFolders: sourceFolderStore.store.sourceFolders || [],
      externalEditors: externalEditorStore.store.externalEditors || [],
    }
    const json = JSON.stringify(backup, null, 2)
    const filename = `honey-badger-backup-${new Date().toISOString().slice(0, 10)}.json`
    const result = await dialog.showSaveDialog(BrowserWindow.getAllWindows()[0] || undefined, {
      defaultPath: defaultPath || path.join(process.cwd(), filename),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    fs.writeFileSync(result.filePath, json, 'utf-8')
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('setting:config:import-from-file', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0] || undefined, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    const filePath = result.filePaths[0]
    const jsonString = fs.readFileSync(filePath, 'utf-8')
    const importResult = await (async () => {
      try {
        const backup = JSON.parse(jsonString) as ConfigBackup
        if (!backup.version || !backup.configuration) {
          return { success: false, error: 'Invalid backup format' }
        }
        if (backup.configuration) {
          configurationStore.set(backup.configuration as any)
          resetPool()
        }
        if (backup.appearance) appearanceStore.set(backup.appearance as any)
        if (backup.mailServer) mailServerStore.set(backup.mailServer as any)
        if (Array.isArray(backup.webhooks)) webhookStore.set({ webhooks: backup.webhooks })
        if (Array.isArray(backup.codingRules) && backup.codingRules.length > 0) {
          try {
            const adminId = await getFirstAdminUserId()
            if (adminId) {
              for (const r of backup.codingRules) {
                if (r?.name && r?.content) {
                  try {
                    await createCodingRule({ name: r.name, content: r.content, projectId: null, createdBy: adminId })
                  } catch {
                    // Skip duplicate
                  }
                }
              }
            }
          } catch {
            // DB not configured
          }
        }
        if (Array.isArray(backup.sourceFolders)) sourceFolderStore.set({ sourceFolders: backup.sourceFolders })
        if (Array.isArray(backup.externalEditors)) externalEditorStore.set({ externalEditors: backup.externalEditors })
        const mainWindow = BrowserWindow.getAllWindows()[0] ?? null
        const { autoRefreshEnabled } = configurationStore.store
        startFileWatcher(getResolvedWatchPathsForFileWatcher(), mainWindow, autoRefreshEnabled ?? true)
        for (const w of BrowserWindow.getAllWindows()) {
          if (w.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send(IPC.CONFIG_UPDATED)
          }
        }
        return { success: true }
      } catch (err: any) {
        l.error('Config import failed:', err)
        return { success: false, error: err?.message || String(err) }
      }
    })()
    return { ...importResult, canceled: false }
  })

  // Webhook Settings
  ipcMain.handle(IPC.SETTING.WEBHOOK.GET, () => webhookStore.store)
  ipcMain.handle(IPC.SETTING.WEBHOOK.SET, (_, config) => webhookStore.set(config))
  // External Editor Settings
  ipcMain.handle(IPC.SETTING.EXTERNAL_EDITOR.GET, () => externalEditorStore.store)
  ipcMain.handle(IPC.SETTING.EXTERNAL_EDITOR.SET, (_, config) => externalEditorStore.set(config))

  // Webhook Settings
  ipcMain.handle(IPC.SETTING.WEBHOOK.TEST, async (_, webhookUrl: string) => {
    try {
      const url = webhookUrl || configurationStore.store.webhookMS
      if (!url?.trim()) {
        return { success: false, error: 'Webhook URL is not configured' }
      }
      const payload = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.5',
              body: [{ type: 'TextBlock', text: 'Test connection from Honey Badger', weight: 'Bolder' }],
            },
          },
        ],
      }
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      })
      if (response.status >= 200 && response.status < 300) {
        return { success: true }
      }
      return { success: false, error: `HTTP ${response.status}` }
    } catch (err: any) {
      l.error('Webhook test failed:', err)
      const msg = err?.response?.data || err?.message || String(err)
      return { success: false, error: typeof msg === 'object' ? JSON.stringify(msg) : msg }
    }
  })

  l.info('✅ Settings IPC Handlers Registered')
}
