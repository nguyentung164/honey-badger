import type * as Monaco from 'monaco-editor'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { clearMonacoSymbolNavigationDecorations } from '@/pages/editor/lib/definitionNavigation'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { resolveFileUriForOpen } from '@/pages/editor/lib/resolveTypeScriptModule'

let navigationRepoCwd = ''
let openerRegistered = false

export function setEditorNavigationRepo(repoCwd: string) {
  navigationRepoCwd = repoCwd
}

function activeFromRelativePath(): string | null {
  const state = useEditorWorkspace.getState()
  const tab = state.tabs.find(t => t.id === state.activeTabId)
  return tab?.relativePath ?? null
}

async function openNodeModuleSpecifier(specifier: string, repoCwd: string): Promise<boolean> {
  const fromRelativePath = activeFromRelativePath()
  if (!fromRelativePath) return false
  const resolved = await window.api.system.resolve_node_module({
    specifier,
    cwd: repoCwd,
    fromRelativePath,
  })
  if (!resolved) return false
  await useEditorWorkspace.getState().openFile(resolved, { repoRoot: repoCwd, pin: true })
  return true
}

async function openWorkspaceLocation(uri: string, line?: number, column?: number): Promise<boolean> {
  const repoCwd = navigationRepoCwd || useEditorWorkspace.getState().repoCwd
  if (!repoCwd) return false

  const opts = {
    pin: true as const,
    ...(line != null ? { line, column: column ?? 1 } : {}),
  }

  if (uri.startsWith('node:')) {
    const opened = await openNodeModuleSpecifier(uri, repoCwd)
    if (!opened) {
      toast.error(i18n.t('editor.lsp.definitionResolveFailed', { specifier: uri }))
    }
    return opened
  }

  const target = resolveFileUriForOpen(uri, repoCwd)
  if (!target) return false

  await useEditorWorkspace.getState().openFile(target.relativePath, {
    ...opts,
    repoRoot: target.repoRoot,
  })
  return true
}

function registerEditorOpener(monaco: typeof Monaco) {
  if (openerRegistered) return
  openerRegistered = true

  monaco.editor.registerEditorOpener({
    openCodeEditor: async (source, resource, selectionOrPosition) => {
      clearMonacoSymbolNavigationDecorations(source)
      let line: number | undefined
      let column: number | undefined
      if (selectionOrPosition) {
        if ('startLineNumber' in selectionOrPosition) {
          line = selectionOrPosition.startLineNumber
          column = selectionOrPosition.startColumn
        } else {
          line = selectionOrPosition.lineNumber
          column = selectionOrPosition.column
        }
      }
      const opened = await openWorkspaceLocation(resource.toString(), line, column)
      if (opened) {
        const clear = () => clearMonacoSymbolNavigationDecorations(source)
        // Monaco applies `symbolHighlight` after the opener resolves — clear on next ticks.
        queueMicrotask(clear)
        requestAnimationFrame(clear)
        window.setTimeout(clear, 0)
        window.setTimeout(clear, 50)
      }
      return opened
    },
  })
}

/** Register Monaco editor opener for LSP definition navigation (VS Code pattern). */
export function registerEditorNavigation(monaco: typeof Monaco, repoCwd: string): void {
  setEditorNavigationRepo(repoCwd)
  registerEditorOpener(monaco)
}
