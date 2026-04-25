import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { format, subDays, subMonths, subWeeks, subYears } from 'date-fns'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'

const execPromise = promisify(exec)

const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000

function toUTC7(date: Date) {
  const utc7 = new Date(date.getTime() + UTC7_OFFSET_MS)
  return {
    dateKey: `${utc7.getUTCFullYear()}-${String(utc7.getUTCMonth() + 1).padStart(2, '0')}-${String(utc7.getUTCDate()).padStart(2, '0')}`,
    hour: utc7.getUTCHours(),
  }
}

export interface StatisticsOptions {
  period?: 'day' | 'week' | 'month' | 'year' | 'all'
  dateFrom?: string
  dateTo?: string
  /** Working directory for git commands. If not set, uses configurationStore.sourceFolder */
  cwd?: string
}

// Chi tiết commit của một tác giả trong một ngày cụ thể
interface CommitAuthorDetail {
  author: string
  count: number
}

// Dữ liệu commit được nhóm theo ngày, bao gồm chi tiết theo tác giả
interface CommitByDateGrouped {
  date: string
  authors: CommitAuthorDetail[]
  totalCount: number // Tổng số commit trong ngày
}

interface CommitByAuthor {
  author: string
  count: number
}

interface AuthorshipData {
  author: string
  percentage: number
  count: number
}

interface SummaryData {
  author: string
  count: number
  percentage: number
}

export interface StatisticsResponse {
  commitsByDate: CommitByDateGrouped[]
  commitsByAuthor: CommitByAuthor[]
  authorship: AuthorshipData[]
  summary: SummaryData[]
  totalCommits: number
  commitsByHour?: { hour: number; count: number }[]
}

interface GitResponse {
  status: 'success' | 'error'
  message?: string
  data?: StatisticsResponse
}

export async function getStatistics(filePath = '.', options?: StatisticsOptions): Promise<GitResponse> {
  try {
    const { sourceFolder } = configurationStore.store
    const { period = 'all', dateFrom, dateTo, cwd } = options || {}
    const workingDir = cwd || sourceFolder
    l.info(`Fetching Git statistics for file: ${filePath} with period: ${period}, dateFrom: ${dateFrom}, dateTo: ${dateTo}`)

    // Xây dựng lệnh git log
    // Format: %H (hash), %an (author name), %aI (author date ISO), %s (subject)
    let command = `git log --all --pretty=format:"%H|%an|%aI|%s"`

    // Thêm tham số date range dựa trên period hoặc dateFrom/dateTo
    if (dateFrom && dateTo) {
      command += ` --since="${dateFrom}" --until="${dateTo}"`
    } else if (period !== 'all') {
      const today = new Date()
      let fromDate: Date | undefined

      switch (period) {
        case 'day':
          fromDate = subDays(today, 1)
          break
        case 'week':
          fromDate = subWeeks(today, 1)
          break
        case 'month':
          fromDate = subMonths(today, 1)
          break
        case 'year':
          fromDate = subYears(today, 1)
          break
      }

      if (fromDate) {
        const fromDateStr = format(fromDate, 'yyyy-MM-dd')
        const toDateStr = format(today, 'yyyy-MM-dd')
        command += ` --since="${fromDateStr}" --until="${toDateStr}"`
      }
    }

    // Thêm file path filter nếu không phải '.'
    if (filePath !== '.') {
      command += ` -- "${filePath}"`
    }

    l.info(`Executing git statistics command: ${command}`)

    // Thực thi lệnh Git
    const { stdout, stderr } = await execPromise(command, { cwd: workingDir })

    if (stderr && !stderr.includes('warning')) {
      l.warn(`Git statistics stderr: ${stderr}`)
    }

    if (!stdout || stdout.trim() === '') {
      l.info('No commits found for the specified criteria')
      const emptyByHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
      return {
        status: 'success',
        data: {
          commitsByDate: [],
          commitsByAuthor: [],
          authorship: [],
          summary: [],
          totalCommits: 0,
          commitsByHour: emptyByHour,
        },
      }
    }

    // Phân tích kết quả
    const lines = stdout.trim().split('\n')

    // Khởi tạo các đối tượng để lưu trữ thống kê
    const commitsByDate: Record<string, Record<string, number>> = {}
    const commitsByAuthor: Record<string, number> = {}
    const commitsByHour: number[] = Array.from({ length: 24 }, () => 0)
    let totalCommits = 0

    // Phân tích từng dòng
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 4) {
        l.warn(`Skipping invalid line: ${line}`)
        continue
      }

      const [_hash, author, dateStr, _subject] = parts

      try {
        const date = new Date(dateStr)
        if (Number.isNaN(date.getTime())) {
          l.warn(`Invalid date: ${dateStr}`)
          continue
        }

        totalCommits++
        const { dateKey, hour } = toUTC7(date)

        // Thống kê theo ngày và tác giả
        if (!commitsByDate[dateKey]) {
          commitsByDate[dateKey] = {}
        }
        commitsByDate[dateKey][author] = (commitsByDate[dateKey][author] || 0) + 1

        // Thống kê tổng số commit theo tác giả
        commitsByAuthor[author] = (commitsByAuthor[author] || 0) + 1

        // Thống kê theo giờ
        commitsByHour[hour] = (commitsByHour[hour] || 0) + 1
      } catch (e) {
        l.error(`Error parsing commit: ${line}`, e)
      }
    }

    // Chuyển đổi dữ liệu commitsByDate thành mảng theo cấu trúc mới
    const commitsByDateArray: CommitByDateGrouped[] = Object.entries(commitsByDate)
      .map(([date, authorsData]) => {
        const authorsArray: CommitAuthorDetail[] = Object.entries(authorsData)
          .map(([author, count]) => ({ author, count }))
          .sort((a, b) => b.count - a.count) // Sắp xếp tác giả theo số commit giảm dần trong ngày

        const totalCount = authorsArray.reduce((sum, author) => sum + author.count, 0)

        return {
          date,
          authors: authorsArray,
          totalCount,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date)) // Sắp xếp các ngày tăng dần

    // Chuyển đổi dữ liệu commitsByAuthor thành mảng
    const commitsByAuthorArray = Object.entries(commitsByAuthor)
      .map(([author, count]) => ({
        author,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    // Tính toán tỷ lệ đóng góp của tác giả
    const authorshipArray = commitsByAuthorArray.map(({ author, count }) => ({
      author,
      count,
      percentage: Math.round((count / totalCommits) * 100),
    }))

    // Tạo dữ liệu tổng hợp
    const summaryArray = authorshipArray.slice()

    l.info(`Git statistics completed: ${totalCommits} commits from ${commitsByAuthorArray.length} authors`)

    const commitsByHourArray = commitsByHour.map((count, hour) => ({ hour, count }))

    // Trả về kết quả
    return {
      status: 'success',
      data: {
        commitsByDate: commitsByDateArray,
        commitsByAuthor: commitsByAuthorArray,
        authorship: authorshipArray,
        summary: summaryArray,
        totalCommits,
        commitsByHour: commitsByHourArray,
      },
    }
  } catch (error) {
    l.error('Error in getStatistics:', error)
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
