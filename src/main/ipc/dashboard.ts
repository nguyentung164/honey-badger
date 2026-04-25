import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getCommitActivityForRepo as getGitCommitActivity } from 'main/git/commitActivity'
import type { StatisticsResponse } from 'main/git/statistics'
import { getStatistics as getGitStatistics } from 'main/git/statistics'
import { getCommitActivityForRepo as getSvnCommitActivity } from 'main/svn/commitActivity'
import { getStatistics as getSvnStatistics } from 'main/svn/statistics'
import sourceFolderStore from './../store/SourceFolderStore'
import { detectVersionControl } from '../utils/versionControlDetector'

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

export interface CommitActivityRepo {
  name: string
  path: string
  vcsType: 'git' | 'svn'
  authors: CommitActivityAuthor[]
  branch?: string
  /** SVN: current revision (e.g. r123) */
  currentRevision?: string
  error?: string
}

export interface RepoSummary {
  name: string
  path: string
  vcsType: 'git' | 'svn' | 'none'
  totalCommits: number
  recentCommitsCount: number
  /** Commit IDs trong date range (Git: full hash, SVN: revision số) - dùng để đếm reviewed chính xác theo range */
  commitIdsInRange?: string[]
  lastCommitDate?: string
  lastCommitAuthor?: string
  lastCommitMessage?: string
  currentBranch?: string // Git only
  currentRevision?: string // SVN only
  error?: string
}

async function getLastCommitInfo(cwd: string, vcsType: 'git' | 'svn'): Promise<{ author?: string; message?: string }> {
  try {
    if (vcsType === 'git') {
      const { stdout } = await execPromise('git log -1 --pretty=format:"%an|||%s"', { cwd })
      const [author, message] = (stdout || '').trim().split('|||')
      return { author: author || undefined, message: message || undefined }
    }
    if (vcsType === 'svn') {
      const { stdout } = await execPromise('svn log -l 1', { cwd })
      const lines = (stdout || '')
        .split('\n')
        .map(ln => ln.trim())
        .filter(Boolean)
      const headerLine = lines.find(ln => /^r\d+/.test(ln))
      const headerMatch = headerLine?.match(/^r\d+\s+\|\s+([^|]+?)\s+\|/)
      const author = headerMatch?.[1]?.trim()
      // Message is between 2nd and 3rd separator (header, sep, message, sep)
      const sepIndices = lines.map((ln, i) => (ln.startsWith('---') ? i : -1)).filter(i => i >= 0)
      const message = sepIndices.length >= 2 && lines[sepIndices[1] + 1] ? lines[sepIndices[1] + 1] : undefined
      return { author: author || undefined, message }
    }
  } catch {
    // Ignore - last commit info is optional
  }
  return {}
}

async function getCurrentBranch(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execPromise('git rev-parse --abbrev-ref HEAD', { cwd })
    return (stdout || '').trim() || undefined
  } catch {
    return undefined
  }
}

async function getCurrentRevision(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execPromise('svn info --show-item revision', { cwd })
    const rev = (stdout || '').trim()
    return rev ? `r${rev}` : undefined
  } catch {
    return undefined
  }
}

/** Lấy danh sách commit ID trong date range - Git: full hash, SVN: revision số (không có prefix r) */
async function getCommitIdsInRange(cwd: string, vcsType: 'git' | 'svn', dateFrom: string, dateTo: string): Promise<string[]> {
  try {
    if (vcsType === 'git') {
      const { stdout } = await execPromise(`git log --all --pretty=format:"%H" --since="${dateFrom}" --until="${dateTo}"`, { cwd })
      return (stdout || '')
        .trim()
        .split('\n')
        .map(h => h.trim())
        .filter(Boolean)
    }
    if (vcsType === 'svn') {
      const { stdout } = await execPromise(`svn log -q --revision "{${dateFrom}}:{${dateTo}}" "."`, { cwd })
      const revisions = (stdout || '')
        .split('------------------------------------------------------------------------')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => entry.match(/^r(\d+)\s+\|/)?.[1])
        .filter((rev): rev is string => !!rev)
      return [...new Set(revisions)]
    }
  } catch (e) {
    l.warn(`getCommitIdsInRange failed for ${cwd}:`, e)
  }
  return []
}

export function registerDashboardIpcHandlers() {
  l.info('🔄 Registering Dashboard IPC Handlers...')

  ipcMain.handle(IPC.DASHBOARD.GET_REPO_SUMMARY, async (_event, options?: { dateFrom?: string; dateTo?: string }): Promise<RepoSummary[]> => {
    const sourceFolders = sourceFolderStore.get('sourceFolders') || []
    const results: RepoSummary[] = []
    const dateFrom = options?.dateFrom
    const dateTo = options?.dateTo
    const hasDateRange = Boolean(dateFrom && dateTo)

    for (const folder of sourceFolders) {
      const result: RepoSummary = {
        name: folder.name,
        path: folder.path,
        vcsType: 'none',
        totalCommits: 0,
        recentCommitsCount: 0,
      }

      try {
        const detectResult = await detectVersionControl(folder.path)
        if (!detectResult.isValid || detectResult.type === 'none') {
          result.error = 'not-vcs'
          results.push(result)
          continue
        }

        result.vcsType = detectResult.type

        if (detectResult.type === 'svn') {
          const statsOpts = hasDateRange ? { cwd: folder.path, dateFrom, dateTo } : { cwd: folder.path, period: 'all' as const }
          const statsWeekOpts = hasDateRange ? { cwd: folder.path, dateFrom, dateTo } : { cwd: folder.path, period: 'week' as const }
          const [statsAll, statsWeek, lastCommit, revision] = await Promise.all([
            getSvnStatistics('.', statsOpts),
            getSvnStatistics('.', statsWeekOpts),
            getLastCommitInfo(folder.path, 'svn'),
            getCurrentRevision(folder.path),
          ])

          if (statsAll.status === 'success' && statsAll.data) {
            result.totalCommits = statsAll.data.totalCommits
            const dates = statsAll.data.commitsByDate || []
            if (dates.length > 0) {
              const lastDate = dates[dates.length - 1]
              result.lastCommitDate = lastDate.date
            }
          } else if (statsAll.status === 'error') {
            result.error = statsAll.message || 'SVN connection failed'
          }
          if (statsWeek.status === 'success' && statsWeek.data) {
            result.recentCommitsCount = statsWeek.data.totalCommits
          }
          if (!result.error && hasDateRange && dateFrom && dateTo) {
            result.commitIdsInRange = await getCommitIdsInRange(folder.path, 'svn', dateFrom, dateTo)
          }
          result.lastCommitAuthor = lastCommit.author
          result.lastCommitMessage = lastCommit.message
          result.currentRevision = revision
        } else if (detectResult.type === 'git') {
          const statsOpts = hasDateRange ? { cwd: folder.path, dateFrom, dateTo } : { cwd: folder.path, period: 'all' as const }
          const statsWeekOpts = hasDateRange ? { cwd: folder.path, dateFrom, dateTo } : { cwd: folder.path, period: 'week' as const }
          const [statsAll, statsWeek, lastCommit, branch] = await Promise.all([
            getGitStatistics('.', statsOpts),
            getGitStatistics('.', statsWeekOpts),
            getLastCommitInfo(folder.path, 'git'),
            getCurrentBranch(folder.path),
          ])

          if (statsAll.status === 'success' && statsAll.data) {
            result.totalCommits = statsAll.data.totalCommits
            const dates = statsAll.data.commitsByDate || []
            if (dates.length > 0) {
              const lastDate = dates[dates.length - 1]
              result.lastCommitDate = lastDate.date
            }
          } else if (statsAll.status === 'error') {
            result.error = statsAll.message || 'Git connection failed'
          }
          if (statsWeek.status === 'success' && statsWeek.data) {
            result.recentCommitsCount = statsWeek.data.totalCommits
          }
          if (!result.error && hasDateRange && dateFrom && dateTo) {
            result.commitIdsInRange = await getCommitIdsInRange(folder.path, 'git', dateFrom, dateTo)
          }
          result.lastCommitAuthor = lastCommit.author
          result.lastCommitMessage = lastCommit.message
          result.currentBranch = branch
        }
      } catch (error) {
        l.error(`Error getting repo summary for ${folder.name}:`, error)
        result.error = error instanceof Error ? error.message : String(error)
      }

      results.push(result)
    }

    return results
  })

  ipcMain.handle(IPC.DASHBOARD.GET_COMMIT_ACTIVITY, async (_event, options: { dateFrom: string; dateTo: string }): Promise<CommitActivityRepo[]> => {
    const sourceFolders = sourceFolderStore.get('sourceFolders') || []
    const { dateFrom, dateTo } = options || {}
    if (!dateFrom || !dateTo) {
      return []
    }

    const results: CommitActivityRepo[] = []

    for (const folder of sourceFolders) {
      let vcsType: 'git' | 'svn' = 'git'
      try {
        const detectResult = await detectVersionControl(folder.path)
        vcsType = detectResult.type === 'svn' ? 'svn' : 'git'
        if (!detectResult.isValid || detectResult.type === 'none') {
          results.push({
            name: folder.name,
            path: folder.path,
            vcsType: 'git',
            authors: [],
            error: 'not-vcs',
          })
          continue
        }

        if (detectResult.type === 'git') {
          const result = await getGitCommitActivity(folder.path, dateFrom, dateTo)
          if (result.status === 'success' && result.data) {
            const branch = result.branch ?? (await getCurrentBranch(folder.path))
            results.push({
              name: folder.name,
              path: folder.path,
              vcsType: 'git',
              authors: result.data,
              branch,
            })
          } else {
            results.push({
              name: folder.name,
              path: folder.path,
              vcsType: 'git',
              authors: [],
              error: result.message || 'Git error',
            })
          }
        } else if (detectResult.type === 'svn') {
          const [result, currentRevision] = await Promise.all([getSvnCommitActivity(folder.path, dateFrom, dateTo), getCurrentRevision(folder.path)])
          if (result.status === 'success' && result.data) {
            results.push({
              name: folder.name,
              path: folder.path,
              vcsType: 'svn',
              authors: result.data,
              currentRevision,
            })
          } else {
            results.push({
              name: folder.name,
              path: folder.path,
              vcsType: 'svn',
              authors: [],
              error: result.message || 'SVN error',
            })
          }
        }
      } catch (error) {
        l.error(`Error getting commit activity for ${folder.name}:`, error)
        results.push({
          name: folder.name,
          path: folder.path,
          vcsType,
          authors: [],
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return results
  })

  ipcMain.handle(IPC.DASHBOARD.GET_CHART_DATA, async (_event, options?: { dateFrom?: string; dateTo?: string; path?: string }): Promise<StatisticsResponse> => {
    const sourceFolders = sourceFolderStore.get('sourceFolders') || []
    const dateFrom = options?.dateFrom
    const dateTo = options?.dateTo
    const filterPath = options?.path
    const hasDateRange = Boolean(dateFrom && dateTo)

    const foldersToProcess = filterPath ? sourceFolders.filter(f => f.path === filterPath) : sourceFolders

    const commitsByDateMap = new Map<string, Map<string, number>>()
    const commitsByAuthorMap = new Map<string, number>()
    const commitsByHourArr = Array.from({ length: 24 }, () => 0)
    let totalCommits = 0

    for (const folder of foldersToProcess) {
      try {
        const detectResult = await detectVersionControl(folder.path)
        if (!detectResult.isValid || detectResult.type === 'none') continue

        const statsOpts = hasDateRange && dateFrom && dateTo ? { cwd: folder.path, dateFrom, dateTo } : { cwd: folder.path, period: 'all' as const }

        const stats = detectResult.type === 'git' ? await getGitStatistics('.', statsOpts) : await getSvnStatistics('.', statsOpts)

        if (stats.status !== 'success' || !stats.data) continue

        for (const day of stats.data.commitsByDate || []) {
          let dayMap = commitsByDateMap.get(day.date)
          if (!dayMap) {
            dayMap = new Map()
            commitsByDateMap.set(day.date, dayMap)
          }
          for (const { author, count } of day.authors) {
            dayMap.set(author, (dayMap.get(author) || 0) + count)
          }
        }

        for (const { author, count } of stats.data.commitsByAuthor || []) {
          commitsByAuthorMap.set(author, (commitsByAuthorMap.get(author) || 0) + count)
        }

        for (const { hour, count } of stats.data.commitsByHour || []) {
          commitsByHourArr[hour] = (commitsByHourArr[hour] || 0) + count
        }

        totalCommits += stats.data.totalCommits || 0
      } catch (error) {
        l.warn(`Error getting chart data for ${folder.name}:`, error)
      }
    }

    const commitsByDate = Array.from(commitsByDateMap.entries())
      .map(([date, authorsMap]) => ({
        date,
        authors: Array.from(authorsMap.entries()).map(([author, count]) => ({ author, count })),
        totalCount: Array.from(authorsMap.values()).reduce((s, c) => s + c, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const commitsByAuthor = Array.from(commitsByAuthorMap.entries())
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count)

    const authorship = commitsByAuthor.map(({ author, count }) => ({
      author,
      count,
      percentage: totalCommits > 0 ? Math.round((count / totalCommits) * 100) : 0,
    }))

    const summary = authorship
    const commitsByHour = commitsByHourArr.map((count, hour) => ({ hour, count }))

    return {
      commitsByDate,
      commitsByAuthor,
      authorship,
      summary,
      totalCommits,
      commitsByHour,
    }
  })

  l.info('✅ Dashboard IPC Handlers Registered')
}
