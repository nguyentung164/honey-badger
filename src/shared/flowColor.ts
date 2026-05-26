/** Parsed CSS color for flow inspector / diagram chrome. */
export type ParsedFlowColor = { r: number; g: number; b: number; a: number }

const FALLBACK: ParsedFlowColor = { r: 148, g: 163, b: 184, a: 1 }

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function clampAlpha(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function toHexByte(n: number): string {
  return clampByte(n).toString(16).padStart(2, '0')
}

function expandHex3(hex: string): string | null {
  const m = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex.trim())
  if (!m) return null
  return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
}

/** Parse hex / rgb(a) strings used in flow style JSON. */
export function parseFlowColor(value: string | undefined | null): ParsedFlowColor {
  if (value == null) return { ...FALLBACK }
  const trimmed = value.trim()
  if (!trimmed) return { ...FALLBACK }

  if (trimmed.startsWith('#')) {
    const hex8 = /^#([a-f\d]{8})$/i.exec(trimmed)
    if (hex8) {
      const h = hex8[1]
      return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
        a: clampAlpha(Number.parseInt(h.slice(6, 8), 16) / 255),
      }
    }
    const hex6 = /^#([a-f\d]{6})$/i.exec(trimmed)
    if (hex6) {
      const h = hex6[1]
      return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
        a: 1,
      }
    }
    const short = expandHex3(trimmed)
    if (short) {
      return parseFlowColor(`#${short}`)
    }
  }

  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(trimmed)
  if (rgba) {
    return {
      r: clampByte(Number.parseInt(rgba[1], 10)),
      g: clampByte(Number.parseInt(rgba[2], 10)),
      b: clampByte(Number.parseInt(rgba[3], 10)),
      a: clampAlpha(rgba[4] != null ? Number.parseFloat(rgba[4]) : 1),
    }
  }

  return { ...FALLBACK }
}

function roundAlpha(a: number): number {
  return Math.round(clampAlpha(a) * 1000) / 1000
}

/** Canonical stored CSS color — `#rrggbb` when opaque, `rgba(...)` when translucent. */
export function formatFlowColor(color: ParsedFlowColor): string {
  if (color.a >= 0.999) return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`
  return `rgba(${clampByte(color.r)}, ${clampByte(color.g)}, ${clampByte(color.b)}, ${roundAlpha(color.a)})`
}

/** Normalize picker output while preserving alpha. */
export function normalizeFlowPickerColor(value: string): string {
  return formatFlowColor(parseFlowColor(value))
}

/** Safe CSS color string for rendering (falls back when empty). */
export function flowColorCss(value: string | undefined | null, fallback = '#94a3b8'): string {
  if (value == null || !value.trim()) return fallback
  return formatFlowColor(parseFlowColor(value))
}

export function flowColorHasAlpha(value: string | undefined | null): boolean {
  if (!value?.trim()) return false
  return parseFlowColor(value).a < 0.999
}

/** Compare colors for gradient preset matching (includes alpha). */
export function flowColorsMatch(a: string, b: string): boolean {
  const pa = parseFlowColor(a)
  const pb = parseFlowColor(b)
  return pa.r === pb.r && pa.g === pb.g && pa.b === pb.b && roundAlpha(pa.a) === roundAlpha(pb.a)
}
