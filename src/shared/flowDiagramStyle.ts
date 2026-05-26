/**
 * Kiểu hiển thị cạnh / node dùng chung cho Page map (automation) và Dev Pipelines.
 * Lưu JSON qua DB (nav edge, catalog page) hoặc trong graph dev pipeline.
 */

import { flowColorCss, flowColorsMatch } from './flowColor'

export type FlowEdgeCurveKind = 'curved' | 'straight' | 'step'

export type FlowEdgeDashKind = 'solid' | 'dashed' | 'dotted'

/** Animation effect on the edge path. */
export type FlowEdgeAnimationKind =
  | 'none'
  | 'flow'
  | 'dot'
  | 'neon'
  | 'arcSparks'
  | 'shimmer'
  | 'shuttle'
  | 'serpent'
  | 'firefly'

/** Supported values + legacy keys migrated in {@link mergeConnectionStyle}. */
export const FLOW_EDGE_ANIMATION_KINDS: readonly FlowEdgeAnimationKind[] = [
  'none',
  'flow',
  'dot',
  'neon',
  'arcSparks',
  'shimmer',
  'shuttle',
  'serpent',
  'firefly',
] as const

/** Path animations shown in the edge inspector (excludes `none`). */
export const FLOW_EDGE_INSPECTOR_ANIMATIONS: readonly Exclude<FlowEdgeAnimationKind, 'none'>[] = [
  'flow',
  'dot',
  'neon',
  'arcSparks',
  'shimmer',
  'shuttle',
  'serpent',
  'firefly',
] as const

/** Stored JSON có thể còn giá trị đã gỡ — merge về hiệu ứng còn hỗ trợ. */
const LEGACY_FLOW_EDGE_ANIMATION: Record<string, FlowEdgeAnimationKind> = {
  /** trước đây map sang ribbon — ribbon đã bỏ */
  pulse: 'none',
  particles: 'flow',
  train: 'none',
  comet: 'none',
}

/** Kiểu đã retired (UI + renderer không còn) → none khi đọc JSON cũ. */
const RETIRED_FLOW_EDGE_ANIMATION = new Set<string>(['beam', 'ribbon', 'echo', 'stripe', 'diamonds', 'train', 'comet'])

export const FLOW_OPACITY_MIN = 0.1
export const FLOW_OPACITY_MAX = 1
export const FLOW_OPACITY_STEP = 0.1
export const FLOW_OPACITY_DEFAULT = 1

export function normalizeFlowOpacity(value: unknown): number {
  if (value === undefined || value === null) return FLOW_OPACITY_DEFAULT
  if (typeof value !== 'number' || !Number.isFinite(value)) return FLOW_OPACITY_DEFAULT
  const stepped = Math.round(value / FLOW_OPACITY_STEP) * FLOW_OPACITY_STEP
  const clamped = Math.min(FLOW_OPACITY_MAX, Math.max(FLOW_OPACITY_MIN, stepped))
  return Math.round(clamped * 10) / 10
}

function normalizeFlowEdgeAnimation(value: unknown): FlowEdgeAnimationKind {
  if (value === undefined || value === null) return FLOW_CONNECTION_STYLE_DEFAULT.animation
  if (typeof value !== 'string') return 'none'
  const legacy = LEGACY_FLOW_EDGE_ANIMATION[value]
  if (legacy != null) return legacy
  if (RETIRED_FLOW_EDGE_ANIMATION.has(value)) return 'none'
  if ((FLOW_EDGE_ANIMATION_KINDS as readonly string[]).includes(value)) return value as FlowEdgeAnimationKind
  return 'none'
}

/** Curve "smart" đã gỡ khỏi UI → coi như curved. */
function normalizeFlowEdgeCurve(value: unknown): FlowEdgeCurveKind {
  if (value === undefined || value === null) return FLOW_CONNECTION_STYLE_DEFAULT.curve
  if (value === 'smart') return 'curved'
  if (value === 'curved' || value === 'straight' || value === 'step') return value
  return FLOW_CONNECTION_STYLE_DEFAULT.curve
}

/** Cùng thang độ rộng cho edge stroke và node border (preset cố định). 0 chỉ dùng cho node border (không viền). */
export const FLOW_STROKE_WIDTH_PRESETS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5] as const

export type FlowStrokeWidthPreset = (typeof FLOW_STROKE_WIDTH_PRESETS)[number]

const FLOW_STROKE_WIDTH_SET = new Set<number>(FLOW_STROKE_WIDTH_PRESETS)

/** Giá trị cũ (0.5…2.5 step 0.5) → preset mới khi đọc JSON/DB. */
const LEGACY_FLOW_STROKE_WIDTH = new Map<number, FlowStrokeWidthPreset>([
  [0.5, 0.5],
  [1, 1],
  [1.5, 1.5],
  [2, 1.5],
  [2.5, 1.5],
])

/**
 * CSS px thickness for node border orbit animations from the border-width preset.
 * None (0) → 0.25px; each +0.25 preset step adds +0.25 to the animation; Auto (undefined) → 0.75px.
 */
export function nodeOrbitBorderPxFromWidth(borderWidth: FlowStrokeWidthPreset | undefined): number {
  const base = borderWidth === undefined ? 0.5 : borderWidth
  return base + 0.25
}

/** CSS px for a static node card border ring (orbit / gradient rim draw their own edge). */
export function nodeStaticBorderWidthPx(borderWidth: FlowStrokeWidthPreset | undefined, hasAccent: boolean): number {
  if (borderWidth === 0) return 0
  if (borderWidth !== undefined) return borderWidth
  return hasAccent ? 0.5 : 1
}

export function normalizeFlowStrokeWidth(value: unknown, fallback: FlowStrokeWidthPreset): FlowStrokeWidthPreset {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (FLOW_STROKE_WIDTH_SET.has(value)) return value as FlowStrokeWidthPreset
  const legacy = LEGACY_FLOW_STROKE_WIDTH.get(value)
  if (legacy != null) return legacy
  let best: FlowStrokeWidthPreset = fallback
  let bestDist = Infinity
  for (const p of FLOW_STROKE_WIDTH_PRESETS) {
    const d = Math.abs(p - value)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

export function normalizeNodeBorderWidth(value: unknown): FlowNodeVisualStyle['borderWidth'] | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (FLOW_STROKE_WIDTH_SET.has(value)) return value as FlowStrokeWidthPreset
  const legacy = LEGACY_FLOW_STROKE_WIDTH.get(value)
  if (legacy != null) return legacy
  let best: FlowStrokeWidthPreset | undefined
  let bestDist = 0.124
  for (const p of FLOW_STROKE_WIDTH_PRESETS) {
    const d = Math.abs(p - value)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

/** Animation effect on a node card — a lit streak orbiting the node border. */
export type FlowNodeAnimationKind =
  | 'none'
  /** Thin single streak, slow. */
  | 'glow'
  /** Wide ribbon, medium speed. */
  | 'pulse'
  /** Two short streaks, opposite sides, slow. */
  | 'bounce'
  /** Comet: bright head + dim trailing tail. */
  | 'beam'
  /** Two beams starting together and going opposite directions. */
  | 'doubleBeam'
  /** 7 evenly-spaced glowing dots running together (marquee / chaser lights). */
  | 'dots'
  /** Narrow spotlight traveling around the border (corner beam). */
  | 'borderBeam'
  /** Slow dual-layer mesh / aurora using accent gradient. */
  | 'aurora'
  /** Wide sheen sweeping over a dim full border. */
  | 'shimmer'
  /** Tiny single dot, very slow — like a radar sweep. */
  | 'radar'
  /** 6 evenly-spaced short dashes spinning. */
  | 'dashed'
  /** Full border breathes (opacity + width pulse). */
  | 'neon'
  /** Long–short–long Morse signal pattern. */
  | 'morse'
  /** Staggered twinkling sparks on the border. */
  | 'sparkle'
  /** Animated L-brackets at the four corners (focus frame). */
  | 'focusBrackets'
  /** Frosted full ring with a slow subtle sheen (glass edge). */
  | 'glassRim'

/** Font family keys for edge label chrome (same values as page-map notes). */
export type FlowLabelFontFamily = 'system' | 'serif' | 'mono' | 'rounded'

export const FLOW_LABEL_FONT_FAMILIES: readonly FlowLabelFontFamily[] = ['system', 'serif', 'mono', 'rounded'] as const

export const FLOW_LABEL_FONT_SIZES = [8, 10, 11, 12, 14, 16] as const

export type FlowConnectionLabelStyle = {
  backgroundColor?: string
  borderColor?: string
  /** When set (≥2 stops), label bg + border chrome share this accent gradient. */
  labelAccentGradient?: GradientStop[]
  borderWidth?: FlowStrokeWidthPreset
  borderAnimation?: FlowNodeAnimationKind
  borderAnimationSpeed?: number
  fontSize?: number
  fontFamily?: FlowLabelFontFamily
  color?: string
}

export const FLOW_CONNECTION_LABEL_STYLE_DEFAULT: Required<
  Pick<FlowConnectionLabelStyle, 'backgroundColor' | 'borderColor' | 'fontSize' | 'fontFamily' | 'color'>
> &
  FlowConnectionLabelStyle = {
  backgroundColor: '',
  borderColor: '',
  borderWidth: 0,
  borderAnimation: undefined,
  borderAnimationSpeed: undefined,
  fontSize: 8,
  fontFamily: 'system',
  color: '',
}

/** Default edge label text color (same as page-map annotations). */
export const FLOW_CONNECTION_LABEL_TEXT_COLOR_DEFAULT = '#ffffff'

function mergedConnectionLabelTextColor(partial: Partial<FlowConnectionLabelStyle>): string {
  const raw = partial.color
  if (raw == null || typeof raw !== 'string') return FLOW_CONNECTION_LABEL_TEXT_COLOR_DEFAULT
  const t = raw.trim()
  return t || FLOW_CONNECTION_LABEL_TEXT_COLOR_DEFAULT
}

/** Visual polish for React Flow connector handles (“magnets”). */
export type FlowNodeHandleStyleKind =
  /** Default muted circular joint. */
  | 'minimal-dot'
  /** Double-ring cue using accent color. */
  | 'accent-ring'
  /** Gentle outer glow tinted by accent — common “hover magnet” cue. */
  | 'accent-glow'

export const FLOW_NODE_HANDLE_STYLE_KINDS: readonly FlowNodeHandleStyleKind[] = ['minimal-dot', 'accent-ring', 'accent-glow'] as const

/** Removed from UI — old JSON maps to compact default magnet. */
const RETIRED_FLOW_NODE_HANDLE_STYLE = new Set<string>(['thin-outline', 'square-magnet'])

function normalizeFlowNodeHandleStyle(value: unknown): FlowNodeHandleStyleKind {
  if (typeof value !== 'string') return 'minimal-dot'
  if (RETIRED_FLOW_NODE_HANDLE_STYLE.has(value)) return 'minimal-dot'
  if ((FLOW_NODE_HANDLE_STYLE_KINDS as readonly string[]).includes(value)) return value as FlowNodeHandleStyleKind
  return 'minimal-dot'
}

/** Cạnh cardinals — map sang React Flow Position / handle id. */
export type FlowEdgeHandleSide = 'top' | 'right' | 'bottom' | 'left'

/** Đủ bốn phía — khớp id handle `s-*` / `t-*` trong FlowNodeMultiHandles. */
export const FLOW_NODE_HANDLE_SIDES_ALL: readonly FlowEdgeHandleSide[] = ['top', 'right', 'bottom', 'left']

/** Hai cạnh (đỉnh + đáy) — mặc định cho node mới; phù hợp edge bottom→top mặc định. */
export const FLOW_NODE_HANDLE_SIDES_TWO: readonly FlowEdgeHandleSide[] = ['top', 'bottom']

/** Hai cạnh (trái + phải) — phù hợp edge nối ngang. */
export const FLOW_NODE_HANDLE_SIDES_LR: readonly FlowEdgeHandleSide[] = ['left', 'right']

/** Cấu hình số cạnh có handle trên node / khung group. */
export const FLOW_NODE_HANDLE_SIDES_MODES = [
  'two-vertical',
  'two-horizontal',
  'four',
  'one-top',
  'one-bottom',
  'one-left',
  'one-right',
] as const

export type FlowNodeHandleSidesMode = (typeof FLOW_NODE_HANDLE_SIDES_MODES)[number]

const FLOW_NODE_HANDLE_SIDES_MODE_SET = new Set<string>(FLOW_NODE_HANDLE_SIDES_MODES)

export function isFlowNodeHandleSidesMode(value: unknown): value is FlowNodeHandleSidesMode {
  return typeof value === 'string' && FLOW_NODE_HANDLE_SIDES_MODE_SET.has(value)
}

export function resolveHandleSidesMode(style: Pick<FlowNodeVisualStyle, 'handleSideCount' | 'handleSidesMode'>): FlowNodeHandleSidesMode {
  if (isFlowNodeHandleSidesMode(style.handleSidesMode)) return style.handleSidesMode
  if (style.handleSideCount === 4) return 'four'
  return 'two-vertical'
}

/** Sides to render for a merged node style — matches inspector preview. */
export function resolvedHandleSidesFromMerged(style: Pick<FlowNodeVisualStyle, 'handleSideCount' | 'handleSidesMode'>): FlowEdgeHandleSide[] {
  switch (resolveHandleSidesMode(style)) {
    case 'four':
      return [...FLOW_NODE_HANDLE_SIDES_ALL]
    case 'two-horizontal':
      return [...FLOW_NODE_HANDLE_SIDES_LR]
    case 'one-top':
      return ['top']
    case 'one-bottom':
      return ['bottom']
    case 'one-left':
      return ['left']
    case 'one-right':
      return ['right']
    default:
      return [...FLOW_NODE_HANDLE_SIDES_TWO]
  }
}

export function handleSideCountForSidesMode(mode: FlowNodeHandleSidesMode): 2 | 4 {
  return mode === 'four' ? 4 : 2
}

export interface FlowConnectionStyle {
  label: string
  labelVisible: boolean
  /** Visual chrome for the edge label pill on the map / preview. */
  labelStyle?: FlowConnectionLabelStyle
  curve: FlowEdgeCurveKind
  /** Hex, ví dụ #6b7280. Kept in sync with first stop of colorGradient when gradient is active. */
  color: string
  /**
   * Multi-stop gradient color. When set (≥ 2 stops), takes precedence over `color` for the edge stroke.
   * `color` is kept in sync with `stops[0].color` for backward compat and marker coloring.
   */
  colorGradient?: GradientStop[]
  dash: FlowEdgeDashKind
  width: FlowStrokeWidthPreset
  bidirectional: boolean
  sourceSide: FlowEdgeHandleSide
  targetSide: FlowEdgeHandleSide
  animation: FlowEdgeAnimationKind
  /** Nhân tốc độ animation cạnh (0.25 = chậm, 1 = mặc định, 4 = nhanh). */
  animationSpeed?: number
  /** Overall element opacity (0.1–1). Default 1. */
  opacity?: number
}

/**
 * One color stop in a multi-stop gradient accent.
 * `position` is 0–100 (percentage along the gradient bar).
 */
export interface GradientStop {
  color: string
  position: number
}

export interface FlowNodeVisualStyle {
  /** Màu nhấn (hex hoặc token preset) */
  accentColor: string
  /**
   * Multi-stop gradient accent. When set (≥ 2 stops), takes precedence over
   * `accentColor` for the node border and animations.
   * `accentColor` is kept in sync with `stops[0].color` for backward compat.
   */
  accentGradient?: GradientStop[]
  /** Khóa icon: Lucide icon name (e.g. 'Globe') hoặc data URL (e.g. 'data:image/png;base64,...') */
  iconKey?: string
  /** Override color for the node icon. When absent, the effective accent color is used. */
  iconColor?: string
  /**
   * Số cạnh có điểm nối (mỗi cạnh = source + target chồng nhau).
   * `2`: chỉ top + bottom hoặc left + right (xem `handleSidesMode`). `4`: đủ bốn phía.
   * Khi không có trong JSON đã lưu nhưng có field visual khác → vẫn 4 phía (tương thích map cũ).
   */
  handleSideCount?: 2 | 4
  /** Chi tiết 2 cạnh: dọc (trên/dưới) hoặc ngang (trái/phải). Ưu tiên hơn suy luận từ `handleSideCount`. */
  handleSidesMode?: FlowNodeHandleSidesMode
  /** Viền (px), cùng thang với độ rộng cạnh (`FlowConnectionStyle.width`). Thiếu → map chấm nhỏ như cũ. */
  borderWidth?: FlowStrokeWidthPreset
  /** Vệt sáng **chạy quanh mép** card (pseudo conic + mask vành); không dùng = tắt. */
  nodeAnimation?: FlowNodeAnimationKind
  /** Nhân tốc độ animation viền (0.25 = chậm, 1 = mặc định, 4 = nhanh). */
  nodeAnimationSpeed?: number
  /** Kiểu handle điểm nối (tròn, ring nhấn, halo, ô xoay…). */
  handleStyle?: FlowNodeHandleStyleKind
  /**
   * Khi `false`: ẩn handle nối nav trên node (dùng cho khung catalog group trên page map).
   * Mặc định / thiếu field → hiện handle.
   */
  showConnectionHandles?: boolean
  /** Overall element opacity (0.1–1). Default 1. */
  opacity?: number
  /** Content arrangement preset (icon/title/badge/metadata placement). */
  contentLayout?: import('./flowNodeContentLayout').FlowNodeContentLayoutKind
  /** Padding / font density for content layout. */
  contentDensity?: import('./flowNodeContentLayout').FlowNodeContentDensity
  /** When metadata rows are shown (catalog pages, pipeline details). */
  metadataMode?: import('./flowNodeContentLayout').FlowNodeContentMetadataMode
}

// ── Gradient accent helpers ───────────────────────────────────────────────

/**
 * Returns the effective gradient stops from a node style.
 * If `accentGradient` is set (≥2 stops), returns it.
 * Otherwise derives a 2-stop solid-color gradient from `accentColor`.
 */
export function effectiveAccentStops(style: Pick<FlowNodeVisualStyle, 'accentColor' | 'accentGradient'>): GradientStop[] {
  if (style.accentGradient && style.accentGradient.length >= 2) return style.accentGradient
  const c = style.accentColor || '#94a3b8'
  return [
    { color: c, position: 0 },
    { color: c, position: 100 },
  ]
}

/** Primary accent color — first stop of the gradient, or `accentColor`. */
export function effectiveAccentColor(style: Pick<FlowNodeVisualStyle, 'accentColor' | 'accentGradient'>): string {
  if (style.accentGradient && style.accentGradient.length > 0) return style.accentGradient[0].color
  return style.accentColor || '#94a3b8'
}

/** Effective accent stops for edge label chrome (gradient mode or derived from solid colors). */
export function effectiveLabelAccentStops(
  ls: Pick<FlowConnectionLabelStyle, 'backgroundColor' | 'borderColor' | 'labelAccentGradient'>,
): GradientStop[] {
  if (ls.labelAccentGradient && ls.labelAccentGradient.length >= 2) return ls.labelAccentGradient
  const bg = ls.backgroundColor?.trim() || '#ffffff'
  const border = ls.borderColor?.trim() || '#94a3b8'
  return [
    { color: bg, position: 0 },
    { color: border, position: 100 },
  ]
}

/** Primary label accent color — first stop of the gradient, or background/border fallback. */
export function effectiveLabelAccentColor(
  ls: Pick<FlowConnectionLabelStyle, 'backgroundColor' | 'borderColor' | 'labelAccentGradient'>,
): string {
  return effectiveLabelAccentStops(ls)[0]?.color ?? '#94a3b8'
}

/** True when the inspector accent-gradient switch is active (stored gradient on label style). */
export function labelUsesAccentGradient(ls: FlowConnectionLabelStyle): boolean {
  return Boolean(ls.labelAccentGradient && ls.labelAccentGradient.length >= 2)
}

/** CSS `linear-gradient(to right, ...)` string from gradient stops. */
export function gradientToCss(stops: GradientStop[]): string {
  if (!stops.length) return 'linear-gradient(to right, #94a3b8 0%, #94a3b8 100%)'
  const s = [...stops].sort((a, b) => a.position - b.position)
  const parts: string[] = []
  if (s[0].position > 0) parts.push(`${s[0].color} 0%`)
  for (const st of s) parts.push(`${st.color} ${st.position}%`)
  const last = s[s.length - 1]
  // Extend the final color through 100% so a border/subpixel gap does not show another hue.
  if (last.position < 100) parts.push(`${last.color} 100%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** True if the gradient has ≥ 2 stops with different colors. */
export function isMultiColorGradient(stops: GradientStop[]): boolean {
  return stops.length >= 2 && new Set(stops.map(s => s.color)).size > 1
}

/** Curated multi-stop accent presets (trending mesh / aurora-style gradients). */
export type AccentGradientTemplateId = 'aurora' | 'sunset' | 'ocean' | 'synth' | 'lime' | 'peach' | 'cosmos' | 'holographic' | 'golden' | 'roseGold'

export interface AccentGradientTemplate {
  id: AccentGradientTemplateId
  stops: GradientStop[]
}

/** Ten popular gradient accents — saturated enough for borders & orbit animations. */
export const ACCENT_GRADIENT_TEMPLATES: readonly AccentGradientTemplate[] = [
  {
    id: 'aurora',
    stops: [
      { color: '#22d3ee', position: 0 },
      { color: '#6366f1', position: 50 },
      { color: '#c084fc', position: 100 },
    ],
  },
  {
    id: 'sunset',
    stops: [
      { color: '#fb923c', position: 0 },
      { color: '#f472b6', position: 45 },
      { color: '#a855f7', position: 100 },
    ],
  },
  {
    id: 'ocean',
    stops: [
      { color: '#0ea5e9', position: 0 },
      { color: '#14b8a6', position: 50 },
      { color: '#22d3ee', position: 100 },
    ],
  },
  {
    id: 'synth',
    stops: [
      { color: '#f472b6', position: 0 },
      { color: '#d946ef', position: 40 },
      { color: '#6366f1', position: 100 },
    ],
  },
  {
    id: 'lime',
    stops: [
      { color: '#a3e635', position: 0 },
      { color: '#22c55e', position: 50 },
      { color: '#14b8a6', position: 100 },
    ],
  },
  {
    id: 'peach',
    stops: [
      { color: '#fda4af', position: 0 },
      { color: '#fb923c', position: 50 },
      { color: '#fde047', position: 100 },
    ],
  },
  {
    id: 'cosmos',
    stops: [
      { color: '#818cf8', position: 0 },
      { color: '#6366f1', position: 35 },
      { color: '#7c3aed', position: 70 },
      { color: '#c026d3', position: 100 },
    ],
  },
  {
    id: 'holographic',
    stops: [
      { color: '#67e8f9', position: 0 },
      { color: '#a78bfa', position: 33 },
      { color: '#f0abfc', position: 66 },
      { color: '#fb7185', position: 100 },
    ],
  },
  {
    id: 'golden',
    stops: [
      { color: '#fbbf24', position: 0 },
      { color: '#f97316', position: 50 },
      { color: '#ef4444', position: 100 },
    ],
  },
  {
    id: 'roseGold',
    stops: [
      { color: '#fda4af', position: 0 },
      { color: '#f472b6', position: 45 },
      { color: '#fbbf24', position: 100 },
    ],
  },
] as const

/** True when two stop lists match (order by position, same colors & positions). */
export function gradientStopsMatch(a: GradientStop[], b: GradientStop[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x.position - y.position)
  const sb = [...b].sort((x, y) => x.position - y.position)
  return sa.every((s, i) => flowColorsMatch(s.color, sb[i].color) && s.position === sb[i].position)
}

// ── Connection color gradient helpers ────────────────────────────────────

/**
 * Returns the effective gradient stops from a connection style.
 * If `colorGradient` is set (≥2 stops), returns it.
 * Otherwise derives a 2-stop solid-color gradient from `color`.
 */
export function effectiveConnectionColorStops(style: Pick<FlowConnectionStyle, 'color' | 'colorGradient'>): GradientStop[] {
  if (style.colorGradient && style.colorGradient.length >= 2) return style.colorGradient
  const c = style.color || '#6b7280'
  return [
    { color: c, position: 0 },
    { color: c, position: 100 },
  ]
}

/** Primary edge color — first stop of the gradient, or `color`. */
export function effectiveConnectionColor(style: Pick<FlowConnectionStyle, 'color' | 'colorGradient'>): string {
  if (style.colorGradient && style.colorGradient.length > 0) return style.colorGradient[0].color
  return style.color || '#6b7280'
}

export const FLOW_CONNECTION_STYLE_DEFAULT: FlowConnectionStyle = {
  label: '',
  labelVisible: true,
  curve: 'curved',
  color: '#6b7280',
  dash: 'solid',
  width: 1,
  bidirectional: false,
  sourceSide: 'bottom',
  targetSide: 'top',
  animation: 'none',
  opacity: FLOW_OPACITY_DEFAULT,
}

export const FLOW_NODE_VISUAL_DEFAULT: FlowNodeVisualStyle = {
  accentColor: '#94a3b8',
  iconKey: undefined,
  handleStyle: 'minimal-dot',
  showConnectionHandles: true,
  opacity: FLOW_OPACITY_DEFAULT,
}

/** Preset màu (hình 2) — giá trị border / ring */
export const FLOW_NODE_ACCENT_PRESETS: string[] = ['#38bdf8', '#4ade80', '#fb923c', '#a78bfa', '#f472b6', '#facc15', '#22d3ee', '#86efac', '#fdba74', '#c4b5fd', '#94a3b8']

export function flowLabelFontFamilyCss(family: FlowLabelFontFamily): string {
  switch (family) {
    case 'serif':
      return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    case 'rounded':
      return '"Segoe UI", "SF Pro Rounded", "Helvetica Neue", system-ui, sans-serif'
    default:
      return 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  }
}

function normalizeFlowLabelFontFamily(value: unknown): FlowLabelFontFamily {
  if (typeof value === 'string' && (FLOW_LABEL_FONT_FAMILIES as readonly string[]).includes(value)) {
    return value as FlowLabelFontFamily
  }
  return FLOW_CONNECTION_LABEL_STYLE_DEFAULT.fontFamily
}

function normalizeFlowLabelFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return FLOW_CONNECTION_LABEL_STYLE_DEFAULT.fontSize
  let best = FLOW_CONNECTION_LABEL_STYLE_DEFAULT.fontSize
  let bestDist = Infinity
  for (const s of FLOW_LABEL_FONT_SIZES) {
    const d = Math.abs(s - value)
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best
}

export function mergeConnectionLabelStyle(partial?: Partial<FlowConnectionLabelStyle> | null): FlowConnectionLabelStyle {
  if (!partial) return { ...FLOW_CONNECTION_LABEL_STYLE_DEFAULT }
  return {
    backgroundColor: partial.backgroundColor ?? FLOW_CONNECTION_LABEL_STYLE_DEFAULT.backgroundColor,
    borderColor: partial.borderColor ?? FLOW_CONNECTION_LABEL_STYLE_DEFAULT.borderColor,
    borderWidth: normalizeNodeBorderWidth(partial.borderWidth) ?? 0,
    borderAnimation: undefined,
    borderAnimationSpeed: undefined,
    fontSize: normalizeFlowLabelFontSize(partial.fontSize),
    fontFamily: normalizeFlowLabelFontFamily(partial.fontFamily),
    color: mergedConnectionLabelTextColor(partial),
    ...('labelAccentGradient' in partial
      ? {
          labelAccentGradient:
            Array.isArray(partial.labelAccentGradient) && partial.labelAccentGradient.length >= 2
              ? partial.labelAccentGradient
              : undefined,
        }
      : {}),
  }
}

export type ResolvedEdgeLabelChrome = {
  mergedLabelStyle: FlowConnectionLabelStyle
  className: string
  style: import('react').CSSProperties
  borderColor: string
  accentStops: GradientStop[]
  useAccentGradient: boolean
  accentGradient: GradientStop[] | undefined
  staticBorderPx: number
}

/** Edge labels use the same preset→px mapping as node borders (no extra scale). */
const EDGE_LABEL_BORDER_WIDTH_SCALE = 1

/** Border width preset for edge label chrome (static border only). */
export function edgeLabelBorderWidthPreset(
  labelStyle: Partial<FlowConnectionLabelStyle> | null | undefined,
): FlowStrokeWidthPreset | undefined {
  const ls = mergeConnectionLabelStyle(labelStyle)
  return ls.borderWidth
}

/** CSS px for a static edge-label border (scaled for small pills). */
export function edgeLabelStaticBorderWidthPx(preset: FlowStrokeWidthPreset | undefined): number {
  if (preset === undefined || preset === 0) return 0
  return preset * EDGE_LABEL_BORDER_WIDTH_SCALE
}

export function hasEdgeLabelChromeSettings(connection: Partial<FlowConnectionStyle> | null | undefined): boolean {
  const ls = connection?.labelStyle
  if (!ls) return false
  return Boolean(
    ls.backgroundColor?.trim() ||
      ls.borderColor?.trim() ||
      (ls.labelAccentGradient && ls.labelAccentGradient.length >= 2) ||
      ls.borderWidth !== undefined ||
      ls.color?.trim(),
  )
}

/** Resolved label pill chrome for map + inspector preview. */
export function resolvedEdgeLabelChrome(
  connection: FlowConnectionStyle,
  options?: { preview?: boolean },
): ResolvedEdgeLabelChrome {
  const ls = mergeConnectionLabelStyle(connection.labelStyle)
  const preview = options?.preview ?? false
  const fontSize = preview && ls.fontSize === FLOW_CONNECTION_LABEL_STYLE_DEFAULT.fontSize ? 11 : ls.fontSize
  const textColor = flowColorCss(ls.color, FLOW_CONNECTION_LABEL_TEXT_COLOR_DEFAULT)
  const bg = ls.backgroundColor?.trim() ? flowColorCss(ls.backgroundColor) : undefined
  const borderCol = ls.borderColor?.trim() ? flowColorCss(ls.borderColor) : undefined
  const useAccentGradient = labelUsesAccentGradient(ls)
  const accentStops = effectiveLabelAccentStops(ls)
  const accentGradient = useAccentGradient && isMultiColorGradient(accentStops) ? accentStops : undefined
  const borderPreset = edgeLabelBorderWidthPreset(ls)
  const showStaticBorder = ls.borderWidth > 0
  const effectiveBorderCol = useAccentGradient ? effectiveLabelAccentColor(ls) : borderCol || '#94a3b8'
  const staticBorderPx = showStaticBorder ? edgeLabelStaticBorderWidthPx(borderPreset) : 0
  const hasBorderChrome = staticBorderPx > 0
  const hasFill = useAccentGradient || Boolean(bg)
  const style: import('react').CSSProperties = {
    fontSize,
    fontFamily: flowLabelFontFamilyCss(ls.fontFamily ?? 'system'),
    color: textColor,
    ...(useAccentGradient
      ? { backgroundImage: gradientToCss(accentStops) }
      : bg
        ? { backgroundColor: bg }
        : {}),
    ...(!useAccentGradient && staticBorderPx > 0
      ? { boxShadow: `0 0 0 ${staticBorderPx}px ${effectiveBorderCol}` }
      : {}),
  }
  return {
    mergedLabelStyle: ls,
    className: hasFill
      ? `rounded-sm${hasBorderChrome ? '' : ' shadow-sm'}`
      : `rounded-sm bg-card/95${hasBorderChrome ? '' : ' shadow-sm'}`,
    style,
    borderColor: effectiveBorderCol,
    accentStops,
    useAccentGradient,
    accentGradient,
    staticBorderPx,
  }
}

export function mergeConnectionStyle(partial?: Partial<FlowConnectionStyle> | null): FlowConnectionStyle {
  if (!partial) return { ...FLOW_CONNECTION_STYLE_DEFAULT }
  const merged = { ...FLOW_CONNECTION_STYLE_DEFAULT, ...partial }
  return {
    ...merged,
    curve: normalizeFlowEdgeCurve(partial.curve),
    animation: normalizeFlowEdgeAnimation(partial.animation),
    width: normalizeFlowStrokeWidth(merged.width, FLOW_CONNECTION_STYLE_DEFAULT.width),
    opacity: normalizeFlowOpacity(partial.opacity ?? merged.opacity),
    colorGradient: Array.isArray(partial.colorGradient) && partial.colorGradient.length >= 2 ? partial.colorGradient : undefined,
    labelStyle: partial.labelStyle != null ? mergeConnectionLabelStyle(partial.labelStyle) : undefined,
  }
}

const FLOW_NODE_ANIMATION_ALIASES: Record<string, FlowNodeAnimationKind> = {
  rainbow: 'borderBeam',
  electric: 'focusBrackets',
  holographic: 'glassRim',
  statusPing: 'glassRim',
}

const FLOW_NODE_ANIMATION_SET = new Set<string>([
  'none',
  'glow',
  'pulse',
  'bounce',
  'beam',
  'doubleBeam',
  'dots',
  'borderBeam',
  'aurora',
  'shimmer',
  'radar',
  'dashed',
  'neon',
  'morse',
  'sparkle',
  'focusBrackets',
  'glassRim',
])

export function normalizeNodeAnimation(value: unknown): FlowNodeAnimationKind | undefined {
  if (typeof value !== 'string' || value === 'none') return undefined
  const mapped = FLOW_NODE_ANIMATION_ALIASES[value] ?? value
  return FLOW_NODE_ANIMATION_SET.has(mapped) ? (mapped as FlowNodeAnimationKind) : undefined
}

export function mergeNodeVisualStyle(partial?: Partial<FlowNodeVisualStyle> | null): FlowNodeVisualStyle {
  if (partial == null) {
    return { ...FLOW_NODE_VISUAL_DEFAULT, handleSideCount: 2 }
  }
  const merged: FlowNodeVisualStyle = {
    ...FLOW_NODE_VISUAL_DEFAULT,
    ...partial,
    borderWidth: normalizeNodeBorderWidth(partial.borderWidth),
    handleStyle: normalizeFlowNodeHandleStyle(partial.handleStyle ?? FLOW_NODE_VISUAL_DEFAULT.handleStyle),
    showConnectionHandles: partial?.showConnectionHandles !== false,
    opacity: FLOW_OPACITY_DEFAULT,
    ...('nodeAnimation' in partial ? { nodeAnimation: normalizeNodeAnimation(partial.nodeAnimation) } : {}),
    // accentGradient: keep as-is if valid (≥2 stops with color + position), else strip
    accentGradient: Array.isArray(partial.accentGradient) && partial.accentGradient.length >= 2 ? partial.accentGradient : undefined,
  }
  if (!('handleSideCount' in partial)) {
    merged.handleSideCount = Object.keys(partial).length > 0 ? 4 : 2
  }
  return merged
}

/** Quyết định cạnh nào render handle trên node (đọc từ style đã lưu / DB, chưa qua merge). */
export function resolvedHandleSidesForStored(stored?: Partial<FlowNodeVisualStyle> | null): FlowEdgeHandleSide[] {
  if (!stored || Object.keys(stored).length === 0) {
    return [...FLOW_NODE_HANDLE_SIDES_TWO]
  }
  if ('handleSidesMode' in stored || 'handleSideCount' in stored) {
    return resolvedHandleSidesFromMerged(stored)
  }
  return [...FLOW_NODE_HANDLE_SIDES_ALL]
}

export function parseConnectionStyleJson(raw: string | null | undefined): FlowConnectionStyle | undefined {
  if (raw == null || raw === '') return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object') return undefined
    return mergeConnectionStyle(v as Partial<FlowConnectionStyle>)
  } catch {
    return undefined
  }
}

export function stringifyConnectionStyle(style: FlowConnectionStyle): string {
  return JSON.stringify(style)
}

export function parseNodeVisualStyleJson(raw: string | null | undefined): FlowNodeVisualStyle | undefined {
  if (raw == null || raw === '') return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object') return undefined
    return mergeNodeVisualStyle(v as Partial<FlowNodeVisualStyle>)
  } catch {
    return undefined
  }
}

export function stringifyNodeVisualStyle(style: FlowNodeVisualStyle): string {
  return JSON.stringify(style)
}

export function edgeHandleIds(cs: FlowConnectionStyle): { sourceHandle: string; targetHandle: string } {
  return {
    sourceHandle: `s-${cs.sourceSide}`,
    targetHandle: `t-${cs.targetSide}`,
  }
}

/** Độ dày stroke — giá trị lưu là pixel width trực tiếp (preset 0.25–1.25). */
export function connectionStrokeWidthPx(width: FlowConnectionStyle['width']): number {
  return width
}

export function dashArrayForKind(dash: FlowEdgeDashKind): string | undefined {
  if (dash === 'solid') return undefined
  if (dash === 'dashed') return '10 6'
  return '2 5'
}
