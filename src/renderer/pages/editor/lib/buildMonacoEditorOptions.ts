import type * as Monaco from 'monaco-editor'
import { resolveFontWeightPreviewStyle, resolveTerminalFontFamily } from '@/lib/terminal/terminalPrefs'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'

/** VS Code–aligned Monaco construction options. */
export function buildMonacoEditorOptions(
  settings: EditorSettings,
  heavy: boolean,
  readOnly: boolean
): Monaco.editor.IStandaloneEditorConstructionOptions {
  const fontFamily = resolveTerminalFontFamily(settings.fontFamilyId)
  const weightStyle = resolveFontWeightPreviewStyle(settings.fontFamilyId, settings.fontWeight)

  return {
    readOnly,
    fontSize: settings.fontSize,
    fontWeight: String(weightStyle.fontWeight),
    lineHeight: 0,
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
    detectIndentation: settings.detectIndentation,
    fontFamily,
    fontLigatures: settings.enableLigatures,
    automaticLayout: false,
    padding: { top: 8, bottom: 8 },
    lineNumbers: settings.lineNumbers,
    lineNumbersMinChars: 3,
    rulers: settings.rulers.length > 0 ? settings.rulers : undefined,
    scrollBeyondLastLine: settings.scrollBeyondLastLine,
    wordWrap: settings.wordWrap,
    minimap: { enabled: settings.minimap && !heavy },
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      useShadows: false,
    },
    smoothScrolling: settings.smoothScrolling,
    cursorBlinking: settings.cursorBlink ? 'smooth' : 'solid',
    cursorSmoothCaretAnimation: settings.cursorBlink ? 'on' : 'off',
    cursorStyle: settings.cursorStyle,
    bracketPairColorization: { enabled: settings.bracketPairColorization && !heavy, independentColorPoolPerBracketType: true },
    guides: {
      indentation: false,
      bracketPairs: settings.bracketPairColorization && !heavy,
      bracketPairsHorizontal: settings.bracketPairColorization && !heavy ? 'active' : false,
    },
    renderWhitespace: heavy ? 'none' : settings.renderWhitespace,
    renderControlCharacters: !heavy && settings.renderControlCharacters,
    renderLineHighlight: 'line',
    occurrencesHighlight: heavy ? 'off' : 'singleFile',
    selectionHighlight: !heavy,
    folding: !heavy,
    foldingHighlight: true,
    matchBrackets: 'always',
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoSurround: 'languageDefined',
    formatOnPaste: !heavy && settings.formatOnPaste,
    formatOnType: false,
    linkedEditing: !heavy && settings.linkedEditing,
    dragAndDrop: settings.dragAndDrop,
    suggestOnTriggerCharacters: true,
    quickSuggestions: heavy ? false : { other: true, comments: false, strings: true },
    wordBasedSuggestions: heavy ? 'off' : 'currentDocument',
    links: !heavy && settings.links,
    showUnused: !heavy && settings.showUnused,
    colorDecorators: !heavy,
    lineDecorationsWidth: 12,
    largeFileOptimizations: true,
    stickyScroll: { enabled: !heavy && settings.stickyScroll },
    codeLens: !heavy && settings.codeLens,
    inlayHints: { enabled: !heavy && settings.inlayHints ? 'on' : 'off' },
  }
}
