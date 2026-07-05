import type * as Monaco from 'monaco-editor'
import type { LspServerId } from 'shared/lsp/types'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { getModelText } from '@/pages/editor/lib/editorModelRegistry'
import { onTextModelReady, textSyncFingerprint } from '@/pages/editor/lib/editorModelLifecycle'
import { createBackgroundFlusher } from '@/pages/editor/lib/scheduleBackgroundWork'
import { documentUriForPath, canonicalizeFileUri, uriRootsMatch, workspaceRootUri } from '@/pages/editor/lsp/documentUri'
import { countNewlines, isLargeFileByMetrics } from 'shared/fileUri'
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
import { relativePathFromDocumentUri } from '@/pages/editor/lib/resolveTypeScriptModule'

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

type LspDefinitionLocation = {
  uri?: string
  targetUri?: string
  range?: LspRange
  targetRange?: LspRange
  targetSelectionRange?: LspRange
}

function mapLspDefinitionToMonaco(monaco: typeof Monaco, loc: LspDefinitionLocation): Monaco.languages.Location | null {
  const uri = loc.uri ?? loc.targetUri
  const range = loc.range ?? loc.targetSelectionRange ?? loc.targetRange
  if (!uri || !range) return null
  return {
    uri: monaco.Uri.parse(uri),
    range: {
      startLineNumber: range.start.line + 1,
      startColumn: range.start.character + 1,
      endLineNumber: range.end.line + 1,
      endColumn: range.end.character + 1,
    },
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const LSP_LANGS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'java']

export const LSP_EXECUTE_COMMAND_ID = 'honeybadger.lsp.executeCommand'
/** @deprecated Use LSP_EXECUTE_COMMAND_ID */
export const CODE_LENS_COMMAND_ID = LSP_EXECUTE_COMMAND_ID

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
  private changeFlusher = createBackgroundFlusher<{ relativePath: string; languageId: string }>(
    payload => this.flushDocumentChange(payload),
    150
  )
  private pendingIncremental = new Map<
    string,
    { relativePath: string; languageId: string; changes: Array<{ range: LspRange; rangeLength: number; text: string }>; version: number }
  >()
  private codeLensData = new Map<string, LspCodeLens>()
  private nextLensId = 0
  private openTextDocumentInflight = new Map<string, Promise<void>>()
  private openTextDocumentGeneration = new Map<string, number>()

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
      const result = await window.api.lsp.start({ serverId, rootUri: this.rootUri })
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
        provideCompletionItems: async (model, position) => {
          if (!this.isLspEnabledForModel(model)) return { suggestions: [] }
          const uri = model.uri.toString()
          const result = await this.request(uri, 'textDocument/completion', {
            textDocument: { uri },
            position: monacoPositionToLsp(position),
          })
          if (!result) return { suggestions: [] }
          const items = Array.isArray(result) ? result : ((result as { items?: LspCompletionItem[] }).items ?? [])
          const word = model.getWordUntilPosition(position)
          const defaultRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
          return {
            suggestions: items.map(item => this.mapCompletionItem(monaco, item, defaultRange, uri)),
          }
        },
        resolveCompletionItem: async item => {
          const stash = (item as Monaco.languages.CompletionItem & { data?: LspCompletionResolveData }).data
          if (!stash?.uri || !stash.item) return item
          const resolved = (await this.request(stash.uri, 'completionItem/resolve', stash.item)) as LspCompletionItem | null
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
          provideCodeActions: async (model, range, context) => {
            if (!this.isLspEnabledForModel(model)) return { actions: [], dispose: () => { } }
            const uri = model.uri.toString()
            const diagnostics = context.markers.map(m => ({
              range: monacoRangeToLsp(new monaco.Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)),
              message: m.message,
              severity: markerSeverityToLsp(m.severity),
              source: m.source,
            }))
            const only = context.only ? [context.only] : undefined
            const result = (await this.request(uri, 'textDocument/codeAction', {
              textDocument: { uri },
              range: monacoRangeToLsp(range),
              context: { diagnostics, only },
            })) as LspCodeAction[] | null
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
          resolveCodeAction: async codeAction => {
            const stash = (codeAction as MonacoCodeActionWithStash)._hbLsp
            if (!stash || !this.monaco) return codeAction
            const resolved = (await this.request(stash.uri, 'codeAction/resolve', stash.action)) as LspCodeAction | null
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
        provideCodeLenses: async model => {
          if (!this.isLspEnabledForModel(model)) return { lenses: [], dispose: () => { } }
          const uri = model.uri.toString()
          const result = (await this.request(uri, 'textDocument/codeLens', {
            textDocument: { uri },
          })) as LspCodeLens[] | null
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
        resolveCodeLens: async (model, codeLens) => {
          if (!codeLens.id || !this.isLspEnabledForModel(model)) return codeLens
          const stored = this.codeLensData.get(codeLens.id)
          const uri = model.uri.toString()
          const resolved = (await this.request(uri, 'codeLens/resolve', {
            textDocument: { uri },
            codeLens: {
              range: monacoRangeToLsp(codeLens.range),
              data: stored?.data,
              command: stored?.command,
            },
          })) as LspCodeLens | null
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
        provideInlayHints: async (model, range) => {
          if (!this.isLspEnabledForModel(model)) return { hints: [], dispose: () => { } }
          const uri = model.uri.toString()
          const result = (await this.request(uri, 'textDocument/inlayHint', {
            textDocument: { uri },
            range: monacoRangeToLsp(range),
          })) as Array<{
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
        provideHover: async (model, position) => {
          if (!this.isLspEnabledForModel(model)) return null
          const result = (await this.request(model.uri.toString(), 'textDocument/hover', {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          })) as { contents?: { value: string }[] | { value: string } } | null
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
        provideDefinition: async (model, position) => lookupDefinition(model, position),
      })
    )

    this.disposables.push(
      monaco.languages.registerLinkProvider(LSP_LANGS, {
        provideLinks: async model => {
          if (!this.isLspEnabledForModel(model)) return { links: [] }
          const uri = model.uri.toString()
          const result = (await this.request(uri, 'textDocument/documentLink', {
            textDocument: { uri },
          })) as Array<{
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
        provideReferences: async (model, position) => {
          if (!this.isLspEnabledForModel(model)) return []
          const result = await this.request(model.uri.toString(), 'textDocument/references', {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
            context: { includeDeclaration: true },
          })
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
        provideDocumentFormattingEdits: async (model, options) => {
          const edits = await this.provideDocumentFormattingEdits(model, options)
          return edits
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerSignatureHelpProvider(LSP_LANGS, {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: async (model, position) => {
          if (!this.isLspEnabledForModel(model)) return null
          const result = (await this.request(model.uri.toString(), 'textDocument/signatureHelp', {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          })) as Monaco.languages.SignatureHelp | null
          return result ? { value: result, dispose: () => { } } : null
        },
      })
    )

    this.disposables.push(
      monaco.languages.registerRenameProvider(LSP_LANGS, {
        provideRenameEdits: async (model, position, newName) => {
          if (!this.isLspEnabledForModel(model)) return null
          const result = (await this.request(model.uri.toString(), 'textDocument/rename', {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
            newName,
          })) as { documentChanges?: unknown[]; changes?: Record<string, unknown[]> } | null
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

  private pushDocument(
    uri: string,
    lspLanguageId: string,
    version: number,
    serverId: LspServerId,
    lspEnabled: boolean
  ): ManagedDocument {
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
   */
  openTextDocument(repoCwd: string, relativePath: string, content: string, languageId: string): void {
    const lspLanguageId = getLspLanguageId(relativePath)
    if (!languageIdForLsp(lspLanguageId)) return

    const key = `${repoCwd}::${relativePath.replace(/\\/g, '/')}`
    const inflight = this.openTextDocumentInflight.get(key)
    if (inflight) {
      void inflight
      return
    }

    const task = this.openTextDocumentAsync(repoCwd, relativePath, content, languageId).finally(() => {
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

  private async openTextDocumentAsync(
    repoCwd: string,
    relativePath: string,
    content: string,
    languageId: string
  ): Promise<void> {
    const serverId = languageIdForLsp(languageId)
    if (!serverId || content.length === 0) return

    const generation = this.bumpOpenGeneration(repoCwd, relativePath)

    if (this.repoCwd !== repoCwd) {
      this.closeAllDocuments()
      this.repoCwd = repoCwd
      this.rootUri = workspaceRootUri(repoCwd)
    }
    if (this.monaco) this.wireLsp(this.monaco)

    const uri = documentUriForPath(repoCwd, relativePath)
    const fingerprint = textSyncFingerprint(content)
    const existing = this.documents.get(uri)
    if (existing?.openedOnServer && existing.syncedFingerprint === fingerprint) {
      return
    }

    const lspLanguageId = getLspLanguageId(relativePath)
    const lspEnabled = !isLargeFileByMetrics(content.length, countNewlines(content))
    const version = this.getModelVersion(relativePath)

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

  /** @deprecated Prefer openTextDocument — kept for incremental sync fallbacks. */
  warmUpDocument(relativePath: string, languageId: string, text: string): void {
    if (!this.repoCwd) return
    const content = text.length > 0 ? text : (getModelText(this.repoCwd, relativePath) ?? '')
    if (content.length === 0) return
    this.openTextDocument(this.repoCwd, relativePath, content, languageId)
  }

  private openDocumentSync(relativePath: string, languageId: string, text: string) {
    if (!this.repoCwd) return
    const content = text.length > 0 ? text : (getModelText(this.repoCwd, relativePath) ?? '')
    if (content.length === 0) return
    this.openTextDocument(this.repoCwd, relativePath, content, languageId)
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
  async ensureNavigationReady(model: Monaco.editor.ITextModel, maxWaitMs = 1_500): Promise<boolean> {
    if (!this.repoCwd || !this.monaco) return false
    this.wireLsp(this.monaco)

    const languageId = model.getLanguageId()
    const serverId = languageIdForLsp(languageId)
    if (!serverId) return false

    const relativePath = relativePathFromDocumentUri(model.uri.toString(), this.repoCwd)
    if (!relativePath) return false

    const uri = documentUriForPath(this.repoCwd, relativePath)
    const lspLanguageId = getLspLanguageId(relativePath)
    const text = model.getValue()
    const lspEnabled = !isLargeFileByMetrics(text.length, countNewlines(text))
    const version = this.getModelVersion(relativePath)

    this.pushDocument(uri, lspLanguageId, version, serverId, lspEnabled)
    if (!lspEnabled) return false

    this.ensureServerFor(serverId)
    const ready = await this.waitForServerReady(serverId, maxWaitMs)
    if (!ready) return false

    this.notifyDocumentOpen(serverId, uri, lspLanguageId, version, text)

    return true
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

  async formatDocument(
    relativePath: string,
    languageId: string,
    formatOptions?: { tabSize?: number; insertSpaces?: boolean }
  ): Promise<FormatDocumentResult> {
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
    options: Monaco.languages.FormattingOptions
  ): Promise<Monaco.languages.TextEdit[]> {
    if (!this.monaco || !this.repoCwd) return []

    const relativePath = relativePathFromDocumentUri(canonicalizeFileUri(model.uri.toString()), this.repoCwd)
    if (!relativePath || !languageIdForLsp(model.getLanguageId())) return []

    const ready = await this.ensureDocumentReady(relativePath, model.getLanguageId())
    if (!ready) return []

    const uri = documentUriForPath(this.repoCwd, relativePath)
    const edits = await this.requestDocumentFormattingEdits(uri, options)
    if (!edits?.length) return []

    const monaco = this.monaco
    return edits.map(edit => ({
      range: new monaco.Range(
        edit.range.start.line + 1,
        edit.range.start.character + 1,
        edit.range.end.line + 1,
        edit.range.end.character + 1
      ),
      text: edit.newText,
    }))
  }

  private async requestDocumentFormattingEdits(
    uri: string,
    options: { tabSize: number; insertSpaces: boolean }
  ): Promise<LspTextEdit[] | null> {
    const canonical = canonicalizeFileUri(uri)
    const result = (await this.request(canonical, 'textDocument/formatting', {
      textDocument: { uri: canonical },
      options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
    })) as LspTextEdit[] | null
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
        range: new monaco.Range(
          edit.range.start.line + 1,
          edit.range.start.character + 1,
          edit.range.end.line + 1,
          edit.range.end.character + 1
        ),
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

  async lookupDefinition(model: Monaco.editor.ITextModel, position: Monaco.IPosition): Promise<Monaco.languages.Location[] | null> {
    if (!this.monaco) return null

    const ready = await this.ensureNavigationReady(model)
    if (!ready) return null

    const uri = model.uri.toString()
    const doc = this.documents.get(uri)
    if (!doc?.lspEnabled || !this.serverReady[doc.serverId]) return null

    const result = await this.request(uri, 'textDocument/definition', {
      textDocument: { uri },
      position: { line: position.lineNumber - 1, character: position.column - 1 },
    })
    if (!result) return null

    const monaco = this.monaco
    if (!monaco) return null

    const locations = Array.isArray(result) ? result : [result]
    return locations
      .map((loc: LspDefinitionLocation) => mapLspDefinitionToMonaco(monaco, loc))
      .filter((loc): loc is Monaco.languages.Location => loc != null)
  }

  registerLspEditorActions(editor: Monaco.editor.IStandaloneCodeEditor) {
    const flagged = editor as Monaco.editor.IStandaloneCodeEditor & { __hbLspActions?: boolean }
    if (flagged.__hbLspActions) return
    flagged.__hbLspActions = true

    editor.addAction({
      id: LSP_EXECUTE_COMMAND_ID,
      label: 'LSP Command',
      run: (ed, payload: { lensId?: string; serverCommand?: LspCodeLens['command'] }) => {
        void this.handleLspCommand(ed, payload)
      },
    })
  }

  /** @deprecated Use registerLspEditorActions */
  registerCodeLensAction(editor: Monaco.editor.IStandaloneCodeEditor) {
    this.registerLspEditorActions(editor)
  }

  private isLspEnabledForModel(model: Monaco.editor.ITextModel): boolean {
    const uri = canonicalizeFileUri(model.uri.toString())
    const doc = this.documents.get(uri)
    return Boolean(doc?.lspEnabled && this.serverReady[doc.serverId])
  }

  private async request(uri: string, method: string, params: unknown): Promise<unknown> {
    const canonical = canonicalizeFileUri(uri)
    const doc = this.documents.get(canonical) ?? this.documents.get(uri)
    if (!doc?.lspEnabled || !this.serverReady[doc.serverId]) return null
    const id = this.nextId++
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, 8000)
      this.pending.set(id, { resolve, timer })
      window.api.lsp.send({
        serverId: doc.serverId,
        rootUri: this.rootUri,
        message: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      })
    })
  }

  openDocument(relativePath: string, languageId: string, text: string) {
    this.warmUpDocument(relativePath, languageId, text)
  }

  changeDocumentIncremental(
    relativePath: string,
    languageId: string,
    monacoChanges: Monaco.editor.IModelContentChange[]
  ) {
    const serverId = languageIdForLsp(languageId)
    if (!serverId || !this.repoCwd || monacoChanges.length === 0) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const doc = this.documents.get(uri)
    if (!doc) {
      const text = getModelText(this.repoCwd, relativePath) ?? editorCommandBridge.get()?.getValue() ?? ''
      this.openTextDocument(this.repoCwd, relativePath, text, languageId)
      return
    }
    const version = this.getModelVersion(relativePath)
    doc.version = version
    if (!doc.lspEnabled) return

    const lspChanges = monacoChanges.map(c => ({
      range: monacoRangeToLsp(c.range),
      rangeLength: c.rangeLength,
      text: c.text,
    }))

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
      this.openTextDocument(this.repoCwd, relativePath, text, languageId)
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

  private flushDocumentChange(_payload: { relativePath: string; languageId: string }) {
    if (this.pendingIncremental.size === 0) return
    for (const [uri, pending] of [...this.pendingIncremental.entries()]) {
      this.pendingIncremental.delete(uri)
      const serverId = languageIdForLsp(pending.languageId)
      if (!serverId || !this.repoCwd) continue
      const doc = this.documents.get(uri)
      if (!doc?.lspEnabled) continue
      this.ensureServerFor(serverId)
      this.notify(serverId, 'textDocument/didChange', {
        textDocument: { uri, version: pending.version },
        contentChanges: pending.changes,
      })
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
    this.closeAllDocuments()
    this.wired = false
  }
}

export const editorLanguageService = new EditorLanguageService()

onTextModelReady(event => {
  if (event.reason === 'disk-reload') {
    editorLanguageService.reloadDocumentFromDisk(
      event.repoCwd,
      event.relativePath,
      event.languageId,
      event.content
    )
    return
  }
  editorLanguageService.openTextDocument(event.repoCwd, event.relativePath, event.content, event.languageId)
})
