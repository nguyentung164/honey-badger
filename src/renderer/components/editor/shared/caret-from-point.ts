/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

export function caretFromPoint(
  x: number,
  y: number
): null | {
  offset: number
  node: Node
} {
  if (typeof document.caretRangeFromPoint !== 'undefined') {
    const range = document.caretRangeFromPoint(x, y)
    if (range === null) {
      return null
    }
    return {
      node: range.startContainer,
      offset: range.startOffset,
    }
  }
  if (typeof document.caretPositionFromPoint !== 'undefined') {
    const range = document.caretPositionFromPoint(x, y)
    if (range === null) {
      return null
    }
    return {
      node: range.offsetNode,
      offset: range.offset,
    }
  }
  // Gracefully handle IE
  return null
}
