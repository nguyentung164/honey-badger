/** Shared static React Flow props — module-level refs avoid re-renders from inline objects. */

export const FLOW_DEFAULT_EDGE_OPTIONS = { zIndex: 1 } as const

/** RF elevates connected edges to ~1000 on node select — labels must sit above that layer. */
export const FLOW_EDGE_LABEL_Z_INDEX = 1100

export const FLOW_EDGE_LABEL_TOOLBAR_Z_INDEX = 1101

export const FLOW_PRO_OPTIONS = { hideAttribution: true } as const

export const FLOW_PAN_ON_DRAG = [1, 2] as [number, number]

export const FLOW_DELETE_KEY_CODE: string[] = ['Backspace', 'Delete']
