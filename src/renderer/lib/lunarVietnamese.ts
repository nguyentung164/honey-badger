import { Solar } from 'lunar-javascript'

/**
 * Compact âm lịch (Việt Nam): ngày/tháng theo hệ âm dương lịch Trung–Việt.
 * Tháng âm nhuận: hậu tố "n" (ví dụ 15/3n).
 */
export function formatVietnameseLunarCompact(date: Date): string {
  const lunar = Solar.fromDate(date).getLunar()
  const day = lunar.getDay()
  const month = lunar.getMonth()
  const absMonth = Math.abs(month)
  const isLeap = month < 0
  return `${day}/${absMonth}${isLeap ? 'n' : ''}`
}
