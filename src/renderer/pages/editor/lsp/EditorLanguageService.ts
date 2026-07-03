import type * as Monaco from 'monaco-editor'
import type { LspServerId } from 'shared/lsp/types'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { createBackgroundFlusher, scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'
import { documentUriForPath, isLargeFileForLsp, uriRootsMatch, workspaceRootUri } from '@/pages/editor/lsp/documentUri'
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
  private nextId = 1
  private pending = new Map<number, PendingRequest>()

  private unsubMessage: (() => void) | null = null
  private unsubState: (() => void) | null = null
  private serversStartScheduled = false
  private wired = false
  private pendingDiagnostics = new Map<string, Monaco.editor.IMarkerData[]>()
  private diagnosticsRaf: number | null = null
  private changeFlusher = createBackgroundFlusher<{
    relativePath: string
    languageId: string
    text: string
    version: number
  }>(payload => this.flushDocumentChange(payload), 150)
  private codeLensData = new Map<string, LspCodeLens>()
  private nextLensId = 0

  bind(repoCwd: string, monaco: typeof Monaco) {
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
    this.serversStartScheduled = false
    this.wired = false

    if (!repoCwd) return

    const wire = () => {
      if (this.monaco !== monaco || this.repoCwd !== repoCwd) return

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
            const model = this.monaco.editor.getModel(this.monaco.Uri.parse(msg.params.uri))
            if (!model) return
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
            this.queueDiagnostics(msg.params.uri, diagnostics)
          }
        } catch {
          /* ignore */
        }
      })

      this.unsubState = window.api.lsp.onState(event => {
        if (!uriRootsMatch(event.rootUri, this.rootUri)) return
        if (event.state === 'ready') this.serverReady[event.serverId] = true
        if (event.state === 'stopped' || event.state === 'error') this.serverReady[event.serverId] = false
      })

      this.registerProviders(monaco)
      this.wired = true
    }

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(wire, { timeout: 2500 })
    } else {
      setTimeout(wire, 100)
    }
  }

  private queueDiagnostics(uri: string, diagnostics: Monaco.editor.IMarkerData[]) {
    this.pendingDiagnostics.set(uri, diagnostics)
    if (this.diagnosticsRaf != null) return
    this.diagnosticsRaf = requestAnimationFrame(() => {
      this.diagnosticsRaf = null
      const monaco = this.monaco
      if (!monaco) return
      for (const [uri, markers] of this.pendingDiagnostics) {
        const model = monaco.editor.getModel(monaco.Uri.parse(uri))
        if (model) monaco.editor.setModelMarkers(model, 'lsp', markers)
      }
      this.pendingDiagnostics.clear()
    })
  }

  private ensureServerFor(serverId: LspServerId) {
    if (serverId === 'java') {
      void this.ensureJavaServer()
      return
    }
    this.scheduleEnsureServers()
  }

  private scheduleEnsureServers() {
    if (this.serversStartScheduled || !this.rootUri) return
    this.serversStartScheduled = true
    const run = () => {
      void this.ensureServers()
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 4000 })
    } else {
      setTimeout(run, 2000)
    }
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

  private async ensureServers() {
    await this.startLspServer('typescript')
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
        provideDocumentFormattingEdits: async model => {
          if (!this.isLspEnabledForModel(model)) return []
          const result = (await this.request(model.uri.toString(), 'textDocument/formatting', {
            textDocument: { uri: model.uri.toString() },
            options: { tabSize: 2, insertSpaces: true },
          })) as Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> | null
          if (!result) return []
          return result.map(edit => ({
            range: new monaco.Range(edit.range.start.line + 1, edit.range.start.character + 1, edit.range.end.line + 1, edit.range.end.character + 1),
            text: edit.newText,
          }))
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

  private openDocumentSync(relativePath: string, languageId: string, text: string) {
    const serverId = languageIdForLsp(languageId)
    if (!serverId || !this.repoCwd) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const lspLanguageId = getLspLanguageId(relativePath)
    const lspEnabled = !isLargeFileForLsp(text)
    const existing = this.documents.get(uri)
    const version = existing?.version ?? 1
    this.documents.set(uri, { uri, languageId: lspLanguageId, version, serverId, lspEnabled })
    if (!lspEnabled) return
    this.ensureServerFor(serverId)
    if (!existing) {
      this.notify(serverId, 'textDocument/didOpen', {
        textDocument: { uri, languageId: lspLanguageId, version, text },
      })
    }
  }

  private async ensureDocumentReady(relativePath: string, languageId: string): Promise<boolean> {
    if (!this.repoCwd || !languageIdForLsp(languageId)) return false
    const text = editorCommandBridge.get()?.getValue() ?? ''
    this.openDocumentSync(relativePath, languageId, text)
    const doc = this.documents.get(documentUriForPath(this.repoCwd, relativePath))
    if (!doc?.lspEnabled) return false
    return this.waitForServerReady(doc.serverId)
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

    const uri = model.uri.toString()
    const doc = this.documents.get(uri)
    if (!doc?.lspEnabled) return null

    if (!this.serverReady[doc.serverId]) {
      await this.waitForServerReady(doc.serverId)
    }
    if (!this.serverReady[doc.serverId]) return null

    const result = await this.request(uri, 'textDocument/definition', {
      textDocument: { uri },
      position: { line: position.lineNumber - 1, character: position.column - 1 },
    })
    if (!result) return null

    const monaco = this.monaco
    if (!monaco) return null

    const locations = Array.isArray(result) ? result : [result]
    return locations.map((loc: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }) => ({
      uri: monaco.Uri.parse(loc.uri),
      range: {
        startLineNumber: loc.range.start.line + 1,
        startColumn: loc.range.start.character + 1,
        endLineNumber: loc.range.end.line + 1,
        endColumn: loc.range.end.character + 1,
      },
    }))
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
    const doc = this.documents.get(model.uri.toString())
    return Boolean(doc?.lspEnabled && this.serverReady[doc.serverId])
  }

  private async request(uri: string, method: string, params: unknown): Promise<unknown> {
    const doc = this.documents.get(uri)
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
    const serverId = languageIdForLsp(languageId)
    if (!serverId || !this.repoCwd) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const lspEnabled = !isLargeFileForLsp(text)
    this.documents.set(uri, { uri, languageId, version: 1, serverId, lspEnabled })
    if (!lspEnabled) return

    scheduleBackgroundWork(
      () => {
        this.ensureServerFor(serverId)
        this.notify(serverId, 'textDocument/didOpen', {
          textDocument: { uri, languageId, version: 1, text },
        })
      },
      { timeout: 3000 }
    )
  }

  changeDocument(relativePath: string, languageId: string, text: string, version: number) {
    const serverId = languageIdForLsp(languageId)
    if (!serverId || !this.repoCwd) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const lspEnabled = !isLargeFileForLsp(text)
    const doc = this.documents.get(uri)
    if (!doc) {
      this.openDocument(relativePath, languageId, text)
      return
    }
    doc.version = version
    doc.lspEnabled = lspEnabled
    if (!lspEnabled) return
    this.changeFlusher.push({ relativePath, languageId, text, version })
  }

  private flushDocumentChange(payload: { relativePath: string; languageId: string; text: string; version: number }) {
    const serverId = languageIdForLsp(payload.languageId)
    if (!serverId || !this.repoCwd) return
    const uri = documentUriForPath(this.repoCwd, payload.relativePath)
    const doc = this.documents.get(uri)
    if (!doc?.lspEnabled) return
    this.ensureServerFor(serverId)
    this.notify(serverId, 'textDocument/didChange', {
      textDocument: { uri, version: payload.version },
      contentChanges: [{ text: payload.text }],
    })
  }

  closeDocument(relativePath: string) {
    if (!this.repoCwd) return
    const uri = documentUriForPath(this.repoCwd, relativePath)
    const doc = this.documents.get(uri)
    if (!doc) return
    if (doc.lspEnabled) {
      this.notify(doc.serverId, 'textDocument/didClose', { textDocument: { uri } })
    }
    this.documents.delete(uri)
    const model = this.monaco?.editor.getModel(this.monaco.Uri.parse(uri))
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
    this.documents.clear()
    this.wired = false
  }
}

export const editorLanguageService = new EditorLanguageService()
