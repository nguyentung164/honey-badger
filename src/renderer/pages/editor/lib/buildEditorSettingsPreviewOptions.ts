import type * as Monaco from 'monaco-editor'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'

export const EDITOR_SETTINGS_PREVIEW_HEIGHT = '14rem'

/** Monaco options for the settings dialog preview — minimal overrides vs the real editor. */
export function buildEditorSettingsPreviewOptions(
  settings: EditorSettings
): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    ...buildMonacoEditorOptions(settings, false, true),
    scrollbar: {
      vertical: 'auto',
      horizontal: 'hidden',
      handleMouseWheel: true,
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 0,
      useShadows: false,
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    contextmenu: false,
    glyphMargin: false,
    lineDecorationsWidth: 8,
    fixedOverflowWidgets: true,
  }
}
