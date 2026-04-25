import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

interface GitResetResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
}

export async function reset(commitHash: string, mode: 'soft' | 'mixed' | 'hard', cwd?: string): Promise<GitResetResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Resetting to commit ${commitHash} (${mode})`)

    await git.raw(['reset', `--${mode}`, commitHash])

    l.info('Reset completed successfully')

    return {
      status: 'success',
      message: 'Reset completed successfully',
    }
  } catch (error) {
    l.error('Error during reset:', error)
    return {
      status: 'error',
      message: `Error during reset: ${formatGitError(error)}`,
    }
  }
}
