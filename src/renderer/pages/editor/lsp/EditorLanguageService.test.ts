import type * as Monaco from 'monaco-editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from '@/components/ui-elements/Toast'
import { openWorkspaceLocation } from '@/pages/editor/lib/registerEditorNavigation'
import { EditorLanguageService } from './EditorLanguageService'

vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/components/ui-elements/Toast', () => ({ default: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@/pages/editor/hooks/useEditorSettings', () => ({ useEditorSettings: {} }))
vi.mock('@/pages/editor/lib/registerEditorNavigation', () => ({ openWorkspaceLocation: vi.fn() }))

describe('source definition navigation', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([true, false])('opens a single target through the workspace (opened: %s)', async opened => {
    vi.mocked(openWorkspaceLocation).mockResolvedValue(opened)
    const trigger = vi.fn()
    const editor = {
      getModel: () => ({}),
      getPosition: () => ({ lineNumber: 1, column: 1 }),
      trigger,
    } as unknown as Monaco.editor.ICodeEditor
    const link = {
      uri: { toString: () => 'file:///repo/target.ts' },
      range: { startLineNumber: 12, startColumn: 3, endLineNumber: 12, endColumn: 9 },
    } as Monaco.languages.LocationLink
    const service = new EditorLanguageService()

    await service['goToDefinitionLocations'](editor, [link], 'Definition unavailable')

    expect(openWorkspaceLocation).toHaveBeenCalledWith('file:///repo/target.ts', 12, 3)
    expect(trigger).not.toHaveBeenCalled()
    if (opened) expect(toast.info).not.toHaveBeenCalled()
    else expect(toast.info).toHaveBeenCalledWith('Definition unavailable')
  })
})
