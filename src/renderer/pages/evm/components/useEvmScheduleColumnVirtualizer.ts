'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import type { RefObject } from 'react'

/** Độ rộng cột ngày cố định — khớp với horizontal virtualizer. */
export const EVM_SCHEDULE_DAY_COL_PX = 32

/**
 * Chiều cao một hàng trong khối header (band tuần / số ngày / thứ + ô ghim nhiều tầng).
 * Nhỏ hơn `EVM_SCHEDULE_DAY_COL_PX` để header gọn; các bảng EVM Schedule / Resource dùng chung.
 */
export const EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX = 26

/** Tổng cao 2 / 3 hàng header timeline (ô ghim rowspan khớp cỡ này). */
export const EVM_SCHEDULE_TIMELINE_HEADER_2_ROWS_PX = EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX * 2
export const EVM_SCHEDULE_TIMELINE_HEADER_3_ROWS_PX = EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX * 3

/**
 * Bù mỗi “tầng” header timeline (ô `height: R` + viền `border-separate` / `TableRow`).
 * `2` khớp thực tế trên Chromium sau khi +1 vẫn lệch thêm ~1px.
 */
export const EVM_SCHEDULE_HEADER_STICKY_INTER_ROW_ADJUST_PX = 2

const _evmScheduleHeaderStickyStepPx = EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX + EVM_SCHEDULE_HEADER_STICKY_INTER_ROW_ADJUST_PX

/**
 * Ranh `<tr>` 2→3 (header 3 tầng) cần bù thêm so với nhân đôi `step`: chỉ hàng 1→2 khớp `step`.
 */
export const EVM_SCHEDULE_HEADER_STICKY_AFTER_ROW2_EXTRA_PX = 3

/** Sticky `top` đầu `<tr>` thứ 2 (sau 1 band + 1 đường viền ngang). */
export const EVM_SCHEDULE_STICKY_TOP_AFTER_HEADER_ROW1 = _evmScheduleHeaderStickyStepPx

/** Sticky `top` đầu `<tr>` thứ 3 (sau 2 band; cộng thêm bù ranh 2→3). */
export const EVM_SCHEDULE_STICKY_TOP_AFTER_HEADER_ROW2 =
  _evmScheduleHeaderStickyStepPx * 2 + EVM_SCHEDULE_HEADER_STICKY_AFTER_ROW2_EXTRA_PX

/** `z-index` ô timeline (thấp hơn cột ghim z-40). */
export const EVM_SCHEDULE_TIMELINE_HEADER_Z = 28

/**
 * Chiều cao một hàng dữ liệu lưới lịch (WBS Schedule, AC Schedule, Resource, WBS Master timeline).
 * Giữ một nguồn để `estimateSize` virtualizer khớp ô trong bảng HTML.
 */
export const EVM_SCHEDULE_ROW_PX = 32

/**
 * 16 cột ghim trái dùng chung cho `WbsScheduleUnifiedTable` (detail) và `WbsRollupTable` (master).
 * Cùng chỉ số → cùng `width` để hai bảng thẳng hàng khi chuyển tab; cột 4/Task hoặc Note dùng `maxWidth` 160 ở từng bảng.
 *
 * 0 No · 1 Phase · 2 Category · 3 Feature · 4 Task/Note ·
 * 5–8 khối lịch (Duration/Plan/Actual tùy bảng) · 9–15 phần còn lại của cột ghim (assignee, KPI, v.v.).
 */
export const EVM_WBS_PINNED_COL_WIDTHS = [
  40, 72, 84, 84, 150, 76, 76, 76, 76, 96, 76, 84, 56, 72, 56, 60,
] as const

/**
 * Chỉ mount DOM cho các cột ngày trong viewport (kéo ngang mượt với dải dài).
 * @see https://tanstack.com/virtual/latest/docs/api/virtualizer#horizontal-virtualization
 *
 * `leadingPinnedWidthPx`: tổng px các cột ghim trước dải ngày (cùng hệ toạ độ `scrollLeft` của
 * phần tử cuộn). Dùng `scrollMargin` trong virtual-core để `getVirtualItems` khớp viewport,
 * đồng thời `getTotalSize()` vẫn chỉ bằng phần timeline (các ô `left: vc.start` trong `<td>`).
 */
export type EvmScheduleColumnVirtualizerOptions = {
  leadingPinnedWidthPx?: number
}

export function useEvmScheduleColumnVirtualizer(
  scrollRef: RefObject<HTMLElement | null>,
  columnCount: number,
  options?: EvmScheduleColumnVirtualizerOptions,
) {
  const leading = options?.leadingPinnedWidthPx ?? 0
  return useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EVM_SCHEDULE_DAY_COL_PX,
    overscan: 12,
    scrollMargin: leading,
  })
}
