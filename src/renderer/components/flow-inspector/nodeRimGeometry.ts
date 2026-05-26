import { FLOW_NODE_SHELL_RADIUS_PX } from '@/components/flow-inspector/flowNodeShellVisual'

export type NodeRimBox = { w: number; h: number }

export type NodeRimGeometry = {
  outerRx: number
  innerRx: number
  inset: number
}

/** Shared layout for SVG ring + inset panel fill. */
export function nodeRimGeometry(strokePx: number, box: NodeRimBox, outerRx = FLOW_NODE_SHELL_RADIUS_PX): NodeRimGeometry {
  const inset = strokePx
  const innerW = Math.max(0, box.w - inset * 2)
  const innerH = Math.max(0, box.h - inset * 2)
  const innerRx = Math.max(0, Math.min(outerRx - inset, innerW / 2, innerH / 2))
  return { outerRx, innerRx, inset }
}

/** SVG subpath for a rounded rect (absolute coords). */
export function svgRoundedRectPath(x: number, y: number, w: number, h: number, rx: number): string {
  if (w <= 0 || h <= 0) return ''
  const r = Math.max(0, Math.min(rx, w / 2, h / 2))
  if (r <= 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ')
}

/** Even-odd ring flush with the card border box (0,0,w,h). */
export function svgRimRingPath(box: NodeRimBox, strokePx: number, outerRx = FLOW_NODE_SHELL_RADIUS_PX): string {
  if (strokePx <= 0 || box.w <= 0 || box.h <= 0) return ''
  const { inset, innerRx } = nodeRimGeometry(strokePx, box, outerRx)
  const outer = svgRoundedRectPath(0, 0, box.w, box.h, outerRx)
  const inner = svgRoundedRectPath(inset, inset, box.w - inset * 2, box.h - inset * 2, innerRx)
  return `${outer} ${inner}`
}

/** Stroke centerline inset by strokePx/2 — matches even-odd rim band (glow/pulse/dots). */
export function svgRimCenterlinePath(box: NodeRimBox, strokePx: number, outerRx = FLOW_NODE_SHELL_RADIUS_PX): string {
  if (strokePx <= 0 || box.w <= 0 || box.h <= 0) return ''
  const inset = strokePx / 2
  const w = Math.max(0, box.w - strokePx)
  const h = Math.max(0, box.h - strokePx)
  const rx = Math.max(0, Math.min(outerRx - inset, w / 2, h / 2))
  return svgRoundedRectPath(inset, inset, w, h, rx)
}
