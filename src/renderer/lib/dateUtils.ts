import { format } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'

/** @deprecated Dùng getDateOnlyPattern(i18n.language) */
export const DATE_DISPLAY_FORMAT = 'dd/MM/yyyy'

export function getDateFnsLocale(language: string) {
  switch (language) {
    case 'ja':
      return ja
    case 'vi':
      return vi
    case 'en':
      return enUS
    default:
      return enUS
  }
}

/** en, vi: dd/MM/yyyy | ja: yyyy/MM/dd */
export function getDateOnlyPattern(language: string): string {
  return language.startsWith('ja') ? 'yyyy/MM/dd' : 'dd/MM/yyyy'
}

/** Khi không hiển thị năm: ja → MM/dd; en/vi → dd/MM */
export function getMonthDayOnlyPattern(language: string): string {
  return language.startsWith('ja') ? 'MM/dd' : 'dd/MM'
}

export function getDateTimeDisplayPattern(language: string): string {
  return `${getDateOnlyPattern(language)} HH:mm`
}

export function getDateTimeWithSecondsDisplayPattern(language: string): string {
  return `${getDateOnlyPattern(language)} HH:mm:ss`
}

/**
 * Parse YYYY-MM-DD string as local date (no timezone shift).
 * new Date("2025-03-15") = UTC midnight → có thể hiển thị sai ngày ở múi giờ âm.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Convert date string/Date to YYYY-MM-DD (local, no timezone shift). */
export function toYyyyMmDd(dateStr: string | Date | null | undefined): string | undefined {
  if (!dateStr) return undefined
  const d =
    typeof dateStr === 'string'
      ? /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? parseLocalDate(dateStr)
        : new Date(dateStr)
      : dateStr
  if (!d || Number.isNaN(d.getTime())) return undefined
  return format(d, 'yyyy-MM-dd')
}

/**
 * Format date for achievement/First earned display.
 * en, vi: dd/MM/yyyy HH:mm:ss | ja: yyyy/MM/dd HH:mm:ss
 */
export function formatDateByLocale(dateStr: string | Date | null | undefined, language: string): string {
  if (!dateStr) return ''
  try {
    const d =
      typeof dateStr === 'string'
        ? /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
          ? parseLocalDate(dateStr)
          : new Date(dateStr)
        : dateStr
    if (!d || Number.isNaN(d.getTime())) return ''
    const datePart = format(d, getDateOnlyPattern(language))
    const timePart = format(d, 'HH:mm:ss')
    return `${datePart} ${timePart}`
  } catch {
    return ''
  }
}

/** Format ngày cho UI theo ngôn ngữ. Trả '-' nếu rỗng/không hợp lệ. */
export function formatDateDisplay(dateStr: string | Date | null | undefined, language: string): string {
  if (!dateStr) return '-'
  try {
    const d =
      typeof dateStr === 'string'
        ? /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
          ? parseLocalDate(dateStr)
          : new Date(dateStr)
        : dateStr
    if (!d || Number.isNaN(d.getTime())) return '-'
    return format(d, getDateOnlyPattern(language))
  } catch {
    return '-'
  }
}

/** Chuỗi nhãn kỳ cho bảng chuỗi EVM (đồng bộ với nhóm Ngày / Tháng / Quý). */
export type EvmSeriesPeriodGranularity = 'day' | 'month' | 'quarter'

export function formatEvmTimeSeriesPeriodCell(
  dateStr: string,
  granularity: EvmSeriesPeriodGranularity,
  language: string
): string {
  if (granularity === 'day') return formatDateDisplay(dateStr, language)
  const d = parseLocalDate(dateStr)
  if (!d) return '-'
  const locale = getDateFnsLocale(language)
  if (granularity === 'month') {
    if (language.startsWith('ja')) return format(d, 'yyyy年M月', { locale })
    if (language.startsWith('vi')) return format(d, 'MM/yyyy')
    return format(d, 'MMM yyyy', { locale })
  }
  const y = d.getFullYear()
  const q = Math.floor(d.getMonth() / 3) + 1
  if (language.startsWith('ja')) return `${y}年Q${q}`
  if (language.startsWith('vi')) return `Quý ${q}/${y}`
  return `Q${q} ${y}`
}
