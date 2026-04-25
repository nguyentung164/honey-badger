import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { SVNResponse } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'

const execPromise = promisify(exec)

export async function revert(filePath: string | string[]): Promise<SVNResponse> {
  const { sourceFolder } = configurationStore.store
  try {
    let filePathsStr = ''
    if (Array.isArray(filePath)) {
      filePathsStr = filePath.map(path => `"${path}"`).join(' ')
    } else {
      filePathsStr = `"${filePath}"`
    }
    const { stdout, stderr } = await execPromise(`svn revert ${filePathsStr}`, { cwd: sourceFolder })
    if (stderr) return { status: 'error', message: stderr }
    const fileCount = Array.isArray(filePath) ? filePath.length : 1
    const message = fileCount > 1 ? `Successfully reverted ${fileCount} files` : 'Revert successful'
    return {
      status: 'success',
      data: stdout.trim() || message,
      message,
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
