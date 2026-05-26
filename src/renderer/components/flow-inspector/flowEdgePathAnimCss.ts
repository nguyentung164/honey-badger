/**
 * Inline edge path animation helpers (dash flow). Shared by StyledFlowEdge and inspector previews.
 * Injected once into <head>.
 */
export const FLOW_PATH_EDGE_ANIM_CSS = `
@keyframes rf-edge-flow { to { stroke-dashoffset: -9; } }
.rf-anim-flow {
  stroke-dasharray: 6 3 !important;
  animation-name: rf-edge-flow;
  animation-duration: 0.5s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
`

let _styleEl: HTMLStyleElement | null = null

export function ensureFlowEdgePathAnimStyles(): void {
  if (_styleEl != null || typeof document === 'undefined') return
  _styleEl = document.createElement('style')
  _styleEl.textContent = FLOW_PATH_EDGE_ANIM_CSS
  document.head.appendChild(_styleEl)
}
