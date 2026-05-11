/**
 * Z-index cho sticky meta Gantt, nút rail và overlay loading — dùng chung TaskGanttView / TaskGanttWorkload / TaskManagement.
 * Giữ một nguồn để lazy-split bundle không phải import cả TaskGanttView chỉ vì hằng số.
 */
export const Z_GANTT_STICKY_TOP_HEADER = 36
/** Nút đóng/mở rail meta — trên sticky; thấp hơn overlay loading. */
export const Z_GANTT_META_RAIL_FLOATING_TOGGLE = Z_GANTT_STICKY_TOP_HEADER + 1
/** Overlay loading toàn board — trên nút meta rail và sticky, dưới Popover/DatePicker (z-50). */
export const Z_GANTT_BOARD_LOADING_OVERLAY = Z_GANTT_META_RAIL_FLOATING_TOGGLE + 1
