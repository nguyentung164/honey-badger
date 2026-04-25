import { addDays, format } from 'date-fns'
import l from 'electron-log'
import { getGitInstance } from './utils'

export interface CommitActivityAuthor {
  author: string
  commitCount: number
  fileCount: number
  firstCommitTime: string
  lastCommitTime: string
  fileTypes: { added: number; modified: number; deleted: number }
  branch?: string
}

export interface CommitActivityResult {
  status: 'success' | 'error'
  data?: CommitActivityAuthor[]
  branch?: string
  message?: string
}

function parseFileStatus(line: string): 'added' | 'modified' | 'deleted' | null {
  const match = line.match(/^([AMDRCTU])\s+/)
  if (!match) return null
  const status = match[1]
  switch (status) {
    case 'A':
    case 'C':
      return 'added'
    case 'M':
    case 'R':
    case 'T':
      return 'modified'
    case 'D':
      return 'deleted'
    default:
      return null
  }
}

export async function getCommitActivityForRepo(cwd: string, dateFrom: string, dateTo: string): Promise<CommitActivityResult> {
  const git = await getGitInstance(cwd)
  if (!git) {
    return { status: 'error', message: 'Not a git repository' }
  }

  try {
    const marker = '___COMMIT___'
    const untilExclusive = format(addDays(new Date(dateTo), 1), 'yyyy-MM-dd')
    const rawCommand = ['log', '--all', `--since=${dateFrom}`, `--until=${untilExclusive}`, `--pretty=format:${marker}%H%x00%an%x00%aI`, '--name-status']

    const rawOutput = await git.raw(rawCommand)
    const blocks = (rawOutput || '').split(marker).filter(b => b.trim())

    const authorMap = new Map<
      string,
      {
        commitCount: number
        fileCount: number
        firstCommitTime: string
        lastCommitTime: string
        added: number
        modified: number
        deleted: number
      }
    >()

    for (const block of blocks) {
      const lines = block.trim().split('\n').filter(Boolean)
      const firstLine = lines[0] || ''
      const [hash, author, dateStr] = firstLine.split('\x00')
      if (!hash || !author || !dateStr) continue

      const hashTrim = hash.trim()
      if (!/^[0-9a-f]{40}$/i.test(hashTrim)) continue

      const authorTrim = author.trim()
      const dateTrim = dateStr.trim()

      let entry = authorMap.get(authorTrim)
      if (!entry) {
        entry = {
          commitCount: 0,
          fileCount: 0,
          firstCommitTime: dateTrim,
          lastCommitTime: dateTrim,
          added: 0,
          modified: 0,
          deleted: 0,
        }
        authorMap.set(authorTrim, entry)
      }
      entry.commitCount++
      if (dateTrim < entry.firstCommitTime) entry.firstCommitTime = dateTrim
      if (dateTrim > entry.lastCommitTime) entry.lastCommitTime = dateTrim

      for (let i = 1; i < lines.length; i++) {
        const fileType = parseFileStatus(lines[i])
        if (fileType) {
          entry.fileCount++
          if (fileType === 'added') entry.added++
          else if (fileType === 'modified') entry.modified++
          else if (fileType === 'deleted') entry.deleted++
        }
      }
    }

    let branch: string | undefined
    try {
      const stdout = await git.raw('rev-parse', '--abbrev-ref', 'HEAD')
      branch = (stdout || '').trim() || undefined
    } catch {
      branch = undefined
    }

    const data: CommitActivityAuthor[] = Array.from(authorMap.entries()).map(([author, entry]) => ({
      author,
      commitCount: entry.commitCount,
      fileCount: entry.fileCount,
      firstCommitTime: entry.firstCommitTime,
      lastCommitTime: entry.lastCommitTime,
      fileTypes: {
        added: entry.added,
        modified: entry.modified,
        deleted: entry.deleted,
      },
      branch,
    }))

    return { status: 'success', data, branch }
  } catch (error) {
    l.error('getCommitActivityForRepo error:', error)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
