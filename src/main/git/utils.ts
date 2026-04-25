import l from 'electron-log'
import { type SimpleGit, simpleGit } from 'simple-git'
import configurationStore from '../store/ConfigurationStore'

export async function getGitInstance(cwd?: string): Promise<SimpleGit | null> {
  try {
    const workingDir = cwd || configurationStore.store.sourceFolder
    l.debug('Getting git instance for:', workingDir || '(config)')

    if (!workingDir) {
      l.error('Source folder is not configured')
      return null
    }

    const git = simpleGit(workingDir)

    // Check if it's a git repository
    const isRepo = await git.checkIsRepo()
    l.info('Is git repository:', isRepo)

    if (!isRepo) {
      l.error('Not a git repository:', workingDir)
      return null
    }

    l.info('Git instance initialized successfully for:', workingDir)
    return git
  } catch (error) {
    l.error('Error initializing git instance:', error)
    return null
  }
}

export function formatGitError(error: unknown): string {
  if (error instanceof Error) {
    // Handle specific Git errors
    const message = error.message.toLowerCase()

    if (message.includes('not a git repository')) {
      return 'Not a Git repository. Please select a valid Git repository folder.'
    }

    if (message.includes('authentication failed')) {
      return 'Authentication failed. Please check your Git credentials.'
    }

    if (message.includes('permission denied')) {
      return 'Permission denied. Please check file permissions.'
    }

    if (message.includes('already exists')) {
      return 'Resource already exists (branch, tag, etc.).'
    }

    if (message.includes('merge conflict')) {
      return 'Merge conflict detected. Please resolve conflicts before proceeding.'
    }

    if (message.includes('working tree clean')) {
      return 'No changes to commit. Working tree is clean.'
    }

    if (message.includes('branch not found')) {
      return 'Branch not found. Please check the branch name.'
    }

    if (message.includes('cannot lock ref')) {
      return 'Cannot lock reference. Another Git operation may be in progress.'
    }

    if (message.includes('unmerged files')) {
      return 'There are unmerged files. Please resolve conflicts first.'
    }

    if (message.includes('nothing to commit')) {
      return 'Nothing to commit. No changes detected.'
    }

    if (message.includes('no such ref')) {
      return 'Reference not found. Please check the branch or tag name.'
    }

    if (message.includes('remote rejected')) {
      return 'Remote rejected the push. Please check your permissions and try again.'
    }

    if (message.includes('non-fast-forward')) {
      return 'Non-fast-forward merge. Please pull changes first.'
    }

    return error.message
  }
  return String(error)
}

/**
 * Check if Git refused checkout because local changes would be overwritten.
 * Per Git docs: checkout is only blocked when switching would overwrite
 * modified tracked files or untracked files that exist in the target branch.
 */
export function isCheckoutOverwriteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('would be overwritten by checkout') || msg.includes('would be overwritten by merge') || msg.includes('untracked working tree files would be overwritten')
}

/**
 * Parse file paths from Git "would be overwritten by checkout" error message.
 * Git outputs: "error: ... overwritten by checkout:\n\tpath1\n\tpath2\nPlease ...\nAborting"
 * simple-git may put the same in Error.message.
 */
export function parseOverwrittenFilesFromError(error: unknown): { path: string; working_dir?: string }[] {
  if (!(error instanceof Error)) return []
  const lines = error.message.split(/\r?\n/)
  const files: { path: string; working_dir?: string }[] = []

  // Common Git error messages that are not file paths
  const skipKeywords = ['aborting', 'error:', 'please', 'hint:', 'fatal:', 'warning:']

  for (const line of lines) {
    const path = line.replace(/^\s+/, '').trim()
    if (!path) continue

    // Skip error messages and keywords
    const pathLower = path.toLowerCase()
    if (skipKeywords.some(keyword => pathLower.startsWith(keyword) || pathLower === keyword)) continue
    if (pathLower.includes('would be overwritten')) continue

    // Skip lines that don't look like file paths
    // File paths typically contain path separators (/ or \) or have file extensions
    // Single words without separators are likely not file paths (e.g., "Aborting")
    if (!path.includes('/') && !path.includes('\\') && !path.includes('.')) {
      // If it's a single word without path separators or dots, skip it
      // This filters out words like "Aborting"
      if (path.split(/\s+/).length === 1 && path.length < 50) {
        continue
      }
    }

    // Skip lines with colons (usually error messages or status indicators)
    if (path.includes(':')) continue

    // Valid file path - add it
    files.push({ path, working_dir: 'M' })
  }
  return files
}
