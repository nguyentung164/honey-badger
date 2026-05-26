import { cn } from '@/lib/utils'
import { FRAME_LAYOUTS, TIER_TO_SHAPE, type FrameShape, type LayerLayout } from './badgeFrameLayout'

function frameAssetUrl(shape: FrameShape, layer: 'base' | 'inner' | 'highlight'): string {
  const webPath = `/achievements/frames/${shape}/${layer}.svg`
  if (typeof window !== 'undefined' && window.api?.resources?.publicAssetUrl) {
    return window.api.resources.publicAssetUrl(webPath)
  }
  return webPath
}

function FrameLayer({ layout, src }: { layout: LayerLayout; src: string }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}
    >
      <div
        className="absolute"
        style={{
          inset: layout.inset ?? 0,
          mixBlendMode: layout.blendMode,
        }}
      >
        <img alt="" draggable={false} src={src} className="block size-full max-w-none" />
      </div>
    </div>
  )
}

/** Slight red shift so negative tier differs from bronze while reusing circle assets. */
const TIER_FRAME_FILTER: Partial<Record<string, string>> = {
  negative: 'hue-rotate(-18deg) saturate(1.25)',
}

/**
 * Badge frame from Figma "Badges (Community)" — Design Wizard Badges.
 * Layers: Base → Inner → Highlight (Lucide icon renders on top via BadgeCard).
 *
 * `lite=true` — base layer only (skips inner SVG filters + highlight); for grids / title bar perf.
 */
export function BadgeFrameSvg({
  tier,
  className,
  lite = false,
}: {
  tier: string
  className?: string
  lite?: boolean
}) {
  const shape = TIER_TO_SHAPE[tier] ?? TIER_TO_SHAPE.bronze
  const layout = FRAME_LAYOUTS[shape]
  const tierFilter = TIER_FRAME_FILTER[tier]

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none relative size-full select-none', className)}
      style={{
        filter: [!lite && tierFilter, !lite ? 'drop-shadow(0 2.2px 6px rgba(216,229,237,0.22))' : undefined]
          .filter(Boolean)
          .join(' ') || undefined,
      }}
    >
      <FrameLayer layout={layout.base} src={frameAssetUrl(shape, 'base')} />
      {!lite && <FrameLayer layout={layout.inner} src={frameAssetUrl(shape, 'inner')} />}
      {!lite && <FrameLayer layout={layout.highlight} src={frameAssetUrl(shape, 'highlight')} />}
    </div>
  )
}
