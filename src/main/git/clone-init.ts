import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import l from 'electron-log'
import { simpleGit } from 'simple-git'
import { formatGitError } from './utils'

interface GitCloneInitResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
}

export interface CloneOptions {
  branch?: string
  depth?: number
}

export async function clone(url: string, targetPath: string, options?: CloneOptions): Promise<GitCloneInitResponse> {
  try {
    if (!url?.trim()) {
      return { status: 'error', message: 'Repository URL is required' }
    }
    if (!targetPath?.trim()) {
      return { status: 'error', message: 'Target path is required' }
    }

    l.info(`Cloning repository: ${url} -> ${targetPath}`)

    const git = simpleGit()
    const args: string[] = []

    if (options?.branch) {
      args.push('--branch', options.branch)
    }
    if (options?.depth && options.depth > 0) {
      args.push('--depth', String(options.depth))
    }

    await git.clone(url.trim(), targetPath.trim(), args)

    l.info('Clone completed successfully')

    return {
      status: 'success',
      message: 'Clone completed successfully',
      data: { path: targetPath.trim() },
    }
  } catch (error) {
    l.error('Error during clone:', error)
    return {
      status: 'error',
      message: `Error during clone: ${formatGitError(error)}`,
    }
  }
}

export async function init(targetPath: string): Promise<GitCloneInitResponse> {
  try {
    if (!targetPath?.trim()) {
      return { status: 'error', message: 'Target path is required' }
    }

    const path = targetPath.trim()
    l.info(`Initializing git repository: ${path}`)

    if (!existsSync(path)) {
      await mkdir(path, { recursive: true })
    }

    const git = simpleGit(path)
    await git.init(false)

    l.info('Init completed successfully')

    return {
      status: 'success',
      message: 'Init completed successfully',
      data: { path },
    }
  } catch (error) {
    l.error('Error during init:', error)
    return {
      status: 'error',
      message: `Error during init: ${formatGitError(error)}`,
    }
  }
}
