import { cn } from '@/lib/utils'

/** `'all'` hoặc chuỗi rỗng = không lọc; so khớp sau trim (WBS / AC). */
export function matchesEvmPhaseFilter(rowPhase: string | null | undefined, filterPhase: string): boolean {
  const sel = !filterPhase?.trim() || filterPhase === 'all' ? 'all' : filterPhase
  if (sel === 'all') return true
  return (rowPhase ?? '').trim() === sel
}

export function matchesEvmAssigneeFilter(rowAssignee: string | null | undefined, filterAssignee: string): boolean {
  const sel = !filterAssignee?.trim() || filterAssignee === 'all' ? 'all' : filterAssignee
  if (sel === 'all') return true
  return (rowAssignee ?? '').trim() === sel
}

/**
 * Gantt AC: «Tất cả» = mọi dòng; khi chọn một phase vẫn hiển thị dòng AC **chưa gán phase**
 * (tránh ẩn toàn bộ AC thiếu phase). WBS / bảng task vẫn dùng `matchesEvmPhaseFilter` (lọc chặt).
 */
export function matchesEvmPhaseFilterForAcGantt(rowPhase: string | null | undefined, filterPhase: string): boolean {
  const sel = !filterPhase?.trim() || filterPhase === 'all' ? 'all' : filterPhase.trim()
  if (sel === 'all') return true
  const p = (rowPhase ?? '').trim()
  if (!p) return true
  return p === sel
}

/** Gantt AC: dòng chưa gán assignee vẫn hiển thị khi đang lọc một assignee (tránh mất dữ liệu). */
export function matchesEvmAssigneeFilterForAcGantt(
  rowAssignee: string | null | undefined,
  filterAssignee: string
): boolean {
  const sel = !filterAssignee?.trim() || filterAssignee === 'all' ? 'all' : filterAssignee.trim()
  if (sel === 'all') return true
  const a = (rowAssignee ?? '').trim()
  if (!a) return true
  return a === sel
}

/** SPI/CPI style: &lt;1 and &gt;0 = behind/at risk; &gt;=1 = on track; else neutral */
export function evmIndexHealthClass(index: number): string {
  if (!Number.isFinite(index) || index <= 0) return 'text-muted-foreground'
  if (index < 1) return 'text-destructive'
  return 'text-emerald-600 dark:text-emerald-500'
}

export function evmIndexCardClass(index: number): string {
  if (!Number.isFinite(index) || index <= 0) return ''
  if (index < 1) return 'border-destructive/60'
  return 'border-emerald-500/35 dark:border-emerald-500/40'
}

export function evmIndexHealthCn(index: number, mono = true): string {
  return cn('font-semibold', mono && 'font-mono', evmIndexHealthClass(index))
}
