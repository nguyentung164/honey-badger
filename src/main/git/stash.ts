import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

export interface StashOptions {
  includeUntracked?: boolean
  stagedOnly?: boolean
}

export interface GitStashResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
  /** Set when stash pop failed due to merge conflicts; stash entry is left in list. */
  conflict?: boolean
}

/** Normalize simple-git stash list entry to StashEntry shape (index, hash, date, message, author_name, author_email) */
function normalizeStashEntry(entry: Record<string, unknown>, index: number): Record<string, unknown> {
  return {
    index,
    hash: entry.hash ?? entry.id ?? '',
    date: entry.date ?? entry.timestamp ?? '',
    message: entry.message ?? entry.msg ?? '',
    author_name: entry.author_name ?? (typeof entry.author === 'string' ? entry.author : undefined),
    author_email: entry.author_email ?? entry.authorEmail ?? undefined,
  }
}

export async function stash(message?: string, options?: StashOptions, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Creating stash', { includeUntracked: options?.includeUntracked, stagedOnly: options?.stagedOnly })

    if (options?.stagedOnly) {
      // git stash push --staged (Git 2.35+); use raw to avoid simple-git API gaps
      const args = ['push', '--staged']
      if (message) args.push('-m', message)
      try {
        const out = await git.raw(['stash', ...args])
        return { status: 'success', message: 'Stash created successfully', data: out }
      } catch (err) {
        const msg = formatGitError(err)
        if (msg.includes('unknown option') || msg.includes('--staged')) {
          return { status: 'error', message: 'Stash (staged only) requires Git 2.35 or later.' }
        }
        throw err
      }
    }

    const stashOptions: string[] = ['push']
    if (options?.includeUntracked) stashOptions.push('-u')
    if (message) stashOptions.push('-m', message)
    const stashResult = await git.stash(stashOptions)

    l.info('Stash created successfully')
    return {
      status: 'success',
      message: 'Stash created successfully',
      data: stashResult,
    }
  } catch (error) {
    l.error('Error creating stash:', error)
    return {
      status: 'error',
      message: `Error creating stash: ${formatGitError(error)}`,
    }
  }
}

export async function stashList(cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching stash list')

    const stashListResult = await git.stashList()
    const rawAll = stashListResult.all ?? []
    const data = Array.isArray(rawAll)
      ? rawAll.map((entry: Record<string, unknown>, i: number) => normalizeStashEntry(entry, i))
      : []

    l.info('Stash list fetched successfully')
    return {
      status: 'success',
      data,
    }
  } catch (error) {
    l.error('Error fetching stash list:', error)
    return {
      status: 'error',
      message: `Error fetching stash list: ${formatGitError(error)}`,
    }
  }
}

/** Detect if git error indicates merge conflict (e.g. stash pop with conflicts). */
function isStashConflictError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    msg.includes('conflict') ||
    msg.includes('unmerged') ||
    msg.includes('cannot merge') ||
    msg.includes('merge conflict')
  )
}

export async function stashPop(stashIndex: number = 0, options?: { index?: boolean }, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Popping stash at index: ${stashIndex}`, { index: options?.index })

    const args = ['pop', ...(options?.index ? ['--index'] : []), `stash@{${stashIndex}}`]
    const stashPopResult = await git.raw(['stash', ...args])

    l.info('Stash popped successfully')

    return {
      status: 'success',
      message: 'Stash popped successfully',
      data: stashPopResult,
    }
  } catch (error) {
    l.error('Error popping stash:', error)
    const msg = formatGitError(error)
    if (isStashConflictError(error)) {
      return {
        status: 'error',
        message: msg,
        conflict: true,
      }
    }
    return {
      status: 'error',
      message: `Error popping stash: ${msg}`,
    }
  }
}

export async function stashApply(stashIndex: number = 0, options?: { index?: boolean }, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Applying stash at index: ${stashIndex}`, { index: options?.index })

    const args = ['apply', ...(options?.index ? ['--index'] : []), `stash@{${stashIndex}}`]
    const stashApplyResult = await git.raw(['stash', ...args])

    l.info('Stash applied successfully')

    return {
      status: 'success',
      message: 'Stash applied successfully',
      data: stashApplyResult,
    }
  } catch (error) {
    l.error('Error applying stash:', error)
    return {
      status: 'error',
      message: `Error applying stash: ${formatGitError(error)}`,
    }
  }
}

export async function stashDrop(stashIndex: number = 0, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Dropping stash at index: ${stashIndex}`)

    await git.stash(['drop', `stash@{${stashIndex}}`])

    l.info('Stash dropped successfully')

    return {
      status: 'success',
      message: 'Stash dropped successfully',
    }
  } catch (error) {
    l.error('Error dropping stash:', error)
    return {
      status: 'error',
      message: `Error dropping stash: ${formatGitError(error)}`,
    }
  }
}

export async function stashClear(cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Clearing all stashes')

    await git.stash(['clear'])

    l.info('All stashes cleared successfully')

    return {
      status: 'success',
      message: 'All stashes cleared successfully',
    }
  } catch (error) {
    l.error('Error clearing stashes:', error)
    return {
      status: 'error',
      message: `Error clearing stashes: ${formatGitError(error)}`,
    }
  }
}

export async function stashShow(stashIndex: number, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const ref = `stash@{${stashIndex}}`
    const patch = await git.raw(['stash', 'show', '-p', ref])
    return { status: 'success', data: patch ?? '' }
  } catch (error) {
    l.error('Error showing stash:', error)
    return {
      status: 'error',
      message: `Error showing stash: ${formatGitError(error)}`,
    }
  }
}

export interface StashFileEntry {
  path: string
  status: string
}

/** List files changed in a stash (git stash show --name-status). */
export async function stashShowFiles(stashIndex: number, cwd?: string): Promise<GitStashResponse & { data?: StashFileEntry[] }> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const ref = `stash@{${stashIndex}}`
    const out = await git.raw(['stash', 'show', '--name-status', ref])
    const lines = (out ?? '').trim().split(/\r?\n/).filter(Boolean)
    const files: StashFileEntry[] = []
    for (const line of lines) {
      const tab = line.indexOf('\t')
      if (tab >= 0) {
        const status = line.slice(0, tab).trim().replace(/\s+/g, ' ')
        const path = line.slice(tab + 1).trim()
        if (path) files.push({ path, status })
      }
    }
    return { status: 'success', data: files }
  } catch (error) {
    l.error('Error listing stash files:', error)
    return {
      status: 'error',
      message: `Error listing stash files: ${formatGitError(error)}`,
    }
  }
}

/** Get diff for a single file in a stash (git show stash@{n} -- path). */
export async function stashShowFileDiff(stashIndex: number, filePath: string, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const ref = `stash@{${stashIndex}}`
    const diff = await git.raw(['show', ref, '--', filePath])
    return { status: 'success', data: diff ?? '' }
  } catch (error) {
    l.error('Error showing stash file diff:', error)
    return {
      status: 'error',
      message: `Error showing stash file diff: ${formatGitError(error)}`,
    }
  }
}

export interface StashFileContentResponse {
  status: 'success' | 'error'
  message?: string
  data?: { original: string; modified: string }
}

/** Get original (before stash) and modified (in stash) content for a file, for use with DiffEditor. */
export async function stashShowFileContent(stashIndex: number, filePath: string, cwd?: string): Promise<StashFileContentResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const ref = `stash@{${stashIndex}}`
    const parentRef = `${ref}^`
    let original = ''
    let modified = ''
    try {
      original = await git.raw(['show', `${parentRef}:${filePath}`])
    } catch {
      original = ''
    }
    try {
      modified = await git.raw(['show', `${ref}:${filePath}`])
    } catch {
      modified = ''
    }
    return { status: 'success', data: { original: original ?? '', modified: modified ?? '' } }
  } catch (error) {
    l.error('Error showing stash file content:', error)
    return {
      status: 'error',
      message: `Error showing stash file content: ${formatGitError(error)}`,
    }
  }
}

/**
 * Create a new branch from a stash, apply the stash to it, and drop the stash entry.
 * Equivalent to: git stash branch <branchName> stash@{stashIndex}
 */
/**
 * Heuristic: check if working tree has no diff against the stash commit.
 * If "git diff stash@{n}" is empty, the stash changes are likely already present (e.g. after apply).
 * Not 100% reliable: false positive if you have other uncommitted changes that match the stash.
 */
export async function stashIsLikelyApplied(stashIndex: number, cwd?: string): Promise<GitStashResponse & { data?: boolean }> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const ref = `stash@{${stashIndex}}`
    try {
      const out = await git.raw(['diff', ref, '--'])
      const isEmpty = (out ?? '').trim() === ''
      return { status: 'success', data: isEmpty }
    } catch {
      return { status: 'success', data: false }
    }
  } catch (error) {
    l.error('Error checking stash applied:', error)
    return {
      status: 'error',
      message: `Error checking stash: ${formatGitError(error)}`,
    }
  }
}

export async function stashBranch(stashIndex: number, branchName: string, cwd?: string): Promise<GitStashResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const branchNameTrimmed = branchName.trim()
    if (!branchNameTrimmed) {
      return { status: 'error', message: 'Branch name is required' }
    }

    l.info(`Creating branch from stash: ${branchNameTrimmed} from stash@{${stashIndex}}`)

    await git.raw(['stash', 'branch', branchNameTrimmed, `stash@{${stashIndex}}`])

    l.info('Stash branch created successfully')
    return {
      status: 'success',
      message: 'Branch created from stash successfully',
      data: { branchName: branchNameTrimmed },
    }
  } catch (error) {
    l.error('Error creating branch from stash:', error)
    return {
      status: 'error',
      message: `Error creating branch from stash: ${formatGitError(error)}`,
    }
  }
}
