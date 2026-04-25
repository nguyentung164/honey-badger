import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getTokenFromStore, type SessionData, verifyToken } from '../task/auth'
import {
  createMasterPriority,
  createMasterSource,
  createMasterStatus,
  createMasterType,
  deleteMasterPriority,
  deleteMasterSource,
  deleteMasterStatus,
  deleteMasterType,
  getMasterPrioritiesAll,
  getMasterSourcesAll,
  getMasterStatusesAll,
  getMasterTaskLinkTypesAll,
  getMasterTypesAll,
  updateMasterPriority,
  updateMasterSource,
  updateMasterStatus,
  updateMasterType,
} from '../task/mysqlTaskStore'

function withAuthFromStore<T extends unknown[]>(handler: (event: IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>) {
  return async (event: IpcMainInvokeEvent, ...args: T) => {
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (!session) {
      return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    }
    return handler(event, session, ...args)
  }
}

export function registerMasterIpcHandlers() {
  l.info('Registering Master IPC Handlers...')

  ipcMain.handle(
    IPC.MASTER.GET_STATUSES_ALL,
    withAuthFromStore(async (_event, _session) => {
      try {
        const data = await getMasterStatusesAll()
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:get-statuses-all error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.GET_PRIORITIES_ALL,
    withAuthFromStore(async (_event, _session) => {
      try {
        const data = await getMasterPrioritiesAll()
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:get-priorities-all error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.GET_TYPES_ALL,
    withAuthFromStore(async (_event, _session) => {
      try {
        const data = await getMasterTypesAll()
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:get-types-all error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.GET_SOURCES_ALL,
    withAuthFromStore(async (_event, _session) => {
      try {
        const data = await getMasterSourcesAll()
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:get-sources-all error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.GET_TASK_LINK_TYPES_ALL,
    withAuthFromStore(async (_event, _session) => {
      try {
        const data = await getMasterTaskLinkTypesAll()
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:get-task-link-types-all error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.CREATE_STATUS,
    withAuthFromStore(async (_event, _session, input: { code: string; name: string; sort_order?: number; color?: string }) => {
      try {
        const data = await createMasterStatus(input)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:create-status error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.UPDATE_STATUS,
    withAuthFromStore(async (_event, _session, code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => {
      try {
        const result = await updateMasterStatus(code, data)
        return { status: 'success' as const, data: result }
      } catch (error: any) {
        l.error('master:update-status error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.DELETE_STATUS,
    withAuthFromStore(async (_event, _session, code: string) => {
      try {
        await deleteMasterStatus(code)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('master:delete-status error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.CREATE_PRIORITY,
    withAuthFromStore(async (_event, _session, input: { code: string; name: string; sort_order?: number; color?: string }) => {
      try {
        const data = await createMasterPriority(input)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:create-priority error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.UPDATE_PRIORITY,
    withAuthFromStore(async (_event, _session, code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => {
      try {
        const result = await updateMasterPriority(code, data)
        return { status: 'success' as const, data: result }
      } catch (error: any) {
        l.error('master:update-priority error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.DELETE_PRIORITY,
    withAuthFromStore(async (_event, _session, code: string) => {
      try {
        await deleteMasterPriority(code)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('master:delete-priority error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.CREATE_TYPE,
    withAuthFromStore(async (_event, _session, input: { code: string; name: string; sort_order?: number; color?: string }) => {
      try {
        const data = await createMasterType(input)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:create-type error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.UPDATE_TYPE,
    withAuthFromStore(async (_event, _session, code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => {
      try {
        const result = await updateMasterType(code, data)
        return { status: 'success' as const, data: result }
      } catch (error: any) {
        l.error('master:update-type error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.DELETE_TYPE,
    withAuthFromStore(async (_event, _session, code: string) => {
      try {
        await deleteMasterType(code)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('master:delete-type error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.CREATE_SOURCE,
    withAuthFromStore(async (_event, _session, input: { code: string; name: string; sort_order?: number }) => {
      try {
        const data = await createMasterSource(input)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('master:create-source error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.UPDATE_SOURCE,
    withAuthFromStore(async (_event, _session, code: string, data: { name?: string; sort_order?: number; is_active?: boolean }) => {
      try {
        const result = await updateMasterSource(code, data)
        return { status: 'success' as const, data: result }
      } catch (error: any) {
        l.error('master:update-source error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.MASTER.DELETE_SOURCE,
    withAuthFromStore(async (_event, _session, code: string) => {
      try {
        await deleteMasterSource(code)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('master:delete-source error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  l.info('Master IPC Handlers registered')
}
