import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

interface GitRemoteResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
}

export async function getRemotes(cwd?: string): Promise<GitRemoteResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const remotes = await git.getRemotes(true)
    return { status: 'success', data: remotes }
  } catch (error) {
    l.error('Error listing remotes:', error)
    return {
      status: 'error',
      message: `Error listing remotes: ${formatGitError(error)}`,
    }
  }
}

export async function addRemote(name: string, url: string, cwd?: string): Promise<GitRemoteResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Adding remote: ${name} -> ${url}`)

    await git.raw(['remote', 'add', name, url])

    l.info('Remote added successfully')

    return {
      status: 'success',
      message: 'Remote added successfully',
    }
  } catch (error) {
    l.error('Error adding remote:', error)
    return {
      status: 'error',
      message: `Error adding remote: ${formatGitError(error)}`,
    }
  }
}

export async function removeRemote(name: string, cwd?: string): Promise<GitRemoteResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Removing remote: ${name}`)

    await git.raw(['remote', 'remove', name])

    l.info('Remote removed successfully')

    return {
      status: 'success',
      message: 'Remote removed successfully',
    }
  } catch (error) {
    l.error('Error removing remote:', error)
    return {
      status: 'error',
      message: `Error removing remote: ${formatGitError(error)}`,
    }
  }
}

export async function setRemoteUrl(name: string, url: string, cwd?: string): Promise<GitRemoteResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Setting remote URL: ${name} -> ${url}`)

    await git.raw(['remote', 'set-url', name, url])

    l.info('Remote URL updated successfully')

    return {
      status: 'success',
      message: 'Remote URL updated successfully',
    }
  } catch (error) {
    l.error('Error setting remote URL:', error)
    return {
      status: 'error',
      message: `Error setting remote URL: ${formatGitError(error)}`,
    }
  }
}
