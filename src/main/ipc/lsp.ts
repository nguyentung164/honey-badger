import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import {
  enqueueLanguageServerMessage,
} from 'main/lsp/lspMessageQueue'
import {
  startLanguageServer,
  stopAllLanguageServers,
  stopLanguageServer,
} from 'main/lsp/LanguageServerManager'
import type { LspSendPayload, LspStartPayload, LspStopPayload } from 'shared/lsp/types'
import { fileUriToPath } from 'shared/fileUri'

function isStartPayload(value: unknown): value is LspStartPayload {
  if (!value || typeof value !== 'object') return false
  const p = value as LspStartPayload
  return (p.serverId === 'typescript' || p.serverId === 'java') && typeof p.rootUri === 'string'
}

function isStopPayload(value: unknown): value is LspStopPayload {
  if (!value || typeof value !== 'object') return false
  const p = value as LspStopPayload
  return (p.serverId === 'typescript' || p.serverId === 'java') && typeof p.rootUri === 'string'
}

function isSendPayload(value: unknown): value is LspSendPayload {
  if (!value || typeof value !== 'object') return false
  const p = value as LspSendPayload
  return (p.serverId === 'typescript' || p.serverId === 'java') && typeof p.rootUri === 'string' && typeof p.message === 'string'
}

export function registerLspIpcHandlers(): void {
  ipcMain.handle(IPC.LSP.START, async (event, payload: unknown) => {
    if (!isStartPayload(payload)) return { success: false, error: 'Invalid payload' }
    const rootPath = fileUriToPath(payload.rootUri)
    return startLanguageServer(event.sender, payload.serverId, rootPath, payload.typescriptUserPreferences)
  })

  ipcMain.handle(IPC.LSP.STOP, (_event, payload: unknown) => {
    if (!isStopPayload(payload)) return { success: false }
    stopLanguageServer(payload.serverId, fileUriToPath(payload.rootUri))
    return { success: true }
  })

  ipcMain.on(IPC.LSP.SEND, (_event, payload: unknown) => {
    if (!isSendPayload(payload)) return
    enqueueLanguageServerMessage(payload)
  })

  l.info('✅ LSP IPC Handlers Registered')
}

export { stopAllLanguageServers }
