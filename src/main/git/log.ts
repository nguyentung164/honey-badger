import path from 'path'
import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

interface GitResponse {
  status: 'success' | 'error' | 'no-change'
  message?: string
  data?: any
  totalEntries?: number
  suggestedStartDate?: string
  sourceFolderPrefix?: string
  workingCopyRootFolder?: string
}

export interface GitLogOptions {
  dateFrom?: string
  dateTo?: string
  commitFrom?: string
  commitTo?: string
  author?: string
  maxCount?: number
  /** Include commits from all branches (git log --all). Default false. */
  allBranches?: boolean
  /** Working directory for git commands. If not set, uses configurationStore.sourceFolder */
  cwd?: string
  /**
   * Log commits reachable from this ref (branch/tag/sha) without checking it out.
   * Example: `main`, `origin/feature/x`. Mutually exclusive with --all and commitFrom/commitTo in the underlying command.
   */
  revision?: string
  /** Skip first N commits (git log --skip). Use with maxCount for pagination. */
  skip?: number
}

interface GitLogEntry {
  hash: string
  author: string
  authorEmail?: string
  date: string
  subject: string
  body: string
  /** Branch name(s) from refs (e.g. from HEAD -> main). Empty when detached. */
  branch?: string
  files?: GitLogFile[]
}

interface GitLogFile {
  file: string
  status: string // A, M, D, R, C, U, T
  changes: number
  insertions: number
  deletions: number
}

function parseBranchFromRefs(refs: string): string {
  if (!refs || !refs.trim()) return ''
  const parts = refs.split(',').map(p => p.trim()).filter(Boolean)
  for (const p of parts) {
    if (p.startsWith('HEAD -> ')) return p.slice(8).trim()
  }
  const first = parts[0]
  if (!first) return ''
  return first.replace(/^origin\//, '').trim()
}

async function fetchAllLogData(
  filePath: string,
  startDate: string | undefined,
  endDate: string | undefined,
  commitFrom?: string,
  commitTo?: string,
  author?: string,
  maxCount?: number,
  cwd?: string,
  allBranches?: boolean,
  revision?: string,
  skip?: number
): Promise<{
  status: 'success' | 'error'
  totalEntries?: number
  data?: string
  message?: string
  sourceFolderPrefix?: string
  workingCopyRootFolder?: string
}> {
  const git = await getGitInstance(cwd)
  if (!git) {
    return { status: 'error', message: 'Not a git repository or error initializing git' }
  }

  try {
    let logResult: any

    // Use raw command for all cases to have full control over format and options
    // Use separators that are unlikely to appear in commit messages
    const fieldSeparator = '|||FIELD_SEP|||'
    const commitSeparator = '|||COMMIT_SEP|||'
    // Use %B for raw body (entire commit message including subject and body with newlines)
    // Then we'll parse subject and body in code
    // Add commitSeparator at end to clearly mark commit boundaries
    const rawCommand: string[] = ['log', `--format=${commitSeparator}hash:%H${fieldSeparator}author:%an${fieldSeparator}authorEmail:%ae${fieldSeparator}date:%aI${fieldSeparator}refs:%D${fieldSeparator}message:%B${commitSeparator}`]

    const rev = revision?.trim()
    if (!rev) {
      if (allBranches) {
        rawCommand.push('--all')
      }

      // Add commit range if specified (takes priority over date range)
      if (commitFrom || commitTo) {
        if (commitFrom && commitTo) {
          rawCommand.push(`${commitFrom}..${commitTo}`)
        } else if (commitFrom) {
          rawCommand.push(`${commitFrom}..HEAD`)
        } else if (commitTo) {
          rawCommand.push(`HEAD..${commitTo}`)
        }
      }
    }

    // Add date filters if specified and no commit range
    if ((startDate || endDate) && !commitFrom && !commitTo) {
      if (startDate) {
        rawCommand.push(`--since=${startDate}`)
      }
      if (endDate) {
        rawCommand.push(`--until=${endDate}`)
      }
    }

    if (skip != null && skip > 0) {
      rawCommand.push('--skip', String(skip))
    }

    // Add max count if specified
    if (maxCount) {
      rawCommand.push(`-n`, maxCount.toString())
    }

    // Add author filter if specified
    if (author) {
      rawCommand.push(`--author=${author}`)
    }

    if (rev) {
      rawCommand.push(rev)
    }

    // Add file path at the end with -- only when path is inside the repo (cwd).
    // When user switches source folder, filePath may still point to another repo (e.g. workspace) and would cause "outside repository" error.
    let pathForGit = filePath
    if (pathForGit && pathForGit !== '.' && cwd) {
      const resolvedCwd = path.resolve(cwd)
      const resolvedPath = path.isAbsolute(pathForGit) ? path.resolve(pathForGit) : path.resolve(cwd, pathForGit)
      const normCwd = resolvedCwd.replace(/\//g, path.sep).toLowerCase()
      const normPath = resolvedPath.replace(/\//g, path.sep).toLowerCase()
      const isInsideRepo = normPath === normCwd || normPath.startsWith(normCwd + path.sep)
      if (!isInsideRepo) {
        pathForGit = '.' // path outside current repo → show full repo log
      } else {
        // path inside repo: pass relative path for git
        const relative = path.relative(resolvedCwd, resolvedPath)
        pathForGit = relative || '.'
      }
    }
    if (pathForGit && pathForGit !== '.') {
      rawCommand.push('--', pathForGit)
    }

    l.info('Executing raw git log command:', rawCommand.join(' '))

    const rawOutput = await git.raw(rawCommand)

    // Parse raw output into log format
    const commits: any[] = []
    // Split by commit separator to get individual commits
    const commitBlocks = rawOutput.split(commitSeparator).filter(block => block.trim())

    l.info(`Found ${commitBlocks.length} commit blocks to parse`)

    for (const block of commitBlocks) {
      // Clean up the block - remove any trailing separators
      const cleanBlock = block.trim()
      if (!cleanBlock) continue

      const commit: any = {}

      // Find the index of each field
      const hashIndex = cleanBlock.indexOf('hash:')
      const authorIndex = cleanBlock.indexOf(`${fieldSeparator}author:`)
      const authorEmailIndex = cleanBlock.indexOf(`${fieldSeparator}authorEmail:`)
      const dateIndex = cleanBlock.indexOf(`${fieldSeparator}date:`)
      const refsIndex = cleanBlock.indexOf(`${fieldSeparator}refs:`)
      const messageIndex = cleanBlock.indexOf(`${fieldSeparator}message:`)

      if (hashIndex !== -1 && authorIndex !== -1 && dateIndex !== -1 && messageIndex !== -1) {
        // Extract hash (from start to author separator)
        commit.hash = cleanBlock.substring(hashIndex + 5, authorIndex).trim()

        // Extract author (from author: to authorEmail or date separator)
        const authorEndIndex = authorEmailIndex !== -1 ? authorEmailIndex : dateIndex
        commit.author = cleanBlock.substring(authorIndex + fieldSeparator.length + 7, authorEndIndex).trim()

        // Extract authorEmail if present (from authorEmail: to date separator)
        if (authorEmailIndex !== -1) {
          commit.authorEmail = cleanBlock.substring(authorEmailIndex + fieldSeparator.length + 12, dateIndex).trim()
        }

        // Extract date (from date: to refs or message separator)
        const dateEndIndex = refsIndex !== -1 ? refsIndex : messageIndex
        commit.date = cleanBlock.substring(dateIndex + fieldSeparator.length + 5, dateEndIndex).trim()

        // Extract refs (branch info) if present
        if (refsIndex !== -1) {
          const refsStr = cleanBlock.substring(refsIndex + fieldSeparator.length + 5, messageIndex).trim()
          commit.branch = parseBranchFromRefs(refsStr)
        }

        // Extract full message (from message: to end) - preserve newlines
        const messageStart = messageIndex + fieldSeparator.length + 8
        const fullMessage = cleanBlock.substring(messageStart).trim()

        // Remove trailing separator characters
        const cleanMessage = fullMessage.replace(/\|+$/, '').trim()

        // Parse subject and body from full message
        // Subject is the first line, body is everything after the first blank line
        const lines = cleanMessage.split('\n')
        commit.subject = lines[0] || ''

        // Find the body (skip empty lines after subject)
        let bodyStartIndex = 1
        while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === '') {
          bodyStartIndex++
        }

        if (bodyStartIndex < lines.length) {
          commit.body = lines.slice(bodyStartIndex).join('\n').trim()
        } else {
          commit.body = ''
        }

        // Debug log for first commit
        if (commits.length === 0) {
          l.info('First commit parsed:')
          l.info('  Hash:', commit.hash.substring(0, 8))
          l.info('  Subject:', commit.subject)
          l.info('  Body length:', commit.body.length)
          l.info('  Body preview:', commit.body.substring(0, 100))
        }

        if (commit.hash && commit.author && commit.date && commit.subject !== undefined) {
          commits.push({
            hash: commit.hash,
            author: commit.author,
            authorEmail: (commit as any).authorEmail,
            date: commit.date,
            subject: commit.subject,
            body: commit.body || '',
            branch: (commit as any).branch,
          })
        }
      }
    }

    l.info(`Successfully parsed ${commits.length} commits`)

    logResult = { all: commits }

    const totalEntries = logResult.all.length
    l.info(`Found ${totalEntries} commits matching criteria`)

    // Get detailed file information for each commit using raw command
    const enhancedLogData: GitLogEntry[] = []

    for (const commit of logResult.all) {
      try {
        const [nameStatusResult, numStatResult] = await Promise.all([
          git.raw(['show', '--name-status', '--format=', commit.hash]),
          git.raw(['show', '--numstat', '--format=', commit.hash]),
        ])

        const statsByFile = new Map<string, { additions: number; deletions: number }>()
        for (const line of numStatResult.split('\n').filter(l => l.trim())) {
          const parts = line.split('\t')
          if (parts.length >= 3) {
            const additions = parseInt(parts[0], 10) || 0
            const deletions = parseInt(parts[1], 10) || 0
            const fileName = parts.slice(2).join('\t').trim()
            statsByFile.set(fileName, { additions, deletions })
          }
        }

        const files: GitLogFile[] = []
        for (const line of nameStatusResult.split('\n').filter(l => l.trim())) {
          const parts = line
            .split('\t')
            .map(s => s.trim())
            .filter(Boolean)
          if (parts.length >= 2) {
            const status = parts[0][0]
            const fileName = parts[parts.length - 1]
            const stats = statsByFile.get(fileName) ?? statsByFile.get(parts[1]) ?? { additions: 0, deletions: 0 }
            files.push({
              file: fileName,
              status,
              changes: stats.additions + stats.deletions,
              insertions: stats.additions,
              deletions: stats.deletions,
            })
          }
        }

        enhancedLogData.push({
          hash: commit.hash,
          author: (commit as any).author,
          authorEmail: (commit as any).authorEmail,
          date: commit.date,
          subject: (commit as any).subject,
          body: (commit as any).body,
          branch: (commit as any).branch,
          files,
        })
      } catch (error) {
        l.warn(`Error getting file stats for commit ${commit.hash}:`, error)
        // Add commit without file information
        enhancedLogData.push({
          hash: commit.hash,
          author: (commit as any).author,
          authorEmail: (commit as any).authorEmail,
          date: commit.date,
          subject: (commit as any).subject,
          body: (commit as any).body,
          branch: (commit as any).branch,
        })
      }
    }

    return {
      status: 'success',
      totalEntries,
      data: JSON.stringify(enhancedLogData),
      sourceFolderPrefix: '', // Will be set by caller
      workingCopyRootFolder: '', // Will be set by caller
    }
  } catch (error) {
    l.error('Error fetching git log:', error)
    return {
      status: 'error',
      message: `Error fetching git log: ${formatGitError(error)}`,
    }
  }
}

export async function log(filePath: string | string[] = '.', options?: GitLogOptions): Promise<GitResponse> {
  try {
    const targetPath = Array.isArray(filePath) ? filePath[0] : filePath

    l.info(`Fetching git log for path: ${targetPath}`)
    l.info('Log options:', options)

    const result = await fetchAllLogData(
      targetPath,
      options?.dateFrom,
      options?.dateTo,
      options?.commitFrom,
      options?.commitTo,
      options?.author,
      options?.maxCount,
      options?.cwd,
      options?.allBranches,
      options?.revision,
      options?.skip
    )

    if (result.status === 'error') {
      return {
        status: 'error',
        message: result.message,
      }
    }

    return {
      status: 'success',
      data: result.data,
      totalEntries: result.totalEntries,
      sourceFolderPrefix: result.sourceFolderPrefix,
      workingCopyRootFolder: result.workingCopyRootFolder,
    }
  } catch (error) {
    l.error('Error in git log function:', error)
    return {
      status: 'error',
      message: `Error in git log function: ${formatGitError(error)}`,
    }
  }
}

export async function getCommitFiles(commitHash: string, cwd?: string): Promise<GitResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Fetching files for commit: ${commitHash}`)

    // Chạy 2 lệnh git song song thay vì N+1 lệnh (1 name-status + 1 per file)
    const [nameStatusResult, numStatResult] = await Promise.all([
      git.raw(['show', '--name-status', '--format=', commitHash]),
      git.raw(['show', '--numstat', '--format=', commitHash]),
    ])

    // Parse numstat: "additions\tdeletions\tfilename" -> Map<filename, {additions, deletions}>
    const statsByFile = new Map<string, { additions: number; deletions: number }>()
    for (const line of numStatResult.split('\n').filter(l => l.trim())) {
      const parts = line.split('\t')
      if (parts.length >= 3) {
        const additions = parseInt(parts[0], 10) || 0
        const deletions = parseInt(parts[1], 10) || 0
        const fileName = parts.slice(2).join('\t').trim()
        statsByFile.set(fileName, { additions, deletions })
      }
    }

    const files: GitLogFile[] = []
    for (const line of nameStatusResult.split('\n').filter(l => l.trim())) {
      // Parse "M\tfile" hoặc "R099\told\tnew" (git dùng tab)
      const parts = line
        .split('\t')
        .map(s => s.trim())
        .filter(Boolean)
      if (parts.length >= 2) {
        const status = parts[0][0]
        const fileName = parts[parts.length - 1]
        const stats = statsByFile.get(fileName) ?? statsByFile.get(parts[1]) ?? { additions: 0, deletions: 0 }
        files.push({
          file: fileName,
          status,
          changes: stats.additions + stats.deletions,
          insertions: stats.additions,
          deletions: stats.deletions,
        })
      }
    }

    return {
      status: 'success',
      data: { files },
    }
  } catch (error) {
    l.error('Error fetching commit files:', error)
    return {
      status: 'error',
      message: `Error fetching commit files: ${formatGitError(error)}`,
    }
  }
}

export async function getLogGraph(filePath: string | string[] = '.', options?: GitLogOptions): Promise<GitResponse> {
  try {
    const targetPath = Array.isArray(filePath) ? filePath[0] : filePath
    const git = await getGitInstance()
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Fetching git log graph for path: ${targetPath}`)
    l.info('Log options:', options)

    // Build git log command with --graph option
    // Use unique separators to avoid conflicts with commit message content
    const fieldSep = '|||FIELD|||'
    const bodyEnd = '|||BODY_END|||'
    const rawCommand: string[] = [
      'log',
      '--graph',
      // Use %B (raw body) to preserve ALL newlines in commit message
      // %P for parent hashes (space-separated), %D for decorations
      `--pretty=format:%H${fieldSep}%an${fieldSep}%aI${fieldSep}%P${fieldSep}%B${bodyEnd}%n%D`,
      '--all',
    ]

    // Add commit range if specified
    if (options?.commitFrom || options?.commitTo) {
      if (options.commitFrom && options.commitTo) {
        rawCommand.push(`${options.commitFrom}..${options.commitTo}`)
      } else if (options.commitFrom) {
        rawCommand.push(`${options.commitFrom}..HEAD`)
      } else if (options.commitTo) {
        rawCommand.push(`HEAD..${options.commitTo}`)
      }
    }

    // Add date filters if specified and no commit range
    if ((options?.dateFrom || options?.dateTo) && !options?.commitFrom && !options?.commitTo) {
      if (options.dateFrom) {
        rawCommand.push(`--since=${options.dateFrom}`)
      }
      if (options.dateTo) {
        rawCommand.push(`--until=${options.dateTo}`)
      }
    }

    // Add max count if specified
    if (options?.maxCount) {
      rawCommand.push(`-n`, options.maxCount.toString())
    }

    // Add author filter if specified
    if (options?.author) {
      rawCommand.push(`--author=${options.author}`)
    }

    // Add file path at the end with --
    if (targetPath && targetPath !== '.') {
      rawCommand.push('--', targetPath)
    }

    l.info('Executing git log --graph command:', rawCommand.join(' '))

    const rawOutput = await git.raw(rawCommand)
    l.info('Raw graph output length:', rawOutput.length)
    l.debug('Raw graph output (first 500 chars):', rawOutput.substring(0, 500))

    // Parse graph output
    // Format: graph lines contain graph characters (|, /, \, *, etc.) followed by commit data
    // Use the same separators defined above for parsing
    const lines = rawOutput.split('\n')
    const graphData: any[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || !line.trim()) continue

      // Check if this line contains a commit hash (40-char hex)
      const hashMatch = line.match(/([0-9a-f]{40})/)
      if (hashMatch && hashMatch.index !== undefined) {
        const hashIndex = hashMatch.index
        const graphPart = line.substring(0, hashIndex).trim()
        const dataPart = line.substring(hashIndex)

        const foundHash = hashMatch[0].substring(0, 8)
        l.debug(`Found commit line ${i}: ${foundHash}...`)

        // Parse commit data using field separators
        const parts = dataPart.split(fieldSep)
        l.debug(`  Parts count: ${parts.length}, first part: ${parts[0]?.substring(0, 8)}...`)

        if (parts.length >= 5) {
          const hash = parts[0]?.trim()
          const author = parts[1]?.trim() || ''
          const date = parts[2]?.trim() || ''
          const parentsStr = parts[3]?.trim() || ''
          const parents = parentsStr ? parentsStr.split(' ').filter(p => p.length > 0) : []
          const fullMessageRaw = parts[4] || ''

          // Extract full message (with %B format, preserves all newlines)
          let fullMessage = ''

          // Remove bodyEnd marker
          const bodyEndIndex = fullMessageRaw.indexOf(bodyEnd)
          if (bodyEndIndex !== -1) {
            fullMessage = fullMessageRaw.substring(0, bodyEndIndex).trim()
          } else {
            fullMessage = fullMessageRaw.trim()
          }

          // Need to collect continuation lines that start with graph characters
          // Look ahead for lines that continue this commit's message
          let messageEndLine = i + 1
          while (messageEndLine < lines.length) {
            const nextLine = lines[messageEndLine]
            // Check if this is a continuation line (starts with graph chars but no hash)
            if (nextLine && !nextLine.match(/[0-9a-f]{40}/) && nextLine.match(/^[\s|/\\*]+/)) {
              // Remove only graph characters (|, /, \, *, spaces), keep actual content like bullet points
              const continuationContent = nextLine.replace(/^[\s|/\\*]+/, '')
              // Don't trim here to preserve leading dashes/bullets, just check for body end
              if (continuationContent && !continuationContent.startsWith(bodyEnd) && !continuationContent.includes(bodyEnd)) {
                fullMessage += `\n${continuationContent}`
                messageEndLine++
              } else if (continuationContent.includes(bodyEnd)) {
                // Found end of body, add content before bodyEnd marker
                const beforeBodyEnd = continuationContent.substring(0, continuationContent.indexOf(bodyEnd))
                if (beforeBodyEnd.trim()) {
                  fullMessage += `\n${beforeBodyEnd}`
                }
                break
              } else {
                messageEndLine++
              }
            } else {
              break
            }
          }

          // Update i to skip processed lines
          // Note: set to messageEndLine - 1 because for loop will i++ at the end
          const linesProcessed = messageEndLine - i
          l.debug(`  Processed ${linesProcessed} lines for commit ${hash.substring(0, 8)}, next i will be ${messageEndLine}`)
          i = messageEndLine - 1

          // Clean up: Remove bodyEnd markers using simple string replacement
          // Note: After removing graph chars, "| |||BODY_END|||" becomes "BODY_END|||"
          // So we need to remove both variations
          fullMessage = fullMessage
            .split('|||BODY_END|||')
            .join('') // Remove full marker
            .split('BODY_END|||')
            .join('') // Remove partial marker (after graph char removal)
            .split('|||BODY_END')
            .join('') // Remove another variation
            .trim()

          // Split into subject and body
          // Note: fullMessage should already be clean (no BODY_END markers)
          const allLines = fullMessage.split('\n')

          // Remove decorate info lines that were accidentally included
          // These lines appear after %n%D in git format and start with graph chars
          const messageLines = allLines.filter(line => {
            const trimmed = line.trim()
            // Keep empty lines
            if (!trimmed) return true
            // Filter out ONLY decorate lines (must match exact patterns)
            // These come from %D format: "HEAD -> main, origin/main, tag: v1.0"
            const isDecorateOnly =
              trimmed.match(/^HEAD\s*->\s*\w+/) || // "HEAD -> main"
              (trimmed.match(/^origin\//) && trimmed.split(',').length === 1) || // "origin/main" alone
              trimmed.match(/^tag:\s*\w+/) // "tag: v1.0"
            return !isDecorateOnly
          })

          const subject = messageLines[0]?.trim() || ''

          // Find body (skip empty lines after subject)
          let bodyStartIndex = 1
          while (bodyStartIndex < messageLines.length && !messageLines[bodyStartIndex]?.trim()) {
            bodyStartIndex++
          }

          const body = bodyStartIndex < messageLines.length ? messageLines.slice(bodyStartIndex).join('\n').trim() : ''

          // Debug log for all commits to detect missing ones
          l.info(`Commit ${graphData.length + 1}: ${hash.substring(0, 8)} - ${subject}`)

          // Detailed debug for first commit
          if (graphData.length === 0) {
            l.info('=== First commit detail ===')
            l.info('Body length:', body.length)
            l.info('Body preview:', body.substring(0, 150))
            l.info('Full message cleaned:', fullMessage.substring(0, 200))
            l.info('Contains BODY_END?', fullMessage.includes('BODY_END'))
          }

          // Collect decorate info separately (don't include in message)
          let decorateInfo = ''
          const nextLineIdx = i + 1
          if (nextLineIdx < lines.length) {
            const nextLine = lines[nextLineIdx]
            if (nextLine?.match(/^[\s|/\\*]+/) && (nextLine.includes('HEAD') || nextLine.includes('tag:') || nextLine.includes('origin'))) {
              decorateInfo = nextLine.replace(/^[\s|/\\*]+/, '').trim()
              i = nextLineIdx // Update i to skip decorate line (for loop will i++ after)
              l.debug(`  Found decorate info at line ${nextLineIdx}, skipping to ${i + 1}`)
            }
          }

          // Parse branches and tags from decorate info
          const branches: string[] = []
          const tags: string[] = []
          if (decorateInfo) {
            // Remove parentheses if present
            const cleanDecorate = decorateInfo.replace(/^\(|\)$/g, '')
            const refs = cleanDecorate
              .split(',')
              .map(r => r.trim())
              .filter(r => r)
            refs.forEach(ref => {
              if (ref.startsWith('tag: ')) {
                tags.push(ref.substring(5))
              } else if (ref.startsWith('HEAD -> ')) {
                branches.push(ref.substring(8))
              } else if (!ref.includes('HEAD') && ref.length > 0) {
                branches.push(ref)
              }
            })
          }

          if (hash) {
            graphData.push({
              hash,
              shortHash: hash.substring(0, 8),
              author,
              date,
              subject,
              body,
              graphLine: graphPart,
              parents,
              branches,
              tags,
              files: [], // Will be populated below
            })
          }
        }
      }
    }

    l.info(`Parsed ${graphData.length} commits from graph output`)

    // Now load files for each commit (same as in log function)
    const enhancedGraphData: any[] = []

    for (const commit of graphData) {
      try {
        const [nameStatusResult, numStatResult] = await Promise.all([
          git.raw(['show', '--name-status', '--format=', commit.hash]),
          git.raw(['show', '--numstat', '--format=', commit.hash]),
        ])

        const statsByFile = new Map<string, { additions: number; deletions: number }>()
        for (const line of numStatResult.split('\n').filter(l => l.trim())) {
          const parts = line.split('\t')
          if (parts.length >= 3) {
            const additions = parseInt(parts[0], 10) || 0
            const deletions = parseInt(parts[1], 10) || 0
            const fileName = parts.slice(2).join('\t').trim()
            statsByFile.set(fileName, { additions, deletions })
          }
        }

        const files: GitLogFile[] = []
        for (const line of nameStatusResult.split('\n').filter(l => l.trim())) {
          const parts = line
            .split('\t')
            .map(s => s.trim())
            .filter(Boolean)
          if (parts.length >= 2) {
            const status = parts[0][0]
            const fileName = parts[parts.length - 1]
            const stats = statsByFile.get(fileName) ?? statsByFile.get(parts[1]) ?? { additions: 0, deletions: 0 }
            files.push({
              file: fileName,
              status,
              changes: stats.additions + stats.deletions,
              insertions: stats.additions,
              deletions: stats.deletions,
            })
          }
        }

        enhancedGraphData.push({
          ...commit,
          files,
        })
      } catch (error) {
        l.warn(`Error getting files for commit ${commit.hash}:`, error)
        enhancedGraphData.push({
          ...commit,
          files: [],
        })
      }
    }

    l.info(`Enhanced ${enhancedGraphData.length} commits with file information`)

    return {
      status: 'success',
      data: JSON.stringify({
        commits: enhancedGraphData,
      }),
      totalEntries: enhancedGraphData.length,
    }
  } catch (error) {
    l.error('Error in git log graph function:', error)
    return {
      status: 'error',
      message: `Error in git log graph function: ${formatGitError(error)}`,
    }
  }
}
