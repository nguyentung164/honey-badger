/** VS Code explorer row height (~22px). Fixed size keeps virtual scroll stable. */
export const EXPLORER_TREE_ROW_HEIGHT = 22

export const EXPLORER_TREE_INDENT_PX = 12

/** Base left inset for tree rows (0.5rem). */
export const EXPLORER_TREE_BASE_PADDING_PX = 8

/** Horizontal offset for vertical indent guide lines (matches Source Control tree). */
export const EXPLORER_TREE_GUIDE_ALIGN_PX = 7

export function explorerTreePaddingLeft(depth: number): number {
  return EXPLORER_TREE_BASE_PADDING_PX + depth * EXPLORER_TREE_INDENT_PX
}

export function explorerTreeGuideLeft(level: number): number {
  return explorerTreePaddingLeft(level) + EXPLORER_TREE_GUIDE_ALIGN_PX
}
