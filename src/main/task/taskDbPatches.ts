import l from 'electron-log'
import { getPool, hasDbConfig } from './db'

let legacyPmPlProjectsColumnsMigrationDone = false
let prCheckpointGithubColumnsMigrationDone = false
let prCheckpointTemplateHeaderGroupMigrationDone = false

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

/** Cột nhóm màu header cột checkpoint trên PR Board (0-9, NULL = mặc định). */
export async function migratePrCheckpointTemplateHeaderGroup(): Promise<void> {
  if (prCheckpointTemplateHeaderGroupMigrationDone || !hasDbConfig()) return
  const p = getPool()

  const checkCol = async (): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pr_checkpoint_templates' AND COLUMN_NAME = 'header_group_id'
       LIMIT 1`
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await checkCol())) {
      await p.execute(
        "ALTER TABLE pr_checkpoint_templates ADD COLUMN header_group_id TINYINT UNSIGNED NULL COMMENT '0-9 board column header group; NULL = default' AFTER is_active"
      )
    }
  } catch (e) {
    l.error('[task-db] migratePrCheckpointTemplateHeaderGroup failed', e)
    return
  }
  prCheckpointTemplateHeaderGroupMigrationDone = true
}

/** Bảng cấu hình nhánh ẩn trên PR Board (theo user + project). */
export async function migratePrUserBoardSkipBranchesTable(): Promise<void> {
  if (!hasDbConfig()) return
  const p = getPool()
  try {
    await p.execute(`
CREATE TABLE IF NOT EXISTS pr_user_board_skip_branches (
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  patterns_text TEXT NOT NULL COMMENT 'Nội dung textarea PR Board — mỗi dòng một mẫu nhánh',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id),
  INDEX idx_pr_ub_skip_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  } catch (e) {
    l.error('[task-db] migratePrUserBoardSkipBranchesTable failed', e)
  }
}

/** Bảng lưu chat trợ lý PR (theo user + project). */
export async function migratePrAiAssistChatsTable(): Promise<void> {
  if (!hasDbConfig()) return
  const p = getPool()
  try {
    await p.execute(`
CREATE TABLE IF NOT EXISTS pr_ai_assist_chats (
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  messages_json LONGTEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id),
  INDEX idx_pr_ai_chat_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  } catch (e) {
    l.error('[task-db] migratePrAiAssistChatsTable failed', e)
  }
}

let prTrackedBranchesDropAssigneeStatusDone = false

/** Gỡ cột legacy assignee_user_id, status khỏi pr_tracked_branches (không còn dùng). */
export async function migratePrTrackedBranchesDropAssigneeStatus(): Promise<void> {
  if (prTrackedBranchesDropAssigneeStatusDone || !hasDbConfig()) return
  const p = getPool()

  const hasCol = async (table: string, col: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [table, col],
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasFk = async (table: string, constraintName: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       LIMIT 1`,
      [table, constraintName],
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (await hasFk('pr_tracked_branches', 'fk_pr_track_assignee')) {
      await p.execute('ALTER TABLE pr_tracked_branches DROP FOREIGN KEY fk_pr_track_assignee')
    }
    const drops: string[] = []
    if (await hasCol('pr_tracked_branches', 'assignee_user_id')) drops.push('DROP COLUMN assignee_user_id')
    if (await hasCol('pr_tracked_branches', 'status')) drops.push('DROP COLUMN status')
    if (drops.length > 0) {
      await p.execute(`ALTER TABLE pr_tracked_branches ${drops.join(', ')}`)
    }
  } catch (e) {
    l.error('[task-db] migratePrTrackedBranchesDropAssigneeStatus failed', e)
    return
  }
  prTrackedBranchesDropAssigneeStatusDone = true
}

let prManagerUserIdColumnsMigrationDone = false

/** Thêm user_id vào các bảng PR Manager + backfill + đổi UNIQUE — dữ liệu cũ gán user đầu tiên theo project (user_project_roles). */
export async function migratePrManagerTablesUserIdColumns(): Promise<void> {
  if (prManagerUserIdColumnsMigrationDone || !hasDbConfig()) return
  const p = getPool()

  const hasCol = async (table: string, col: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [table, col],
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasIndex = async (table: string, indexName: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
       LIMIT 1`,
      [table, indexName],
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasFk = async (table: string, constraintName: string): Promise<boolean> => {
    const [rows] = await p.execute(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       LIMIT 1`,
      [table, constraintName],
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const tryExec = async (sql: string): Promise<void> => {
    try {
      await p.execute(sql)
    } catch (e) {
      l.warn('[task-db] migratePrManagerTablesUserIdColumns step:', sql.slice(0, 120), e)
    }
  }

  try {
    if (
      (await hasIndex('pr_repos', 'uk_pr_repos_user_proj_own_repo')) &&
      (await hasIndex('pr_checkpoint_templates', 'uk_pr_tpl_user_proj_code')) &&
      (await hasIndex('pr_tracked_branches', 'uk_pr_track_user_repo_branch'))
    ) {
      prManagerUserIdColumnsMigrationDone = true
      return
    }

    if (!(await hasCol('pr_repos', 'user_id'))) {
      await tryExec('ALTER TABLE pr_repos ADD COLUMN user_id VARCHAR(36) NULL AFTER id')
    }
    if (!(await hasCol('pr_checkpoint_templates', 'user_id'))) {
      await tryExec('ALTER TABLE pr_checkpoint_templates ADD COLUMN user_id VARCHAR(36) NULL AFTER id')
    }
    if (!(await hasCol('pr_tracked_branches', 'user_id'))) {
      await tryExec('ALTER TABLE pr_tracked_branches ADD COLUMN user_id VARCHAR(36) NULL AFTER id')
    }
    if (!(await hasCol('pr_branch_checkpoints', 'user_id'))) {
      await tryExec('ALTER TABLE pr_branch_checkpoints ADD COLUMN user_id VARCHAR(36) NULL AFTER id')
    }
    if (!(await hasCol('pr_automations', 'user_id'))) {
      await tryExec('ALTER TABLE pr_automations ADD COLUMN user_id VARCHAR(36) NULL AFTER id')
    }

    await tryExec(`
UPDATE pr_repos pr
INNER JOIN (
  SELECT project_id, MIN(user_id) AS uid FROM user_project_roles WHERE project_id IS NOT NULL GROUP BY project_id
) r ON r.project_id = pr.project_id
SET pr.user_id = r.uid WHERE pr.user_id IS NULL`)
    await tryExec(`
UPDATE pr_repos SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL`)

    await tryExec(`
UPDATE pr_checkpoint_templates t
INNER JOIN (
  SELECT project_id, MIN(user_id) AS uid FROM user_project_roles WHERE project_id IS NOT NULL GROUP BY project_id
) r ON r.project_id = t.project_id
SET t.user_id = r.uid WHERE t.user_id IS NULL`)
    await tryExec(`
UPDATE pr_checkpoint_templates SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL`)

    await tryExec(`
UPDATE pr_tracked_branches tb INNER JOIN pr_repos r ON r.id = tb.repo_id SET tb.user_id = r.user_id WHERE tb.user_id IS NULL`)

    await tryExec(`
UPDATE pr_branch_checkpoints bc INNER JOIN pr_tracked_branches tb ON tb.id = bc.tracked_branch_id SET bc.user_id = tb.user_id WHERE bc.user_id IS NULL`)

    await tryExec(`
UPDATE pr_automations a INNER JOIN pr_repos r ON r.id = a.repo_id SET a.user_id = r.user_id WHERE a.user_id IS NULL`)

    await tryExec('ALTER TABLE pr_repos MODIFY user_id VARCHAR(36) NOT NULL')
    await tryExec('ALTER TABLE pr_checkpoint_templates MODIFY user_id VARCHAR(36) NOT NULL')
    await tryExec('ALTER TABLE pr_tracked_branches MODIFY user_id VARCHAR(36) NOT NULL')
    await tryExec('ALTER TABLE pr_branch_checkpoints MODIFY user_id VARCHAR(36) NOT NULL')
    await tryExec('ALTER TABLE pr_automations MODIFY user_id VARCHAR(36) NOT NULL')

    if (await hasIndex('pr_repos', 'uk_pr_repos_owner_repo')) {
      await tryExec('ALTER TABLE pr_repos DROP INDEX uk_pr_repos_owner_repo')
    }
    if (!(await hasIndex('pr_repos', 'uk_pr_repos_user_proj_own_repo'))) {
      await tryExec(
        'ALTER TABLE pr_repos ADD UNIQUE KEY uk_pr_repos_user_proj_own_repo (user_id, project_id, owner, repo)',
      )
    }
    if (await hasIndex('pr_checkpoint_templates', 'uk_pr_tpl_code')) {
      await tryExec('ALTER TABLE pr_checkpoint_templates DROP INDEX uk_pr_tpl_code')
    }
    if (!(await hasIndex('pr_checkpoint_templates', 'uk_pr_tpl_user_proj_code'))) {
      await tryExec(
        'ALTER TABLE pr_checkpoint_templates ADD UNIQUE KEY uk_pr_tpl_user_proj_code (user_id, project_id, code)',
      )
    }
    if (await hasIndex('pr_tracked_branches', 'uk_pr_track')) {
      await tryExec('ALTER TABLE pr_tracked_branches DROP INDEX uk_pr_track')
    }
    if (!(await hasIndex('pr_tracked_branches', 'uk_pr_track_user_repo_branch'))) {
      await tryExec(
        'ALTER TABLE pr_tracked_branches ADD UNIQUE KEY uk_pr_track_user_repo_branch (user_id, repo_id, branch_name)',
      )
    }

    if (!(await hasIndex('pr_repos', 'idx_pr_repos_user_project'))) {
      await tryExec('CREATE INDEX idx_pr_repos_user_project ON pr_repos (user_id, project_id)')
    }
    if (!(await hasIndex('pr_checkpoint_templates', 'idx_pr_tpl_user_project'))) {
      await tryExec(
        'CREATE INDEX idx_pr_tpl_user_project ON pr_checkpoint_templates (user_id, project_id)',
      )
    }
    if (!(await hasIndex('pr_tracked_branches', 'idx_pr_track_user_project'))) {
      await tryExec(
        'CREATE INDEX idx_pr_track_user_project ON pr_tracked_branches (user_id, project_id)',
      )
    }
    if (!(await hasIndex('pr_branch_checkpoints', 'idx_pr_bc_user'))) {
      await tryExec('CREATE INDEX idx_pr_bc_user ON pr_branch_checkpoints (user_id)')
    }
    if (!(await hasIndex('pr_automations', 'idx_pr_auto_user_repo'))) {
      await tryExec('CREATE INDEX idx_pr_auto_user_repo ON pr_automations (user_id, repo_id)')
    }

    if (!(await hasFk('pr_repos', 'fk_pr_repos_user'))) {
      await tryExec(
        'ALTER TABLE pr_repos ADD CONSTRAINT fk_pr_repos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      )
    }
    if (!(await hasFk('pr_checkpoint_templates', 'fk_pr_tpl_user'))) {
      await tryExec(
        'ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT fk_pr_tpl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      )
    }
    if (!(await hasFk('pr_tracked_branches', 'fk_pr_track_user'))) {
      await tryExec(
        'ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      )
    }
    if (!(await hasFk('pr_branch_checkpoints', 'fk_pr_bc_user'))) {
      await tryExec(
        'ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      )
    }
    if (!(await hasFk('pr_automations', 'fk_pr_auto_user'))) {
      await tryExec(
        'ALTER TABLE pr_automations ADD CONSTRAINT fk_pr_auto_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      )
    }
  } catch (e) {
    l.error('[task-db] migratePrManagerTablesUserIdColumns failed', e)
    return
  }
  prManagerUserIdColumnsMigrationDone = true
}
