import type { CSSProperties } from 'react'

/** Cột số thứ tự (No.) — luôn hiển thị. */
export const GANTT_COL_NO_W = 44
/** Cột checkbox bulk select — luôn hiển thị. */
export const GANTT_COL_CHECKBOX_W = 40
/** Hai cột đầu (No + checkbox) — cộng vào `leftBlock` và `sheet`. */
export const GANTT_LEADING_FIXED_W = GANTT_COL_NO_W + GANTT_COL_CHECKBOX_W

/** Độ rộng cột meta (px) — dùng chung Gantt + Workload; đồng bộ với layout Gantt. */
export const GANTT_COL_ASSIGNEE_W = 128
export const GANTT_COL_STATUS_W = 96
export const GANTT_COL_PRIORITY_W = 84
export const GANTT_COL_PROGRESS_W = 58
export const GANTT_LEFT_META_FIXED_W = GANTT_COL_ASSIGNEE_W + GANTT_COL_STATUS_W + GANTT_COL_PRIORITY_W + GANTT_COL_PROGRESS_W

/** Đặt imperative khi kéo resize cột tên — tránh setState mỗi pointermove (trăm ms input delay). */
export const HB_GANTT_NAME_W_VAR = '--hb-gantt-name-w'
/** 0/1 — lớp lưới dọc timeline dùng `opacity: var(--hb-gantt-grid-v, 0)` (toggle không bắt memo con đổi props). */
export const HB_GANTT_GRID_V_VAR = '--hb-gantt-grid-v'
const NAME = HB_GANTT_NAME_W_VAR
const META_EXTRA = '--hb-gantt-meta-extra'
const COL_NO = '--hb-gantt-col-no-w'
const COL_CHK = '--hb-gantt-col-check-w'
const COL_A = '--hb-gantt-col-assignee-w'
const COL_S = '--hb-gantt-col-status-w'
const COL_P = '--hb-gantt-col-priority-w'
const COL_PR = '--hb-gantt-col-progress-w'

/**
 * Đặt trên root panel Gantt/Workload. Hàng con đọc `var(--hb-gantt-*)` qua inheritance
 * — toggle cột meta không cần đổi props từng hàng (React.memo vẫn hiệu quả).
 */
export function hbGanttRootStyle(taskNameWidthPx: number, metaRailExpanded: boolean, gridTimelineVisible?: boolean): CSSProperties {
  const m = metaRailExpanded
  return {
    [COL_NO]: `${GANTT_COL_NO_W}px`,
    [COL_CHK]: `${GANTT_COL_CHECKBOX_W}px`,
    [NAME]: `${taskNameWidthPx}px`,
    [META_EXTRA]: m ? `${GANTT_LEFT_META_FIXED_W}px` : '0px',
    [COL_A]: m ? `${GANTT_COL_ASSIGNEE_W}px` : '0px',
    [COL_S]: m ? `${GANTT_COL_STATUS_W}px` : '0px',
    [COL_P]: m ? `${GANTT_COL_PRIORITY_W}px` : '0px',
    [COL_PR]: m ? `${GANTT_COL_PROGRESS_W}px` : '0px',
    [HB_GANTT_GRID_V_VAR]: gridTimelineVisible ? '1' : '0',
  } as CSSProperties
}

/**
 * Đường lưới dọc timeline (header/body Gantt + workload chart).
 * Giữ một class chung (kể cả `transform-gpu`) để tránh lệch 1px so với vẽ khác.
 */
export const HB_GANTT_TIMELINE_GRID_V_LINE = 'pointer-events-none absolute top-0 bottom-0 z-[1] w-px bg-border/85 dark:bg-border/70 transform-gpu'

/**
 * Vạch “today” trên timeline (Gantt body + workload bleed).
 * `w-0` + `border-l-2 border-dashed` — nét đứt dọc, căn giữa qua `-translate-x-1/2` + `left`.
 */
export const HB_GANTT_TODAY_LINE_MARK = 'absolute top-0 bottom-0 w-0 -translate-x-1/2 border-l-2 border-dashed border-rose-600/65 dark:border-rose-500/65'

/** Style fragments — chỉ dùng trong subtree đã có `hbGanttRootStyle` trên tổ tiên. */
export const hbGantt = {
  leftBlock: {
    width: `calc(var(${COL_NO}) + var(${COL_CHK}) + var(${NAME}) + var(${META_EXTRA}))`,
  } as CSSProperties,
  sheet: (chartWidthPx: number): CSSProperties => ({
    width: `calc(var(${COL_NO}) + var(${COL_CHK}) + var(${NAME}) + var(${META_EXTRA}) + ${chartWidthPx}px)`,
  }),
  leftPlusChartMin: (chartWidthPx: number, capPx: number): CSSProperties => ({
    width: `calc(var(${COL_NO}) + var(${COL_CHK}) + var(${NAME}) + var(${META_EXTRA}) + ${Math.min(chartWidthPx, capPx)}px)`,
  }),
  metaRailToggleLeft: {
    left: `calc(var(${COL_NO}) + var(${COL_CHK}) + var(${NAME}) + var(${META_EXTRA}))`,
  } as CSSProperties,
  chartAreaFromMetaRail: (chartWidthPx: number): CSSProperties => ({
    left: `calc(var(${COL_NO}) + var(${COL_CHK}) + var(${NAME}) + var(${META_EXTRA}))`,
    width: chartWidthPx,
  }),
  colNo: {
    width: `var(${COL_NO})`,
    minWidth: 0,
    flexShrink: 0,
    overflow: 'hidden',
  } as CSSProperties,
  colCheckbox: {
    width: `var(${COL_CHK})`,
    minWidth: 0,
    flexShrink: 0,
    overflow: 'hidden',
  } as CSSProperties,
  nameCol: { width: `var(${NAME})` } as CSSProperties,
  /** Padding ngang scale theo độ rộng cột — khi thu rail về 0px không còn `px-*` cố định làm lộ nội dung. */
  colAssignee: {
    display: 'flex',
    boxSizing: 'border-box',
    width: `var(${COL_A})`,
    maxWidth: `var(${COL_A})`,
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
    paddingLeft: `min(0.375rem, calc(var(${COL_A}) * ${6 / GANTT_COL_ASSIGNEE_W}))`,
    paddingRight: `min(0.375rem, calc(var(${COL_A}) * ${6 / GANTT_COL_ASSIGNEE_W}))`,
  } as CSSProperties,
  colStatus: {
    display: 'flex',
    boxSizing: 'border-box',
    width: `var(${COL_S})`,
    maxWidth: `var(${COL_S})`,
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
    paddingLeft: `min(0.375rem, calc(var(${COL_S}) * ${6 / GANTT_COL_STATUS_W}))`,
    paddingRight: `min(0.375rem, calc(var(${COL_S}) * ${6 / GANTT_COL_STATUS_W}))`,
  } as CSSProperties,
  colPriority: {
    display: 'flex',
    boxSizing: 'border-box',
    width: `var(${COL_P})`,
    maxWidth: `var(${COL_P})`,
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
    paddingLeft: `min(0.375rem, calc(var(${COL_P}) * ${6 / GANTT_COL_PRIORITY_W}))`,
    paddingRight: `min(0.375rem, calc(var(${COL_P}) * ${6 / GANTT_COL_PRIORITY_W}))`,
  } as CSSProperties,
  colProgress: {
    display: 'flex',
    boxSizing: 'border-box',
    width: `var(${COL_PR})`,
    maxWidth: `var(${COL_PR})`,
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
    paddingLeft: `min(0.375rem, calc(var(${COL_PR}) * ${6 / GANTT_COL_PROGRESS_W}))`,
    paddingRight: `min(0.375rem, calc(var(${COL_PR}) * ${6 / GANTT_COL_PROGRESS_W}))`,
  } as CSSProperties,
}
