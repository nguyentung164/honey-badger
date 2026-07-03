export type ExplorerClipboardEntry = {
  paths: string[]
  cut: boolean
  repoCwd: string
}

let explorerClipboard: ExplorerClipboardEntry | null = null

type ClipboardListener = () => void
const clipboardListeners = new Set<ClipboardListener>()

function notifyClipboardListeners(): void {
  for (const listener of clipboardListeners) {
    listener()
  }
}

export function subscribeExplorerClipboard(listener: ClipboardListener): () => void {
  clipboardListeners.add(listener)
  return () => clipboardListeners.delete(listener)
}

export function setExplorerClipboard(entry: ExplorerClipboardEntry) {
  explorerClipboard = entry
  notifyClipboardListeners()
}

export function getExplorerClipboard(): ExplorerClipboardEntry | null {
  return explorerClipboard
}

export function clearExplorerClipboard() {
  explorerClipboard = null
  notifyClipboardListeners()
}

export function parentRelativeDir(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = norm.lastIndexOf('/')
  return idx < 0 ? '' : norm.slice(0, idx)
}

export function joinRelativePath(parent: string, name: string): string {
  const trimmed = name.trim().replace(/\\/g, '/')
  if (!trimmed) return parent
  return parent ? `${parent.replace(/\/+$/, '')}/${trimmed}` : trimmed
}

export function normalizeExplorerPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/** True when `path` is `ancestor` or nested under it. Empty ancestor = workspace root. */
export function isDescendantOrEqual(ancestor: string, path: string): boolean {
  const a = normalizeExplorerPath(ancestor)
  const p = normalizeExplorerPath(path)
  if (!a) return true
  return p === a || p.startsWith(`${a}/`)
}

export function pasteDestinationPath(targetDir: string, src: string): string {
  const baseName = src.split('/').pop() ?? src
  return joinRelativePath(targetDir, baseName)
}

export function isSameExplorerPath(a: string, b: string): boolean {
  return normalizeExplorerPath(a) === normalizeExplorerPath(b)
}

/** Block cut-paste into the item itself or one of its descendants. */
export function isInvalidCutPasteTarget(src: string, targetDir: string): boolean {
  return isDescendantOrEqual(src, targetDir)
}
