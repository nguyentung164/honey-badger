import { getModelBaseline } from '@/pages/editor/lib/editorTextModels'
import { readNormalizedDiskText } from '@/pages/editor/lib/editorExternalFileSync'

export type DirtyWriteCheckResult =
  | { action: 'save' }
  | { action: 'noop' }
  | { action: 'confirm'; diskContent: string; editorContent: string }

/**
 * VS Code: before save, detect disk drift vs last-known baseline.
 * Prompt when disk changed externally and buffer differs from disk.
 */
export async function checkDirtyWriteOnSave(
  repoCwd: string,
  relativePath: string,
  editorContent: string
): Promise<DirtyWriteCheckResult> {
  const normalized = relativePath.replace(/\\/g, '/')
  const editor = editorContent.replace(/\r\n/g, '\n')
  const diskText = await readNormalizedDiskText(normalized, repoCwd)
  if (diskText == null) return { action: 'save' }

  if (diskText === editor) return { action: 'noop' }

  const baseline = getModelBaseline(repoCwd, normalized).replace(/\r\n/g, '\n')
  if (diskText === baseline) return { action: 'save' }

  return { action: 'confirm', diskContent: diskText, editorContent: editor }
}
