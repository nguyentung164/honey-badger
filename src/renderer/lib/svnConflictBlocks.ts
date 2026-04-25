/**
 * Parse SVN conflict markers and extract block content for inline resolution.
 * Supports 2-way (<<<<<<< ======= >>>>>>>) and 3-way diff3 (<<<<<<< ||||||| ======= >>>>>>>).
 */

export interface SvnConflictBlock {
  id: string
  mineContent: string
  theirsContent: string
  baseContent?: string
  startLine: number
  endLine: number
}

export interface ParsedSvnConflict {
  blocks: SvnConflictBlock[]
  hasMarkers: boolean
}

const OURS_START = /^\s*<<<<<<</
const BASE_SEP = /^\s*\|\|\|\|\|\|\|/
const MID_SEP = /^\s*=======/
const THEIRS_END = /^\s*>>>>>>>/

export function parseSvnConflictBlocks(workingContent: string): ParsedSvnConflict {
  const blocks: SvnConflictBlock[] = []
  const lines = workingContent.split('\n')
  let blockIndex = 0

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const lineNum = i + 1

    if (OURS_START.test(line)) {
      const conflictStartLine = lineNum
      i++

      let mineLines: string[] = []
      let baseLines: string[] = []
      let theirsLines: string[] = []
      let phase: 'mine' | 'base' | 'theirs' = 'mine'

      while (i < lines.length) {
        const currentLine = lines[i]
        const currentLineNum = i + 1

        if (BASE_SEP.test(currentLine)) {
          phase = 'base'
          i++
          continue
        }

        if (MID_SEP.test(currentLine)) {
          phase = phase === 'mine' ? 'theirs' : 'theirs'
          i++
          continue
        }

        if (THEIRS_END.test(currentLine)) {
          const conflictEndLine = currentLineNum
          const id = `block-${blockIndex}`
          blockIndex++

          blocks.push({
            id,
            mineContent: mineLines.join('\n'),
            theirsContent: theirsLines.join('\n'),
            baseContent: baseLines.length > 0 ? baseLines.join('\n') : undefined,
            startLine: conflictStartLine,
            endLine: conflictEndLine,
          })
          i++
          break
        }

        if (phase === 'mine') {
          mineLines.push(currentLine)
        } else if (phase === 'base') {
          baseLines.push(currentLine)
        } else {
          theirsLines.push(currentLine)
        }
        i++
      }
      // If inner loop exits without finding >>>>>>> (malformed markers), block is not pushed.
      // buildResolvedContent will skip unclosed conflicts; output may be incomplete but won't crash.
      continue
    }

    i++
  }

  return {
    blocks,
    hasMarkers: blocks.length > 0,
  }
}

export type BlockResolution = 'mine' | 'theirs' | 'both-mine-first' | 'both-theirs-first'

export function buildResolvedContent(
  workingContent: string,
  blocks: SvnConflictBlock[],
  resolutions: Record<string, BlockResolution>
): string {
  if (blocks.length === 0) return workingContent

  const lines = workingContent.split('\n')
  let result: string[] = []
  let lineIndex = 0

  for (const block of blocks) {
    while (lineIndex < lines.length) {
      const currentLineNum = lineIndex + 1
      if (currentLineNum < block.startLine) {
        result.push(lines[lineIndex])
        lineIndex++
      } else {
        break
      }
    }

    const resolution = resolutions[block.id] ?? 'mine'
    let resolvedText: string
    switch (resolution) {
      case 'mine':
        resolvedText = block.mineContent
        break
      case 'theirs':
        resolvedText = block.theirsContent
        break
      case 'both-mine-first':
        resolvedText = block.mineContent + (block.theirsContent ? '\n' + block.theirsContent : '')
        break
      case 'both-theirs-first':
        resolvedText = block.theirsContent + (block.mineContent ? '\n' + block.mineContent : '')
        break
      default:
        resolvedText = block.mineContent
    }

    if (resolvedText) {
      result.push(...resolvedText.split('\n'))
    }

    lineIndex = block.endLine
  }

  while (lineIndex < lines.length) {
    result.push(lines[lineIndex])
    lineIndex++
  }

  return result.join('\n')
}
