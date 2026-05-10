import { query } from '../schema/db'

export interface GitCommitQueueRecord {
  commitHash: string
  commitUser: string
  commitTime: string
  commitMessage: string
  addedFiles: string[]
  modifiedFiles: string[]
  deletedFiles: string[]
  hasCheckCodingRule: boolean
  hasCheckSpotbugs: boolean
  branchName?: string
  insertions?: number
  deletions?: number
  changes?: number
  sourceFolderPath?: string
}

function parseJsonArray(val: string | string[] | null): string[] {
  if (val == null) return []
  if (Array.isArray(val)) return val.map(String)
  try {
    const arr = typeof val === 'string' ? JSON.parse(val) : val
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

export async function addToQueue(record: GitCommitQueueRecord): Promise<void> {
  const addedFiles = JSON.stringify(record.addedFiles ?? [])
  const modifiedFiles = JSON.stringify(record.modifiedFiles ?? [])
  const deletedFiles = JSON.stringify(record.deletedFiles ?? [])
  await query(
    `INSERT INTO git_commit_queue (commit_hash, commit_user, commit_time, commit_message, added_files, modified_files, deleted_files, has_check_coding_rule, has_check_spotbugs, branch_name, insertions, deletions, changes, source_folder_path)
     VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (commit_hash) DO UPDATE SET
       commit_user = EXCLUDED.commit_user,
       commit_time = EXCLUDED.commit_time,
       commit_message = EXCLUDED.commit_message,
       added_files = EXCLUDED.added_files,
       modified_files = EXCLUDED.modified_files,
       deleted_files = EXCLUDED.deleted_files,
       has_check_coding_rule = EXCLUDED.has_check_coding_rule,
       has_check_spotbugs = EXCLUDED.has_check_spotbugs,
       branch_name = EXCLUDED.branch_name,
       insertions = EXCLUDED.insertions,
       deletions = EXCLUDED.deletions,
       changes = EXCLUDED.changes,
       source_folder_path = EXCLUDED.source_folder_path`,
    [
      record.commitHash,
      record.commitUser,
      record.commitTime,
      record.commitMessage,
      addedFiles,
      modifiedFiles,
      deletedFiles,
      record.hasCheckCodingRule,
      record.hasCheckSpotbugs,
      record.branchName ?? null,
      record.insertions ?? null,
      record.deletions ?? null,
      record.changes ?? null,
      record.sourceFolderPath ?? null,
    ]
  )
}

export async function getFromQueue(commitHash: string): Promise<GitCommitQueueRecord | null> {
  const rows = await query<{
    commit_hash: string
    commit_user: string
    commit_time: string
    commit_message: string
    added_files: string
    modified_files: string
    deleted_files: string
    has_check_coding_rule: number
    has_check_spotbugs: number
    branch_name: string | null
    insertions: number | null
    deletions: number | null
    changes: number | null
    source_folder_path: string | null
  }>(
    'SELECT commit_hash, commit_user, commit_time, commit_message, added_files, modified_files, deleted_files, has_check_coding_rule, has_check_spotbugs, branch_name, insertions, deletions, changes, source_folder_path FROM git_commit_queue WHERE commit_hash = ?',
    [commitHash]
  )
  if (!Array.isArray(rows) || rows.length === 0) return null
  const r = rows[0]
  return {
    commitHash: r.commit_hash,
    commitUser: r.commit_user,
    commitTime: r.commit_time,
    commitMessage: r.commit_message,
    addedFiles: parseJsonArray(r.added_files),
    modifiedFiles: parseJsonArray(r.modified_files),
    deletedFiles: parseJsonArray(r.deleted_files),
    hasCheckCodingRule: Boolean(r.has_check_coding_rule),
    hasCheckSpotbugs: Boolean(r.has_check_spotbugs),
    branchName: r.branch_name ?? undefined,
    insertions: r.insertions ?? undefined,
    deletions: r.deletions ?? undefined,
    changes: r.changes ?? undefined,
    sourceFolderPath: r.source_folder_path ?? undefined,
  }
}

/** Chỉ lấy các hash cần cho push (tránh load cả bảng khi queue lớn). */
export async function getManyFromQueue(commitHashes: string[]): Promise<Record<string, GitCommitQueueRecord>> {
  if (commitHashes.length === 0) return {}
  const placeholders = commitHashes.map(() => '?').join(',')
  const rows = await query<{
    commit_hash: string
    commit_user: string
    commit_time: string
    commit_message: string
    added_files: string
    modified_files: string
    deleted_files: string
    has_check_coding_rule: number
    has_check_spotbugs: number
    branch_name: string | null
    insertions: number | null
    deletions: number | null
    changes: number | null
    source_folder_path: string | null
  }>(
    `SELECT commit_hash, commit_user, commit_time, commit_message, added_files, modified_files, deleted_files, has_check_coding_rule, has_check_spotbugs, branch_name, insertions, deletions, changes, source_folder_path FROM git_commit_queue WHERE commit_hash IN (${placeholders})`,
    commitHashes
  )
  if (!Array.isArray(rows)) return {}
  const map: Record<string, GitCommitQueueRecord> = {}
  for (const r of rows) {
    map[r.commit_hash] = {
      commitHash: r.commit_hash,
      commitUser: r.commit_user,
      commitTime: r.commit_time,
      commitMessage: r.commit_message,
      addedFiles: parseJsonArray(r.added_files),
      modifiedFiles: parseJsonArray(r.modified_files),
      deletedFiles: parseJsonArray(r.deleted_files),
      hasCheckCodingRule: Boolean(r.has_check_coding_rule),
      hasCheckSpotbugs: Boolean(r.has_check_spotbugs),
      branchName: r.branch_name ?? undefined,
      insertions: r.insertions ?? undefined,
      deletions: r.deletions ?? undefined,
      changes: r.changes ?? undefined,
      sourceFolderPath: r.source_folder_path ?? undefined,
    }
  }
  return map
}

export async function getAllFromQueue(): Promise<Record<string, GitCommitQueueRecord>> {
  const rows = await query<{
    commit_hash: string
    commit_user: string
    commit_time: string
    commit_message: string
    added_files: string
    modified_files: string
    deleted_files: string
    has_check_coding_rule: number
    has_check_spotbugs: number
    branch_name: string | null
    insertions: number | null
    deletions: number | null
    changes: number | null
    source_folder_path: string | null
  }>(
    'SELECT commit_hash, commit_user, commit_time, commit_message, added_files, modified_files, deleted_files, has_check_coding_rule, has_check_spotbugs, branch_name, insertions, deletions, changes, source_folder_path FROM git_commit_queue'
  )
  if (!Array.isArray(rows)) return {}
  const map: Record<string, GitCommitQueueRecord> = {}
  for (const r of rows) {
    map[r.commit_hash] = {
      commitHash: r.commit_hash,
      commitUser: r.commit_user,
      commitTime: r.commit_time,
      commitMessage: r.commit_message,
      addedFiles: parseJsonArray(r.added_files),
      modifiedFiles: parseJsonArray(r.modified_files),
      deletedFiles: parseJsonArray(r.deleted_files),
      hasCheckCodingRule: Boolean(r.has_check_coding_rule),
      hasCheckSpotbugs: Boolean(r.has_check_spotbugs),
      branchName: r.branch_name ?? undefined,
      insertions: r.insertions ?? undefined,
      deletions: r.deletions ?? undefined,
      changes: r.changes ?? undefined,
      sourceFolderPath: r.source_folder_path ?? undefined,
    }
  }
  return map
}

export async function removeFromQueue(commitHash: string): Promise<void> {
  await query('DELETE FROM git_commit_queue WHERE commit_hash = ?', [commitHash])
}

export async function removeManyFromQueue(commitHashes: string[]): Promise<void> {
  if (commitHashes.length === 0) return
  const placeholders = commitHashes.map(() => '?').join(',')
  await query(`DELETE FROM git_commit_queue WHERE commit_hash IN (${placeholders})`, commitHashes)
}
