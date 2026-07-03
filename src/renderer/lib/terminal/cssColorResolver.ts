let resolverCanvas: HTMLCanvasElement | null = null

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

function normalizeHex6(color: string): string {
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const h = trimmed.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return trimmed
}

/** Resolve any CSS color (oklch, hsl, var, etc.) to #rrggbb for Monaco/xterm. */
export function resolveCssColorToHex(cssColor: string, fallback: string): string {
  const fallbackHex = normalizeHex6(fallback)
  const trimmed = cssColor.trim()
  if (!trimmed) return fallbackHex
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return normalizeHex6(trimmed)

  if (typeof document === 'undefined') return fallbackHex

  if (!resolverCanvas) {
    resolverCanvas = document.createElement('canvas')
    resolverCanvas.width = 1
    resolverCanvas.height = 1
  }
  const ctx = resolverCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallbackHex

  try {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000000'
    ctx.fillStyle = trimmed
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
  } catch {
    return fallbackHex
  }
}

/** #rrggbb + alpha byte (0–255) → #rrggbbaa */
export function resolveCssColorToHexWithAlpha(cssColor: string, fallback: string, alphaByte: number): string {
  const hex = resolveCssColorToHex(cssColor, fallback)
  return `${hex}${toHexByte(alphaByte)}`
}

/** @deprecated alias — use resolveCssColorToHex */
export function resolveCssColorForXterm(cssColor: string, fallback: string): string {
  return resolveCssColorToHex(cssColor, fallback)
}

export function readCssVarAsXtermColor(varName: string, fallback: string, root: Element = document.documentElement): string {
  if (typeof document === 'undefined') return normalizeHex6(fallback)
  const raw = getComputedStyle(root).getPropertyValue(varName).trim()
  if (!raw) return normalizeHex6(fallback)
  return resolveCssColorToHex(raw, fallback)
}

export function readCssVarAsHexColor(varName: string, fallback: string, root?: Element): string {
  return readCssVarAsXtermColor(varName, fallback, root)
}
