import { cn } from '@/lib/utils'
import type { TrackedBranchRow } from '../hooks/usePrData'

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

export type PageSizeChoice = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE_SIZE: PageSizeChoice = 50
const PR_BOARD_PAGE_SIZE_V1_PREFIX = 'pr-manager.prBoard.pageSize.v1:'

function isPageSizeOption(n: number): n is PageSizeChoice {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
}

export function readPrBoardPageSize(projectId: string): PageSizeChoice {
  try {
    const raw = window.localStorage.getItem(PR_BOARD_PAGE_SIZE_V1_PREFIX + projectId)
    if (raw == null || raw === '') return DEFAULT_PAGE_SIZE
    const n = Number(raw)
    if (!Number.isFinite(n) || !isPageSizeOption(n)) return DEFAULT_PAGE_SIZE
    return n
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

export function writePrBoardPageSize(projectId: string, size: PageSizeChoice): void {
  try {
    window.localStorage.setItem(PR_BOARD_PAGE_SIZE_V1_PREFIX + projectId, String(size))
  } catch {
    /* ignore */
  }
}

/** Tạm thời ẩn cột Note trên bảng (bật lại khi cần). */
export const SHOW_NOTE_COLUMN = false

/** Cùng chiều cao các ô checkpoint (h-7 + text-xs). */
export const CELL_CTRL_H = 'h-7 min-h-7'
export const CELL_TXT = 'text-xs leading-tight'

/** Giới hạn rộng cột chữ dài (Branch, PR động, …). */
export const COL_BRANCH = 'min-w-0 max-w-[200px] overflow-hidden'
export const COL_PR_CHECKPOINT = 'min-w-0 max-w-[240px] overflow-hidden'
/** Viền dọc giữa các cột; cột checkbox cuối không dùng. */
export const COL_DIVIDER_R = 'border-r border-r-border/60'
/** Viền ngang từng ô (bật lưới viền bảng). */
export const COL_DIVIDER_B = 'border-b border-b-border/60'
/** Viền phải + dưới (gộp cho ô thường). */
export const COL_DIVIDER_RB = 'border-r border-r-border/60 border-b border-b-border/60'
export const PR_BOARD_TABLE_BORDERS_LS = 'pr-manager.prBoard.tableBordersV1'

/** Cũ (toàn cục) — chỉ dùng khi đọc tương thích; ghi mới theo từng project. */
const PR_BOARD_PR_MERGE_CELL_STYLE_LS_LEGACY = 'pr-manager.prBoard.prMergeCellStyleV1'
const PR_BOARD_PR_MERGE_CELL_STYLE_V1_PREFIX = 'pr-manager.prBoard.prMergeCellStyle.v1:'

export type PrMergeCellVisualStyle = 1 | 2 | 3 | 4

const PR_MERGE_CELL_STYLE_BORDER = 'border border-border/60 dark:border-border/50'

function parsePrMergeCellStyleValue(raw: string | null): PrMergeCellVisualStyle | null {
  if (raw === '1' || raw === '2' || raw === '3' || raw === '4') return Number(raw) as PrMergeCellVisualStyle
  return null
}

/** Lưu theo project (cùng kiểu page size / filter); legacy global nếu chưa có bản theo project. */
export function readPrMergeCellStyleForProject(projectId: string): PrMergeCellVisualStyle {
  try {
    if (typeof window === 'undefined') return 1
    const per = parsePrMergeCellStyleValue(window.localStorage.getItem(PR_BOARD_PR_MERGE_CELL_STYLE_V1_PREFIX + projectId))
    if (per != null) return per
    const legacy = parsePrMergeCellStyleValue(window.localStorage.getItem(PR_BOARD_PR_MERGE_CELL_STYLE_LS_LEGACY))
    if (legacy != null) return legacy
    return 1
  } catch {
    return 1
  }
}

export function writePrMergeCellStyleForProject(projectId: string, s: PrMergeCellVisualStyle): void {
  try {
    window.localStorage.setItem(PR_BOARD_PR_MERGE_CELL_STYLE_V1_PREFIX + projectId, String(s))
  } catch {
    /* ignore */
  }
}

function stripBackgroundClasses(className: string): string {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter(c => !c.startsWith('bg-') && !c.startsWith('dark:bg-') && !c.startsWith('hover:bg-') && !c.startsWith('dark:hover:bg-'))
    .join(' ')
}

/** Style 1: giữ nguyên. 2: + viền. 3: không nền + viền. 4: chỉ chữ (bỏ nền + viền). */
export function applyPrMergeCellVisualStyle(style: PrMergeCellVisualStyle, surface: string): string {
  const s = surface.trim()
  if (style === 1) return s
  if (style === 2) return cn(s, PR_MERGE_CELL_STYLE_BORDER)
  if (style === 3) return cn(stripBackgroundClasses(s), PR_MERGE_CELL_STYLE_BORDER)
  return stripBackgroundClasses(s)
}

export function stripPrMergeCellBackgroundClasses(className: string): string {
  return stripBackgroundClasses(className)
}

/** Hover dòng: lớp inset rất nhẹ trên nền nhóm repo. */
export const REPO_GROUP_ROW_HOVER_TRANSITION = 'transition-[box-shadow] duration-150'
export const REPO_GROUP_ROW_HOVER_SHADOW =
  'shadow-[inset_0_0_0_9999px_rgb(0_0_0_/_0.03)] dark:shadow-[inset_0_0_0_9999px_rgb(255_255_255_/_0.025)]'

/** CSS-only hover cho tbody theo nhóm repo (thay state JS). */
export const PR_BOARD_REPO_GROUP_TBODY_HOVER_CLASS = cn(
  REPO_GROUP_ROW_HOVER_TRANSITION,
  '[&_tr:hover>td:not([data-repo-cell])]:shadow-[inset_0_0_0_9999px_rgb(0_0_0_/_0.03)]',
  '[&_tr:hover>td:not([data-repo-cell])]:dark:shadow-[inset_0_0_0_9999px_rgb(255_255_255_/_0.025)]',
  '[&:has(tr:hover)_td[data-repo-cell]]:shadow-[inset_0_0_0_9999px_rgb(0_0_0_/_0.03)]',
  '[&:has(tr:hover)_td[data-repo-cell]]:dark:shadow-[inset_0_0_0_9999px_rgb(255_255_255_/_0.025)]'
)

export function openUrlInDefaultBrowser(url: string): void {
  void window.api.system.open_external_url(url)
}

export function githubBranchUrl(row: TrackedBranchRow): string {
  const branchPath = encodeURIComponent(row.branchName).replace(/%2F/g, '/')
  return `https://github.com/${row.repoOwner}/${row.repoRepo}/tree/${branchPath}`
}
