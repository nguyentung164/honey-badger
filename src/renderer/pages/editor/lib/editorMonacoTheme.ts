import type * as Monaco from 'monaco-editor'
import type { CSSProperties } from 'react'
import { onAppMonacoBeforeMount, readAppMonacoPreviewColors, resolveAppMonacoThemeId } from '@/lib/monaco/appMonacoTheme'
import { resolveFontWeightPreviewStyle, terminalLigatureCss } from '@/lib/terminal/terminalPrefs'
import type { EditorPreviewSampleLanguage, EditorSettings } from '@/pages/editor/hooks/useEditorSettings'

export const EDITOR_FONT_SIZE_MIN = 10
export const EDITOR_FONT_SIZE_MAX = 24

export const EDITOR_AUTO_SAVE_DELAY_MIN = 500
export const EDITOR_AUTO_SAVE_DELAY_MAX = 10_000

export const EDITOR_BRACKET_COLORS = ['#ffd700', '#da70d6', '#179fff', '#00fca0', '#f78383', '#b589f8'] as const

export const EDITOR_THEME_IDS = {
  dark: 'hb-app-dark',
  light: 'hb-app-light',
} as const

export type EditorThemePreviewColors = {
  background: string
  foreground: string
  keyword: string
  keywordControl: string
  string: string
  comment: string
  number: string
  function: string
  type: string
  variable: string
}

export const EDITOR_THEME_PREVIEW: Record<'light' | 'dark', EditorThemePreviewColors> = {
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    keyword: '#569cd6',
    keywordControl: '#c586c0',
    string: '#ce9178',
    comment: '#6a9955',
    number: '#b5cea8',
    function: '#dcdcaa',
    type: '#4ec9b0',
    variable: '#9cdcfe',
  },
  light: {
    background: '#fffffe',
    foreground: '#000000',
    keyword: '#0000ff',
    keywordControl: '#af00db',
    string: '#a31515',
    comment: '#008000',
    number: '#098658',
    function: '#795e26',
    type: '#267f99',
    variable: '#001080',
  },
}

const PREVIEW_SAMPLE_TAIL_TS = `const appId = \`com.example.my-app\`.toLowerCase()
const ligatures = '=> -> ...'
const unusedPreview = 42
const tabDemo = 'a	b'
const trailingSpaces = 'end'   
const longLine = 'This line is intentionally long so word wrap and the minimap are easier to see when those settings are enabled in the preview. See https://example.com/docs'
// end preview`

const PREVIEW_SAMPLE_MARKDOWN = `# Preview heading

Paragraph with **bold**, _italic_, and a [documentation link](https://example.com).

- Bullet one
- Bullet two

\`\`\`ts
export const sample = true
\`\`\`
`

const PREVIEW_SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Linked editing preview</title>
  </head>
  <body>
    <div class="container">
      <p>Edit one tag — the pair updates together.</p>
    </div>
  </body>
</html>
`

/** Preview document text that reflects tab size and spaces-vs-tabs preference. */
export function buildEditorPreviewSample(
  tabSize: number,
  insertSpaces: boolean,
  language: EditorPreviewSampleLanguage = 'typescript'
): string {
  if (language === 'markdown') return PREVIEW_SAMPLE_MARKDOWN
  if (language === 'html') return PREVIEW_SAMPLE_HTML

  const indent = insertSpaces ? ' '.repeat(tabSize) : '\t'
  const bodyIndent = insertSpaces ? ' '.repeat(tabSize * 2) : `${indent}${indent}`
  const indentLabel = insertSpaces ? `'spaces × ${tabSize}'` : `'tab × ${tabSize}'`

  return `// Brackets · minimap · sticky scroll · whitespace · inlay hints · CodeLens
export function parseConfig(input: string) {
${indent}const tokens = input.trim().split(/\\s+/)
${indent}if (tokens.length < 2) {
${bodyIndent}return { ok: false }
${indent}}

${indent}const pairs = []
${indent}for (let i = 0; i < tokens.length; i += 2) {
${bodyIndent}pairs.push([tokens[i], tokens[i + 1] ?? ''])
${indent}}

${indent}return { ok: true, value: JSON.stringify({ pairs }) }
}

function indentSample() {
${indent}return ${indentLabel}
}

${PREVIEW_SAMPLE_TAIL_TS}`
}

export function resolveEditorPreviewMonacoLanguage(language: EditorPreviewSampleLanguage): string {
  if (language === 'markdown') return 'markdown'
  if (language === 'html') return 'html'
  return 'typescript'
}

/** Static sample for tests / fallbacks — uses 2-space indentation. */
const PREVIEW_SAMPLE = buildEditorPreviewSample(2, true)

export { PREVIEW_SAMPLE }

/** @deprecated Themes register via onAppMonacoBeforeMount — kept for call-site compatibility. */
export function ensureEditorMonacoThemes(monaco: typeof Monaco): void {
  onAppMonacoBeforeMount(monaco)
}

/** Follow app appearance (Settings → Appearance). */
export function resolveEditorMonacoTheme(appIsDark: boolean): string {
  return resolveAppMonacoThemeId(appIsDark)
}

export function resolveEditorThemePreviewColors(appIsDark: boolean): EditorThemePreviewColors {
  return readAppMonacoPreviewColors(appIsDark)
}

/** CSS variables + inline styles applied on `.hb-monaco-editor-root` for font family/weight/ligatures. */
export function resolveEditorMonacoFontStyle(
  settings: Pick<EditorSettings, 'fontFamilyId' | 'fontWeight' | 'enableLigatures' | 'fontSize'>
): CSSProperties {
  const weightStyle = resolveFontWeightPreviewStyle(settings.fontFamilyId, settings.fontWeight)
  const ligatures = terminalLigatureCss(settings.enableLigatures)
  return {
    ...weightStyle,
    ...ligatures,
    ['--hb-editor-font-family' as string]: weightStyle.fontFamily,
    ['--hb-editor-font-weight' as string]: String(weightStyle.fontWeight),
    ['--hb-editor-font-size' as string]: `${settings.fontSize}px`,
    ['--hb-editor-font-variation-settings' as string]: weightStyle.fontVariationSettings,
    ['--hb-editor-font-feature-settings' as string]: ligatures.fontFeatureSettings,
  }
}
