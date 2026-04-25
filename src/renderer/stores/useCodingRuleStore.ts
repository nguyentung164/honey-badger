import { create } from 'zustand'
import toast from '@/components/ui-elements/Toast'

export type CodingRuleItem = {
  id: string
  name: string
  content: string
  projectId: string | null
  scope: 'global' | 'project'
}

type CodingRuleStore = {
  codingRuleList: CodingRuleItem[]
  loadCodingRuleConfig: (sourceFolderPath: string) => Promise<void>
  addCodingRule: (codingRule: { name: string; content: string }, projectId?: string | null) => Promise<boolean>
  updateCodingRule: (id: string, codingRule: { name?: string; content?: string }) => Promise<boolean>
  deleteCodingRule: (id: string) => Promise<boolean>
}

export const useCodingRuleStore = create<CodingRuleStore>((set, _get) => ({
  codingRuleList: [],

  loadCodingRuleConfig: async (sourceFolderPath: string) => {
    try {
      const res = await window.api.task.codingRule.getForSelection(sourceFolderPath)
      if (res?.status === 'success' && Array.isArray(res.data)) {
        set({ codingRuleList: res.data })
        return
      }
    } catch {
      // Not logged in or error - fall back to global only
    }
    try {
      const resGlobal = await window.api.task.codingRule.getGlobalOnly()
      if (resGlobal?.status === 'success' && Array.isArray(resGlobal.data)) {
        set({ codingRuleList: resGlobal.data })
      } else {
        set({ codingRuleList: [] })
      }
    } catch {
      set({ codingRuleList: [] })
    }
  },

  addCodingRule: async (codingRule: { name: string; content: string }, projectId?: string | null): Promise<boolean> => {
    try {
      const res = await window.api.task.codingRule.create({
        name: codingRule.name,
        content: codingRule.content,
        projectId: projectId ?? null,
      })
      if (res?.status === 'success' && res.data) {
        set(state => ({ codingRuleList: [...state.codingRuleList, res.data] }))
        toast.success('Coding rule added successfully.')
        return true
      }
      toast.error(res?.message ?? 'Failed to add coding rule')
      return false
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to add coding rule')
      return false
    }
  },

  updateCodingRule: async (id: string, codingRule: { name?: string; content?: string }): Promise<boolean> => {
    try {
      const res = await window.api.task.codingRule.update(id, codingRule)
      if (res?.status === 'success' && res.data) {
        set(state => ({
          codingRuleList: state.codingRuleList.map(r => (r.id === id ? res.data : r)),
        }))
        toast.success('Coding rule updated successfully.')
        return true
      }
      toast.error(res?.message ?? 'Failed to update coding rule')
      return false
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update coding rule')
      return false
    }
  },

  deleteCodingRule: async (id: string): Promise<boolean> => {
    try {
      const res = await window.api.task.codingRule.delete(id)
      if (res?.status === 'success') {
        set(state => ({ codingRuleList: state.codingRuleList.filter(r => r.id !== id) }))
        toast.success('Coding rule deleted successfully.')
        return true
      }
      toast.error(res?.message ?? 'Failed to delete coding rule')
      return false
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete coding rule')
      return false
    }
  },
}))
