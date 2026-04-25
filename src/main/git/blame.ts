import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

interface GitBlameResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    lines: Array<{
      line: number
      commit: string
      author: string
      date: string
      content: string
    }>
  }
}

interface BlameLine {
  line: number
  commit: string
  author: string
  date: string
  content: string
}

export async function blame(filePath: string): Promise<GitBlameResponse> {
  try {
    const git = await getGitInstance()
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Getting git blame for file: ${filePath}`)

    // Use git.raw() to execute git blame command
    const blameOutput = await git.raw(['blame', '--porcelain', filePath])

    l.info('Git blame fetched successfully')

    // Parse blame output
    // Format: Each line starts with commit-hash, then metadata lines, then content line starting with \t
    // In --porcelain format, metadata is only shown once per commit, subsequent lines reuse the same commit info
    const lines: BlameLine[] = []
    const outputLines = blameOutput.split('\n')

    // Cache to store commit metadata
    const commitCache: Map<string, { author: string; date: string }> = new Map()

    let currentLine: Partial<BlameLine> = {}
    let lineNumber = 1
    let currentCommitHash = ''

    for (let i = 0; i < outputLines.length; i++) {
      const line = outputLines[i]

      // Check if this is a commit hash line (starts with 40-char hash followed by space and line info)
      const commitHashMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+\d+/)
      if (commitHashMatch) {
        currentCommitHash = commitHashMatch[1]
        currentLine.commit = currentCommitHash

        // Check if this is uncommitted changes (all zeros)
        if (currentCommitHash === '0000000000000000000000000000000000000000') {
          currentLine.author = 'Not Committed Yet'
          currentLine.date = new Date().toISOString()
          // Cache it so subsequent lines of the same uncommitted block use it
          commitCache.set(currentCommitHash, {
            author: 'Not Committed Yet',
            date: new Date().toISOString(),
          })
        } else {
          // Check if we already have metadata for this commit
          const cachedMetadata = commitCache.get(currentCommitHash)
          if (cachedMetadata) {
            currentLine.author = cachedMetadata.author
            currentLine.date = cachedMetadata.date
          }
        }
        continue
      }

      // Parse metadata lines
      if (line.startsWith('author ')) {
        const author = line.substring(7).trim()
        currentLine.author = author
        // Cache metadata if we have commit hash
        if (currentCommitHash && author) {
          const existing = commitCache.get(currentCommitHash) || { author: '', date: '' }
          commitCache.set(currentCommitHash, { ...existing, author })
        }
      } else if (line.startsWith('author-time ')) {
        const timestamp = parseInt(line.substring(12).trim(), 10)
        if (!Number.isNaN(timestamp)) {
          const date = new Date(timestamp * 1000).toISOString()
          currentLine.date = date
          // Cache metadata if we have commit hash
          if (currentCommitHash && date) {
            const existing = commitCache.get(currentCommitHash) || { author: '', date: '' }
            commitCache.set(currentCommitHash, { ...existing, date })
          }
        }
      } else if (line.startsWith('\t')) {
        // This is the actual content line
        currentLine.content = line.substring(1)
        currentLine.line = lineNumber

        // Add the line if we have all required fields
        if (currentLine.commit && currentLine.author && currentLine.date && currentLine.content !== undefined) {
          lines.push({
            line: currentLine.line,
            commit: currentLine.commit,
            author: currentLine.author,
            date: currentLine.date,
            content: currentLine.content,
          })
        } else {
          l.warn(`Missing data for line ${lineNumber}:`, currentLine)
        }

        // Reset for next line (but keep commit cache)
        currentLine = {}
        lineNumber++
      }
    }

    return {
      status: 'success',
      data: {
        lines,
      },
    }
  } catch (error) {
    l.error('Error getting git blame:', error)
    return {
      status: 'error',
      message: `Error getting git blame: ${formatGitError(error)}`,
    }
  }
}
