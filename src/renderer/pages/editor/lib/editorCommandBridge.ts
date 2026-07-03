export type EditorCursorPosition = {
  line: number
  column: number
}

export type EditorCommandBridge = {
  focus: () => void
  getValue: () => string
  getCursorPosition: () => EditorCursorPosition | null
  runAction: (actionId: string) => Promise<boolean>
  revealLine: (line: number, column?: number) => void
}

let activeBridge: EditorCommandBridge | null = null

export const editorCommandBridge = {
  register(bridge: EditorCommandBridge) {
    activeBridge = bridge
  },
  unregister(bridge: EditorCommandBridge) {
    if (activeBridge === bridge) activeBridge = null
  },
  get(): EditorCommandBridge | null {
    return activeBridge
  },
}

export async function runEditorAction(actionId: string): Promise<boolean> {
  const bridge = editorCommandBridge.get()
  if (!bridge) return false
  bridge.focus()
  return bridge.runAction(actionId)
}
