-- Task Management Schema (PostgreSQL — Supabase / self-hosted)
-- Phase 1: Bảng không FK. Phase 2: FK. Cập nhật `updated_at` bằng trigger (thay cơ chế ON UPDATE của các engine khác).

-- ========== updated_at triggers ==========
CREATE OR REPLACE FUNCTION task_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========== PHASE 1: CREATE TABLES (no FK) ==========
CREATE TABLE IF NOT EXISTS task_statuses (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_priorities (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_types (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_sources (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_link_types (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  user_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  avatar_data TEXT NULL,
  receive_commit_notification BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users_password (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_admins (
  user_id VARCHAR(36) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY,
  project_no VARCHAR(100) NULL,
  name VARCHAR(255) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  report_date DATE NULL,
  end_user VARCHAR(255) NULL,
  daily_report_reminder_time TIME NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_project_roles (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NULL,
  project_id_uk VARCHAR(36) GENERATED ALWAYS AS (COALESCE(project_id, '___GLOBAL___')) STORED,
  role VARCHAR(10) NOT NULL CHECK (role IN ('dev', 'pl', 'pm')),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_user_project_role UNIQUE (user_id, project_id_uk, role)
);

CREATE TABLE IF NOT EXISTS user_project_source_folder (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  source_folder_path VARCHAR(500) NOT NULL,
  source_folder_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_user_path UNIQUE (user_id, source_folder_path),
  CONSTRAINT uk_user_project_path UNIQUE (user_id, project_id, source_folder_path)
);

CREATE TABLE IF NOT EXISTS task_ticket_sequences (
  project_id VARCHAR(36) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'in_app',
  next_value INT NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, source)
);

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  assignee_user_id VARCHAR(36) NULL,
  status VARCHAR(50) DEFAULT 'new',
  progress INT DEFAULT 0,
  priority VARCHAR(50) DEFAULT 'medium',
  type VARCHAR(50) DEFAULT 'bug',
  source VARCHAR(50) DEFAULT 'in_app',
  ticket_id VARCHAR(100) NULL,
  plan_start_date TIMESTAMPTZ,
  plan_end_date TIMESTAMPTZ,
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status_entered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  parent_id VARCHAR(36) NULL,
  CONSTRAINT uk_task_project_source_ticket UNIQUE (project_id, source, ticket_id)
);

CREATE TABLE IF NOT EXISTS task_links (
  id VARCHAR(36) PRIMARY KEY,
  from_task_id VARCHAR(36) NOT NULL,
  to_task_id VARCHAR(36) NOT NULL,
  link_type VARCHAR(50) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_task_link UNIQUE (from_task_id, to_task_id, link_type)
);

CREATE TABLE IF NOT EXISTS task_favorites (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_task_favorite_user_task UNIQUE (user_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_change_history (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'ui',
  changes_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evm_wbs_master (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  phase VARCHAR(100),
  category VARCHAR(200),
  feature VARCHAR(200),
  note VARCHAR(500),
  plan_start_date DATE,
  plan_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  assignee_user_id VARCHAR(36) NULL,
  bac DECIMAL(15,2) NULL,
  pv DECIMAL(15,2) NULL,
  ev DECIMAL(15,2) NULL,
  sv DECIMAL(15,2) NULL,
  spi DECIMAL(15,2) NULL,
  progress DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evm_wbs_details (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  evm_wbs_master_id VARCHAR(36) NOT NULL,
  no INT NOT NULL DEFAULT 0,
  phase VARCHAR(100),
  category VARCHAR(200),
  feature VARCHAR(200),
  task VARCHAR(500),
  duration_days INT NULL CHECK (duration_days IS NULL OR duration_days >= 0),
  plan_start_date DATE,
  plan_end_date DATE,
  predecessor INT NULL,
  actual_start_date DATE,
  actual_end_date DATE,
  assignee_user_id VARCHAR(36) NULL,
  progress DECIMAL(5,2) NOT NULL DEFAULT 0,
  status VARCHAR(100),
  effort DECIMAL(15,2) NULL,
  est_md DECIMAL(15,2) NULL,
  wbs_note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evm_wbs_day_unit (
  id VARCHAR(36) PRIMARY KEY,
  wbs_id VARCHAR(36) NOT NULL,
  work_date DATE NOT NULL,
  unit DECIMAL(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_evm_wdu_wbs_date UNIQUE (wbs_id, work_date)
);

CREATE TABLE IF NOT EXISTS evm_phases (
  project_id VARCHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, code)
);

CREATE TABLE IF NOT EXISTS evm_wbs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  no INT NOT NULL DEFAULT 0,
  phase VARCHAR(100) NULL,
  category VARCHAR(200) NULL,
  feature VARCHAR(200) NULL,
  task VARCHAR(500) NULL,
  plan_start_date DATE NULL,
  plan_end_date DATE NULL,
  actual_start_date DATE NULL,
  actual_end_date DATE NULL,
  assignee_user_id VARCHAR(36) NULL,
  percent_done DECIMAL(7,6) NOT NULL DEFAULT 0,
  status VARCHAR(100) NULL,
  plan_weight DECIMAL(12,4) NULL DEFAULT 1,
  bac DECIMAL(15,4) NULL,
  wbs_note TEXT NULL,
  duration_days INT NULL CHECK (duration_days IS NULL OR duration_days >= 0),
  predecessor VARCHAR(500) NULL,
  effort DECIMAL(15,4) NULL,
  est_md DECIMAL(15,4) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evm_ac (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  no INT NOT NULL DEFAULT 0,
  date DATE NULL,
  phase VARCHAR(100) NULL,
  category VARCHAR(200) NULL,
  feature VARCHAR(200) NULL,
  task VARCHAR(500) NULL,
  plan_start_date DATE NULL,
  plan_end_date DATE NULL,
  actual_start_date DATE NULL,
  actual_end_date DATE NULL,
  percent_done DECIMAL(7,6) NULL,
  assignee VARCHAR(36) NULL,
  working_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  work_contents TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evm_master (
  project_id VARCHAR(36) PRIMARY KEY,
  phases JSONB NOT NULL,
  statuses JSONB NOT NULL,
  non_working_days JSONB NOT NULL,
  hours_per_day DECIMAL(6,2) NOT NULL DEFAULT 8,
  phase_report_notes JSONB NULL,
  assignee_report_notes JSONB NULL,
  percent_done_options JSONB NULL,
  issue_import_map JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evm_ai_insight (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  insight_type VARCHAR(64) NOT NULL,
  output_markdown TEXT NOT NULL,
  input_payload_json TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commit_reviews (
  id VARCHAR(36) PRIMARY KEY,
  source_folder_path VARCHAR(500) NOT NULL,
  commit_id VARCHAR(100) NOT NULL,
  vcs_type VARCHAR(10) NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  reviewer_user_id VARCHAR(36) NULL,
  note TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_commit_review UNIQUE (source_folder_path, commit_id)
);

CREATE TABLE IF NOT EXISTS coding_rules (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  project_id VARCHAR(36) NULL,
  project_id_uk VARCHAR(36) GENERATED ALWAYS AS (COALESCE(project_id, '___GLOBAL___')) STORED,
  created_by VARCHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_name_project UNIQUE (name, project_id_uk)
);

CREATE TABLE IF NOT EXISTS commit_message_history (
  date VARCHAR(50) PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  source_folder_path VARCHAR(500) PRIMARY KEY,
  source_folder_name VARCHAR(255),
  analysis_date VARCHAR(50),
  analysis_result JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_analysis_history (
  id SERIAL PRIMARY KEY,
  source_folder_path VARCHAR(500),
  source_folder_name VARCHAR(255),
  analysis_date VARCHAR(50),
  timestamp BIGINT,
  total_commits INT,
  date_range VARCHAR(100) NULL,
  analysis_result JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS git_commit_queue (
  commit_hash VARCHAR(40) PRIMARY KEY,
  commit_user VARCHAR(255),
  commit_time VARCHAR(50),
  commit_message TEXT,
  added_files JSONB,
  modified_files JSONB,
  deleted_files JSONB,
  has_check_coding_rule BOOLEAN DEFAULT FALSE,
  has_check_spotbugs BOOLEAN DEFAULT FALSE,
  branch_name VARCHAR(255) NULL,
  insertions INT NULL,
  deletions INT NULL,
  changes INT NULL,
  source_folder_path VARCHAR(500) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_ids JSONB NULL,
  report_date DATE NOT NULL,
  work_description TEXT,
  selected_commits JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_user_date UNIQUE (user_id, report_date)
);

CREATE TABLE IF NOT EXISTS daily_report_source_folders (
  daily_report_id VARCHAR(36) NOT NULL,
  user_project_source_folder_id VARCHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (daily_report_id, user_project_source_folder_id)
);

CREATE TABLE IF NOT EXISTS task_notifications (
  id VARCHAR(36) PRIMARY KEY,
  target_user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT,
  task_id VARCHAR(36) NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE INDEX IF NOT EXISTS idx_projects_reminder ON projects(daily_report_reminder_time);
CREATE INDEX IF NOT EXISTS idx_upr_user ON user_project_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_upr_project ON user_project_roles(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user ON tasks(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_end_date ON tasks(plan_end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_actual_end_date ON tasks(actual_end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_task_links_from ON task_links(from_task_id);
CREATE INDEX IF NOT EXISTS idx_task_links_to ON task_links(to_task_id);
CREATE INDEX IF NOT EXISTS idx_task_favorites_user ON task_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_task_favorites_task ON task_favorites(task_id);
CREATE INDEX IF NOT EXISTS idx_commit_reviews_source ON commit_reviews(source_folder_path);
CREATE INDEX IF NOT EXISTS idx_commit_reviews_reviewer ON commit_reviews(reviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_commit_reviews_source_reviewed ON commit_reviews(source_folder_path, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_upsf_source_folder_path ON user_project_source_folder(source_folder_path);
CREATE INDEX IF NOT EXISTS idx_evm_wbs_project ON evm_wbs_master(project_id);
CREATE INDEX IF NOT EXISTS idx_evm_wbs_details_project ON evm_wbs_details(project_id);
CREATE INDEX IF NOT EXISTS idx_evm_wbs_details_master ON evm_wbs_details(evm_wbs_master_id);
CREATE INDEX IF NOT EXISTS idx_evm_wdu_wbs ON evm_wbs_day_unit(wbs_id);
CREATE INDEX IF NOT EXISTS idx_evm_phases_project ON evm_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_evm_wbs_table_project ON evm_wbs(project_id);
CREATE INDEX IF NOT EXISTS idx_evm_ac_project ON evm_ac(project_id);
CREATE INDEX IF NOT EXISTS idx_evm_ai_insight_project_type_created ON evm_ai_insight(project_id, insight_type, created_at);
CREATE INDEX IF NOT EXISTS idx_coding_rules_project ON coding_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_coding_rules_created_by ON coding_rules(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_history_source ON ai_analysis_history(source_folder_path);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_history_timestamp ON ai_analysis_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_git_cq_created_at ON git_commit_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_git_cq_commit_user ON git_commit_queue(commit_user);
CREATE INDEX IF NOT EXISTS idx_drsf_upsf ON daily_report_source_folders(user_project_source_folder_id);
CREATE INDEX IF NOT EXISTS idx_target_unread ON task_notifications(target_user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_task_change_task_created ON task_change_history(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pudw_proj_date ON project_user_daily_workload(project_id, work_date);
CREATE INDEX IF NOT EXISTS idx_pudw_proj_user ON project_user_daily_workload(project_id, user_id);

INSERT INTO task_statuses (code, name, sort_order, color) VALUES
  ('new', 'New', 1, '#0ea5e9'),
  ('in_progress', 'In Progress', 2, '#f59e0b'),
  ('in_review', 'In Review', 3, '#d946ef'),
  ('fixed', 'Fixed', 4, '#14b8a6'),
  ('feedback', 'Feedback', 5, '#f97316'),
  ('cancelled', 'Cancelled', 6, '#dc2626'),
  ('done', 'Done', 7, '#10b981')
ON CONFLICT (code) DO NOTHING;

INSERT INTO task_priorities (code, name, sort_order, color) VALUES
  ('critical', 'Critical', 1, '#dc2626'),
  ('high', 'High', 2, '#ea580c'),
  ('medium', 'Medium', 3, '#64748b'),
  ('low', 'Low', 4, '#0ea5e9')
ON CONFLICT (code) DO NOTHING;

INSERT INTO task_types (code, name, sort_order, color) VALUES
  ('bug', 'Bug', 1, '#f59e0b'),
  ('feature', 'Feature', 2, '#8b5cf6'),
  ('support', 'Support', 3, '#0d9488'),
  ('task', 'Task', 4, '#3b82f6'),
  ('milestone', 'Milestone', 5, '#f59e0b')
ON CONFLICT (code) DO NOTHING;

INSERT INTO task_sources (code, name, sort_order) VALUES
  ('in_app', 'In App', 1),
  ('redmine', 'Redmine', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO task_link_types (code, name, sort_order) VALUES
  ('blocks', 'Blocks', 1),
  ('blocked_by', 'Blocked By', 2),
  ('relates_to', 'Relates To', 3),
  ('duplicates', 'Duplicates', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (id, user_code, name, email) VALUES
  ('00000000-0000-0000-0000-000000000000', 'admin', 'Admin', 'admin@localhost')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users_password (id, user_id, password_hash, version) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '$2b$10$IFrJ/ul4lT4kiFo29uQS3.UHq6WgijJwZO6g06dN6.lUiOGn1HsLW', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_admins (user_id) VALUES ('00000000-0000-0000-0000-000000000000')
ON CONFLICT (user_id) DO NOTHING;

-- ========== ACHIEVEMENT SYSTEM TABLES ==========
CREATE TABLE IF NOT EXISTS achievements (
  code VARCHAR(100) PRIMARY KEY,
  category VARCHAR(40) NOT NULL CHECK (category IN ('task','git','review','report','quality','streak','negative')),
  tier VARCHAR(40) NOT NULL CHECK (tier IN ('bronze','silver','gold','special','negative')),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(50) NOT NULL,
  xp_reward INT DEFAULT 0,
  is_repeatable BOOLEAN DEFAULT FALSE,
  condition_type VARCHAR(100) NOT NULL,
  condition_threshold INT NULL,
  is_negative BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id VARCHAR(36) PRIMARY KEY,
  xp INT NOT NULL DEFAULT 0,
  current_rank VARCHAR(50) NOT NULL DEFAULT 'newbie',
  current_streak_days INT DEFAULT 0,
  current_report_streak_days INT DEFAULT 0,
  last_activity_date DATE NULL,
  total_tasks_done INT DEFAULT 0,
  total_tasks_created INT DEFAULT 0,
  total_commits INT DEFAULT 0,
  total_pushes INT DEFAULT 0,
  total_merges INT DEFAULT 0,
  total_branches_created INT DEFAULT 0,
  total_stashes INT DEFAULT 0,
  total_rebases INT DEFAULT 0,
  total_reviews INT DEFAULT 0,
  total_reports INT DEFAULT 0,
  total_spotbugs_clean INT DEFAULT 0,
  total_spotbugs_fails INT DEFAULT 0,
  total_files_committed INT DEFAULT 0,
  total_insertions INT DEFAULT 0,
  total_coding_rules_created INT DEFAULT 0,
  total_tasks_on_time INT DEFAULT 0,
  total_tasks_early INT DEFAULT 0,
  total_tasks_late INT DEFAULT 0,
  total_tasks_bug_done INT DEFAULT 0,
  total_tasks_feature_done INT DEFAULT 0,
  total_tasks_critical_done INT DEFAULT 0,
  consecutive_no_review_days INT DEFAULT 0,
  consecutive_no_report_days INT DEFAULT 0,
  consecutive_spotbugs_fails INT DEFAULT 0,
  last_commit_date DATE NULL,
  last_review_date DATE NULL,
  last_report_date DATE NULL,
  last_negative_check_date DATE NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  achievement_code VARCHAR(100) NOT NULL,
  earned_count INT DEFAULT 1,
  first_earned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_earned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_redeemed BOOLEAN DEFAULT FALSE,
  CONSTRAINT uk_user_ach UNIQUE (user_id, achievement_code)
);

CREATE TABLE IF NOT EXISTS user_badge_display (
  user_id VARCHAR(36) NOT NULL,
  achievement_code VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, achievement_code)
);

CREATE INDEX IF NOT EXISTS idx_user_stats_rank ON user_stats(current_rank);
CREATE INDEX IF NOT EXISTS idx_user_stats_xp ON user_stats(xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_code ON user_achievements(achievement_code);

CREATE TABLE IF NOT EXISTS user_daily_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  snapshot_date DATE NOT NULL,
  commits_count INT DEFAULT 0,
  lines_inserted INT DEFAULT 0,
  lines_deleted INT DEFAULT 0,
  files_changed INT DEFAULT 0,
  commits_with_rule_check INT DEFAULT 0,
  commits_with_spotbugs INT DEFAULT 0,
  commits_total_in_queue INT DEFAULT 0,
  tasks_done INT DEFAULT 0,
  tasks_done_on_time INT DEFAULT 0,
  tasks_overdue_opened INT DEFAULT 0,
  reviews_done INT DEFAULT 0,
  has_daily_report BOOLEAN DEFAULT FALSE,
  evm_hours_logged DECIMAL(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_uds_user_date UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_user_year ON user_daily_snapshots(user_id, snapshot_date);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  feature VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('openai', 'claude', 'google')),
  model VARCHAR(128) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_input_tokens INT NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  cost_usd DECIMAL(18, 8) NULL,
  pricing_known BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_events(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS ai_usage_settings (
  id SMALLINT NOT NULL PRIMARY KEY DEFAULT 1,
  display_currency VARCHAR(10) NOT NULL DEFAULT 'USD' CHECK (display_currency IN ('USD', 'VND', 'JPY')),
  fx_usd_to_vnd DECIMAL(24, 8) NULL,
  fx_usd_to_jpy DECIMAL(24, 8) NULL,
  fx_updated_at BIGINT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_usage_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ========== PR MANAGER TABLES ==========
CREATE TABLE IF NOT EXISTS pr_repos (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  local_path VARCHAR(500),
  remote_url VARCHAR(500) NOT NULL,
  hosting VARCHAR(20) NOT NULL DEFAULT 'github',
  owner VARCHAR(200) NOT NULL,
  repo VARCHAR(200) NOT NULL,
  default_base_branch VARCHAR(200) DEFAULT 'stage',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_pr_repos_user_proj_own_repo UNIQUE (user_id, project_id, owner, repo)
);

CREATE TABLE IF NOT EXISTS pr_checkpoint_templates (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  target_branch VARCHAR(200),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  header_group_id SMALLINT NULL CHECK (header_group_id IS NULL OR (header_group_id >= 0 AND header_group_id <= 255)),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_pr_tpl_user_proj_code UNIQUE (user_id, project_id, code)
);

CREATE TABLE IF NOT EXISTS pr_tracked_branches (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  repo_id VARCHAR(36) NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT uk_pr_track_user_repo_branch UNIQUE (user_id, repo_id, branch_name)
);

CREATE TABLE IF NOT EXISTS pr_branch_checkpoints (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  tracked_branch_id VARCHAR(36) NOT NULL,
  template_id VARCHAR(36) NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  pr_number INT,
  pr_url VARCHAR(500),
  merged_at TIMESTAMPTZ,
  merged_by VARCHAR(255),
  gh_pr_draft BOOLEAN NULL,
  gh_pr_state VARCHAR(20) NULL,
  gh_pr_merged BOOLEAN NULL,
  gh_pr_title VARCHAR(500) NULL,
  gh_pr_updated_at TIMESTAMPTZ NULL,
  gh_pr_additions INT NULL,
  gh_pr_deletions INT NULL,
  gh_pr_changed_files INT NULL,
  gh_pr_commits INT NULL,
  gh_pr_mergeable_state VARCHAR(50) NULL,
  gh_pr_assignees JSONB NULL,
  gh_pr_labels JSONB NULL,
  gh_pr_author VARCHAR(255) NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_pr_bc UNIQUE (tracked_branch_id, template_id)
);

CREATE TABLE IF NOT EXISTS pr_automations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  repo_id VARCHAR(36) NOT NULL,
  name VARCHAR(200),
  trigger_event VARCHAR(50) NOT NULL,
  source_pattern VARCHAR(200),
  target_branch VARCHAR(200),
  action VARCHAR(50) NOT NULL,
  next_target VARCHAR(200),
  pr_title_template VARCHAR(500),
  pr_body_template TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pr_user_board_skip_branches (
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  patterns_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS pr_ai_assist_chats (
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  messages_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_pr_repos_project ON pr_repos(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_repos_user_project ON pr_repos(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_pr_tpl_project ON pr_checkpoint_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_tpl_user_project ON pr_checkpoint_templates(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_pr_track_project ON pr_tracked_branches(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_track_user_project ON pr_tracked_branches(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_pr_bc_template ON pr_branch_checkpoints(template_id);
CREATE INDEX IF NOT EXISTS idx_pr_bc_pending ON pr_branch_checkpoints(is_done, pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_bc_user ON pr_branch_checkpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_pr_auto_repo ON pr_automations(repo_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pr_auto_user_repo ON pr_automations(user_id, repo_id);
CREATE INDEX IF NOT EXISTS idx_pr_ub_skip_project ON pr_user_board_skip_branches(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_ai_chat_project ON pr_ai_assist_chats(project_id);

-- ========== BEFORE UPDATE triggers (updated_at) ==========
DROP TRIGGER IF EXISTS tr_task_statuses_updated ON task_statuses;
CREATE TRIGGER tr_task_statuses_updated BEFORE UPDATE ON task_statuses FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_task_priorities_updated ON task_priorities;
CREATE TRIGGER tr_task_priorities_updated BEFORE UPDATE ON task_priorities FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_task_types_updated ON task_types;
CREATE TRIGGER tr_task_types_updated BEFORE UPDATE ON task_types FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_task_sources_updated ON task_sources;
CREATE TRIGGER tr_task_sources_updated BEFORE UPDATE ON task_sources FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_task_link_types_updated ON task_link_types;
CREATE TRIGGER tr_task_link_types_updated BEFORE UPDATE ON task_link_types FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_users_updated ON users;
CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_users_password_updated ON users_password;
CREATE TRIGGER tr_users_password_updated BEFORE UPDATE ON users_password FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_projects_updated ON projects;
CREATE TRIGGER tr_projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_user_project_roles_updated ON user_project_roles;
CREATE TRIGGER tr_user_project_roles_updated BEFORE UPDATE ON user_project_roles FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_user_project_source_folder_updated ON user_project_source_folder;
CREATE TRIGGER tr_user_project_source_folder_updated BEFORE UPDATE ON user_project_source_folder FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_task_ticket_sequences_updated ON task_ticket_sequences;
CREATE TRIGGER tr_task_ticket_sequences_updated BEFORE UPDATE ON task_ticket_sequences FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_tasks_updated ON tasks;
CREATE TRIGGER tr_tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_wbs_master_updated ON evm_wbs_master;
CREATE TRIGGER tr_evm_wbs_master_updated BEFORE UPDATE ON evm_wbs_master FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_wbs_details_updated ON evm_wbs_details;
CREATE TRIGGER tr_evm_wbs_details_updated BEFORE UPDATE ON evm_wbs_details FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_wbs_day_unit_updated ON evm_wbs_day_unit;
CREATE TRIGGER tr_evm_wbs_day_unit_updated BEFORE UPDATE ON evm_wbs_day_unit FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_phases_updated ON evm_phases;
CREATE TRIGGER tr_evm_phases_updated BEFORE UPDATE ON evm_phases FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_wbs_updated ON evm_wbs;
CREATE TRIGGER tr_evm_wbs_updated BEFORE UPDATE ON evm_wbs FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_ac_updated ON evm_ac;
CREATE TRIGGER tr_evm_ac_updated BEFORE UPDATE ON evm_ac FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_evm_master_updated ON evm_master;
CREATE TRIGGER tr_evm_master_updated BEFORE UPDATE ON evm_master FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_commit_reviews_updated ON commit_reviews;
CREATE TRIGGER tr_commit_reviews_updated BEFORE UPDATE ON commit_reviews FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_coding_rules_updated ON coding_rules;
CREATE TRIGGER tr_coding_rules_updated BEFORE UPDATE ON coding_rules FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_ai_analysis_updated ON ai_analysis;
CREATE TRIGGER tr_ai_analysis_updated BEFORE UPDATE ON ai_analysis FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_daily_reports_updated ON daily_reports;
CREATE TRIGGER tr_daily_reports_updated BEFORE UPDATE ON daily_reports FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_user_stats_updated ON user_stats;
CREATE TRIGGER tr_user_stats_updated BEFORE UPDATE ON user_stats FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_user_daily_snapshots_updated ON user_daily_snapshots;
CREATE TRIGGER tr_user_daily_snapshots_updated BEFORE UPDATE ON user_daily_snapshots FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_ai_usage_settings_updated ON ai_usage_settings;
CREATE TRIGGER tr_ai_usage_settings_updated BEFORE UPDATE ON ai_usage_settings FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_pr_repos_updated ON pr_repos;
CREATE TRIGGER tr_pr_repos_updated BEFORE UPDATE ON pr_repos FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_pr_tracked_branches_updated ON pr_tracked_branches;
CREATE TRIGGER tr_pr_tracked_branches_updated BEFORE UPDATE ON pr_tracked_branches FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_pr_branch_checkpoints_updated ON pr_branch_checkpoints;
CREATE TRIGGER tr_pr_branch_checkpoints_updated BEFORE UPDATE ON pr_branch_checkpoints FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_pr_automations_updated ON pr_automations;
CREATE TRIGGER tr_pr_automations_updated BEFORE UPDATE ON pr_automations FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_pr_user_board_skip_branches_updated ON pr_user_board_skip_branches;
CREATE TRIGGER tr_pr_user_board_skip_branches_updated BEFORE UPDATE ON pr_user_board_skip_branches FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();
DROP TRIGGER IF EXISTS tr_pr_ai_assist_chats_updated ON pr_ai_assist_chats;
CREATE TRIGGER tr_pr_ai_assist_chats_updated BEFORE UPDATE ON pr_ai_assist_chats FOR EACH ROW EXECUTE FUNCTION task_set_updated_at();

-- ========== PHASE 2: ADD FOREIGN KEYS ==========
ALTER TABLE users_password ADD CONSTRAINT fk_users_password_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE app_admins ADD CONSTRAINT fk_app_admins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_project_roles ADD CONSTRAINT fk_upr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_project_roles ADD CONSTRAINT fk_upr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE user_project_source_folder ADD CONSTRAINT fk_upsf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_project_source_folder ADD CONSTRAINT fk_upsf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_parent FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_status FOREIGN KEY (status) REFERENCES task_statuses(code);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_priority FOREIGN KEY (priority) REFERENCES task_priorities(code);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_type FOREIGN KEY (type) REFERENCES task_types(code);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_source FOREIGN KEY (source) REFERENCES task_sources(code);
ALTER TABLE task_links ADD CONSTRAINT fk_task_links_from FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_links ADD CONSTRAINT fk_task_links_to FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_links ADD CONSTRAINT fk_task_links_type FOREIGN KEY (link_type) REFERENCES task_link_types(code);
ALTER TABLE task_favorites ADD CONSTRAINT fk_task_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE task_favorites ADD CONSTRAINT fk_task_favorites_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE commit_reviews ADD CONSTRAINT fk_commit_reviews_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE task_ticket_sequences ADD CONSTRAINT fk_tts_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_wbs ADD CONSTRAINT fk_evm_wbs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_wbs_master ADD CONSTRAINT fk_evm_wbs_master_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_wbs_details ADD CONSTRAINT fk_evm_wbs_details_master FOREIGN KEY (evm_wbs_master_id) REFERENCES evm_wbs_master(id) ON DELETE CASCADE;
ALTER TABLE evm_wbs_details ADD CONSTRAINT fk_evm_wbs_details_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_wbs_day_unit ADD CONSTRAINT fk_evm_wdu_wbs_detail FOREIGN KEY (wbs_id) REFERENCES evm_wbs_details(id) ON DELETE CASCADE;
ALTER TABLE evm_phases ADD CONSTRAINT fk_evm_phases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_ac ADD CONSTRAINT fk_evm_ac_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_master ADD CONSTRAINT fk_evm_master_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evm_ai_insight ADD CONSTRAINT fk_evm_ai_insight_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE daily_reports ADD CONSTRAINT fk_daily_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE daily_report_source_folders ADD CONSTRAINT fk_drsf_daily_report FOREIGN KEY (daily_report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
ALTER TABLE daily_report_source_folders ADD CONSTRAINT fk_drsf_upsf FOREIGN KEY (user_project_source_folder_id) REFERENCES user_project_source_folder(id) ON DELETE CASCADE;
ALTER TABLE task_notifications ADD CONSTRAINT fk_task_notifications_user FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE task_notifications ADD CONSTRAINT fk_task_notifications_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE coding_rules ADD CONSTRAINT fk_coding_rules_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE coding_rules ADD CONSTRAINT fk_coding_rules_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_stats ADD CONSTRAINT fk_user_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_achievements ADD CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_badge_display ADD CONSTRAINT fk_user_badge_display_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_daily_snapshots ADD CONSTRAINT fk_user_daily_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_repos ADD CONSTRAINT fk_pr_repos_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_repos ADD CONSTRAINT fk_pr_repos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT fk_pr_tpl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT fk_pr_tpl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_repo FOREIGN KEY (repo_id) REFERENCES pr_repos(id) ON DELETE CASCADE;
ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_branch FOREIGN KEY (tracked_branch_id) REFERENCES pr_tracked_branches(id) ON DELETE CASCADE;
ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_template FOREIGN KEY (template_id) REFERENCES pr_checkpoint_templates(id) ON DELETE CASCADE;
ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_automations ADD CONSTRAINT fk_pr_auto_repo FOREIGN KEY (repo_id) REFERENCES pr_repos(id) ON DELETE CASCADE;
ALTER TABLE pr_automations ADD CONSTRAINT fk_pr_auto_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_user_board_skip_branches ADD CONSTRAINT fk_pr_ub_skip_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_user_board_skip_branches ADD CONSTRAINT fk_pr_ub_skip_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_ai_assist_chats ADD CONSTRAINT fk_pr_ai_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pr_ai_assist_chats ADD CONSTRAINT fk_pr_ai_chat_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Existing databases: ensure omitted-version inserts and imports get a defined default
ALTER TABLE users_password ALTER COLUMN version SET DEFAULT 1;
UPDATE users_password SET version = 1 WHERE version IS NULL;
ALTER TABLE tasks ALTER COLUMN version SET DEFAULT 1;
UPDATE tasks SET version = 1 WHERE version IS NULL;
ALTER TABLE projects ALTER COLUMN version SET DEFAULT 1;
UPDATE projects SET version = 1 WHERE version IS NULL;
ALTER TABLE user_project_roles ALTER COLUMN version SET DEFAULT 1;
UPDATE user_project_roles SET version = 1 WHERE version IS NULL;
