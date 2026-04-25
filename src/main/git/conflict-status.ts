import { existsSync } from 'node:fs'
import { join } from 'node:path'
import configurationStore from '../store/ConfigurationStore'
import { mergeConflictedPathsForStatus } from './status'
import { getGitInstance } from './utils'

export type GitConflictType = 'merge' | 'rebase' | 'cherry-pick'

export interface GitConflictStatusResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    hasConflict: boolean
    conflictedFiles: string[]
    conflictType?: GitConflictType
  }
}

export async function getGitConflictStatus(cwd?: string): Promise<GitConflictStatusResponse> {
  try {
    const workingDir = cwd || configurationStore.store.sourceFolder
    if (!workingDir) {
      return { status: 'success', data: { hasConflict: false, conflictedFiles: [] } }
    }

    const gitDir = join(workingDir, '.git')

    let conflictType: GitConflictType | undefined
    if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) {
      conflictType = 'cherry-pick'
    } else if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
      conflictType = 'rebase'
    } else if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
      conflictType = 'merge'
    }

    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository' }
    }

    const statusResult = await git.status()
    const conflictedFiles = await mergeConflictedPathsForStatus(git, statusResult)
    const hasConflict = conflictedFiles.length > 0

    // Không return sớm khi không có MERGE_HEAD: vẫn có thể còn file unmerged (trạng thái lạ / dở).
    return {
      status: 'success',
      data: {
        hasConflict,
        conflictedFiles,
        ...(conflictType ? { conflictType } : {}),
      },
    }
  } catch (error) {
    return {
      status: 'error',
      message: `Error checking conflict status: ${error}`,
      data: { hasConflict: false, conflictedFiles: [] },
    }
  }
}
