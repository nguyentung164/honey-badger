import { randomUUID } from 'node:crypto'
import { app, type WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import type { TerminalCreateOptions, TerminalCreateResult } from 'shared/terminal/types'
import { getPtyHostClient, warmPtyHost } from './ptyHost/ptyHostClient'
import { buildShellIntegrationConfig } from './shellIntegrationInjection'

const ownerCleanup = new Map<number, () => void>()

function ensureOwnerBridge(owner: WebContents): void {
  const ownerId = owner.id
  if (ownerCleanup.has(ownerId)) return

  const client = getPtyHostClient()
  const unregister = client.registerOwner(
    ownerId,
    payload => {
      if (owner.isDestroyed()) return
      try {
        owner.send(IPC.TERMINAL.STREAM_DATA, payload)
      } catch (err) {
        l.warn(`[terminal] Failed to stream data for ${payload.id}:`, err)
      }
    },
    payload => {
      if (owner.isDestroyed()) return
      try {
        owner.send(IPC.TERMINAL.STREAM_EXIT, payload)
      } catch (err) {
        l.warn(`[terminal] Failed to stream exit for ${payload.id}:`, err)
      }
    }
  )

  ownerCleanup.set(ownerId, unregister)
}

function cleanupOwner(ownerId: number): void {
  ownerCleanup.get(ownerId)?.()
  ownerCleanup.delete(ownerId)
  void getPtyHostClient().detachOwner(ownerId)
}

export function initTerminalManager(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('destroyed', () => {
      cleanupOwner(contents.id)
    })
  })

  app.on('before-quit', () => {
    void getPtyHostClient().shutdown()
  })

  void warmPtyHost()
}

export async function createTerminal(owner: WebContents, opts: TerminalCreateOptions = {}): Promise<TerminalCreateResult> {
  ensureOwnerBridge(owner)
  const id = opts.id ?? randomUUID()
  const shouldPersist = opts.shouldPersist ?? false
  const client = getPtyHostClient()
      const shellIntegration = buildShellIntegrationConfig({
        enabled: opts.shellIntegrationEnabled !== false,
        shellProfileId: opts.shellProfileId,
      })
      if (shellIntegration.enabled) {
        l.info(`[terminal] Shell integration enabled for ${opts.shellProfileId ?? 'powershell'}`)
      }
  const result = await client.createTerminal(owner.id, {
    ...opts,
    id,
    shouldPersist,
    shellIntegration,
  })
  if (result.success) {
    l.info(`[terminal] ${result.attached ? 'Attached' : 'Created'} session ${result.id}`)
  }
  return result
}

export function writeTerminal(owner: WebContents, id: string, data: string): boolean {
  getPtyHostClient().writeTerminal(owner.id, id, data)
  return true
}

export function resizeTerminal(owner: WebContents, id: string, cols: number, rows: number): boolean {
  getPtyHostClient().resizeTerminal(owner.id, id, cols, rows)
  return true
}

export function detachTerminal(owner: WebContents, id: string): boolean {
  getPtyHostClient().detachTerminal(owner.id, id)
  return true
}

export async function destroyTerminal(owner: WebContents, id: string): Promise<boolean> {
  return getPtyHostClient().destroyTerminal(owner.id, id)
}
