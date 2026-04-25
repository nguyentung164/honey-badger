import l from 'electron-log'
import fs from 'node:fs'
import path from 'node:path'
import configurationStore from '../store/ConfigurationStore'
import { mergeConflictedPathsForStatus } from './status'
import { formatGitError, getGitInstance } from './utils'

interface GitRevertResponse {
  status: 'success' | 'error'
  message?: string
}

export async function revert(filePath: string | string[]): Promise<GitRevertResponse> {
  try {
    const git = await getGitInstance()
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const targetPaths = Array.isArray(filePath) ? filePath : [filePath]

    l.info('Reverting files:', targetPaths)

    // Check if files have changes to revert
    const statusResult = await git.status()
    const filesToRevert = targetPaths.filter(path => {
      return statusResult.files.some(file => file.path === path) || statusResult.not_added.includes(path) || statusResult.modified.includes(path)
    })

    if (filesToRevert.length === 0) {
      return { status: 'error', message: 'No changes to revert for the specified files' }
    }

    // Revert each file
    for (const path of filesToRevert) {
      l.info(`Reverting file: ${path}`)
      await git.checkout(['--', path])
    }

    l.info('Files reverted successfully')

    return {
      status: 'success',
      message: `Successfully reverted ${filesToRevert.length} file(s)`,
    }
  } catch (error) {
    l.error('Error reverting files:', error)
    return {
      status: 'error',
      message: `Error reverting files: ${formatGitError(error)}`,
    }
  }
}

export async function resetStaged(files?: string[], cwd?: string): Promise<GitRevertResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    if (files && files.length > 0) {
      l.info('Unstaging specific files:', files)

      // Unstage specific files using git reset HEAD <file>
      await git.reset(['HEAD', '--', ...files])

      l.info('Files unstaged successfully')

      return {
        status: 'success',
        message: `Successfully unstaged ${files.length} file(s)`,
      }
    }
    l.info('Resetting all staged changes')

    await git.reset(['--mixed'])

    l.info('All staged changes reset successfully')

    return {
      status: 'success',
      message: 'Successfully reset all staged changes',
    }
  } catch (error) {
    l.error('Error resetting staged changes:', error)
    return {
      status: 'error',
      message: `Error resetting staged changes: ${formatGitError(error)}`,
    }
  }
}

export async function add(files: string[], cwd?: string): Promise<GitRevertResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Adding files to staging area:', files)
    // Dùng -A để stage cả file mới, sửa và xóa (file đã xóa cần -A trên Windows)
    await git.raw(['add', '-A', '--', ...files])

    l.info('Files added to staging area successfully')

    return {
      status: 'success',
      message: 'Files added to staging area successfully',
    }
  } catch (error) {
    l.error('Error adding files to staging area:', error)
    return {
      status: 'error',
      message: `Error adding files to staging area: ${formatGitError(error)}`,
    }
  }
}

/**
 * Discard added/untracked files: unstage if staged, then delete from filesystem.
 * Safe: only deletes paths under working dir; ignores ENOENT.
 */
export async function discardFiles(filePaths: string[], cwd?: string): Promise<GitRevertResponse> {
  try {
    const workingDir = path.resolve(cwd || configurationStore.store.sourceFolder || '')
    if (!workingDir) {
      return { status: 'error', message: 'Source folder is not configured' }
    }

    const git = await getGitInstance(workingDir)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const statusResult = await git.status()
    const stagedNewPaths = new Set(
      statusResult.files.filter(f => f.index === 'A').map(f => f.path.replace(/\\/g, '/'))
    )

    let discarded = 0
    for (const relPath of filePaths) {
      const normalized = path.normalize(relPath).replace(/^\.[/\\]/, '')
      const fullPath = path.resolve(workingDir, normalized)
      if (!fullPath.startsWith(workingDir)) {
        l.warn('Discard skipped (path outside repo):', relPath)
        continue
      }

      const relPathNorm = relPath.replace(/\\/g, '/')
      if (stagedNewPaths.has(relPathNorm) || stagedNewPaths.has(normalized.replace(/\\/g, '/'))) {
        try {
          await git.reset(['HEAD', '--', relPath])
        } catch (e) {
          l.warn('Reset HEAD for discard file failed:', relPath, e)
        }
      }

      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
          discarded++
        }
      } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined
        if (code === 'ENOENT') continue
        l.error('Error deleting file:', fullPath, err)
        return {
          status: 'error',
          message: `Failed to delete file: ${formatGitError(err)}`,
        }
      }
    }

    l.info('Discard files completed, removed:', discarded)
    return {
      status: 'success',
      message: `Successfully discarded ${discarded} file(s)`,
    }
  } catch (error) {
    l.error('Error discarding files:', error)
    return {
      status: 'error',
      message: `Error discarding files: ${formatGitError(error)}`,
    }
  }
}

/**
 * Discard changes for all 4 statuses: modified, deleted → checkout; added, untracked → unstage + delete.
 */
export async function discardChanges(filePaths: string[], cwd?: string): Promise<GitRevertResponse> {
  try {
    const workingDir = path.resolve(cwd || configurationStore.store.sourceFolder || '')
    if (!workingDir) {
      return { status: 'error', message: 'Source folder is not configured' }
    }

    const git = await getGitInstance(workingDir)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const statusResult = await git.status()
    const conflictedList = await mergeConflictedPathsForStatus(git, statusResult)
    const conflictedSet = new Set(conflictedList.map(p => p.replace(/\\/g, '/')))

    const conflictTargets = filePaths.filter(p => conflictedSet.has(p.replace(/\\/g, '/')))
    const restPaths = filePaths.filter(p => !conflictedSet.has(p.replace(/\\/g, '/')))

    // File unmerged: git checkout -- path không chạy được — dùng --ours và stage (tương đương “giữ bản nhánh hiện tại”).
    for (const p of conflictTargets) {
      l.info(`Discard conflicted file (ours): ${p}`)
      await git.checkout(['--ours', '--', p])
      await git.add(p)
    }

    if (restPaths.length === 0) {
      const total = conflictTargets.length
      return {
        status: 'success',
        message:
          conflictTargets.length > 0
            ? `Resolved ${total} conflicted file(s) using current branch version (ours)`
            : `Successfully discarded changes for ${total} file(s)`,
      }
    }

    const modifiedSet = new Set((statusResult.modified || []).map(p => p.replace(/\\/g, '/')))
    const deletedSet = new Set((statusResult.deleted || []).map(p => p.replace(/\\/g, '/')))
    const notAddedSet = new Set((statusResult.not_added || []).map(p => p.replace(/\\/g, '/')))
    const stagedNewSet = new Set(
      (statusResult.files || []).filter(f => f.index === 'A').map(f => f.path.replace(/\\/g, '/'))
    )

    const toRevert: string[] = []
    const toDiscard: string[] = []

    for (const p of restPaths) {
      const norm = p.replace(/\\/g, '/')
      if (notAddedSet.has(norm) || stagedNewSet.has(norm)) {
        toDiscard.push(p)
        continue
      }
      if (modifiedSet.has(norm) || deletedSet.has(norm)) {
        toRevert.push(p)
        continue
      }
      const fileEntry = (statusResult.files || []).find(
        f => f.path === p || f.path.replace(/\\/g, '/') === norm
      )
      if (fileEntry) {
        const wd = (fileEntry.working_dir || '').trim()
        const idx = (fileEntry.index || '').trim()
        if (wd === 'M' || wd === 'D' || idx === 'M' || idx === 'D') {
          toRevert.push(p)
        } else {
          toDiscard.push(p)
        }
      } else {
        toDiscard.push(p)
      }
    }

    if (toRevert.length > 0) {
      for (const p of toRevert) {
        await git.checkout(['--', p])
      }
    }

    if (toDiscard.length > 0) {
      const res = await discardFiles(toDiscard, workingDir)
      if (res.status === 'error') return res
    }

    const total = conflictTargets.length + toRevert.length + toDiscard.length
    l.info('Discard changes completed:', { conflictOurs: conflictTargets.length, reverted: toRevert.length, discarded: toDiscard.length })
    return {
      status: 'success',
      message: `Successfully discarded changes for ${total} file(s)`,
    }
  } catch (error) {
    l.error('Error discarding changes:', error)
    return {
      status: 'error',
      message: `Error discarding changes: ${formatGitError(error)}`,
    }
  }
}
