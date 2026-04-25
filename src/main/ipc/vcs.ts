import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getGitConfig, listGitCredentials, removeGitCredential, setGitConfig } from '../vcs/gitUsers'
import { listSvnUsers, removeSvnCredential } from '../vcs/svnUsers'

export function registerVcsIpcHandlers() {
  l.info('Registering VCS IPC Handlers...')

  ipcMain.handle(IPC.VCS.SVN_LIST_USERS, async () => listSvnUsers())
  ipcMain.handle(IPC.VCS.SVN_REMOVE_CREDENTIAL, async (_event, realm: string) => removeSvnCredential(realm))

  ipcMain.handle(IPC.VCS.GIT_GET_CONFIG, async (_event, cwd?: string) => getGitConfig(cwd))
  ipcMain.handle(IPC.VCS.GIT_SET_CONFIG, async (_event, userName: string, userEmail: string, scope: 'global' | 'local', cwd?: string) =>
    setGitConfig(userName, userEmail, scope, cwd)
  )
  ipcMain.handle(IPC.VCS.GIT_LIST_CREDENTIALS, async () => listGitCredentials())
  ipcMain.handle(IPC.VCS.GIT_REMOVE_CREDENTIAL, async (_event, params: { host: string; username?: string; source: string; targetName?: string }) => removeGitCredential(params))

  l.info('VCS IPC Handlers registered')
}
