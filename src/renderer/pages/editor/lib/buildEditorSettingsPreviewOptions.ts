import type * as Monaco from 'monaco-editor'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'

function resolveEditorSettingsPreviewReadOnly(settings: EditorSettings): boolean {
  return !(settings.previewSampleLanguage === 'html' && settings.linkedEditing)
}

/** Monaco options for the settings dialog preview — minimal overrides vs the real editor. */
export function buildEditorSettingsPreviewOptions(
  settings: EditorSettings
): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    ...buildMonacoEditorOptions(settings, false, resolveEditorSettingsPreviewReadOnly(settings)),
    // Preview lives in a dialog — must resize when the panel becomes visible.
    automaticLayout: true,
    scrollbar: {
      vertical: 'auto',
      horizontal: 'hidden',
      handleMouseWheel: true,
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 0,
      useShadows: false,
    },
    overviewRulerLanes: 3,
    hideCursorInOverviewRuler: false,
    overviewRulerBorder: false,
    contextmenu: false,
    glyphMargin: false,
    lineDecorationsWidth: 10,
    fixedOverflowWidgets: true,
  }
}
