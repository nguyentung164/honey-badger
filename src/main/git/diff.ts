import l from 'electron-log'
import { resolvePathRelativeToBase } from '../utils/utils'
import { formatGitError, getGitInstance } from './utils'

interface GitDiffResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    diffContent: string
    deletedFiles: string[]
  }
}

export async function getDiff(selectedFiles: string[] = [], cwd?: string): Promise<GitDiffResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching git diff')
    l.info('Selected files:', selectedFiles)

    let diffResult: string
    let stagedDiffResult: string = ''
    let deletedFilesFromSelection: string[] = []

    if (selectedFiles.length > 0) {
      // Get diff for specific files (both staged and unstaged)
      // Filter out deleted files - git.diff() fails for them (no such path in working tree)
      // Similar to SVN: don't diff deleted files, just add path to deletedFiles
      const statusResult = await git.status()
      const deletedPaths = new Set([
        ...(statusResult.deleted || []),
        ...(statusResult.files
          ?.filter((f: { index: string; working_dir: string; path: string }) => f.index === 'D' || f.working_dir === 'D')
          .map((f: { path: string }) => f.path) || []),
      ])
      const diffableFiles = selectedFiles.filter((f: string) => !deletedPaths.has(f))
      deletedFilesFromSelection = selectedFiles.filter((f: string) => deletedPaths.has(f))

      l.info('Getting diff for selected files (excluding deleted):', diffableFiles)
      if (deletedFilesFromSelection.length > 0) {
        l.info('Deleted files (paths only, no diff):', deletedFilesFromSelection)
      }

      if (diffableFiles.length > 0) {
        // Get unstaged diff
        diffResult = await git.diff(diffableFiles)

        // Get staged diff (--cached)
        try {
          stagedDiffResult = await git.diff(['--cached', ...diffableFiles])
          l.info('Staged diff fetched for selected files')
        } catch (error) {
          l.warn('Error fetching staged diff for selected files:', error)
          stagedDiffResult = ''
        }
      } else {
        diffResult = ''
      }
    } else {
      // Get diff for all changes (both staged and unstaged)
      l.info('Getting diff for all changes')

      // Get unstaged diff
      diffResult = await git.diff()

      // Get staged diff (--cached)
      try {
        stagedDiffResult = await git.diff(['--cached'])
        l.info('Staged diff fetched for all changes')
      } catch (error) {
        l.warn('Error fetching staged diff:', error)
        stagedDiffResult = ''
      }
    }

    // Combine both diffs
    let combinedDiff = ''
    if (stagedDiffResult && stagedDiffResult.trim() !== '') {
      combinedDiff = stagedDiffResult
    }
    if (diffResult && diffResult.trim() !== '') {
      if (combinedDiff) {
        combinedDiff += `\n\n${diffResult}`
      } else {
        combinedDiff = diffResult
      }
    }

    if ((!combinedDiff || combinedDiff.trim() === '') && deletedFilesFromSelection.length === 0) {
      return {
        status: 'success',
        data: {
          diffContent: 'No changes to show',
          deletedFiles: [],
        },
      }
    }

    // When only deleted files: no diff but include paths for AI context
    if (!combinedDiff || combinedDiff.trim() === '') {
      const deletedPathsContent = deletedFilesFromSelection.map((f: string) => `- ${f}`).join('\n')
      return {
        status: 'success',
        data: {
          diffContent: `Deleted files:\n${deletedPathsContent}`,
          deletedFiles: deletedFilesFromSelection,
        },
      }
    }

    l.info('Git diff fetched successfully')
    l.debug('Combined diff result length:', combinedDiff.length)

    // Parse deleted files from diff output
    const deletedFiles: string[] = []
    const lines = combinedDiff.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('deleted file mode') || line.includes('deleted:')) {
        // Look for the next line that starts with '--- a/' to get the filename
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j]
          if (nextLine.startsWith('--- a/')) {
            const match = nextLine.match(/--- a\/(.+)/)
            if (match) {
              deletedFiles.push(match[1])
            }
            break
          }
        }
      }
    }

    // Merge deleted files from selection (filtered out before diff) with parsed from diff output
    const allDeletedFiles = [...new Set([...deletedFilesFromSelection, ...deletedFiles])]
    l.info('Detected deleted files:', allDeletedFiles)

    return {
      status: 'success',
      data: {
        diffContent: combinedDiff,
        deletedFiles: allDeletedFiles,
      },
    }
  } catch (error) {
    l.error('Error fetching git diff:', error)
    return {
      status: 'error',
      message: `Error fetching git diff: ${formatGitError(error)}`,
    }
  }
}

export async function getStagedDiff(): Promise<GitDiffResponse> {
  try {
    const git = await getGitInstance()
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching staged git diff')

    const diffResult = await git.diff(['--cached'])

    if (!diffResult || diffResult.trim() === '') {
      return {
        status: 'success',
        data: {
          diffContent: 'No staged changes to show',
          deletedFiles: [],
        },
      }
    }

    l.info('Staged git diff fetched successfully')

    // Parse deleted files from diff output
    const deletedFiles: string[] = []
    const lines = diffResult.split('\n')
    for (const line of lines) {
      if (line.startsWith('deleted file mode') || line.includes('deleted:') || line.startsWith('--- a/')) {
        // Extract filename from diff output
        const match = line.match(/--- a\/(.+)/)
        if (match) {
          deletedFiles.push(match[1])
        }
      }
    }

    l.info('Detected deleted files in staged diff:', deletedFiles)

    return {
      status: 'success',
      data: {
        diffContent: diffResult,
        deletedFiles: deletedFiles,
      },
    }
  } catch (error) {
    l.error('Error fetching staged git diff:', error)
    return {
      status: 'error',
      message: `Error fetching staged git diff: ${formatGitError(error)}`,
    }
  }
}

export async function getCommitDiff(commitHash: string, filePath?: string, cwd?: string): Promise<GitDiffResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Fetching git diff for commit: ${commitHash}`)
    if (filePath) {
      l.info(`File path: ${filePath}`)
    }

    let diffResult: string

    if (filePath) {
      // Get diff for specific file in specific commit
      diffResult = await git.raw(['show', '--format=', commitHash, '--', filePath])
    } else {
      // Get diff for entire commit
      diffResult = await git.raw(['show', '--format=', commitHash])
    }

    if (!diffResult || diffResult.trim() === '') {
      return {
        status: 'success',
        data: {
          diffContent: 'No changes to show',
          deletedFiles: [],
        },
      }
    }

    l.info('Git commit diff fetched successfully')
    l.debug('Diff result:', diffResult)

    // Parse deleted files from diff output
    const deletedFiles: string[] = []
    const lines = diffResult.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('deleted file mode') || line.includes('deleted:')) {
        // Look for the next line that starts with '--- a/' to get the filename
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j]
          if (nextLine.startsWith('--- a/')) {
            const match = nextLine.match(/--- a\/(.+)/)
            if (match) {
              deletedFiles.push(match[1])
            }
            break
          }
        }
      }
    }

    l.info('Detected deleted files:', deletedFiles)

    return {
      status: 'success',
      data: {
        diffContent: diffResult,
        deletedFiles: deletedFiles,
      },
    }
  } catch (error) {
    l.error('Error fetching git commit diff:', error)
    return {
      status: 'error',
      message: `Error fetching git commit diff: ${formatGitError(error)}`,
    }
  }
}

/**
 * Get parent commit hash of a given commit.
 * Returns null for root commit (no parent).
 */
export async function getParentCommit(commitHash: string, cwd?: string): Promise<string | null> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) return null
    const parent = await git.raw(['rev-parse', '--verify', `${commitHash}^`])
    const hash = parent?.trim()
    return hash || null
  } catch {
    return null
  }
}

interface GitFileContentResponse {
  status: 'success' | 'error'
  message?: string
  data?: string
}

/**
 * Get file content from Git
 * @param filePath - Path to the file
 * @param fileStatus - File status (A, M, D, etc.)
 * @param commitHash - Commit hash or reference (HEAD, branch name, etc.). If not provided, reads from working copy
 * @param cwd - Working directory (repo root). If not provided, uses config store.
 * @returns File content
 */
export async function getFileContent(filePath: string, fileStatus: string, commitHash?: string, cwd?: string): Promise<GitFileContentResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Getting file content: ${filePath}`)
    l.info(`File status: ${fileStatus}`)
    l.info(`Commit hash: ${commitHash || 'working copy'}`)

    let content: string

    // If file is deleted, return empty content
    if (fileStatus === 'D' || fileStatus === 'deleted') {
      l.info('File is deleted, returning empty content')
      return {
        status: 'success',
        data: '',
      }
    }

    // If no commit hash provided, read from working copy
    if (!commitHash) {
      l.info('Reading from working copy')
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const workingDir = await git.revparse(['--show-toplevel'])
      const relativePath = resolvePathRelativeToBase(workingDir.trim(), filePath)
      const fullPath = path.join(workingDir.trim(), relativePath)

      try {
        content = await fs.readFile(fullPath, 'utf-8')
      } catch (error) {
        l.warn(`Error reading file from working copy: ${error}`)
        // If file doesn't exist in working copy (might be staged but not committed), try to read from index
        try {
          const pathForGit = relativePath.replace(/^[/\\]+/, '')
          content = await git.show([`:${pathForGit}`])
        } catch (indexError) {
          l.error(`Error reading file from index: ${indexError}`)
          return {
            status: 'error',
            message: `File not found: ${filePath}`,
          }
        }
      }
    } else {
      // Read from specific commit - git show does not support paths starting with /
      const pathForGit = resolvePathRelativeToBase(cwd, filePath).replace(/^[/\\]+/, '')
      try {
        content = await git.show([`${commitHash}:${pathForGit}`])
      } catch (error) {
        l.error(`Error reading file from commit ${commitHash}:`, error)
        return {
          status: 'error',
          message: `Error reading file from commit: ${formatGitError(error)}`,
        }
      }
    }

    l.info(`Successfully retrieved file content (${content.length} bytes)`)

    return {
      status: 'success',
      data: content,
    }
  } catch (error) {
    l.error('Error getting file content:', error)
    return {
      status: 'error',
      message: `Error getting file content: ${formatGitError(error)}`,
    }
  }
}
