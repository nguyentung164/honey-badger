import { readNormalizedDiskText } from '@/pages/editor/lib/editorExternalFileSync'
import { getModelBaseline, getModelDiskMtimeMs } from '@/pages/editor/lib/editorTextModels'

export type DirtyWriteCheckResult =
  | { action: 'save'; diskMtimeMs?: number | null }
  | { action: 'noop'; diskMtimeMs?: number | null }
  | { action: 'confirm'; diskContent: string; editorContent: string }

/**
 * VS Code: before save, detect disk drift vs last-known baseline.
 * Prompt when disk changed externally and buffer differs from disk.
 *
 * Fast path: when disk mtime is unchanged vs the stored baseline mtime, skip the
 * full-file read (Windows mtime can be unreliable — only "unchanged" is trusted;
 * any newer mtime falls through to the full content compare).
 */
export async function checkDirtyWriteOnSaveWithBaseline(
  repoCwd: string,
  relativePath: string,
  editorContent: string,
  baselineContent: string,
  baselineMtimeMs: number | null
): Promise<DirtyWriteCheckResult> {
  const normalized = relativePath.replace(/\\/g, '/')
  const editor = editorContent.replace(/\r\n/g, '\n')
  const baseline = baselineContent.replace(/\r\n/g, '\n')

  if (baselineMtimeMs != null) {
    try {
      const meta = await window.api.system.detect_file_kind(normalized, { cwd: repoCwd })
      if (meta.mtimeMs != null && meta.mtimeMs <= baselineMtimeMs) {
        if (editor === baseline) return { action: 'noop', diskMtimeMs: meta.mtimeMs }
        return { action: 'save', diskMtimeMs: meta.mtimeMs }
      }
    } catch {
      /* fall through to full content compare */
    }
  }

  const diskText = await readNormalizedDiskText(normalized, repoCwd)
  if (diskText == null) return { action: 'save', diskMtimeMs: null }

  if (diskText === editor) return { action: 'noop', diskMtimeMs: null }

  if (diskText === baseline) return { action: 'save', diskMtimeMs: null }

  return { action: 'confirm', diskContent: diskText, editorContent: editor }
}

export async function checkDirtyWriteOnSave(repoCwd: string, relativePath: string, editorContent: string): Promise<DirtyWriteCheckResult> {
  const normalized = relativePath.replace(/\\/g, '/')
  return checkDirtyWriteOnSaveWithBaseline(
    repoCwd,
    relativePath,
    editorContent,
    getModelBaseline(repoCwd, normalized),
    getModelDiskMtimeMs(repoCwd, normalized)
  )
}
