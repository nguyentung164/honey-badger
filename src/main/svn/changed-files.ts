import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'

const execFileAsync = promisify(execFile)

function listAllFilesRecursive(dirPath: string): string[] {
  const result: string[] = []

  function walk(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        result.push(fullPath)
        walk(fullPath)
      } else {
        result.push(fullPath)
      }
    }
  }

  if (fs.existsSync(dirPath)) walk(dirPath)
  return result
}

function isConflictBackupFile(p: string): boolean {
  return p.endsWith('.working') || p.endsWith('.mine') || /\.merge-left(\.r\d+)?$/.test(p) || /\.merge-right(\.r\d+)?$/.test(p) || /\.r\d+$/.test(p)
}

async function batchCheckKind(svnExecutable: string, sourceFolder: string, relativePaths: string[]): Promise<Map<string, 'file' | 'dir'>> {
  if (relativePaths.length === 0) return new Map()
  const BATCH_SIZE = 50
  const map = new Map<string, 'file' | 'dir'>()
  try {
    for (let i = 0; i < relativePaths.length; i += BATCH_SIZE) {
      const batch = relativePaths.slice(i, i + BATCH_SIZE)
      const { stdout } = await execFileAsync(svnExecutable, ['info', ...batch, '--show-item', 'kind'], {
        cwd: sourceFolder,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      })
      const lines = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length >= 2) {
          const kind = parts[0] as 'file' | 'dir'
          const filePath = parts.slice(1).join(' ')
          map.set(filePath, kind)
        }
      }
    }
    return map
  } catch (error) {
    l.error('❌ batchCheckKind - SVN info error:', error)
    return new Map()
  }
}

export async function changedFiles(targetPath: string) {
  const { svnFolder, sourceFolder } = configurationStore.store
  if (!fs.existsSync(svnFolder)) {
    return { status: 'error', message: 'Invalid path to svn.exe.' }
  }
  if (!fs.existsSync(sourceFolder)) {
    return { status: 'error', message: 'Invalid source folder.' }
  }

  const svnExecutable = path.join(svnFolder, 'bin', 'svn.exe')
  const cwd = targetPath ? targetPath : sourceFolder
  const relativePathPrefix = targetPath ? path.relative(sourceFolder, targetPath) : ''

  try {
    const { stdout } = await execFileAsync(svnExecutable, ['status'], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    })

    const rawChangedFiles = stdout
      .split('\n')
      .map(line => line.trimEnd())
      .filter(line => line.trim() !== '' && !line.trimStart().startsWith('>'))

    const changedFiles: any[] = []
    const missingFiles: string[] = []

    for (const line of rawChangedFiles) {
      const status = line[0].trim()
      const propStatus = line[1]?.trim() ?? ''
      const lockStatus = line[2]?.trim() ?? ''
      const historyStatus = line[3]?.trim() ?? ''
      const switchedStatus = line[4]?.trim() ?? ''
      const lockInfo = line[5]?.trim() ?? ''
      const versionStatus = line[6]?.trim() ?? ''
      let filePath = line.substring(8).trim()

      if (filePath === '.') {
        filePath = path.relative(sourceFolder, cwd)
      } else if (relativePathPrefix) {
        filePath = path.join(relativePathPrefix, filePath)
      }

      if (line.includes('ignore-on-commit') || line.includes('Summary of conflicts:')) {
        break
      }

      if (isConflictBackupFile(filePath)) {
        continue
      }

      const absolutePath = path.join(sourceFolder, filePath)
      const exists = fs.existsSync(absolutePath)
      const stat = exists ? fs.statSync(absolutePath) : null
      const isDirectory = stat?.isDirectory() ?? false
      const fileType = path.extname(filePath).toLowerCase()

      if ((status === '?' || status === 'D') && isDirectory) {
        changedFiles.push({
          status,
          propStatus,
          lockStatus,
          historyStatus,
          switchedStatus,
          lockInfo,
          versionStatus,
          filePath,
          fileType,
          isFile: false,
        })

        const untrackedFiles = listAllFilesRecursive(absolutePath)
        for (const file of untrackedFiles) {
          const relative = path.relative(sourceFolder, file)

          if (isConflictBackupFile(relative)) {
            continue
          }

          changedFiles.push({
            status,
            propStatus: '',
            lockStatus: '',
            historyStatus: '',
            switchedStatus: '',
            lockInfo: '',
            versionStatus: '',
            filePath: relative,
            fileType: path.extname(relative).toLowerCase(),
            isFile: fs.statSync(file).isFile(),
          })
        }
      } else {
        if (status === '!') {
          missingFiles.push(filePath)
        }

        changedFiles.push({
          status,
          propStatus,
          lockStatus,
          historyStatus,
          switchedStatus,
          lockInfo,
          versionStatus,
          filePath,
          fileType,
          isFile: exists ? stat?.isFile() : null,
        })
      }
    }

    const kindMap = await batchCheckKind(svnExecutable, sourceFolder, missingFiles)
    for (const file of changedFiles) {
      if (kindMap.has(file.filePath)) {
        const kind = kindMap.get(file.filePath)
        file.isFile = kind === 'file'
      }
    }

    l.info('✅ SVN status successfully retrieved with all files and folders: ', sourceFolder)
    return { status: 'success', data: changedFiles }
  } catch (error) {
    l.error('❌ changedFiles - SVN status error:', error)
    return { status: 'error', message: error }
  }
}
