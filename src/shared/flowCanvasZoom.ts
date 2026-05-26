/** React Flow viewport zoom limits (50% – 200%). */
export const FLOW_CANVAS_MIN_ZOOM = 0.5
export const FLOW_CANVAS_MAX_ZOOM = 2
export const FLOW_CANVAS_ZOOM_STEP = 0.05

export function clampFlowCanvasZoom(zoom: number): number {
  return Math.min(FLOW_CANVAS_MAX_ZOOM, Math.max(FLOW_CANVAS_MIN_ZOOM, zoom))
}

export function flowCanvasColorMode(resolvedTheme: string | undefined): 'light' | 'dark' {
  return resolvedTheme === 'dark' ? 'dark' : 'light'
}
