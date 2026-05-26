import type { Edge, Node } from '@xyflow/react'
import type { CSSProperties } from 'react'

function shallowEqualRecord(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function nodeStyleEqual(a: Node['style'], b: Node['style']): boolean {
  if (a === b) return true
  if (!a || !b) return a === b
  const aw = a.width
  const ah = a.height
  const bw = b.width
  const bh = b.height
  return aw === bw && ah === bh
}

function isSamePageMapNodeData(type: string | undefined, prevData: unknown, nextData: unknown): boolean {
  if (prevData === nextData) return true
  if (!prevData || !nextData || typeof prevData !== 'object' || typeof nextData !== 'object') return false
  const prev = prevData as Record<string, unknown>
  const next = nextData as Record<string, unknown>
  if (type === 'catalogGroup') {
    return (
      prev.label === next.label &&
      prev.hint === next.hint &&
      prev.status === next.status &&
      prev.statusLabel === next.statusLabel &&
      prev.pageCount === next.pageCount &&
      prev.caseCount === next.caseCount &&
      prev.diagramVisual === next.diagramVisual
    )
  }
  if (type === 'catalogPage') {
    return (
      prev.label === next.label &&
      prev.hint === next.hint &&
      prev.status === next.status &&
      prev.statusLabel === next.statusLabel &&
      prev.panelTestCount === next.panelTestCount &&
      prev.panelLinksLine === next.panelLinksLine &&
      prev.panelUpdatedLine === next.panelUpdatedLine &&
      prev.panelSlugLine === next.panelSlugLine &&
      prev.diagramVisual === next.diagramVisual &&
      prev.inGroup === next.inGroup
    )
  }
  if (type === 'mapAnnotation') {
    return prev.labelNumber === next.labelNumber && prev.content === next.content && prev.style === next.style && prev.minHeight === next.minHeight
  }
  return shallowEqualRecord(prev, next)
}

function isSamePageMapNode(prev: Node, built: Node, parentChanged: boolean): boolean {
  if (prev.type !== built.type) return false
  if ((prev.parentId ?? undefined) !== (built.parentId ?? undefined)) return false
  if (prev.extent !== built.extent) return false
  if (prev.zIndex !== built.zIndex) return false
  if (prev.selectable !== built.selectable) return false
  if (prev.draggable !== built.draggable) return false
  if (prev.deletable !== built.deletable) return false
  if (prev.connectable !== built.connectable) return false
  if (!nodeStyleEqual(prev.style, built.style)) return false
  if (!isSamePageMapNodeData(built.type, prev.data, built.data)) return false
  if (parentChanged) {
    if (prev.position.x !== built.position.x || prev.position.y !== built.position.y) return false
  }
  return true
}

/** Merge freshly built nodes with previous RF state — preserve drag positions and stable data refs. */
export function mergePageMapNodes(prev: Node[], built: Node[]): Node[] {
  const pos = new Map(prev.map(n => [n.id, n.position]))
  const prevById = new Map(prev.map(n => [n.id, n]))
  const builtIds = new Set(built.map(n => n.id))

  let changed = prev.length !== built.length
  const next: Node[] = []

  for (const n of built) {
    const old = prevById.get(n.id)
    const parentChanged = old != null && (old.parentId ?? undefined) !== (n.parentId ?? undefined)
    const position = parentChanged ? n.position : (pos.get(n.id) ?? n.position)
    const selected = old?.selected ?? false

    if (old && isSamePageMapNode(old, n, parentChanged) && old.position.x === position.x && old.position.y === position.y && (old.selected ?? false) === selected) {
      next.push(old)
      continue
    }

    changed = true
    next.push({
      ...n,
      position,
      selected,
      data: old && isSamePageMapNodeData(n.type, old.data, n.data) ? old.data : n.data,
    })
  }

  if (!changed) {
    for (const p of prev) {
      if (!builtIds.has(p.id)) {
        changed = true
        break
      }
    }
  }

  return changed ? next : prev
}

function styleEqual(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false
  }
  return true
}

function isSamePageMapEdge(prev: Edge, next: Edge): boolean {
  return (
    prev.source === next.source &&
    prev.target === next.target &&
    prev.sourceHandle === next.sourceHandle &&
    prev.targetHandle === next.targetHandle &&
    prev.type === next.type &&
    prev.animated === next.animated &&
    prev.label === next.label &&
    prev.markerEnd === next.markerEnd &&
    prev.markerStart === next.markerStart &&
    styleEqual(prev.style as CSSProperties | undefined, next.style as CSSProperties | undefined) &&
    shallowEqualRecord(prev.data as Record<string, unknown> | undefined, next.data as Record<string, unknown> | undefined)
  )
}

/** Merge labeled edges — keep stable references when path highlight / styles unchanged. */
export function mergePageMapEdges(prev: Edge[], next: Edge[]): Edge[] {
  if (prev.length !== next.length) {
    return next
  }
  const prevById = new Map(prev.map(e => [e.id, e]))
  let changed = false
  const merged: Edge[] = []
  for (const e of next) {
    const old = prevById.get(e.id)
    if (old && isSamePageMapEdge(old, e)) {
      merged.push(old)
    } else {
      changed = true
      merged.push(e)
    }
  }
  if (!changed) {
    for (const p of prev) {
      if (!next.some(e => e.id === p.id)) {
        changed = true
        break
      }
    }
  }
  return changed ? merged : prev
}
