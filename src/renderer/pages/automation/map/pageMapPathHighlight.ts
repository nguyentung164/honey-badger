import type { CSSProperties } from 'react'

/** Dedicated fuchsia tone — not used by run status or default edges. */
export const PAGE_MAP_PATH_HIGHLIGHT_COLOR = 'var(--page-map-path-highlight)'
export const PAGE_MAP_PATH_HIGHLIGHT_RUNNING_COLOR = 'var(--page-map-path-highlight-running)'

/** Thinner than legacy 7px highlight; still slightly above typical connection width. */
export const PAGE_MAP_PATH_HIGHLIGHT_STROKE_PX = 2

export const PAGE_MAP_PATH_HIGHLIGHT_EDGE_STYLE: CSSProperties = {
  stroke: PAGE_MAP_PATH_HIGHLIGHT_COLOR,
  strokeOpacity: 1,
  strokeWidth: PAGE_MAP_PATH_HIGHLIGHT_STROKE_PX,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeDasharray: 'none',
}

/** While a run is in progress: dashed path highlight. */
export const PAGE_MAP_PATH_HIGHLIGHT_RUNNING_EDGE_STYLE: CSSProperties = {
  stroke: PAGE_MAP_PATH_HIGHLIGHT_RUNNING_COLOR,
  strokeOpacity: 1,
  strokeWidth: PAGE_MAP_PATH_HIGHLIGHT_STROKE_PX,
  strokeDasharray: '8 6',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}
