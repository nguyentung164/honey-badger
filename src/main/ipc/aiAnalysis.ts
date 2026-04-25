import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import {
  deleteAnalysis,
  deleteHistoryById,
  getAnalysis,
  getAllHistory,
  getHistoryByFolder,
  getHistoryById,
  saveAnalysis,
  saveAnalysisHistory,
} from '../task/mysqlAiAnalysis'

export function registerAiAnalysisIpcHandlers() {
  l.info('Registering AiAnalysis IPC Handlers...')

  ipcMain.handle(IPC.AI_ANALYSIS.SAVE, async (_event, record: Parameters<typeof saveAnalysis>[0]) => {
    try {
      await saveAnalysis(record)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('ai-analysis:save error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.GET, async (_event, sourceFolderPath: string) => {
    try {
      const record = await getAnalysis(sourceFolderPath)
      return { status: 'success' as const, data: record }
    } catch (error: any) {
      l.error('ai-analysis:get error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.DELETE, async (_event, sourceFolderPath: string) => {
    try {
      await deleteAnalysis(sourceFolderPath)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('ai-analysis:delete error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.HISTORY_SAVE, async (_event, record: Parameters<typeof saveAnalysisHistory>[0]) => {
    try {
      const id = await saveAnalysisHistory(record)
      return { status: 'success' as const, data: id }
    } catch (error: any) {
      l.error('ai-analysis-history:save error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.HISTORY_GET_ALL, async () => {
    try {
      const history = await getAllHistory()
      return { status: 'success' as const, data: history }
    } catch (error: any) {
      l.error('ai-analysis-history:get-all error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.HISTORY_GET_BY_FOLDER, async (_event, sourceFolderPath: string) => {
    try {
      const history = await getHistoryByFolder(sourceFolderPath)
      return { status: 'success' as const, data: history }
    } catch (error: any) {
      l.error('ai-analysis-history:get-by-folder error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.HISTORY_GET_BY_ID, async (_event, id: number) => {
    try {
      const record = await getHistoryById(id)
      return { status: 'success' as const, data: record }
    } catch (error: any) {
      l.error('ai-analysis-history:get-by-id error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.AI_ANALYSIS.HISTORY_DELETE, async (_event, id: number) => {
    try {
      await deleteHistoryById(id)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('ai-analysis-history:delete error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })
}
