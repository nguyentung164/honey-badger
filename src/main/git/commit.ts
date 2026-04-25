import path from 'node:path'
import type { WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { findUser } from 'main/svn/find-user'
import type { CommitInfo } from 'main/types/types'
import { onCommit } from '../task/achievementService'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { addToQueue } from '../store/CommitNotificationQueue'
import configurationStore from '../store/ConfigurationStore'
import { formatGitError, getGitInstance } from './utils'

interface GitCommitResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    commit: string
    summary: {
      changes: number
      insertions: number
      deletions: number
    }
    /** CommitInfo để renderer lưu IndexedDB - gửi mail khi push (kể cả sau app restart) */
    commitInfo?: { commitHash: string } & CommitInfo
  }
}

export interface GitCommitOptions {
  hasCheckCodingRule: boolean
  hasCheckSpotbugs: boolean
  amend?: boolean
  signOff?: boolean
  scope?: 'staged' | 'all'
}

export async function commit(
  commitMessage: string,
  selectedFiles: string[] = [],
  options: GitCommitOptions,
  sender?: WebContents,
  cwd?: string
): Promise<GitCommitResponse> {
  const sendChunk = (chunk: string) => {
    if (sender && chunk) sender.send(IPC.GIT.COMMIT_STREAM, chunk)
  }

  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const { amend = false, signOff = false, scope } = options
    l.info('Starting git commit process', { amend, signOff, scope })
    l.info('Commit message:', commitMessage)
    l.info('Selected files:', selectedFiles)

    if (amend) {
      const logResult = await git.log({ maxCount: 1 })
      if (!logResult.latest) {
        return { status: 'error', message: 'Nothing to amend. No commits yet.' }
      }
    }

    let finalMessage = commitMessage.trim()
    if (signOff) {
      try {
        const name = (await git.raw(['config', 'user.name'])).trim()
        const email = (await git.raw(['config', 'user.email'])).trim()
        if (name && email) {
          finalMessage = finalMessage ? `${finalMessage}\n\nSigned-off-by: ${name} <${email}>` : `Signed-off-by: ${name} <${email}>`
        } else {
          l.warn('Sign-off requested but user.name or user.email not set; skipping Signed-off-by line')
        }
      } catch {
        l.warn('Could not read git config for sign-off; skipping Signed-off-by line')
      }
    }

    sendChunk('Checking staged changes...\n')

    const statusResult = await git.status()
    const hasStagedChanges = statusResult.files.length > 0 || statusResult.staged.length > 0
    const stagedOnly = scope === 'staged'

    if (amend) {
      if (selectedFiles.length > 0) {
        sendChunk(`Staging ${selectedFiles.length} file(s) for amend...\n`)
        await git.raw(['add', '-A', '--', ...selectedFiles])
      }
    } else if (!stagedOnly) {
      if (!hasStagedChanges) {
        const hasUnstagedChanges =
          statusResult.not_added.length > 0 || statusResult.modified.length > 0 || statusResult.deleted.length > 0
        if (!hasUnstagedChanges) {
          return { status: 'error', message: 'No changes to commit' }
        }
        if (selectedFiles.length === 0) {
          l.info('Auto-staging all changes')
          sendChunk('Staging all changes...\n')
          await git.add('.')
        } else {
          l.info('Adding selected files to staging area')
          sendChunk(`Staging ${selectedFiles.length} file(s)...\n`)
          await git.raw(['add', '-A', '--', ...selectedFiles])
        }
      }
    } else {
      if (!hasStagedChanges) {
        return { status: 'error', message: 'No staged changes to commit. Stage files first or use commit mode "All".' }
      }
    }

    const statusBeforeCommit = await git.status()
    const addedFiles: string[] = []
    const modifiedFiles: string[] = []
    const deletedFiles: string[] = []
    for (const file of statusBeforeCommit.files || []) {
      const idx = file.index
      if (idx === 'A' || idx === 'C') {
        addedFiles.push(file.path)
      } else if (idx === 'D') {
        deletedFiles.push(file.path)
      } else if (idx === 'M' || idx === 'R') {
        modifiedFiles.push(file.path)
      }
    }

    for (const f of addedFiles) sendChunk(`A  ${f}\n`)
    for (const f of modifiedFiles) sendChunk(`M  ${f}\n`)
    for (const f of deletedFiles) sendChunk(`D  ${f}\n`)

    sendChunk('Committing changes...\n')

    let commitResult: { commit: string; branch?: string; summary: { changes: number; insertions: number; deletions: number } }
    if (amend) {
      if (finalMessage.trim()) {
        await git.raw(['commit', '--amend', '-m', finalMessage])
      } else {
        await git.raw(['commit', '--amend', '--no-edit'])
      }
      const head = await git.revparse(['HEAD'])
      const branchResult = await git.branch().catch(() => ({ current: undefined }))
      const summary = await git.raw(['show', '--shortstat', '--format=', head]).catch(() => '')
      const statMatch = summary.match(/(\d+)\s+files? changed(?:,\s*(\d+)\s+insertions?\(\+\))?(?:,\s*(\d+)\s+deletions?\(-\))?/)
      commitResult = {
        commit: head.trim(),
        branch: branchResult.current,
        summary: statMatch
          ? {
              changes: parseInt(statMatch[1], 10) || 0,
              insertions: parseInt(statMatch[2], 10) || 0,
              deletions: parseInt(statMatch[3], 10) || 0,
            }
          : { changes: 0, insertions: 0, deletions: 0 },
      }
    } else {
      commitResult = await git.commit(finalMessage)
    }

    /** Nội dung đã ghi vào Git (khác `commitMessage` tham số khi có sign-off / amend --no-edit). */
    let messageForRecord = finalMessage.trim()
    if (amend && !messageForRecord) {
      try {
        messageForRecord = ((await git.raw(['log', '-1', '--format=%B'])) || '').trim()
      } catch {
        messageForRecord = commitMessage.trim()
      }
    }
    if (!messageForRecord) messageForRecord = commitMessage.trim()

    let gitUserName = ''
    try {
      gitUserName = ((await git.raw(['config', 'user.name'])) || '').trim()
    } catch {
      // git config user.name chưa cài
    }
    const commitUser = (await findUser()) ?? gitUserName ?? ''
    const commitTime = new Intl.DateTimeFormat('sv-SE', {
      dateStyle: 'short',
      timeStyle: 'medium',
      hour12: false,
    })
      .format(new Date())
      .replaceAll('-', '/')

    const { changes, insertions, deletions } = commitResult.summary
    const sourceFolderForInfo = cwd ?? configurationStore.store.sourceFolder
    const data: CommitInfo = {
      commitUser,
      commitTime,
      commitMessage: messageForRecord,
      addedFiles,
      modifiedFiles,
      deletedFiles,
      hasCheckCodingRule: options.hasCheckCodingRule,
      hasCheckSpotbugs: options.hasCheckSpotbugs,
      commitHash: commitResult.commit,
      branchName: commitResult.branch ?? undefined,
      insertions: insertions ?? undefined,
      deletions: deletions ?? undefined,
      changes: changes ?? undefined,
      projectName: sourceFolderForInfo ? path.basename(sourceFolderForInfo) : undefined,
      vcsType: 'git',
      sourceFolderPath: sourceFolderForInfo ?? undefined,
    }

    // Git: commit chỉ lưu local, chưa lên remote. Gửi mail/Teams khi push, không gửi lúc commit.
    if (commitResult.commit) {
      addToQueue(commitResult.commit, data)
    }

    l.info('Commit successful:', commitResult.commit)

    // Stream commit result summary (một dòng subject — khớp nội dung đã commit)
    const streamSubject = messageForRecord.split(/\r?\n/).find((l) => l.trim())?.trim() ?? commitMessage.trim()
    sendChunk(`[${commitResult.branch ?? 'HEAD'} ${commitResult.commit}] ${streamSubject}\n`)
    sendChunk(`${changes || 0} file(s) changed, ${insertions || 0} insertion(s)(+), ${deletions || 0} deletion(s)(-)\n`)

    const responseData: GitCommitResponse['data'] = {
      commit: commitResult.commit,
      summary: {
        changes: changes || 0,
        insertions: insertions || 0,
        deletions: deletions || 0,
      },
    }
    if (commitResult.commit) {
      responseData.commitInfo = { commitHash: commitResult.commit, ...data } as { commitHash: string } & CommitInfo
    }

    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (session?.userId) {
      // Local: 00:00–06:59 — gồm nửa đêm và sáng sớm (night owl / sau 1h).
      const hour = new Date().getHours()
      const isAfterMidnight = hour === 0 || (hour >= 1 && hour < 7)
      onCommit(session.userId, {
        changes: changes || 0,
        insertions: insertions || 0,
        deletions: deletions || 0,
        filesChanged: changes || 0,
        isAfterMidnight,
        isAmend: amend,
      }).catch(() => {})
    }

    return {
      status: 'success',
      data: responseData,
    }
  } catch (error) {
    l.error('Error during git commit:', error)
    const errMsg = `Error during git commit: ${formatGitError(error)}`
    sendChunk(`${errMsg}\n`)
    return {
      status: 'error',
      message: errMsg,
    }
  }
}

interface GitResetCommitResponse {
  status: 'success' | 'error'
  message?: string
}

/**
 * Undo the last commit (git reset --soft HEAD~1)
 * This keeps the changes in the working directory
 */
export async function undoCommit(cwd?: string): Promise<GitResetCommitResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Undoing last commit (git reset --soft HEAD~1)')

    // Check if there are any commits to undo
    const logResult = await git.log({ maxCount: 1 })
    if (!logResult.latest) {
      return { status: 'error', message: 'No commits to undo' }
    }

    // Reset to previous commit but keep changes
    await git.reset(['--soft', 'HEAD~1'])

    l.info('Successfully undone last commit')

    return {
      status: 'success',
      message: 'Đã hoàn tác commit cuối cùng',
    }
  } catch (error) {
    l.error('Error undoing commit:', error)
    return {
      status: 'error',
      message: `Error undoing commit: ${formatGitError(error)}`,
    }
  }
}
