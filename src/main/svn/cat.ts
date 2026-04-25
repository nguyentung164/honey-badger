import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import l from 'electron-log'
import type { SVNResponse } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'
import { resolvePathRelativeToBase } from '../utils/utils'

const execPromise = promisify(exec)

export async function cat(filePath: string, fileStatus: string, revision?: string, sourceFolderOverride?: string): Promise<SVNResponse> {
  const sourceFolder = sourceFolderOverride ?? configurationStore.store.sourceFolder
  try {
    const repoUrl = await getRepositoryUrl(sourceFolder)
    if (!repoUrl) {
      return { status: 'error', message: 'Không thể lấy URL của repository' }
    }
    const relativePath = resolvePathRelativeToBase(sourceFolder, filePath)
    const normalizedPath = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
    const fullUrl = `${repoUrl}/${normalizedPath}`
    l.info(`svn cat ${revision} "${fullUrl}"`)
    if (fileStatus === 'A') {
      const revisionFlag = revision ? `-r ${revision}` : ''
      const { stdout, stderr } = await execPromise(`svn cat ${revisionFlag} "${fullUrl}"`, { cwd: sourceFolder })
      if (stderr) return { status: 'error', message: stderr }
      return { status: 'success', data: stdout.trim() }
    }
    const revisionFlag = revision ? `-r ${revision}` : ''
    const { stdout, stderr } = await execPromise(`svn cat ${revisionFlag} "${fullUrl}"`, { cwd: sourceFolder })
    if (stderr) return { status: 'error', message: stderr }
    return { status: 'success', data: stdout.trim() }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

async function getRepositoryUrl(cwd?: string): Promise<string> {
  try {
    const sourceFolder = cwd ?? configurationStore.store.sourceFolder
    const command = 'svn info --show-item url'
    const { stdout, stderr } = await execPromise(command, { cwd: sourceFolder })
    if (stderr?.trim()) throw new Error(stderr.trim())
    return stdout.trim()
  } catch (error) {
    l.error('Lỗi khi lấy repository URL:', error)
    return ''
  }
}
