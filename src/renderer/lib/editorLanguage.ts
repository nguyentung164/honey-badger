const EXT_TO_LANGUAGE: Record<string, string> = {
  java: 'java',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bat: 'bat',
  ps1: 'powershell',
}

export function getEditorLanguage(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  const ext = lastDot >= 0 ? filePath.slice(lastDot + 1).toLowerCase() : ''
  return EXT_TO_LANGUAGE[ext] || 'plaintext'
}
