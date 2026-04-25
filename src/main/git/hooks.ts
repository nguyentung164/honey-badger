import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { formatGitError } from './utils'

export const SUPPORTED_HOOKS = ['pre-commit', 'commit-msg', 'prepare-commit-msg', 'post-commit', 'pre-push', 'pre-rebase', 'post-merge', 'post-checkout'] as const

export type HookName = (typeof SUPPORTED_HOOKS)[number]

export interface HookInfo {
  name: HookName
  enabled: boolean
  hasContent: boolean
  hasSample: boolean
  preview?: string
}

export interface GitHooksResponse {
  status: 'success' | 'error'
  message?: string
  data?: HookInfo[]
}

export interface GitHookContentResponse {
  status: 'success' | 'error'
  message?: string
  data?: string
}

function getHooksDir(cwd?: string): string {
  const workingDir = cwd || configurationStore.store.sourceFolder
  if (!workingDir) {
    throw new Error('Source folder not configured')
  }
  return join(workingDir, '.git', 'hooks')
}

function getHookPath(hookName: string, cwd?: string): string {
  return join(getHooksDir(cwd), hookName)
}

function getDisabledHookPath(hookName: string, cwd?: string): string {
  return join(getHooksDir(cwd), `${hookName}.disabled`)
}

export async function getHooks(cwd?: string): Promise<GitHooksResponse> {
  try {
    const hooksDir = getHooksDir(cwd)
    if (!existsSync(hooksDir)) {
      return {
        status: 'success',
        data: SUPPORTED_HOOKS.map(name => ({
          name,
          enabled: false,
          hasContent: false,
          hasSample: false,
        })),
      }
    }

    const files = readdirSync(hooksDir)
    const result: HookInfo[] = SUPPORTED_HOOKS.map(name => {
      const hookPath = getHookPath(name, cwd)
      const disabledPath = getDisabledHookPath(name, cwd)
      const hasActive = existsSync(hookPath)
      const hasDisabled = existsSync(disabledPath)
      const hasSample = files.includes(`${name}.sample`)

      let preview: string | undefined
      if (hasActive) {
        try {
          const content = readFileSync(hookPath, 'utf-8')
          preview = content.split('\n').slice(0, 3).join('\n').trim()
        } catch {
          preview = undefined
        }
      }

      return {
        name,
        enabled: hasActive && !hasDisabled,
        hasContent: hasActive,
        hasSample,
        preview,
      }
    })

    return { status: 'success', data: result }
  } catch (error) {
    l.error('Error getting hooks:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function getHookContent(hookName: string, cwd?: string): Promise<GitHookContentResponse> {
  try {
    if (!SUPPORTED_HOOKS.includes(hookName as HookName)) {
      return { status: 'error', message: `Invalid hook name: ${hookName}` }
    }

    const hookPath = getHookPath(hookName, cwd)
    const disabledPath = getDisabledHookPath(hookName, cwd)

    let contentPath = hookPath
    if (existsSync(disabledPath) && !existsSync(hookPath)) {
      contentPath = disabledPath
    }

    if (!existsSync(contentPath)) {
      return { status: 'success', data: '' }
    }

    const content = readFileSync(contentPath, 'utf-8')
    return { status: 'success', data: content }
  } catch (error) {
    l.error('Error getting hook content:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function setHookContent(hookName: string, content: string, cwd?: string): Promise<GitHooksResponse> {
  try {
    if (!SUPPORTED_HOOKS.includes(hookName as HookName)) {
      return { status: 'error', message: `Invalid hook name: ${hookName}` }
    }

    const hooksDir = getHooksDir(cwd)
    const hookPath = getHookPath(hookName, cwd)
    const disabledPath = getDisabledHookPath(hookName, cwd)

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true })
    }

    // Ensure content has shebang if not empty
    let finalContent = content.trim()
    if (finalContent && !finalContent.startsWith('#!')) {
      finalContent = `#!/bin/sh\n\n${finalContent}`
    }

    // Remove disabled version if exists
    if (existsSync(disabledPath)) {
      unlinkSync(disabledPath)
    }

    writeFileSync(hookPath, finalContent, 'utf-8')

    // Make executable (Unix/macOS) - on Windows chmod may not set exec bit but won't fail
    try {
      chmodSync(hookPath, 0o755)
    } catch {
      // Ignore on Windows if chmod fails
    }

    return { status: 'success' }
  } catch (error) {
    l.error('Error setting hook content:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function deleteHook(hookName: string, cwd?: string): Promise<GitHooksResponse> {
  try {
    if (!SUPPORTED_HOOKS.includes(hookName as HookName)) {
      return { status: 'error', message: `Invalid hook name: ${hookName}` }
    }

    const hookPath = getHookPath(hookName, cwd)
    const disabledPath = getDisabledHookPath(hookName, cwd)

    if (existsSync(hookPath)) {
      unlinkSync(hookPath)
    }
    if (existsSync(disabledPath)) {
      unlinkSync(disabledPath)
    }

    return { status: 'success' }
  } catch (error) {
    l.error('Error deleting hook:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function enableHook(hookName: string, cwd?: string): Promise<GitHooksResponse> {
  try {
    if (!SUPPORTED_HOOKS.includes(hookName as HookName)) {
      return { status: 'error', message: `Invalid hook name: ${hookName}` }
    }

    const hookPath = getHookPath(hookName, cwd)
    const disabledPath = getDisabledHookPath(hookName, cwd)

    if (existsSync(disabledPath)) {
      renameSync(disabledPath, hookPath)
      try {
        chmodSync(hookPath, 0o755)
      } catch {
        // Ignore on Windows
      }
    }

    return { status: 'success' }
  } catch (error) {
    l.error('Error enabling hook:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function disableHook(hookName: string, cwd?: string): Promise<GitHooksResponse> {
  try {
    if (!SUPPORTED_HOOKS.includes(hookName as HookName)) {
      return { status: 'error', message: `Invalid hook name: ${hookName}` }
    }

    const hookPath = getHookPath(hookName, cwd)
    const disabledPath = getDisabledHookPath(hookName, cwd)

    if (existsSync(hookPath)) {
      renameSync(hookPath, disabledPath)
    }

    return { status: 'success' }
  } catch (error) {
    l.error('Error disabling hook:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function getSampleHookContent(hookName: string, cwd?: string): Promise<GitHookContentResponse> {
  try {
    if (!SUPPORTED_HOOKS.includes(hookName as HookName)) {
      return { status: 'error', message: `Invalid hook name: ${hookName}` }
    }

    const hooksDir = getHooksDir(cwd)
    const samplePath = join(hooksDir, `${hookName}.sample`)

    if (!existsSync(samplePath)) {
      return { status: 'success', data: '' }
    }

    const content = readFileSync(samplePath, 'utf-8')
    return { status: 'success', data: content }
  } catch (error) {
    l.error('Error getting sample hook:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}
