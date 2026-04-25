import { exec, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { sendMail } from 'main/notification/sendMail'
import { sendTeams } from 'main/notification/sendTeams'
import { listAllFilesRecursive } from 'main/utils/utils'
import configurationStore from '../store/ConfigurationStore'
import { findUser } from './find-user'

function isSVNDirectory(path: string) {
  const { sourceFolder } = configurationStore.store
  return new Promise(resolve => {
    exec(`svn info "${path}"`, { cwd: sourceFolder }, (err, stdout) => {
      if (err) return resolve(false)
      const kindLine = stdout.split('\n').find(line => line.startsWith('Node Kind:'))
      resolve(kindLine?.includes('directory'))
    })
  })
}

enum SVNStatus {
  ADDED = '?',
  DELETED = '!',
  MODIFIED = 'M',
}

interface SVNResponse {
  status: 'success' | 'error'
  message: string
}

export async function commit(
  commitMessage: string,
  selectedFiles: { filePath: string; status: SVNStatus }[],
  options: { hasCheckCodingRule: boolean; hasCheckSpotbugs: boolean },
  sender?: WebContents
): Promise<SVNResponse> {
  const sendChunk = (chunk: string) => {
    if (sender && chunk) sender.send(IPC.SVN.COMMIT_STREAM, chunk)
  }

  const deletedFiles = selectedFiles.filter(file => file.status === SVNStatus.DELETED).map(file => file.filePath)
  const addedFiles = selectedFiles.filter(file => file.status === SVNStatus.ADDED).map(file => file.filePath)
  const modifiedFiles = selectedFiles.filter(file => ![SVNStatus.ADDED, SVNStatus.DELETED].includes(file.status)).map(file => file.filePath)

  let addedFilePaths: string[] = []
  let deletedFilePaths: string[] = []
  const unsortedPaths: string[] = []
  const { sourceFolder } = configurationStore.store

  for (const filePath of deletedFiles) {
    const absolutePath = path.join(sourceFolder, filePath)
    const isDir = await isSVNDirectory(filePath)

    if (isDir) {
      const allPaths = listAllFilesRecursive(absolutePath)
      unsortedPaths.push(...allPaths)
      unsortedPaths.push(filePath)
    } else {
      unsortedPaths.push(filePath)
    }
  }

  const finalDeletedPaths = unsortedPaths.sort((a, b) => {
    const depthA = a.split(/[\\/]/).length
    const depthB = b.split(/[\\/]/).length
    return depthB - depthA || a.localeCompare(b)
  })

  const targetFiles = getMinimalParentFolders(finalDeletedPaths)
  if (finalDeletedPaths.length > 0) {
    l.info('▶️ Deleting files...', targetFiles)
    sendChunk(`Deleting ${targetFiles.length} file(s)...\n`)
    const deleteResult = await runSVNCommand('delete', targetFiles, undefined, false, sendChunk)
    if (deleteResult.status === 'error') {
      l.error('🛑 Deletion failed:', deleteResult.message)
      return { status: 'error', message: `${deleteResult.message}` }
    }
    l.info('🗑️ Deleted missing files:', deleteResult.message)
    deletedFilePaths = extractFilePaths(deleteResult.message)
  }

  if (addedFiles.length > 0) {
    l.info('▶️ Adding files...')
    sendChunk(`Adding ${addedFiles.length} file(s)...\n`)
    const addResult = await runSVNCommand('add', addedFiles, undefined, false, sendChunk)
    if (addResult.status === 'error') {
      l.error('🛑 Add files failed:', addResult.message)
      return { status: 'error', message: `${addResult.message}` }
    }
    l.info('▶️ Added unversioned files:', addResult.message)
    addedFilePaths = extractFilePaths(addResult.message)
  }

  const allFiles = [...modifiedFiles, ...addedFiles, ...targetFiles]
  if (allFiles.length > 0) {
    try {
      const os = require('node:os')
      const tempFile = path.join(os.tmpdir(), `svn-commit-message-${Date.now()}.txt`)
      fs.writeFileSync(tempFile, commitMessage, { encoding: 'utf8' })

      sendChunk(`Committing ${allFiles.length} file(s)...\n`)

      let commitResult: SVNResponse
      try {
        commitResult = await runSVNCommand('commit', allFiles, tempFile, true, sendChunk)
      } finally {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile)
          }
        } catch (err) {
          l.warn('⚠️ Không thể xóa file tạm thời:', err)
        }
      }

      if (commitResult.status === 'error') {
        l.error('🛑 Commit failed:', commitResult.message)
        return { status: 'error', message: `${commitResult.message}` }
      }
      l.info('✅ Commit successful:', commitResult.message)

      const commitUser = (await findUser()) ?? ''
      const commitTime = new Intl.DateTimeFormat('sv-SE', {
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: false,
      })
        .format(new Date())
        .replaceAll('-', '/')

      const revisionMatch = commitResult.message.match(/Committed revision (\d+)\./i)
      const revision = revisionMatch ? revisionMatch[1] : undefined

      const data = {
        commitUser,
        commitTime,
        commitMessage,
        addedFiles: addedFilePaths,
        modifiedFiles,
        deletedFiles: deletedFilePaths,
        hasCheckCodingRule: options.hasCheckCodingRule,
        hasCheckSpotbugs: options.hasCheckSpotbugs,
        revision,
        projectName: sourceFolder ? path.basename(sourceFolder) : undefined,
        vcsType: 'svn' as const,
      }

      const { enableTeamsNotification } = configurationStore.store

      sendMail(data)
      if (enableTeamsNotification) {
        sendTeams(data)
      }
      return { status: 'success', message: `${commitResult.message}` }
    } catch (error: any) {
      return { status: 'error', message: `${error?.message ?? error}` }
    }
  } else {
    l.info('✅ No changes to commit.')
    return { status: 'success', message: 'No changes to commit.' }
  }
}

async function runSVNCommand(command: string, selectedFiles: string[], commitMessage?: string, isMessageFile = false, sendChunk?: (chunk: string) => void): Promise<SVNResponse> {
  const batchSize = 100
  const { svnFolder, sourceFolder } = configurationStore.store
  if (!fs.existsSync(svnFolder)) {
    return Promise.reject({ status: 'error', message: 'Invalid path to svn.exe.' })
  }
  if (!fs.existsSync(sourceFolder)) {
    return Promise.reject({ status: 'error', message: 'Invalid source folder.' })
  }
  const runBatch = (args: string[], useTargetsFile = false): Promise<SVNResponse> => {
    return new Promise((batchResolve, batchReject) => {
      const svnExePath = path.join(svnFolder, 'bin', 'svn.exe')

      let modifiedArgs: string[] = []
      let targetsFile: string | null = null

      if (useTargetsFile && args.length > 0) {
        const os = require('node:os')
        targetsFile = path.join(os.tmpdir(), `svn-targets-${Date.now()}.txt`)
        const targetPaths = args
          .map(arg => {
            if (arg === '.') {
              return ''
            }
            return path.join(sourceFolder, arg)
          })
          .filter(Boolean)
        fs.writeFileSync(targetsFile, targetPaths.join('\n'), { encoding: 'utf8' })
        modifiedArgs = ['--targets', targetsFile]
      } else {
        for (const arg of args) {
          if (arg === '.') continue
          const fullPath = path.join(sourceFolder, arg)
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            if (command === 'add') {
              modifiedArgs.push('--depth=empty', arg)
              continue
            }
            if (command === 'delete') {
              modifiedArgs.push(arg, '--force')
              continue
            }
          }
          modifiedArgs.push(arg)
        }
      }

      if (commitMessage && command !== 'add' && command !== 'delete') {
        if (isMessageFile) {
          modifiedArgs.unshift('-F', commitMessage)
        } else {
          modifiedArgs.unshift('-m', commitMessage)
        }
      }

      const spawnArgs = [command, ...modifiedArgs]
      l.info(`✏️ Command ${command}: ${svnExePath} ${spawnArgs.join(' ')}`)

      const proc = spawn(svnExePath, spawnArgs, { cwd: sourceFolder })
      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString()
        stdout += str
        if (sendChunk) sendChunk(str)
      })
      proc.stderr?.on('data', (data: Buffer) => {
        const str = data.toString()
        stderr += str
        if (sendChunk) sendChunk(str)
      })

      proc.on('close', code => {
        if (targetsFile) {
          try {
            if (fs.existsSync(targetsFile)) {
              fs.unlinkSync(targetsFile)
            }
          } catch (err) {
            l.warn('⚠️ Could not delete temporary targets file:', err)
          }
        }

        if (code !== 0) {
          l.error(`🛑 Error: ${stderr}`)
          batchReject({ status: 'error', message: stderr || `Process exited with code ${code}` })
        } else {
          l.info(`✅ ${stdout}`)
          batchResolve({ status: 'success', message: stdout })
        }
      })

      proc.on('error', err => {
        if (targetsFile) {
          try {
            if (fs.existsSync(targetsFile)) fs.unlinkSync(targetsFile)
          } catch {
            /* ignore */
          }
        }
        batchReject({ status: 'error', message: err.message })
      })
    })
  }

  if (!selectedFiles || selectedFiles.length === 0) {
    return runBatch([])
  }

  // For commit command with many files, use targets file to avoid command line length limits
  if (command === 'commit' && selectedFiles.length > 50) {
    return runBatch(selectedFiles, true)
  }

  const batchedFiles = chunkArray(selectedFiles, batchSize)
  const pattern = /^[AD]\s+(?:\(bin\)\s+)?([^\r\n]+)/gm
  const filePaths: string[] = []

  for (const batch of batchedFiles) {
    try {
      const result = await runBatch(batch)
      let match: RegExpExecArray | null = pattern.exec(result.message)
      while (match !== null) {
        filePaths.push(match[1].replace(/\\\\/g, '\\'))
        match = pattern.exec(result.message)
      }
    } catch (error) {
      return error as SVNResponse
    }
  }

  l.info('Batch processed successfully:', filePaths)
  return { status: 'success', message: filePaths.toString() }
}

function extractFilePaths(message: string): string[] {
  return message.split(',').map(p => p.trim())
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize))
  }
  return result
}

function getMinimalParentFolders(filePaths: string[]): string[] {
  if (filePaths.length === 1) {
    return [...filePaths]
  }
  return [...new Set(filePaths)]
}
