import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, type WebContents } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { detectJavaExecutable, ensureJdtLanguageServerInstalled, findJdtLauncher, getJdtRoot, jdtWorkspaceDataDir } from 'main/lsp/jdtlsBootstrap'
import { buildLanguageServerSpawnEnv, resolveTypeScriptLanguageServer, resolveWorkspaceTsserverPath, type TypeScriptServerBackend } from 'main/lsp/resolveLanguageServerBin'
import { workspaceRootUri } from 'shared/fileUri'
import type { LspServerCapabilities, LspServerId, LspServerState, TypeScriptUserPreferencesConfig } from 'shared/lsp/types'
import {
  buildTypeScriptNativeInitUserPreferences,
  buildTypeScriptTlsInitPreferences,
  buildTypeScriptWorkspaceSettings,
} from 'shared/lsp/typescriptPreferences'
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
  typescriptBackend?: TypeScriptServerBackend
  capabilities?: LspServerCapabilities
  typescriptUserPreferences?: TypeScriptUserPreferencesConfig
}
const servers = new Map<ServerKey, ManagedServer>()
const senderByKey = new Map<ServerKey, WebContents>()
function serverKey(serverId: LspServerId, rootPath: string): ServerKey {
  const normalized = path.resolve(rootPath).replace(/\\/g, '/').toLowerCase()
  return `${serverId}::${normalized}`
}
function emitState(
  sender: WebContents,
  serverId: LspServerId,
  rootPath: string,
  state: LspServerState,
  error?: string,
  capabilities?: LspServerCapabilities
) {
  if (sender.isDestroyed()) return
  sender.send(IPC.LSP.STREAM_STATE, { serverId, rootUri: workspaceRootUri(rootPath), state, error, capabilities })
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
async function initializeServer(
  managed: ManagedServer,
  sender: WebContents,
  typescriptUserPreferences?: TypeScriptUserPreferencesConfig
): Promise<void> {
  const rootUri = workspaceRootUri(managed.rootPath)
  const usesTls = managed.serverId !== 'typescript' || managed.typescriptBackend !== 'typescript-native'
  const tsserverPath = managed.serverId === 'typescript' && usesTls ? resolveWorkspaceTsserverPath(managed.rootPath) : undefined
  const tsPrefs = typescriptUserPreferences ?? { preferGoToSourceDefinition: false }
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
            codeActionKind: {
              valueSet: ['quickfix', 'refactor', 'refactor.extract', 'source', 'source.organizeImports'],
            },
          },
          resolveSupport: { properties: ['edit', 'command'] },
        },
        codeLens: { dynamicRegistration: true },
        inlayHint: { dynamicRegistration: true },
      },
      workspace: {
        configuration: true,
        executeCommand: { dynamicRegistration: true },
      },
    },
    initializationOptions:
      managed.serverId === 'typescript'
        ? usesTls
          ? {
              ...(tsserverPath ? { tsserver: { path: tsserverPath } } : {}),
              preferences: buildTypeScriptTlsInitPreferences(tsPrefs),
            }
          : {
              userPreferences: buildTypeScriptNativeInitUserPreferences(tsPrefs),
            }
        : {},
  }
  let initTimeout: ReturnType<typeof setTimeout> | undefined
  let initResult: { capabilities?: LspServerCapabilities & { experimental?: LspServerCapabilities } } | undefined
  try {
    initResult = await Promise.race([
      managed.connection.sendRequest('initialize', initParams),
      new Promise<never>((_resolve, reject) => {
        initTimeout = setTimeout(() => reject(new Error('Language server initialize timed out')), INIT_REQUEST_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (initTimeout) clearTimeout(initTimeout)
  }
  const capabilities: LspServerCapabilities | undefined =
    initResult?.capabilities?.customSourceDefinitionProvider != null
      ? { customSourceDefinitionProvider: initResult.capabilities.customSourceDefinitionProvider }
      : initResult?.capabilities?.experimental?.customSourceDefinitionProvider != null
        ? { customSourceDefinitionProvider: initResult.capabilities.experimental.customSourceDefinitionProvider }
        : managed.typescriptBackend === 'typescript-native'
          ? { customSourceDefinitionProvider: true }
          : undefined
  managed.capabilities = capabilities
  managed.typescriptUserPreferences = tsPrefs
  managed.connection.sendNotification('initialized', {})
  managed.initialized = true
  managed.state = 'ready'
  if (managed.serverId === 'typescript') {
    const backend = managed.typescriptBackend ?? 'typescript-language-server'
    l.info(
      `[lsp:typescript] ready — workspace ${rootUri}, backend ${backend}${tsserverPath ? `, tsserver ${tsserverPath}` : ''}`,
    )
  } else {
    l.info(`[lsp:${managed.serverId}] ready — workspace ${rootUri}`)
  }
  emitState(sender, managed.serverId, managed.rootPath, 'ready', undefined, capabilities)
}
function attachConnection(managed: ManagedServer, sender: WebContents) {
  const key = serverKey(managed.serverId, managed.rootPath)
  if (managed.serverId === 'typescript') {
    managed.connection.onRequest('workspace/configuration', (params: { items?: Array<{ section?: string }> }) => {
      const prefs = managed.typescriptUserPreferences ?? { preferGoToSourceDefinition: false }
      const settings = buildTypeScriptWorkspaceSettings(prefs)
      const items = params?.items ?? []
      return items.map(item => {
        const section = item.section ?? ''
        if (section === 'js/ts' || section === 'typescript' || section === 'javascript') {
          return settings[section] ?? {}
        }
        return {}
      })
    })
  }
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
  const spawnSpec = serverId === 'typescript' ? resolveTypeScriptLanguageServer(rootPath) : await resolveJavaCommand(rootPath)
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
    typescriptBackend: serverId === 'typescript' ? spawnSpec.backend : undefined,
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
export async function startLanguageServer(
  sender: WebContents,
  serverId: LspServerId,
  rootPath: string,
  typescriptUserPreferences?: TypeScriptUserPreferencesConfig
): Promise<{ success: boolean; error?: string; capabilities?: LspServerCapabilities }> {
  const normalizedRoot = path.resolve(rootPath)
  if (!fs.existsSync(normalizedRoot)) return { success: false, error: 'Workspace root not found' }
  const key = serverKey(serverId, normalizedRoot)
  senderByKey.set(key, sender)
  const existing = servers.get(key)
  if (existing?.initialized) {
    emitState(sender, serverId, normalizedRoot, 'ready', undefined, existing.capabilities)
    return { success: true, capabilities: existing.capabilities }
  }
  const inflight = startInflight.get(key)
  if (inflight) return inflight
  const promise = startLanguageServerInner(sender, serverId, normalizedRoot, key, typescriptUserPreferences)
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
  key: ServerKey,
  typescriptUserPreferences?: TypeScriptUserPreferencesConfig
): Promise<{ success: boolean; error?: string; capabilities?: LspServerCapabilities }> {
  const existing = servers.get(key)
  if (existing?.initialized) {
    emitState(sender, serverId, normalizedRoot, 'ready', undefined, existing.capabilities)
    return { success: true, capabilities: existing.capabilities }
  }
  if (existing?.initPromise) {
    try {
      await existing.initPromise
    } catch {
      /* failure handled below — stale entry may be disposed */
    }
    const afterWait = servers.get(key)
    if (afterWait?.initialized) {
      emitState(sender, serverId, normalizedRoot, 'ready', undefined, afterWait.capabilities)
      return { success: true, capabilities: afterWait.capabilities }
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
    managed.initPromise = Promise.race([initializeServer(managed, sender, typescriptUserPreferences), earlyExit])
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
    return { success: true, capabilities: managed.capabilities }
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
    if (parsed.method === 'workspace/didChangeConfiguration' && managed.serverId === 'typescript') {
      const settings = (parsed.params as { settings?: Record<string, Record<string, unknown>> } | undefined)?.settings
      const jsTs = settings?.['js/ts']
      if (jsTs && typeof jsTs.preferGoToSourceDefinition === 'boolean') {
        managed.typescriptUserPreferences = {
          preferGoToSourceDefinition: jsTs.preferGoToSourceDefinition,
        }
      }
    }
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