import { GIT_INDEX_REF } from 'shared/git/revisionSpecs'

export type StagingDiffCompareMode = 'staged' | 'unstaged'

export type StagingDiffProfile = {
  compareMode: StagingDiffCompareMode
  modifiedEditable: boolean
  originalEditable: boolean
}

export type StagingPaneLabelContext = {
  /** Same path also listed under Staged (partial stage). */
  hasStagedEntryForPath?: boolean
  fileStatus?: string
}

export type StagingPaneLabels = {
  originalLabelKey: string
  modifiedLabelKey: string
  /** Short hint for tooltips / docs — not shown in UI by default. */
  caseId: StagingPaneLabelCaseId
}

export type StagingPaneLabelCaseId =
  | 'staged-commit-vs-staged'
  | 'unstaged-partial-stage'
  | 'unstaged-only'
  | 'unstaged-untracked'
  | 'unstaged-deleted'

export function isGitUntrackedFileStatus(fileStatus?: string): boolean {
  const s = (fileStatus || '').trim().toLowerCase()
  return s === 'untracked' || s === 'u' || s === '?'
}

function isGitDeletedStatus(fileStatus: string): boolean {
  const s = (fileStatus || '').trim().toLowerCase()
  return s === 'deleted' || s === 'd'
}

function isGitUntrackedStatus(fileStatus: string): boolean {
  return isGitUntrackedFileStatus(fileStatus)
}

function isLikelyGitUnmergedWorkingTree(fileStatus: string): boolean {
  const s = (fileStatus || '').trim()
  if (!s) return false
  if (s.toLowerCase() === 'conflicted') return true
  return /^(UU|DD|AA|AU|UA|UD|DU|DA|AD)$/i.test(s)
}

async function readGitWorkingTreeContent(
  filePath: string,
  fileStatus: string,
  catOpts?: { cwd?: string }
): Promise<string> {
  if (isLikelyGitUnmergedWorkingTree(fileStatus)) {
    const r = await window.api.git.read_conflict_working_content(filePath, catOpts?.cwd)
    if (r.status === 'success' && typeof r.data === 'string') return r.data
    throw new Error(r.message || 'read_conflict_working_content failed')
  }
  if (isGitDeletedStatus(fileStatus)) {
    return ''
  }
  try {
    return await window.api.system.read_file(filePath, catOpts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const looksMissing = msg.includes('ENOENT') || /no such file|cannot find|not found|The system cannot find the file/i.test(msg)
    if (looksMissing) {
      return ''
    }
    throw err
  }
}

async function readGitCatRef(
  filePath: string,
  fileStatus: string,
  ref: string,
  catOpts?: { cwd?: string }
): Promise<string> {
  const result = await window.api.git.cat(filePath, fileStatus, ref, catOpts)
  if (result.status !== 'success') {
    throw new Error(result.message || `Failed to read ${ref}`)
  }
  return result.data ?? ''
}

/** Index snapshot, falling back to HEAD when the path is not in the index (VS Code `~` behavior). */
async function readGitIndexOrHeadContent(
  filePath: string,
  fileStatus: string,
  catOpts?: { cwd?: string }
): Promise<string> {
  if (isGitUntrackedStatus(fileStatus)) {
    return ''
  }

  const indexContent = await readGitCatRef(filePath, fileStatus, GIT_INDEX_REF, catOpts)
  if (indexContent.length > 0 || isGitDeletedStatus(fileStatus)) {
    return indexContent
  }

  try {
    return await readGitCatRef(filePath, fileStatus, 'HEAD', catOpts)
  } catch {
    return ''
  }
}

/** VS Code SCM: staged → HEAD vs Index; unstaged → Index vs Working Tree. */
export function resolveStagingDiffProfile(stagingState: 'staged' | 'unstaged'): StagingDiffProfile {
  if (stagingState === 'staged') {
    return {
      compareMode: 'staged',
      modifiedEditable: false,
      originalEditable: false,
    }
  }

  return {
    compareMode: 'unstaged',
    modifiedEditable: true,
    originalEditable: false,
  }
}

/**
 * Human-friendly pane labels aligned with the Changes / Staged tree sections.
 * Left baseline is "Staged" only when this path has a staged snapshot (partial stage).
 */
export function resolveStagingPaneLabels(
  stagingState: 'staged' | 'unstaged',
  context: StagingPaneLabelContext = {}
): StagingPaneLabels {
  if (stagingState === 'staged') {
    return {
      caseId: 'staged-commit-vs-staged',
      originalLabelKey: 'dialog.diffViewer.paneHead',
      modifiedLabelKey: 'dialog.diffViewer.paneStaged',
    }
  }

  if (isGitDeletedStatus(context.fileStatus ?? '')) {
    return {
      caseId: 'unstaged-deleted',
      originalLabelKey: context.hasStagedEntryForPath ? 'dialog.diffViewer.paneStaged' : 'dialog.diffViewer.paneHead',
      modifiedLabelKey: 'dialog.diffViewer.paneWorkingCopy',
    }
  }

  if (isGitUntrackedFileStatus(context.fileStatus)) {
    return {
      caseId: 'unstaged-untracked',
      originalLabelKey: 'dialog.diffViewer.paneHead',
      modifiedLabelKey: 'dialog.diffViewer.paneWorkingCopy',
    }
  }

  if (context.hasStagedEntryForPath) {
    return {
      caseId: 'unstaged-partial-stage',
      originalLabelKey: 'dialog.diffViewer.paneStaged',
      modifiedLabelKey: 'dialog.diffViewer.paneWorkingCopy',
    }
  }

  return {
    caseId: 'unstaged-only',
    originalLabelKey: 'dialog.diffViewer.paneHead',
    modifiedLabelKey: 'dialog.diffViewer.paneWorkingCopy',
  }
}

export async function loadGitStagingDiffContent(
  filePath: string,
  fileStatus: string,
  stagingState: 'staged' | 'unstaged',
  catOpts?: { cwd?: string }
): Promise<{ original: string; modified: string }> {
  const profile = resolveStagingDiffProfile(stagingState)

  if (profile.compareMode === 'staged') {
    const [original, modified] = await Promise.all([
      readGitCatRef(filePath, fileStatus, 'HEAD', catOpts),
      readGitCatRef(filePath, fileStatus, GIT_INDEX_REF, catOpts),
    ])
    return { original, modified }
  }

  const [original, modified] = await Promise.all([
    readGitIndexOrHeadContent(filePath, fileStatus, catOpts),
    readGitWorkingTreeContent(filePath, fileStatus, catOpts),
  ])
  return { original, modified }
}
