import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import l from 'electron-log'
import { isText } from 'main/utils/istextorbinary'
import configurationStore from '../store/ConfigurationStore'

const execFileAsync = promisify(execFile)

export interface SvnConflictFile {
  path: string
  isRevisionConflict?: boolean
  isBinary?: boolean
}

export interface SvnConflictStatusResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    hasConflict: boolean
    conflictedFiles: SvnConflictFile[]
  }
}

function checkConflictBackupFiles(
  dir: string,
  baseName: string
): {
  hasWorking: boolean
  hasMergeLeft: boolean
  hasMergeRight: boolean
  hasMine: boolean
  hasRFile: boolean
} {
  if (!fs.existsSync(dir)) {
    return { hasWorking: false, hasMergeLeft: false, hasMergeRight: false, hasMine: false, hasRFile: false }
  }
  const allFiles = fs.readdirSync(dir)
  const workingPath = path.join(dir, `${baseName}.working`)
  const minePath = path.join(dir, `${baseName}.mine`)
  const hasWorking = fs.existsSync(workingPath)
  const hasMine = fs.existsSync(minePath)
  const hasMergeLeft = allFiles.some(f => f.startsWith(`${baseName}.merge-left`))
  const hasMergeRight = allFiles.some(f => f.startsWith(`${baseName}.merge-right`))
  const hasRFile = allFiles.some(f => {
    const match = f.match(new RegExp(`^${escapeRegex(baseName)}\\.r(\\d+)$`))
    return !!match
  })
  return { hasWorking, hasMergeLeft, hasMergeRight, hasMine, hasRFile }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function getSvnConflictStatus(sourceFolder?: string): Promise<SvnConflictStatusResponse> {
  try {
    const { svnFolder, sourceFolder: configSourceFolder } = configurationStore.store
    const cwd = sourceFolder || configSourceFolder
    if (!cwd) {
      return { status: 'success', data: { hasConflict: false, conflictedFiles: [] } }
    }
    if (!fs.existsSync(svnFolder)) {
      return { status: 'success', data: { hasConflict: false, conflictedFiles: [] } }
    }

    const svnExecutable = path.join(svnFolder, 'bin', 'svn.exe')
    const { stdout } = await execFileAsync(svnExecutable, ['status'], { cwd, maxBuffer: 10 * 1024 * 1024 })

    const lines = stdout
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter(line => line.trim() !== '' && !line.trimStart().startsWith('>'))

    const conflictedFiles: SvnConflictFile[] = []

    for (const line of lines) {
      const status = line[0]?.trim() ?? ''
      if (status !== 'C') continue

      const filePath = line.substring(8).trim()
      if (!filePath || filePath === '.') continue
      const fullFilePath = path.join(cwd, filePath)
      const dir = path.dirname(fullFilePath)
      const baseName = path.basename(fullFilePath)

      const { hasWorking, hasMergeLeft, hasMergeRight, hasMine, hasRFile } = checkConflictBackupFiles(dir, baseName)
      const isRevisionConflict = !(hasWorking || hasMergeLeft || hasMergeRight || hasMine || hasRFile)

      const textResult = fs.existsSync(fullFilePath) ? isText(fullFilePath) : null
      const isBinary = textResult === false

      conflictedFiles.push({
        path: filePath,
        isRevisionConflict,
        isBinary,
      })
    }

    return {
      status: 'success',
      data: {
        hasConflict: conflictedFiles.length > 0,
        conflictedFiles,
      },
    }
  } catch (error) {
    l.error('getSvnConflictStatus error:', error)
    return {
      status: 'error',
      message: `Error checking SVN conflict status: ${error}`,
      data: { hasConflict: false, conflictedFiles: [] },
    }
  }
}
