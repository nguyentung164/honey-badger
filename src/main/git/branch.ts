import l from 'electron-log'
import { formatGitError, getGitInstance, isCheckoutOverwriteError, parseOverwrittenFilesFromError } from './utils'
import { validateBranchName } from './validation'

interface GitBranchResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
}

export async function getBranches(cwd?: string): Promise<GitBranchResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching git branches')

    // Get local branches
    const localBranches = await git.branchLocal()

    // Get remote branches
    const remoteBranches = await git.branch(['-r'])

    // Get ahead/behind info for each local branch
    const branchesWithTracking: Record<string, any> = {}
    for (const branchName of localBranches.all) {
      const branch = localBranches.branches[branchName]
      branchesWithTracking[branchName] = { ...branch }

      try {
        // Get tracking branch info using git rev-list
        const trackingBranch = await git.revparse(['--abbrev-ref', `${branchName}@{upstream}`])
        if (trackingBranch) {
          // Count ahead commits
          const aheadResult = await git.raw(['rev-list', '--count', `${trackingBranch}..${branchName}`])
          const ahead = parseInt(aheadResult.trim(), 10) || 0

          // Count behind commits
          const behindResult = await git.raw(['rev-list', '--count', `${branchName}..${trackingBranch}`])
          const behind = parseInt(behindResult.trim(), 10) || 0

          branchesWithTracking[branchName].ahead = ahead
          branchesWithTracking[branchName].behind = behind
          branchesWithTracking[branchName].tracking = trackingBranch
        }
      } catch (_error) {
        // Branch has no upstream tracking - this is fine
        l.debug(`Branch ${branchName} has no upstream tracking`)
      }
    }

    l.info('Git branches fetched successfully')

    return {
      status: 'success',
      data: {
        local: {
          all: localBranches.all,
          current: localBranches.current,
          branches: branchesWithTracking,
        },
        remote: {
          all: remoteBranches.all,
          branches: remoteBranches.branches,
        },
        current: localBranches.current,
      },
    }
  } catch (error) {
    l.error('Error fetching git branches:', error)
    return {
      status: 'error',
      message: `Error fetching git branches: ${formatGitError(error)}`,
    }
  }
}

export async function createBranch(branchName: string, sourceBranch?: string, cwd?: string): Promise<GitBranchResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Đang tạo nhánh mới: ${branchName}` + (sourceBranch ? ` từ ${sourceBranch}` : '') + (cwd ? ` (cwd: ${cwd})` : ''))

    // Use checkout -b to create and switch to new branch (from sourceBranch or current HEAD)
    if (sourceBranch && sourceBranch.trim()) {
      await git.checkout(['-b', branchName, sourceBranch.trim()])
    } else {
      await git.checkout(['-b', branchName])
    }

    l.info(`Đã tạo và chuyển sang nhánh ${branchName} thành công`)

    return {
      status: 'success',
      message: `Successfully created and checked out branch: ${branchName}`,
    }
  } catch (error) {
    l.error('Error creating branch:', error)
    return {
      status: 'error',
      message: `Error creating branch: ${formatGitError(error)}`,
    }
  }
}

/**
 * Checkout (switch) branch. Follows official Git behavior:
 * - Git allows switch when there are no local changes that would be overwritten
 *   (e.g. untracked files that don't exist on target branch, or changes that don't conflict).
 * - Git only blocks when checkout would overwrite local changes (modified tracked files
 *   or untracked files that exist in the target branch).
 * See: https://git-scm.com/docs/git-checkout, https://git-scm.com/docs/git-switch
 */
export async function checkoutBranch(
  branchName: string,
  options?: { force?: boolean; stash?: boolean },
  cwd?: string
): Promise<GitBranchResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Checking out branch: ${branchName}`, options)

    // Stash (including untracked) if user chose "Stash & Switch"
    if (options?.stash) {
      l.info('Stashing changes (including untracked) before checkout')
      await git.stash(['push', '-u', '-m', `Auto-stash before switching to ${branchName}`])
    }

    // Force checkout discards local changes
    if (options?.force) {
      const checkoutArgs = ['-f', branchName]
      await git.checkout(checkoutArgs)
      l.info(`Successfully checked out branch: ${branchName} (force)`)
      return {
        status: 'success',
        message: `Successfully checked out branch: ${branchName}`,
        data: { stashed: false },
      }
    }

    // Try normal checkout first; Git only fails when local changes would be overwritten
    try {
      await git.checkout(branchName)
      l.info(`Successfully checked out branch: ${branchName}`)
      return {
        status: 'success',
        message: `Successfully checked out branch: ${branchName}`,
        data: { stashed: options?.stash || false },
      }
    } catch (checkoutError) {
      if (!isCheckoutOverwriteError(checkoutError)) {
        throw checkoutError
      }
      const files = parseOverwrittenFilesFromError(checkoutError)
      l.warn('Checkout blocked by Git (would overwrite local changes):', files)
      return {
        status: 'error',
        message: formatGitError(checkoutError),
        data: {
          hasUncommittedChanges: true,
          files: files.length > 0 ? files : undefined,
        },
      }
    }
  } catch (error) {
    l.error('Error checking out branch:', error)
    return {
      status: 'error',
      message: `Error checking out branch: ${formatGitError(error)}`,
    }
  }
}

export async function deleteBranch(branchName: string, force: boolean = false, cwd?: string): Promise<GitBranchResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Deleting branch: ${branchName} (force: ${force})`)

    if (force) {
      await git.branch(['-D', branchName])
    } else {
      await git.branch(['-d', branchName])
    }

    l.info(`Successfully deleted branch: ${branchName}`)

    return {
      status: 'success',
      message: `Successfully deleted branch: ${branchName}`,
    }
  } catch (error) {
    l.error('Error deleting branch:', error)
    return {
      status: 'error',
      message: `Error deleting branch: ${formatGitError(error)}`,
    }
  }
}

export async function deleteRemoteBranch(remote: string, branchName: string, cwd?: string): Promise<GitBranchResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }
    const refToDelete = `:refs/heads/${branchName}`
    l.info(`Deleting remote branch: ${remote}/${branchName}`)
    await git.push(remote, refToDelete)
    l.info(`Successfully deleted remote branch: ${remote}/${branchName}`)
    return {
      status: 'success',
      message: `Successfully deleted remote branch ${branchName} on ${remote}`,
    }
  } catch (error) {
    l.error('Error deleting remote branch:', error)
    return {
      status: 'error',
      message: `Error deleting remote branch: ${formatGitError(error)}`,
    }
  }
}

export async function renameBranch(oldName: string, newName: string, cwd?: string): Promise<GitBranchResponse> {
  try {
    const validation = validateBranchName(newName)
    if (!validation.isValid) {
      return { status: 'error', message: validation.message }
    }

    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Renaming branch: ${oldName} -> ${newName}`)

    await git.raw(['branch', '-m', oldName, newName])

    l.info(`Successfully renamed branch to ${newName}`)

    return {
      status: 'success',
      message: `Successfully renamed branch to ${newName}`,
    }
  } catch (error) {
    l.error('Error renaming branch:', error)
    return {
      status: 'error',
      message: `Error renaming branch: ${formatGitError(error)}`,
    }
  }
}
