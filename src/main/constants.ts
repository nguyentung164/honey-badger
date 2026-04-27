export const IPC = {
  APP_LOGS: { READ: 'app-logs:read' },
  WINDOW: {
    ACTION: 'window:action',
    APP_LOGS: 'window:app-logs',
    DASHBOARD: 'window:dashboard',
    TASK_MANAGEMENT: 'window:task-management',
    DIFF_WINDOWS: 'window:diff-windows',
    REQUEST_DIFF_DATA: 'window:request-diff-data',
    REQUEST_CONFLICT_RESOLVER_DATA: 'window:request-conflict-resolver-data',
    SHOW_LOG: 'window:show-log',
    CHECK_CODING_RULES: 'window:check-coding-rules',
    SPOTBUGS: 'window:spotbugs',
    COMMIT_MESSAGE_HISTORY: 'window:commit-message-history',
    MERGE_SVN: 'window:merge-svn',
    SHOW_GIT_BLAME: 'window:show-git-blame',
    CONFLICT_RESOLVER: 'window:conflict-resolver',
    NOTIFY_CONFLICT_RESOLVED: 'window:notify-conflict-resolved',
    EVM_TOOL: 'window:evm-tool',
    DAILY_REPORT: 'window:daily-report',
    MASTER: 'window:master',
    PROGRESS: 'window:progress',
    TEAM_PROGRESS: 'window:team-progress',
    REPORT_MANAGER: 'window:report-manager',
    PR_MANAGER: 'window:pr-manager',
    PR_MANAGER_CLOSE: 'window:pr-manager-close',
    PR_MANAGER_DOCK_REQUEST: 'window:pr-manager-dock-request',
  },
  CONFIG_UPDATED: 'config-updated',
  FILES_CHANGED: 'files-changed',
  VCS: {
    SVN_LIST_USERS: 'vcs:svn:list-users',
    SVN_REMOVE_CREDENTIAL: 'vcs:svn:remove-credential',
    GIT_GET_CONFIG: 'vcs:git:get-config',
    GIT_SET_CONFIG: 'vcs:git:set-config',
    GIT_LIST_CREDENTIALS: 'vcs:git:list-credentials',
    GIT_REMOVE_CREDENTIAL: 'vcs:git:remove-credential',
  },
  SETTING: {
    APPEARANCE: {
      SET: 'setting:appearance:set',
    },
    CONFIGURATION: {
      GET: 'setting:configuration:get',
      SET: 'setting:configuration:set',
      PATCH: 'setting:configuration:patch',
      /** Merge partial + resetPool; không broadcast CONFIG_UPDATED (tránh renderer reload Zustand khi chỉ sync Task DB). */
      PATCH_SILENT: 'setting:configuration:patch-silent',
    },
    SET_MULTIREPO_WATCH_PATHS: 'setting:set-multirepo-watch-paths',
    MAIL_SERVER: {
      GET: 'setting:mail-server:get',
      SET: 'setting:mail-server:set',
      TEST: 'setting:mail-server:test',
    },
    WEBHOOK: {
      GET: 'setting:webhook:get',
      SET: 'setting:webhook:set',
      TEST: 'setting:webhook:test',
    },
    EXTERNAL_EDITOR: {
      GET: 'setting:external-editor:get',
      SET: 'setting:external-editor:set',
    },
    CONFIG: {
      EXPORT: 'setting:config:export',
      IMPORT: 'setting:config:import',
    },
  },
  SVN: {
    CHANGED_FILES: 'svn:changed-files',
    GET_DIFF: 'svn:get-diff',
    OPEN_DIFF: 'svn:open-diff',
    FIND_USER: 'svn:find-user',
    COMMIT: 'svn:commit',
    INFO: 'svn:info',
    GET_CURRENT_REVISION: 'svn:get-current-revision',
    INFO_STREAM: 'svn:info:stream',
    INFO_WITH_STREAM: 'svn:info-with-stream',
    CAT: 'svn:cat',
    BLAME: 'svn:blame',
    REVERT: 'svn:revert',
    CLEANUP: 'svn:cleanup',
    LOG: 'svn:log',
    UPDATE: 'svn:update',
    UPDATE_STREAM: 'svn:update:stream',
    COMMIT_STREAM: 'svn:commit:stream',
    STATISTICS: 'svn:statistics',
    MERGE: 'svn:merge',
    MERGE_RESOLVE_CONFLICT: 'svn:merge-resolve-conflict',
    MERGE_CREATE_SNAPSHOT: 'svn:merge-create-snapshot',
    MERGE_GET_COMMITS: 'svn:merge-get-commits',
    GET_CONFLICT_STATUS: 'svn:get-conflict-status',
    GET_CONFLICT_DETAIL: 'svn:get-conflict-detail',
    RESOLVE_CONFLICT_WITH_CONTENT: 'svn:resolve-conflict-with-content',
  },
  GIT: {
    LOG: 'git:log',
    LOG_GRAPH: 'git:log-graph',
    GET_COMMIT_FILES: 'git:get-commit-files',
    STATUS: 'git:status',
    COMMIT: 'git:commit',
    GITLEAKS_SCAN_STAGED: 'git:gitleaks-scan-staged',
    UNDO_COMMIT: 'git:undo-commit',
    GET_DIFF: 'git:get-diff',
    GET_STAGED_DIFF: 'git:get-staged-diff',
    GET_COMMIT_DIFF: 'git:get-commit-diff',
    GET_PARENT_COMMIT: 'git:get-parent-commit',
    CAT: 'git:cat',
    OPEN_DIFF: 'git:open-diff',
    REVERT: 'git:revert',
    DISCARD_CHANGES: 'git:discardChanges',
    DISCARD_FILES: 'git:discardFiles',
    RESET_STAGED: 'git:reset-staged',
    ADD: 'git:add',
    GET_BRANCHES: 'git:get-branches',
    CREATE_BRANCH: 'git:create-branch',
    CHECKOUT_BRANCH: 'git:checkout-branch',
    DELETE_BRANCH: 'git:delete-branch',
    RENAME_BRANCH: 'git:rename-branch',
    PUSH: 'git:push',
    PULL: 'git:pull',
    PULL_STREAM: 'git:pull:stream',
    COMMIT_STREAM: 'git:commit:stream',
    PUSH_STREAM: 'git:push:stream',
    FETCH: 'git:fetch',
    FETCH_STREAM: 'git:fetch:stream',
    /** Chỉ fetch cập nhật một nhánh local từ remote (refspec branch:branch). */
    FETCH_UPDATE_LOCAL_BRANCH: 'git:fetch-update-local-branch',
    GET_REMOTES: 'git:get-remotes',
    CHECK_FOR_UPDATES: 'git:check-for-updates',
    // Stash operations
    STASH: 'git:stash',
    STASH_LIST: 'git:stash-list',
    STASH_POP: 'git:stash-pop',
    STASH_APPLY: 'git:stash-apply',
    STASH_DROP: 'git:stash-drop',
    STASH_CLEAR: 'git:stash-clear',
    STASH_SHOW: 'git:stash-show',
    STASH_SHOW_FILES: 'git:stash-show-files',
    STASH_SHOW_FILE_DIFF: 'git:stash-show-file-diff',
    STASH_SHOW_FILE_CONTENT: 'git:stash-show-file-content',
    STASH_IS_LIKELY_APPLIED: 'git:stash-is-likely-applied',
    STASH_BRANCH: 'git:stash-branch',
    // Merge operations
    MERGE: 'git:merge',
    ABORT_MERGE: 'git:abort-merge',
    RESOLVE_CONFLICT: 'git:resolve-conflict',
    GET_MERGE_STATUS: 'git:get-merge-status',
    // Clone / Init
    CLONE: 'git:clone',
    INIT: 'git:init',
    // Remote management
    DELETE_REMOTE_BRANCH: 'git:delete-remote-branch',
    ADD_REMOTE: 'git:add-remote',
    REMOVE_REMOTE: 'git:remove-remote',
    SET_REMOTE_URL: 'git:set-remote-url',
    // Cherry-pick operations
    CHERRY_PICK: 'git:cherry-pick',
    ABORT_CHERRY_PICK: 'git:abort-cherry-pick',
    CONTINUE_CHERRY_PICK: 'git:continue-cherry-pick',
    GET_CONFLICT_STATUS: 'git:get-conflict-status',
    READ_CONFLICT_WORKING_CONTENT: 'git:read-conflict-working-content',
    // Reset operations
    RESET: 'git:reset',
    // Rebase operations
    REBASE: 'git:rebase',
    CONTINUE_REBASE: 'git:continue-rebase',
    ABORT_REBASE: 'git:abort-rebase',
    GET_REBASE_STATUS: 'git:get-rebase-status',
    // Tag operations
    CREATE_TAG: 'git:create-tag',
    LIST_TAGS: 'git:list-tags',
    LIST_REMOTE_TAGS: 'git:list-remote-tags',
    DELETE_TAG: 'git:delete-tag',
    PUSH_TAG: 'git:push-tag',
    // Blame operation
    BLAME: 'git:blame',
    // Statistics operation
    STATISTICS: 'git:statistics',
    // Hooks operations
    HOOKS_GET: 'git:hooks-get',
    HOOK_GET_CONTENT: 'git:hook-get-content',
    HOOK_SET_CONTENT: 'git:hook-set-content',
    HOOK_DELETE: 'git:hook-delete',
    HOOK_ENABLE: 'git:hook-enable',
    HOOK_DISABLE: 'git:hook-disable',
    HOOK_GET_SAMPLE: 'git:hook-get-sample',
    // Interactive rebase
    GET_INTERACTIVE_REBASE_COMMITS: 'git:get-interactive-rebase-commits',
    START_INTERACTIVE_REBASE: 'git:start-interactive-rebase',
  },
  OPENAI: {
    SEND_MESSAGE: 'openai:send-message',
  },
  AI_USAGE: {
    GET_SUMMARY: 'ai-usage:get-summary',
    CLEAR: 'ai-usage:clear',
    FETCH_EXCHANGE_RATES: 'ai-usage:fetch-exchange-rates',
    GET_EXCHANGE_STATE: 'ai-usage:get-exchange-state',
    SET_DISPLAY_CURRENCY: 'ai-usage:set-display-currency',
  },
  NOTIFICATIONS: {
    SEND_MAIL: 'notification:send-mail',
    SEND_TEAMS: 'notification:send-teams',
    SEND_SUPPORT_FEEDBACK: 'notification:send-support-feedback',
  },
  SYSTEM: {
    OPEN_FOLDER: 'system:open-folder',
    OPEN_FOLDER_IN_EXPLORER: 'system:open-folder-in-explorer',
    REVEAL_IN_FILE_EXPLORER: 'system:reveal-in-file-explorer',
    OPEN_EXTERNAL_URL: 'system:open-external-url',
    READ_FILE: 'system:read-file',
    WRITE_FILE: 'system:write-file',
    DETECT_VERSION_CONTROL: 'system:detect-version-control',
    GET_VERSION_CONTROL_DETAILS: 'system:get-version-control-details',
    OPEN_IN_EXTERNAL_EDITOR: 'system:open-in-external-editor',
    OPEN_TERMINAL: 'system:open-terminal',
    SELECT_AUDIO_FILE: 'system:select-audio-file',
    GET_NOTIFICATION_SOUND_URL: 'system:get-notification-sound-url',
    GET_DEFAULT_NOTIFICATION_SOUND_URL: 'system:get-default-notification-sound-url',
  },
  UPDATER: {
    CHECK_FOR_UPDATES: 'updater:check-for-updates',
    INSTALL_UPDATES: 'updater:install-updates',
    GET_VERSION: 'updater:get-version',
    STATUS: 'updater:status',
  },
  HISTORY: {
    GET: 'history:get',
    SET: 'history:set',
  },
  DASHBOARD: {
    GET_REPO_SUMMARY: 'dashboard:get-repo-summary',
    GET_COMMIT_ACTIVITY: 'dashboard:get-commit-activity',
    GET_CHART_DATA: 'dashboard:get-chart-data',
  },
  USER: {
    LOGIN: 'user:login',
    LOGOUT: 'user:logout',
    VERIFY: 'user:verify',
    GET_CURRENT_USER: 'user:get-current-user',
    CHANGE_PASSWORD: 'user:change-password',
    SET_USER_PASSWORD: 'user:set-user-password',
    GET_USER_ROLES: 'user:get-user-roles',
    SET_USER_PROJECT_ROLE: 'user:set-user-project-role',
    REMOVE_USER_PROJECT_ROLE: 'user:remove-user-project-role',
    GET_USERS: 'user:get-users',
    CREATE_USER: 'user:create-user',
    UPDATE_USER: 'user:update-user',
    DELETE_USER: 'user:delete-user',
    SELECT_AVATAR_FILE: 'user:select-avatar-file',
    READ_AVATAR_FILE_AS_DATA_URL: 'user:read-avatar-file-as-data-url',
    UPLOAD_AVATAR: 'user:upload-avatar',
    GET_AVATAR_URL: 'user:get-avatar-url',
  },
  MASTER: {
    GET_STATUSES_ALL: 'master:get-statuses-all',
    GET_PRIORITIES_ALL: 'master:get-priorities-all',
    GET_TYPES_ALL: 'master:get-types-all',
    GET_SOURCES_ALL: 'master:get-sources-all',
    GET_TASK_LINK_TYPES_ALL: 'master:get-task-link-types-all',
    CREATE_STATUS: 'master:create-status',
    UPDATE_STATUS: 'master:update-status',
    DELETE_STATUS: 'master:delete-status',
    CREATE_PRIORITY: 'master:create-priority',
    UPDATE_PRIORITY: 'master:update-priority',
    DELETE_PRIORITY: 'master:delete-priority',
    CREATE_TYPE: 'master:create-type',
    UPDATE_TYPE: 'master:update-type',
    DELETE_TYPE: 'master:delete-type',
    CREATE_SOURCE: 'master:create-source',
    UPDATE_SOURCE: 'master:update-source',
    DELETE_SOURCE: 'master:delete-source',
  },
  TASK: {
    GET_PROJECT_MEMBERS: 'task:get-project-members',
    GET_REMINDER_STATS: 'task:get-reminder-stats',
    SEND_DEADLINE_REMINDERS: 'task:send-deadline-reminders',
    GET_ALL: 'task:get-all',
    /** Phân trang + tìm kiếm cho combobox chọn task (sub-task / link) */
    LIST_FOR_PICKER_PAGE: 'task:list-for-picker-page',
    /** Task Management: lọc + sort + phân trang + facet counts */
    LIST_FOR_MANAGEMENT: 'task:list-for-management',
    LIST_FOR_MANAGEMENT_CHARTS: 'task:list-for-management-charts',
    GET_MANAGEMENT_SCOPE_META: 'task:get-management-scope-meta',
    GET_TASK: 'task:get-task',
    CREATE: 'task:create',
    UPDATE_STATUS: 'task:update-status',
    UPDATE_PROGRESS: 'task:update-progress',
    UPDATE_DATES: 'task:update-dates',
    UPDATE_TASK: 'task:update-task',
    DELETE_TASK: 'task:delete-task',
    CAN_EDIT_TASK: 'task:can-edit-task',
    ASSIGN: 'task:assign',
    CHECK_ONEDRIVE: 'task:check-onedrive',
    CHECK_TASK_API: 'task:check-task-api',
    CHECK_TASK_SCHEMA_APPLIED: 'task:check-task-schema-applied',
    INIT_TASK_SCHEMA: 'task:init-schema',
    SELECT_CSV_FILE: 'task:select-csv-file',
    IMPORT_REDMINE_CSV: 'task:import-redmine-csv',
    GET_PROJECTS: 'task:get-projects',
    GET_PROJECTS_FOR_TASK_UI: 'task:get-projects-for-task-ui',
    CREATE_PROJECT: 'task:create-project',
    UPDATE_PROJECT: 'task:update-project',
    GET_PROJECT_REMINDER_TIME: 'task:get-project-reminder-time',
    UPDATE_PROJECT_REMINDER_TIME: 'task:update-project-reminder-time',
    DELETE_PROJECT: 'task:delete-project',
    GET_TASK_CHILDREN: 'task:get-task-children',
    CREATE_TASK_CHILD: 'task:create-task-child',
    GET_TASK_LINKS: 'task:get-task-links',
    CREATE_TASK_LINK: 'task:create-task-link',
    DELETE_TASK_LINK: 'task:delete-task-link',
    NOTIFICATION: 'task:notification',
    COMMIT_REVIEW_SAVE: 'task:commit-review:save',
    COMMIT_REVIEW_DELETE: 'task:commit-review:delete',
    COMMIT_REVIEW_GET: 'task:commit-review:get',
    COMMIT_REVIEW_GET_ALL_BY_SOURCE: 'task:commit-review:get-all-by-source',
    COMMIT_REVIEW_GET_REVIEWED_IDS: 'task:commit-review:get-reviewed-ids',
    GET_FAVORITE_TASK_IDS: 'task:get-favorite-task-ids',
    ADD_TASK_FAVORITE: 'task:add-task-favorite',
    REMOVE_TASK_FAVORITE: 'task:remove-task-favorite',
    COPY_TASK: 'task:copy-task',
    UPSERT_USER_PROJECT_SOURCE_FOLDER: 'task:upsert-user-project-source-folder',
    GET_USER_PROJECT_SOURCE_FOLDER_MAPPINGS: 'task:get-user-project-source-folder-mappings',
    GET_SOURCE_FOLDERS_BY_PROJECT: 'task:get-source-folders-by-project',
    GET_SOURCE_FOLDERS_BY_PROJECTS: 'task:get-source-folders-by-projects',
    GET_PROJECTS_FOR_USER: 'task:get-projects-for-user',
    GET_PROJECTS_FOR_LEADERBOARD_PICKER: 'task:get-projects-for-leaderboard-picker',
    DELETE_USER_PROJECT_SOURCE_FOLDER: 'task:delete-user-project-source-folder',
    GET_PROJECT_ID_BY_USER_AND_PATH: 'task:get-project-id-by-user-and-path',
    HAS_PL_ROLE: 'task:has-pl-role',
    CODING_RULE_GET_FOR_SELECTION: 'task:coding-rule:get-for-selection',
    CODING_RULE_GET_GLOBAL_ONLY: 'task:coding-rule:get-global-only',
    CODING_RULE_GET_CONTENT: 'task:coding-rule:get-content',
    CODING_RULE_CREATE: 'task:coding-rule:create',
    CODING_RULE_UPDATE: 'task:coding-rule:update',
    CODING_RULE_DELETE: 'task:coding-rule:delete',
    CODING_RULE_GET_FOR_MANAGEMENT: 'task:coding-rule:get-for-management',
    INTEGRATIONS_GET_FOR_SETTINGS: 'task:integrations:get-for-settings',
    INTEGRATIONS_SAVE: 'task:integrations:save',
  },
  COMMIT_MESSAGE_HISTORY: {
    GET: 'commit-message-history:get',
    ADD: 'commit-message-history:add',
  },
  DAILY_REPORT: {
    SAVE: 'daily-report:save',
    GET_MINE: 'daily-report:get-mine',
    GET_COMMITS_TODAY: 'daily-report:get-commits-today',
    GET_COMMITS_TODAY_MULTIPLE: 'daily-report:get-commits-today-multiple',
    LIST_FOR_PL: 'daily-report:list-for-pl',
    LIST_FOR_PL_BY_DATE_RANGE: 'daily-report:list-for-pl-by-date-range',
    GET_DETAIL: 'daily-report:get-detail',
    GET_MY_HISTORY: 'daily-report:get-my-history',
    GET_STATISTICS: 'daily-report:get-statistics',
    GET_STATISTICS_BY_DATE_RANGE: 'daily-report:get-statistics-by-date-range',
  },
  AI_ANALYSIS: {
    SAVE: 'ai-analysis:save',
    GET: 'ai-analysis:get',
    DELETE: 'ai-analysis:delete',
    HISTORY_SAVE: 'ai-analysis-history:save',
    HISTORY_GET_ALL: 'ai-analysis-history:get-all',
    HISTORY_GET_BY_FOLDER: 'ai-analysis-history:get-by-folder',
    HISTORY_GET_BY_ID: 'ai-analysis-history:get-by-id',
    HISTORY_DELETE: 'ai-analysis-history:delete',
  },
  GIT_COMMIT_QUEUE: {
    ADD: 'git-commit-queue:add',
    REMOVE_MANY: 'git-commit-queue:remove-many',
  },
  EVM: {
    GET_DATA: 'evm:get-data',
    GET_PROJECTS: 'evm:get-projects',
    ENSURE_PROJECT_FOR_EVM: 'evm:ensure-project-for-evm',
    CREATE_PROJECT: 'evm:create-project',
    UPDATE_PROJECT: 'evm:update-project',
    CREATE_WBS: 'evm:create-wbs',
    CREATE_WBS_BATCH: 'evm:create-wbs-batch',
    UPDATE_WBS: 'evm:update-wbs',
    UPDATE_WBS_MASTER: 'evm:update-wbs-master',
    DELETE_WBS: 'evm:delete-wbs',
    CREATE_AC: 'evm:create-ac',
    CREATE_AC_BATCH: 'evm:create-ac-batch',
    GET_MASTER_PHASES: 'evm:get-master-phases',
    UPDATE_AC: 'evm:update-ac',
    DELETE_AC: 'evm:delete-ac',
    UPDATE_MASTER: 'evm:update-master',
    REPLACE_WBS_DAY_UNITS_FOR_WBS: 'evm:replace-wbs-day-units-for-wbs',
    SAVE_AI_INSIGHT: 'evm:save-ai-insight',
    LIST_AI_INSIGHTS: 'evm:list-ai-insights',
    GET_PROJECT_PM_PL: 'evm:get-project-pm-pl',
  },
  ACHIEVEMENT: {
    GET_STATS: 'achievement:get-stats',
    GET_BADGES: 'achievement:get-badges',
    GET_ALL_DEFINITIONS: 'achievement:get-all-definitions',
    PIN_BADGE: 'achievement:pin-badge',
    GET_LEADERBOARD: 'achievement:get-leaderboard',
    GET_LEADERBOARD_BY_PROJECT: 'achievement:get-leaderboard-by-project',
    GET_ACHIEVEMENT_RARITIES: 'achievement:get-achievement-rarities',
    PREVIEW_TOAST: 'achievement:preview-toast',
    PREVIEW_RANK_UP: 'achievement:preview-rank-up',
    GET_STATS_FOR_USER: 'achievement:get-stats-for-user',
    GET_BADGES_FOR_USER: 'achievement:get-badges-for-user',
  },
  PR: {
    TOKEN_SET: 'pr:token-set',
    TOKEN_CHECK: 'pr:token-check',
    TOKEN_REMOVE: 'pr:token-remove',
    RATE_LIMIT_GET: 'pr:rate-limit-get',
    REPO_LIST: 'pr:repo-list',
    REPO_UPSERT: 'pr:repo-upsert',
    REPO_REMOVE: 'pr:repo-remove',
    REPO_AUTODETECT: 'pr:repo-autodetect',
    TRACKED_LIST: 'pr:tracked-list',
    TRACKED_UPSERT: 'pr:tracked-upsert',
    TRACKED_DELETE: 'pr:tracked-delete',
    TRACKED_UPDATE_STATUS_NOTE: 'pr:tracked-update-status-note',
    TEMPLATE_LIST: 'pr:template-list',
    TEMPLATE_UPSERT: 'pr:template-upsert',
    TEMPLATE_DELETE: 'pr:template-delete',
    TEMPLATE_REORDER: 'pr:template-reorder',
    TEMPLATE_SEED_DEFAULT: 'pr:template-seed-default',
    PR_CREATE: 'pr:pr-create',
    PR_MERGE: 'pr:pr-merge',
    PR_LIST: 'pr:pr-list',
    PR_GET: 'pr:pr-get',
    PR_GET_COMMITS: 'pr:pr-get-commits',
    PR_FILES_LIST: 'pr:pr-files-list',
    PR_ISSUE_COMMENTS_LIST: 'pr:pr-issue-comments-list',
    PR_ISSUE_COMMENT_CREATE: 'pr:pr-issue-comment-create',
    PR_REVIEW_APPROVE: 'pr:pr-review-approve',
    PR_MARK_READY: 'pr:pr-mark-ready',
    PR_MARK_DRAFT: 'pr:pr-mark-draft',
    PR_CLOSE: 'pr:pr-close',
    PR_UPDATE_BRANCH: 'pr:pr-update-branch',
    /** git merge-tree tr\u00ean clone \u2014 m\u1edf ph\u1ea1m vi conflct (kh\u00f4ng c\u00f3 tr\u00ean API GitHub). */
    PR_LOCAL_MERGE_CONFLICTS: 'pr:pr-local-merge-conflicts',
    BRANCH_LIST_REMOTE: 'pr:branch-list-remote',
    GITHUB_REMOTE_BRANCHES_EXIST: 'pr:github-remote-branches-exist',
    GITHUB_DELETE_REMOTE_BRANCH: 'pr:github-delete-remote-branch',
    REF_COMMIT_MESSAGES: 'pr:ref-commit-messages',
    BRANCH_LAST_COMMIT_MESSAGE: 'pr:branch-last-commit-message',
    LOCAL_LAST_COMMIT_MESSAGE: 'pr:local-last-commit-message',
    BRANCH_COMMITS: 'pr:branch-commits',
    BRANCH_RESET_HARD: 'pr:branch-reset-hard',
    BRANCH_FORCE_PUSH: 'pr:branch-force-push',
    AUTOMATION_LIST: 'pr:automation-list',
    AUTOMATION_UPSERT: 'pr:automation-upsert',
    AUTOMATION_DELETE: 'pr:automation-delete',
    AUTOMATION_TOGGLE: 'pr:automation-toggle',
    TRACKED_SYNC_FROM_GITHUB: 'pr:tracked-sync-from-github',
    EVENT_AUTOMATION_FIRED: 'pr:event:automation-fired',
    EVENT_CHECKPOINT_UPDATED: 'pr:event:checkpoint-updated',
    EVENT_TRACKED_SYNC_PROGRESS: 'pr:event:tracked-sync-progress',
    EVENT_TOKEN_INVALID: 'pr:event:token-invalid',
  },
  PROGRESS: {
    GET_HEATMAP: 'progress:get-heatmap',
    GET_TREND: 'progress:get-trend',
    GET_RADAR: 'progress:get-radar',
    GET_TASK_PERFORMANCE: 'progress:get-task-performance',
    GET_QUALITY_TREND: 'progress:get-quality-trend',
    GET_PRODUCTIVE_HOURS: 'progress:get-productive-hours',
    GET_MONTHLY_HIGHLIGHTS: 'progress:get-monthly-highlights',
    GET_ALL_USERS: 'progress:get-all-users',
    GET_TEAM_SUMMARY: 'progress:get-team-summary',
    GET_OVERVIEW_PROJECTS: 'progress:get-overview-projects',
    GET_RADAR_RANGE: 'progress:get-radar-range',
    GET_PROJECT_MEMBER_IDS: 'progress:get-project-member-ids',
    GET_TEAM_OVERVIEW_USER_PROJECTS: 'progress:get-team-overview-user-projects',
  },
}

export type CommitMessageDetailLevel = 'detail' | 'normal' | 'simple'

export const PROMPT = {
  CHECK_VIOLATIONS: `
Bạn là một kiểm toán viên chất lượng mã nguồn cao cấp và chuyên gia về tiêu chuẩn ngôn ngữ lập trình. Vai trò của bạn là đánh giá một cách nghiêm ngặt các thay đổi mã nguồn để đảm bảo tuân thủ các thực tiễn tốt nhất được công nhận trong ngành và các quy ước riêng của ngôn ngữ lập trình.

Áp dụng các quy tắc mã hóa sau:
{coding_rules}

Kết quả sẽ được trả về dưới dạng bảng, bao gồm 6 cột:
  1. STT – Số thứ tự của từng lần kiểm tra quy tắc.
  2. Tiêu chí – Tên hoặc mô tả của quy tắc mã hóa được đánh giá.
  3. Kết quả – Quy tắc có được tuân thủ hay không (Pass hoặc Fail).
  4. Tóm tắt vi phạm – Mô tả ngắn gọn về vi phạm quy tắc (nếu có).
  5. Giải thích – Giải thích ngắn gọn vì sao đây được xem là vi phạm.
  6. Đoạn mã vi phạm – Đoạn mã chính xác nơi xảy ra vi phạm, kèm theo số dòng.

Bảng phải đánh giá và phản ánh đầy đủ tất cả các tiêu chí được định nghĩa rõ ràng trong các quy tắc mã hóa ở trên.
Mỗi tiêu chí phải được liệt kê và đánh giá riêng biệt.
Sử dụng định dạng này để trình bày rõ ràng tất cả các lần kiểm tra quy tắc.

Đánh giá phần diff sau:
{diff_content}

Chỉ các dòng được đánh dấu bằng ký tự '+' (tức là các dòng mới hoặc dòng đã chỉnh sửa) mới cần được đánh giá.

Phản hồi ngắn gọn, tránh dài dòng và không đưa ra đề xuất hoặc khuyến nghị ở cuối.
Luôn sử dụng định dạng bảng markdown để trình bày dữ liệu.
`,

  GENERATE_COMMIT: `
You are a source code management expert. Generate a professional commit message using the Conventional Commit Specification.
{detail_instruction}

Based on this diff:
{diff_content}

Deleted Files:
{deletedFiles}

Respond strictly in English, without using Markdown formatting.
`,

  AI_FIX_CODING_RULE: `
Bạn là một kỹ sư phần mềm cao cấp và chuyên gia về chất lượng mã nguồn. Nhiệm vụ của bạn là phân tích một vi phạm quy tắc lập trình và cung cấp giải pháp chi tiết để khắc phục.

Chi tiết vi phạm:
- Tiêu chí: {criterion}
- Tóm tắt vi phạm: {violation_summary}
- Giải thích: {explanation}
- Đoạn mã vi phạm: {offending_code}

Vui lòng cung cấp:
1. Phân tích nguyên nhân gốc rễ: Giải thích nguyên nhân gây ra vi phạm này
2. Giải pháp đề xuất: Cung cấp hướng dẫn từng bước để khắc phục vấn đề
3. Ví dụ mã nguồn: Trình bày đoạn mã đã được sửa với cách triển khai đúng
4. Thực hành tốt nhất: Các mẹo bổ sung để ngăn ngừa các vi phạm tương tự trong tương lai

Trả lời bằng tiếng Việt. Giữ phản hồi ngắn gọn, tránh từ quá nhiều, và không bao gồm gợi ý hoặc đề xuất ở cuối.
`,

  AI_ANALYSIS_COMMITS: `
Bạn là chuyên gia phân tích code, quy trình phát triển phần mềm và teamwork.
Nhiệm vụ của bạn là phân tích dữ liệu commit từ VCS  và đưa ra insights ngắn gọn, rõ ràng, dựa trên số liệu, nhằm đánh giá tình trạng hoạt động của team.

## YÊU CẦU CHUNG (BẮT BUỘC)
- LUÔN sử dụng BẢNG MARKDOWN cho tất cả số liệu.
- Sử dụng html tags (có hỗ trợ cho markdown).
- Số liệu phải chuẩn xác theo đúng log commit (ngày giờ, số commit, số file, ...)
- Tất cả dữ liệu ngày giờ phải được convert sang giờ UTC+7 (giờ ở log commit, ...) nhưng ko cần hiển thị UTC+7 trên UI.
- Trả lời bằng tiếng Việt

## 1. TỔNG QUAN HOẠT ĐỘNG
**Bảng thống kê:**
- Tên người
- Số commit
- Số file sửa
- Trung bình file/commit
- %/tổng số commit
Chú ý: Nếu log có nhiều codebase thì có thể chia thành nhiều bảng theo số lượng codebase.

## 2. CHẤT LƯỢNG COMMIT MESSAGE
### 2.1 Tổng quan chất lượng message
**Bảng:**
- Loại message
- Số lượng
- %
- Mức độ (🟢 Đạt chuẩn/🟡 Cảnh báo/🔴 Vi phạm)

**Các loại:**
- **Đạt chuẩn**: Có prefix (feat/fix/docs...) HOẶC ticket ID + mô tả rõ ràng (>10 ký tự) HOẶC có ghi tên file
- **Cảnh báo**: Thiếu prefix/ticket NHƯNG có mô tả dài (>30 ký tự)
- **Vi phạm**:
  - Message rỗng hoặc <10 ký tự
  - Message chung chung ("update", "fix bug", "changes")
  - Không có context/lý do

### 2.2 Danh sách commit message không đạt (liệt kê đầy đủ tất cả các trường hợp không đạt)
**Bảng:**
- Tên dev
- Message
- Ngày commit
- Lý do không đạt

## 3. THÓI QUEN LÀM VIỆC
### 3.1 Commit theo giờ trong ngày
**Bảng:** (bỏ qua những giờ không có dữ liệu)
Header: Khung giờ
Row 1: Số commit
Row 2: %

### 3.2 Commit theo ngày trong tuần
**Bảng (bảng ngang):**
Header: Thứ
Row 1: Số commit
Row 2: %

### 3.3 Thói quen làm việc (Giờ làm việc từ 8:00 đến 19:00 giờ UTC+7)
→ **Suy ra ngắn gọn** từ 2 bảng trên (dạng bảng ngang markdown)
Giờ cao điểm | % Commit ngoài giờ| % Commit cuối tuần

## 4. CẢNH BÁO RỦI RO
**Bảng:**
- Vấn đề
- Chi tiết (Nếu có vấn đề thì ghi chi tiết, nếu không thì bỏ qua)

**Các vấn đề cần check:**
- Commit fix/revert liên tiếp trong thời gian ngắn
- Commit dồn dập trong 1 ngày (commit >10 lần)
- Commit thay đổi quá nhiều file (>20 files)
- Commit có thời gian bất thường (đêm khuya, cuối tuần kéo dài)
- Commit gộp nhiều mục đích / nhiều module
- File bị sửa nhiều lần trong ngày
- File có churn cao trong thời gian dài
- File có nhiều người cùng chỉnh sửa
- File thường xuyên xuất hiện trong commit fix/revert

## 5. HÀNH ĐỘNG ĐỀ XUẤT
**Bảng ưu tiên hành động:**
- Ưu tiên (P0 / P1 / P2)
- Vấn đề
- Hành động đề xuất
- Kết quả mong muốn

## 6. TỔNG QUAN CHỈ SỐ
**Bảng KPI kỹ thuật:**
- Chỉ số
- Giá trị hiện tại
- Trạng thái (🟢(đạt) / 🟡(không đạt) / 🔴(rủi ro))
**Các chỉ số bắt buộc:**
- Trung bình commit/ngày
- Tốc độ team (file thay đổi/ngày)
- Điểm chất lượng commit message
- % commit ngoài giờ

## 7. KẾT LUẬN
- Kết luận chung về tình hình hoạt động của team
---

**Dữ liệu commit:**
{commit_data}

**Khoảng thời gian phân tích:** {date_range}

---

## LƯU Ý QUAN TRỌNG
- Không đưa ra gợi ý chung chung
- Không viết văn mô tả
- Không dùng bullet ngoài bảng
`,

  AI_TRANSLATE: `
You are a professional translator. Translate the following text accurately while preserving:
- Technical terms (commit IDs, ticket IDs like #1234, file paths)
- Code snippets and placeholders
- Line breaks and formatting

Source text (language may be auto-detected):
{text}

Target language: {target_language}
Source language (optional, use "auto" to detect): {source_language}

Respond with ONLY the translated text, no explanations. Preserve markdown if present.
`,

  EVM_EXPLAIN_METRICS: `
Bạn là chuyên gia Earned Value Management (EVM).
Nhiệm vụ: giải thích ngắn gọn, dễ hiểu cho PM các chỉ số người dùng đã chọn, dựa CHỈ trên JSON factual.

## OUTPUT FORMAT (BẮT BUỘC)

### 1. Tóm tắt nhanh
- Tình trạng chi phí: <Tốt / Vượt ngân sách / Không đủ dữ liệu>
- Tình trạng tiến độ: <Đúng tiến độ / Trễ / Không đủ dữ liệu>

### 2. Diễn giải chỉ số
- CPI = <giá trị> → <ý nghĩa ngắn gọn>
- SPI = <giá trị> → <ý nghĩa ngắn gọn>
- EAC / ETC / VAC (nếu có) → <ý nghĩa>

### 3. Nhận định chính
- Nêu tối đa 2–3 điểm quan trọng nhất từ các chỉ số
- Nếu có mâu thuẫn (ví dụ CPI tốt nhưng SPI xấu) → phải nêu rõ

### 4. Gợi ý theo chỉ số
- Dựa trên số liệu (không suy đoán nguyên nhân)
- Ví dụ:
  - CPI < 1 → cần kiểm soát chi phí
  - SPI < 1 → cần tăng tốc tiến độ

---

## QUY TẮC DIỄN GIẢI

- CPI:
  - > 1 → chi phí tốt
  - = 1 → đúng kế hoạch
  - < 1 → vượt ngân sách

- SPI:
  - > 1 → nhanh hơn kế hoạch
  - = 1 → đúng tiến độ
  - < 1 → chậm tiến độ

- VAC:
  - > 0 → còn dư ngân sách
  - < 0 → vượt ngân sách

- EAC:
  - So sánh với BAC (nếu có)

---

## QUY TẮC BẮT BUỘC

- Chỉ dùng số, ngày, tên dự án có trong JSON
- Không bịa giá trị, không thêm chỉ số
- Không suy đoán nguyên nhân ngoài dữ liệu
- Nếu thiếu dữ liệu → ghi rõ "không có đủ thông tin"
- Không định nghĩa lý thuyết dài dòng
- Làm tròn số đến 2 chữ số thập phân
- Trình bày dạng bullet/table, không viết văn dài

## DỮ LIỆU (JSON — nguồn sự thật duy nhất)
{evm_data}
`,

  EVM_SCHEDULE_RISK: `
Bạn là PMO phân tích rủi ro lịch từ bảng công việc (JSON factual).

## OUTPUT FORMAT (BẮT BUỘC)

### 1. Tổng quan rủi ro
- Số task có rủi ro cao: <n>
- Số task có dấu hiệu chậm: <n>
- Nhận định nhanh: On-track / At-risk / Delayed (dựa trên dữ liệu)

### 2. Task rủi ro cao
| Task | Planned End | % Done | Nhận định |
|------|-------------|--------|-----------|
- Chỉ liệt kê task có:
  - % thấp gần deadline
  - hoặc đã trễ so với plan

### 3. Task có khe thời gian chặt
- Liệt kê task có:
  - thời gian còn lại ít (<= 2 ngày) nhưng % chưa cao
- Nếu không có: ghi rõ

### 4. Milestone risk (nếu có)
- Milestone nào có khả năng trễ
- Nếu không có dữ liệu milestone: ghi rõ

### 5. Gợi ý ưu tiên (PMO-level)
- Tối đa 3 gợi ý
- Chỉ dựa trên dữ liệu (không suy đoán dependency)

---

## QUY TẮC BẮT BUỘC

- Không sử dụng CPM hoặc đường găng toán học
- Chỉ phân tích dựa trên task hiện có
- Không tạo dependency nếu JSON không có

## QUY TẮC XÁC ĐỊNH RỦI RO

- Task được coi là rủi ro cao nếu:
  - Đã quá Planned End nhưng % < 100
  - Hoặc còn <= 2 ngày nhưng % < 70

- Task có dấu hiệu chậm nếu:
  - % hoàn thành thấp hơn tiến độ thời gian (so với plan duration)

## QUY TẮC THỜI GIAN

- Nếu có reportDate hoặc today → dùng để so sánh
- Nếu không có → chỉ phân tích tương đối giữa các task

## QUY TẮC DỮ LIỆU

- Chỉ dùng dữ liệu có trong JSON
- Không bịa task, ngày, hoặc trạng thái
- Nếu thiếu dữ liệu → ghi rõ "Không có dữ liệu"

## FORMAT

- Không viết văn mô tả
- Dùng bảng + bullet
- Làm tròn số 2 chữ số thập phân

## DỮ LIỆU (JSON)
{schedule_data}
`,
}

/** Chat SpotBugs (raw prompt qua openai.chat) — không có template trong PROMPT */
export const AI_FEATURE_SPOTBUGS_CHAT = 'SPOTBUGS_AI_CHAT' as const

export type AiFeatureId = keyof typeof PROMPT | typeof AI_FEATURE_SPOTBUGS_CHAT

/** List of text file extensions */
export const TEXT_EXTENSIONS = [
  'sample',
  'Dockerfile',
  'Makefile',
  'Rakefile',
  'ada',
  'adb',
  'ads',
  'applescript',
  'as',
  'ascx',
  'asm',
  'asmx',
  'asp',
  'aspx',
  'atom',
  'bas',
  'bash',
  'bashrc',
  'bat',
  'bbcolors',
  'bdsgroup',
  'bdsproj',
  'bib',
  'bowerrc',
  'c',
  'cbl',
  'cc',
  'cfc',
  'cfg',
  'cfm',
  'cfml',
  'cgi',
  'clj',
  'cls',
  'cmake',
  'cmd',
  'cnf',
  'cob',
  'coffee',
  'coffeekup',
  'conf',
  'cpp',
  'cpt',
  'cpy',
  'crt',
  'cs',
  'csh',
  'cson',
  'csr',
  'css',
  'csslintrc',
  'csv',
  'ctl',
  'curlrc',
  'cxx',
  'dart',
  'dfm',
  'diff',
  'dockerignore',
  'dof',
  'dpk',
  'dproj',
  'dtd',
  'eco',
  'editorconfig',
  'ejs',
  'el',
  'emacs',
  'eml',
  'ent',
  'erb',
  'erl',
  'eslintignore',
  'eslintrc',
  'ex',
  'exs',
  'f',
  'f03',
  'f77',
  'f90',
  'f95',
  'fish',
  'for',
  'fpp',
  'frm',
  'ftn',
  'gemrc',
  'gitattributes',
  'gitconfig',
  'gitignore',
  'gitkeep',
  'gitmodules',
  'go',
  'gpp',
  'gradle',
  'groovy',
  'groupproj',
  'grunit',
  'gtmpl',
  'gvimrc',
  'h',
  'haml',
  'hbs',
  'hgignore',
  'hh',
  'hpp',
  'hrl',
  'hs',
  'hta',
  'htaccess',
  'htc',
  'htm',
  'html',
  'htpasswd',
  'hxx',
  'iced',
  'inc',
  'ini',
  'ino',
  'int',
  'irbrc',
  'itcl',
  'itermcolors',
  'itk',
  'jade',
  'java',
  'jhtm',
  'jhtml',
  'js',
  'jscsrc',
  'jshintignore',
  'jshintrc',
  'json',
  'json5',
  'jsonld',
  'jsp',
  'jspx',
  'jsx',
  'ksh',
  'less',
  'lhs',
  'lisp',
  'log',
  'ls',
  'lsp',
  'lua',
  'm',
  'mak',
  'map',
  'markdown',
  'master',
  'md',
  'mdown',
  'mdwn',
  'mdx',
  'metadata',
  'mht',
  'mhtml',
  'mjs',
  'mk',
  'mkd',
  'mkdn',
  'mkdown',
  'ml',
  'mli',
  'mm',
  'mxml',
  'nfm',
  'nfo',
  'njk',
  'noon',
  'npmignore',
  'npmrc',
  'nvmrc',
  'ops',
  'pas',
  'pasm',
  'patch',
  'pbxproj',
  'pch',
  'pem',
  'pg',
  'php',
  'php3',
  'php4',
  'php5',
  'phpt',
  'phtml',
  'pir',
  'pl',
  'pm',
  'pmc',
  'pod',
  'pot',
  'properties',
  'props',
  'pt',
  'pug',
  'py',
  'r',
  'rake',
  'rb',
  'rdoc',
  'rdoc_options',
  'resx',
  'rhtml',
  'rjs',
  'rlib',
  'rmd',
  'ron',
  'rs',
  'rss',
  'rst',
  'rtf',
  'rvmrc',
  'rxml',
  's',
  'sass',
  'scala',
  'scm',
  'scss',
  'seestyle',
  'sh',
  'shtml',
  'sls',
  'spec',
  'sql',
  'sqlite',
  'ss',
  'sss',
  'st',
  'strings',
  'sty',
  'styl',
  'stylus',
  'sub',
  'sublime-build',
  'sublime-commands',
  'sublime-completions',
  'sublime-keymap',
  'sublime-macro',
  'sublime-menu',
  'sublime-project',
  'sublime-settings',
  'sublime-workspace',
  'sv',
  'svc',
  'svg',
  't',
  'tcl',
  'tcsh',
  'terminal',
  'tex',
  'text',
  'textile',
  'tg',
  'tmLanguage',
  'tmTheme',
  'tmpl',
  'toml',
  'tpl',
  'ts',
  'tsv',
  'tsx',
  'tt',
  'tt2',
  'ttml',
  'txt',
  'v',
  'vb',
  'vbs',
  'vh',
  'vhd',
  'vhdl',
  'vim',
  'viminfo',
  'vimrc',
  'vue',
  'webapp',
  'wxml',
  'wxss',
  'x-php',
  'xaml',
  'xht',
  'xhtml',
  'xml',
  'xs',
  'xsd',
  'xsl',
  'xslt',
  'yaml',
  'yml',
  'zsh',
  'zshrc',
]

/** List of binary file extensions */
export const BINARY_EXTENSIONS = ['dds', 'eot', 'gif', 'ico', 'jar', 'jpeg', 'jpg', 'pdf', 'png', 'swf', 'tga', 'ttf', 'zip']

/** Số repo (source folder) tối đa cho mỗi project. Có thể chỉnh khi cần. */
export const MAX_REPOS_PER_PROJECT = 5
