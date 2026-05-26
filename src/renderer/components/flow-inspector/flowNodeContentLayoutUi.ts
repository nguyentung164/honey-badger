import type {
  FlowNodeContentDensity,
  FlowNodeContentLayoutKind,
  FlowNodeContentMetadataMode,
} from 'shared/flowNodeContentLayout'
import { cn } from '@/lib/utils'

export type FlowNodeContentLayoutShellClasses = {
  cardClassName: string
  innerClassName: string
}

const CARD_BASE = 'rounded-lg text-sm'

const CARD_BY_LAYOUT: Record<FlowNodeContentLayoutKind, string> = {
  inline: 'min-w-[150px] max-w-[220px]',
  stacked: 'min-w-[140px] max-w-[200px]',
  iconBlock: 'min-w-[100px] max-w-[140px]',
  badgeLeading: 'min-w-[150px] max-w-[220px]',
  compact: 'min-w-[120px] max-w-[180px]',
  metadata: 'min-w-[180px] max-w-[260px]',
}

const INNER_BY_LAYOUT: Record<FlowNodeContentLayoutKind, string> = {
  inline: 'rounded-lg px-1.5 pt-1.5 pb-2',
  stacked: 'rounded-lg px-3 py-2',
  iconBlock: 'rounded-lg px-2 py-2',
  badgeLeading: 'rounded-lg px-2 py-2',
  compact: 'rounded-lg px-1.5 py-1',
  metadata: 'rounded-lg px-2 py-2',
}

const DENSITY_INNER: Record<FlowNodeContentDensity, string> = {
  compact: 'gap-0.5',
  comfortable: '',
  spacious: 'gap-1',
}

export function flowNodeContentLayoutShellClasses(
  layout: FlowNodeContentLayoutKind,
  density: FlowNodeContentDensity = 'comfortable',
): FlowNodeContentLayoutShellClasses {
  return {
    cardClassName: cn(CARD_BASE, CARD_BY_LAYOUT[layout]),
    innerClassName: cn(INNER_BY_LAYOUT[layout], DENSITY_INNER[density]),
  }
}

export function contentLayoutDensityClasses(density: FlowNodeContentDensity): {
  rowGap: string
  titleText: string
  subtitleText: string
  iconBox: string
  headerRow: string
} {
  switch (density) {
    case 'compact':
      return {
        rowGap: 'gap-1',
        titleText: 'text-[9px]',
        subtitleText: 'text-[9px]',
        iconBox: 'size-3',
        headerRow: 'min-h-3.5 gap-1 pb-1',
      }
    case 'spacious':
      return {
        rowGap: 'gap-2',
        titleText: 'text-[11px]',
        subtitleText: 'text-[11px]',
        iconBox: 'size-4',
        headerRow: 'min-h-5 gap-2 pb-2',
      }
    default:
      return {
        rowGap: 'gap-1.5',
        titleText: 'text-[10px]',
        subtitleText: 'text-[10px]',
        iconBox: 'size-3.5',
        headerRow: 'min-h-4 gap-1.5 pb-1.5',
      }
  }
}

export function shouldShowInlineBadge(layout: FlowNodeContentLayoutKind): boolean {
  return layout !== 'compact'
}

export function effectiveMetadataModeForLayout(
  layout: FlowNodeContentLayoutKind,
  metadataMode: FlowNodeContentMetadataMode,
): FlowNodeContentMetadataMode {
  if (layout === 'compact') return 'hidden'
  if (layout === 'metadata') return 'always'
  return metadataMode
}
