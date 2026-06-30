import l from 'electron-log'
import { randomUuidV7 } from 'shared/randomUuidV7'
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
    if (!(await checkCol('gh_pr_commits'))) {
      await query('ALTER TABLE pr_branch_checkpoints ADD COLUMN gh_pr_commits INT NULL')
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
      `INSERT INTO task_types (code, name, sort_order, color) VALUES ('milestone', 'Milestone', 5, '#e11d48')
       ON CONFLICT (code) DO NOTHING`
    )
  } catch (e) {
    l.error('[db] migrateTaskTypesAddMilestone failed', e)
    return
  }
  taskTypesMilestoneMigrationDone = true
}

let tasksTicketIdNullableMigrationDone = false

/** Cho phép ticket_id NULL (milestone không gen ticket). Idempotent. */
export async function migrateTasksTicketIdNullable(): Promise<void> {
  if (tasksTicketIdNullableMigrationDone || !hasDbConfig()) return
  try {
    const rows = await query<{ nullable: string }>(
      `SELECT is_nullable AS nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'ticket_id' LIMIT 1`
    )
    const col = rows?.[0]
    if (col?.nullable === 'YES') {
      tasksTicketIdNullableMigrationDone = true
      return
    }
    await query('ALTER TABLE tasks ALTER COLUMN ticket_id DROP NOT NULL')
  } catch (e) {
    l.error('[db] migrateTasksTicketIdNullable failed', e)
    return
  }
  tasksTicketIdNullableMigrationDone = true
}

let tasksStatusEnteredAtMigrationDone = false

/** Thời điểm vào trạng thái hiện tại (Kanban aging). Backfill từ updated_at / created_at. */
export async function migrateTasksStatusEnteredAt(): Promise<void> {
  if (tasksStatusEnteredAtMigrationDone || !hasDbConfig()) return
  try {
    const rows = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'status_entered_at' LIMIT 1`
    )
    if (!rows?.length) {
      await query('ALTER TABLE tasks ADD COLUMN status_entered_at TIMESTAMPTZ NULL')
    }
    await query('UPDATE tasks SET status_entered_at = COALESCE(updated_at, created_at) WHERE status_entered_at IS NULL')
  } catch (e) {
    l.error('[db] migrateTasksStatusEnteredAt failed', e)
    return
  }
  tasksStatusEnteredAtMigrationDone = true
}

let userProjectRolesProjectIdUkMigrationDone = false

/**
 * Older DBs may have `project_id_uk` as a plain NOT NULL column instead of GENERATED.
 * Then INSERT (id, user_id, project_id, role) leaves `project_id_uk` NULL and fails.
 * Replace with GENERATED ALWAYS AS (COALESCE(project_id, '___GLOBAL___')) STORED — matches schema.sql.
 */
export async function migrateUserProjectRolesProjectIdUkToGenerated(): Promise<void> {
  if (userProjectRolesProjectIdUkMigrationDone || !hasDbConfig()) return

  const rows = await query<{ gen: string }>(
    `SELECT COALESCE(a.attgenerated::text, '') AS gen
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = 'user_project_roles'
       AND a.attname = 'project_id_uk'
       AND a.attnum > 0
       AND NOT a.attisdropped
     LIMIT 1`
  )
  if (!Array.isArray(rows) || rows.length === 0) {
    userProjectRolesProjectIdUkMigrationDone = true
    return
  }
  const gen = (rows[0]?.gen ?? '').trim()
  if (gen === 's') {
    userProjectRolesProjectIdUkMigrationDone = true
    return
  }

  try {
    await query('ALTER TABLE user_project_roles DROP CONSTRAINT IF EXISTS uk_user_project_role')
    await query('ALTER TABLE user_project_roles DROP COLUMN project_id_uk')
    await query(
      `ALTER TABLE user_project_roles ADD COLUMN project_id_uk VARCHAR(36)
       GENERATED ALWAYS AS (COALESCE(project_id, '___GLOBAL___')) STORED NOT NULL`
    )
    await query('ALTER TABLE user_project_roles ADD CONSTRAINT uk_user_project_role UNIQUE (user_id, project_id_uk, role)')
  } catch (e) {
    l.error('[db] migrateUserProjectRolesProjectIdUkToGenerated failed', e)
    return
  }
  userProjectRolesProjectIdUkMigrationDone = true
}

let achievementBooleanColumnsMigrationDone = false

/** Chuẩn hóa cột cờ achievement về BOOLEAN như schema.sql (hosted DB đôi khi còn smallint/int). */
export async function migrateAchievementBooleanColumns(): Promise<void> {
  if (achievementBooleanColumnsMigrationDone || !hasDbConfig()) return

  const dataTypeOf = async (table: string, column: string): Promise<string | null> => {
    const rows = await query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column]
    )
    if (!Array.isArray(rows) || rows.length === 0) return null
    return String(rows[0].data_type ?? '').toLowerCase()
  }

  /** Chỉ ALTER khi kiểu là số nguyên — tránh ép kiểu sai từ varchar, v.v. */
  const shouldCastToBoolean = (dt: string | null): boolean => dt != null && dt !== 'boolean' && (dt === 'smallint' || dt === 'integer' || dt === 'bigint')

  try {
    let dt = await dataTypeOf('achievements', 'is_negative')
    if (shouldCastToBoolean(dt)) {
      await query('ALTER TABLE achievements ALTER COLUMN is_negative TYPE boolean USING (COALESCE(is_negative::integer, 0) <> 0)')
    }
    dt = await dataTypeOf('achievements', 'is_repeatable')
    if (shouldCastToBoolean(dt)) {
      await query('ALTER TABLE achievements ALTER COLUMN is_repeatable TYPE boolean USING (COALESCE(is_repeatable::integer, 0) <> 0)')
    }
    dt = await dataTypeOf('user_achievements', 'is_redeemed')
    if (shouldCastToBoolean(dt)) {
      await query('ALTER TABLE user_achievements ALTER COLUMN is_redeemed TYPE boolean USING (COALESCE(is_redeemed::integer, 0) <> 0)')
    }
  } catch (e) {
    l.error('[db] migrateAchievementBooleanColumns failed', e)
    return
  }
  achievementBooleanColumnsMigrationDone = true
}

let automationTestTablesMigrationDone = false

/**
 * Tạo các bảng cho tính năng Automation Test (Playwright).
 * Idempotent: dùng IF NOT EXISTS + ON CONFLICT để chạy nhiều lần an toàn.
 */
export async function migrateAutomationTestTables(): Promise<void> {
  if (automationTestTablesMigrationDone || !hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS test_projects (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  base_url TEXT NOT NULL,
  description TEXT NULL,
  browsers TEXT[] NOT NULL DEFAULT ARRAY['chromium']::TEXT[],
  workspace_path TEXT NOT NULL,
  created_by VARCHAR(36) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)

    await query(`
CREATE TABLE IF NOT EXISTS test_suites (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  tag_filter TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_suites_project ON test_suites(project_id)')

    await query(`
CREATE TABLE IF NOT EXISTS test_cases (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  code VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'medium',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preconditions TEXT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected TEXT NOT NULL DEFAULT '',
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  spec_status VARCHAR(20) NOT NULL DEFAULT 'none',
  ai_rationale TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_test_cases_project_code UNIQUE (project_id, code)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id)')

    await query(`
CREATE TABLE IF NOT EXISTS test_catalog_pages (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  diagram_x DOUBLE PRECISION NULL,
  diagram_y DOUBLE PRECISION NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_catalog_pages_project ON test_catalog_pages(project_id)')
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_test_catalog_pages_project_slug ON test_catalog_pages (project_id, slug) WHERE slug IS NOT NULL')

    await query(`
CREATE TABLE IF NOT EXISTS test_flows (
  id VARCHAR(36) PRIMARY KEY,
  page_id VARCHAR(36) NOT NULL REFERENCES test_catalog_pages(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_flows_page ON test_flows(page_id)')

    await query(`
CREATE TABLE IF NOT EXISTS test_page_nav_edges (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  source_page_id VARCHAR(36) NOT NULL REFERENCES test_catalog_pages(id) ON DELETE CASCADE,
  target_page_id VARCHAR(36) NOT NULL REFERENCES test_catalog_pages(id) ON DELETE CASCADE,
  label VARCHAR(200) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_page_nav_edges_project ON test_page_nav_edges(project_id)')

    const missingFlowIdCol = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_cases' AND column_name = 'flow_id' LIMIT 1`
    )
    if (!missingFlowIdCol?.length) {
      await query(`
ALTER TABLE test_cases
  ADD COLUMN flow_id VARCHAR(36) NULL REFERENCES test_flows(id) ON DELETE SET NULL
`)
      await query('CREATE INDEX IF NOT EXISTS idx_test_cases_flow ON test_cases(flow_id)')
    }

    const projectsNeedCatalog = await query<{ id: string }>(
      `SELECT p.id FROM test_projects p
       WHERE NOT EXISTS (SELECT 1 FROM test_catalog_pages c WHERE c.project_id = p.id)`
    )
    for (const row of projectsNeedCatalog ?? []) {
      const pageId = randomUuidV7()
      const flowId = randomUuidV7()
      await query(
        `INSERT INTO test_catalog_pages (id, project_id, name, slug, description, sort_order, diagram_x, diagram_y)
         VALUES (?, ?, ?, ?, NULL, 0, NULL, NULL)`,
        [pageId, row.id, 'General', 'general']
      )
      await query(`INSERT INTO test_flows (id, page_id, name, sort_order) VALUES (?, ?, ?, 0)`, [flowId, pageId, 'General'])
      await query(`UPDATE test_cases SET flow_id = ? WHERE project_id = ? AND flow_id IS NULL`, [flowId, row.id])
    }

    await query(`
CREATE TABLE IF NOT EXISTS test_runs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  browsers TEXT[] NOT NULL DEFAULT ARRAY['chromium']::TEXT[],
  workers INT NOT NULL DEFAULT 1,
  retries INT NOT NULL DEFAULT 0,
  grep TEXT NULL,
  total INT NOT NULL DEFAULT 0,
  passed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  flaky INT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  triggered_by VARCHAR(36) NULL,
  report_path TEXT NULL,
  junit_path TEXT NULL,
  json_path TEXT NULL,
  cancel_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_runs_project_started ON test_runs(project_id, started_at DESC)')

    await query(`
CREATE TABLE IF NOT EXISTS test_case_results (
  id VARCHAR(36) PRIMARY KEY,
  run_id VARCHAR(36) NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  case_id VARCHAR(36) NULL REFERENCES test_cases(id) ON DELETE SET NULL,
  case_code VARCHAR(100) NULL,
  test_title TEXT NULL,
  spec_file TEXT NULL,
  browser VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 1,
  error_message TEXT NULL,
  trace_path TEXT NULL,
  screenshot_paths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  video_path TEXT NULL,
  stdout_path TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_case_results_run ON test_case_results(run_id)')
    await query('CREATE INDEX IF NOT EXISTS idx_test_case_results_case ON test_case_results(case_id)')

    const missingTitleCol = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_case_results' AND column_name = 'test_title' LIMIT 1`
    )
    if (!missingTitleCol?.length) {
      await query('ALTER TABLE test_case_results ADD COLUMN test_title TEXT NULL')
    }
    const missingSpecCol = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_case_results' AND column_name = 'spec_file' LIMIT 1`
    )
    if (!missingSpecCol?.length) {
      await query('ALTER TABLE test_case_results ADD COLUMN spec_file TEXT NULL')
    }

    const missingFailureStepsCol = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_case_results' AND column_name = 'failure_steps' LIMIT 1`
    )
    if (!missingFailureStepsCol?.length) {
      await query('ALTER TABLE test_case_results ADD COLUMN failure_steps TEXT NULL')
    }

    const missingReportStepsCol = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_case_results' AND column_name = 'report_steps' LIMIT 1`
    )
    if (!missingReportStepsCol?.length) {
      await query('ALTER TABLE test_case_results ADD COLUMN report_steps TEXT NULL')
    }

    const missingNavEdgeStyle = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_page_nav_edges' AND column_name = 'style_json' LIMIT 1`
    )
    if (!missingNavEdgeStyle?.length) {
      await query('ALTER TABLE test_page_nav_edges ADD COLUMN style_json TEXT NULL')
    }

    const missingNavEdgeRunOrder = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_page_nav_edges' AND column_name = 'run_order' LIMIT 1`
    )
    if (!missingNavEdgeRunOrder?.length) {
      await query('ALTER TABLE test_page_nav_edges ADD COLUMN run_order INTEGER NULL')
    }

    const missingPageExecutionDisabled = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_catalog_pages' AND column_name = 'execution_disabled' LIMIT 1`
    )
    if (!missingPageExecutionDisabled?.length) {
      await query('ALTER TABLE test_catalog_pages ADD COLUMN execution_disabled BOOLEAN NOT NULL DEFAULT FALSE')
    }

    const missingCatalogDiagramStyle = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_catalog_pages' AND column_name = 'diagram_style_json' LIMIT 1`
    )
    if (!missingCatalogDiagramStyle?.length) {
      await query('ALTER TABLE test_catalog_pages ADD COLUMN diagram_style_json TEXT NULL')
    }

    await query(`
CREATE TABLE IF NOT EXISTS test_catalog_groups (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  parent_group_id VARCHAR(36) NULL REFERENCES test_catalog_groups(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  diagram_x DOUBLE PRECISION NULL,
  diagram_y DOUBLE PRECISION NULL,
  diagram_width DOUBLE PRECISION NULL,
  diagram_height DOUBLE PRECISION NULL,
  diagram_style_json TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_catalog_groups_project ON test_catalog_groups(project_id)')
    await query('CREATE INDEX IF NOT EXISTS idx_test_catalog_groups_parent ON test_catalog_groups(parent_group_id)')
    await query('CREATE INDEX IF NOT EXISTS idx_test_catalog_groups_project_parent ON test_catalog_groups(project_id, parent_group_id)')

    const missingPageGroupId = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_catalog_pages' AND column_name = 'group_id' LIMIT 1`
    )
    if (!missingPageGroupId?.length) {
      await query(`
ALTER TABLE test_catalog_pages
  ADD COLUMN group_id VARCHAR(36) NULL REFERENCES test_catalog_groups(id) ON DELETE SET NULL
`)
      await query('CREATE INDEX IF NOT EXISTS idx_test_catalog_pages_group ON test_catalog_pages(group_id)')
    }

    await query(`
CREATE TABLE IF NOT EXISTS test_catalog_group_members (
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id VARCHAR(36) NOT NULL REFERENCES test_catalog_groups(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_catalog_group_members_group ON test_catalog_group_members(group_id)')

    await query(`
CREATE TABLE IF NOT EXISTS test_page_map_annotations (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  label_number INT NOT NULL DEFAULT 1,
  diagram_x DOUBLE PRECISION NULL,
  diagram_y DOUBLE PRECISION NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_page_map_annotations_project ON test_page_map_annotations(project_id)')

    const missingAnnWidth = await query<{ cnt: number }>(
      `SELECT 1 AS cnt FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'test_page_map_annotations' AND column_name = 'diagram_width' LIMIT 1`
    )
    if (!missingAnnWidth?.length) {
      await query('ALTER TABLE test_page_map_annotations ADD COLUMN diagram_width DOUBLE PRECISION NULL')
      await query('ALTER TABLE test_page_map_annotations ADD COLUMN diagram_height DOUBLE PRECISION NULL')
      await query('ALTER TABLE test_page_map_annotations ADD COLUMN style_json TEXT NULL')
    }

    await query(`
CREATE TABLE IF NOT EXISTS ai_repair_proposals (
  id VARCHAR(36) PRIMARY KEY,
  case_result_id VARCHAR(36) NOT NULL REFERENCES test_case_results(id) ON DELETE CASCADE,
  original_spec TEXT NOT NULL,
  proposed_spec TEXT NOT NULL,
  rationale TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_ai_repair_proposals_result ON ai_repair_proposals(case_result_id)')
  } catch (e) {
    l.error('[db] migrateAutomationTestTables failed', e)
    return
  }
  automationTestTablesMigrationDone = true
}

let testProjectTaskLinksMigrationDone = false

/** Explicit links between task (master) projects and automation test_projects. */
export async function migrateTestProjectTaskLinksTable(): Promise<void> {
  if (testProjectTaskLinksMigrationDone || !hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS test_project_task_links (
  id VARCHAR(36) PRIMARY KEY,
  task_project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (task_project_id, test_project_id)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_test_project_task_links_task ON test_project_task_links(task_project_id)')
    await query('CREATE INDEX IF NOT EXISTS idx_test_project_task_links_test ON test_project_task_links(test_project_id)')
  } catch (e) {
    l.error('[db] migrateTestProjectTaskLinksTable failed', e)
    return
  }
  testProjectTaskLinksMigrationDone = true
}

let devPipelineTablesMigrationDone = false

/**
 * Dev Pipelines: build/release flow graphs (React Flow JSON), per-user — tách khỏi Automation Test (Playwright).
 */
export async function migrateDevPipelineTables(): Promise<void> {
  if (devPipelineTablesMigrationDone || !hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS dev_pipeline_flows (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  graph_json JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_dev_pipeline_flows_user_updated ON dev_pipeline_flows(user_id, updated_at DESC)')

    await query(`
CREATE TABLE IF NOT EXISTS dev_pipeline_runs (
  id VARCHAR(36) PRIMARY KEY,
  flow_id VARCHAR(36) NOT NULL REFERENCES dev_pipeline_flows(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  context_json JSONB NULL,
  step_status_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_dev_pipeline_runs_flow ON dev_pipeline_runs(flow_id, started_at DESC)')

    const devFlowCols = [
      { name: 'kind', ddl: "VARCHAR(30) NOT NULL DEFAULT 'pipeline'" },
      { name: 'project_id', ddl: 'VARCHAR(36) NULL REFERENCES projects(id) ON DELETE SET NULL' },
      { name: 'settings_json', ddl: "JSONB NULL DEFAULT '{}'::jsonb" },
    ] as const
    for (const col of devFlowCols) {
      const rows = await query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'dev_pipeline_flows' AND column_name = ? LIMIT 1`,
        [col.name]
      )
      if (!Array.isArray(rows) || rows.length === 0) {
        await query(`ALTER TABLE dev_pipeline_flows ADD COLUMN ${col.name} ${col.ddl}`)
      }
    }
  } catch (e) {
    l.error('[db] migrateDevPipelineTables failed', e)
    return
  }
  devPipelineTablesMigrationDone = true
}

let aiUsageEventsUserIdMigrationDone = false

/** Per-user AI usage attribution for admin reporting. */
export async function migrateAiUsageEventsUserIdColumn(): Promise<void> {
  if (aiUsageEventsUserIdMigrationDone || !hasDbConfig()) return

  const hasCol = async (): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'ai_usage_events' AND column_name = 'user_id' LIMIT 1`
    )
    return Array.isArray(rows) && rows.length > 0
  }

  const hasIndex = async (indexName: string): Promise<boolean> => {
    const rows = await query(`SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()::text AND tablename = 'ai_usage_events' AND indexname = ? LIMIT 1`, [
      indexName,
    ])
    return Array.isArray(rows) && rows.length > 0
  }

  const isUserIdNullable = async (): Promise<boolean> => {
    const rows = await query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'ai_usage_events' AND column_name = 'user_id' LIMIT 1`
    )
    return rows?.[0]?.is_nullable === 'YES'
  }

  try {
    if (!(await hasCol())) {
      await query('ALTER TABLE ai_usage_events ADD COLUMN user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE CASCADE')
    }
    await query(
      `UPDATE ai_usage_events SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL`
    )
    await query('DELETE FROM ai_usage_events WHERE user_id IS NULL')
    if (await isUserIdNullable()) {
      await query('ALTER TABLE ai_usage_events ALTER COLUMN user_id SET NOT NULL')
    }
    if (!(await hasIndex('idx_ai_usage_user_created'))) {
      await query('CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_events(user_id, created_at)')
    }
  } catch (e) {
    l.error('[db] migrateAiUsageEventsUserIdColumn failed', e)
    return
  }
  aiUsageEventsUserIdMigrationDone = true
}

let evmWbsDayUnitFkCascadeMigrationDone = false

/** Ensure `evm_wbs_day_unit.wbs_id` FK cascades when a WBS detail row is deleted (legacy DBs may lack ON DELETE CASCADE). */
export async function migrateEvmWbsDayUnitFkCascade(): Promise<void> {
  if (evmWbsDayUnitFkCascadeMigrationDone || !hasDbConfig()) return

  const tableExists = async (table: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ? LIMIT 1`,
      [table]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await tableExists('evm_wbs_day_unit')) || !(await tableExists('evm_wbs_details'))) {
      evmWbsDayUnitFkCascadeMigrationDone = true
      return
    }

    const fkRows = await query<{ confdeltype: string }>(
      `SELECT c.confdeltype FROM pg_constraint c
       INNER JOIN pg_class t ON t.oid = c.conrelid
       INNER JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE c.conname = 'fk_evm_wdu_wbs_detail'
         AND n.nspname = current_schema()::text
         AND t.relname = 'evm_wbs_day_unit'
       LIMIT 1`
    )

    if (fkRows?.[0]?.confdeltype === 'c') {
      evmWbsDayUnitFkCascadeMigrationDone = true
      return
    }

    if (fkRows?.length) {
      await query('ALTER TABLE evm_wbs_day_unit DROP CONSTRAINT fk_evm_wdu_wbs_detail')
    }

    await query(
      'ALTER TABLE evm_wbs_day_unit ADD CONSTRAINT fk_evm_wdu_wbs_detail FOREIGN KEY (wbs_id) REFERENCES evm_wbs_details(id) ON DELETE CASCADE'
    )
  } catch (e) {
    l.error('[db] migrateEvmWbsDayUnitFkCascade failed', e)
    return
  }
  evmWbsDayUnitFkCascadeMigrationDone = true
}

let projectFkCascadeMigrationDone = false

const PROJECT_FK_CASCADE_DEFS: { table: string; constraint: string; ddl: string }[] = [
  {
    table: 'user_project_roles',
    constraint: 'fk_upr_project',
    ddl: 'ALTER TABLE user_project_roles ADD CONSTRAINT fk_upr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'user_project_source_folder',
    constraint: 'fk_upsf_project',
    ddl: 'ALTER TABLE user_project_source_folder ADD CONSTRAINT fk_upsf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'tasks',
    constraint: 'fk_tasks_project',
    ddl: 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'task_ticket_sequences',
    constraint: 'fk_tts_project',
    ddl: 'ALTER TABLE task_ticket_sequences ADD CONSTRAINT fk_tts_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_wbs',
    constraint: 'fk_evm_wbs_project',
    ddl: 'ALTER TABLE evm_wbs ADD CONSTRAINT fk_evm_wbs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_wbs_master',
    constraint: 'fk_evm_wbs_master_project',
    ddl: 'ALTER TABLE evm_wbs_master ADD CONSTRAINT fk_evm_wbs_master_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_wbs_details',
    constraint: 'fk_evm_wbs_details_project',
    ddl: 'ALTER TABLE evm_wbs_details ADD CONSTRAINT fk_evm_wbs_details_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_phases',
    constraint: 'fk_evm_phases_project',
    ddl: 'ALTER TABLE evm_phases ADD CONSTRAINT fk_evm_phases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_ac',
    constraint: 'fk_evm_ac_project',
    ddl: 'ALTER TABLE evm_ac ADD CONSTRAINT fk_evm_ac_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_master',
    constraint: 'fk_evm_master_project',
    ddl: 'ALTER TABLE evm_master ADD CONSTRAINT fk_evm_master_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'evm_ai_insight',
    constraint: 'fk_evm_ai_insight_project',
    ddl: 'ALTER TABLE evm_ai_insight ADD CONSTRAINT fk_evm_ai_insight_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'coding_rules',
    constraint: 'fk_coding_rules_project',
    ddl: 'ALTER TABLE coding_rules ADD CONSTRAINT fk_coding_rules_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'pr_repos',
    constraint: 'fk_pr_repos_project',
    ddl: 'ALTER TABLE pr_repos ADD CONSTRAINT fk_pr_repos_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'pr_checkpoint_templates',
    constraint: 'fk_pr_tpl_project',
    ddl: 'ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT fk_pr_tpl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'pr_tracked_branches',
    constraint: 'fk_pr_track_project',
    ddl: 'ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'pr_user_board_skip_branches',
    constraint: 'fk_pr_ub_skip_project',
    ddl: 'ALTER TABLE pr_user_board_skip_branches ADD CONSTRAINT fk_pr_ub_skip_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
  {
    table: 'pr_ai_assist_chats',
    constraint: 'fk_pr_ai_chat_project',
    ddl: 'ALTER TABLE pr_ai_assist_chats ADD CONSTRAINT fk_pr_ai_chat_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE',
  },
]

/** Ensure child tables referencing `projects(id)` use ON DELETE CASCADE (legacy DBs may use NO ACTION). */
export async function migrateProjectFkCascade(): Promise<void> {
  if (projectFkCascadeMigrationDone || !hasDbConfig()) return

  const tableExists = async (table: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ? LIMIT 1`,
      [table]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    if (!(await tableExists('projects'))) {
      projectFkCascadeMigrationDone = true
      return
    }

    for (const { table, constraint, ddl } of PROJECT_FK_CASCADE_DEFS) {
      if (!(await tableExists(table))) continue

      const fkRows = await query<{ confdeltype: string }>(
        `SELECT c.confdeltype FROM pg_constraint c
         INNER JOIN pg_class t ON t.oid = c.conrelid
         INNER JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE c.conname = ?
           AND n.nspname = current_schema()::text
           AND t.relname = ?
         LIMIT 1`,
        [constraint, table]
      )

      if (fkRows?.[0]?.confdeltype === 'c') continue

      if (fkRows?.length) {
        await query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`)
      }
      await query(ddl)
    }
  } catch (e) {
    l.error('[db] migrateProjectFkCascade failed', e)
    return
  }
  projectFkCascadeMigrationDone = true
}

let commitWorkflowTablesMigrationDone = false

/** Commit Workflow: per-project quality graphs + run history. */
export async function migrateCommitWorkflowTables(): Promise<void> {
  if (commitWorkflowTablesMigrationDone || !hasDbConfig()) return
  try {
    await query(`
CREATE TABLE IF NOT EXISTS project_commit_workflows (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  graph_json JSONB NOT NULL,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_pcw_project ON project_commit_workflows(project_id)')

    await query(`
CREATE TABLE IF NOT EXISTS commit_workflow_runs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NULL REFERENCES projects(id) ON DELETE SET NULL,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commit_hash VARCHAR(40) NOT NULL,
  repo_path VARCHAR(500) NOT NULL,
  workflow_id VARCHAR(36) NULL,
  workflow_version INT NOT NULL DEFAULT 1,
  graph_snapshot JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_cwr_user_created ON commit_workflow_runs(user_id, created_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_cwr_project_created ON commit_workflow_runs(project_id, created_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_cwr_commit ON commit_workflow_runs(commit_hash)')
    await query('CREATE INDEX IF NOT EXISTS idx_cwr_repo ON commit_workflow_runs(repo_path, created_at DESC)')

    await query(`
CREATE TABLE IF NOT EXISTS commit_workflow_steps (
  id VARCHAR(36) PRIMARY KEY,
  run_id VARCHAR(36) NOT NULL REFERENCES commit_workflow_runs(id) ON DELETE CASCADE,
  step_key VARCHAR(50) NOT NULL,
  step_kind VARCHAR(30) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  summary_json JSONB NULL,
  external_ref VARCHAR(36) NULL,
  UNIQUE (run_id, step_key)
)`)
    await query('CREATE INDEX IF NOT EXISTS idx_cws_run ON commit_workflow_steps(run_id, sort_order)')

    const hasWorkflowRunId = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'git_commit_queue' AND column_name = 'workflow_run_id' LIMIT 1`
    )
    if (!Array.isArray(hasWorkflowRunId) || hasWorkflowRunId.length === 0) {
      await query('ALTER TABLE git_commit_queue ADD COLUMN workflow_run_id VARCHAR(36) NULL')
      await query('ALTER TABLE git_commit_queue ADD COLUMN user_id VARCHAR(36) NULL')
      await query('ALTER TABLE git_commit_queue ADD COLUMN project_id VARCHAR(36) NULL')
    }

    const snapCols = [
      'commits_with_rule_pass',
      'commits_with_spotbugs_pass',
      'commits_with_playwright_pass',
      'commits_with_workflow_completed',
    ] as const
    for (const col of snapCols) {
      const rows = await query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'user_daily_snapshots' AND column_name = ? LIMIT 1`,
        [col]
      )
      if (!Array.isArray(rows) || rows.length === 0) {
        await query(`ALTER TABLE user_daily_snapshots ADD COLUMN ${col} INT DEFAULT 0`)
      }
    }

    const hasSupersedes = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'commit_workflow_runs' AND column_name = 'supersedes_run_id' LIMIT 1`
    )
    if (!Array.isArray(hasSupersedes) || hasSupersedes.length === 0) {
      await query('ALTER TABLE commit_workflow_runs ADD COLUMN supersedes_run_id VARCHAR(36) NULL REFERENCES commit_workflow_runs(id) ON DELETE SET NULL')
      await query('CREATE INDEX IF NOT EXISTS idx_cwr_supersedes ON commit_workflow_runs(supersedes_run_id)')
    }
  } catch (e) {
    l.error('[db] migrateCommitWorkflowTables failed', e)
    return
  }
  commitWorkflowTablesMigrationDone = true
}

let commitWorkflowDevPipelineCleanupDone = false

/** Remove legacy commit_workflow template rows from Dev Pipelines (config now per-commit via dialog). */
export async function migrateCommitWorkflowDevPipelineCleanup(): Promise<void> {
  if (commitWorkflowDevPipelineCleanupDone || !hasDbConfig()) return
  try {
    await query("DELETE FROM dev_pipeline_flows WHERE kind = 'commit_workflow'")
    await query('DELETE FROM project_commit_workflows')
    await query('DROP INDEX IF EXISTS idx_dev_pipeline_flows_commit_wf_project')
    await query('DROP TABLE IF EXISTS project_commit_workflows')
  } catch (e) {
    l.error('[db] migrateCommitWorkflowDevPipelineCleanup failed', e)
    return
  }
  commitWorkflowDevPipelineCleanupDone = true
}

let dropCommitReviewsTableDone = false
let commitReviewLegacyCleanupDone = false

const COMMIT_REVIEW_ACHIEVEMENT_CODES = [
  'review_first',
  'review_25',
  'review_100',
  'review_500',
  'review_250',
  'review_1000',
  'neg_ghost_reviewer',
] as const

/** Drop legacy commit_reviews table + review stats columns (Show Log PL review removed). */
export async function migrateDropCommitReviewsTable(): Promise<void> {
  if (!hasDbConfig()) return

  if (!dropCommitReviewsTableDone) {
    try {
      // CASCADE drops attached triggers; DROP TRIGGER IF EXISTS still errors when the table is missing.
      await query('DROP TABLE IF EXISTS commit_reviews CASCADE')
      dropCommitReviewsTableDone = true
    } catch (e) {
      l.error('[db] migrateDropCommitReviewsTable failed', e)
      return
    }
  }

  if (commitReviewLegacyCleanupDone) return

  const checkCol = async (table: string, col: string): Promise<boolean> => {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, col]
    )
    return Array.isArray(rows) && rows.length > 0
  }

  try {
    const dropCol = async (table: string, col: string) => {
      if (await checkCol(table, col)) {
        await query(`ALTER TABLE ${table} DROP COLUMN ${col}`)
      }
    }
    await dropCol('user_stats', 'total_reviews')
    await dropCol('user_stats', 'consecutive_no_review_days')
    await dropCol('user_stats', 'last_review_date')
    await dropCol('user_daily_snapshots', 'reviews_done')

    const codes = COMMIT_REVIEW_ACHIEVEMENT_CODES.map(c => `'${c}'`).join(', ')
    await query(`DELETE FROM user_badge_display WHERE achievement_code IN (${codes})`)
    await query(`DELETE FROM user_achievements WHERE achievement_code IN (${codes})`)
    await query(`DELETE FROM achievements WHERE code IN (${codes})`)

    commitReviewLegacyCleanupDone = true
  } catch (e) {
    l.error('[db] migrateDropCommitReviewsLegacyColumns failed', e)
  }
}
