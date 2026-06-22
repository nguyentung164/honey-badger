import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import l from 'electron-log'
import { DIFF_VIEWER_DATA_URL_MAX_BYTES } from 'main/constants'
import type { SVNResponse } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'
import { resolvePathRelativeToBase } from '../utils/utils'

const execPromise = promisify(exec)
const execFilePromise = promisify(execFile)

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

/** Binary-safe svn cat for image previews (avoids stdout string encoding). */
export async function catBuffer(
  filePath: string,
  _fileStatus: string,
  revision?: string,
  sourceFolderOverride?: string
): Promise<{ status: 'success'; data: Buffer } | { status: 'error'; message: string }> {
  const sourceFolder = sourceFolderOverride ?? configurationStore.store.sourceFolder
  try {
    const repoUrl = await getRepositoryUrl(sourceFolder)
    if (!repoUrl) {
      return { status: 'error', message: 'Không thể lấy URL của repository' }
    }
    const relativePath = resolvePathRelativeToBase(sourceFolder, filePath)
    const normalizedPath = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
    const fullUrl = `${repoUrl}/${normalizedPath}`
    l.info(`svn cat (buffer) ${revision ?? 'HEAD'} "${fullUrl}"`)
    const args = revision ? ['cat', '-r', revision, fullUrl] : ['cat', fullUrl]
    const { stdout, stderr } = await execFilePromise('svn', args, {
      cwd: sourceFolder,
      encoding: 'buffer',
      maxBuffer: DIFF_VIEWER_DATA_URL_MAX_BYTES + 1024,
      windowsHide: true,
    })
    const errText = Buffer.isBuffer(stderr) ? stderr.toString('utf-8').trim() : String(stderr ?? '').trim()
    if (errText) return { status: 'error', message: errText }
    const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '')
    return { status: 'success', data: buf }
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
