import { spawn } from 'node:child_process'
import type { WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { updateRevisionStatus } from 'main/windows/overlayStateManager'
import configurationStore from '../store/ConfigurationStore'
import type { SVNResponse } from '../types/types'

/** SVN update output: U=Updated, A=Added, D=Deleted, G=Merged, C=Conflicted, E=Existed */
const SVN_UPDATE_STATUS_CODES = ['U', 'A', 'D', 'G', 'C', 'E'] as const

export interface UpdatedFile {
  action: string
  path: string
}

function parseSvnUpdateOutput(stdout: string): UpdatedFile[] {
  const files: UpdatedFile[] = []
  const lines = stdout.trim().split('\n').filter(Boolean)
  for (const line of lines) {
    // Skip summary lines
    if (/^(At|Updated to) revision \d+\.?$/i.test(line.trim())) continue
    if (/^Updating\s+/.test(line.trim())) continue
    // SVN uses 3 cols: file status, property status, lock status. Format: "U path", "UU  path", " U  path"
    // Match: first [UAGDCE], then optional 2nd/3rd col chars (non-greedy), then spaces, then path
    const match = line.match(/^\s*([UAGDCE])[\sA-Z]*?\s+(.+)$/)
    if (match) {
      const [, action, path] = match
      if (SVN_UPDATE_STATUS_CODES.includes(action as (typeof SVN_UPDATE_STATUS_CODES)[number])) {
        files.push({ action, path: path.trim() })
      }
    }
  }
  return files
}

export async function update(filePath: string | string[] = '.', revision?: string, sender?: WebContents): Promise<SVNResponse> {
  return new Promise(resolve => {
    try {
      const { sourceFolder } = configurationStore.store
      const args: string[] = ['update']
      if (revision) args.push('-r', revision)
      if (Array.isArray(filePath)) {
        const paths = filePath.filter(p => p !== '.')
        if (paths.length) args.push(...paths)
        else args.push('.')
      } else {
        args.push(filePath === '.' ? '.' : filePath)
      }

      l.info(`Updating SVN: svn ${args.join(' ')}, cwd: ${sourceFolder}`)

      const proc = spawn('svn', args, { cwd: sourceFolder })
      let stdout = ''
      let stderr = ''

      const sendChunk = (chunk: string) => {
        if (sender && chunk) {
          sender.send(IPC.SVN.UPDATE_STREAM, chunk)
        }
      }

      proc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString()
        stdout += str
        sendChunk(str)
      })
      proc.stderr?.on('data', (data: Buffer) => {
        const str = data.toString()
        stderr += str
        sendChunk(str)
      })

      proc.on('close', code => {
        updateRevisionStatus(false)
        const fileCount = Array.isArray(filePath) ? filePath.length : 1
        const revisionInfo = revision ? ` to revision ${revision}` : ''
        const message = fileCount > 1 ? `Successfully updated ${fileCount} files${revisionInfo}` : `Update completed successfully${revisionInfo}`

        if (code !== 0) {
          resolve({ status: 'error', message: stderr || `Process exited with code ${code}` })
          return
        }
        if (stderr?.trim() && !stdout?.trim()) {
          resolve({ status: 'error', message: stderr })
          return
        }

        // SVN on Windows may write file list to stderr - parse both
        const combinedOutput = [stdout, stderr].filter(Boolean).join('\n')
        const updatedFiles = parseSvnUpdateOutput(combinedOutput)
        resolve({
          status: 'success',
          data: { rawOutput: combinedOutput.trim(), updatedFiles },
          message,
        })
      })

      proc.on('error', err => {
        resolve({ status: 'error', message: err.message })
      })
    } catch (error) {
      resolve({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  })
}
