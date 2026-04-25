import { create } from 'zustand'
import toast from '@/components/ui-elements/Toast'

type ExternalEditor = {
  name: string
  path: string
}

type ExternalEditorStore = {
  externalEditorList: ExternalEditor[]
  loadExternalEditorConfig: () => Promise<void>
  addExternalEditor: (editor: ExternalEditor) => Promise<boolean>
  updateExternalEditor: (editor: ExternalEditor) => Promise<boolean>
  deleteExternalEditor: (name: string) => Promise<boolean>
}

export const useExternalEditorStore = create<ExternalEditorStore>((set, _get) => ({
  externalEditorList: [],

  loadExternalEditorConfig: async () => {
    const data = await window.api.externalEditor.get()
    let list = data.externalEditors || []
    const config = await window.api.configuration.get()
    const pathFromConfig = config.externalEditorPath?.trim()
    if (pathFromConfig && !list.some(e => e.path === pathFromConfig)) {
      const name = pathFromConfig.split(/[/\\]/).pop() || pathFromConfig
      list = [...list, { name, path: pathFromConfig }]
      await window.api.externalEditor.set({ externalEditors: list })
    }
    set({ externalEditorList: list })
  },

  addExternalEditor: async (editor: ExternalEditor): Promise<boolean> => {
    const data = await window.api.externalEditor.get()
    const list = data.externalEditors || []
    const isDuplicate = list.some(item => item.name === editor.name)
    if (isDuplicate) {
      toast.warning('Tên editor đã tồn tại.')
      return false
    }
    const newList = [...list, editor]
    await window.api.externalEditor.set({ externalEditors: newList })
    set({ externalEditorList: newList })
    toast.success('Đã thêm editor thành công.')
    return true
  },

  updateExternalEditor: async (editor: ExternalEditor): Promise<boolean> => {
    const data = await window.api.externalEditor.get()
    const list = data.externalEditors || []
    const index = list.findIndex(item => item.name === editor.name)
    if (index === -1) {
      toast.error('Không tìm thấy editor.')
      return false
    }
    const newList = [...list]
    newList[index] = editor
    await window.api.externalEditor.set({ externalEditors: newList })
    set({ externalEditorList: newList })
    toast.success('Đã cập nhật editor thành công.')
    return true
  },

  deleteExternalEditor: async (name: string): Promise<boolean> => {
    const data = await window.api.externalEditor.get()
    const list = data.externalEditors || []
    const newList = list.filter(item => item.name !== name)
    await window.api.externalEditor.set({ externalEditors: newList })
    set({ externalEditorList: newList })
    toast.success('Đã xóa editor thành công.')
    return true
  },
}))
