import l from 'electron-log'
import { getPool, hasDbConfig } from './db'

let legacyPmPlProjectsColumnsMigrationDone = false
let prCheckpointGithubColumnsMigrationDone = false

/**
 * Gỡ cột legacy `project_manager` / `project_leader` khỏi `projects` nếu còn tồn tại.
 * PM/PL dùng `user_project_roles` (role pm | pl).
 *
 * Chỉ chạy một lần mỗi tiến trình sau khi thành công (bỏ lặp `information_schema`).
 * Lỗi `ALTER` được log; không đánh dấu hoàn tất để lần sau thử lại.
 */
export async function migrateProjectsDropLegacyPmPlColumns(): Promise<void> {
  if (legacyPmPlProjectsColumnsMigrationDone || !hasDbConfig()) return
  const p = getPool()

  const checkCol = async (col: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = ?
       LIMIT 1`,
      [col],
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (await checkCol('project_manager')) {
      await p.execute('ALTER TABLE projects DROP COLUMN project_manager')
    }
  } catch (e) {
    l.error('[evm-db] migrateProjectsDropLegacyPmPlColumns: DROP project_manager failed', e)
    return
  }
  try {
    if (await checkCol('project_leader')) {
      await p.execute('ALTER TABLE projects DROP COLUMN project_leader')
    }
  } catch (e) {
    l.error('[evm-db] migrateProjectsDropLegacyPmPlColumns: DROP project_leader failed', e)
    return
  }

  legacyPmPlProjectsColumnsMigrationDone = true
}

/**
 * Th\u00eam c\u1ed9t l\u1ecdc tr\u1ea1ng th\u00e1i PR GitHub (draft/open/closed/merged) v\u00e0o pr_branch_checkpoints.
 */
export async function migratePrCheckpointGithubColumns(): Promise<void> {
  if (prCheckpointGithubColumnsMigrationDone || !hasDbConfig()) return
  const p = getPool()

  const checkCol = async (col: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pr_branch_checkpoints' AND COLUMN_NAME = ?
       LIMIT 1`,
      [col]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await checkCol('gh_pr_draft'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_draft TINYINT(1) NULL')
    }
    if (!(await checkCol('gh_pr_state'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_state VARCHAR(20) NULL')
    }
    if (!(await checkCol('gh_pr_merged'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_merged TINYINT(1) NULL')
    }
    if (!(await checkCol('gh_pr_author'))) {
      await p.execute(
        "ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_author VARCHAR(255) NULL COMMENT 'GitHub login ngu\u1eddi t\u1ea1o PR'",
      )
    }
    if (!(await checkCol('gh_pr_title'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_title VARCHAR(500) NULL')
    }
    if (!(await checkCol('gh_pr_updated_at'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_updated_at DATETIME NULL')
    }
    if (!(await checkCol('gh_pr_additions'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_additions INT NULL')
    }
    if (!(await checkCol('gh_pr_deletions'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_deletions INT NULL')
    }
    if (!(await checkCol('gh_pr_changed_files'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_changed_files INT NULL')
    }
    if (!(await checkCol('gh_pr_mergeable_state'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_mergeable_state VARCHAR(50) NULL')
    }
    if (!(await checkCol('gh_pr_assignees'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_assignees JSON NULL')
    }
    if (!(await checkCol('gh_pr_labels'))) {
      await p.execute('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_labels JSON NULL')
    }
  } catch (e) {
    l.error('[task-db] migratePrCheckpointGithubColumns failed', e)
    return
  }
  prCheckpointGithubColumnsMigrationDone = true
}
