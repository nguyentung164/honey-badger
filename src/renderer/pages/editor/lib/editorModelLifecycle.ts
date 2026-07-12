/** VS Code `onDidOpenTextDocument` — fired when a text model is ready for LSP sync. */

export type TextModelReadyEvent = {
  repoCwd: string
  relativePath: string
  /** Cheap length (e.g. `model.getValueLength()`) — lets emit/consumers skip without materializing. */
  contentLength: number
  /** Lazy full text — call only when the document actually needs (re)sync to the server. */
  getContent: () => string
  languageId: string
  /** `attach` = active editor; `disk-reload` = background file refresh (no didOpen). */
  reason: 'attach' | 'disk-reload'
}

type TextModelReadyListener = (event: TextModelReadyEvent) => void

const listeners = new Set<TextModelReadyListener>()

export function onTextModelReady(listener: TextModelReadyListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitTextModelReady(event: TextModelReadyEvent): void {
  if (event.contentLength === 0) return
  for (const listener of listeners) {
    listener(event)
  }
}

/** FNV-1a sample — detects content changes without storing full buffer. */
export function textSyncFingerprint(text: string): string {
  if (text.length === 0) return ''
  let h = 2166136261
  const step = text.length > 8192 ? Math.ceil(text.length / 8192) : 1
  for (let i = 0; i < text.length; i += step) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${text.length}:${h >>> 0}`
}
