import { create } from 'zustand'

type SourceFolder = {
  name: string
  path: string
}

type SourceFolderStore = {
  sourceFolderList: SourceFolder[]
  loadSourceFolderConfig: () => Promise<void>
  addSourceFolder: (sourceFolder: SourceFolder) => Promise<boolean>
  deleteSourceFolder: (name: string) => void
  updateSourceFolder: (sourceFolder: SourceFolder) => Promise<boolean>
}

export const useSourceFolderStore = create<SourceFolderStore>((set, get) => ({
  sourceFolderList: [],
  loadSourceFolderConfig: async () => {
    const data = await window.api.sourcefolder.get()
    set({ sourceFolderList: data })
  },
  addSourceFolder: async (sourceFolder: SourceFolder) => {
    const { sourceFolderList } = get()
    if (sourceFolderList.some(w => w.name === sourceFolder.name)) {
      return false
    }
    const newList = [...sourceFolderList, sourceFolder]
    await window.api.sourcefolder.set(newList)
    set({ sourceFolderList: newList })
    return true
  },
  deleteSourceFolder: async (name: string) => {
    const { sourceFolderList } = get()
    const newList = sourceFolderList.filter(w => w.name !== name)
    await window.api.sourcefolder.set(newList)
    set({ sourceFolderList: newList })
  },
  updateSourceFolder: async (sourceFolder: SourceFolder) => {
    const { sourceFolderList } = get()
    const index = sourceFolderList.findIndex(w => w.name === sourceFolder.name)
    if (index === -1) {
      return false
    }
    const newList = [...sourceFolderList]
    newList[index] = sourceFolder
    await window.api.sourcefolder.set(newList)
    set({ sourceFolderList: newList })
    return true
  },
}))
