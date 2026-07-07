import type { TerminalCreateOptions } from './types'

export const PTY_REPLAY_BUFFER_BYTES = 512 * 1024

export type PtyHostCreateOptions = TerminalCreateOptions & {
  /** Stable tab id from renderer (UUID). */
  id: string
  shouldPersist: boolean
  /** Try to attach to an existing PTY with the same id instead of spawning. */
  attach?: boolean
}

export type PtyHostRequest =
  | { kind: 'create'; requestId: string; ownerId: number; opts: PtyHostCreateOptions }
  | { kind: 'attach'; requestId: string; ownerId: number; id: string; cols: number; rows: number }
  | { kind: 'detach'; id: string; ownerId: number }
  | { kind: 'write'; id: string; ownerId: number; data: string }
  | { kind: 'resize'; id: string; ownerId: number; cols: number; rows: number }
  | { kind: 'destroy'; requestId: string; id: string; ownerId: number }
  | { kind: 'detachOwner'; ownerId: number }
  | { kind: 'shutdown' }

/** Requests that expect a `result` response (omit `requestId` when sending via client). */
export type PtyHostInvokableRequest = Extract<PtyHostRequest, { requestId: string }>
export type PtyHostInvokableRequestInput = Omit<PtyHostInvokableRequest, 'requestId'>

export type PtyHostCreateResult = {
  id: string
  attached: boolean
  replay?: string
}

export type PtyHostResponse =
  | { kind: 'ready' }
  | { kind: 'result'; requestId: string; ok: true; data?: PtyHostCreateResult }
  | { kind: 'result'; requestId: string; ok: false; error: string }
  | { kind: 'data'; id: string; data: string }
  | { kind: 'exit'; id: string; exitCode: number; signal?: number }
