const EXT_TO_LANGUAGE: Record<string, string> = {
  abap: 'abap',
  apex: 'apex',
  azcli: 'azcli',
  bat: 'bat',
  cmd: 'bat',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  csharp: 'csharp',
  cs: 'csharp',
  css: 'css',
  dart: 'dart',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  fsharp: 'fsharp',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  go: 'go',
  graphql: 'graphql',
  gql: 'graphql',
  handlebars: 'handlebars',
  hbs: 'handlebars',
  html: 'html',
  htm: 'html',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  kotlin: 'kotlin',
  kt: 'kotlin',
  less: 'less',
  lua: 'lua',
  markdown: 'markdown',
  md: 'markdown',
  mysql: 'mysql',
  'objective-c': 'objective-c',
  m: 'objective-c',
  perl: 'perl',
  pl: 'perl',
  pgsql: 'pgsql',
  php: 'php',
  plaintext: 'plaintext',
  txt: 'plaintext',
  powershell: 'powershell',
  ps1: 'powershell',
  python: 'python',
  py: 'python',
  r: 'r',
  ruby: 'ruby',
  rb: 'ruby',
  rust: 'rust',
  rs: 'rust',
  scss: 'scss',
  shell: 'shell',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  swift: 'swift',
  vb: 'vb',
  xml: 'xml',
  xsd: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
}

export function getPathExtension(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  const lastDot = base.lastIndexOf('.')
  if (lastDot <= 0) return ''
  return base.slice(lastDot + 1).toLowerCase()
}

export function getEditorLanguage(filePath: string): string {
  const ext = getPathExtension(filePath)
  return EXT_TO_LANGUAGE[ext] || 'plaintext'
}

/** Monaco 0.55+ uses `typescript` / `javascript` for .tsx / .jsx (no *react language ids). */
export function resolveMonacoLanguageId(languageId: string, _filePath?: string): string {
  if (languageId === 'typescriptreact') return 'typescript'
  if (languageId === 'javascriptreact') return 'javascript'
  return languageId
}

/** LSP language id sent to TypeScript/Java language servers (VS Code–compatible). */
export function getLspLanguageId(filePath: string): string {
  const ext = getPathExtension(filePath)
  if (ext === 'tsx') return 'typescriptreact'
  if (ext === 'jsx') return 'javascriptreact'
  if (ext === 'ts' || ext === 'cts' || ext === 'mts') return 'typescript'
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'es6' || ext === 'javascript') return 'javascript'
  return getEditorLanguage(filePath)
}

/** VS Code language mode id — used for LSP and status bar (differs from Monaco id for .tsx/.jsx). */
export const getEditorLanguageMode = getLspLanguageId

const VS_CODE_LANGUAGE_LABELS: Record<string, string> = {
  typescriptreact: 'TypeScript React',
  typescript: 'TypeScript',
  javascriptreact: 'JavaScript React',
  javascript: 'JavaScript',
  java: 'Java',
  json: 'JSON',
  css: 'CSS',
  html: 'HTML',
  markdown: 'Markdown',
  python: 'Python',
  plaintext: 'Plain Text',
}

export function getEditorLanguageDisplayName(filePath: string): string {
  const mode = getEditorLanguageMode(filePath)
  return getLanguageDisplayName(mode)
}

export function getLanguageDisplayName(languageModeId: string): string {
  return VS_CODE_LANGUAGE_LABELS[languageModeId] ?? languageModeId
}

export function languageIdForLsp(languageId: string): 'typescript' | 'java' | null {
  if (languageId === 'typescript' || languageId === 'typescriptreact' || languageId === 'javascript' || languageId === 'javascriptreact') {
    return 'typescript'
  }
  if (languageId === 'java') return 'java'
  return null
}
