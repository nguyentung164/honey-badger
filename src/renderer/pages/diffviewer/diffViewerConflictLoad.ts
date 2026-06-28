export async function loadGitConflictFileContent(filePath: string, cwd?: string): Promise<string> {
  const result = await window.api.git.read_conflict_working_content(filePath, cwd?.trim() || undefined)
  if (result.status === 'success' && typeof result.data === 'string') return result.data
  throw new Error(result.message || 'read_conflict_working_content failed')
}
