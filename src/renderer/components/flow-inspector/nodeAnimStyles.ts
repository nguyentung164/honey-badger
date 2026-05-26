import type { FlowNodeAnimationKind } from 'shared/flowDiagramStyle'

/**
 * Orbit animation đã chuyển sang SVG (`NodeBorderOrbitSvg`).
 * File này giữ lại các export để không break import cũ.
 */

/** No-op — orbit không còn dùng CSS class, dùng `NodeBorderOrbitSvg` thay thế. */
export function ensureNodeAnimStyles(): void {}

/** Trả về `undefined` — orbit SVG không cần class trên card. */
export function nodeAnimClass(_kind: FlowNodeAnimationKind | undefined): string | undefined {
  return undefined
}
