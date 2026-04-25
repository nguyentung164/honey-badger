import fs from 'node:fs'
import path from 'node:path'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { getLocalUser } from '../svn/find-user'
import type { SvnUser } from './types'

export async function listSvnUsers(): Promise<SvnUser[]> {
  const { svnFolder, sourceFolder } = configurationStore.store
  if (!svnFolder?.trim() || !sourceFolder?.trim()) return []
  if (!fs.existsSync(svnFolder) || !fs.existsSync(sourceFolder)) return []

  const credentials = await getLocalUser()
  if (!credentials) return []

  return credentials.map(([realm, username]) => ({ realm, username }))
}

/**
 * Remove SVN credential by realm. Reads auth files from %APPDATA%\Subversion\auth\svn.simple\,
 * finds the file containing the matching realm, and deletes it.
 * SVN auth file format: K 8\nrealm\nV N\n<value> for each key-value pair.
 */
export async function removeSvnCredential(realm: string): Promise<{ success: boolean; error?: string }> {
  try {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
    const authDir = path.join(appData, 'Subversion', 'auth', 'svn.simple')
    if (!fs.existsSync(authDir)) {
      return { success: true }
    }

    const files = fs.readdirSync(authDir)
    for (const file of files) {
      const filePath = path.join(authDir, file)
      if (!fs.statSync(filePath).isFile()) continue

      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const hasExactRealm = content === realm || content.startsWith(`${realm}\n`) || content.includes(`\n${realm}\n`) || content.endsWith(`\n${realm}`) || content.endsWith(realm)
        if (hasExactRealm) {
          fs.unlinkSync(filePath)
          l.info(`Removed SVN credential for realm: ${realm}`)
          return { success: true }
        }
      } catch (err) {
        l.warn(`Could not read SVN auth file ${file}:`, err)
      }
    }

    return { success: true }
  } catch (error) {
    l.error('Error removing SVN credential:', error)
    return { success: false, error: String(error) }
  }
}
