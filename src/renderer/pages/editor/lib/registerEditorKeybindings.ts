import type * as Monaco from 'monaco-editor'

export type RegisterEditorKeybindingsOptions = {
  onFormatDocument?: () => void
  onOrganizeImports?: () => void
}

/** VS Code–aligned editor shortcuts (Shift+Alt+F format, Shift+Alt+O organize imports). */
export function registerEditorKeybindings(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  options: RegisterEditorKeybindingsOptions = {}
): Monaco.IDisposable {
  const disposables: Monaco.IDisposable[] = []

  if (options.onFormatDocument) {
    const onFormatDocument = options.onFormatDocument
    disposables.push(
      editor.addAction({
        id: 'honeybadger.editor.formatDocument',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.4,
        run: () => {
          onFormatDocument()
        },
      })
    )
  }

  if (options.onOrganizeImports) {
    const onOrganizeImports = options.onOrganizeImports
    disposables.push(
      editor.addAction({
        id: 'honeybadger.editor.organizeImports',
        label: 'Organize Imports',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyO],
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.5,
        run: () => {
          onOrganizeImports()
        },
      })
    )
  }

  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose()
    },
  }
}
