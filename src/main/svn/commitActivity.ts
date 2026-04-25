import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { addDays, format } from 'date-fns'
import l from 'electron-log'

const execPromise = promisify(exec)

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
  message?: string
}

function parseFileStatus(line: string): 'added' | 'modified' | 'deleted' | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const firstChar = trimmed[0]
  switch (firstChar) {
    case 'A':
      return 'added'
    case 'M':
    case 'R':
    case 'G':
      return 'modified'
    case 'D':
      return 'deleted'
    default:
      return null
  }
}

function parseSvnDate(dateStr: string): string | null {
  try {
    const withoutParen = dateStr.split('(')[0].trim()
    const isoLike = withoutParen.replace(/\s+(\d{2}:\d{2}:\d{2})\s+/, 'T$1').replace(/\s+(\+\d{4}|-\d{4})/, '$1')
    const date = new Date(isoLike)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  } catch {
    return null
  }
}

export async function getCommitActivityForRepo(cwd: string, dateFrom: string, dateTo: string): Promise<CommitActivityResult> {
  try {
    const toDateExclusive = format(addDays(new Date(dateTo), 1), 'yyyy-MM-dd')
    const revisionRange = `{${dateFrom}}:{${toDateExclusive}}`
    const command = `svn log "." -v -r "${revisionRange}"`
    l.info(`SVN commit activity: cwd=${cwd}, range=${revisionRange}, command=${command}`)
    const { stdout, stderr } = await execPromise(command, { cwd, maxBuffer: 1024 * 1024 * 100 })

    if (stderr) {
      l.warn('SVN log stderr:', stderr)
    }
    if (!stdout?.trim() && stderr) {
      return { status: 'error', message: stderr }
    }

    const entries = (stdout || '')
      .split('------------------------------------------------------------------------')
      .map(e => e.trim())
      .filter(Boolean)

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

    for (const entry of entries) {
      const lines = entry
        .split('\n')
        .map(ln => ln.trim())
        .filter(Boolean)
      const headerMatch = lines[0]?.match(/^r\d+\s+\|\s+([^|]+?)\s+\|\s+([^|]+?)\s+\|/)
      if (!headerMatch) continue

      const [, author, dateStr] = headerMatch
      const authorTrim = author.trim()
      const dateIso = parseSvnDate(dateStr)
      if (!dateIso) continue

      let mapEntry = authorMap.get(authorTrim)
      if (!mapEntry) {
        mapEntry = {
          commitCount: 0,
          fileCount: 0,
          firstCommitTime: dateIso,
          lastCommitTime: dateIso,
          added: 0,
          modified: 0,
          deleted: 0,
        }
        authorMap.set(authorTrim, mapEntry)
      }
      mapEntry.commitCount++
      if (dateIso < mapEntry.firstCommitTime) mapEntry.firstCommitTime = dateIso
      if (dateIso > mapEntry.lastCommitTime) mapEntry.lastCommitTime = dateIso

      for (let i = 1; i < lines.length; i++) {
        const fileType = parseFileStatus(lines[i])
        if (fileType) {
          mapEntry.fileCount++
          if (fileType === 'added') mapEntry.added++
          else if (fileType === 'modified') mapEntry.modified++
          else if (fileType === 'deleted') mapEntry.deleted++
        }
      }
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
    }))

    return { status: 'success', data }
  } catch (error) {
    l.error('getCommitActivityForRepo SVN error:', error)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
