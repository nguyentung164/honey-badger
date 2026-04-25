import fs from 'node:fs'
import path from 'node:path'
import { isText } from 'main/utils/istextorbinary'

export interface ParseConflictContentResult {
  content?: {
    working: string
    base: string
    theirs: string
    mine: string
  }
  isRevisionConflict: boolean
  conflictType?: 'merge' | 'update'
}

/**
 * Parse SVN conflict content for a file.
 * Supports both merge conflict (.working, .merge-left.r*, .merge-right.r*) and update conflict (.mine, .rOLD, .rNEW).
 */
export function parseConflictContent(filePath: string, sourceFolder: string): ParseConflictContentResult {
  const fullFilePath = path.join(sourceFolder, filePath)
  const dir = path.dirname(fullFilePath)
  const baseName = path.basename(fullFilePath)

  const textResult = fs.existsSync(fullFilePath) ? isText(fullFilePath) : null
  if (textResult === false) {
    return { isRevisionConflict: false }
  }

  if (!fs.existsSync(dir)) {
    return { isRevisionConflict: true }
  }

  const allFiles = fs.readdirSync(dir)

  // Merge conflict: .working, .merge-left.rREV, .merge-right.rREV
  const workingPath = `${fullFilePath}.working`
  const leftFile = allFiles.find(f => f.startsWith(`${baseName}.merge-left.r`))
  const rightFile = allFiles.find(f => f.startsWith(`${baseName}.merge-right.r`))
  const fullLeftPath = leftFile ? path.join(dir, leftFile) : null
  const fullRightPath = rightFile ? path.join(dir, rightFile) : null
  const hasWorkingFile = fs.existsSync(workingPath)
  const hasLeftFile = fullLeftPath && fs.existsSync(fullLeftPath)
  const hasRightFile = fullRightPath && fs.existsSync(fullRightPath)

  if (hasWorkingFile || hasLeftFile || hasRightFile) {
    const base = hasWorkingFile ? fs.readFileSync(fullFilePath, 'utf8') : 'No .working file available'
    const working = hasWorkingFile ? fs.readFileSync(workingPath, 'utf8') : 'No .working file available'
    const theirs = hasLeftFile ? fs.readFileSync(fullLeftPath, 'utf8') : 'No .merge-left file available'
    const mine = hasRightFile ? fs.readFileSync(fullRightPath, 'utf8') : 'No .merge-right file available'

    return {
      content: { working, base, theirs, mine },
      isRevisionConflict: false,
      conflictType: 'merge',
    }
  }

  // Update conflict: .mine, .rOLDREV, .rNEWREV
  const minePath = `${fullFilePath}.mine`
  const rFiles = allFiles.filter(f => {
    const match = f.match(new RegExp(`^${escapeRegex(baseName)}\\.r(\\d+)$`))
    return !!match
  })
  const hasMineFile = fs.existsSync(minePath)
  const hasRFiles = rFiles.length > 0

  if (hasMineFile || hasRFiles) {
    const rFilePaths = rFiles
      .map(f => {
        const m = f.match(/\.r(\d+)$/)
        return { name: f, rev: m ? Number.parseInt(m[1], 10) : 0 }
      })
      .sort((a, b) => a.rev - b.rev)

    const oldRevFile = rFilePaths[0]?.name
    const newRevFile = rFilePaths[rFilePaths.length - 1]?.name
    const fullOldPath = oldRevFile ? path.join(dir, oldRevFile) : null
    const fullNewPath = newRevFile ? path.join(dir, newRevFile) : null

    const mine = hasMineFile ? fs.readFileSync(minePath, 'utf8') : 'No .mine file available'
    const base = fullOldPath ? fs.readFileSync(fullOldPath, 'utf8') : 'No .rOLD file available'
    const theirs = fullNewPath ? fs.readFileSync(fullNewPath, 'utf8') : 'No .rNEW file available'
    const working = fs.existsSync(fullFilePath) ? fs.readFileSync(fullFilePath, 'utf8') : 'No working file available'

    return {
      content: { working, base, theirs, mine },
      isRevisionConflict: false,
      conflictType: 'update',
    }
  }

  return { isRevisionConflict: true }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
