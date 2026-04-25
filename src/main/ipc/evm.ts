import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import {
  createAcRow,
  createAcRowsBatch,
  createProject,
  createWbsRow,
  createWbsRowsBatch,
  deleteAcRow,
  deleteWbsRow,
  ensureProjectForEvm,
  getEvmMasterPhases,
  getEVMData,
  insertEvmAiInsight,
  listEvmAiInsights,
  getProjects,
  listEvmProjectPmPlUsers,
  updateEvmProject,
  updateAcRow,
  updateMaster,
  updateWbsRow,
  updateWbsMasterRow,
  replaceWbsDayUnitsForWbs,
} from '../task/mysqlEVMStore'
import { assertEvmProjectId, assertEvmRecordId, isValidEvmProjectId } from '../task/evmProjectId'
import type { ACRow, EVMMasterUpdatePayload, EVMProject, WBSRow } from 'shared/types/evm'
import type { WbsMasterUpdatePayload } from '../task/mysqlEVMStore'

function normalizeOptionalProjectId(projectId?: string): string | undefined {
  if (projectId == null) return undefined
  const s = String(projectId).trim()
  if (s === '') return undefined
  if (!isValidEvmProjectId(s)) throw new Error('Invalid project id')
  return s
}

export function registerEVMHandlers() {
  l.info('Registering EVM IPC Handlers...')

  ipcMain.handle(IPC.EVM.GET_DATA, async (_, projectId?: string) => {
    try {
      const id = normalizeOptionalProjectId(projectId)
      const data = await getEVMData(id)
      return { status: 'success' as const, data }
    } catch (err: unknown) {
      l.error('evm:get-data error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.GET_PROJECTS, async () => {
    try {
      const projects = await getProjects()
      return { status: 'success' as const, data: projects }
    } catch (err: unknown) {
      l.error('evm:get-projects error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.GET_PROJECT_PM_PL, async (_, projectId: string) => {
    try {
      const data = await listEvmProjectPmPlUsers(assertEvmProjectId(projectId))
      return { status: 'success' as const, data }
    } catch (err: unknown) {
      l.error('evm:get-project-pm-pl error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.ENSURE_PROJECT_FOR_EVM, async (_, projectId: string) => {
    try {
      const project = await ensureProjectForEvm(projectId)
      return { status: 'success' as const, data: project }
    } catch (err: unknown) {
      l.error('evm:ensure-project-for-evm error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.CREATE_PROJECT, async (_, input: Partial<EVMProject>) => {
    try {
      const project = await createProject(input)
      return { status: 'success' as const, data: project }
    } catch (err: unknown) {
      l.error('evm:create-project error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.UPDATE_PROJECT, async (_, projectId: string, updates: Partial<EVMProject>) => {
    try {
      const project = await updateEvmProject(assertEvmProjectId(projectId), updates)
      return { status: 'success' as const, data: project }
    } catch (err: unknown) {
      l.error('evm:update-project error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.CREATE_WBS, async (_, projectId: string, row: Omit<WBSRow, 'id' | 'projectId' | 'no'>) => {
    try {
      const created = await createWbsRow(assertEvmProjectId(projectId), row)
      return { status: 'success' as const, data: created }
    } catch (err: unknown) {
      l.error('evm:create-wbs error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.CREATE_WBS_BATCH, async (_, projectId: string, rows: Omit<WBSRow, 'id' | 'projectId' | 'no'>[]) => {
    try {
      const created = await createWbsRowsBatch(assertEvmProjectId(projectId), rows)
      return { status: 'success' as const, data: created }
    } catch (err: unknown) {
      l.error('evm:create-wbs-batch error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.UPDATE_WBS, async (_, id: string, updates: Partial<WBSRow>) => {
    try {
      const updated = await updateWbsRow(assertEvmRecordId(id, 'wbs id'), updates)
      return { status: 'success' as const, data: updated }
    } catch (err: unknown) {
      l.error('evm:update-wbs error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.UPDATE_WBS_MASTER, async (_, masterId: string, updates: WbsMasterUpdatePayload) => {
    try {
      const data = await updateWbsMasterRow(assertEvmRecordId(masterId, 'wbs master id'), updates)
      return { status: 'success' as const, data }
    } catch (err: unknown) {
      l.error('evm:update-wbs-master error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.DELETE_WBS, async (_, id: string) => {
    try {
      await deleteWbsRow(assertEvmRecordId(id, 'wbs id'))
      return { status: 'success' as const }
    } catch (err: unknown) {
      l.error('evm:delete-wbs error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.CREATE_AC, async (_, projectId: string, row: Omit<ACRow, 'id' | 'projectId' | 'no'>) => {
    try {
      const created = await createAcRow(projectId, row)
      return { status: 'success' as const, data: created }
    } catch (err: unknown) {
      l.error('evm:create-ac error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.CREATE_AC_BATCH, async (_, projectId: string, rows: Omit<ACRow, 'id' | 'projectId' | 'no'>[]) => {
    try {
      const created = await createAcRowsBatch(assertEvmProjectId(projectId), rows)
      return { status: 'success' as const, data: created }
    } catch (err: unknown) {
      l.error('evm:create-ac-batch error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.GET_MASTER_PHASES, async (_, projectId: string) => {
    try {
      const phases = await getEvmMasterPhases(projectId)
      return { status: 'success' as const, data: phases }
    } catch (err: unknown) {
      l.error('evm:get-master-phases error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.UPDATE_AC, async (_, id: string, updates: Omit<Partial<ACRow>, 'percentDone'> & { percentDone?: number | null }) => {
    try {
      const updated = await updateAcRow(assertEvmRecordId(id, 'ac id'), updates)
      return { status: 'success' as const, data: updated }
    } catch (err: unknown) {
      l.error('evm:update-ac error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.DELETE_AC, async (_, id: string) => {
    try {
      await deleteAcRow(assertEvmRecordId(id, 'ac id'))
      return { status: 'success' as const }
    } catch (err: unknown) {
      l.error('evm:delete-ac error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EVM.UPDATE_MASTER, async (_, projectId: string, updates: EVMMasterUpdatePayload) => {
    try {
      const updated = await updateMaster(assertEvmProjectId(projectId), updates)
      return { status: 'success' as const, data: updated }
    } catch (err: unknown) {
      l.error('evm:update-master error:', err)
      return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    IPC.EVM.REPLACE_WBS_DAY_UNITS_FOR_WBS,
    async (_, projectId: string, wbsId: string, entries: { workDate: string; unit: number }[]) => {
      try {
        await replaceWbsDayUnitsForWbs(
          assertEvmProjectId(projectId),
          assertEvmRecordId(wbsId, 'wbs id'),
          entries,
        )
        return { status: 'success' as const }
      } catch (err: unknown) {
        l.error('evm:replace-wbs-day-units-for-wbs error:', err)
        return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.EVM.SAVE_AI_INSIGHT,
    async (
      _,
      args: { projectId: string; insightType: string; outputMarkdown: string; inputPayloadJson?: string | null }
    ) => {
      try {
        const data = await insertEvmAiInsight({
          projectId: assertEvmProjectId(args.projectId),
          insightType: args.insightType,
          outputMarkdown: args.outputMarkdown,
          inputPayloadJson: args.inputPayloadJson,
        })
        return { status: 'success' as const, data }
      } catch (err: unknown) {
        l.error('evm:save-ai-insight error:', err)
        return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.EVM.LIST_AI_INSIGHTS,
    async (_, args: { projectId: string; insightType?: string; limit?: number; offset?: number }) => {
      try {
        const data = await listEvmAiInsights(
          assertEvmProjectId(args.projectId),
          args.insightType,
          args.limit ?? 50,
          args.offset ?? 0
        )
        return { status: 'success' as const, data }
      } catch (err: unknown) {
        l.error('evm:list-ai-insights error:', err)
        return { status: 'error' as const, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
