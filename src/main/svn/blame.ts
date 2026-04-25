import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { SVNResponse } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'

const execPromise = promisify(exec)

export async function blame(filePath: string): Promise<SVNResponse> {
  const { sourceFolder } = configurationStore.store
  try {
    const { stdout, stderr } = await execPromise(`svn blame "${filePath}"`, { cwd: sourceFolder })
    if (stderr) return { status: 'error', message: stderr }
    return { status: 'success', data: stdout.trim() }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
