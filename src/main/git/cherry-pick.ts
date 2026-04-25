import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

interface GitCherryPickResponse {
  status: 'success' | 'error' | 'conflict'
  message?: string
  data?: any
}

export async function cherryPick(commitHash: string, cwd?: string): Promise<GitCherryPickResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Cherry-picking commit: ${commitHash}`)

    await git.raw(['cherry-pick', commitHash])

    l.info('Cherry-pick completed successfully')

    return {
      status: 'success',
      message: 'Cherry-pick completed successfully',
    }
  } catch (error) {
    l.error('Error during cherry-pick:', error)

    if (error instanceof Error && error.message.includes('CONFLICT')) {
      return {
        status: 'conflict',
        message: `Cherry-pick conflict detected: ${formatGitError(error)}`,
      }
    }

    return {
      status: 'error',
      message: `Error during cherry-pick: ${formatGitError(error)}`,
    }
  }
}

export async function continueCherryPick(cwd?: string): Promise<GitCherryPickResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Continuing cherry-pick')

    await git.raw(['cherry-pick', '--continue'])

    l.info('Cherry-pick continued successfully')

    return {
      status: 'success',
      message: 'Cherry-pick continued successfully',
    }
  } catch (error) {
    l.error('Error continuing cherry-pick:', error)

    if (error instanceof Error && error.message.includes('CONFLICT')) {
      return {
        status: 'conflict',
        message: `Cherry-pick conflict detected: ${formatGitError(error)}`,
      }
    }

    return {
      status: 'error',
      message: `Error continuing cherry-pick: ${formatGitError(error)}`,
    }
  }
}

export async function abortCherryPick(cwd?: string): Promise<GitCherryPickResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Aborting cherry-pick')

    await git.raw(['cherry-pick', '--abort'])

    l.info('Cherry-pick aborted successfully')

    return {
      status: 'success',
      message: 'Cherry-pick aborted successfully',
    }
  } catch (error) {
    l.error('Error aborting cherry-pick:', error)
    return {
      status: 'error',
      message: `Error aborting cherry-pick: ${formatGitError(error)}`,
    }
  }
}
