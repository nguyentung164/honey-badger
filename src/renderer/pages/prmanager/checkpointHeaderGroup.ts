import { cn } from '@/lib/utils'

/** 10 màu nhóm: mỗi id một cặp class light/dark cho ô header cột checkpoint trên Pr Board. */
export const CHECKPOINT_HEADER_GROUP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export type CheckpointHeaderGroupId = (typeof CHECKPOINT_HEADER_GROUP_IDS)[number]

const TABLE_HEAD_BG: Record<CheckpointHeaderGroupId, string> = {
  0: 'bg-slate-200/95 text-slate-900 dark:bg-slate-800/95 dark:text-slate-100',
  1: 'bg-sky-200/95 text-sky-950 dark:bg-sky-950/85 dark:text-sky-50',
  2: 'bg-cyan-200/95 text-cyan-950 dark:bg-cyan-950/80 dark:text-cyan-50',
  3: 'bg-teal-200/95 text-teal-950 dark:bg-teal-950/80 dark:text-teal-50',
  4: 'bg-emerald-200/95 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-50',
  5: 'bg-violet-200/95 text-violet-950 dark:bg-violet-950/80 dark:text-violet-50',
  6: 'bg-fuchsia-200/95 text-fuchsia-950 dark:bg-fuchsia-950/80 dark:text-fuchsia-50',
  7: 'bg-rose-200/95 text-rose-950 dark:bg-rose-950/80 dark:text-rose-50',
  8: 'bg-amber-200/95 text-amber-950 dark:bg-amber-950/75 dark:text-amber-50',
  9: 'bg-orange-200/95 text-orange-950 dark:bg-orange-950/80 dark:text-orange-50',
}

/** Ô vuông xem trước trong tab Checkpoint (cùng họ màu, tương phản tốt trên nền card). */
export const CHECKPOINT_HEADER_GROUP_SWATCH: Record<CheckpointHeaderGroupId, string> = {
  0: 'bg-slate-500 dark:bg-slate-400',
  1: 'bg-sky-500 dark:bg-sky-400',
  2: 'bg-cyan-500 dark:bg-cyan-400',
  3: 'bg-teal-500 dark:bg-teal-400',
  4: 'bg-emerald-500 dark:bg-emerald-400',
  5: 'bg-violet-500 dark:bg-violet-400',
  6: 'bg-fuchsia-500 dark:bg-fuchsia-400',
  7: 'bg-rose-500 dark:bg-rose-400',
  8: 'bg-amber-500 dark:bg-amber-400',
  9: 'bg-orange-500 dark:bg-orange-400',
}

export function clampCheckpointHeaderGroupId(n: unknown): CheckpointHeaderGroupId | null {
  if (n === null || n === undefined) return null
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return null
  const i = Math.floor(v)
  if (i < 0 || i > 9) return null
  return i as CheckpointHeaderGroupId
}

/** Nền + chữ cho `<TableHead>` cột template; `null` = mặc định muted. */
export function checkpointTableHeadGroupClass(headerGroupId: number | null | undefined): string {
  const id = clampCheckpointHeaderGroupId(headerGroupId)
  if (id === null) return 'bg-muted/95'
  return TABLE_HEAD_BG[id]
}

/** Khung vuông nút chọn màu (popover); ô màu thật nằm trong — dùng với {@link checkpointSwatchInnerClass}. */
export function checkpointSwatchFrameClass(selected: boolean): string {
  return cn(
    'box-border flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/80 bg-muted/15 p-1 shadow-sm transition-shadow',
    selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
  )
}

/** Ô màu bên trong khung (đã canh giữa bởi flex của frame). */
export function checkpointSwatchInnerClass(id: CheckpointHeaderGroupId): string {
  return cn('block size-[18px] shrink-0 rounded-sm', CHECKPOINT_HEADER_GROUP_SWATCH[id])
}
