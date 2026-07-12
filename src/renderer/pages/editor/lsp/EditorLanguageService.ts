import type * as Monaco from 'monaco-editor'
import { toast as sonnerToast } from 'sonner'
import { countNewlines, fileUriToPath, isLargeFileByMetrics } from 'shared/fileUri'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import type { LspServerId } from 'shared/lsp/types'
import { buildTypeScriptWorkspaceSettings } from 'shared/lsp/typescriptPreferences'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import {
  computeBoundSpanAtPosition,
  definitionLinksToMonacoLocations,
  flattenDefinitionResponse,
  GO_TO_SOURCE_DEFINITION_ACTION_ID,
  LSP_SOURCE_DEFINITION_METHOD,
  mapLspDefinitionToMonacoLink,
  monacoPositionToLspDefinitionRequest,
} from '@/pages/editor/lib/definitionNavigation'
import { onTextModelReady, textSyncFingerprint } from '@/pages/editor/lib/editorModelLifecycle'
import { getModelText } from '@/pages/editor/lib/editorModelRegistry'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { relativePathFromDocumentUri } from '@/pages/editor/lib/resolveTypeScriptModule'
import { createBackgroundFlusher } from '@/pages/editor/lib/scheduleBackgroundWork'
import { canonicalizeFileUri, documentUriForPath, uriRootsMatch, workspaceRootUri } from '@/pages/editor/lsp/documentUri'
import {
  type LspRange,
  lspPositionToMonaco,
  lspRangeToMonaco,
  lspSeverityToMonaco,
  markerSeverityToLsp,
  monacoPositionToLsp,
  monacoRangeToLsp,
} from '@/pages/editor/lsp/lspMonacoConvert'
import { applyWorkspaceEditAsync, lspWorkspaceEditToMonaco, type WorkspaceEditPayload, workspaceEditFromCodeAction } from '@/pages/editor/lsp/lspWorkspaceEdit'

type ManagedDocument = {
  uri: string
  languageId: string
  version: number
  serverId: LspServerId
  lspEnabled: boolean
  openedOnServer: boolean
  syncedFingerprint: string
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

async function resolveDefinitionUri(rawUri: string, repoCwd: string, fromRelativePath: string | null): Promise<string> {
  const canonical = canonicalizeFileUri(rawUri)
  if (!canonical.startsWith('node:') || !fromRelativePath) return canonical
  const resolved = await window.api.system.resolve_node_module({
    specifier: canonical,
    cwd: repoCwd,
    fromRelativePath,
  })
  return resolved ? documentUriForPath(repoCwd, resolved) : canonical
}

type PendingRequest = {
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const LSP_LANGS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'java']
const TS_NAVIGATION_LANGS = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'])

export const LSP_EXECUTE_COMMAND_ID = 'honeybadger.lsp.executeCommand'

export type OrganizeImportsResult = 'success' | 'not_supported' | 'not_ready' | 'no_action' | 'failed'
export type FormatDocumentResult = OrganizeImportsResult

type LspTextEdit = {
  range: LspRange
  newText: string
}

type LspCompletionResolveData = {
  uri: string
  item: LspCompletionItem
}

type LspCodeActionResolveData = {
  uri: string
  action: LspCodeAction
}

type MonacoCodeActionWithStash = Monaco.languages.CodeAction & {
  _hbLsp?: LspCodeActionResolveData
}

type LspCompletionItem = {
  label: string | { label: string }
  kind?: number
  detail?: string
  documentation?: string | { value: string }
  insertText?: string
  insertTextFormat?: number
  sortText?: string
  filterText?: string
  textEdit?: { range: LspRange; newText: string }
  additionalTextEdits?: Array<{ range: LspRange; newText: string }>
  data?: unknown
}

type LspCodeAction = {
  title: string
  kind?: string
  isPreferred?: boolean
  edit?: WorkspaceEditPayload | null
  command?: { command: string; title?: string; arguments?: unknown[] }
  data?: unknown
}

type LspCodeLens = {
  range: LspRange
  command?: { title: string; command?: string; arguments?: unknown[] }
  data?: unknown
}

export class EditorLanguageService {
  private repoCwd = ''
  private rootUri = ''
  private documents = new Map<string, ManagedDocument>()
  private disposables: Monaco.IDisposable[] = []
  private monaco: typeof Monaco | null = null
  private serverReady: Record<LspServerId, boolean> = { typescript: false, java: false }
  private ensureServersPromise: Promise<boolean> | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()

  private unsubMessage: (() => void) | null = null
  private unsubState: (() => void) | null = null
  private wired = false
  private pendingDiagnostics = new Map<string, Monaco.editor.IMarkerData[]>()
  private diagnosticsRaf: number | null = null
  private changeFlusher = createBackgroundFlusher<{ relativePath: string; languageId: string }>(payload => this.flushDocumentChange(payload), 150)
  private pendingIncremental = new Map<
    string,
    { relativePath: string; languageId: string; changes: Array<{ range: LspRange; rangeLength: number; text: string }>; version: number }
  >()
  private codeLensData = new Map<string, LspCodeLens>()
  private nextLensId = 0
  private openTextDocumentInflight = new Map<string, Promise<void>>()
  private openTextDocumentGeneration = new Map<string, number>()
  private sourceDefinitionSupported = false
  private sourceDefinitionContextKeys = new Set<Monaco.editor.IContextKey<boolean>>()
  private settingsUnsub: (() => void) | null = null
  private lastSyncedTsPrefs: string | null = null

  /** LSP document version — single source: Monaco `ITextModel.getVersionId()`. */
  getModelVersion(relativePath: string): number {
    if (!this.repoCwd) return 1
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const model = this.getModelForUri(uri)
    return model?.getVersionId() ?? 1
  }

  /**
   * VS Code: `didClose` on tsserver when no editor tab references the file.
   */
  syncOpenTabs(repoCwd: string, openTextRelativePaths: readonly string[]): void {
    if (!repoCwd) return
    if (this.repoCwd && this.repoCwd !== repoCwd) return
    if (!this.repoCwd) {
      this.repoCwd = repoCwd
      this.rootUri = workspaceRootUri(repoCwd)
    }

    const open = new Set(openTextRelativePaths.map(normalizeRelativePath))
    for (const uri of [...this.documents.keys()]) {
      const rel = relativePathFromDocumentUri(uri, repoCwd)
      if (!rel) continue
      if (!open.has(normalizeRelativePath(rel))) {
        this.closeDocument(rel)
      }
    }
  }

  closeAllDocuments(): void {
    for (const uri of [...this.documents.keys()]) {
      if (!this.repoCwd) {
        this.documents.delete(uri)
        continue
      }
      const rel = relativePathFromDocumentUri(uri, this.repoCwd)
      if (rel) this.closeDocument(rel)
      else this.documents.delete(uri)
    }
    this.pendingIncremental.clear()
  }

  bind(repoCwd: string, monaco: typeof Monaco) {
    if (this.repoCwd && repoCwd && this.repoCwd !== repoCwd) {
      this.closeAllDocuments()
    }

    if (this.repoCwd === repoCwd && this.monaco === monaco && this.wired) {
      return
    }

    this.repoCwd = repoCwd
    this.rootUri = repoCwd ? workspaceRootUri(repoCwd) : ''
    this.monaco = monaco
    this.disposeProviders()
    this.clearPending()
    this.unsubMessage?.()
    this.unsubState?.()
    this.wired = false

    if (!repoCwd) return

    this.wireLsp(monaco)
  }

  /** Attach LSP IPC handlers and Monaco providers (navigation may call this eagerly). */
  private wireLsp(monaco: typeof Monaco): void {
    if (this.wired || this.monaco !== monaco || !this.repoCwd) return

    this.unsubMessage = window.api.lsp.onMessage(event => {
      if (!uriRootsMatch(event.rootUri, this.rootUri)) return
      try {
        const msg = JSON.parse(event.message) as {
          method?: string
          params?: { uri?: string; diagnostics?: unknown[] }
          id?: number
          result?: unknown
          error?: { message?: string }
        }

        if (msg.id != null) {
          const pending = this.pending.get(msg.id)
          if (pending) {
            clearTimeout(pending.timer)
            this.pending.delete(msg.id)
            pending.resolve(msg.error ? null : (msg.result ?? null))
          }
          return
        }

        if (msg.method === 'textDocument/publishDiagnostics' && msg.params?.uri && this.monaco) {
          const canonical = canonicalizeFileUri(msg.params.uri as string)
          if (!this.getModelForUri(canonical)) return
          const raw = (msg.params.diagnostics ?? []) as Array<{
            message: string
            severity?: number
            range: { start: { line: number; character: number }; end: { line: number; character: number } }
          }>
          const diagnostics: Monaco.editor.IMarkerData[] = raw.map(d => ({
            message: d.message,
            severity: lspSeverityToMonaco(d.severity),
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
          }))
          this.queueDiagnostics(canonical, diagnostics)
        }
      } catch {
        /* ignore */
      }
    })

    this.unsubState = window.api.lsp.onState(event => {
      if (!uriRootsMatch(event.rootUri, this.rootUri)) return
      if (event.state === 'ready') {
        this.serverReady[event.serverId] = true
        if (event.serverId === 'typescript') {
          if (event.capabilities?.customSourceDefinitionProvider) {
            this.setSourceDefinitionSupported(true)
          }
          this.lastSyncedTsPrefs = null
          const prefs = useEditorSettings.getState()
          void this.syncTypeScriptUserPreferences({
            preferGoToSourceDefinition: prefs.preferGoToSourceDefinition,
          })
        }
        if (import.meta.env.DEV) {
          console.info(`[lsp] ${event.serverId} ready (${event.rootUri})`)
        }
      }
      if (event.state === 'stopped' || event.state === 'error') {
        this.serverReady[event.serverId] = false
        if (import.meta.env.DEV && event.state === 'error') {
          console.warn(`[lsp] ${event.serverId} error:`, event.error ?? 'unknown')
        }
      }
    })

    this.settingsUnsub?.()
    this.settingsUnsub = useEditorSettings.subscribe(state => {
      void this.syncTypeScriptUserPreferences({
        preferGoToSourceDefinition: state.preferGoToSourceDefinition,
      })
    })

    this.registerProviders(monaco)
    this.wired = true
  }

  private queueDiagnostics(uri: string, diagnostics: Monaco.editor.IMarkerData[]) {
    const canonical = canonicalizeFileUri(uri)
    this.pendingDiagnostics.set(canonical, diagnostics)
    if (this.diagnosticsRaf != null) return
    this.diagnosticsRaf = requestAnimationFrame(() => {
      this.diagnosticsRaf = null
      const monaco = this.monaco
      if (!monaco) return
      for (const [diagUri, markers] of this.pendingDiagnostics) {
        const model = this.getModelForUri(diagUri)
        if (model) monaco.editor.setModelMarkers(model, 'lsp', markers)
      }
      this.pendingDiagnostics.clear()
    })
  }

  private getModelForUri(uri: string): Monaco.editor.ITextModel | null {
    const monaco = this.monaco
    if (!monaco) return null
    const canonical = canonicalizeFileUri(uri)
    return monaco.editor.getModel(monaco.Uri.parse(canonical))
  }

  private ensureServerFor(serverId: LspServerId) {
    if (serverId === 'java') {
      void this.ensureJavaServer()
      return
    }
    void this.ensureServers()
  }

  private async startLspServer(serverId: LspServerId): Promise<boolean> {
    if (!this.rootUri) return false
    try {
      const prefs = useEditorSettings.getState()
      const result = await window.api.lsp.start({
        serverId,
        rootUri: this.rootUri,
        typescriptUserPreferences: {
          preferGoToSourceDefinition: prefs.preferGoToSourceDefinition,
        },
      })
      if (result?.capabilities?.customSourceDefinitionProvider) {
        this.setSourceDefinitionSupported(true)
      }
      return result?.success === true
    } catch {
      return false
    }
  }

  private async ensureServers(): Promise<boolean> {
    if (this.serverReady.typescript) return true
    if (this.ensureServersPromise) return this.ensureServersPromise
    this.ensureServersPromise = this.startLspServer('typescript').finally(() => {
      this.ensureServersPromise = null
    })
    return this.ensureServersPromise
  }

  async ensureJavaServer() {
    await this.startLspServer('java')
  }

  private registerProviders(monaco: typeof Monaco) {
    const lookupDefinition = this.lookupDefinition.bind(this)

    this.disposables.push(
      monaco.languages.registerCompletionItemProvider(LSP_LANGS, {
        triggerCharacters: ['.', '"', "'", '/', '<', ':', '@'],
        provideCompletionItems: async (model, position, _context, token) => {
          if (!this.isLspEnabledForModel(model)) return { suggestions: [] }
          const uri = model.uri.toString()
          const result = await this.request(
            uri,
            'textDocument/completion',
            {
              textDocument: { uri },
              position: monacoPositionToLsp(position),
            },
            token
          )
          if (!result) return { suggestions: [] }
          const items = Array.isArray(result) ? result : ((result as { items?: LspCompletionItem[] }).items ?? [])
          const word = model.getWordUntilPosition(position)
          const defaultRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
          return {
            suggestions: items.map(item => this.mapCompletionItem(monaco, item, defaultRange, uri)),
          }
        },
        resolveCompletionItem: async (item, token) => {
          const stash = (item as Monaco.languages.CompletionItem & { data?: LspCompletionResolveData }).data
          if (!stash?.uri || !stash.item) return item
          const resolved = (await this.request(stash.uri, 'completionItem/resolve', stash.item, token)) as LspCompletionItem | null
          if (!resolved) return item
          const additionalTextEdits = resolved.additionalTextEdits?.map(te => ({
            range: lspRangeToMonaco(te.range),
            text: te.newText,
          }))
          const documentation = typeof resolved.documentation === 'string' ? resolved.documentation : resolved.documentation?.value
          return {
            ...item,
            detail: resolved.detail ?? item.detail,
            documentation,
            additionalTextEdits: additionalTextEdits ?? item.additionalTextEdits,
            insertText: resolved.textEdit?.newText ?? resolved.insertText ?? item.insertText,
            insertTextRules: resolved.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : item.insertTextRules,
          }
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerCodeActionProvider(
        LSP_LANGS,
        {
          provideCodeActions: async (model, range, context, token) => {
            if (!this.isLspEnabledForModel(model)) return { actions: [], dispose: () => { } }
            const uri = model.uri.toString()
            const diagnostics = context.markers.map(m => ({
              range: monacoRangeToLsp(new monaco.Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)),
              message: m.message,
              severity: markerSeverityToLsp(m.severity),
              source: m.source,
            }))
            const only = context.only ? [context.only] : undefined
            const result = (await this.request(
              uri,
              'textDocument/codeAction',
              {
                textDocument: { uri },
                range: monacoRangeToLsp(range),
                context: { diagnostics, only },
              },
              token
            )) as LspCodeAction[] | null
            if (!result?.length) return { actions: [], dispose: () => { } }
            return {
              actions: result.map(action => {
                const editPayload = workspaceEditFromCodeAction(action)
                const monacoAction: MonacoCodeActionWithStash = {
                  title: action.title,
                  kind: action.kind,
                  isPreferred: action.isPreferred,
                  diagnostics: context.markers,
                  edit: editPayload ? lspWorkspaceEditToMonaco(monaco, editPayload) : undefined,
                  command: action.command?.command ? this.lspCommand(action.command, action.title) : undefined,
                  _hbLsp: { uri, action },
                }
                return monacoAction
              }),
              dispose: () => { },
            }
          },
          resolveCodeAction: async (codeAction, token) => {
            const stash = (codeAction as MonacoCodeActionWithStash)._hbLsp
            if (!stash || !this.monaco) return codeAction
            const resolved = (await this.request(stash.uri, 'codeAction/resolve', stash.action, token)) as LspCodeAction | null
            if (!resolved) return codeAction
            const editPayload = workspaceEditFromCodeAction(resolved)
            return {
              ...codeAction,
              edit: editPayload ? lspWorkspaceEditToMonaco(this.monaco, editPayload) : codeAction.edit,
              command: resolved.command?.command ? this.lspCommand(resolved.command, resolved.title) : codeAction.command,
            }
          },
        },
        {
          providedCodeActionKinds: ['quickfix', 'source', 'source.organizeImports'],
        }
      )
    )

    this.disposables.push(
      monaco.languages.registerCodeLensProvider(LSP_LANGS, {
        provideCodeLenses: async (model, token) => {
          if (!this.isLspEnabledForModel(model)) return { lenses: [], dispose: () => { } }
          const uri = model.uri.toString()
          const result = (await this.request(
            uri,
            'textDocument/codeLens',
            {
              textDocument: { uri },
            },
            token
          )) as LspCodeLens[] | null
          if (!result?.length) return { lenses: [], dispose: () => { } }
          this.codeLensData.clear()
          const lenses = result.map(item => {
            const id = String(this.nextLensId++)
            this.codeLensData.set(id, item)
            return {
              range: lspRangeToMonaco(item.range),
              id,
              command: item.command ? this.lspCommand(item.command, item.command.title, id) : undefined,
            }
          })
          return { lenses, dispose: () => { } }
        },
        resolveCodeLens: async (model, codeLens, token) => {
          if (!codeLens.id || !this.isLspEnabledForModel(model)) return codeLens
          const stored = this.codeLensData.get(codeLens.id)
          const uri = model.uri.toString()
          const resolved = (await this.request(
            uri,
            'codeLens/resolve',
            {
              textDocument: { uri },
              codeLens: {
                range: monacoRangeToLsp(codeLens.range),
                data: stored?.data,
                command: stored?.command,
              },
            },
            token
          )) as LspCodeLens | null
          if (!resolved?.command) return codeLens
          return {
            ...codeLens,
            command: resolved.command ? this.lspCommand(resolved.command, resolved.command.title, codeLens.id) : codeLens.command,
          }
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerInlayHintsProvider(LSP_LANGS, {
        provideInlayHints: async (model, range, token) => {
          if (!this.isLspEnabledForModel(model)) return { hints: [], dispose: () => { } }
          const uri = model.uri.toString()
          const result = (await this.request(
            uri,
            'textDocument/inlayHint',
            {
              textDocument: { uri },
              range: monacoRangeToLsp(range),
            },
            token
          )) as Array<{
            position: { line: number; character: number }
            label: string | Array<{ value: string }>
            kind?: number
            paddingLeft?: boolean
            paddingRight?: boolean
          }> | null
          if (!result?.length) return { hints: [], dispose: () => { } }
          return {
            hints: result.map(hint => ({
              position: lspPositionToMonaco(hint.position),
              label: typeof hint.label === 'string' ? hint.label : hint.label.map(part => ({ label: part.value })),
              kind: hint.kind,
              paddingLeft: hint.paddingLeft,
              paddingRight: hint.paddingRight,
            })),
            dispose: () => { },
          }
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerHoverProvider(LSP_LANGS, {
        provideHover: async (model, position, token) => {
          if (!this.isLspEnabledForModel(model)) return null
          const result = (await this.request(
            model.uri.toString(),
            'textDocument/hover',
            {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
            token
          )) as { contents?: { value: string }[] | { value: string } } | null
          if (!result?.contents) return null
          const contents = Array.isArray(result.contents) ? result.contents : [result.contents]
          return {
            contents: contents.map(c => ({ value: typeof c === 'string' ? c : c.value })),
          }
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerDefinitionProvider(LSP_LANGS, {
        provideDefinition: async (model, position, token) => lookupDefinition(model, position, token),
      })
    )

    this.disposables.push(
      monaco.languages.registerLinkProvider(LSP_LANGS, {
        provideLinks: async (model, token) => {
          if (!this.isLspEnabledForModel(model)) return { links: [] }
          const uri = model.uri.toString()
          const result = (await this.request(
            uri,
            'textDocument/documentLink',
            {
              textDocument: { uri },
            },
            token
          )) as Array<{
            range: LspRange
            target?: string
            tooltip?: string
          }> | null
          if (!result?.length) return { links: [] }
          return {
            links: result.map(link => ({
              range: lspRangeToMonaco(link.range),
              url: link.target ?? '',
              tooltip: link.tooltip,
            })),
          }
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerReferenceProvider(LSP_LANGS, {
        provideReferences: async (model, position, _context, token) => {
          if (!this.isLspEnabledForModel(model)) return []
          const result = await this.request(
            model.uri.toString(),
            'textDocument/references',
            {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              context: { includeDeclaration: true },
            },
            token
          )
          if (!result || !Array.isArray(result)) return []
          return result.map((loc: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: {
              startLineNumber: loc.range.start.line + 1,
              startColumn: loc.range.start.character + 1,
              endLineNumber: loc.range.end.line + 1,
              endColumn: loc.range.end.character + 1,
            },
          }))
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerDocumentFormattingEditProvider(LSP_LANGS, {
        provideDocumentFormattingEdits: async (model, options, token) => {
          const edits = await this.provideDocumentFormattingEdits(model, options, token)
          return edits
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerSignatureHelpProvider(LSP_LANGS, {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: async (model, position, token) => {
          if (!this.isLspEnabledForModel(model)) return null
          const result = (await this.request(
            model.uri.toString(),
            'textDocument/signatureHelp',
            {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
            token
          )) as Monaco.languages.SignatureHelp | null
          return result ? { value: result, dispose: () => { } } : null
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerRenameProvider(LSP_LANGS, {
        provideRenameEdits: async (model, position, newName, token) => {
          if (!this.isLspEnabledForModel(model)) return null
          const result = (await this.request(
            model.uri.toString(),
            'textDocument/rename',
            {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              newName,
            },
            token
          )) as { documentChanges?: unknown[]; changes?: Record<string, unknown[]> } | null
          if (!result) return null
          const edits: Monaco.languages.IWorkspaceTextEdit[] = []
          const changes = result.changes ?? {}
          for (const [uri, items] of Object.entries(changes)) {
            for (const item of items as Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>) {
              edits.push({
                resource: monaco.Uri.parse(uri),
                textEdit: {
                  range: new monaco.Range(item.range.start.line + 1, item.range.start.character + 1, item.range.end.line + 1, item.range.end.character + 1),
                  text: item.newText,
                },
                versionId: undefined,
              })
            }
          }
          if (result.documentChanges) {
            for (const change of result.documentChanges) {
              if ('edits' in change && change.textDocument?.uri && Array.isArray(change.edits)) {
                for (const item of change.edits as Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>) {
                  edits.push({
                    resource: monaco.Uri.parse(change.textDocument.uri),
                    textEdit: {
                      range: new monaco.Range(item.range.start.line + 1, item.range.start.character + 1, item.range.end.line + 1, item.range.end.character + 1),
                      text: item.newText,
                    },
                    versionId: undefined,
                  })
                }
              }
            }
          }
          return { edits }
        },
      })
    )
  }

  private mapCompletionItem(monaco: typeof Monaco, item: LspCompletionItem, defaultRange: Monaco.IRange, uri: string): Monaco.languages.CompletionItem {
    const label = typeof item.label === 'string' ? item.label : item.label.label
    const range = item.textEdit ? lspRangeToMonaco(item.textEdit.range) : defaultRange
    const insertText = item.textEdit?.newText ?? item.insertText ?? label
    const additionalTextEdits = item.additionalTextEdits?.map(te => ({
      range: lspRangeToMonaco(te.range),
      text: te.newText,
    }))
    return {
      label,
      kind: item.kind ?? monaco.languages.CompletionItemKind.Text,
      insertText,
      insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      sortText: item.sortText,
      filterText: item.filterText,
      range,
      additionalTextEdits,
      ...({ data: { uri, item } satisfies LspCompletionResolveData } as { data: LspCompletionResolveData }),
    }
  }

  private lspCommand(serverCommand: { command?: string; title?: string; arguments?: unknown[] }, fallbackTitle?: string, lensId?: string): Monaco.languages.Command | undefined {
    if (!serverCommand.command && !serverCommand.title) return undefined
    return {
      id: LSP_EXECUTE_COMMAND_ID,
      title: serverCommand.title ?? fallbackTitle ?? '',
      arguments: [{ lensId, serverCommand }],
    }
  }

  private async waitForServerReady(serverId: LspServerId, timeoutMs = 15_000): Promise<boolean> {
    if (this.serverReady[serverId]) return true
    this.ensureServerFor(serverId)
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (this.serverReady[serverId]) return true
      await new Promise<void>(resolve => setTimeout(resolve, 100))
    }
    return false
  }

  private pushDocument(uri: string, lspLanguageId: string, version: number, serverId: LspServerId, lspEnabled: boolean): ManagedDocument {
    const existing = this.documents.get(uri)
    const doc: ManagedDocument = {
      uri,
      languageId: lspLanguageId,
      version,
      serverId,
      lspEnabled,
      openedOnServer: existing?.openedOnServer ?? false,
      syncedFingerprint: existing?.syncedFingerprint ?? '',
    }
    this.documents.set(uri, doc)
    return doc
  }

  private notifyDocumentOpen(serverId: LspServerId, uri: string, lspLanguageId: string, version: number, text: string): void {
    const canonical = canonicalizeFileUri(uri)
    const doc = this.documents.get(canonical)
    if (!doc?.lspEnabled) return

    const fingerprint = textSyncFingerprint(text)

    if (doc.openedOnServer) {
      if (text.length === 0 || doc.syncedFingerprint === fingerprint) return
      const rel = relativePathFromDocumentUri(canonical, this.repoCwd)
      const modelVersion = rel ? this.getModelVersion(rel) : doc.version + 1
      const newVersion = Math.max(modelVersion, doc.version + 1)
      this.notify(serverId, 'textDocument/didChange', {
        textDocument: { uri: canonical, version: newVersion },
        contentChanges: [{ text }],
      })
      doc.version = newVersion
      doc.syncedFingerprint = fingerprint
      this.documents.set(canonical, doc)
      return
    }

    this.notify(serverId, 'textDocument/didOpen', {
      textDocument: { uri: canonical, languageId: lspLanguageId, version, text },
    })
    doc.openedOnServer = true
    doc.syncedFingerprint = fingerprint
    this.documents.set(canonical, doc)
    this.flushPendingIncrementalForUri(canonical)
  }

  /**
   * VS Code `lazilyActivateClient` → `TypeScriptServiceClientHost` (process start only).
   * Fires when a TS/JS document is opened — before Monaco mounts / buffer sync.
   * VS Code does **not** start tsserver on bare workspace open (no TS file).
   */
  prepareServer(repoCwd: string, relativePath: string): void {
    if (!repoCwd) return
    const lspLanguageId = getLspLanguageId(relativePath)
    if (!languageIdForLsp(lspLanguageId)) return

    if (this.repoCwd !== repoCwd) {
      this.closeAllDocuments()
      this.repoCwd = repoCwd
      this.rootUri = workspaceRootUri(repoCwd)
    }
    if (this.serverReady.typescript || this.ensureServersPromise) return
    void this.ensureServers()
  }

  /**
   * VS Code `BufferSyncSupport.openTextDocument` — sync when ITextModel is ready.
   * Called from `onTextModelReady` (attachModelToEditor / disk reload), not React effects.
   * `getContent` is lazy — only materialized when the document actually needs (re)sync.
   */
  openTextDocument(repoCwd: string, relativePath: string, getContent: () => string, languageId: string): void {
    const lspLanguageId = getLspLanguageId(relativePath)
    if (!languageIdForLsp(lspLanguageId)) return

    const key = `${repoCwd}::${relativePath.replace(/\\/g, '/')}`
    const inflight = this.openTextDocumentInflight.get(key)
    if (inflight) {
      void inflight
      return
    }

    const task = this.openTextDocumentAsync(repoCwd, relativePath, getContent, languageId).finally(() => {
      if (this.openTextDocumentInflight.get(key) === task) {
        this.openTextDocumentInflight.delete(key)
      }
    })
    this.openTextDocumentInflight.set(key, task)
  }

  private openDocKey(repoCwd: string, relativePath: string): string {
    return `${repoCwd}::${relativePath.replace(/\\/g, '/')}`
  }

  private bumpOpenGeneration(repoCwd: string, relativePath: string): number {
    const key = this.openDocKey(repoCwd, relativePath)
    const next = (this.openTextDocumentGeneration.get(key) ?? 0) + 1
    this.openTextDocumentGeneration.set(key, next)
    return next
  }

  private isOpenGenerationCurrent(repoCwd: string, relativePath: string, generation: number): boolean {
    return this.openTextDocumentGeneration.get(this.openDocKey(repoCwd, relativePath)) === generation
  }

  private async openTextDocumentAsync(repoCwd: string, relativePath: string, getContent: () => string, languageId: string): Promise<void> {
    const serverId = languageIdForLsp(languageId)
    if (!serverId) return

    const generation = this.bumpOpenGeneration(repoCwd, relativePath)

    if (this.repoCwd !== repoCwd) {
      this.closeAllDocuments()
      this.repoCwd = repoCwd
      this.rootUri = workspaceRootUri(repoCwd)
    }
    if (this.monaco) this.wireLsp(this.monaco)

    const uri = documentUriForPath(repoCwd, relativePath)
    const existing = this.documents.get(uri)
    const version = this.getModelVersion(relativePath)
    // Fast path (tab switch, no edits): version already synced — skip getValue() entirely.
    if (existing?.openedOnServer && existing.lspEnabled && existing.version === version) {
      return
    }

    const content = getContent()
    if (content.length === 0) return

    const fingerprint = textSyncFingerprint(content)
    if (existing?.openedOnServer && existing.syncedFingerprint === fingerprint) {
      return
    }

    const lspLanguageId = getLspLanguageId(relativePath)
    const lspEnabled = !isLargeFileByMetrics(content.length, countNewlines(content))

    this.pushDocument(uri, lspLanguageId, version, serverId, lspEnabled)
    if (!lspEnabled) return

    this.ensureServerFor(serverId)
    if (serverId === 'typescript') {
      const started = await this.ensureServers()
      if (!started) {
        if (import.meta.env.DEV) {
          console.warn(`[lsp] failed to start typescript server for ${relativePath}`)
        }
        return
      }
    }

    if (!this.isOpenGenerationCurrent(repoCwd, relativePath, generation)) return

    const ready = await this.waitForServerReady(serverId, 15_000)
    if (!ready) {
      if (import.meta.env.DEV) {
        console.warn(`[lsp] openTextDocument timed out for ${relativePath}`)
      }
      return
    }

    if (!this.isOpenGenerationCurrent(repoCwd, relativePath, generation)) return

    this.notifyDocumentOpen(serverId, uri, lspLanguageId, version, content)

    const canonical = canonicalizeFileUri(uri)
    const currentContent = getModelText(repoCwd, relativePath) ?? content
    const currentFingerprint = textSyncFingerprint(currentContent)
    const docAfter = this.documents.get(canonical)
    if (docAfter?.openedOnServer && docAfter.syncedFingerprint !== currentFingerprint) {
      const newVersion = this.getModelVersion(relativePath)
      this.notify(serverId, 'textDocument/didChange', {
        textDocument: { uri: canonical, version: newVersion },
        contentChanges: [{ text: currentContent }],
      })
      docAfter.version = newVersion
      docAfter.syncedFingerprint = currentFingerprint
      this.documents.set(canonical, docAfter)
    }

    if (import.meta.env.DEV) {
      console.info(`[lsp] document synced: ${relativePath}`)
    }
  }

  /** Disk reload for a file already synced to tsserver (background tabs skip didOpen). */
  reloadDocumentFromDisk(repoCwd: string, relativePath: string, languageId: string, content: string): void {
    const lspLanguageId = getLspLanguageId(relativePath)
    if (!languageIdForLsp(lspLanguageId) || content.length === 0) return
    if (this.repoCwd && this.repoCwd !== repoCwd) return
    if (!this.repoCwd) {
      this.repoCwd = repoCwd
      this.rootUri = workspaceRootUri(repoCwd)
    }
    const uri = documentUriForPath(repoCwd, relativePath)
    const doc = this.documents.get(uri)
    if (!doc?.openedOnServer) return
    this.changeDocument(relativePath, languageId, content)
  }

  private openDocumentSync(relativePath: string, languageId: string, text: string) {
    if (!this.repoCwd) return
    const content = text.length > 0 ? text : (getModelText(this.repoCwd, relativePath) ?? '')
    if (content.length === 0) return
    this.openTextDocument(this.repoCwd, relativePath, () => content, languageId)
  }

  private async ensureDocumentReady(relativePath: string, languageId: string): Promise<boolean> {
    if (!this.repoCwd || !languageIdForLsp(languageId)) return false
    const text = getModelText(this.repoCwd, relativePath) ?? editorCommandBridge.get()?.getValue() ?? ''
    this.openDocumentSync(relativePath, languageId, text)
    const doc = this.documents.get(documentUriForPath(this.repoCwd, relativePath))
    if (!doc?.lspEnabled) return false
    return this.waitForServerReady(doc.serverId)
  }

  /**
   * VS Code `toOpenTsFilePath`: sync file to tsserver before navigation.
   * Only used for node_modules / external packages — workspace imports use the fast path.
   */
  async ensureNavigationReady(model: Monaco.editor.ITextModel, maxWaitMs = 15_000): Promise<boolean> {
    if (!this.repoCwd || !this.monaco) return false
    this.wireLsp(this.monaco)

    const languageId = model.getLanguageId()
    const serverId = languageIdForLsp(languageId)
    if (!serverId) return false

    const modelUri = canonicalizeFileUri(model.uri.toString())
    const relativePath = relativePathFromDocumentUri(modelUri, this.repoCwd)
    const uri = relativePath ? documentUriForPath(this.repoCwd, relativePath) : modelUri
    const pathForLanguage = relativePath ?? fileUriToPath(modelUri).replace(/\\/g, '/')
    const lspLanguageId = getLspLanguageId(pathForLanguage)
    const text = model.getValue()
    const lspEnabled = !isLargeFileByMetrics(text.length, countNewlines(text))
    const version = relativePath ? this.getModelVersion(relativePath) : model.getVersionId()

    this.pushDocument(uri, lspLanguageId, version, serverId, lspEnabled)
    if (!lspEnabled) return false

    this.ensureServerFor(serverId)
    const ready = await this.waitForServerReady(serverId, maxWaitMs)
    if (!ready) return false

    this.notifyDocumentOpen(serverId, uri, lspLanguageId, version, text)

    return true
  }

  private setSourceDefinitionSupported(enabled: boolean): void {
    this.sourceDefinitionSupported = enabled
    for (const key of this.sourceDefinitionContextKeys) {
      key.set(enabled)
    }
  }

  async organizeImports(relativePath: string, languageId: string): Promise<OrganizeImportsResult> {
    if (!this.monaco || !this.repoCwd || !languageIdForLsp(languageId)) {
      return 'not_supported'
    }

    const ready = await this.ensureDocumentReady(relativePath, languageId)
    if (!ready) return 'not_ready'

    const uri = documentUriForPath(this.repoCwd, relativePath)
    const model = this.monaco.editor.getModel(this.monaco.Uri.parse(uri))
    const lineCount = model?.getLineCount() ?? 1
    const endCharacter = model?.getLineMaxColumn(lineCount) ?? 1

    const result = (await this.request(uri, 'textDocument/codeAction', {
      textDocument: { uri },
      range: {
        start: { line: 0, character: 0 },
        end: { line: Math.max(0, lineCount - 1), character: Math.max(0, endCharacter - 1) },
      },
      context: {
        diagnostics: [],
        only: ['source.organizeImports'],
      },
    })) as LspCodeAction[] | null

    if (!result?.length) return 'no_action'
    const action = result.find(a => a.kind === 'source.organizeImports') ?? result.find(a => a.title.toLowerCase().includes('organize imports'))
    if (!action) return 'no_action'

    const edit = workspaceEditFromCodeAction(action)
    if (edit && this.monaco) {
      const applied = await applyWorkspaceEditAsync(this.monaco, edit, this.repoCwd)
      return applied ? 'success' : 'failed'
    }
    if (action.command) {
      const ok = await this.executeServerCommand(uri, action.command)
      return ok ? 'success' : 'failed'
    }
    return 'failed'
  }

  async formatDocument(relativePath: string, languageId: string, formatOptions?: { tabSize?: number; insertSpaces?: boolean }): Promise<FormatDocumentResult> {
    if (!this.monaco || !this.repoCwd || !languageIdForLsp(languageId)) {
      return 'not_supported'
    }

    const ready = await this.ensureDocumentReady(relativePath, languageId)
    if (!ready) return 'not_ready'

    const uri = documentUriForPath(this.repoCwd, relativePath)
    const model = this.monaco.editor.getModel(this.monaco.Uri.parse(uri))
    if (!model) return 'failed'

    const edits = await this.requestDocumentFormattingEdits(uri, {
      tabSize: formatOptions?.tabSize ?? 2,
      insertSpaces: formatOptions?.insertSpaces ?? true,
    })
    if (edits === null) return 'failed'
    if (edits.length === 0) return 'no_action'

    return this.applyTextEdits(model, edits) ? 'success' : 'failed'
  }

  private async provideDocumentFormattingEdits(
    model: Monaco.editor.ITextModel,
    options: Monaco.languages.FormattingOptions,
    token?: Monaco.CancellationToken
  ): Promise<Monaco.languages.TextEdit[]> {
    if (!this.monaco || !this.repoCwd) return []

    const relativePath = relativePathFromDocumentUri(canonicalizeFileUri(model.uri.toString()), this.repoCwd)
    if (!relativePath || !languageIdForLsp(model.getLanguageId())) return []

    const ready = await this.ensureDocumentReady(relativePath, model.getLanguageId())
    if (!ready) return []

    const uri = documentUriForPath(this.repoCwd, relativePath)
    const edits = await this.requestDocumentFormattingEdits(uri, options, token)
    if (!edits?.length) return []

    const monaco = this.monaco
    return edits.map(edit => ({
      range: new monaco.Range(edit.range.start.line + 1, edit.range.start.character + 1, edit.range.end.line + 1, edit.range.end.character + 1),
      text: edit.newText,
    }))
  }

  private async requestDocumentFormattingEdits(
    uri: string,
    options: { tabSize: number; insertSpaces: boolean },
    token?: Monaco.CancellationToken
  ): Promise<LspTextEdit[] | null> {
    const canonical = canonicalizeFileUri(uri)
    const result = (await this.request(
      canonical,
      'textDocument/formatting',
      {
        textDocument: { uri: canonical },
        options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
      },
      token
    )) as LspTextEdit[] | null
    return result
  }

  private applyTextEdits(model: Monaco.editor.ITextModel, edits: LspTextEdit[]): boolean {
    if (!this.monaco || edits.length === 0) return false

    const monaco = this.monaco
    const sorted = [...edits].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line
      return b.range.start.character - a.range.start.character
    })

    model.pushEditOperations(
      [],
      sorted.map(edit => ({
        range: new monaco.Range(edit.range.start.line + 1, edit.range.start.character + 1, edit.range.end.line + 1, edit.range.end.character + 1),
        text: edit.newText,
      })),
      () => null
    )
    return true
  }

  private async handleLspCommand(editor: Monaco.editor.ICodeEditor, payload: { lensId?: string; serverCommand?: LspCodeLens['command'] } | undefined): Promise<void> {
    const serverCommand = payload?.serverCommand
    if (!serverCommand?.command) return
    const model = editor.getModel()
    if (!model) return
    const uri = model.uri.toString()

    if (payload?.lensId) {
      const lens = this.codeLensData.get(payload.lensId)
      if (lens) {
        const pos = lspPositionToMonaco(lens.range.start)
        editor.setPosition(pos)
        editor.revealPositionInCenterIfOutsideViewport(pos)
      }
    }

    const cmd = serverCommand.command
    if (cmd === 'editor.action.showReferences') {
      const args = serverCommand.arguments ?? []
      const positionArg = args[1] as { line?: number; character?: number } | undefined
      if (positionArg && typeof positionArg.line === 'number') {
        const pos = lspPositionToMonaco({
          line: positionArg.line,
          character: positionArg.character ?? 0,
        })
        editor.setPosition(pos)
        editor.revealPositionInCenterIfOutsideViewport(pos)
      }
      await editor.getAction('editor.action.showReferences')?.run()
      return
    }

    await this.executeServerCommand(uri, {
      command: serverCommand.command,
      arguments: serverCommand.arguments,
    })
  }

  private async executeServerCommand(uri: string, command: { command: string; arguments?: unknown[] }): Promise<boolean> {
    const result = await this.request(uri, 'workspace/executeCommand', {
      command: command.command,
      arguments: command.arguments ?? [],
    })
    if (result && typeof result === 'object' && this.monaco && this.repoCwd) {
      return applyWorkspaceEditAsync(this.monaco, result as WorkspaceEditPayload, this.repoCwd)
    }
    return result != null
  }

  private async mapDefinitionResponseToLinks(
    monaco: typeof Monaco,
    model: Monaco.editor.ITextModel,
    position: Monaco.IPosition,
    result: unknown,
    fromRelativePath: string | null
  ): Promise<{ links: Monaco.languages.LocationLink[]; unresolvedNodeSpecifier: string | null }> {
    const originFallback = computeBoundSpanAtPosition(model, position)
    const locations = flattenDefinitionResponse(result)
    let unresolvedNodeSpecifier: string | null = null
    const links = await Promise.all(
      locations.map(async loc => {
        const rawUri = loc.targetUri ?? loc.uri
        if (!rawUri) return null
        const resolvedUri = await resolveDefinitionUri(rawUri, this.repoCwd, fromRelativePath)
        if (resolvedUri.startsWith('node:')) {
          unresolvedNodeSpecifier = resolvedUri
          return null
        }
        return mapLspDefinitionToMonacoLink(monaco, { ...loc, uri: resolvedUri, targetUri: resolvedUri }, originFallback)
      })
    )
    return {
      links: links.filter((link): link is Monaco.languages.LocationLink => link != null),
      unresolvedNodeSpecifier,
    }
  }

  private canonicalModelUri(model: Monaco.editor.ITextModel): string {
    return canonicalizeFileUri(model.uri.toString())
  }

  private canonicalizeLspRequestParams(params: unknown): unknown {
    if (!params || typeof params !== 'object') return params
    const record = params as Record<string, unknown>
    const textDocument = record.textDocument
    if (!textDocument || typeof textDocument !== 'object') return params
    const docRecord = textDocument as Record<string, unknown>
    if (typeof docRecord.uri !== 'string') return params
    return {
      ...record,
      textDocument: {
        ...docRecord,
        uri: canonicalizeFileUri(docRecord.uri),
      },
    }
  }

  async lookupDefinition(
    model: Monaco.editor.ITextModel,
    position: Monaco.IPosition,
    token?: Monaco.CancellationToken
  ): Promise<Monaco.languages.LocationLink[] | null> {
    if (!this.monaco || !this.repoCwd) return null

    const ready = await this.ensureNavigationReady(model)
    if (!ready) return null

    const uri = this.canonicalModelUri(model)
    const doc = this.documents.get(uri)
    if (!doc?.lspEnabled || !this.serverReady[doc.serverId]) return null

    const fromRelativePath = relativePathFromDocumentUri(uri, this.repoCwd)
    const monaco = this.monaco

    const result = await this.request(
      uri,
      'textDocument/definition',
      {
        textDocument: { uri },
        position: monacoPositionToLspDefinitionRequest(position),
      },
      token
    )
    if (!result) return null

    const mapped = await this.mapDefinitionResponseToLinks(monaco, model, position, result, fromRelativePath)
    if (mapped.links.length === 0 && mapped.unresolvedNodeSpecifier) {
      toast.error(i18n.t('editor.lsp.definitionResolveFailed', { specifier: mapped.unresolvedNodeSpecifier }))
    }
    return mapped.links.length > 0 ? mapped.links : null
  }

  async lookupSourceDefinition(
    model: Monaco.editor.ITextModel,
    position: Monaco.IPosition,
    token?: Monaco.CancellationToken
  ): Promise<Monaco.languages.LocationLink[] | null> {
    if (!this.monaco || !this.repoCwd || !this.sourceDefinitionSupported) return null

    const ready = await this.ensureNavigationReady(model)
    if (!ready) return null

    const uri = this.canonicalModelUri(model)
    const doc = this.documents.get(uri)
    if (!doc?.lspEnabled || !this.serverReady[doc.serverId]) return null

    const fromRelativePath = relativePathFromDocumentUri(uri, this.repoCwd)
    const monaco = this.monaco

    const result = await this.request(
      uri,
      LSP_SOURCE_DEFINITION_METHOD,
      {
        textDocument: { uri },
        position: monacoPositionToLspDefinitionRequest(position),
      },
      token
    )
    if (!result) return null

    const mapped = await this.mapDefinitionResponseToLinks(monaco, model, position, result, fromRelativePath)
    if (mapped.links.length === 0 && mapped.unresolvedNodeSpecifier) {
      toast.error(i18n.t('editor.lsp.definitionResolveFailed', { specifier: mapped.unresolvedNodeSpecifier }))
    }
    return mapped.links.length > 0 ? mapped.links : null
  }

  syncTypeScriptUserPreferences(input: { preferGoToSourceDefinition: boolean }): void {
    if (!this.repoCwd) return
    const settings = buildTypeScriptWorkspaceSettings(input)
    const serialized = JSON.stringify(settings)
    if (this.lastSyncedTsPrefs === serialized) return
    this.lastSyncedTsPrefs = serialized

    if (!this.serverReady.typescript) return
    this.notify('typescript', 'workspace/didChangeConfiguration', { settings })
  }

  private async goToDefinitionLocations(
    editor: Monaco.editor.ICodeEditor,
    links: Monaco.languages.LocationLink[],
    noResultMessage: string
  ): Promise<void> {
    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position || links.length === 0) return

    const locations = definitionLinksToMonacoLocations(links)
    if (locations.length === 1) {
      const target = locations[0]
      if (!target) return
      const range = target.range
      await this.monaco?.editor.openCodeEditor(
        {
          resource: target.uri,
          options: {
            selection: range,
            selectionStartLineNumber: range.startLineNumber,
            selectionStartColumn: range.startColumn,
            positionLineNumber: range.startLineNumber,
            positionColumn: range.startColumn,
          },
        },
        editor
      )
      return
    }

    editor.trigger('honeybadger', 'editor.action.goToLocations', [
      model.uri,
      position,
      locations,
      'goto',
      noResultMessage,
    ])
  }

  registerLspEditorActions(editor: Monaco.editor.IStandaloneCodeEditor) {
    const flagged = editor as Monaco.editor.IStandaloneCodeEditor & { __hbLspActions?: boolean }
    if (flagged.__hbLspActions) return
    flagged.__hbLspActions = true

    const sourceDefinitionContext = editor.createContextKey('hb.supportsSourceDefinition', this.sourceDefinitionSupported)
    this.sourceDefinitionContextKeys.add(sourceDefinitionContext)

    editor.addAction({
      id: LSP_EXECUTE_COMMAND_ID,
      label: 'LSP Command',
      run: (ed, payload: { lensId?: string; serverCommand?: LspCodeLens['command'] }) => {
        void this.handleLspCommand(ed, payload)
      },
    })

    editor.addAction({
      id: GO_TO_SOURCE_DEFINITION_ACTION_ID,
      label: i18n.t('editor.lsp.goToSourceDefinition'),
      precondition: 'hb.supportsSourceDefinition',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: ed => {
        void this.runGoToSourceDefinition(ed)
      },
    })
  }

  private async runGoToSourceDefinition(editor: Monaco.editor.ICodeEditor): Promise<void> {
    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position) {
      toast.error(i18n.t('editor.lsp.goToSourceDefinitionNoEditor'))
      return
    }

    if (!TS_NAVIGATION_LANGS.has(model.getLanguageId())) {
      toast.error(i18n.t('editor.lsp.goToSourceDefinitionUnsupported'))
      return
    }

    const progressId = sonnerToast.loading(i18n.t('editor.lsp.findingSourceDefinitions'))
    try {
      const links = await this.lookupSourceDefinition(model, position)
      if (!links?.length) {
        toast.info(i18n.t('editor.lsp.goToSourceDefinitionNotFound'))
        return
      }
      await this.goToDefinitionLocations(editor, links, i18n.t('editor.lsp.goToSourceDefinitionNotFound'))
    } finally {
      sonnerToast.dismiss(progressId)
    }
  }

  private isLspEnabledForModel(model: Monaco.editor.ITextModel): boolean {
    const uri = canonicalizeFileUri(model.uri.toString())
    const doc = this.documents.get(uri)
    return Boolean(doc?.lspEnabled && this.serverReady[doc.serverId])
  }

  private async request(uri: string, method: string, params: unknown, token?: Monaco.CancellationToken): Promise<unknown> {
    const canonical = canonicalizeFileUri(uri)
    const doc = this.documents.get(canonical) ?? this.documents.get(uri)
    if (!doc?.lspEnabled || !this.serverReady[doc.serverId]) return null
    if (token?.isCancellationRequested) return null
    const id = this.nextId++
    return new Promise(resolve => {
      let cancelListener: Monaco.IDisposable | null = null
      const settle = (value: unknown) => {
        cancelListener?.dispose()
        cancelListener = null
        resolve(value)
      }
      const timer = setTimeout(() => {
        this.pending.delete(id)
        settle(null)
      }, 8000)
      this.pending.set(id, { resolve: settle, timer })
      // Superseded request (typing ahead): tell the server to abandon it and settle now —
      // no 8s wait and no stale response resolving later.
      cancelListener =
        token?.onCancellationRequested(() => {
          const entry = this.pending.get(id)
          if (!entry) return
          clearTimeout(entry.timer)
          this.pending.delete(id)
          this.notify(doc.serverId, '$/cancelRequest', { id })
          settle(null)
        }) ?? null
      window.api.lsp.send({
        serverId: doc.serverId,
        rootUri: this.rootUri,
        message: JSON.stringify({ jsonrpc: '2.0', id, method, params: this.canonicalizeLspRequestParams(params) }),
      })
    })
  }

  changeDocumentIncremental(relativePath: string, languageId: string, monacoChanges: Monaco.editor.IModelContentChange[]) {
    const serverId = languageIdForLsp(languageId)
    if (!serverId || !this.repoCwd || monacoChanges.length === 0) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const doc = this.documents.get(uri)
    const version = this.getModelVersion(relativePath)
    const lspChanges = monacoChanges.map(c => ({
      range: monacoRangeToLsp(c.range),
      rangeLength: c.rangeLength,
      text: c.text,
    }))

    if (!doc) {
      this.openTextDocument(
        this.repoCwd,
        relativePath,
        () => getModelText(this.repoCwd, relativePath) ?? editorCommandBridge.get()?.getValue() ?? '',
        languageId
      )
    } else {
      doc.version = version
    }
    if (doc && !doc.lspEnabled) return

    const pending = this.pendingIncremental.get(uri)
    if (pending) {
      pending.changes.push(...lspChanges)
      pending.version = version
    } else {
      this.pendingIncremental.set(uri, { relativePath, languageId, changes: lspChanges, version })
    }
    this.changeFlusher.push({ relativePath, languageId })
  }

  /** Full-document sync (disk reload). */
  changeDocument(relativePath: string, languageId: string, text: string) {
    const serverId = languageIdForLsp(languageId)
    if (!serverId || !this.repoCwd) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const lspEnabled = !isLargeFileByMetrics(text.length, countNewlines(text))
    const doc = this.documents.get(uri)
    if (!doc) {
      this.openTextDocument(this.repoCwd, relativePath, () => text, languageId)
      return
    }
    const version = this.getModelVersion(relativePath)
    doc.version = version
    doc.lspEnabled = lspEnabled
    if (!lspEnabled) return
    this.ensureServerFor(serverId)
    const canonical = canonicalizeFileUri(uri)
    this.notify(serverId, 'textDocument/didChange', {
      textDocument: { uri: canonical, version },
      contentChanges: [{ text }],
    })
  }

  private flushPendingIncrementalForUri(uri: string): void {
    const pending = this.pendingIncremental.get(uri)
    if (!pending) return
    const serverId = languageIdForLsp(pending.languageId)
    if (!serverId || !this.repoCwd) return
    const doc = this.documents.get(uri)
    if (!doc?.lspEnabled || !doc.openedOnServer || !this.serverReady[serverId]) return

    this.pendingIncremental.delete(uri)
    this.ensureServerFor(serverId)
    this.notify(serverId, 'textDocument/didChange', {
      textDocument: { uri, version: pending.version },
      contentChanges: pending.changes,
    })
  }

  private flushDocumentChange(_payload: { relativePath: string; languageId: string }) {
    if (this.pendingIncremental.size === 0) return
    for (const uri of [...this.pendingIncremental.keys()]) {
      this.flushPendingIncrementalForUri(uri)
    }
  }

  closeDocument(relativePath: string) {
    if (!this.repoCwd) return
    this.bumpOpenGeneration(this.repoCwd, relativePath)
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const canonical = canonicalizeFileUri(uri)
    const doc = this.documents.get(canonical) ?? this.documents.get(uri)
    if (!doc) return
    if (doc.lspEnabled) {
      this.notify(doc.serverId, 'textDocument/didClose', { textDocument: { uri: canonical } })
    }
    this.documents.delete(canonical)
    this.documents.delete(uri)
    this.pendingIncremental.delete(canonical)
    this.pendingIncremental.delete(uri)
    const model = this.getModelForUri(canonical)
    if (model && this.monaco) this.monaco.editor.setModelMarkers(model, 'lsp', [])
  }

  private notify(serverId: LspServerId, method: string, params: unknown) {
    if (!this.rootUri) return
    window.api.lsp.send({
      serverId,
      rootUri: this.rootUri,
      message: JSON.stringify({ jsonrpc: '2.0', method, params }),
    })
  }

  private clearPending() {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.resolve(null)
    }
    this.pending.clear()
  }

  private disposeProviders() {
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    this.codeLensData.clear()
    this.nextLensId = 0
  }

  dispose() {
    this.disposeProviders()
    this.clearPending()
    this.changeFlusher.cancel()
    if (this.diagnosticsRaf != null) cancelAnimationFrame(this.diagnosticsRaf)
    this.diagnosticsRaf = null
    this.pendingDiagnostics.clear()
    this.unsubMessage?.()
    this.unsubState?.()
    this.settingsUnsub?.()
    this.settingsUnsub = null
    this.sourceDefinitionContextKeys.clear()
    this.closeAllDocuments()
    this.wired = false
  }
}

export const editorLanguageService = new EditorLanguageService()

onTextModelReady(event => {
  if (event.reason === 'disk-reload') {
    editorLanguageService.reloadDocumentFromDisk(event.repoCwd, event.relativePath, event.languageId, event.getContent())
    return
  }
  editorLanguageService.openTextDocument(event.repoCwd, event.relativePath, event.getContent, event.languageId)
})
