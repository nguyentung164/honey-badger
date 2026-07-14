type GitStatusFile = {
  path: string
  index: string
  working_dir: string
}

export type GitStatusUpdatedPayload = {
  files?: GitStatusFile[]
  conflicted?: string[]
}

/** Payload for renderer `git-status-updated` CustomEvent. */
export type GitStatusUpdatedDetail = {
  cwd?: string
  /** Set when GitStagingTable already called git.status — listeners should not call it again. */
  fromTable?: boolean
  conflictCount?: number
  ahead?: number
  behind?: number
  currentBranch?: string
  /** Raw git status data when fromTable — reuse for explorer/tab decorations. */
  statusData?: GitStatusUpdatedPayload
}

export const GIT_STATUS_UPDATED_EVENT = 'git-status-updated'
