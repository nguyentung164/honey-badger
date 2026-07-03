type TerminalLaunchRequest = {
  absoluteCwd: string
}

type TerminalLaunchListener = (request: TerminalLaunchRequest) => void

const listeners = new Set<TerminalLaunchListener>()
let pendingRequest: TerminalLaunchRequest | null = null

function dispatch(request: TerminalLaunchRequest): void {
  for (const listener of listeners) {
    listener(request)
  }
}

export function requestTerminalAtPath(absoluteCwd: string): void {
  const trimmed = absoluteCwd.trim()
  if (!trimmed) return
  const request: TerminalLaunchRequest = { absoluteCwd: trimmed }
  if (listeners.size === 0) {
    pendingRequest = request
    return
  }
  dispatch(request)
}

export function subscribeTerminalLaunch(listener: TerminalLaunchListener): () => void {
  listeners.add(listener)
  if (pendingRequest) {
    const request = pendingRequest
    pendingRequest = null
    listener(request)
  }
  return () => listeners.delete(listener)
}
