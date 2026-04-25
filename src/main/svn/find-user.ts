// src/main/svn/user-info.ts
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'

const execFileAsync = promisify(execFile)

export async function getRepositoryRoot() {
  try {
    const { svnFolder, sourceFolder } = configurationStore.store
    if (!fs.existsSync(svnFolder)) return null
    if (!fs.existsSync(sourceFolder)) return null
    const { stdout } = await execFileAsync(path.join(svnFolder, 'bin', 'svn.exe'), ['info', '--show-item', 'repos-root-url'], { cwd: sourceFolder, windowsHide: true })

    return stdout.trim()
  } catch (error) {
    l.error(`Error for get Repository Root: ${error}`)
    return null
  }
}

export async function getLocalUser(): Promise<[string, string][] | null> {
  try {
    const { svnFolder, sourceFolder } = configurationStore.store
    if (!fs.existsSync(svnFolder)) return null
    if (!fs.existsSync(sourceFolder)) return null
    const { stdout } = await execFileAsync(path.join(svnFolder, 'bin', 'svn.exe'), ['auth'], { cwd: sourceFolder, windowsHide: true })

    const lines = stdout.split(/\r?\n/)
    const credentials: [string, string][] = []
    let currentRealm: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('Authentication realm:')) {
        currentRealm = trimmed.split('Authentication realm:')[1].trim()
      }
      if (trimmed.startsWith('Username:') && currentRealm) {
        const username = trimmed.split('Username:')[1].trim()
        credentials.push([currentRealm, username])
      }
    }

    return credentials
  } catch (error) {
    l.error(`Error for get SVN auth: ${error}`)
    return null
  }
}

export async function findUser(): Promise<string | null> {
  const repoRoot = await getRepositoryRoot()
  if (!repoRoot) return null
  const credentials = await getLocalUser()
  if (!credentials) return null
  const repoAuthRealm = repoRoot.includes('/svn/') ? `<${repoRoot.split('/svn/')[0]}:443> Subversion` : `<${repoRoot}:443> Subversion`
  for (const [realm, username] of credentials) {
    if (realm === repoAuthRealm) {
      return username
    }
  }
  return null
}
