import { ipcMain } from 'electron'
import l from 'electron-log'
import sourceFolderStore from '../store/SourceFolderStore'

export function registerSourceFolderIpcHandlers() {
  l.info('🔄 Registering Source Folder IPC Handlers...')

  ipcMain.handle('sourcefolder:get', async () => {
    return sourceFolderStore.get('sourceFolders')
  })

  ipcMain.handle('sourcefolder:set', async (_event, sourceFolders: { name: string; path: string }[]) => {
    sourceFolderStore.set('sourceFolders', sourceFolders)
  })

  l.info('✅ Source Folder IPC Handlers Registered')
}
