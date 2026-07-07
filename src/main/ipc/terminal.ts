import os from 'node:os'
import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { createTerminal, destroyTerminal, detachTerminal, resizeTerminal, writeTerminal } from 'main/terminal/manager'
import { getAvailableShellProfiles } from 'main/terminal/shells'
import type { TerminalCreateOptions, TerminalResizePayload, TerminalWritePayload } from 'shared/terminal/types'

function isWritePayload(value: unknown): value is TerminalWritePayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as TerminalWritePayload
  return typeof payload.id === 'string' && typeof payload.data === 'string'
}

function isResizePayload(value: unknown): value is TerminalResizePayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as TerminalResizePayload
  return typeof payload.id === 'string' && typeof payload.cols === 'number' && typeof payload.rows === 'number'
}

export function registerTerminalIpcHandlers(): void {
  ipcMain.handle(IPC.TERMINAL.CREATE, (event, opts?: TerminalCreateOptions) => {
    return createTerminal(event.sender, opts ?? {})
  })

  ipcMain.handle(IPC.TERMINAL.LIST_SHELLS, () => getAvailableShellProfiles())

  ipcMain.handle(IPC.TERMINAL.GET_USER_HOME, () => os.homedir())

  ipcMain.handle(IPC.TERMINAL.DESTROY, async (event, id?: string) => {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid terminal id' }
    }
    const destroyed = await destroyTerminal(event.sender, id)
    return destroyed ? { success: true } : { success: false, error: 'Terminal not found' }
  })

  ipcMain.handle(IPC.TERMINAL.DETACH, (event, id?: string) => {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid terminal id' }
    }
    const detached = detachTerminal(event.sender, id)
    return detached ? { success: true } : { success: false, error: 'Terminal not found' }
  })

  ipcMain.on(IPC.TERMINAL.WRITE, (event, payload: unknown) => {
    if (!isWritePayload(payload)) return
    writeTerminal(event.sender, payload.id, payload.data)
  })

  ipcMain.on(IPC.TERMINAL.RESIZE, (event, payload: unknown) => {
    if (!isResizePayload(payload)) return
    resizeTerminal(event.sender, payload.id, payload.cols, payload.rows)
  })

  l.info('✅ Terminal IPC Handlers Registered')
}
