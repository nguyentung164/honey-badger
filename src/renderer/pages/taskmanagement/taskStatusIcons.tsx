import {
  CheckCircle,
  Circle,
  Eye,
  LayoutList,
  Loader2,
  MessageCircle,
  Wrench,
  XCircle,
} from 'lucide-react'
import type { ReactElement } from 'react'

/** Icon Lucide theo mã trạng thái — khớp TaskManagement (bảng / filter). */
export function taskStatusIconEl(statusCode: string, sizeClassName = 'h-4 w-4'): ReactElement {
  const c = `shrink-0 ${sizeClassName}`.trim()
  switch (statusCode) {
    case 'new':
      return <Circle className={c} aria-hidden />
    case 'in_progress':
      return <Loader2 className={c} aria-hidden />
    case 'in_review':
      return <Eye className={c} aria-hidden />
    case 'fixed':
      return <Wrench className={c} aria-hidden />
    case 'cancelled':
      return <XCircle className={c} aria-hidden />
    case 'feedback':
      return <MessageCircle className={c} aria-hidden />
    case 'done':
      return <CheckCircle className={c} aria-hidden />
    default:
      return <LayoutList className={c} aria-hidden />
  }
}
