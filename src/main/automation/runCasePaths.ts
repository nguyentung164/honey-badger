import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getCase } from './db'
import { getSpecFile } from './workspace'

export interface ResolveCaseSpecsResult {
  /** Đường dẫn tương đối workspace (POSIX-style `/` để ổn định trên Windows). */
  relPaths: string[]
  /** Mã case có file spec thiếu trên đĩa. */
  missingSpecCodes: string[]
}

function toPosixRel(workspacePath: string, absPath: string): string {
  return path.relative(workspacePath, absPath).split(path.sep).join('/')
}

/**
 * Map case UUID → file spec tồn tại trong workspace; bỏ case sai project / không tồn tại.
 */
export async function resolveCaseIdsToExistingSpecRelPaths(
  projectId: string,
  workspacePath: string,
  caseIds: string[]
): Promise<ResolveCaseSpecsResult> {
  const relPaths: string[] = []
  const missingSpecCodes: string[] = []
  const seenPath = new Set<string>()

  for (const id of caseIds) {
    const tc = await getCase(id)
    if (!tc || tc.projectId !== projectId) continue
    const abs = getSpecFile(projectId, tc.code)
    try {
      await fs.access(abs)
    } catch {
      missingSpecCodes.push(tc.code)
      continue
    }
    const rel = toPosixRel(workspacePath, abs)
    if (seenPath.has(rel)) continue
    seenPath.add(rel)
    relPaths.push(rel)
  }

  return { relPaths, missingSpecCodes }
}
