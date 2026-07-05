import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, type WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { detectJavaExecutable, ensureJdtLanguageServerInstalled, findJdtLauncher, getJdtRoot, jdtWorkspaceDataDir } from 'main/lsp/jdtlsBootstrap'
import { buildLanguageServerSpawnEnv, resolveTypeScriptLanguageServer } from 'main/lsp/resolveLanguageServerBin'
import { workspaceRootUri } from 'shared/fileUri'
import type { LspServerId, LspServerState } from 'shared/lsp/types'
import { createMessageConnection, type MessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

type ServerKey = string

type ManagedServer = {
  serverId: LspServerId
  rootPath: string
  connection: MessageConnection
  process: ChildProcessWithoutNullStreams
  state: LspServerState
  initialized: boolean
  initPromise?: Promise<void>
}

const servers = new Map<ServerKey, ManagedServer>()
const senderByKey = new Map<ServerKey, WebContents>()

function serverKey(serverId: LspServerId, rootPath: string): ServerKey {
  const normalized = path.resolve(rootPath).replace(/\\/g, '/').toLowerCase()
  return `${serverId}::${normalized}`
}

function emitState(sender: WebContents, serverId: LspServerId, rootPath: string, state: LspServerState, error?: string) {
  if (sender.isDestroyed()) return
  sender.send(IPC.LSP.STREAM_STATE, { serverId, rootUri: workspaceRootUri(rootPath), state, error })
}

function emitMessage(sender: WebContents, serverId: LspServerId, rootPath: string, message: string) {
  if (sender.isDestroyed()) return
  sender.send(IPC.LSP.STREAM_MESSAGE, { serverId, rootUri: workspaceRootUri(rootPath), message })
}

async function resolveJavaCommand(rootPath: string): Promise<{ command: string; args: string[] } | null> {
  const javaInfo = await detectJavaExecutable()
  if (!javaInfo) return null

  const install = await ensureJdtLanguageServerInstalled()
  if (!install.installed) throw new Error(install.error ?? 'JDT Language Server not installed')

  const jdtRoot = getJdtRoot()
  const launcher = findJdtLauncher(jdtRoot)
  if (!launcher) return null

  const configDir = path.join(jdtRoot, `config_${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}`)
  const workspaceData = jdtWorkspaceDataDir(rootPath)
  fs.mkdirSync(workspaceData, { recursive: true })

  return {
    command: javaInfo.java,
    args: [
      '-Declipse.application=org.eclipse.jdt.ls.core.id1',
      '-Declipse.product=org.eclipse.jdt.ls.core.product',
      '-Dosgi.bundles.defaultStartLevel=4',
      '-Dosgi.checkConfiguration=true',
      '-jar',
      launcher,
      '-configuration',
      configDir,
      '-data',
      workspaceData,
    ],
  }
}

const INIT_REQUEST_TIMEOUT_MS = 120_000

const startInflight = new Map<ServerKey, Promise<{ success: boolean; error?: string }>>()

function resolveWorkspaceTsserverPath(rootPath: string): string | undefined {
  const tsserver = path.join(rootPath, 'node_modules', 'typescript', 'lib', 'tsserver.js')
  return fs.existsSync(tsserver) ? tsserver : undefined
}

function disposeManagedServer(key: ServerKey, managed: ManagedServer): void {
  try {
    managed.connection.dispose()
  } catch {
    /* ignore */
  }
  try {
    if (!managed.process.killed) {
      managed.process.kill()
    }
  } catch {
    /* ignore */
  }
  servers.delete(key)
  managed.state = 'stopped'
  managed.initialized = false
  managed.initPromise = undefined
}

async function initializeServer(managed: ManagedServer, sender: WebContents): Promise<void> {
  const rootUri = workspaceRootUri(managed.rootPath)
  const tsserverPath = managed.serverId === 'typescript' ? resolveWorkspaceTsserverPath(managed.rootPath) : undefined
  const initParams = {
    processId: process.pid,
    clientInfo: { name: 'honey-badger', version: app.getVersion() },
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: path.basename(managed.rootPath) }],
    capabilities: {
      textDocument: {
        completion: {
          completionItem: {
            snippetSupport: true,
            documentationFormat: ['markdown', 'plaintext'],
            deprecatedSupport: true,
            preselectSupport: true,
            insertReplaceSupport: true,
            resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
          },
          contextSupport: true,
        },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        synchronization: { dynamicRegistration: true, willSave: true, didSave: true },
        publishDiagnostics: { relatedInformation: true },
        definition: { linkSupport: true },
        references: {},
        formatting: {},
        signatureHelp: { signatureInformation: { parameterInformation: { labelOffsetSupport: true } } },
        rename: { prepareSupport: true },
        codeAction: {
          codeActionLiteralSupport: {
            actionItemKind: {
              valueSet: ['quickfix', 'refactor', 'refactor.extract', 'source', 'source.organizeImports'],
            },
          },
          resolveSupport: { properties: ['edit', 'command'] },
        },
        codeLens: { dynamicRegistration: true },
        inlayHint: { dynamicRegistration: true },
      },
      workspace: {
        executeCommand: { dynamicRegistration: true },
      },
    },
    initializationOptions:
      managed.serverId === 'typescript'
        ? {
          ...(tsserverPath ? { tsserver: { path: tsserverPath } } : {}),
          preferences: {
            importModuleSpecifierPreference: 'relative',
            includeInlayParameterNameHints: 'all',
            includeInlayVariableTypeHints: true,
            includeInlayPropertyDeclarationTypeHints: true,
            includeInlayFunctionLikeReturnTypeHints: true,
            includeInlayEnumMemberValueHints: true,
          },
        }
        : {},
  }

  let initTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      managed.connection.sendRequest('initialize', initParams),
      new Promise<never>((_resolve, reject) => {
        initTimeout = setTimeout(() => reject(new Error('Language server initialize timed out')), INIT_REQUEST_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (initTimeout) clearTimeout(initTimeout)
  }
  managed.connection.sendNotification('initialized', {})
  managed.initialized = true
  managed.state = 'ready'
  if (managed.serverId === 'typescript') {
    l.info(`[lsp:typescript] ready — workspace ${rootUri}${tsserverPath ? `, tsserver ${tsserverPath}` : ''}`)
  } else {
    l.info(`[lsp:${managed.serverId}] ready — workspace ${rootUri}`)
  }
  emitState(sender, managed.serverId, managed.rootPath, 'ready')
}

function attachConnection(managed: ManagedServer, sender: WebContents) {
  const key = serverKey(managed.serverId, managed.rootPath)

  managed.connection.onNotification('textDocument/publishDiagnostics', params => {
    emitMessage(sender, managed.serverId, managed.rootPath, JSON.stringify({ method: 'textDocument/publishDiagnostics', params }))
  })

  managed.connection.onUnhandledNotification(notification => {
    emitMessage(sender, managed.serverId, managed.rootPath, JSON.stringify({ method: notification.method, params: notification.params }))
  })

  managed.connection.onError(err => {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('EPIPE') || message.includes('ECONNRESET')) {
      if (!managed.initialized) {
        managed.state = 'error'
        emitState(sender, managed.serverId, managed.rootPath, 'error', 'Language server connection closed')
        disposeManagedServer(key, managed)
      }
      return
    }
    l.error(`[lsp:${managed.serverId}] connection error`, err)
  })

  managed.connection.listen()
  void key
}

async function spawnServer(serverId: LspServerId, rootPath: string): Promise<ManagedServer> {
  const spawnSpec = serverId === 'typescript' ? resolveTypeScriptLanguageServer() : await resolveJavaCommand(rootPath)
  if (!spawnSpec) {
    throw new Error(serverId === 'java' ? 'JDT Language Server not installed or JDK 17+ not found' : 'Language server not found')
  }

  const child = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: rootPath,
    stdio: 'pipe',
    windowsHide: true,
    shell: false,
    env: buildLanguageServerSpawnEnv(spawnSpec.command),
  })

  l.info(`[lsp:${serverId}] spawning`, spawnSpec.command, spawnSpec.args.join(' '))

  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin))
  const managed: ManagedServer = {
    serverId,
    rootPath,
    connection,
    process: child,
    state: 'starting',
    initialized: false,
  }

  child.stderr.on('data', chunk => {
    const text = String(chunk).trim()
    if (text) l.warn(`[lsp:${serverId}]`, text)
  })
  child.on('error', err => {
    l.error(`[lsp:${serverId}] process error`, err)
    managed.state = 'error'
  })
  child.on('exit', code => {
    l.warn(`[lsp:${serverId}] exited`, code)
    managed.state = 'stopped'
    managed.initialized = false
    const sender = senderByKey.get(serverKey(serverId, rootPath))
    if (sender && code !== 0 && code != null) {
      emitState(sender, serverId, rootPath, 'error', `Language server exited (${code})`)
    }
  })

  const sender = senderByKey.get(serverKey(serverId, rootPath))
  if (sender) attachConnection(managed, sender)
  else connection.listen()

  return managed
}

export async function startLanguageServer(sender: WebContents, serverId: LspServerId, rootPath: string): Promise<{ success: boolean; error?: string }> {
  const normalizedRoot = path.resolve(rootPath)
  if (!fs.existsSync(normalizedRoot)) return { success: false, error: 'Workspace root not found' }

  const key = serverKey(serverId, normalizedRoot)
  senderByKey.set(key, sender)

  const existing = servers.get(key)
  if (existing?.initialized) {
    emitState(sender, serverId, normalizedRoot, 'ready')
    return { success: true }
  }

  const inflight = startInflight.get(key)
  if (inflight) return inflight

  const promise = startLanguageServerInner(sender, serverId, normalizedRoot, key)
  startInflight.set(key, promise)
  try {
    return await promise
  } finally {
    startInflight.delete(key)
  }
}

async function startLanguageServerInner(
  sender: WebContents,
  serverId: LspServerId,
  normalizedRoot: string,
  key: ServerKey
): Promise<{ success: boolean; error?: string }> {
  const existing = servers.get(key)
  if (existing?.initialized) {
    emitState(sender, serverId, normalizedRoot, 'ready')
    return { success: true }
  }

  if (existing?.initPromise) {
    try {
      await existing.initPromise
    } catch {
      /* failure handled below — stale entry may be disposed */
    }
    const afterWait = servers.get(key)
    if (afterWait?.initialized) {
      emitState(sender, serverId, normalizedRoot, 'ready')
      return { success: true }
    }
    if (afterWait) disposeManagedServer(key, afterWait)
  } else if (existing && !existing.initialized) {
    disposeManagedServer(key, existing)
  }

  emitState(sender, serverId, normalizedRoot, 'starting')
  l.info(`[lsp:${serverId}] starting workspace ${workspaceRootUri(normalizedRoot)}`)
  try {
    const managed = await spawnServer(serverId, normalizedRoot)
    servers.set(key, managed)

    if (managed.process.exitCode != null) {
      const error = `Language server exited (${managed.process.exitCode})`
      emitState(sender, serverId, normalizedRoot, 'error', error)
      disposeManagedServer(key, managed)
      return { success: false, error }
    }

    let rejectEarlyExit: ((err: Error) => void) | undefined
    const earlyExit = new Promise<never>((_, reject) => {
      rejectEarlyExit = reject
    })
    const onEarlyExit = (code: number | null) => {
      rejectEarlyExit?.(new Error(`Language server exited (${code ?? 'unknown'})`))
    }
    managed.process.once('exit', onEarlyExit)

    managed.initPromise = Promise.race([initializeServer(managed, sender), earlyExit])
      .then(() => undefined)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err)
        managed.state = 'error'
        emitState(sender, serverId, normalizedRoot, 'error', message)
        disposeManagedServer(key, managed)
        throw err
      })
      .finally(() => {
        managed.process.removeListener('exit', onEarlyExit)
      })

    try {
      await managed.initPromise
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitState(sender, serverId, normalizedRoot, 'error', message)
    return { success: false, error: message }
  }
}

export function stopLanguageServer(serverId: LspServerId, rootPath: string): void {
  const key = serverKey(serverId, path.resolve(rootPath))
  const managed = servers.get(key)
  if (!managed) return
  disposeManagedServer(key, managed)
  senderByKey.delete(key)
}

export function sendLanguageServerMessage(serverId: LspServerId, rootPath: string, message: string): void {
  const key = serverKey(serverId, path.resolve(rootPath))
  const managed = servers.get(key)
  if (!managed?.initialized) return
  try {
    const parsed = JSON.parse(message) as { method?: string; params?: unknown; id?: number }
    if (parsed.method?.startsWith('$/')) return
    if (parsed.id != null && parsed.method) {
      void managed.connection
        .sendRequest(parsed.method, parsed.params ?? {})
        .then(result => {
          const sender = senderByKey.get(key)
          if (!sender) return
          emitMessage(sender, serverId, managed.rootPath, JSON.stringify({ id: parsed.id, result }))
        })
        .catch(err => {
          const sender = senderByKey.get(key)
          if (!sender) return
          emitMessage(sender, serverId, managed.rootPath, JSON.stringify({ id: parsed.id, error: { message: String(err) } }))
        })
      return
    }
    if (parsed.method) {
      managed.connection.sendNotification(parsed.method, parsed.params ?? {})
    }
  } catch (err) {
    l.warn('sendLanguageServerMessage parse error:', err)
  }
}

export function stopAllLanguageServers(): void {
  for (const key of [...servers.keys()]) {
    const managed = servers.get(key)
    if (!managed) continue
    stopLanguageServer(managed.serverId, managed.rootPath)
  }
}

export { detectJavaExecutable, ensureJdtLanguageServerInstalled }
