import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { format, subDays, subMonths, subWeeks, subYears } from 'date-fns'
import l from 'electron-log'
import type { SVNResponse } from 'main/types/types'
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
  /** Working directory for svn commands. If not set, uses configurationStore.sourceFolder */
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

export async function getStatistics(filePath = '.', options?: StatisticsOptions): Promise<SVNResponse> {
  try {
    const { sourceFolder } = configurationStore.store
    const { period = 'all', dateFrom, dateTo, cwd } = options || {}
    const workingDir = cwd || sourceFolder
    l.info(`Fetching SVN statistics for file: ${filePath} with period: ${period}, dateFrom: ${dateFrom}, dateTo: ${dateTo}`)
    // Xây dựng lệnh cơ bản
    let command = `svn log "${filePath}"`

    // Thêm tham số date range dựa trên period hoặc dateFrom/dateTo
    if (dateFrom && dateTo) {
      command += ` --revision "{${dateFrom}}:{${dateTo}}"`
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
        command += ` --revision "{${fromDateStr}}:{${toDateStr}}"`
      }
    }

    // Thực thi lệnh SVN
    const { stdout, stderr } = await execPromise(command, { cwd: workingDir })
    if (stderr) return { status: 'error', message: stderr }

    // Phân tích kết quả
    const entries = stdout
      .split('------------------------------------------------------------------------')
      .map(entry => entry.trim())
      .filter(entry => entry)

    // Khởi tạo các đối tượng để lưu trữ thống kê
    // commitsByDate: Ghi lại số commit của mỗi tác giả theo từng ngày
    // Ví dụ: { '2023-10-26': { 'author1': 5, 'author2': 3 }, '2023-10-27': { 'author1': 2 } }
    const commitsByDate: Record<string, Record<string, number>> = {}
    const commitsByAuthor: Record<string, number> = {} // Tổng số commit của mỗi tác giả
    const commitsByHour: number[] = Array.from({ length: 24 }, () => 0)
    let totalCommits = 0 // Tổng số commit sẽ được tính lại chính xác hơn

    // Phân tích từng entry
    for (const entry of entries) {
      const lines = entry.split('\n').map(line => line.trim())
      // Dòng header chứa thông tin revision, author, date
      // Ví dụ: r12345 | author_name | 2023-10-26 15:30:00 +0700 (Thu, 26 Oct 2023) | 1 line
      const headerMatch = lines[0]?.match(/^r\d+\s+\|\s+([^|]+?)\s+\|\s+([^|]+?)\s+\|/)

      if (headerMatch) {
        totalCommits++ // Tăng tổng số commit nếu parse được header
        const [, author, dateStr] = headerMatch
        // Cần parse date cẩn thận hơn, có thể bao gồm timezone
        // Thử parse với các định dạng phổ biến mà SVN log có thể trả về
        let date: Date | null = null
        try {
          // Thử parse định dạng chuẩn ISO có timezone offset
          date = new Date(dateStr.replace(' (', 'T').replace(')', '').replace(' ', ''))
          if (Number.isNaN(date.getTime())) {
            // Thử parse định dạng không có timezone (ít phổ biến hơn)
            date = new Date(dateStr.split('(')[0].trim())
          }
        } catch (e) {
          l.error(`Could not parse date string: ${dateStr}`, e)
          date = null // Không parse được date
        }

        if (date && !Number.isNaN(date.getTime())) {
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
        } else {
          l.warn(`Skipping entry due to invalid date: ${dateStr}`)
        }
      } else {
        l.warn(`Skipping entry due to invalid header format: ${lines[0]}`)
      }
    }

    // Kiểm tra lại totalCommits nếu không parse được header nào
    if (totalCommits === 0 && entries.length > 0) {
      l.warn('Parsed 0 commits, but found log entries. Check SVN log format or parsing logic.')
      // Có thể gán totalCommits = entries.length nếu muốn ước lượng, nhưng không chính xác
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
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
