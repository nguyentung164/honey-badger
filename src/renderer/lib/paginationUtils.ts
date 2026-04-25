/**
 * Returns up to `maxVisible` consecutive 1-based page indices, sliding so `currentPage` stays in view when possible.
 */
export function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible = 5
): number[] {
  if (totalPages <= 0) return []
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const half = Math.floor(maxVisible / 2)
  let start = currentPage - half
  start = Math.max(1, Math.min(start, totalPages - maxVisible + 1))
  return Array.from({ length: maxVisible }, (_, i) => start + i)
}
