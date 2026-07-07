import type { PtyHostCreateOptions, PtyHostCreateResult, PtyHostRequest, PtyHostResponse } from 'shared/terminal/ptyHostProtocol'
import { PtyOutputBuffer } from './outputBuffer'
import { TerminalProcess } from './terminalProcess'

type PersistentSession = {
  id: string
  shouldPersist: boolean
  owners: Set<number>
  process: TerminalProcess
  output: PtyOutputBuffer
  exited: boolean
  exitCode?: number
  exitSignal?: number
}

type PtyServiceCallbacks = {
  onData: (id: string, data: string) => void
  onExit: (id: string, exitCode: number, signal?: number) => void
}

export class PtyService {
  private readonly sessions = new Map<string, PersistentSession>()

  constructor(private readonly callbacks: PtyServiceCallbacks) {}

  handle(request: PtyHostRequest): PtyHostResponse | null {
    switch (request.kind) {
      case 'create':
        return this.handleCreate(request.requestId, request.ownerId, request.opts)
      case 'attach':
        return this.handleAttach(request.requestId, request.ownerId, request.id, request.cols, request.rows)
      case 'detach':
        this.detach(request.id, request.ownerId)
        return null
      case 'write':
        this.write(request.id, request.ownerId, request.data)
        return null
      case 'resize':
        this.resize(request.id, request.ownerId, request.cols, request.rows)
        return null
      case 'destroy':
        return this.handleDestroy(request.requestId, request.id, request.ownerId)
      case 'detachOwner':
        this.detachOwner(request.ownerId)
        return null
      case 'shutdown':
        this.shutdown()
        return null
      default:
        return null
    }
  }

  private handleCreate(requestId: string, ownerId: number, opts: PtyHostCreateOptions): PtyHostResponse {
    const existing = this.sessions.get(opts.id)
    if (existing && !existing.exited) {
      return this.attachSession(requestId, ownerId, existing, opts.cols, opts.rows)
    }

    if (existing?.exited) {
      this.sessions.delete(opts.id)
    }

    try {
      const output = new PtyOutputBuffer()
      const process = new TerminalProcess(opts.id, opts, {
        onData: data => {
          output.append(data)
          this.callbacks.onData(opts.id, data)
        },
        onExit: (exitCode, signal) => {
          const session = this.sessions.get(opts.id)
          if (session) {
            session.exited = true
            session.exitCode = exitCode
            session.exitSignal = signal
          }
          this.callbacks.onExit(opts.id, exitCode, signal)
          if (!opts.shouldPersist) {
            this.sessions.delete(opts.id)
          }
        },
      })

      const session: PersistentSession = {
        id: opts.id,
        shouldPersist: opts.shouldPersist,
        owners: new Set([ownerId]),
        process,
        output,
        exited: false,
      }
      this.sessions.set(opts.id, session)

      const result: PtyHostCreateResult = { id: opts.id, attached: false }
      return { kind: 'result', requestId, ok: true, data: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { kind: 'result', requestId, ok: false, error: message }
    }
  }

  private handleAttach(requestId: string, ownerId: number, id: string, cols: number, rows: number): PtyHostResponse {
    const session = this.sessions.get(id)
    if (!session || session.exited) {
      return { kind: 'result', requestId, ok: false, error: 'Terminal not found' }
    }
    return this.attachSession(requestId, ownerId, session, cols, rows)
  }

  private attachSession(
    requestId: string,
    ownerId: number,
    session: PersistentSession,
    cols?: number,
    rows?: number
  ): PtyHostResponse {
    session.owners.add(ownerId)
    if (typeof cols === 'number' && typeof rows === 'number') {
      session.process.resize(cols, rows)
    }
    const result: PtyHostCreateResult = {
      id: session.id,
      attached: true,
      replay: session.output.snapshot(),
    }
    return { kind: 'result', requestId, ok: true, data: result }
  }

  private detach(id: string, ownerId: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.owners.delete(ownerId)
    if (session.owners.size === 0 && !session.shouldPersist) {
      session.process.kill()
      this.sessions.delete(id)
    }
  }

  private detachOwner(ownerId: number): void {
    for (const [id, session] of this.sessions) {
      if (!session.owners.has(ownerId)) continue
      session.owners.delete(ownerId)
      if (session.owners.size === 0 && !session.shouldPersist) {
        session.process.kill()
        this.sessions.delete(id)
      }
    }
  }

  private write(id: string, ownerId: number, data: string): void {
    const session = this.sessions.get(id)
    if (!session || session.exited || !session.owners.has(ownerId)) return
    session.process.write(data)
  }

  private resize(id: string, ownerId: number, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session || session.exited || !session.owners.has(ownerId)) return
    session.process.resize(cols, rows)
  }

  private handleDestroy(requestId: string, id: string, ownerId: number): PtyHostResponse {
    const session = this.sessions.get(id)
    if (!session) {
      return { kind: 'result', requestId, ok: false, error: 'Terminal not found' }
    }
    if (!session.owners.has(ownerId) && session.owners.size > 0) {
      return { kind: 'result', requestId, ok: false, error: 'Terminal not owned by caller' }
    }
    session.process.kill()
    this.sessions.delete(id)
    return { kind: 'result', requestId, ok: true }
  }

  private shutdown(): void {
    for (const session of this.sessions.values()) {
      session.process.kill()
    }
    this.sessions.clear()
  }
}
