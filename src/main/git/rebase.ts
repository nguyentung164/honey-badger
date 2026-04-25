import { existsSync } from 'node:fs'
import { join } from 'node:path'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { formatGitError, getGitInstance } from './utils'

interface GitRebaseResponse {
  status: 'success' | 'error' | 'conflict'
  message?: string
  data?: any
}

export async function rebase(ontoBranch: string, cwd?: string): Promise<GitRebaseResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Rebasing onto branch: ${ontoBranch}`)

    await git.raw(['rebase', ontoBranch])

    l.info('Rebase completed successfully')

    return {
      status: 'success',
      message: 'Rebase completed successfully',
    }
  } catch (error) {
    l.error('Error during rebase:', error)

    if (error instanceof Error && error.message.includes('CONFLICT')) {
      return {
        status: 'conflict',
        message: `Rebase conflict detected: ${formatGitError(error)}`,
      }
    }

    return {
      status: 'error',
      message: `Error during rebase: ${formatGitError(error)}`,
    }
  }
}

export async function continueRebase(cwd?: string): Promise<GitRebaseResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Continuing rebase')

    await git.raw(['rebase', '--continue'])

    l.info('Rebase continued successfully')

    return {
      status: 'success',
      message: 'Rebase continued successfully',
    }
  } catch (error) {
    l.error('Error continuing rebase:', error)

    if (error instanceof Error && error.message.includes('CONFLICT')) {
      return {
        status: 'conflict',
        message: `Rebase conflict detected: ${formatGitError(error)}`,
      }
    }

    return {
      status: 'error',
      message: `Error continuing rebase: ${formatGitError(error)}`,
    }
  }
}

export async function abortRebase(cwd?: string): Promise<GitRebaseResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Aborting rebase')

    await git.raw(['rebase', '--abort'])

    l.info('Rebase aborted successfully')

    return {
      status: 'success',
      message: 'Rebase aborted successfully',
    }
  } catch (error) {
    l.error('Error aborting rebase:', error)
    return {
      status: 'error',
      message: `Error aborting rebase: ${formatGitError(error)}`,
    }
  }
}

export async function getRebaseStatus(cwd?: string): Promise<GitRebaseResponse> {
  try {
    const workingDir = cwd || configurationStore.store.sourceFolder
    if (!workingDir) {
      return { status: 'error', message: 'Source folder not configured' }
    }

    const gitDir = join(workingDir, '.git')
    const isInRebase = existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))

    if (!isInRebase) {
      return {
        status: 'success',
        data: { isInRebase: false, conflictedFiles: [] },
      }
    }

    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository' }
    }

    const statusResult = await git.status()
    const conflictedFiles = statusResult.conflicted || []

    return {
      status: 'success',
      data: {
        isInRebase: true,
        conflictedFiles,
      },
    }
  } catch (error) {
    l.error('Error checking rebase status:', error)
    return {
      status: 'error',
      message: `Error checking rebase status: ${formatGitError(error)}`,
    }
  }
}
