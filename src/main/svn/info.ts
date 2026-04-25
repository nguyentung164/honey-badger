import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { WebContents } from 'electron'
import { Notification } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import type { SVNResponse } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'
import { getResourcePath } from '../utils/utils'
import { updateRevisionStatus } from '../windows/overlayStateManager'

export interface SVNLastChangedInfo {
  author: string
  revision: string
  curRevision?: string
  date: string
}
const execPromise = promisify(exec)

/** Revision đã thông báo - tránh gửi thông báo trùng lặp cho cùng revision */
let lastNotifiedSvnRevision: string | null = null

/** Chạy lệnh với spawn và stream output khi có sender */
function runCommandWithStream(args: string[], cwd: string, sender?: WebContents): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('svn', args, { cwd })
    let stdout = ''
    let stderr = ''
    const sendChunk = (chunk: string) => {
      if (sender && chunk) sender.send(IPC.SVN.INFO_STREAM, chunk)
    }
    proc.stdout?.on('data', (d: Buffer) => {
      const s = d.toString()
      stdout += s
      sendChunk(s)
    })
    proc.stderr?.on('data', (d: Buffer) => {
      const s = d.toString()
      stderr += s
      sendChunk(s)
    })
    proc.on('close', code => {
      if (code !== 0) reject(new Error(stderr || `svn exited with code ${code}`))
      else resolve(stdout.trim())
    })
    proc.on('error', reject)
  })
}

/**
 * Lấy thư mục root của SVN working copy.
 * @param cwd - Thư mục làm việc (vd: từ options.cwd khi mở ShowLog từ Dashboard).
 *               Nếu không truyền, dùng sourceFolder từ config store.
 */
export async function getWorkingCopyRoot(cwd?: string): Promise<string> {
  try {
    const { sourceFolder } = configurationStore.store
    const workingDir = cwd || sourceFolder
    if (!workingDir) return ''
    const command = 'svn info --show-item wc-root'
    const { stdout, stderr } = await execPromise(command, { cwd: workingDir })
    if (stderr?.trim()) throw new Error(stderr.trim())
    return stdout.trim()
  } catch (error) {
    l.error('Lỗi khi lấy root folder:', error)
    return ''
  }
}

/** Lấy revision hiện tại của working copy (số, không có prefix r) */
export async function getCurrentRevision(cwd?: string): Promise<string | null> {
  try {
    const { sourceFolder } = configurationStore.store
    const workingDir = cwd || sourceFolder
    if (!workingDir) return null
    const { stdout } = await execPromise('svn info --show-item revision', { cwd: workingDir })
    const rev = (stdout || '').trim()
    return rev || null
  } catch {
    return null
  }
}

export async function info(filePath: string, sender?: WebContents): Promise<SVNResponse> {
  try {
    const { sourceFolder, showNotifications } = configurationStore.store
    const quotedPath = filePath

    const runInfo = async (rev?: string): Promise<string> => {
      const args = ['info']
      if (rev) args.push('-r', rev)
      args.push(quotedPath)
      if (sender) {
        return runCommandWithStream(args, sourceFolder, sender)
      }
      const command = `svn info ${rev ? `-r ${rev}` : ''} "${quotedPath}"`
      const { stdout, stderr } = await execPromise(command, { cwd: sourceFolder })
      if (stderr?.trim()) throw new Error(stderr.trim())
      return stdout.trim()
    }

    if (filePath !== '.') {
      const infoOutput = await runInfo(undefined)
      return { status: 'success', data: infoOutput }
    }

    if (sender) sender.send(IPC.SVN.INFO_STREAM, 'Checking SVN info (HEAD, BASE)...\n')
    const [headRaw, baseRaw] = await Promise.all([runInfo('HEAD'), runInfo('BASE')])
    const head = parseLastChangedInfo(headRaw)
    const base = parseLastChangedInfo(baseRaw)
    const commit = await getCommitInfo(sender)
    if (commit.status === 'error') {
      return { status: 'error', message: commit.message }
    }
    const data = {
      ...head,
      changedFiles: commit.changedFiles,
      commitMessage: commit.commitMessage,
      curRevision: base.revision,
    }
    if (head.revision !== base.revision) {
      try {
        updateRevisionStatus(true)
        // Chỉ thông báo khi revision mới chưa từng thông báo (tránh spam)
        const shouldNotify = showNotifications && head.revision !== lastNotifiedSvnRevision
        if (shouldNotify && Notification.isSupported()) {
          lastNotifiedSvnRevision = head.revision
          const icon = getResourcePath('icon.ico')
          const formattedDate = formatDate(head.date || '')
          const bodyLines = [`Revision: ${head.revision} (current: ${base.revision})`, `Author: ${head.author || 'Unknown'}`, `Date: ${formattedDate || 'Invalid date'}`]
          new Notification({
            title: 'SVN Update Available',
            body: bodyLines.join('\n'),
            icon: icon,
          }).show()
        }
      } catch (notificationError) {
        l.error('Failed to process SVN update notification:', notificationError)
      }
      return { status: 'success', data }
    }
    updateRevisionStatus(false)
    lastNotifiedSvnRevision = null // Reset khi đã sync (head === base)
    return { status: 'no-change', data }
  } catch (error) {
    updateRevisionStatus(false)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function getCommitInfo(sender?: WebContents): Promise<any> {
  try {
    const { sourceFolder } = configurationStore.store
    if (sender) sender.send(IPC.SVN.INFO_STREAM, 'Checking SVN log...\n')
    const args = ['log', '-r', 'HEAD:1', '-l', '1', '-v']
    let stdout: string
    if (sender) {
      stdout = await runCommandWithStream(args, sourceFolder, sender)
    } else {
      const command = 'svn log -r HEAD:1 -l 1 -v'
      const result = await execPromise(command, { cwd: sourceFolder })
      if (result.stderr?.trim()) {
        return { status: 'error', message: `SVN stderr: ${result.stderr.trim()}` }
      }
      stdout = result.stdout.trim()
    }
    const commitInfo = parseCommitInfo(stdout)
    return commitInfo
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function parseCommitInfo(info: string) {
  let sourceFolderPrefix = ''
  let workingCopyRootFolder = ''

  const { sourceFolder } = configurationStore.store
  const rootFolder = await getWorkingCopyRoot(sourceFolder)

  if (rootFolder && sourceFolder) {
    workingCopyRootFolder = rootFolder.replace(/\\/g, '/').replace(/\/$/, '')
    const normalizedSource = sourceFolder.replace(/\\/g, '/').replace(/\/$/, '')
    if (normalizedSource.length > workingCopyRootFolder.length && normalizedSource.startsWith(workingCopyRootFolder)) {
      sourceFolderPrefix = normalizedSource.substring(workingCopyRootFolder.length)
      if (sourceFolderPrefix.startsWith('/')) {
        sourceFolderPrefix = sourceFolderPrefix.substring(1)
      }
    }
  }

  const lines = info.split('\n')
  const changedFiles: { status: string; path: string }[] = []
  const commitMessageLines: string[] = []
  let changedPathsIndex = -1
  let emptyLineAfterChangedPathsIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Changed paths:')) {
      changedPathsIndex = i
    }
    if (changedPathsIndex !== -1 && i > changedPathsIndex && lines[i].trim() === '') {
      emptyLineAfterChangedPathsIndex = i
      break
    }
  }
  if (changedPathsIndex !== -1) {
    for (let i = changedPathsIndex + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') break
      const fileMatch = lines[i].match(/([AMDRCI?!~X])\s+(.+)/)
      if (fileMatch) {
        let filePath = fileMatch[2].trim()
        try {
          const normalizedRoot = workingCopyRootFolder.replace(/\\/g, '/').replace(/\/$/, '')
          const normalizedSource = configurationStore.store.sourceFolder.replace(/\\/g, '/').replace(/\/$/, '')
          const fullPrefix = normalizedSource.substring(normalizedRoot.length).replace(/^\/+/, '')

          const prefixPattern = new RegExp(`^/?${fullPrefix}/?`)
          filePath = filePath.replace(prefixPattern, '')
        } catch (error) {
          l.error('Lỗi khi xử lý đường dẫn:', error)
        }
        changedFiles.push({
          status: fileMatch[1],
          path: filePath,
        })
      }
    }
  }

  if (emptyLineAfterChangedPathsIndex !== -1) {
    for (let i = emptyLineAfterChangedPathsIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('---') || lines[i].startsWith('r')) {
        break
      }
      commitMessageLines.push(lines[i])
    }
  }

  if (commitMessageLines.length === 0) {
    let messageStarted = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (
        line.startsWith('r') ||
        line.startsWith('---') ||
        line.startsWith('Changed paths:') ||
        (changedPathsIndex !== -1 && i > changedPathsIndex && i <= emptyLineAfterChangedPathsIndex)
      ) {
        continue
      }
      if (line.trim() !== '' || messageStarted) {
        messageStarted = true
        commitMessageLines.push(line)
      }
    }
  }

  return {
    changedFiles,
    commitMessage: commitMessageLines.join('\n'),
  }
}

function parseLastChangedInfo(info: string): SVNLastChangedInfo {
  const lines = info.split('\n')
  let author = ''
  let revision = ''
  let date = ''
  for (const line of lines) {
    if (line.startsWith('Last Changed Author:')) {
      author = line.replace('Last Changed Author:', '').trim()
    } else if (line.startsWith('Last Changed Rev:')) {
      revision = line.replace('Last Changed Rev:', '').trim()
    } else if (line.startsWith('Last Changed Date:')) {
      date = line.replace('Last Changed Date:', '').trim()
    }
  }
  return { author, revision, date }
}
