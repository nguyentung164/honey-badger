import path from 'node:path'
import { spawn } from 'node:child_process'
import type { WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { sendMail } from 'main/notification/sendMail'
import { sendTeams } from 'main/notification/sendTeams'
import type { CommitInfo } from 'main/types/types'
import { getManyFromQueue as getFromQueueMySQLByHashes } from '../task/mysqlGitCommitQueue'
import { getFromQueue, removeManyFromQueue } from '../store/CommitNotificationQueue'
import configurationStore from '../store/ConfigurationStore'
import { updateGitCommitStatus } from '../windows/overlayStateManager'
import { checkForUpdates } from './check-updates'
import { formatGitError, getGitInstance } from './utils'

/** Giới hạn gửi mail/Teams cho commit không có trong queue (MySQL/memory) — tránh spam khi push lịch sử lớn / commit ngoài app. */
const MAX_NOTIFICATIONS_BUILT_FROM_GIT_PER_PUSH = 25

interface GitPushPullResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
  /** Commit hashes đã push - renderer xóa khỏi IndexedDB */
  pushedHashes?: string[]
}

/** Lấy danh sách commit hashes sẽ được push (chưa có trên remote). Không dùng full rev-list cả branch khi chưa có origin/<branch> — tránh gửi hàng trăm mail. */
async function getPushedCommitHashes(git: Awaited<ReturnType<typeof getGitInstance>>, remote: string, branchName: string): Promise<string[]> {
  if (!git) return []
  const trackingRef = `${remote}/${branchName}`
  const refToPush = branchName
  const parseList = (out: string) => [...new Set(out.trim().split('\n').filter(Boolean))]

  try {
    const output = await git.raw(['rev-list', '--reverse', `${trackingRef}..${refToPush}`])
    return parseList(output)
  } catch {
    // Nhánh mới: origin/<branch> chưa tồn tại — so với default branch trên remote thay vì lấy cả history branch.
    const bases = ['main', 'master', 'develop', 'dev']
    for (const base of bases) {
      try {
        const output = await git.raw(['rev-list', '--reverse', `${remote}/${base}..${refToPush}`])
        const list = parseList(output)
        if (list.length > 0) {
          return list
        }
      } catch {
        /* thử base tiếp */
      }
    }
    l.warn(
      `getPushedCommitHashes: no remote base for ${trackingRef}; only notifying HEAD (avoid full-branch rev-list mail spam)`
    )
    try {
      const head = (await git.revparse(['HEAD'])).trim()
      return head ? [head] : []
    } catch {
      return []
    }
  }
}

/** Build CommitInfo từ commit hash (khi không có trong queue, ví dụ app restart trước khi push) */
async function buildCommitInfoFromHash(
  git: Awaited<ReturnType<typeof getGitInstance>>,
  commitHash: string,
  branchName?: string,
  cwd?: string
): Promise<CommitInfo | null> {
  if (!git) return null
  try {
    const [logOutput, nameStatusOutput, shortStatOutput] = await Promise.all([
      git.raw(['log', '-1', '--format=%an|||%aI|||%B', commitHash]),
      git.raw(['show', '--name-status', '--format=', commitHash]),
      git.raw(['show', '--shortstat', '--format=', commitHash]).catch(() => ''),
    ])
    const [author, dateIso, ...messageParts] = logOutput.split('|||')
    const commitMessage = messageParts.join('|||').trim()
    const commitTime = dateIso ? new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date(dateIso)).replaceAll('-', '/') : ''

    const addedFiles: string[] = []
    const modifiedFiles: string[] = []
    const deletedFiles: string[] = []
    for (const line of nameStatusOutput.split('\n').filter(Boolean)) {
      const parts = line
        .split('\t')
        .map(s => s.trim())
        .filter(Boolean)
      if (parts.length >= 2) {
        const status = parts[0][0]
        const file = parts[parts.length - 1]
        if (status === 'A' || status === 'C') addedFiles.push(file)
        else if (status === 'D') deletedFiles.push(file)
        else if (status === 'M' || status === 'R') modifiedFiles.push(file)
      }
    }

    let insertions: number | undefined
    let deletions: number | undefined
    let changes: number | undefined
    const statMatch = shortStatOutput.match(/(\d+)\s+files? changed(?:,\s*(\d+)\s+insertions?\(\+\))?(?:,\s*(\d+)\s+deletions?\(-\))?/)
    if (statMatch) {
      changes = parseInt(statMatch[1], 10)
      if (statMatch[2]) insertions = parseInt(statMatch[2], 10)
      if (statMatch[3]) deletions = parseInt(statMatch[3], 10)
    }

    const sourceFolder = cwd ?? configurationStore.store.sourceFolder

    return {
      commitUser: author?.trim() ?? '',
      commitTime,
      commitMessage,
      addedFiles,
      modifiedFiles,
      deletedFiles,
      hasCheckCodingRule: false,
      hasCheckSpotbugs: false,
      commitHash,
      branchName: branchName ?? undefined,
      insertions,
      deletions,
      changes,
      projectName: sourceFolder ? path.basename(sourceFolder) : undefined,
      vcsType: 'git',
      sourceFolderPath: sourceFolder ?? undefined,
    }
  } catch {
    return null
  }
}

export async function push(
  remote: string = 'origin',
  branch?: string,
  /** CommitInfo từ renderer (legacy) - main process ưu tiên lấy từ MySQL */
  _commitQueueData?: Record<string, CommitInfo>,
  sender?: WebContents,
  cwdOverride?: string,
  force?: boolean
): Promise<GitPushPullResponse> {
  const sendChunk = (chunk: string) => {
    if (sender && chunk) sender.send(IPC.GIT.PUSH_STREAM, chunk)
  }

  try {
    const cwd = cwdOverride ?? configurationStore.store.sourceFolder
    if (!cwd) {
      return { status: 'error', message: 'Source folder not configured' }
    }
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const branchToPush = branch ?? (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
    const commitHashes = await getPushedCommitHashes(git, remote, branchToPush)

    l.info(`Pushing to remote: ${remote}${branch ? `, branch: ${branch}` : ''}${force ? ' (force)' : ''}`)
    sendChunk(force ? `Force pushing to ${remote}/${branchToPush}...\n` : `Pushing to ${remote}/${branchToPush}...\n`)

    const pushResult = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const args = force ? ['push', '--force', remote, branchToPush, '--progress'] : ['push', remote, branchToPush, '--progress']
      const proc = spawn('git', args, { cwd })
      let stdout = ''
      let stderr = ''
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
      proc.on('close', code => resolve({ stdout, stderr, code }))
      proc.on('error', reject)
    })

    if (pushResult.code !== 0) {
      return {
        status: 'error',
        message: pushResult.stderr || `Git push exited with code ${pushResult.code}`,
      }
    }

    l.info('Push completed successfully')

    // Gửi mail/Teams cho các commits vừa push (Git: thay đổi mới lên remote)
    const { enableTeamsNotification } = configurationStore.store
    if (commitHashes.length > 0) {
      let commitQueueData: Record<string, CommitInfo> | undefined
      try {
        commitQueueData = await getFromQueueMySQLByHashes(commitHashes)
      } catch (e) {
        l.warn('Could not get commit queue from MySQL:', e)
      }
      const hashesWithoutQueue = commitHashes.filter(h => !(commitQueueData?.[h] ?? getFromQueue(h)))
      const allowBuildFromGit = new Set(
        hashesWithoutQueue.length <= MAX_NOTIFICATIONS_BUILT_FROM_GIT_PER_PUSH
          ? hashesWithoutQueue
          : hashesWithoutQueue.slice(-MAX_NOTIFICATIONS_BUILT_FROM_GIT_PER_PUSH)
      )
      if (hashesWithoutQueue.length > MAX_NOTIFICATIONS_BUILT_FROM_GIT_PER_PUSH) {
        l.warn(
          `push: ${hashesWithoutQueue.length} commit không có trong queue app; chỉ gửi mail/Teams cho ${MAX_NOTIFICATIONS_BUILT_FROM_GIT_PER_PUSH} commit mới nhất (và mọi commit có trong queue)`
        )
      }
      for (const hash of commitHashes) {
        const fromMysql = commitQueueData?.[hash]
        const fromMemory = getFromQueue(hash)
        let data: CommitInfo | null | undefined = fromMysql ?? fromMemory
        if (!data) {
          if (!allowBuildFromGit.has(hash)) continue
          data = await buildCommitInfoFromHash(git, hash, branchToPush, cwd)
        }
        if (data) {
          const payload: CommitInfo = { ...data, commitHash: data.commitHash ?? hash, vcsType: 'git' }
          sendMail(payload)
          if (enableTeamsNotification) sendTeams(payload)
        }
      }
      removeManyFromQueue(commitHashes)
      // Không xóa git_commit_queue trên MySQL: progressScheduler / heatmap cần bản ghi;
      // trước đây xóa sau push khiến snapshot ngày không còn commit.
    }

    return {
      status: 'success',
      message: 'Successfully pushed changes',
      data: pushResult,
      pushedHashes: commitHashes,
    }
  } catch (error) {
    l.error('Error pushing changes:', error)
    return {
      status: 'error',
      message: `Error pushing changes: ${formatGitError(error)}`,
    }
  }
}

export interface UpdatedFile {
  action: string
  path: string
}

export interface PullOptions {
  rebase?: boolean
}

export async function pull(
  remote: string = 'origin',
  branch?: string,
  options?: PullOptions,
  sender?: WebContents,
  cwdOverride?: string
): Promise<GitPushPullResponse> {
  try {
    const cwd = cwdOverride ?? configurationStore.store.sourceFolder
    if (!cwd) {
      return { status: 'error', message: 'Source folder not configured' }
    }
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const useRebase = options?.rebase === true
    l.info(`Pulling from remote: ${remote}${branch ? `, branch: ${branch}` : ''}${useRebase ? ', rebase' : ''}`)

    const oldHead = await git.revparse(['HEAD']).catch(() => null)

    const sendChunk = (chunk: string) => {
      if (sender && chunk) sender.send(IPC.GIT.PULL_STREAM, chunk)
    }

    const pullResult = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const args = useRebase ? ['pull', '--rebase', remote] : ['pull', remote]
      if (branch) args.push(branch)
      const proc = spawn('git', args, { cwd })
      let stdout = ''
      let stderr = ''
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
      proc.on('close', code => resolve({ stdout, stderr, code }))
      proc.on('error', reject)
    })

    if (pullResult.code !== 0) {
      return {
        status: 'error',
        message: pullResult.stderr || `Git pull exited with code ${pullResult.code}`,
      }
    }

    l.info('Pull completed successfully')
    updateGitCommitStatus(false)

    const newHead = await git.revparse(['HEAD']).catch(() => null)
    const headChanged = !!(oldHead && newHead && oldHead.trim() !== newHead.trim())
    const updatedFiles: UpdatedFile[] = []
    if (headChanged) {
      try {
        const diffOutput = await git.raw(['diff', '--name-status', `${oldHead.trim()}..${newHead.trim()}`])
        for (const line of diffOutput.trim().split('\n').filter(Boolean)) {
          const parts = line.split('\t')
          if (parts.length >= 2) {
            updatedFiles.push({ action: parts[0], path: parts.slice(1).join('\t') })
          }
        }
      } catch (diffErr) {
        l.warn('Could not get changed files after pull:', diffErr)
      }
    }

    return {
      status: 'success',
      message: 'Successfully pulled changes',
      data: { pullResult: pullResult.stdout, updatedFiles, headChanged },
    }
  } catch (error) {
    l.error('Error pulling changes:', error)
    return { status: 'error', message: `Error pulling changes: ${formatGitError(error)}` }
  }
}

export interface FetchOptions {
  prune?: boolean
  all?: boolean
}

export async function fetch(
  remote: string = 'origin',
  options?: FetchOptions,
  sender?: WebContents,
  cwdOverride?: string
): Promise<GitPushPullResponse> {
  const opts = options ?? {}

  try {
    const cwd = cwdOverride ?? configurationStore.store.sourceFolder
    if (!cwd) {
      return { status: 'error', message: 'Source folder not configured' }
    }
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const fetchAll = opts.all === true
    const prune = opts.prune === true
    l.info(`Fetching${fetchAll ? ' from all remotes' : ` from remote: ${remote}`}${prune ? ', prune' : ''}`)

    const sendChunk = (chunk: string) => {
      if (sender && chunk) sender.send(IPC.GIT.FETCH_STREAM, chunk)
    }

    sendChunk(fetchAll ? 'Fetching from all remotes...\n' : `Fetching from ${remote}...\n`)

    const fetchResult = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const args = fetchAll ? ['fetch', '--all', ...(prune ? ['--prune'] : [])] : ['fetch', remote, '--progress', ...(prune ? ['--prune'] : [])]
      const proc = spawn('git', args, { cwd })
      let stdout = ''
      let stderr = ''
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
      proc.on('close', code => resolve({ stdout, stderr, code }))
      proc.on('error', reject)
    })

    if (fetchResult.code !== 0) {
      sendChunk(`Fetch failed: ${fetchResult.stderr || `exit code ${fetchResult.code}`}\n`)
      return {
        status: 'error',
        message: fetchResult.stderr || `Git fetch exited with code ${fetchResult.code}`,
      }
    }

    sendChunk(`Fetch completed successfully.\n`)
    l.info('Fetch completed successfully')

    // Check for updates after successful fetch (use same cwd as fetch)
    sendChunk(`Checking for updates...\n`)
    const updateCheck = await checkForUpdates(cwd)
    sendChunk(`Update check: ${updateCheck.status}${updateCheck.data?.behind ? ` (behind=${updateCheck.data.behind})` : ''}\n`)
    l.info('Update check result:', updateCheck.status)

    return {
      status: 'success',
      message: 'Successfully fetched changes',
      data: {
        fetchResult: fetchResult.stdout,
        updateCheck: updateCheck.data,
      },
    }
  } catch (error) {
    l.error('Error fetching changes:', error)
    return {
      status: 'error',
      message: `Error fetching changes: ${formatGitError(error)}`,
    }
  }
}

export async function getRemotes(cwd?: string): Promise<GitPushPullResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching git remotes')

    // simple-git getRemotes(true) trả về RemoteWithRefs[] (mảng), không phải object.
    // Object.keys([...]) → '0','1'… khiến UI truyền sai tên remote (git pull "0").
    const remotesList = await git.getRemotes(true)
    const data: Record<string, { fetch: string; push: string }> = {}
    for (const r of Array.isArray(remotesList) ? remotesList : []) {
      if (!r?.name) continue
      data[r.name] = {
        fetch: r.refs?.fetch ?? '',
        push: r.refs?.push ?? r.refs?.fetch ?? '',
      }
    }

    l.info('Git remotes fetched successfully')

    return {
      status: 'success',
      data,
    }
  } catch (error) {
    l.error('Error fetching git remotes:', error)
    return {
      status: 'error',
      message: `Error fetching git remotes: ${formatGitError(error)}`,
    }
  }
}
