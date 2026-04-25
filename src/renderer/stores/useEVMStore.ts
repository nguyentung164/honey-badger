import { format } from 'date-fns'
import { EVM_DEFAULT_PHASES } from 'shared/evmDefaults'
import type { ACRow, EVMData, EVMMaster, EVMMasterUpdatePayload, EVMProject, WBSRow, WbsMasterRow } from 'shared/types/evm'
import { create } from 'zustand'
import { EVM_PERCENT_DONE_OPTIONS_DEFAULT } from '@/lib/evmCalculations'

const DEFAULT_PHASES = EVM_DEFAULT_PHASES.map(p => ({ code: p.code, name: p.name }))

const DEFAULT_STATUSES = [
  { code: 'new', name: 'New' },
  { code: 'in_progress', name: 'In Progress' },
  { code: 'resolved', name: 'Resolved' },
  { code: 'feedback', name: 'Feedback' },
  { code: 'closed', name: 'Closed' },
  { code: 'rejected', name: 'Rejected' },
]

const DEFAULT_PERCENT_DONE = EVM_PERCENT_DONE_OPTIONS_DEFAULT

function createDefaultProject(): EVMProject {
  const now = new Date()
  const start = new Date(now)
  start.setMonth(start.getMonth() - 3)
  const end = new Date(now)
  end.setMonth(end.getMonth() + 3)
  return {
    id: '',
    projectName: 'New Project',
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    reportDate: format(now, 'yyyy-MM-dd'),
  }
}

function createDefaultMaster(projectId: string): EVMMaster {
  return {
    projectId,
    phases: [...DEFAULT_PHASES],
    assignees: [],
    statuses: [...DEFAULT_STATUSES],
    percentDoneOptions: [...DEFAULT_PERCENT_DONE],
    nonWorkingDays: [],
    hoursPerDay: 8,
    phaseReportNotes: {},
    assigneeReportNotes: {},
  }
}

function getDefaultData(): EVMData {
  const project = createDefaultProject()
  return {
    project,
    wbsMaster: [],
    wbs: [],
    ac: [],
    master: createDefaultMaster(project.id),
    wbsDayUnits: [],
  }
}

/** Cập nhật AC; ngày thực tế có thể `null` để xóa trên DB. */
export type AcRowUpdatePayload = Omit<Partial<ACRow>, 'percentDone' | 'actualStartDate' | 'actualEndDate'> & {
  percentDone?: number | null
  actualStartDate?: string | null
  actualEndDate?: string | null
}

interface EVMStore extends EVMData {
  dbError: string | null
  loadData: (projectId?: string) => Promise<void>
  setWbs: (wbs: WBSRow[]) => void
  addWbsRow: (row: Omit<WBSRow, 'id' | 'projectId' | 'no'>) => Promise<WBSRow | undefined>
  replaceWbsDayUnitsForRow: (wbsId: string, entries: { workDate: string; unit: number }[]) => Promise<void>
  addWbsRowsBatchToProject: (projectId: string, rows: Omit<WBSRow, 'id' | 'projectId' | 'no'>[]) => Promise<WBSRow[]>
  updateWbsRow: (id: string, updates: Partial<WBSRow>) => Promise<void>
  updateWbsMaster: (
    masterId: string,
    updates: {
      phase?: string | null
      category?: string | null
      feature?: string | null
      note?: string | null
      assignee?: string | null
    },
  ) => Promise<void>
  removeWbsRow: (id: string) => Promise<void>
  setAc: (ac: ACRow[]) => void
  addAcRow: (row: Omit<ACRow, 'id' | 'projectId' | 'no'>) => Promise<void>
  addAcRowsBatchToProject: (projectId: string, rows: Omit<ACRow, 'id' | 'projectId' | 'no'>[]) => Promise<void>
  updateAcRow: (id: string, updates: AcRowUpdatePayload) => Promise<void>
  removeAcRow: (id: string) => Promise<void>
  setMaster: (master: EVMMasterUpdatePayload) => Promise<void>
  updateProject: (updates: Partial<EVMProject>) => Promise<void>
  createNewProject: () => Promise<void>
  reset: () => void
}

const api = typeof window !== 'undefined' ? window.api?.evm : undefined

export const useEVMStore = create<EVMStore>((set, get) => ({
  ...getDefaultData(),
  dbError: null,

  loadData: async (projectId?: string) => {
    if (!api) {
      set({ dbError: 'EVM API not available' })
      return
    }
    const res = await api.getData(projectId)
    if (res.status === 'error') {
      set({ dbError: res.message ?? 'Database error', ...getDefaultData() })
      return
    }
    if (res.data) {
      const d = res.data as EVMData
      set({
        ...d,
        wbsMaster: d.wbsMaster ?? [],
        wbsDayUnits: d.wbsDayUnits ?? [],
        dbError: null,
      })
      return
    }
    set({ ...getDefaultData(), dbError: null })
  },

  setWbs: wbs => set({ wbs }),

  addWbsRow: async row => {
    const { project, wbs } = get()
    if (!project.id || !api) return undefined
    const res = await api.createWbs(project.id, { ...row, percentDone: row.percentDone ?? 0 })
    if (res.status === 'error') {
      const msg = res.message ?? 'Failed to add WBS row'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const created = res.data as WBSRow
    set({ wbs: [...wbs, created], dbError: null })
    return created
  },

  addWbsRowsBatchToProject: async (projectId, rows) => {
    const { project, wbs } = get()
    if (!api || rows.length === 0) return []
    const res = await api.createWbsBatch(
      projectId,
      rows.map(r => ({ ...r, percentDone: r.percentDone ?? 0 }))
    )
    if (res.status === 'error') {
      const msg = res.message ?? 'Failed to add WBS rows'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const created = (res.data ?? []) as WBSRow[]
    if (project.id === projectId) {
      set({ wbs: [...wbs, ...created], dbError: null })
    }
    return created
  },

  updateWbsRow: async (id, updates) => {
    const { wbs } = get()
    if (!api) return
    const res = await api.updateWbs(id, updates)
    if (res.status === 'error') {
      const msg = res.message ?? 'Update failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    set({
      wbs: wbs.map(r => (r.id === id ? { ...r, ...res.data } : r)),
      dbError: null,
    })
  },

  updateWbsMaster: async (masterId, updates) => {
    const { wbs, wbsMaster } = get()
    if (!api) return
    const res = await api.updateWbsMaster(masterId, updates)
    if (res.status === 'error') {
      const msg = res.message ?? 'Update failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const data = res.data as { master: WbsMasterRow; details: WBSRow[] }
    const detailMap = new Map(data.details.map(d => [d.id, d]))
    set({
      wbsMaster: wbsMaster.map(m => (m.id === data.master.id ? data.master : m)),
      wbs: wbs.map(r => detailMap.get(r.id) ?? r),
      dbError: null,
    })
  },

  removeWbsRow: async id => {
    const { wbs } = get()
    if (!api) return
    const res = await api.deleteWbs(id)
    if (res.status === 'error') {
      const msg = res.message ?? 'Delete failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const filtered = wbs.filter(r => r.id !== id)
    const renumbered = filtered.map((r, i) => ({ ...r, no: i + 1 }))
    set(state => ({
      wbs: renumbered,
      wbsDayUnits: (state.wbsDayUnits ?? []).filter(u => u.wbsId !== id),
      dbError: null,
    }))
  },

  setAc: ac => set({ ac }),

  addAcRow: async row => {
    const { project, ac } = get()
    if (!project.id || !api) return
    const res = await api.createAc(project.id, { ...row, workingHours: row.workingHours ?? 0 })
    if (res.status === 'error') {
      const msg = res.message ?? 'Failed to add AC row'
      set({ dbError: msg })
      throw new Error(msg)
    }
    set({ ac: [...ac, res.data], dbError: null })
  },

  addAcRowsBatchToProject: async (projectId, rows) => {
    const { project, ac } = get()
    if (!api || rows.length === 0) return
    const res = await api.createAcBatch(
      projectId,
      rows.map(r => ({ ...r, workingHours: r.workingHours ?? 0 }))
    )
    if (res.status === 'error') {
      const msg = res.message ?? 'Failed to add AC rows'
      set({ dbError: msg })
      throw new Error(msg)
    }
    if (project.id === projectId) {
      set({ ac: [...ac, ...(res.data ?? [])], dbError: null })
    }
  },

  updateAcRow: async (id, updates) => {
    const { ac } = get()
    if (!api) return
    const res = await api.updateAc(id, updates)
    if (res.status === 'error') {
      const msg = res.message ?? 'Update failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    set({
      ac: ac.map(r => (r.id === id ? { ...r, ...res.data } : r)),
      dbError: null,
    })
  },

  removeAcRow: async id => {
    const { ac } = get()
    if (!api) return
    const res = await api.deleteAc(id)
    if (res.status === 'error') {
      const msg = res.message ?? 'Delete failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const filtered = ac.filter(r => r.id !== id)
    const renumbered = filtered.map((r, i) => ({ ...r, no: i + 1 }))
    set({ ac: renumbered, dbError: null })
  },

  setMaster: async master => {
    const { project } = get()
    if (!project.id || !api) return
    const res = await api.updateMaster(project.id, master)
    if (res.status === 'error') {
      const msg = res.message ?? 'Update failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    set(state => ({ master: { ...state.master, ...res.data }, dbError: null }))
  },

  updateProject: async updates => {
    const { project } = get()
    if (!project.id || !api) return
    const res = await api.updateProject(project.id, updates)
    if (res.status === 'error') {
      const msg = res.message ?? 'Update failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    set({ project: res.data as EVMProject, dbError: null })
  },

  replaceWbsDayUnitsForRow: async (wbsId, entries) => {
    const { project, wbsDayUnits } = get()
    if (!project.id || !api) return
    const res = await api.replaceWbsDayUnitsForWbs(project.id, wbsId, entries)
    if (res.status === 'error') {
      const msg = res.message ?? 'Update failed'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const filtered = (wbsDayUnits ?? []).filter(u => u.wbsId !== wbsId)
    const add = entries.filter(e => e.unit > 0 && Number.isFinite(e.unit)).map(e => ({ wbsId, workDate: e.workDate, unit: e.unit }))
    set({ wbsDayUnits: [...filtered, ...add], dbError: null })
  },

  createNewProject: async () => {
    if (!api) return
    const res = await api.createProject({
      projectName: 'New Project',
      startDate: format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      endDate: format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      reportDate: format(new Date(), 'yyyy-MM-dd'),
    })
    if (res.status === 'error') {
      const msg = res.message ?? 'Failed to create project'
      set({ dbError: msg })
      throw new Error(msg)
    }
    const proj = res.data
    set({
      project: proj,
      wbsMaster: [],
      wbs: [],
      ac: [],
      master: createDefaultMaster(proj.id),
      wbsDayUnits: [],
      dbError: null,
    })
  },

  reset: () => set(getDefaultData()),
}))
