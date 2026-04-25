import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns a color for progress ratio (0-1).
 * 0 = red/orange, 0.5 = amber, 1 = green.
 * Reference: Dashboard.tsx
 */
export function getProgressColor(ratio: number): string {
  if (ratio >= 1) return 'rgb(22, 163, 74)'
  if (ratio <= 0) return 'rgb(194, 65, 12)'
  const stops: [number, [number, number, number]][] = [
    [0, [194, 65, 12]],
    [0.25, [234, 88, 12]],
    [0.5, [202, 138, 4]],
    [0.75, [101, 163, 13]],
    [1, [22, 163, 74]],
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [r1, c1] = stops[i]
    const [r2, c2] = stops[i + 1]
    if (ratio <= r2) {
      const k = (ratio - r1) / (r2 - r1)
      const r = Math.round(c1[0] + k * (c2[0] - c1[0]))
      const g = Math.round(c1[1] + k * (c2[1] - c1[1]))
      const b = Math.round(c1[2] + k * (c2[2] - c1[2]))
      return `rgb(${r}, ${g}, ${b})`
    }
  }
  return 'rgb(22, 163, 74)'
}

/** Chuyển hex sang rgba với alpha (0-255). Hỗ trợ #rgb và #rrggbb */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace(/^#/, '')
  if (h.length !== 3 && h.length !== 6) return hex
  const r = h.length === 3 ? parseInt(h[0] + h[0], 16) : parseInt(h.slice(0, 2), 16)
  const g = h.length === 3 ? parseInt(h[1] + h[1], 16) : parseInt(h.slice(2, 4), 16)
  const b = h.length === 3 ? parseInt(h[2] + h[2], 16) : parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`
}

/**
 * Chuẩn hóa path để so sánh (tránh lỗi C:/ vs C:\, trailing slash, case trên Windows).
 */
export function normalizePathForCompare(p: string): string {
  if (!p || typeof p !== 'string') return ''
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '').trim()
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    return normalized.toLowerCase()
  }
  return normalized
}

/** Trả về màu chữ tương phản với nền hex (trắng hoặc đen) dựa trên luminance */
export function getContrastingColor(hex: string): string {
  const h = hex.replace(/^#/, '')
  if (h.length !== 3 && h.length !== 6) return '#000'
  const r = h.length === 3 ? parseInt(h[0] + h[0], 16) : parseInt(h.slice(0, 2), 16)
  const g = h.length === 3 ? parseInt(h[1] + h[1], 16) : parseInt(h.slice(2, 4), 16)
  const b = h.length === 3 ? parseInt(h[2] + h[2], 16) : parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000' : '#fff'
}
