import { author as _author, name } from '~/package.json'

const author = _author.name ?? _author
const authorInKebabCase = author.replace(/\s+/g, '-')
const appId = `com.${authorInKebabCase}.${name}`.toLowerCase()

/**
 * @param {string} id
 * @description Create the app id using the name and author from package.json transformed to kebab case if the id is not provided.
 * @default 'com.{author}.{app}' - the author and app comes from package.json
 * @example
 * makeAppId('com.example.app')
 * // => 'com.example.app'
 */
export function makeAppId(id: string = appId): string {
  return id
}

/**
 * Ngày hiển thị: en/vi → dd/MM/yyyy, ja → yyyy/MM/dd (mã ngôn ngữ i18n: en, vi, ja).
 */
export function formatDate(date: Date | string, language: string): string {
  const dateObj = new Date(date)
  if (Number.isNaN(dateObj.getTime())) return ''
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  if (language.startsWith('ja')) {
    return `${y}/${m}/${d}`
  }
  return `${d}/${m}/${y}`
}

/**
 * Giờ 24h cố định HH:mm:ss (không phụ thuộc locale).
 */
export function formatTime(date: Date | string, _language?: string): string {
  const dateObj = new Date(date)
  if (Number.isNaN(dateObj.getTime())) return ''
  const h = String(dateObj.getHours()).padStart(2, '0')
  const min = String(dateObj.getMinutes()).padStart(2, '0')
  const s = String(dateObj.getSeconds()).padStart(2, '0')
  return `${h}:${min}:${s}`
}

/**
 * Ngày giờ hiển thị theo cùng quy tắc formatDate + HH:mm:ss.
 */
export function formatDateTime(date: Date | string, language: string): string {
  const dateObj = new Date(date)
  if (Number.isNaN(dateObj.getTime())) return ''
  return `${formatDate(dateObj, language)} ${formatTime(dateObj, language)}`
}
