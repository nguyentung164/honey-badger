import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import l from 'electron-log'
import type { PtyHostCreateOptions, PtyHostCreateResult, PtyHostInvokableRequestInput, PtyHostRequest, PtyHostResponse } from 'shared/terminal/ptyHostProtocol'
import type { TerminalCreateOptions, TerminalCreateResult } from 'shared/terminal/types'

type PendingRequest = {
  resolve: (value: PtyHostCreateResult | void) => void
  reject: (error: Error) => void
}

type DataListener = (payload: { id: string; data: string }) => void
type ExitListener = (payload: { id: string; exitCode: number; signal?: number }) => void

function resolvePtyHostPath(): string {
  return path.join(__dirname, 'ptyHost.js')
}

export class PtyHostClient {
  private process: UtilityProcess | null = null
  private ready = false
  private readyPromise: Promise<void> | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private readonly dataListeners = new Map<number, Set<DataListener>>()
  private readonly exitListeners = new Map<number, Set<ExitListener>>()

  async ensureStarted(): Promise<void> {
    if (this.ready) return
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const entry = resolvePtyHostPath()
      const child = utilityProcess.fork(entry, [], {
        serviceName: 'Honey Badger Pty Host',
        stdio: 'pipe',
      })

      const timeout = setTimeout(() => {
        this.readyPromise = null
        try {
          child.kill()
        } catch {
          // best-effort
        }
        this.process = null
        reject(new Error('PTY host failed to start within 15s'))
      }, 15_000)

      child.stdout?.on('data', chunk => {
        l.debug('[pty-host:stdout]', String(chunk))
      })
      child.stderr?.on('data', chunk => {
        const text = String(chunk)
        if (text.includes('AttachConsole failed') || text.includes('conpty_console_list_agent')) return
        l.warn('[pty-host:stderr]', text)
      })

      child.on('exit', code => {
        l.warn(`[pty-host] exited with code ${code}`)
        this.process = null
        this.ready = false
        this.readyPromise = null
        for (const pending of this.pending.values()) {
          pending.reject(new Error('PTY host exited'))
        }
        this.pending.clear()
      })

      child.on('message', (message: PtyHostResponse) => {
        if (message.kind === 'ready') {
          clearTimeout(timeout)
          this.ready = true
          resolve()
          return
        }

        if (message.kind === 'data') {
          for (const listeners of this.dataListeners.values()) {
            for (const listener of listeners) {
              listener({ id: message.id, data: message.data })
            }
          }
          return
        }

        if (message.kind === 'exit') {
          for (const listeners of this.exitListeners.values()) {
            for (const listener of listeners) {
              listener({ id: message.id, exitCode: message.exitCode, signal: message.signal })
            }
          }
          return
        }

        if (message.kind === 'result') {
          const pending = this.pending.get(message.requestId)
          if (!pending) return
          this.pending.delete(message.requestId)
          if (!message.ok) {
            pending.reject(new Error(message.error))
            return
          }
          pending.resolve(message.data)
        }
      })

      this.process = child
    })

    return this.readyPromise
  }

  private post(request: PtyHostRequest): void {
    if (!this.process) throw new Error('PTY host is not running')
    this.process.postMessage(request)
  }

  private invoke(
    request: { kind: 'create'; ownerId: number; opts: PtyHostCreateOptions; requestId?: string }
  ): Promise<PtyHostCreateResult>
  private invoke(
    request: { kind: 'attach'; ownerId: number; id: string; cols: number; rows: number; requestId?: string }
  ): Promise<PtyHostCreateResult>
  private invoke(
    request: { kind: 'destroy'; ownerId: number; id: string; requestId?: string }
  ): Promise<void>
  private invoke(request: PtyHostInvokableRequestInput & { requestId?: string }): Promise<PtyHostCreateResult | void> {
    const requestId = request.requestId ?? randomUUID()
    return new Promise<PtyHostCreateResult | void>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: value => resolve(value as PtyHostCreateResult | void),
        reject,
      })
      this.post({ ...request, requestId } as PtyHostRequest)
    })
  }

  registerOwner(ownerId: number, onData: DataListener, onExit: ExitListener): () => void {
    let dataSet = this.dataListeners.get(ownerId)
    if (!dataSet) {
      dataSet = new Set()
      this.dataListeners.set(ownerId, dataSet)
    }
    dataSet.add(onData)

    let exitSet = this.exitListeners.get(ownerId)
    if (!exitSet) {
      exitSet = new Set()
      this.exitListeners.set(ownerId, exitSet)
    }
    exitSet.add(onExit)

    return () => {
      dataSet?.delete(onData)
      exitSet?.delete(onExit)
      if (dataSet && dataSet.size === 0) this.dataListeners.delete(ownerId)
      if (exitSet && exitSet.size === 0) this.exitListeners.delete(ownerId)
    }
  }

  async createTerminal(ownerId: number, opts: TerminalCreateOptions & { id: string; shouldPersist: boolean }): Promise<TerminalCreateResult> {
    await this.ensureStarted()

    try {
      const hostOpts: PtyHostCreateOptions = {
        ...opts,
        id: opts.id,
        shouldPersist: opts.shouldPersist,
        attach: false,
      }
      const data = await this.invoke({
        kind: 'create',
        ownerId,
        opts: hostOpts,
      })
      return {
        success: true,
        id: data.id,
        attached: data.attached,
        replay: data.replay,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  detachTerminal(ownerId: number, id: string): void {
    if (!this.ready) return
    this.post({ kind: 'detach', id, ownerId })
  }

  destroyTerminal(ownerId: number, id: string): Promise<boolean> {
    return this.ensureStarted()
      .then(() =>
        this.invoke({
          kind: 'destroy',
          ownerId,
          id,
        })
      )
      .then(() => true)
      .catch(err => {
        l.warn('[pty-host] destroy failed:', err)
        return false
      })
  }

  writeTerminal(ownerId: number, id: string, data: string): void {
    if (!this.ready) return
    this.post({ kind: 'write', id, ownerId, data })
  }

  resizeTerminal(ownerId: number, id: string, cols: number, rows: number): void {
    if (!this.ready) return
    this.post({ kind: 'resize', id, ownerId, cols, rows })
  }

  detachOwner(ownerId: number): void {
    if (!this.ready) return
    this.post({ kind: 'detachOwner', ownerId })
  }

  async shutdown(): Promise<void> {
    if (!this.ready || !this.process) return
    this.post({ kind: 'shutdown' })
    this.process.kill()
    this.process = null
    this.ready = false
    this.readyPromise = null
  }
}

let client: PtyHostClient | null = null

export function getPtyHostClient(): PtyHostClient {
  if (!client) {
    client = new PtyHostClient()
  }
  return client
}

export async function warmPtyHost(): Promise<void> {
  if (app.isReady()) {
    await getPtyHostClient().ensureStarted()
  }
}
