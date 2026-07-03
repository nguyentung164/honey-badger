import { sendLanguageServerMessage } from 'main/lsp/LanguageServerManager'
import type { LspSendPayload } from 'shared/lsp/types'
import { fileUriToPath } from 'shared/fileUri'

const queue: LspSendPayload[] = []
let draining = false

/** Non-blocking LSP send queue — keeps renderer IPC off the critical path (VS Code extension host pattern). */
export function enqueueLanguageServerMessage(payload: LspSendPayload): void {
  queue.push(payload)
  if (draining) return
  draining = true
  const drain = () => {
    while (queue.length > 0) {
      const next = queue.shift()!
      sendLanguageServerMessage(next.serverId, fileUriToPath(next.rootUri), next.message)
    }
    draining = false
  }
  if (typeof setImmediate === 'function') {
    setImmediate(drain)
  } else {
    setTimeout(drain, 0)
  }
}
