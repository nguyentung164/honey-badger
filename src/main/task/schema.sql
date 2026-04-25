-- Task Management Schema (MySQL)
-- Phase 1: Tạo bảng KHÔNG có FK. Phase 2: Thêm FK bằng ALTER TABLE.
-- Cách này tránh lỗi 1215, không phụ thuộc SET FOREIGN_KEY_CHECKS.

-- ========== PHASE 1: CREATE TABLES (no FK) ==========
CREATE TABLE IF NOT EXISTS task_statuses (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_priorities (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_types (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_sources (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_link_types (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  user_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  avatar_data LONGTEXT NULL COMMENT 'Base64 PNG, dùng data URL khi hiển thị',
  receive_commit_notification BOOLEAN DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users_password (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_admins (
  user_id VARCHAR(36) PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_project_roles (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NULL,
  project_id_uk VARCHAR(36) GENERATED ALWAYS AS (COALESCE(project_id, '___GLOBAL___')) VIRTUAL NOT NULL,
  role ENUM('dev', 'pl', 'pm') NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_project_role (user_id, project_id_uk, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_project_source_folder (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  source_folder_path VARCHAR(500) NOT NULL,
  source_folder_name VARCHAR(255) NULL COMMENT 'Tên hiển thị, lấy từ local store khi add',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_path (user_id, source_folder_path),
  UNIQUE KEY uk_user_project_path (user_id, project_id, source_folder_path),
  INDEX idx_upsf_source_folder_path (source_folder_path(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_ticket_sequences (
  project_id VARCHAR(36) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'in_app',
  next_value INT NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  ticket_id VARCHAR(100) NOT NULL,
  plan_start_date DATETIME,
  plan_end_date DATETIME,
  actual_start_date DATETIME,
  actual_end_date DATETIME,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  parent_id VARCHAR(36) NULL,
  UNIQUE KEY uk_task_project_source_ticket (project_id, source, ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_links (
  id VARCHAR(36) PRIMARY KEY,
  from_task_id VARCHAR(36) NOT NULL,
  to_task_id VARCHAR(36) NOT NULL,
  link_type VARCHAR(50) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_link (from_task_id, to_task_id, link_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_favorites (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_favorite_user_task (user_id, task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evm_wbs_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evm_wbs_details (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  evm_wbs_master_id VARCHAR(36) NOT NULL,
  no INT NOT NULL DEFAULT 0,
  phase VARCHAR(100),
  category VARCHAR(200),
  feature VARCHAR(200),
  task VARCHAR(500),
  duration_days INT UNSIGNED NULL,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evm_wbs_details_project (project_id),
  INDEX idx_evm_wbs_details_master (evm_wbs_master_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evm_wbs_day_unit (
  id VARCHAR(36) PRIMARY KEY,
  wbs_id VARCHAR(36) NOT NULL,
  work_date DATE NOT NULL,
  unit DECIMAL(12,4) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_evm_wdu_wbs_date (wbs_id, work_date),
  INDEX idx_evm_wdu_wbs (wbs_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evm_phases (
  project_id VARCHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, code),
  INDEX idx_evm_phases_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  duration_days INT UNSIGNED NULL,
  predecessor VARCHAR(500) NULL,
  effort DECIMAL(15,4) NULL,
  est_md DECIMAL(15,4) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evm_wbs_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evm_ac_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bản DB cũ còn cột assignees: ALTER TABLE evm_master DROP COLUMN assignees;
CREATE TABLE IF NOT EXISTS evm_master (
  project_id VARCHAR(36) PRIMARY KEY,
  phases JSON NOT NULL,
  statuses JSON NOT NULL,
  non_working_days JSON NOT NULL,
  hours_per_day DECIMAL(6,2) NOT NULL DEFAULT 8,
  phase_report_notes JSON NULL,
  assignee_report_notes JSON NULL,
  percent_done_options JSON NULL,
  issue_import_map JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evm_ai_insight (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  insight_type VARCHAR(64) NOT NULL,
  output_markdown LONGTEXT NOT NULL,
  input_payload_json MEDIUMTEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evm_ai_insight_project_type_created (project_id, insight_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commit_reviews (
  id VARCHAR(36) PRIMARY KEY,
  source_folder_path VARCHAR(500) NOT NULL,
  commit_id VARCHAR(100) NOT NULL,
  vcs_type VARCHAR(10) NOT NULL,
  reviewed_at DATETIME NOT NULL,
  reviewer_user_id VARCHAR(36) NULL,
  note TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_commit_review (source_folder_path, commit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coding_rules (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  project_id VARCHAR(36) NULL COMMENT 'NULL = global (admin), NOT NULL = project-specific (PL)',
  project_id_uk VARCHAR(36) GENERATED ALWAYS AS (COALESCE(project_id, '___GLOBAL___')) VIRTUAL NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name_project (name, project_id_uk),
  INDEX idx_coding_rules_project (project_id),
  INDEX idx_coding_rules_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commit_message_history (
  date VARCHAR(50) PRIMARY KEY,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_analysis (
  source_folder_path VARCHAR(500) PRIMARY KEY,
  source_folder_name VARCHAR(255),
  analysis_date VARCHAR(50),
  analysis_result JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_analysis_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_folder_path VARCHAR(500),
  source_folder_name VARCHAR(255),
  analysis_date VARCHAR(50),
  timestamp BIGINT,
  total_commits INT,
  date_range VARCHAR(100) NULL,
  analysis_result JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_analysis_history_source (source_folder_path),
  INDEX idx_ai_analysis_history_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS git_commit_queue (
  commit_hash VARCHAR(40) PRIMARY KEY,
  commit_user VARCHAR(255),
  commit_time VARCHAR(50),
  commit_message TEXT,
  added_files JSON,
  modified_files JSON,
  deleted_files JSON,
  has_check_coding_rule BOOLEAN DEFAULT FALSE,
  has_check_spotbugs BOOLEAN DEFAULT FALSE,
  branch_name VARCHAR(255) NULL,
  insertions INT NULL,
  deletions INT NULL,
  changes INT NULL,
  source_folder_path VARCHAR(500) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_git_cq_created_at (created_at),
  INDEX idx_git_cq_commit_user (commit_user(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_reports (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_ids JSON NULL COMMENT 'Array of project IDs',
  report_date DATE NOT NULL,
  work_description TEXT,
  selected_commits JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_report_source_folders (
  daily_report_id VARCHAR(36) NOT NULL,
  user_project_source_folder_id VARCHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (daily_report_id, user_project_source_folder_id),
  INDEX idx_drsf_upsf (user_project_source_folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_notifications (
  id VARCHAR(36) PRIMARY KEY,
  target_user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'assign, done, review, feedback, deadline_overdue, deadline_today, deadline_tomorrow',
  title VARCHAR(500) NOT NULL,
  body TEXT,
  task_id VARCHAR(36) NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target_unread (target_user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_projects_reminder ON projects(daily_report_reminder_time);
CREATE INDEX idx_upr_user ON user_project_roles(user_id);
CREATE INDEX idx_upr_project ON user_project_roles(project_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee_user ON tasks(assignee_user_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_plan_end_date ON tasks(plan_end_date);
CREATE INDEX idx_tasks_actual_end_date ON tasks(actual_end_date);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_task_links_from ON task_links(from_task_id);
CREATE INDEX idx_task_links_to ON task_links(to_task_id);
CREATE INDEX idx_task_favorites_user ON task_favorites(user_id);
CREATE INDEX idx_task_favorites_task ON task_favorites(task_id);
CREATE INDEX idx_commit_reviews_source ON commit_reviews(source_folder_path);
CREATE INDEX idx_commit_reviews_reviewer ON commit_reviews(reviewer_user_id);
CREATE INDEX idx_commit_reviews_source_reviewed ON commit_reviews(source_folder_path, reviewed_at);
CREATE INDEX idx_daily_reports_date ON daily_reports(report_date);

INSERT IGNORE INTO task_statuses (code, name, sort_order, color) VALUES
  ('new', 'New', 1, '#0ea5e9'),
  ('in_progress', 'In Progress', 2, '#f59e0b'),
  ('in_review', 'In Review', 3, '#d946ef'),
  ('fixed', 'Fixed', 4, '#14b8a6'),
  ('feedback', 'Feedback', 5, '#f97316'),
  ('cancelled', 'Cancelled', 6, '#dc2626'),
  ('done', 'Done', 7, '#10b981');

INSERT IGNORE INTO task_priorities (code, name, sort_order, color) VALUES
  ('critical', 'Critical', 1, '#dc2626'),
  ('high', 'High', 2, '#ea580c'),
  ('medium', 'Medium', 3, '#64748b'),
  ('low', 'Low', 4, '#0ea5e9');

-- DB đã có từ trước: chạy một lần nếu thiếu — INSERT IGNORE INTO task_types (code, name, sort_order, color) VALUES ('support','Support',3,'#0d9488'),('task','Task',4,'#3b82f6');
INSERT IGNORE INTO task_types (code, name, sort_order, color) VALUES
  ('bug', 'Bug', 1, '#f59e0b'),
  ('feature', 'Feature', 2, '#8b5cf6'),
  ('support', 'Support', 3, '#0d9488'),
  ('task', 'Task', 4, '#3b82f6');

INSERT IGNORE INTO task_sources (code, name, sort_order) VALUES
  ('in_app', 'In App', 1),
  ('redmine', 'Redmine', 2);

INSERT IGNORE INTO task_link_types (code, name, sort_order) VALUES
  ('blocks', 'Blocks', 1),
  ('blocked_by', 'Blocked By', 2),
  ('relates_to', 'Relates To', 3),
  ('duplicates', 'Duplicates', 4);

-- Default admin user: user_code=admin, password=System@123
INSERT IGNORE INTO users (id, user_code, name, email) VALUES
  ('00000000-0000-0000-0000-000000000000', 'admin', 'Admin', 'admin@localhost');

INSERT IGNORE INTO users_password (id, user_id, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '$2b$10$IFrJ/ul4lT4kiFo29uQS3.UHq6WgijJwZO6g06dN6.lUiOGn1HsLW');

INSERT IGNORE INTO app_admins (user_id) VALUES ('00000000-0000-0000-0000-000000000000');

-- ========== ACHIEVEMENT SYSTEM TABLES ==========
CREATE TABLE IF NOT EXISTS achievements (
  code VARCHAR(100) PRIMARY KEY,
  category ENUM('task','git','review','report','quality','streak','negative') NOT NULL,
  tier ENUM('bronze','silver','gold','special','negative') NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(50) NOT NULL,
  xp_reward INT DEFAULT 0,
  is_repeatable BOOLEAN DEFAULT FALSE,
  condition_type VARCHAR(100) NOT NULL,
  condition_threshold INT NULL,
  is_negative BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievements (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  achievement_code VARCHAR(100) NOT NULL,
  earned_count INT DEFAULT 1,
  first_earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_redeemed BOOLEAN DEFAULT FALSE,
  UNIQUE KEY uk_user_ach (user_id, achievement_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_badge_display (
  user_id VARCHAR(36) NOT NULL,
  achievement_code VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, achievement_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_user_stats_rank ON user_stats(current_rank);
CREATE INDEX idx_user_stats_xp ON user_stats(xp DESC);
CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_code ON user_achievements(achievement_code);

CREATE TABLE IF NOT EXISTS user_daily_snapshots (
  id                        VARCHAR(36)    PRIMARY KEY,
  user_id                   VARCHAR(36)    NOT NULL,
  snapshot_date             DATE           NOT NULL,
  commits_count             INT            DEFAULT 0,
  lines_inserted            INT            DEFAULT 0,
  lines_deleted             INT            DEFAULT 0,
  files_changed             INT            DEFAULT 0,
  commits_with_rule_check   INT            DEFAULT 0,
  commits_with_spotbugs     INT            DEFAULT 0,
  commits_total_in_queue    INT            DEFAULT 0,
  tasks_done                INT            DEFAULT 0,
  tasks_done_on_time        INT            DEFAULT 0,
  tasks_overdue_opened      INT            DEFAULT 0,
  reviews_done              INT            DEFAULT 0,
  has_daily_report          TINYINT(1)     DEFAULT 0,
  evm_hours_logged          DECIMAL(6,2)   DEFAULT 0,
  created_at                DATETIME       DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME       ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, snapshot_date),
  INDEX idx_user_year (user_id, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_mail_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  smtp_server VARCHAR(512) NOT NULL DEFAULT '',
  port VARCHAR(32) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_onedrive_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  client_id VARCHAR(512) NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_task_database_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  host VARCHAR(512) NOT NULL DEFAULT '',
  port VARCHAR(32) NOT NULL DEFAULT '3306',
  db_user VARCHAR(255) NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  database_name VARCHAR(128) NOT NULL DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id VARCHAR(36) PRIMARY KEY,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  feature VARCHAR(64) NOT NULL,
  provider ENUM('openai', 'claude', 'google') NOT NULL,
  model VARCHAR(128) NOT NULL,
  input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  cached_input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  cost_usd DECIMAL(18, 8) NULL,
  pricing_known BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX idx_ai_usage_created (created_at),
  INDEX idx_ai_usage_feature (feature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  display_currency ENUM('USD', 'VND', 'JPY') NOT NULL DEFAULT 'USD',
  fx_usd_to_vnd DECIMAL(24, 8) NULL,
  fx_usd_to_jpy DECIMAL(24, 8) NULL,
  fx_updated_at BIGINT NULL COMMENT 'Unix epoch ms',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO ai_usage_settings (id) VALUES (1);

-- ========== PR MANAGER TABLES ==========
CREATE TABLE IF NOT EXISTS pr_repos (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  local_path VARCHAR(500),
  remote_url VARCHAR(500) NOT NULL,
  hosting VARCHAR(20) NOT NULL DEFAULT 'github',
  owner VARCHAR(200) NOT NULL,
  repo VARCHAR(200) NOT NULL,
  default_base_branch VARCHAR(200) DEFAULT 'stage',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pr_repos_owner_repo (project_id, owner, repo),
  INDEX idx_pr_repos_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pr_checkpoint_templates (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  target_branch VARCHAR(200),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pr_tpl_code (project_id, code),
  INDEX idx_pr_tpl_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pr_tracked_branches (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  repo_id VARCHAR(36) NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  assignee_user_id VARCHAR(36),
  status VARCHAR(50) DEFAULT 'Staged',
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uk_pr_track (repo_id, branch_name),
  INDEX idx_pr_track_project (project_id),
  INDEX idx_pr_track_assignee (assignee_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pr_branch_checkpoints (
  id VARCHAR(36) PRIMARY KEY,
  tracked_branch_id VARCHAR(36) NOT NULL,
  template_id VARCHAR(36) NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  pr_number INT,
  pr_url VARCHAR(500),
  merged_at DATETIME,
  merged_by VARCHAR(255),
  gh_pr_draft TINYINT(1) NULL COMMENT 'GitHub draft (open only)',
  gh_pr_state VARCHAR(20) NULL COMMENT 'open|closed t\u1eeb API',
  gh_pr_merged TINYINT(1) NULL COMMENT 'merged theo API',
  gh_pr_title VARCHAR(500) NULL,
  gh_pr_updated_at DATETIME NULL,
  gh_pr_additions INT NULL,
  gh_pr_deletions INT NULL,
  gh_pr_changed_files INT NULL,
  gh_pr_mergeable_state VARCHAR(50) NULL,
  gh_pr_assignees JSON NULL,
  gh_pr_labels JSON NULL,
  gh_pr_author VARCHAR(255) NULL COMMENT 'GitHub login ngu\u1eddi t\u1ea1o PR',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pr_bc (tracked_branch_id, template_id),
  INDEX idx_pr_bc_template (template_id),
  INDEX idx_pr_bc_pending (is_done, pr_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pr_automations (
  id VARCHAR(36) PRIMARY KEY,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pr_auto_repo (repo_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
ALTER TABLE integration_mail_settings ADD CONSTRAINT fk_integration_mail_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE integration_onedrive_settings ADD CONSTRAINT fk_integration_onedrive_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE integration_task_database_settings ADD CONSTRAINT fk_integration_taskdb_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pr_repos ADD CONSTRAINT fk_pr_repos_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_checkpoint_templates ADD CONSTRAINT fk_pr_tpl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_repo FOREIGN KEY (repo_id) REFERENCES pr_repos(id) ON DELETE CASCADE;
ALTER TABLE pr_tracked_branches ADD CONSTRAINT fk_pr_track_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_branch FOREIGN KEY (tracked_branch_id) REFERENCES pr_tracked_branches(id) ON DELETE CASCADE;
ALTER TABLE pr_branch_checkpoints ADD CONSTRAINT fk_pr_bc_template FOREIGN KEY (template_id) REFERENCES pr_checkpoint_templates(id) ON DELETE CASCADE;
ALTER TABLE pr_automations ADD CONSTRAINT fk_pr_auto_repo FOREIGN KEY (repo_id) REFERENCES pr_repos(id) ON DELETE CASCADE;
