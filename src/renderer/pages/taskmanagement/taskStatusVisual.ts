import type { CSSProperties } from 'react'
import { hexToRgba } from '@/lib/utils'

/** Tiêu đề cột Kanban: nền / viền nhạt theo màu master. */
export function taskStatusKanbanHeaderStyle(hex: string | undefined): CSSProperties | undefined {
  if (!hex?.trim()) return undefined
  return {
    backgroundColor: hexToRgba(hex, 46),
  }
}

/** Phần thân cột (vùng scroll card): cùng mã hex, alpha thấp hơn header — nền mờ hơn, vẫn đồng bộ sắc. */
export function taskStatusKanbanColumnBodyStyle(hex: string | undefined): CSSProperties | undefined {
  if (!hex?.trim()) return undefined
  return {
    backgroundColor: hexToRgba(hex, 22),
  }
}

/** Thanh timeline Gantt / sự kiện lịch: nền + viền theo master. Chữ dùng token theme cho độc được trên glass. */
export function taskStatusBarStyle(hex: string | undefined): CSSProperties | undefined {
  if (!hex?.trim()) return undefined
  return {
    backgroundColor: hexToRgba(hex, 58),
    borderColor: hexToRgba(hex, 120),
    borderWidth: 1,
    borderStyle: 'solid',
    color: 'hsl(var(--foreground))',
  }
}

/**
 * Task có sub-task: nửa trên đậm hơn, nửa dưới giữ đúng màu bar thường (cùng alpha với taskStatusBarStyle khi có hex).
 */
export function taskStatusBarParentFillStyle(hex: string | undefined): CSSProperties {
  if (hex?.trim()) {
    const bottom = hexToRgba(hex, 58)
    const top = hexToRgba(hex, 92)
    return {
      backgroundImage: `linear-gradient(to bottom, ${top} 0%, ${top} 50%, ${bottom} 50%, ${bottom} 100%)`,
    }
  }
  return {
    backgroundImage: 'linear-gradient(to bottom, hsl(var(--primary) / 0.42) 0%, hsl(var(--primary) / 0.42) 50%, hsl(var(--primary) / 0.25) 50%, hsl(var(--primary) / 0.25) 100%)',
  }
}
