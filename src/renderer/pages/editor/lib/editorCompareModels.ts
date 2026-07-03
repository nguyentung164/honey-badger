/** Virtual relative paths for read-only compare diff models (not on disk). */
export function compareSideModelPath(tabId: string, side: 'left' | 'right'): string {
  return `__hb_compare__/${tabId}/${side}`
}

export function isCompareModelPath(relativePath: string): boolean {
  return relativePath.startsWith('__hb_compare__/')
}
