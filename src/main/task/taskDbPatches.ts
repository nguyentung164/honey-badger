import l from 'electron-log'
import { hasDbConfig, query } from './db'

let legacyPmPlProjectsColumnsMigrationDone = false
let prCheckpointGithubColumnsMigrationDone = false
let prCheckpointTemplateHeaderGroupMigrationDone = false

export async function migrateProjectsDropLegacyPmPlColumns(): Promise<void> {
  if (legacyPmPlProjectsColumnsMigrationDone || !hasDbConfig()) return

  const checkCol = async (col: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = ? LIMIT 1`,
      [col]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (await checkCol('project_manager')) {
      await query('ALTER TABLE projects DROP COLUMN project_manager')
    }
  } catch (e) {
    l.error('[evm-db] migrateProjectsDropLegacyPmPlColumns: DROP project_manager failed', e)
    return
  }
  try {
    if (await checkCol('project_leader')) {
      await query('ALTER TABLE projects DROP COLUMN project_leader')
    }
  } catch (e) {
    l.error('[evm-db] migrateProjectsDropLegacyPmPlColumns: DROP project_leader failed', e)
    return
  }

  legacyPmPlProjectsColumnsMigrationDone = true
}

export async function migratePrCheckpointGithubColumns(): Promise<void> {
  if (prCheckpointGithubColumnsMigrationDone || !hasDbConfig()) return

  const checkCol = async (col: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'pr_branch_checkpoints' AND column_name = ? LIMIT 1`,
      [col]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await checkCol('gh_pr_draft'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_draft BOOLEAN NULL')
    }
    if (!(await checkCol('gh_pr_state'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_state VARCHAR(20) NULL')
    }
    if (!(await checkCol('gh_pr_merged'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_merged BOOLEAN NULL')
    }
    if (!(await checkCol('gh_pr_author'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_author VARCHAR(255) NULL')
    }
    if (!(await checkCol('gh_pr_title'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_title VARCHAR(500) NULL')
    }
    if (!(await checkCol('gh_pr_updated_at'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_updated_at TIMESTAMPTZ NULL')
    }
    if (!(await checkCol('gh_pr_additions'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_additions INT NULL')
    }
    if (!(await checkCol('gh_pr_deletions'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_deletions INT NULL')
    }
    if (!(await checkCol('gh_pr_changed_files'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_changed_files INT NULL')
    }
    if (!(await checkCol('gh_pr_mergeable_state'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_mergeable_state VARCHAR(50) NULL')
    }
    if (!(await checkCol('gh_pr_assignees'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_assignees JSONB NULL')
    }
    if (!(await checkCol('gh_pr_labels'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_labels JSONB NULL')
    }
  } catch (e) {
    l.error('[db] migratePrCheckpointGithubColumns failed', e)
    return
  }
  prCheckpointGithubColumnsMigrationDone = true
}

export async function migratePrCheckpointTemplateHeaderGroup(): Promise<void> {
  if (prCheckpointTemplateHeaderGroupMigrationDone || !hasDbConfig()) return

  const checkCol = async (): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'pr_checkpoint_templates' AND column_name = 'header_group_id' LIMIT 1`
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await checkCol())) {
      await query(
        'ALTER TABLE pr_checkpoint_templates ADD COLUMN header_group_id SMALLINT NULL CHECK (header_group_id IS NULL OR (header_group_id >= 0 AND header_group_id <= 255))'
      )
    }
  } catch (e) {
    l.error('[db] migratePrCheckpointTemplateHeaderGroup failed', e)
    return
  }
  prCheckpointTemplateHeaderGroupMigrationDone = true
}

export async function migratePrUserBoardSkipBranchesTable(): Promise<void> {
  if (!hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS pr_user_board_skip_branches (
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  patterns_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_pr_ub_skip_project ON pr_user_board_skip_branches(project_id)')
  } catch (e) {
    l.error('[db] migratePrUserBoardSkipBranchesTable failed', e)
  }
}

export async function migratePrAiAssistChatsTable(): Promise<void> {
  if (!hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS pr_ai_assist_chats (
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  messages_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_pr_ai_chat_project ON pr_ai_assist_chats(project_id)')
  } catch (e) {
    l.error('[db] migratePrAiAssistChatsTable failed', e)
  }
}

let prTrackedBranchesDropAssigneeStatusDone = false

export async function migratePrTrackedBranchesDropAssigneeStatus(): Promise<void> {
  if (prTrackedBranchesDropAssigneeStatusDone || !hasDbConfig()) return

  const hasCol = async (table: string, col: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, col]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasFk = async (table: string, constraintName: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = current_schema() AND table_name = ? AND constraint_name = ?
         AND constraint_type = 'FOREIGN KEY' LIMIT 1`,
      [table, constraintName]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (await hasFk('pr_tracked_branches', 'fk_pr_track_assignee')) {
      await query('ALTER TABLE pr_tracked_branches DROP CONSTRAINT fk_pr_track_assignee')
    }
    if (await hasCol('pr_tracked_branches', 'assignee_user_id')) {
      await query('ALTER TABLE pr_tracked_branches DROP COLUMN assignee_user_id')
    }
    if (await hasCol('pr_tracked_branches', 'status')) {
      await query('ALTER TABLE pr_tracked_branches DROP COLUMN status')
    }
  } catch (e) {
    l.error('[db] migratePrTrackedBranchesDropAssigneeStatus failed', e)
    return
  }
  prTrackedBranchesDropAssigneeStatusDone = true
}

let prManagerUserIdColumnsMigrationDone = false

export async function migratePrManagerTablesUserIdColumns(): Promise<void> {
  if (prManagerUserIdColumnsMigrationDone || !hasDbConfig()) return

  const hasCol = async (table: string, col: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, col]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasIndex = async (table: string, indexName: string): Promise<boolean> => {
    const rows = await query(`SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()::text AND tablename = ? AND indexname = ? LIMIT 1`, [table, indexName])
    return Array.isArray(rows) && rows.length > 0
  }

  const hasFk = async (table: string, constraintName: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = current_schema() AND table_name = ? AND constraint_name = ?
         AND constraint_type = 'FOREIGN KEY' LIMIT 1`,
      [table, constraintName]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const tryExec = async (sql: string, params?: unknown[]): Promise<void> => {
    try {
      await query(sql, params)
    } catch (e) {
      l.warn('[db] migratePrManagerTablesUserIdColumns step:', sql.slice(0, 120), e)
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
      await tryExec('ALTER TABLE pr_repos ADD COLUMN user_id VARCHAR(36) NULL')
    }
    if (!(await hasCol('pr_checkpoint_templates', 'user_id'))) {
      await tryExec('ALTER TABLE pr_checkpoint_templates ADD COLUMN user_id VARCHAR(36) NULL')
    }
    if (!(await hasCol('pr_tracked_branches', 'user_id'))) {
      await tryExec('ALTER TABLE pr_tracked_branches ADD COLUMN user_id VARCHAR(36) NULL')
    }
    if (!(await hasCol('pr_branch_checkpoints', 'user_id'))) {
      await tryExec('ALTER TABLE pr_branch_checkpoints ADD COLUMN user_id VARCHAR(36) NULL')
    }
    if (!(await hasCol('pr_automations', 'user_id'))) {
      await tryExec('ALTER TABLE pr_automations ADD COLUMN user_id VARCHAR(36) NULL')
    }

    await tryExec(`
UPDATE pr_repos pr SET user_id = r.uid FROM (
  SELECT project_id, MIN(user_id) AS uid FROM user_project_roles WHERE project_id IS NOT NULL GROUP BY project_id
) r WHERE r.project_id = pr.project_id AND pr.user_id IS NULL`)

    await tryExec(`UPDATE pr_repos SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL`)

    await tryExec(`
UPDATE pr_checkpoint_templates t SET user_id = r.uid FROM (
  SELECT project_id, MIN(user_id) AS uid FROM user_project_roles WHERE project_id IS NOT NULL GROUP BY project_id
) r WHERE r.project_id = t.project_id AND t.user_id IS NULL`)

    await tryExec(`UPDATE pr_checkpoint_templates SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL`)

    await tryExec(`UPDATE pr_tracked_branches tb SET user_id = r.user_id FROM pr_repos r WHERE r.id = tb.repo_id AND tb.user_id IS NULL`)

    await tryExec(`UPDATE pr_branch_checkpoints bc SET user_id = tb.user_id FROM pr_tracked_branches tb WHERE tb.id = bc.tracked_branch_id AND bc.user_id IS NULL`)

    await tryExec(`UPDATE pr_automations a SET user_id = r.user_id FROM pr_repos r WHERE r.id = a.repo_id AND a.user_id IS NULL`)

    await tryExec('ALTER TABLE pr_repos ALTER COLUMN user_id SET NOT NULL')
    await tryExec('ALTER TABLE pr_checkpoint_templates ALTER COLUMN user_id SET NOT NULL')
    await tryExec('ALTER TABLE pr_tracked_branches ALTER COLUMN user_id SET NOT NULL')
    await tryExec('ALTER TABLE pr_branch_checkpoints ALTER COLUMN user_id SET NOT NULL')
    await tryExec('ALTER TABLE pr_automations ALTER COLUMN user_id SET NOT NULL')

    if (await hasIndex('pr_repos', 'uk_pr_repos_owner_repo')) {
      await tryExec('DROP INDEX IF EXISTS uk_pr_repos_owner_repo')
    }
    if (!(await hasIndex('pr_repos', 'uk_pr_repos_user_proj_own_repo'))) {
      await tryExec('ALTER TABLE pr_repos ADD CONSTRAINT uk_pr_repos_user_proj_own_repo UNIQUE (user_id, project_id, owner, repo)')
    }
    if (await hasIndex('pr_checkpoint_templates', 'uk_pr_tpl_code')) {
      await tryExec('DROP INDEX IF EXISTS uk_pr_tpl_code')
    }
    if (!(await hasIndex('pr_checkpoint_templates', 'uk_pr_tpl_user_proj_code'))) {
      await tryExec('ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT uk_pr_tpl_user_proj_code UNIQUE (user_id, project_id, code)')
    }
    if (await hasIndex('pr_tracked_branches', 'uk_pr_track')) {
      await tryExec('DROP INDEX IF EXISTS uk_pr_track')
    }
    if (!(await hasIndex('pr_tracked_branches', 'uk_pr_track_user_repo_branch'))) {
      await tryExec('ALTER TABLE pr_tracked_branches ADD CONSTRAINT uk_pr_track_user_repo_branch UNIQUE (user_id, repo_id, branch_name)')
    }

    if (!(await hasIndex('pr_repos', 'idx_pr_repos_user_project'))) {
      await tryExec('CREATE INDEX IF NOT EXISTS idx_pr_repos_user_project ON pr_repos (user_id, project_id)')
    }
    if (!(await hasIndex('pr_checkpoint_templates', 'idx_pr_tpl_user_project'))) {
      await tryExec('CREATE INDEX IF NOT EXISTS idx_pr_tpl_user_project ON pr_checkpoint_templates (user_id, project_id)')
    }
    if (!(await hasIndex('pr_tracked_branches', 'idx_pr_track_user_project'))) {
      await tryExec('CREATE INDEX IF NOT EXISTS idx_pr_track_user_project ON pr_tracked_branches (user_id, project_id)')
    }
    if (!(await hasIndex('pr_branch_checkpoints', 'idx_pr_bc_user'))) {
      await tryExec('CREATE INDEX IF NOT EXISTS idx_pr_bc_user ON pr_branch_checkpoints (user_id)')
    }
    if (!(await hasIndex('pr_automations', 'idx_pr_auto_user_repo'))) {
      await tryExec('CREATE INDEX IF NOT EXISTS idx_pr_auto_user_repo ON pr_automations (user_id, repo_id)')
    }

    if (!(await hasFk('pr_repos', 'fk_pr_repos_user'))) {
      await tryExec('ALTER TABLE pr_repos ADD CONSTRAINT fk_pr_repos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    }
    if (!(await hasFk('pr_checkpoint_templates', 'fk_pr_tpl_user'))) {
      await tryExec('ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT fk_pr_tpl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    }
    if (!(await hasFk('pr_tracked_branches', 'fk_pr_track_user'))) {
      await tryExec('ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    }
    if (!(await hasFk('pr_branch_checkpoints', 'fk_pr_bc_user'))) {
      await tryExec('ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    }
    if (!(await hasFk('pr_automations', 'fk_pr_auto_user'))) {
      await tryExec('ALTER TABLE pr_automations ADD CONSTRAINT fk_pr_auto_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    }
  } catch (e) {
    l.error('[db] migratePrManagerTablesUserIdColumns failed', e)
    return
  }
  prManagerUserIdColumnsMigrationDone = true
}

let taskChangeHistoryTableMigrationDone = false

export async function migrateTaskChangeHistoryTable(): Promise<void> {
  if (taskChangeHistoryTableMigrationDone || !hasDbConfig()) return
  try {
    const rows = await query(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_change_history' LIMIT 1`)
    if (Array.isArray(rows) && rows.length > 0) {
      taskChangeHistoryTableMigrationDone = true
      return
    }
    await query(`CREATE TABLE task_change_history (
      id VARCHAR(36) PRIMARY KEY,
      task_id VARCHAR(36) NOT NULL,
      actor_user_id VARCHAR(36) NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'ui',
      changes_json JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`)
    await query('CREATE INDEX IF NOT EXISTS idx_task_change_task_created ON task_change_history (task_id, created_at DESC)')
  } catch (e) {
    l.error('[db] migrateTaskChangeHistoryTable failed', e)
    return
  }
  taskChangeHistoryTableMigrationDone = true
}

let taskWorkloadOverridesTableMigrationDone = false

/** Đổi tên bảng cũ + thêm `actual_work_hours`; chạy trước migrateTaskWorkloadOverridesTable. */
export async function migrateProjectUserDailyWorkload(): Promise<void> {
  if (!hasDbConfig()) return
  try {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name IN ('task_workload_overrides', 'project_user_daily_workload')`
    )
    const names = new Set((rows ?? []).map(r => r.table_name))
    const hasOld = names.has('task_workload_overrides')
    const hasNew = names.has('project_user_daily_workload')
    if (hasOld && !hasNew) {
      await query('ALTER TABLE task_workload_overrides RENAME TO project_user_daily_workload')
    }
    const rows2 = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'project_user_daily_workload' LIMIT 1`
    )
    if (!Array.isArray(rows2) || rows2.length === 0) return

    await query('ALTER TABLE project_user_daily_workload ADD COLUMN IF NOT EXISTS actual_work_hours DECIMAL(6,2) NULL')
    await query('DROP INDEX IF EXISTS idx_workload_proj_date')
    await query('DROP INDEX IF EXISTS idx_workload_proj_user')
    await query('CREATE INDEX IF NOT EXISTS idx_pudw_proj_date ON project_user_daily_workload(project_id, work_date)')
    await query('CREATE INDEX IF NOT EXISTS idx_pudw_proj_user ON project_user_daily_workload(project_id, user_id)')
  } catch (e) {
    l.error('[db] migrateProjectUserDailyWorkload failed', e)
  }
}

/** Tạo bảng `project_user_daily_workload` (actual + override hours) nếu chưa có. */
export async function migrateTaskWorkloadOverridesTable(): Promise<void> {
  if (taskWorkloadOverridesTableMigrationDone || !hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS project_user_daily_workload (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  work_date DATE NOT NULL,
  actual_work_hours DECIMAL(6,2) NULL,
  override_hours DECIMAL(6,2) NULL,
  note TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_pudw_proj_user_date UNIQUE (project_id, user_id, work_date)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_pudw_proj_date ON project_user_daily_workload(project_id, work_date)')
    await query('CREATE INDEX IF NOT EXISTS idx_pudw_proj_user ON project_user_daily_workload(project_id, user_id)')
  } catch (e) {
    l.error('[db] migrateTaskWorkloadOverridesTable failed', e)
    return
  }
  taskWorkloadOverridesTableMigrationDone = true
}

let userDailySnapshotsUniqueConstraintMigrationDone = false

export async function migrateUserDailySnapshotsUniqueConstraint(): Promise<void> {
  if (userDailySnapshotsUniqueConstraintMigrationDone || !hasDbConfig()) return

  const hasConstraint = async (): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = current_schema()
         AND table_name = 'user_daily_snapshots'
         AND constraint_name = 'uk_uds_user_date'
         AND constraint_type = 'UNIQUE'
       LIMIT 1`
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasTable = async (): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = 'user_daily_snapshots'
       LIMIT 1`
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await hasTable())) {
      userDailySnapshotsUniqueConstraintMigrationDone = true
      return
    }
    if (await hasConstraint()) {
      userDailySnapshotsUniqueConstraintMigrationDone = true
      return
    }

    // Keep one newest row per (user_id, snapshot_date) before adding UNIQUE.
    await query(
      `WITH ranked AS (
         SELECT ctid,
                ROW_NUMBER() OVER (
                  PARTITION BY user_id, snapshot_date
                  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                ) AS rn
         FROM user_daily_snapshots
       )
       DELETE FROM user_daily_snapshots uds
       USING ranked r
       WHERE uds.ctid = r.ctid AND r.rn > 1`
    )

    await query('ALTER TABLE user_daily_snapshots ADD CONSTRAINT uk_uds_user_date UNIQUE (user_id, snapshot_date)')
  } catch (e) {
    l.error('[db] migrateUserDailySnapshotsUniqueConstraint failed', e)
    return
  }
  userDailySnapshotsUniqueConstraintMigrationDone = true
}

let taskTypesMilestoneMigrationDone = false

/** Thêm loại task milestone (FK tasks.type → task_types.code). Idempotent. */
export async function migrateTaskTypesAddMilestone(): Promise<void> {
  if (taskTypesMilestoneMigrationDone || !hasDbConfig()) return
  try {
    await query(
      `INSERT INTO task_types (code, name, sort_order, color) VALUES ('milestone', 'Milestone', 5, '#f59e0b')
       ON CONFLICT (code) DO NOTHING`
    )
  } catch (e) {
    l.error('[db] migrateTaskTypesAddMilestone failed', e)
    return
  }
  taskTypesMilestoneMigrationDone = true
}
