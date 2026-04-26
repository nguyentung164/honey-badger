import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, contextBridge, ipcRenderer } from 'electron'

/**
 * `app` đôi khi không gắn đúng trong preload (bundler / phiên bản Electron),
 * trong khi `app.isPackaged` vẫn cần để phân biệt dev URL vs `file://` bản cài.
 */
function getElectronAppIsPackaged(): boolean {
  if (app != null && typeof app.isPackaged === 'boolean') return app.isPackaged
  if (typeof __filename === 'string' && __filename.includes('app.asar')) return true
  return false
}
import { AI_FEATURE_SPOTBUGS_CHAT, IPC, PROMPT } from 'main/constants'
import type { CommitActivityRepo } from 'main/ipc/dashboard'
import type { Configuration, MailServerConfig, SupportFeedback, SVNResponse } from 'main/types/types'

/** IPC dùng structured clone; snapshot Zustand/React có thể là Proxy → lỗi "An object could not be cloned". */
function toStructuredCloneable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

declare global {
  interface Window {
    api: {
      electron: {
        send: (channel: string, data?: any) => void
      }

      /** Ảnh/tài nguyên trong `src/resources/public` (bản cài: `resources/public` qua file://). */
      resources: {
        publicAssetUrl: (pathFromPublicRoot: string) => string
      }

      appLogs: {
        read: () => Promise<Array<{ path: string; lines: string[] }>>
      }

      appearance: {
        set: (key: string, value: any) => Promise<void>
      }

      configuration: {
        get: () => Promise<Configuration>
        set: (configuration: Configuration) => Promise<void>
        patch: (partial: Partial<Configuration>) => Promise<void>
        patchSilent: (partial: Partial<Configuration>) => Promise<void>
        setMultirepoWatchPaths: (paths: string[]) => Promise<void>
        exportBackup: () => Promise<string>
        importBackup: (jsonString: string) => Promise<{ success: boolean; error?: string }>
        exportToFile: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>
        importFromFile: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>
      }

      mail_server: {
        get: () => Promise<MailServerConfig>
        set: (config: MailServerConfig) => Promise<void>
        test: (config?: MailServerConfig) => Promise<{ success: boolean; error?: string }>
      }

      svn: {
        changed_files: (targetPath: string) => Promise<SVNResponse>
        get_diff: (selectedFiles: any[]) => Promise<SVNResponse>
        commit: (commitMessage: string, selectedFiles: any[], options: { hasCheckCodingRule: boolean; hasCheckSpotbugs: boolean }) => Promise<SVNResponse>
        info: (filePath: string, revision?: string) => Promise<any>
        getCurrentRevision: (cwd?: string) => Promise<string | null>
        infoWithStream: (filePath: string) => Promise<any>
        onInfoStream: (callback: (chunk: string) => void) => () => void
        cat: (filePath: string, fileStatus: string, revision?: string, options?: { cwd?: string }) => Promise<any>
        blame: (filePath: string) => Promise<any>
        revert: (filePath: string | string[]) => Promise<any>
        cleanup: (options?: string[]) => Promise<any>
        log: (filePath: string | string[], options?: { dateFrom?: string; dateTo?: string; revisionFrom?: string; revisionTo?: string }) => Promise<any>
        update: (filePath?: string | string[], revision?: string) => Promise<any>
        onUpdateStream: (callback: (chunk: string) => void) => () => void
        onCommitStream: (callback: (chunk: string) => void) => () => void
        open_diff: (filePath: string, options?: { fileStatus?: string; revision?: string; currentRevision?: string; cwd?: string }) => void
        statistics: (filePath: string, options?: { period?: 'day' | 'week' | 'month' | 'year' | 'all'; dateFrom?: string; dateTo?: string }) => Promise<any>
        merge: (options: { sourcePath: string; targetPath: string; dryRun?: boolean; revision?: string }) => Promise<any>
        merge_resolve_conflict: (filePath: string, resolution: 'working' | 'theirs' | 'mine' | 'base' | '', isRevisionConflict?: boolean, targetPath?: string) => Promise<any>
        merge_create_snapshot: (targetPath: string) => Promise<any>
        merge_get_commits: (options: { sourcePath: string; targetPath: string; revision?: string }) => Promise<any>
        get_conflict_status: (sourceFolder?: string) => Promise<any>
        get_conflict_detail: (filePath: string, sourceFolder?: string) => Promise<any>
        resolve_conflict_with_content: (filePath: string, resolvedContent: string, sourceFolder?: string) => Promise<any>
      }

      git: {
        status: (options?: { cwd?: string }) => Promise<any>
        log: (filePath: string | string[], options?: any) => Promise<any>
        log_graph: (filePath: string | string[], options?: any) => Promise<any>
        getCommitFiles: (commitHash: string, options?: { cwd?: string }) => Promise<any>
        commit: (
          commitMessage: string,
          selectedFiles: string[],
          options: {
            hasCheckCodingRule: boolean
            hasCheckSpotbugs: boolean
            amend?: boolean
            signOff?: boolean
            scope?: 'staged' | 'all'
            cwd?: string
          }
        ) => Promise<any>
        scanStagedSecrets: (payload: { repos: { cwd: string; label?: string }[]; configPath?: string; timeoutMs?: number }) => Promise<
          | { status: 'clean' }
          | {
              status: 'leaks'
              findings: { ruleId: string; file: string; startLine?: number; endLine?: number; description?: string; repoLabel?: string }[]
            }
          | { status: 'error'; message: string }
        >
        undo_commit: (cwd?: string) => Promise<any>
        get_diff: (selectedFiles: string[], options?: { cwd?: string }) => Promise<any>
        get_staged_diff: () => Promise<any>
        getCommitDiff: (commitHash: string, filePath?: string, options?: { cwd?: string }) => Promise<any>
        getParentCommit: (commitHash: string, options?: { cwd?: string }) => Promise<string | null>
        cat: (filePath: string, fileStatus: string, commitHash?: string, options?: { cwd?: string }) => Promise<any>
        open_diff: (filePath: string, options?: { fileStatus: string; commitHash?: string; currentCommitHash?: string; isRootCommit?: boolean; cwd?: string }) => void
        revert: (filePath: string | string[]) => Promise<any>
        discardChanges: (paths: string[], cwd?: string) => Promise<any>
        discardFiles: (paths: string[], cwd?: string) => Promise<any>
        reset_staged: (files?: string[], options?: { cwd?: string }) => Promise<any>
        add: (files: string[], options?: { cwd?: string }) => Promise<any>
        get_branches: (cwd?: string) => Promise<any>
        create_branch: (branchName: string, sourceBranch?: string, cwd?: string) => Promise<any>
        checkout_branch: (branchName: string, options?: { force?: boolean; stash?: boolean }, cwd?: string) => Promise<any>
        delete_branch: (branchName: string, force: boolean) => Promise<any>
        delete_remote_branch: (remote: string, branchName: string) => Promise<any>
        rename_branch: (oldName: string, newName: string) => Promise<any>
        push: (remote: string, branch?: string, commitQueueData?: Record<string, any>, cwd?: string, force?: boolean) => Promise<any>
        pull: (remote: string, branch?: string, options?: { rebase?: boolean }, cwd?: string) => Promise<any>
        onPullStream: (callback: (chunk: string) => void) => () => void
        onCommitStream: (callback: (chunk: string) => void) => () => void
        onPushStream: (callback: (chunk: string) => void) => () => void
        onFetchStream: (callback: (chunk: string) => void) => () => void
        fetch: (remote?: string, options?: { prune?: boolean; all?: boolean }, cwd?: string) => Promise<any>
        get_remotes: (cwd?: string) => Promise<any>
        stash: (message?: string, options?: { includeUntracked?: boolean; stagedOnly?: boolean }, cwd?: string) => Promise<any>
        stash_list: (cwd?: string) => Promise<any>
        stash_show: (stashIndex: number, cwd?: string) => Promise<any>
        stash_show_files: (stashIndex: number, cwd?: string) => Promise<{ status: string; message?: string; data?: { path: string; status: string }[] }>
        stash_show_file_diff: (stashIndex: number, filePath: string, cwd?: string) => Promise<any>
        stash_show_file_content: (
          stashIndex: number,
          filePath: string,
          cwd?: string
        ) => Promise<{ status: string; message?: string; data?: { original: string; modified: string } }>
        stash_is_likely_applied: (stashIndex: number, cwd?: string) => Promise<{ status: string; message?: string; data?: boolean }>
        stash_pop: (stashIndex: number, options?: { index?: boolean }, cwd?: string) => Promise<any>
        stash_apply: (stashIndex: number, options?: { index?: boolean }, cwd?: string) => Promise<any>
        stash_drop: (stashIndex: number, cwd?: string) => Promise<any>
        stash_clear: (cwd?: string) => Promise<any>
        stash_branch: (stashIndex: number, branchName: string, cwd?: string) => Promise<any>
        merge: (branchName: string, strategy?: string, cwd?: string) => Promise<any>
        abort_merge: (cwd?: string) => Promise<any>
        resolve_conflict: (filePath: string, resolution: 'ours' | 'theirs' | 'both', cwd?: string) => Promise<any>
        get_merge_status: (cwd?: string) => Promise<any>
        clone: (url: string, targetPath: string, options?: { branch?: string; depth?: number }) => Promise<any>
        init: (targetPath: string) => Promise<any>
        add_remote: (name: string, url: string, cwd?: string) => Promise<any>
        remove_remote: (name: string, cwd?: string) => Promise<any>
        set_remote_url: (name: string, url: string, cwd?: string) => Promise<any>
        cherry_pick: (commitHash: string, cwd?: string) => Promise<any>
        abort_cherry_pick: (cwd?: string) => Promise<any>
        continue_cherry_pick: (cwd?: string) => Promise<any>
        get_conflict_status: (cwd?: string) => Promise<any>
        read_conflict_working_content: (filePath: string, cwd?: string) => Promise<{ status: string; data?: string; message?: string }>
        reset: (commitHash: string, mode: 'soft' | 'mixed' | 'hard', cwd?: string) => Promise<any>
        rebase: (ontoBranch: string, cwd?: string) => Promise<any>
        continue_rebase: (cwd?: string) => Promise<any>
        abort_rebase: (cwd?: string) => Promise<any>
        get_rebase_status: (cwd?: string) => Promise<any>
        create_tag: (tagName: string, message?: string, commitHash?: string, cwd?: string) => Promise<any>
        list_tags: (cwd?: string) => Promise<any>
        list_remote_tags: (remote?: string, cwd?: string) => Promise<any>
        delete_tag: (tagName: string, remote?: string, cwd?: string) => Promise<any>
        push_tag: (tagName: string, remote: string, cwd?: string) => Promise<any>
        blame: (filePath: string) => Promise<any>
        statistics: (filePath: string, options?: { period?: 'day' | 'week' | 'month' | 'year' | 'all'; dateFrom?: string; dateTo?: string }) => Promise<any>
        hooks_get: (cwd?: string) => Promise<any>
        hook_get_content: (hookName: string, cwd?: string) => Promise<any>
        hook_set_content: (hookName: string, content: string, cwd?: string) => Promise<any>
        hook_delete: (hookName: string, cwd?: string) => Promise<any>
        hook_enable: (hookName: string, cwd?: string) => Promise<any>
        hook_disable: (hookName: string, cwd?: string) => Promise<any>
        hook_get_sample: (hookName: string, cwd?: string) => Promise<any>
        get_interactive_rebase_commits: (baseRef: string, cwd?: string) => Promise<any>
        start_interactive_rebase: (
          baseRef: string,
          todoItems: { hash: string; shortHash: string; action: string; message: string; author: string; date: string }[],
          cwd?: string
        ) => Promise<any>
      }

      openai: {
        send_message: (params: { type: keyof typeof PROMPT; values: Record<string, string> }) => Promise<string>
        chat: (prompt: string) => Promise<string>
      }

      aiUsage: {
        getSummary: () => Promise<any>
        clear: () => Promise<{ ok: boolean }>
        fetchExchangeRates: () => Promise<{ ok: true; usdToVnd: number; usdToJpy: number; updatedAt: number } | { ok: false; error: string }>
        getExchangeState: () => Promise<{
          usdToVnd: number | null
          usdToJpy: number | null
          updatedAt: number | null
          displayCurrency: 'USD' | 'VND' | 'JPY'
        }>
        setDisplayCurrency: (currency: 'USD' | 'VND' | 'JPY') => Promise<{ ok: boolean; error?: string }>
      }

      notification: {
        send_support_feedback: (data: SupportFeedback) => Promise<{ status: string; message?: string }>
      }

      vcs: {
        svn_list_users: () => Promise<{ realm: string; username: string }[]>
        svn_remove_credential: (realm: string) => Promise<{ success: boolean; error?: string }>
        git_get_config: (
          cwd?: string
        ) => Promise<{ global: { userName: string; userEmail: string; scope: string }; local?: { userName: string; userEmail: string; scope: string } }>
        git_set_config: (userName: string, userEmail: string, scope: 'global' | 'local', cwd?: string) => Promise<{ success: boolean; error?: string }>
        git_list_credentials: () => Promise<{ host: string; username: string; source: string; targetName?: string }[]>
        git_remove_credential: (params: { host: string; source: string; targetName?: string }) => Promise<{ success: boolean; error?: string }>
      }

      updater: {
        check_for_updates: () => Promise<{
          status: string
          version?: string
          releaseNotes?: string
          error?: string
        }>
        install_updates: () => Promise<void>
        get_version: () => Promise<string>
      }

      webhook: {
        get: () => Promise<{
          webhooks: [
            {
              name: string
              url: string
            },
          ]
        }>
        set: (...args: any[]) => Promise<void>
        test: (url: string) => Promise<{ success: boolean; error?: string }>
      }

      commitMessageHistory: {
        get: () => Promise<{ status: string; data?: { message: string; date: string }[]; message?: string }>
        add: (message: { message: string; date: string }) => Promise<{ status: string; message?: string }>
      }

      dailyReport: {
        save: (input: {
          workDescription: string
          selectedCommits: Array<{ revision: string; message: string; author: string; date: string; files?: Array<{ filePath: string; status: string }> }>
          reportDate: string
          projectIds?: string[]
          selectedUserProjectSourceFolderIds?: string[] | null
        }) => Promise<{ status: string; message?: string }>
        getMine: (reportDate: string) => Promise<{ status: string; data?: any; message?: string }>
        getCommitsToday: (params: {
          sourceFolderPath: string
          reportDate: string
          vcsType: 'git' | 'svn'
          author?: string
        }) => Promise<{ status: string; data?: any[]; message?: string }>
        getCommitsTodayMultiple: (params: {
          folders: { path: string; vcsType: 'git' | 'svn' }[]
          reportDate: string
          author?: string
        }) => Promise<{ status: string; data?: any[]; message?: string }>
        getMyHistory: (params: {
          dateFrom: string
          dateTo: string
          limit?: number
          offset?: number
          targetUserId?: string
        }) => Promise<{ status: string; data?: any[]; message?: string }>
        getStatistics: (reportDate: string, projectId: string) => Promise<{ status: string; data?: any; message?: string }>
        getStatisticsByDateRange: (dateFrom: string, dateTo: string, projectId: string) => Promise<{ status: string; data?: any; message?: string }>
        listForPl: (reportDate: string, projectId?: string | null) => Promise<{ status: string; data?: any[]; message?: string }>
        listForPlByDateRange: (dateFrom: string, dateTo: string, projectId?: string | null) => Promise<{ status: string; data?: any[]; message?: string }>
        getDetail: (userId: string, reportDate: string) => Promise<{ status: string; data?: any; message?: string }>
      }

      aiAnalysis: {
        save: (record: any) => Promise<{ status: string; message?: string }>
        get: (sourceFolderPath: string) => Promise<{ status: string; data?: any; message?: string }>
        delete: (sourceFolderPath: string) => Promise<{ status: string; message?: string }>
        historySave: (record: any) => Promise<{ status: string; data?: number; message?: string }>
        historyGetAll: () => Promise<{ status: string; data?: any[]; message?: string }>
        historyGetByFolder: (sourceFolderPath: string) => Promise<{ status: string; data?: any[]; message?: string }>
        historyGetById: (id: number) => Promise<{ status: string; data?: any; message?: string }>
        historyDelete: (id: number) => Promise<{ status: string; message?: string }>
      }

      gitCommitQueue: {
        add: (record: any) => Promise<{ status: string; message?: string }>
        removeMany: (commitHashes: string[]) => Promise<{ status: string; message?: string }>
      }

      evm: {
        getData: (projectId?: string) => Promise<{ status: string; data?: any; message?: string }>
        getProjects: () => Promise<{ status: string; data?: any[]; message?: string }>
        ensureProjectForEvm: (projectId: string) => Promise<{ status: string; data?: any; message?: string }>
        createProject: (input: any) => Promise<{ status: string; data?: any; message?: string }>
        updateProject: (projectId: string, updates: any) => Promise<{ status: string; data?: any; message?: string }>
        createWbs: (projectId: string, row: any) => Promise<{ status: string; data?: any; message?: string }>
        createWbsBatch: (projectId: string, rows: any[]) => Promise<{ status: string; data?: any[]; message?: string }>
        updateWbs: (id: string, updates: any) => Promise<{ status: string; data?: any; message?: string }>
        updateWbsMaster: (
          masterId: string,
          updates: { phase?: string | null; category?: string | null; feature?: string | null; note?: string | null; assignee?: string | null }
        ) => Promise<{ status: string; data?: any; message?: string }>
        deleteWbs: (id: string) => Promise<{ status: string; message?: string }>
        createAc: (projectId: string, row: any) => Promise<{ status: string; data?: any; message?: string }>
        createAcBatch: (projectId: string, rows: any[]) => Promise<{ status: string; data?: any[]; message?: string }>
        getMasterPhases: (projectId: string) => Promise<{ status: string; data?: { code: string; name?: string }[]; message?: string }>
        updateAc: (id: string, updates: any) => Promise<{ status: string; data?: any; message?: string }>
        deleteAc: (id: string) => Promise<{ status: string; message?: string }>
        updateMaster: (projectId: string, updates: any) => Promise<{ status: string; data?: any; message?: string }>
        replaceWbsDayUnitsForWbs: (projectId: string, wbsId: string, entries: { workDate: string; unit: number }[]) => Promise<{ status: string; message?: string }>
        saveAiInsight: (args: {
          projectId: string
          insightType: string
          outputMarkdown: string
          inputPayloadJson?: string | null
        }) => Promise<{ status: string; data?: any; message?: string }>
        listAiInsights: (args: { projectId: string; insightType?: string; limit?: number; offset?: number }) => Promise<{
          status: string
          data?: any[]
          message?: string
        }>
        getProjectPmPl: (projectId: string) => Promise<{ status: string; data?: any[]; message?: string }>
      }

      system: {
        select_folder: () => Promise<string>
        open_folder_in_explorer: (folderPath: string) => Promise<void>
        reveal_in_file_explorer: (filePath: string) => Promise<void>
        open_external_url: (url: string) => Promise<void>
        read_file: (filePath: string, options?: { cwd?: string }) => Promise<string>
        write_file: (filePath: string, content: string, options?: { cwd?: string }) => Promise<{ success: boolean; error?: string }>
        detect_version_control: (folderPath: string) => Promise<{ status: string; data?: any; message?: string }>
        get_version_control_details: (folderPath: string) => Promise<{ status: string; data?: any; message?: string }>
        open_in_external_editor: (filePath: string) => Promise<{ success: boolean; error?: string }>
        open_terminal: (folderPath?: string) => Promise<{ success: boolean; error?: string }>
        select_audio_file: () => Promise<string>
        get_notification_sound_url: (filePath: string) => Promise<string | null>
        get_default_notification_sound_url: () => Promise<string | null>
      }

      sourcefolder: {
        get: () => Promise<{ name: string; path: string }[]>
        set: (sourceFolders: { name: string; path: string }[]) => Promise<void>
      }

      externalEditor: {
        get: () => Promise<{ externalEditors: { name: string; path: string }[] }>
        set: (config: { externalEditors: { name: string; path: string }[] }) => Promise<void>
      }

      dashboard: {
        getRepoSummary: (options?: { dateFrom?: string; dateTo?: string }) => Promise<
          {
            name: string
            path: string
            vcsType: 'git' | 'svn' | 'none'
            totalCommits: number
            recentCommitsCount: number
            commitIdsInRange?: string[]
            lastCommitDate?: string
            lastCommitAuthor?: string
            lastCommitMessage?: string
            currentBranch?: string
            currentRevision?: string
            error?: string
          }[]
        >
        getCommitActivity: (options: { dateFrom: string; dateTo: string }) => Promise<CommitActivityRepo[]>
        getChartData: (options?: { dateFrom?: string; dateTo?: string; path?: string }) => Promise<any>
      }

      github: {
        getIssues: (params: { owner: string; repo: string; token?: string; state?: 'open' | 'closed' | 'all'; per_page?: number; page?: number }) => Promise<{
          data: Array<{
            number: number
            title: string
            state: string
            html_url: string
            created_at: string
            updated_at: string
            user: { login: string } | null
            labels: Array<{ name: string; color?: string }>
            body: string | null
          }>
          error?: string
        }>
        getOwnerRepoFromFolder: (folderPath: string) => Promise<{ owner: string; repo: string } | { error: string }>
      }

      user: {
        login: (userCode: string, password: string) => Promise<{ status: string; data?: { token: string; user: any }; message?: string }>
        logout: () => Promise<{ status: string }>
        verify: (token: string) => Promise<{ status: string; data?: any }>
        getCurrentUser: () => Promise<{ status: string; data?: any }>
        changePassword: (token: string, oldPassword: string, newPassword: string) => Promise<{ status: string; code?: string; message?: string }>
        setUserPassword: (token: string, userId: string, newPassword: string) => Promise<{ status: string; code?: string; message?: string }>
        getUserRoles: (userId: string) => Promise<{ status: string; data?: { id: string; userId: string; projectId: string | null; role: string }[]; message?: string }>
        setUserProjectRole: (token: string, userId: string, projectId: string | null, role: 'dev' | 'pl' | 'pm') => Promise<{ status: string; code?: string; message?: string }>
        removeUserProjectRole: (token: string, userId: string, projectId: string | null, role: 'dev' | 'pl' | 'pm') => Promise<{ status: string; code?: string; message?: string }>
        getUsers: () => Promise<{ status: string; data?: any; code?: string; message?: string }>
        createUser: (input: { userCode: string; name: string; email?: string }) => Promise<{ status: string; data?: any; message?: string }>
        updateUser: (id: string, data: { userCode?: string; name?: string; email?: string; receiveCommitNotification?: boolean }) => Promise<{ status: string; message?: string }>
        deleteUser: (id: string) => Promise<{ status: string; message?: string }>
        selectAvatarFile: () => Promise<string>
        readAvatarFileAsDataUrl: (sourceFilePath: string) => Promise<{ status: string; data?: { dataUrl: string }; message?: string }>
        uploadAvatar: (sourceFilePathOrDataUrl: string) => Promise<{ status: string; data?: { avatarUrl: string }; message?: string }>
        getAvatarUrl: (userId: string) => Promise<string | null>
      }

      master: {
        getMasterStatusesAll: () => Promise<{ status: string; data?: any; message?: string }>
        getMasterPrioritiesAll: () => Promise<{ status: string; data?: any; message?: string }>
        getMasterTypesAll: () => Promise<{ status: string; data?: any; message?: string }>
        getMasterSourcesAll: () => Promise<{ status: string; data?: any; message?: string }>
        getMasterTaskLinkTypesAll: () => Promise<{ status: string; data?: { code: string; name: string }[]; message?: string }>
        createMasterStatus: (input: { code: string; name: string; sort_order?: number; color?: string }) => Promise<{ status: string; data?: any; message?: string }>
        updateMasterStatus: (
          code: string,
          data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }
        ) => Promise<{ status: string; data?: any; message?: string }>
        deleteMasterStatus: (code: string) => Promise<{ status: string; message?: string }>
        createMasterPriority: (input: { code: string; name: string; sort_order?: number; color?: string }) => Promise<{ status: string; data?: any; message?: string }>
        updateMasterPriority: (
          code: string,
          data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }
        ) => Promise<{ status: string; data?: any; message?: string }>
        deleteMasterPriority: (code: string) => Promise<{ status: string; message?: string }>
        createMasterType: (input: { code: string; name: string; sort_order?: number; color?: string }) => Promise<{ status: string; data?: any; message?: string }>
        updateMasterType: (
          code: string,
          data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }
        ) => Promise<{ status: string; data?: any; message?: string }>
        deleteMasterType: (code: string) => Promise<{ status: string; message?: string }>
        createMasterSource: (input: { code: string; name: string; sort_order?: number }) => Promise<{ status: string; data?: any; message?: string }>
        updateMasterSource: (code: string, data: { name?: string; sort_order?: number; is_active?: boolean }) => Promise<{ status: string; data?: any; message?: string }>
        deleteMasterSource: (code: string) => Promise<{ status: string; message?: string }>
      }

      task: {
        getReminderStats: (token: string) => Promise<{
          status: string
          data?: {
            reminderSections?: { showDev: boolean; showPl: boolean }
            devStats: { todayCount: number; tomorrowCount?: number; nearDeadlineCount: number; overdueCount: number }
            plStats: { needReviewCount: number; longUnreviewedCount: number }
          }
          message?: string
        }>
        sendDeadlineReminders: () => Promise<{ status: string; message?: string }>
        getProjectMembers: (projectId: string) => Promise<{
          status: string
          data?: {
            pls: { userId: string; name: string; userCode: string }[]
            devs: { userId: string; name: string; userCode: string }[]
            pms: { userId: string; name: string; userCode: string }[]
            canManagePl?: boolean
            canManagePm?: boolean
            canManageDev?: boolean
          }
          message?: string
        }>
        getAll: (projectId?: string) => Promise<{ status: string; data?: any; code?: string; message?: string }>
        listForPickerPage: (params: {
          offset: number
          limit: number
          search?: string
          pickerMode: 'link' | 'subtask'
          contextProjectId?: string | null
          excludeTaskIds: string[]
        }) => Promise<{
          status: string
          data?: { items: { id: string; title: string; ticketId: string; projectId: string | null }[]; hasMore: boolean }
          message?: string
        }>
        listForManagement: (params: {
          page: number
          limit: number
          search?: string
          statusCodes?: string[]
          assigneeUserIds?: string[]
          typeCodes?: string[]
          priorityCodes?: string[]
          projectIds?: string[]
          dateRange?: { from: string; to?: string }
          sortColumn?: string | null
          sortDirection?: 'asc' | 'desc'
          /** false = chỉ COUNT+SELECT trang (nhanh hơn khi đổi page/sort) */
          includeFacets?: boolean
        }) => Promise<{
          status: string
          code?: string
          data?: {
            tasks: any[]
            total: number
            facets: {
              status: Record<string, number>
              priority: Record<string, number>
              type: Record<string, number>
              assignee: Record<string, number>
              project: Record<string, number>
            } | null
          }
          message?: string
        }>
        listForManagementCharts: (params: {
          search?: string
          statusCodes?: string[]
          assigneeUserIds?: string[]
          typeCodes?: string[]
          priorityCodes?: string[]
          projectIds?: string[]
          dateRange?: { from: string; to?: string }
        }) => Promise<{ status: string; data?: any[]; message?: string }>
        getManagementScopeMeta: () => Promise<{
          status: string
          data?: { hasUnassignedTask: boolean; assigneeIdsOnTasks: string[] }
          message?: string
        }>
        getTask: (id: string) => Promise<{ status: string; data?: any; code?: string; message?: string }>
        create: (input: any) => Promise<{ status: string; data?: any; message?: string }>
        updateStatus: (id: string, status: string) => Promise<{ status: string; message?: string }>
        updateProgress: (id: string, progress: number) => Promise<{ status: string; message?: string }>
        updateDates: (
          id: string,
          dates: { planStartDate?: string; planEndDate?: string; actualStartDate?: string; actualEndDate?: string }
        ) => Promise<{ status: string; message?: string }>
        updateTask: (id: string, data: Record<string, unknown>) => Promise<{ status: string; code?: string; message?: string }>
        deleteTask: (id: string, version?: number) => Promise<{ status: string; code?: string; message?: string }>
        canEditTask: (taskId: string) => Promise<{ status: string; data?: { canEdit: boolean; canDelete: boolean }; message?: string }>
        assign: (id: string, assigneeUserId: string | null) => Promise<{ status: string; message?: string }>
        checkOnedrive: () => Promise<{ ok: boolean; code?: string }>
        checkTaskApi: () => Promise<{ ok: boolean; code?: string; error?: string }>
        checkTaskSchemaApplied: () => Promise<{ ok: true; applied: boolean } | { ok: false; code: 'TASK_DB_NOT_CONFIGURED' | 'TASK_DB_CHECK_FAILED'; error?: string }>
        initSchema: () => Promise<{ recreated: boolean }>
        getIntegrationsForSettings: (token: string) => Promise<
          | {
              status: 'success'
              data: {
                mail: { smtpServer: string; port: string; email: string; password: string }
                onedrive: { clientId: string; clientSecret: string; refreshToken: string }
                db: { host: string; port: string; user: string; password: string; databaseName: string }
              }
            }
          | { status: 'error'; code?: string; message?: string }
        >
        saveIntegrationsSettings: (
          token: string,
          payload: {
            mail: { smtpServer: string; port: string; email: string; password: string }
            onedrive: { clientId: string; clientSecret: string; refreshToken: string }
            db: { host: string; port: string; user: string; password: string; databaseName: string }
          }
        ) => Promise<{ status: 'success' } | { status: 'error'; code?: string; message?: string }>
        getProjects: () => Promise<{ status: string; data?: any; message?: string }>
        getProjectsForTaskUi: () => Promise<{ status: string; data?: any; message?: string }>
        getProjectsForUser: () => Promise<{ status: string; data?: any; message?: string }>
        getProjectsForLeaderboardPicker: () => Promise<{
          status: string
          data?: { scope: 'admin' | 'managed' | 'dev'; projects: { id: string; name: string }[] }
          message?: string
        }>
        upsertUserProjectSourceFolder: (projectId: string, sourceFolderPath: string, sourceFolderName?: string) => Promise<{ status: string; message?: string }>
        getSourceFoldersByProject: (projectId: string) => Promise<{ status: string; data?: { id: string; name: string; path: string }[]; message?: string }>
        getSourceFoldersByProjects: (projectIds: string[]) => Promise<{ status: string; data?: { id: string; name: string; path: string }[]; message?: string }>
        getUserProjectSourceFolderMappings: () => Promise<{ status: string; data?: { projectId: string; sourceFolderPath: string }[]; message?: string }>
        deleteUserProjectSourceFolder: (sourceFolderPath: string) => Promise<{ status: string; code?: string; message?: string }>
        getProjectIdByUserAndPath: (sourceFolderPath: string) => Promise<{ status: string; data?: string | null; message?: string }>
        hasPlRole: (userId: string) => Promise<{ status: string; data?: boolean; message?: string }>
        createProject: (name: string, pmUserId?: string | null) => Promise<{ status: string; data?: any; message?: string }>
        updateProject: (id: string, name: string, version?: number) => Promise<{ status: string; data?: any; message?: string }>
        getProjectReminderTime: (projectId: string) => Promise<{ status: string; data?: string | null; message?: string }>
        updateProjectReminderTime: (projectId: string, time: string | null) => Promise<{ status: string; message?: string }>
        deleteProject: (id: string, version?: number) => Promise<{ status: string; message?: string }>
        getTaskChildren: (taskId: string) => Promise<{ status: string; data?: any; message?: string }>
        createTaskChild: (taskId: string, input: any) => Promise<{ status: string; data?: any; message?: string }>
        getTaskLinks: (taskId: string) => Promise<{ status: string; data?: any; message?: string }>
        createTaskLink: (taskId: string, toTaskId: string, linkType: string) => Promise<{ status: string; data?: any; message?: string }>
        deleteTaskLink: (taskId: string, linkId: string, version?: number) => Promise<{ status: string; message?: string }>
        getFavoriteTaskIds: () => Promise<{ status: string; data?: string[]; message?: string }>
        addTaskFavorite: (taskId: string) => Promise<{ status: string; message?: string }>
        removeTaskFavorite: (taskId: string) => Promise<{ status: string; message?: string }>
        copyTask: (taskId: string) => Promise<{ status: string; data?: any; message?: string }>
        selectCsvFile: () => Promise<{ canceled: boolean; content?: string; error?: string }>
        importRedmineCsv: (csvContent: string) => Promise<{
          status: string
          created?: number
          updated?: number
          errors?: string[]
          code?: string
          message?: string
        }>
        codingRule: {
          getForSelection: (sourceFolderPath: string) => Promise<{ status: string; data?: any; message?: string }>
          getGlobalOnly: () => Promise<{ status: string; data?: any; message?: string }>
          getContent: (idOrName: string, options?: { sourceFolderPath?: string; userId?: string }) => Promise<{ status: string; data?: any; message?: string }>
          create: (input: { name: string; content: string; projectId?: string | null }) => Promise<{ status: string; data?: any; message?: string }>
          update: (id: string, input: { name?: string; content?: string }) => Promise<{ status: string; data?: any; message?: string }>
          delete: (id: string) => Promise<{ status: string; message?: string }>
          getForManagement: () => Promise<{ status: string; data?: any; message?: string }>
        }
        commitReview: {
          save: (record: {
            sourceFolderPath: string
            commitId: string
            vcsType: 'git' | 'svn'
            reviewerUserId?: string | null
            note?: string | null
          }) => Promise<{ status: string; message?: string }>
          delete: (sourceFolderPath: string, commitId: string, version?: number) => Promise<{ status: string; message?: string }>
          get: (sourceFolderPath: string, commitId: string) => Promise<{ status: string; data?: any; message?: string }>
          getAllBySourceFolder: (sourceFolderPath: string) => Promise<{ status: string; data?: any[]; message?: string }>
          getReviewedIds: (sourceFolderPath: string) => Promise<{ status: string; data?: string[]; message?: string }>
        }
      }

      on: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => void
      removeListener: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => void
      removeAllListeners: (channel: string) => void

      achievement: {
        getStats: () => Promise<{ status: string; data?: any; message?: string }>
        getBadges: () => Promise<{ status: string; data?: { badges: any[]; pinned: any[] }; message?: string }>
        getAllDefinitions: () => Promise<{ status: string; data?: any[]; message?: string }>
        pinBadge: (codes: string[]) => Promise<{ status: string; message?: string }>
        getLeaderboard: () => Promise<{ status: string; data?: any[]; message?: string }>
        getLeaderboardByProject: (projectId: string | null) => Promise<{ status: string; data?: any[]; message?: string }>
        getAchievementRarities: () => Promise<{ status: string; data?: { totalUsers: number; rarities: Record<string, number> }; message?: string }>
        previewToast: (achievementCode?: string) => Promise<{ status: string; message?: string }>
        previewRankUp: (rankCode?: string) => Promise<{ status: string; message?: string }>
        getStatsForUser: (userId: string) => Promise<{ status: string; data?: any; message?: string }>
        getBadgesForUser: (userId: string) => Promise<{ status: string; data?: { badges: any[]; pinned: any[] }; message?: string }>
      }

      pr: {
        tokenSet: (token: string) => Promise<{ status: string; login?: string; message?: string }>
        tokenCheck: () => Promise<{ status: string; login?: string; message?: string }>
        tokenRemove: () => Promise<{ status: string; message?: string }>
        rateLimitGet: () => Promise<{
          status: string
          data?: {
            core: { limit: number; remaining: number; reset: number; used: number }
            search: { limit: number; remaining: number; reset: number; used: number } | null
            graphql: { limit: number; remaining: number; reset: number; used: number } | null
          }
          message?: string
        }>
        repoList: (projectId: string) => Promise<{ status: string; data?: any[]; message?: string }>
        repoUpsert: (input: {
          id?: string
          projectId: string
          name: string
          localPath?: string | null
          remoteUrl: string
          defaultBaseBranch?: string | null
        }) => Promise<{ status: string; data?: any; message?: string }>
        repoRemove: (id: string) => Promise<{ status: string; message?: string }>
        repoAutodetect: (userId: string, projectId: string) => Promise<{ status: string; data?: { added: any[]; skipped: any[] }; message?: string }>
        templateList: (projectId: string) => Promise<{ status: string; data?: any[]; message?: string }>
        templateUpsert: (input: {
          id?: string
          projectId: string
          code: string
          label: string
          targetBranch?: string | null
          sortOrder?: number
          isActive?: boolean
        }) => Promise<{ status: string; data?: any; message?: string }>
        templateDelete: (id: string) => Promise<{ status: string; message?: string }>
        templateReorder: (projectId: string, orderedIds: string[]) => Promise<{ status: string; message?: string }>
        templateSeedDefault: (projectId: string) => Promise<{ status: string; data?: any[]; message?: string }>
        trackedList: (projectId: string) => Promise<{ status: string; data?: any[]; message?: string }>
        trackedUpsert: (input: {
          id?: string
          projectId: string
          repoId: string
          branchName: string
          assigneeUserId?: string | null
          note?: string | null
        }) => Promise<{ status: string; data?: any; message?: string }>
        trackedUpdateStatusNote: (id: string, patch: { note?: string | null; assigneeUserId?: string | null }) => Promise<{ status: string; message?: string }>
        trackedDelete: (id: string) => Promise<{ status: string; message?: string }>
        trackedSyncFromGithub: (projectId: string) => Promise<{ status: string; data?: { synced: number; branchesSynced?: number; errors: string[] }; message?: string }>
        onTrackedSyncProgress: (callback: (payload: { projectId: string; done: number; total: number; percent: number }) => void) => () => void
        prCreate: (input: {
          projectId: string
          repoId: string
          owner: string
          repo: string
          title: string
          body?: string
          head: string
          base: string
          draft?: boolean
          openInBrowser?: boolean
          assigneeUserId?: string | null
        }) => Promise<{ status: string; data?: any; message?: string; trackingError?: string }>
        prMerge: (input: {
          projectId: string
          repoId: string
          owner: string
          repo: string
          number: number
          method: 'squash' | 'merge' | 'rebase'
          commitTitle?: string
          commitMessage?: string
        }) => Promise<{ status: string; data?: { merged: boolean; message?: string }; message?: string }>
        prList: (input: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; base?: string; head?: string }) => Promise<{ status: string; data?: any[]; message?: string }>
        prGet: (input: { owner: string; repo: string; number: number }) => Promise<{ status: string; data?: any; message?: string }>
        prGetCommits: (input: { owner: string; repo: string; number: number }) => Promise<{ status: string; data?: any[]; message?: string }>
        prLocalMergeConflicts: (input: { repoId: string; prNumber: number; base: string; headSha: string }) => Promise<
          | {
              status: 'success'
              data: { hasConflict: boolean; paths: string[]; localSaysClean: boolean }
            }
          | { status: 'unavailable'; reason: string; message: string }
          | { status: 'error'; message: string }
        >
        prFilesList: (input: { owner: string; repo: string; number: number }) => Promise<{
          status: string
          data?: {
            filename: string
            status: string
            patch: string | null
            patchTruncated: boolean
            additions: number
            deletions: number
            blobUrl: string | null
          }[]
          message?: string
        }>
        prIssueCommentsList: (input: { owner: string; repo: string; number: number }) => Promise<{
          status: string
          data?: {
            id: number
            body: string
            userLogin: string | null
            userAvatarUrl: string | null
            createdAt: string
            updatedAt: string
            htmlUrl: string | null
          }[]
          message?: string
        }>
        prIssueCommentCreate: (input: { owner: string; repo: string; number: number; body: string }) => Promise<{
          status: string
          data?: {
            id: number
            body: string
            userLogin: string | null
            userAvatarUrl: string | null
            createdAt: string
            updatedAt: string
            htmlUrl: string | null
          }
          message?: string
        }>
        prReviewApprove: (input: { owner: string; repo: string; number: number; headSha: string; body?: string }) => Promise<{
          status: string
          data?: { id: number; state: string; htmlUrl: string | null }
          message?: string
        }>
        prMarkReady: (input: { owner: string; repo: string; number: number }) => Promise<{
          status: string
          data?: any
          message?: string
        }>
        prMarkDraft: (input: { owner: string; repo: string; number: number }) => Promise<{
          status: string
          data?: any
          message?: string
        }>
        prClose: (input: { owner: string; repo: string; number: number }) => Promise<{
          status: string
          data?: any
          message?: string
        }>
        prUpdateBranch: (input: { owner: string; repo: string; number: number; expectedHeadSha?: string | null }) => Promise<{
          status: string
          data?: any
          message?: string
        }>
        branchListRemote: (input: { owner: string; repo: string }) => Promise<{ status: string; data?: string[]; message?: string }>
        githubRemoteBranchesExist: (items: { id: string; owner: string; repo: string; branch: string }[]) => Promise<{
          status: string
          data?: Record<string, boolean>
          message?: string
        }>
        githubDeleteRemoteBranch: (input: { owner: string; repo: string; branch: string; repoId: string }) => Promise<{
          status: string
          message?: string
        }>
        refCommitMessages: (input: { owner: string; repo: string; ref: string; maxCommits?: number }) => Promise<{
          status: string
          data?: string[]
          message?: string
        }>
        branchLastCommitMessage: (input: { owner: string; repo: string; branch: string }) => Promise<{ status: string; data?: string | null; message?: string }>
        localLastCommitMessage: (input: { cwd: string; branch?: string }) => Promise<{ status: string; data?: string | null; message?: string }>
        branchCommits: (input: { owner: string; repo: string; branch: string; perPage?: number }) => Promise<{
          status: string
          data?: { sha: string; shortSha: string; message: string; author?: string | null; date?: string | null; htmlUrl?: string | null }[]
          message?: string
        }>
        branchResetHard: (input: { repoId: string; branch: string; sha: string }) => Promise<{ status: string; message?: string }>
        branchForcePush: (input: { repoId: string; branch: string }) => Promise<{ status: string; message?: string }>
        automationList: (repoId?: string) => Promise<{ status: string; data?: any[]; message?: string }>
        automationUpsert: (input: {
          id?: string
          repoId: string
          name?: string | null
          triggerEvent: string
          sourcePattern?: string | null
          targetBranch?: string | null
          action: string
          nextTarget?: string | null
          prTitleTemplate?: string | null
          prBodyTemplate?: string | null
          isActive?: boolean
        }) => Promise<{ status: string; data?: any; message?: string }>
        automationDelete: (id: string) => Promise<{ status: string; message?: string }>
        automationToggle: (id: string, isActive: boolean) => Promise<{ status: string; message?: string }>
        onCheckpointUpdated: (callback: (payload: { trackedBranchId: string; templateId: string }) => void) => () => void
        onAutomationFired: (
          callback: (payload: { automationId: string; repoId: string; sourceBranch: string; from: string; to: string; prNumber: number; prUrl: string }) => void
        ) => () => void
        onTokenInvalid: (callback: (payload: { message: string }) => void) => () => void
      }

      progress: {
        openWindow: () => void
        getAllUsers: () => Promise<{ status: string; data?: any[]; message?: string }>
        getHeatmap: (userId: string, year: number) => Promise<{ status: string; data?: any[]; message?: string }>
        getTrend: (userId: string, from: string, to: string, granularity: 'day' | 'week' | 'month') => Promise<{ status: string; data?: any[]; message?: string }>
        getRadar: (userId: string, yearMonth: string) => Promise<{ status: string; data?: any; message?: string }>
        getRadarRange: (userId: string, from: string, to: string) => Promise<{ status: string; data?: any; message?: string }>
        getTaskPerformance: (userId: string, from: string, to: string, projectId?: string | null) => Promise<{ status: string; data?: any; message?: string }>
        getQualityTrend: (
          userId: string,
          weeksBack: number,
          teamUserIds?: string[] | null,
          from?: string | null,
          to?: string | null
        ) => Promise<{ status: string; data?: any; message?: string }>
        getProductiveHours: (userId: string, weeksBack: number, from?: string | null, to?: string | null) => Promise<{ status: string; data?: any[]; message?: string }>
        getMonthlyHighlights: (userId: string, yearMonth: string) => Promise<{ status: string; data?: any; message?: string }>
        getTeamSummary: (payload: { userIds: string[]; from: string; to: string; projectId?: string | null }) => Promise<{ status: string; data?: any[]; message?: string }>
        getTeamOverviewUserProjects: (userIds: string[]) => Promise<{ status: string; data?: Record<string, string>; message?: string }>
        getOverviewProjects: () => Promise<{ status: string; data?: any[]; message?: string }>
        getProjectMemberUserIds: (projectId: string) => Promise<{ status: string; data?: string[]; message?: string }>
      }
      teamProgress: {
        openWindow: () => void
      }
      reportManager: {
        openWindow: () => void
      }
      prManager: {
        openWindow: () => void
        closeWindow: () => void
        requestDock: () => void
      }
    }
  }
}

// Expose APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  electron: {
    send: (channel: string, data?: any) => ipcRenderer.send(channel, data),
  },

  resources: {
    publicAssetUrl: (pathFromPublicRoot: string) => {
      const normalized = pathFromPublicRoot.replace(/^[/\\]+/, '')
      if (!getElectronAppIsPackaged()) {
        return `/${normalized}`
      }
      return pathToFileURL(path.join(process.resourcesPath, 'public', normalized)).href
    },
  },

  appLogs: {
    read: () => ipcRenderer.invoke(IPC.APP_LOGS.READ),
  },

  appearance: {
    set: (key: string, value: any) => ipcRenderer.invoke(IPC.SETTING.APPEARANCE.SET, key, value),
  },

  configuration: {
    get: () => ipcRenderer.invoke(IPC.SETTING.CONFIGURATION.GET),
    set: (data: any) => ipcRenderer.invoke(IPC.SETTING.CONFIGURATION.SET, toStructuredCloneable(data)),
    patch: (partial: any) => ipcRenderer.invoke(IPC.SETTING.CONFIGURATION.PATCH, toStructuredCloneable(partial ?? {})),
    patchSilent: (partial: any) => ipcRenderer.invoke(IPC.SETTING.CONFIGURATION.PATCH_SILENT, toStructuredCloneable(partial ?? {})),
    setMultirepoWatchPaths: (paths: string[]) => ipcRenderer.invoke(IPC.SETTING.SET_MULTIREPO_WATCH_PATHS, toStructuredCloneable(paths ?? [])),
    exportBackup: () => ipcRenderer.invoke(IPC.SETTING.CONFIG.EXPORT),
    importBackup: (jsonString: string) => ipcRenderer.invoke(IPC.SETTING.CONFIG.IMPORT, jsonString),
    exportToFile: () => ipcRenderer.invoke('setting:config:export-to-file'),
    importFromFile: () => ipcRenderer.invoke('setting:config:import-from-file'),
  },

  mail_server: {
    get: () => ipcRenderer.invoke(IPC.SETTING.MAIL_SERVER.GET),
    set: (data: MailServerConfig) => ipcRenderer.invoke(IPC.SETTING.MAIL_SERVER.SET, toStructuredCloneable(data)),
    test: (config?: MailServerConfig) =>
      config != null ? ipcRenderer.invoke(IPC.SETTING.MAIL_SERVER.TEST, toStructuredCloneable(config)) : ipcRenderer.invoke(IPC.SETTING.MAIL_SERVER.TEST),
  },

  openai: {
    send_message: (data: { type: keyof typeof PROMPT; values: Record<string, string> }) => {
      const { type, values } = data
      let resolvedValues = { ...values }

      if (type === 'GENERATE_COMMIT') {
        const level = (values.commitMessageDetailLevel || 'normal') as 'detail' | 'normal' | 'simple'
        const detailMap: Record<string, { instruction: string; maxTokens: number }> = {
          detail: {
            instruction: 'Provide a detailed commit message. Include comprehensive bullet points. Maximum 2400 characters.',
            maxTokens: 600,
          },
          normal: {
            instruction: 'Provide a concise commit message with key bullet points. Maximum 1200 characters.',
            maxTokens: 300,
          },
          simple: {
            instruction: 'Provide a brief commit message. One-line summary plus minimal bullet points. Maximum 600 characters.',
            maxTokens: 150,
          },
        }
        const { instruction, maxTokens } = detailMap[level] ?? detailMap.normal
        resolvedValues = { ...resolvedValues, detail_instruction: instruction }
        const template = PROMPT[type]
        const prompt = Object.entries(resolvedValues).reduce((result, [key, val]) => {
          if (key !== 'codingRuleName' && key !== 'codingRuleId' && key !== 'commitMessageDetailLevel') {
            return result.replaceAll(`{${key}}`, val)
          }
          return result
        }, template)
        return ipcRenderer.invoke(IPC.OPENAI.SEND_MESSAGE, {
          prompt,
          codingRuleId: values.codingRuleId,
          codingRuleName: values.codingRuleName,
          maxTokens,
          feature: type,
        })
      }

      const template = PROMPT[type]
      const prompt = Object.entries(resolvedValues).reduce((result, [key, val]) => {
        if (key !== 'codingRuleName' && key !== 'commitMessageDetailLevel') {
          return result.replaceAll(`{${key}}`, val)
        }
        return result
      }, template)

      return ipcRenderer.invoke(IPC.OPENAI.SEND_MESSAGE, {
        prompt,
        codingRuleId: values.codingRuleId,
        codingRuleName: values.codingRuleName,
        feature: type,
      })
    },
    chat: (prompt: string) => {
      return ipcRenderer.invoke(IPC.OPENAI.SEND_MESSAGE, { prompt, feature: AI_FEATURE_SPOTBUGS_CHAT })
    },
  },

  aiUsage: {
    getSummary: () => ipcRenderer.invoke(IPC.AI_USAGE.GET_SUMMARY),
    clear: () => ipcRenderer.invoke(IPC.AI_USAGE.CLEAR),
    fetchExchangeRates: () => ipcRenderer.invoke(IPC.AI_USAGE.FETCH_EXCHANGE_RATES),
    getExchangeState: () => ipcRenderer.invoke(IPC.AI_USAGE.GET_EXCHANGE_STATE),
    setDisplayCurrency: (currency: 'USD' | 'VND' | 'JPY') => ipcRenderer.invoke(IPC.AI_USAGE.SET_DISPLAY_CURRENCY, currency),
  },

  notification: {
    send_support_feedback: (data: SupportFeedback) => ipcRenderer.invoke(IPC.NOTIFICATIONS.SEND_SUPPORT_FEEDBACK, data),
  },

  vcs: {
    svn_list_users: () => ipcRenderer.invoke(IPC.VCS.SVN_LIST_USERS),
    svn_remove_credential: (realm: string) => ipcRenderer.invoke(IPC.VCS.SVN_REMOVE_CREDENTIAL, realm),
    git_get_config: (cwd?: string) => ipcRenderer.invoke(IPC.VCS.GIT_GET_CONFIG, cwd),
    git_set_config: (userName: string, userEmail: string, scope: 'global' | 'local', cwd?: string) => ipcRenderer.invoke(IPC.VCS.GIT_SET_CONFIG, userName, userEmail, scope, cwd),
    git_list_credentials: () => ipcRenderer.invoke(IPC.VCS.GIT_LIST_CREDENTIALS),
    git_remove_credential: (params: { host: string; username?: string; source: string; targetName?: string }) => ipcRenderer.invoke(IPC.VCS.GIT_REMOVE_CREDENTIAL, params),
  },

  svn: {
    changed_files: (targetPath: string) => ipcRenderer.invoke(IPC.SVN.CHANGED_FILES, targetPath),
    get_diff: (selectedFiles: any[]) => ipcRenderer.invoke(IPC.SVN.GET_DIFF, selectedFiles),
    commit: (commitMessage: string, selectedFiles: any[], options: { hasCheckCodingRule: boolean; hasCheckSpotbugs: boolean }) =>
      ipcRenderer.invoke(IPC.SVN.COMMIT, commitMessage, selectedFiles, options),
    info: (filePath: string) => ipcRenderer.invoke(IPC.SVN.INFO, filePath),
    getCurrentRevision: (cwd?: string) => ipcRenderer.invoke(IPC.SVN.GET_CURRENT_REVISION, cwd),
    infoWithStream: (filePath: string) => ipcRenderer.invoke(IPC.SVN.INFO_WITH_STREAM, filePath),
    onInfoStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.SVN.INFO_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.SVN.INFO_STREAM, handler)
    },
    cat: (filePath: string, fileStatus: string, revision?: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.SVN.CAT, filePath, fileStatus, revision, options),
    blame: (filePath: string) => ipcRenderer.invoke(IPC.SVN.BLAME, filePath),
    revert: (filePath: string | string[]) => ipcRenderer.invoke(IPC.SVN.REVERT, filePath),
    cleanup: (options?: string[]) => ipcRenderer.invoke(IPC.SVN.CLEANUP, options),
    log: (filePath: string | string[], options?: { dateFrom?: string; dateTo?: string; revisionFrom?: string; revisionTo?: string; cwd?: string }) =>
      ipcRenderer.invoke(IPC.SVN.LOG, filePath, options),
    update: (filePath?: string | string[], revision?: string) => ipcRenderer.invoke(IPC.SVN.UPDATE, filePath, revision),
    onUpdateStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.SVN.UPDATE_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.SVN.UPDATE_STREAM, handler)
    },
    onCommitStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.SVN.COMMIT_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.SVN.COMMIT_STREAM, handler)
    },
    open_diff: (filePath: string, options?: { fileStatus: string; revision?: string; currentRevision?: string }) =>
      ipcRenderer.send(IPC.WINDOW.DIFF_WINDOWS, { filePath, ...options }),
    statistics: (filePath: string, options?: { period?: 'day' | 'week' | 'month' | 'year' | 'all'; dateFrom?: string; dateTo?: string }) =>
      ipcRenderer.invoke(IPC.SVN.STATISTICS, filePath, options),
    merge: (options: { sourcePath: string; targetPath: string; dryRun?: boolean; revision?: string }) => ipcRenderer.invoke(IPC.SVN.MERGE, options),
    merge_resolve_conflict: (filePath: string, resolution: 'working' | 'theirs' | 'mine' | 'base' | '', isRevisionConflict?: boolean, targetPath?: string) =>
      ipcRenderer.invoke(IPC.SVN.MERGE_RESOLVE_CONFLICT, filePath, resolution, isRevisionConflict, targetPath),
    merge_create_snapshot: (targetPath: string) => ipcRenderer.invoke(IPC.SVN.MERGE_CREATE_SNAPSHOT, targetPath),
    merge_get_commits: (options: { sourcePath: string; targetPath: string; revision?: string }) => ipcRenderer.invoke(IPC.SVN.MERGE_GET_COMMITS, options),
    get_conflict_status: (sourceFolder?: string) => ipcRenderer.invoke(IPC.SVN.GET_CONFLICT_STATUS, sourceFolder),
    get_conflict_detail: (filePath: string, sourceFolder?: string) => ipcRenderer.invoke(IPC.SVN.GET_CONFLICT_DETAIL, filePath, sourceFolder),
    resolve_conflict_with_content: (filePath: string, resolvedContent: string, sourceFolder?: string) =>
      ipcRenderer.invoke(IPC.SVN.RESOLVE_CONFLICT_WITH_CONTENT, filePath, resolvedContent, sourceFolder),
  },

  git: {
    status: (options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.STATUS, options),
    log: (filePath: string | string[], options?: any) => ipcRenderer.invoke(IPC.GIT.LOG, filePath, options),
    log_graph: (filePath: string | string[], options?: any) => ipcRenderer.invoke(IPC.GIT.LOG_GRAPH, filePath, options),
    getCommitFiles: (commitHash: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.GET_COMMIT_FILES, commitHash, options),
    commit: (
      commitMessage: string,
      selectedFiles: string[],
      options: {
        hasCheckCodingRule: boolean
        hasCheckSpotbugs: boolean
        amend?: boolean
        signOff?: boolean
        scope?: 'staged' | 'all'
        cwd?: string
      }
    ) => ipcRenderer.invoke(IPC.GIT.COMMIT, commitMessage, selectedFiles, options),
    scanStagedSecrets: (payload: { repos: { cwd: string; label?: string }[]; configPath?: string; timeoutMs?: number }) =>
      ipcRenderer.invoke(IPC.GIT.GITLEAKS_SCAN_STAGED, payload),
    undo_commit: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.UNDO_COMMIT, cwd),
    get_diff: (selectedFiles: string[], options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.GET_DIFF, selectedFiles, options),
    get_staged_diff: () => ipcRenderer.invoke(IPC.GIT.GET_STAGED_DIFF),
    getCommitDiff: (commitHash: string, filePath?: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.GET_COMMIT_DIFF, commitHash, filePath, options),
    getParentCommit: (commitHash: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.GET_PARENT_COMMIT, commitHash, options),
    cat: (filePath: string, fileStatus: string, commitHash?: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.CAT, filePath, fileStatus, commitHash, options),
    open_diff: (filePath: string, options?: { fileStatus: string; commitHash?: string; currentCommitHash?: string; isRootCommit?: boolean; cwd?: string }) =>
      ipcRenderer.send(IPC.WINDOW.DIFF_WINDOWS, { filePath, isGit: true, ...options }),
    revert: (filePath: string | string[]) => ipcRenderer.invoke(IPC.GIT.REVERT, filePath),
    discardChanges: (paths: string[], cwd?: string) => ipcRenderer.invoke(IPC.GIT.DISCARD_CHANGES, paths, cwd),
    discardFiles: (paths: string[], cwd?: string) => ipcRenderer.invoke(IPC.GIT.DISCARD_FILES, paths, cwd),
    reset_staged: (files?: string[], options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.RESET_STAGED, files, options),
    add: (files: string[], options?: { cwd?: string }) => ipcRenderer.invoke(IPC.GIT.ADD, files, options),
    get_branches: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.GET_BRANCHES, cwd),
    create_branch: (branchName: string, sourceBranch?: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.CREATE_BRANCH, branchName, sourceBranch, cwd),
    checkout_branch: (branchName: string, options?: { force?: boolean; stash?: boolean }, cwd?: string) => ipcRenderer.invoke(IPC.GIT.CHECKOUT_BRANCH, branchName, options, cwd),
    delete_branch: (branchName: string, force: boolean) => ipcRenderer.invoke(IPC.GIT.DELETE_BRANCH, branchName, force),
    delete_remote_branch: (remote: string, branchName: string) => ipcRenderer.invoke(IPC.GIT.DELETE_REMOTE_BRANCH, remote, branchName),
    rename_branch: (oldName: string, newName: string) => ipcRenderer.invoke(IPC.GIT.RENAME_BRANCH, oldName, newName),
    push: (remote: string, branch?: string, commitQueueData?: Record<string, any>, cwd?: string, force?: boolean) =>
      ipcRenderer.invoke(IPC.GIT.PUSH, remote, branch, commitQueueData, cwd, force),
    pull: (remote: string, branch?: string, options?: { rebase?: boolean }, cwd?: string) => ipcRenderer.invoke(IPC.GIT.PULL, remote, branch, options, cwd),
    onPullStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.GIT.PULL_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.GIT.PULL_STREAM, handler)
    },
    onCommitStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.GIT.COMMIT_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.GIT.COMMIT_STREAM, handler)
    },
    onPushStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.GIT.PUSH_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.GIT.PUSH_STREAM, handler)
    },
    onFetchStream: (callback: (chunk: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.GIT.FETCH_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC.GIT.FETCH_STREAM, handler)
    },
    fetch: (remote?: string, options?: { prune?: boolean; all?: boolean }, cwd?: string) => ipcRenderer.invoke(IPC.GIT.FETCH, remote ?? 'origin', options, cwd),
    get_remotes: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.GET_REMOTES, cwd),
    stash: (message?: string, options?: { includeUntracked?: boolean; stagedOnly?: boolean }, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH, message, options, cwd),
    stash_list: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_LIST, cwd),
    stash_show: (stashIndex: number, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_SHOW, stashIndex, cwd),
    stash_show_files: (stashIndex: number, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_SHOW_FILES, stashIndex, cwd),
    stash_show_file_diff: (stashIndex: number, filePath: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_SHOW_FILE_DIFF, stashIndex, filePath, cwd),
    stash_show_file_content: (stashIndex: number, filePath: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_SHOW_FILE_CONTENT, stashIndex, filePath, cwd),
    stash_is_likely_applied: (stashIndex: number, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_IS_LIKELY_APPLIED, stashIndex, cwd),
    stash_pop: (stashIndex: number, options?: { index?: boolean }, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_POP, stashIndex, options, cwd),
    stash_apply: (stashIndex: number, options?: { index?: boolean }, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_APPLY, stashIndex, options, cwd),
    stash_drop: (stashIndex: number, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_DROP, stashIndex, cwd),
    stash_clear: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_CLEAR, cwd),
    stash_branch: (stashIndex: number, branchName: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.STASH_BRANCH, stashIndex, branchName, cwd),
    merge: (branchName: string, strategy?: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.MERGE, branchName, strategy, cwd),
    abort_merge: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.ABORT_MERGE, cwd),
    resolve_conflict: (filePath: string, resolution: 'ours' | 'theirs' | 'both', cwd?: string) => ipcRenderer.invoke(IPC.GIT.RESOLVE_CONFLICT, filePath, resolution, cwd),
    get_merge_status: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.GET_MERGE_STATUS, cwd),
    clone: (url: string, targetPath: string, options?: { branch?: string; depth?: number }) => ipcRenderer.invoke(IPC.GIT.CLONE, url, targetPath, options),
    init: (targetPath: string) => ipcRenderer.invoke(IPC.GIT.INIT, targetPath),
    add_remote: (name: string, url: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.ADD_REMOTE, name, url, cwd),
    remove_remote: (name: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.REMOVE_REMOTE, name, cwd),
    set_remote_url: (name: string, url: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.SET_REMOTE_URL, name, url, cwd),
    cherry_pick: (commitHash: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.CHERRY_PICK, commitHash, cwd),
    abort_cherry_pick: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.ABORT_CHERRY_PICK, cwd),
    continue_cherry_pick: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.CONTINUE_CHERRY_PICK, cwd),
    get_conflict_status: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.GET_CONFLICT_STATUS, cwd),
    read_conflict_working_content: (filePath: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.READ_CONFLICT_WORKING_CONTENT, filePath, cwd),
    reset: (commitHash: string, mode: 'soft' | 'mixed' | 'hard', cwd?: string) => ipcRenderer.invoke(IPC.GIT.RESET, commitHash, mode, cwd),
    rebase: (ontoBranch: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.REBASE, ontoBranch, cwd),
    continue_rebase: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.CONTINUE_REBASE, cwd),
    abort_rebase: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.ABORT_REBASE, cwd),
    get_rebase_status: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.GET_REBASE_STATUS, cwd),
    create_tag: (tagName: string, message?: string, commitHash?: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.CREATE_TAG, tagName, message, commitHash, cwd),
    list_tags: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.LIST_TAGS, cwd),
    list_remote_tags: (remote?: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.LIST_REMOTE_TAGS, remote ?? 'origin', cwd),
    delete_tag: (tagName: string, remote?: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.DELETE_TAG, tagName, remote, cwd),
    push_tag: (tagName: string, remote: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.PUSH_TAG, tagName, remote, cwd),
    blame: (filePath: string) => ipcRenderer.invoke(IPC.GIT.BLAME, filePath),
    statistics: (filePath: string, options?: { period?: 'day' | 'week' | 'month' | 'year' | 'all'; dateFrom?: string; dateTo?: string }) =>
      ipcRenderer.invoke(IPC.GIT.STATISTICS, filePath, options),
    hooks_get: (cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOKS_GET, cwd),
    hook_get_content: (hookName: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOK_GET_CONTENT, hookName, cwd),
    hook_set_content: (hookName: string, content: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOK_SET_CONTENT, hookName, content, cwd),
    hook_delete: (hookName: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOK_DELETE, hookName, cwd),
    hook_enable: (hookName: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOK_ENABLE, hookName, cwd),
    hook_disable: (hookName: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOK_DISABLE, hookName, cwd),
    hook_get_sample: (hookName: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.HOOK_GET_SAMPLE, hookName, cwd),
    get_interactive_rebase_commits: (baseRef: string, cwd?: string) => ipcRenderer.invoke(IPC.GIT.GET_INTERACTIVE_REBASE_COMMITS, baseRef, cwd),
    start_interactive_rebase: (baseRef: string, todoItems: { hash: string; shortHash: string; action: string; message: string; author: string; date: string }[], cwd?: string) =>
      ipcRenderer.invoke(IPC.GIT.START_INTERACTIVE_REBASE, baseRef, todoItems, cwd),
  },

  updater: {
    check_for_updates: () => ipcRenderer.invoke(IPC.UPDATER.CHECK_FOR_UPDATES),
    install_updates: () => ipcRenderer.invoke(IPC.UPDATER.INSTALL_UPDATES),
    get_version: () => ipcRenderer.invoke(IPC.UPDATER.GET_VERSION),
  },

  webhook: {
    get: () => ipcRenderer.invoke(IPC.SETTING.WEBHOOK.GET),
    set: (webhook: string) => ipcRenderer.invoke(IPC.SETTING.WEBHOOK.SET, webhook),
    test: (url: string) => ipcRenderer.invoke(IPC.SETTING.WEBHOOK.TEST, url),
  },

  system: {
    select_folder: () => ipcRenderer.invoke(IPC.SYSTEM.OPEN_FOLDER),
    open_folder_in_explorer: (folderPath: string) => ipcRenderer.invoke(IPC.SYSTEM.OPEN_FOLDER_IN_EXPLORER, folderPath),
    reveal_in_file_explorer: (filePath: string) => ipcRenderer.invoke(IPC.SYSTEM.REVEAL_IN_FILE_EXPLORER, filePath),
    open_external_url: (url: string) => ipcRenderer.invoke(IPC.SYSTEM.OPEN_EXTERNAL_URL, url),
    read_file: (filePath: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.SYSTEM.READ_FILE, filePath, options),
    write_file: (filePath: string, content: string, options?: { cwd?: string }) => ipcRenderer.invoke(IPC.SYSTEM.WRITE_FILE, filePath, content, options),
    detect_version_control: (folderPath: string) => ipcRenderer.invoke(IPC.SYSTEM.DETECT_VERSION_CONTROL, folderPath),
    get_version_control_details: (folderPath: string) => ipcRenderer.invoke(IPC.SYSTEM.GET_VERSION_CONTROL_DETAILS, folderPath),
    open_in_external_editor: (filePath: string) => ipcRenderer.invoke(IPC.SYSTEM.OPEN_IN_EXTERNAL_EDITOR, filePath),
    open_terminal: (folderPath?: string) => ipcRenderer.invoke(IPC.SYSTEM.OPEN_TERMINAL, folderPath),
    select_audio_file: () => ipcRenderer.invoke(IPC.SYSTEM.SELECT_AUDIO_FILE),
    get_notification_sound_url: (filePath: string) => ipcRenderer.invoke(IPC.SYSTEM.GET_NOTIFICATION_SOUND_URL, filePath),
    get_default_notification_sound_url: () => ipcRenderer.invoke(IPC.SYSTEM.GET_DEFAULT_NOTIFICATION_SOUND_URL),
  },

  sourcefolder: {
    get: () => ipcRenderer.invoke('sourcefolder:get'),
    set: (sourceFolders: { name: string; path: string }[]) => ipcRenderer.invoke('sourcefolder:set', sourceFolders),
  },

  externalEditor: {
    get: () => ipcRenderer.invoke(IPC.SETTING.EXTERNAL_EDITOR.GET),
    set: (config: { externalEditors: { name: string; path: string }[] }) => ipcRenderer.invoke(IPC.SETTING.EXTERNAL_EDITOR.SET, config),
  },

  commitMessageHistory: {
    get: () => ipcRenderer.invoke(IPC.COMMIT_MESSAGE_HISTORY.GET),
    add: (message: { message: string; date: string }) => ipcRenderer.invoke(IPC.COMMIT_MESSAGE_HISTORY.ADD, message),
  },

  dailyReport: {
    save: (input: any) => ipcRenderer.invoke(IPC.DAILY_REPORT.SAVE, input),
    getMine: (reportDate: string) => ipcRenderer.invoke(IPC.DAILY_REPORT.GET_MINE, reportDate),
    getCommitsToday: (params: { sourceFolderPath: string; reportDate: string; vcsType: 'git' | 'svn'; author?: string }) =>
      ipcRenderer.invoke(IPC.DAILY_REPORT.GET_COMMITS_TODAY, params),
    getCommitsTodayMultiple: (params: { folders: { path: string; vcsType: 'git' | 'svn' }[]; reportDate: string; author?: string }) =>
      ipcRenderer.invoke(IPC.DAILY_REPORT.GET_COMMITS_TODAY_MULTIPLE, params),
    getMyHistory: (params: { dateFrom: string; dateTo: string; limit?: number; offset?: number; targetUserId?: string }) =>
      ipcRenderer.invoke(IPC.DAILY_REPORT.GET_MY_HISTORY, params),
    getStatistics: (reportDate: string, projectId: string) => ipcRenderer.invoke(IPC.DAILY_REPORT.GET_STATISTICS, reportDate, projectId),
    getStatisticsByDateRange: (dateFrom: string, dateTo: string, projectId: string) =>
      ipcRenderer.invoke(IPC.DAILY_REPORT.GET_STATISTICS_BY_DATE_RANGE, dateFrom, dateTo, projectId),
    listForPl: (reportDate: string, projectId?: string | null) => ipcRenderer.invoke(IPC.DAILY_REPORT.LIST_FOR_PL, reportDate, projectId ?? null),
    listForPlByDateRange: (dateFrom: string, dateTo: string, projectId?: string | null) =>
      ipcRenderer.invoke(IPC.DAILY_REPORT.LIST_FOR_PL_BY_DATE_RANGE, dateFrom, dateTo, projectId ?? null),
    getDetail: (userId: string, reportDate: string) => ipcRenderer.invoke(IPC.DAILY_REPORT.GET_DETAIL, userId, reportDate),
  },

  aiAnalysis: {
    save: (record: any) => ipcRenderer.invoke(IPC.AI_ANALYSIS.SAVE, record),
    get: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.AI_ANALYSIS.GET, sourceFolderPath),
    delete: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.AI_ANALYSIS.DELETE, sourceFolderPath),
    historySave: (record: any) => ipcRenderer.invoke(IPC.AI_ANALYSIS.HISTORY_SAVE, record),
    historyGetAll: () => ipcRenderer.invoke(IPC.AI_ANALYSIS.HISTORY_GET_ALL),
    historyGetByFolder: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.AI_ANALYSIS.HISTORY_GET_BY_FOLDER, sourceFolderPath),
    historyGetById: (id: number) => ipcRenderer.invoke(IPC.AI_ANALYSIS.HISTORY_GET_BY_ID, id),
    historyDelete: (id: number) => ipcRenderer.invoke(IPC.AI_ANALYSIS.HISTORY_DELETE, id),
  },

  gitCommitQueue: {
    add: (record: any) => ipcRenderer.invoke(IPC.GIT_COMMIT_QUEUE.ADD, record),
    removeMany: (commitHashes: string[]) => ipcRenderer.invoke(IPC.GIT_COMMIT_QUEUE.REMOVE_MANY, commitHashes),
  },

  evm: {
    getData: (projectId?: string) => ipcRenderer.invoke(IPC.EVM.GET_DATA, projectId),
    getProjects: () => ipcRenderer.invoke(IPC.EVM.GET_PROJECTS),
    ensureProjectForEvm: (projectId: string) => ipcRenderer.invoke(IPC.EVM.ENSURE_PROJECT_FOR_EVM, projectId),
    createProject: (input: any) => ipcRenderer.invoke(IPC.EVM.CREATE_PROJECT, input),
    updateProject: (projectId: string, updates: any) => ipcRenderer.invoke(IPC.EVM.UPDATE_PROJECT, projectId, updates),
    createWbs: (projectId: string, row: any) => ipcRenderer.invoke(IPC.EVM.CREATE_WBS, projectId, row),
    createWbsBatch: (projectId: string, rows: any[]) => ipcRenderer.invoke(IPC.EVM.CREATE_WBS_BATCH, projectId, rows),
    updateWbs: (id: string, updates: any) => ipcRenderer.invoke(IPC.EVM.UPDATE_WBS, id, updates),
    updateWbsMaster: (masterId: string, updates: any) => ipcRenderer.invoke(IPC.EVM.UPDATE_WBS_MASTER, masterId, updates),
    deleteWbs: (id: string) => ipcRenderer.invoke(IPC.EVM.DELETE_WBS, id),
    createAc: (projectId: string, row: any) => ipcRenderer.invoke(IPC.EVM.CREATE_AC, projectId, row),
    createAcBatch: (projectId: string, rows: any[]) => ipcRenderer.invoke(IPC.EVM.CREATE_AC_BATCH, projectId, rows),
    getMasterPhases: (projectId: string) => ipcRenderer.invoke(IPC.EVM.GET_MASTER_PHASES, projectId),
    updateAc: (id: string, updates: any) => ipcRenderer.invoke(IPC.EVM.UPDATE_AC, id, updates),
    deleteAc: (id: string) => ipcRenderer.invoke(IPC.EVM.DELETE_AC, id),
    updateMaster: (projectId: string, updates: any) => ipcRenderer.invoke(IPC.EVM.UPDATE_MASTER, projectId, updates),
    replaceWbsDayUnitsForWbs: (projectId: string, wbsId: string, entries: { workDate: string; unit: number }[]) =>
      ipcRenderer.invoke(IPC.EVM.REPLACE_WBS_DAY_UNITS_FOR_WBS, projectId, wbsId, entries),
    saveAiInsight: (args: { projectId: string; insightType: string; outputMarkdown: string; inputPayloadJson?: string | null }) =>
      ipcRenderer.invoke(IPC.EVM.SAVE_AI_INSIGHT, args),
    listAiInsights: (args: { projectId: string; insightType?: string; limit?: number; offset?: number }) => ipcRenderer.invoke(IPC.EVM.LIST_AI_INSIGHTS, args),
    getProjectPmPl: (projectId: string) => ipcRenderer.invoke(IPC.EVM.GET_PROJECT_PM_PL, projectId),
  },

  dashboard: {
    getRepoSummary: (options?: { dateFrom?: string; dateTo?: string }) => ipcRenderer.invoke(IPC.DASHBOARD.GET_REPO_SUMMARY, options),
    getCommitActivity: (options: { dateFrom: string; dateTo: string }) => ipcRenderer.invoke(IPC.DASHBOARD.GET_COMMIT_ACTIVITY, options),
    getChartData: (options?: { dateFrom?: string; dateTo?: string; path?: string }) => ipcRenderer.invoke(IPC.DASHBOARD.GET_CHART_DATA, options),
  },

  user: {
    login: (userCode: string, password: string) => ipcRenderer.invoke(IPC.USER.LOGIN, userCode, password),
    logout: () => ipcRenderer.invoke(IPC.USER.LOGOUT),
    verify: (token: string) => ipcRenderer.invoke(IPC.USER.VERIFY, token),
    getCurrentUser: () => ipcRenderer.invoke(IPC.USER.GET_CURRENT_USER),
    changePassword: (token: string, oldPassword: string, newPassword: string) => ipcRenderer.invoke(IPC.USER.CHANGE_PASSWORD, token, oldPassword, newPassword),
    setUserPassword: (token: string, userId: string, newPassword: string) => ipcRenderer.invoke(IPC.USER.SET_USER_PASSWORD, token, userId, newPassword),
    getUserRoles: (userId: string) => ipcRenderer.invoke(IPC.USER.GET_USER_ROLES, userId),
    setUserProjectRole: (token: string, userId: string, projectId: string | null, role: 'dev' | 'pl' | 'pm') =>
      ipcRenderer.invoke(IPC.USER.SET_USER_PROJECT_ROLE, token, userId, projectId, role),
    removeUserProjectRole: (token: string, userId: string, projectId: string | null, role: 'dev' | 'pl' | 'pm') =>
      ipcRenderer.invoke(IPC.USER.REMOVE_USER_PROJECT_ROLE, token, userId, projectId, role),
    getUsers: () => ipcRenderer.invoke(IPC.USER.GET_USERS),
    createUser: (input: { userCode: string; name: string; email?: string }) => ipcRenderer.invoke(IPC.USER.CREATE_USER, input),
    updateUser: (id: string, data: { userCode?: string; name?: string; email?: string; receiveCommitNotification?: boolean }) => ipcRenderer.invoke(IPC.USER.UPDATE_USER, id, data),
    deleteUser: (id: string) => ipcRenderer.invoke(IPC.USER.DELETE_USER, id),
    selectAvatarFile: () => ipcRenderer.invoke(IPC.USER.SELECT_AVATAR_FILE),
    readAvatarFileAsDataUrl: (sourceFilePath: string) => ipcRenderer.invoke(IPC.USER.READ_AVATAR_FILE_AS_DATA_URL, sourceFilePath),
    uploadAvatar: (sourceFilePathOrDataUrl: string) => ipcRenderer.invoke(IPC.USER.UPLOAD_AVATAR, sourceFilePathOrDataUrl),
    getAvatarUrl: (userId: string) => ipcRenderer.invoke(IPC.USER.GET_AVATAR_URL, userId),
  },

  master: {
    getMasterStatusesAll: () => ipcRenderer.invoke(IPC.MASTER.GET_STATUSES_ALL),
    getMasterPrioritiesAll: () => ipcRenderer.invoke(IPC.MASTER.GET_PRIORITIES_ALL),
    getMasterTypesAll: () => ipcRenderer.invoke(IPC.MASTER.GET_TYPES_ALL),
    getMasterSourcesAll: () => ipcRenderer.invoke(IPC.MASTER.GET_SOURCES_ALL),
    getMasterTaskLinkTypesAll: () => ipcRenderer.invoke(IPC.MASTER.GET_TASK_LINK_TYPES_ALL),
    createMasterStatus: (input: { code: string; name: string; sort_order?: number; color?: string }) => ipcRenderer.invoke(IPC.MASTER.CREATE_STATUS, input),
    updateMasterStatus: (code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) =>
      ipcRenderer.invoke(IPC.MASTER.UPDATE_STATUS, code, data),
    deleteMasterStatus: (code: string) => ipcRenderer.invoke(IPC.MASTER.DELETE_STATUS, code),
    createMasterPriority: (input: { code: string; name: string; sort_order?: number; color?: string }) => ipcRenderer.invoke(IPC.MASTER.CREATE_PRIORITY, input),
    updateMasterPriority: (code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) =>
      ipcRenderer.invoke(IPC.MASTER.UPDATE_PRIORITY, code, data),
    deleteMasterPriority: (code: string) => ipcRenderer.invoke(IPC.MASTER.DELETE_PRIORITY, code),
    createMasterType: (input: { code: string; name: string; sort_order?: number; color?: string }) => ipcRenderer.invoke(IPC.MASTER.CREATE_TYPE, input),
    updateMasterType: (code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }) => ipcRenderer.invoke(IPC.MASTER.UPDATE_TYPE, code, data),
    deleteMasterType: (code: string) => ipcRenderer.invoke(IPC.MASTER.DELETE_TYPE, code),
    createMasterSource: (input: { code: string; name: string; sort_order?: number }) => ipcRenderer.invoke(IPC.MASTER.CREATE_SOURCE, input),
    updateMasterSource: (code: string, data: { name?: string; sort_order?: number; is_active?: boolean }) => ipcRenderer.invoke(IPC.MASTER.UPDATE_SOURCE, code, data),
    deleteMasterSource: (code: string) => ipcRenderer.invoke(IPC.MASTER.DELETE_SOURCE, code),
  },

  task: {
    getReminderStats: (token: string) => ipcRenderer.invoke(IPC.TASK.GET_REMINDER_STATS, token),
    sendDeadlineReminders: () => ipcRenderer.invoke(IPC.TASK.SEND_DEADLINE_REMINDERS),
    getProjectMembers: (projectId: string) => ipcRenderer.invoke(IPC.TASK.GET_PROJECT_MEMBERS, projectId),
    getAll: (projectId?: string) => ipcRenderer.invoke(IPC.TASK.GET_ALL, projectId),
    listForPickerPage: (params: { offset: number; limit: number; search?: string; pickerMode: 'link' | 'subtask'; contextProjectId?: string | null; excludeTaskIds: string[] }) =>
      ipcRenderer.invoke(IPC.TASK.LIST_FOR_PICKER_PAGE, params),
    listForManagement: (params: {
      page: number
      limit: number
      search?: string
      statusCodes?: string[]
      assigneeUserIds?: string[]
      typeCodes?: string[]
      priorityCodes?: string[]
      projectIds?: string[]
      dateRange?: { from: string; to?: string }
      sortColumn?: string | null
      sortDirection?: 'asc' | 'desc'
      includeFacets?: boolean
    }) => ipcRenderer.invoke(IPC.TASK.LIST_FOR_MANAGEMENT, params),
    listForManagementCharts: (params: {
      search?: string
      statusCodes?: string[]
      assigneeUserIds?: string[]
      typeCodes?: string[]
      priorityCodes?: string[]
      projectIds?: string[]
      dateRange?: { from: string; to?: string }
    }) => ipcRenderer.invoke(IPC.TASK.LIST_FOR_MANAGEMENT_CHARTS, params),
    getManagementScopeMeta: () => ipcRenderer.invoke(IPC.TASK.GET_MANAGEMENT_SCOPE_META),
    getTask: (id: string) => ipcRenderer.invoke(IPC.TASK.GET_TASK, id),
    create: (input: any) => ipcRenderer.invoke(IPC.TASK.CREATE, input),
    updateStatus: (id: string, status: string, version?: number) => ipcRenderer.invoke(IPC.TASK.UPDATE_STATUS, id, status, version),
    updateProgress: (id: string, progress: number, version?: number) => ipcRenderer.invoke(IPC.TASK.UPDATE_PROGRESS, id, progress, version),
    updateDates: (id: string, dates: { planStartDate?: string; planEndDate?: string; actualStartDate?: string; actualEndDate?: string }, version?: number) =>
      ipcRenderer.invoke(IPC.TASK.UPDATE_DATES, id, dates, version),
    updateTask: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke(IPC.TASK.UPDATE_TASK, id, data),
    deleteTask: (id: string, version?: number) => ipcRenderer.invoke(IPC.TASK.DELETE_TASK, id, version),
    canEditTask: (taskId: string) => ipcRenderer.invoke(IPC.TASK.CAN_EDIT_TASK, taskId),
    assign: (id: string, assigneeUserId: string | null, version?: number) => ipcRenderer.invoke(IPC.TASK.ASSIGN, id, assigneeUserId, version),
    checkOnedrive: () => ipcRenderer.invoke(IPC.TASK.CHECK_ONEDRIVE),
    checkTaskApi: () => ipcRenderer.invoke(IPC.TASK.CHECK_TASK_API),
    checkTaskSchemaApplied: () => ipcRenderer.invoke(IPC.TASK.CHECK_TASK_SCHEMA_APPLIED),
    initSchema: () => ipcRenderer.invoke(IPC.TASK.INIT_TASK_SCHEMA),
    getIntegrationsForSettings: (token: string) => ipcRenderer.invoke(IPC.TASK.INTEGRATIONS_GET_FOR_SETTINGS, token),
    saveIntegrationsSettings: (
      token: string,
      payload: {
        mail: { smtpServer: string; port: string; email: string; password: string }
        onedrive: { clientId: string; clientSecret: string; refreshToken: string }
        db: { host: string; port: string; user: string; password: string; databaseName: string }
      }
    ) => ipcRenderer.invoke(IPC.TASK.INTEGRATIONS_SAVE, String(token), toStructuredCloneable(payload)),
    getProjects: () => ipcRenderer.invoke(IPC.TASK.GET_PROJECTS),
    getProjectsForTaskUi: () => ipcRenderer.invoke(IPC.TASK.GET_PROJECTS_FOR_TASK_UI),
    getProjectsForUser: () => ipcRenderer.invoke(IPC.TASK.GET_PROJECTS_FOR_USER),
    getProjectsForLeaderboardPicker: () => ipcRenderer.invoke(IPC.TASK.GET_PROJECTS_FOR_LEADERBOARD_PICKER),
    upsertUserProjectSourceFolder: (projectId: string, sourceFolderPath: string, sourceFolderName?: string) =>
      ipcRenderer.invoke(IPC.TASK.UPSERT_USER_PROJECT_SOURCE_FOLDER, projectId, sourceFolderPath, sourceFolderName),
    getSourceFoldersByProject: (projectId: string) => ipcRenderer.invoke(IPC.TASK.GET_SOURCE_FOLDERS_BY_PROJECT, projectId),
    getSourceFoldersByProjects: (projectIds: string[]) => ipcRenderer.invoke(IPC.TASK.GET_SOURCE_FOLDERS_BY_PROJECTS, projectIds),
    getUserProjectSourceFolderMappings: () => ipcRenderer.invoke(IPC.TASK.GET_USER_PROJECT_SOURCE_FOLDER_MAPPINGS),
    deleteUserProjectSourceFolder: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.TASK.DELETE_USER_PROJECT_SOURCE_FOLDER, sourceFolderPath),
    getProjectIdByUserAndPath: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.TASK.GET_PROJECT_ID_BY_USER_AND_PATH, sourceFolderPath),
    hasPlRole: (userId: string) => ipcRenderer.invoke(IPC.TASK.HAS_PL_ROLE, userId),
    codingRule: {
      getForSelection: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.TASK.CODING_RULE_GET_FOR_SELECTION, sourceFolderPath),
      getGlobalOnly: () => ipcRenderer.invoke(IPC.TASK.CODING_RULE_GET_GLOBAL_ONLY),
      getContent: (idOrName: string, options?: { sourceFolderPath?: string; userId?: string }) => ipcRenderer.invoke(IPC.TASK.CODING_RULE_GET_CONTENT, idOrName, options),
      create: (input: { name: string; content: string; projectId?: string | null }) => ipcRenderer.invoke(IPC.TASK.CODING_RULE_CREATE, input),
      update: (id: string, input: { name?: string; content?: string }) => ipcRenderer.invoke(IPC.TASK.CODING_RULE_UPDATE, id, input),
      delete: (id: string) => ipcRenderer.invoke(IPC.TASK.CODING_RULE_DELETE, id),
      getForManagement: () => ipcRenderer.invoke(IPC.TASK.CODING_RULE_GET_FOR_MANAGEMENT),
    },
    createProject: (name: string, pmUserId?: string | null) => ipcRenderer.invoke(IPC.TASK.CREATE_PROJECT, name, pmUserId),
    updateProject: (id: string, name: string, version?: number) => ipcRenderer.invoke(IPC.TASK.UPDATE_PROJECT, id, name, version),
    getProjectReminderTime: (projectId: string) => ipcRenderer.invoke(IPC.TASK.GET_PROJECT_REMINDER_TIME, projectId),
    updateProjectReminderTime: (projectId: string, time: string | null) => ipcRenderer.invoke(IPC.TASK.UPDATE_PROJECT_REMINDER_TIME, projectId, time),
    deleteProject: (id: string, version?: number) => ipcRenderer.invoke(IPC.TASK.DELETE_PROJECT, id, version),
    getTaskChildren: (taskId: string) => ipcRenderer.invoke(IPC.TASK.GET_TASK_CHILDREN, taskId),
    createTaskChild: (taskId: string, input: any) => ipcRenderer.invoke(IPC.TASK.CREATE_TASK_CHILD, taskId, input),
    getTaskLinks: (taskId: string) => ipcRenderer.invoke(IPC.TASK.GET_TASK_LINKS, taskId),
    createTaskLink: (taskId: string, toTaskId: string, linkType: string) => ipcRenderer.invoke(IPC.TASK.CREATE_TASK_LINK, taskId, toTaskId, linkType),
    deleteTaskLink: (taskId: string, linkId: string, version?: number) => ipcRenderer.invoke(IPC.TASK.DELETE_TASK_LINK, taskId, linkId, version),
    getFavoriteTaskIds: () => ipcRenderer.invoke(IPC.TASK.GET_FAVORITE_TASK_IDS),
    addTaskFavorite: (taskId: string) => ipcRenderer.invoke(IPC.TASK.ADD_TASK_FAVORITE, taskId),
    removeTaskFavorite: (taskId: string) => ipcRenderer.invoke(IPC.TASK.REMOVE_TASK_FAVORITE, taskId),
    copyTask: (taskId: string) => ipcRenderer.invoke(IPC.TASK.COPY_TASK, taskId),
    selectCsvFile: () => ipcRenderer.invoke(IPC.TASK.SELECT_CSV_FILE),
    importRedmineCsv: (csvContent: string) => ipcRenderer.invoke(IPC.TASK.IMPORT_REDMINE_CSV, csvContent),
    commitReview: {
      save: (record: { sourceFolderPath: string; commitId: string; vcsType: 'git' | 'svn'; reviewerUserId?: string | null; note?: string | null }) =>
        ipcRenderer.invoke(IPC.TASK.COMMIT_REVIEW_SAVE, record),
      delete: (sourceFolderPath: string, commitId: string, version?: number) => ipcRenderer.invoke(IPC.TASK.COMMIT_REVIEW_DELETE, sourceFolderPath, commitId, version),
      get: (sourceFolderPath: string, commitId: string) => ipcRenderer.invoke(IPC.TASK.COMMIT_REVIEW_GET, sourceFolderPath, commitId),
      getAllBySourceFolder: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.TASK.COMMIT_REVIEW_GET_ALL_BY_SOURCE, sourceFolderPath),
      getReviewedIds: (sourceFolderPath: string) => ipcRenderer.invoke(IPC.TASK.COMMIT_REVIEW_GET_REVIEWED_IDS, sourceFolderPath),
    },
  },

  achievement: {
    getStats: () => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_STATS),
    getBadges: () => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_BADGES),
    getAllDefinitions: () => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_ALL_DEFINITIONS),
    pinBadge: (codes: string[]) => ipcRenderer.invoke(IPC.ACHIEVEMENT.PIN_BADGE, codes),
    getLeaderboard: () => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_LEADERBOARD),
    getLeaderboardByProject: (projectId: string | null) => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_LEADERBOARD_BY_PROJECT, projectId),
    getAchievementRarities: () => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_ACHIEVEMENT_RARITIES),
    previewToast: (achievementCode?: string) => ipcRenderer.invoke(IPC.ACHIEVEMENT.PREVIEW_TOAST, achievementCode),
    previewRankUp: (rankCode?: string) => ipcRenderer.invoke(IPC.ACHIEVEMENT.PREVIEW_RANK_UP, rankCode),
    getStatsForUser: (userId: string) => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_STATS_FOR_USER, userId),
    getBadgesForUser: (userId: string) => ipcRenderer.invoke(IPC.ACHIEVEMENT.GET_BADGES_FOR_USER, userId),
  },

  pr: {
    tokenSet: (token: string) => ipcRenderer.invoke(IPC.PR.TOKEN_SET, token),
    tokenCheck: () => ipcRenderer.invoke(IPC.PR.TOKEN_CHECK),
    tokenRemove: () => ipcRenderer.invoke(IPC.PR.TOKEN_REMOVE),
    rateLimitGet: () => ipcRenderer.invoke(IPC.PR.RATE_LIMIT_GET),
    repoList: (projectId: string) => ipcRenderer.invoke(IPC.PR.REPO_LIST, projectId),
    repoUpsert: (input: {
      id?: string
      projectId: string
      name: string
      localPath?: string | null
      remoteUrl: string
      defaultBaseBranch?: string | null
    }) => ipcRenderer.invoke(IPC.PR.REPO_UPSERT, toStructuredCloneable(input)),
    repoRemove: (id: string) => ipcRenderer.invoke(IPC.PR.REPO_REMOVE, id),
    repoAutodetect: (userId: string, projectId: string) => ipcRenderer.invoke(IPC.PR.REPO_AUTODETECT, userId, projectId),
    templateList: (projectId: string) => ipcRenderer.invoke(IPC.PR.TEMPLATE_LIST, projectId),
    templateUpsert: (input: {
      id?: string
      projectId: string
      code: string
      label: string
      targetBranch?: string | null
      sortOrder?: number
      isActive?: boolean
    }) => ipcRenderer.invoke(IPC.PR.TEMPLATE_UPSERT, toStructuredCloneable(input)),
    templateDelete: (id: string) => ipcRenderer.invoke(IPC.PR.TEMPLATE_DELETE, id),
    templateReorder: (projectId: string, orderedIds: string[]) => ipcRenderer.invoke(IPC.PR.TEMPLATE_REORDER, projectId, orderedIds),
    templateSeedDefault: (projectId: string) => ipcRenderer.invoke(IPC.PR.TEMPLATE_SEED_DEFAULT, projectId),
    trackedList: (projectId: string) => ipcRenderer.invoke(IPC.PR.TRACKED_LIST, projectId),
    trackedUpsert: (input: {
      id?: string
      projectId: string
      repoId: string
      branchName: string
      assigneeUserId?: string | null
      note?: string | null
    }) => ipcRenderer.invoke(IPC.PR.TRACKED_UPSERT, toStructuredCloneable(input)),
    trackedUpdateStatusNote: (id: string, patch: { note?: string | null; assigneeUserId?: string | null }) =>
      ipcRenderer.invoke(IPC.PR.TRACKED_UPDATE_STATUS_NOTE, id, toStructuredCloneable(patch)),
    trackedDelete: (id: string) => ipcRenderer.invoke(IPC.PR.TRACKED_DELETE, id),
    trackedSyncFromGithub: (projectId: string) => ipcRenderer.invoke(IPC.PR.TRACKED_SYNC_FROM_GITHUB, projectId),
    onTrackedSyncProgress: (callback: (payload: { projectId: string; done: number; total: number; percent: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectId: string; done: number; total: number; percent: number }) => callback(payload)
      ipcRenderer.on(IPC.PR.EVENT_TRACKED_SYNC_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.PR.EVENT_TRACKED_SYNC_PROGRESS, handler)
    },
    prCreate: (input: {
      projectId: string
      repoId: string
      owner: string
      repo: string
      title: string
      body?: string
      head: string
      base: string
      draft?: boolean
      openInBrowser?: boolean
      assigneeUserId?: string | null
    }) => ipcRenderer.invoke(IPC.PR.PR_CREATE, toStructuredCloneable(input)),
    prMerge: (input: {
      projectId: string
      repoId: string
      owner: string
      repo: string
      number: number
      method: 'squash' | 'merge' | 'rebase'
      commitTitle?: string
      commitMessage?: string
    }) => ipcRenderer.invoke(IPC.PR.PR_MERGE, toStructuredCloneable(input)),
    prList: (input: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; base?: string; head?: string }) =>
      ipcRenderer.invoke(IPC.PR.PR_LIST, toStructuredCloneable(input)),
        prGet: (input: { owner: string; repo: string; number: number }) => ipcRenderer.invoke(IPC.PR.PR_GET, toStructuredCloneable(input)),
        prGetCommits: (input: { owner: string; repo: string; number: number }) => ipcRenderer.invoke(IPC.PR.PR_GET_COMMITS, toStructuredCloneable(input)),
    prLocalMergeConflicts: (input: { repoId: string; prNumber: number; base: string; headSha: string }) =>
      ipcRenderer.invoke(IPC.PR.PR_LOCAL_MERGE_CONFLICTS, toStructuredCloneable(input)),
        prFilesList: (input: { owner: string; repo: string; number: number }) =>
          ipcRenderer.invoke(IPC.PR.PR_FILES_LIST, toStructuredCloneable(input)),
        prIssueCommentsList: (input: { owner: string; repo: string; number: number }) =>
          ipcRenderer.invoke(IPC.PR.PR_ISSUE_COMMENTS_LIST, toStructuredCloneable(input)),
        prIssueCommentCreate: (input: { owner: string; repo: string; number: number; body: string }) =>
          ipcRenderer.invoke(IPC.PR.PR_ISSUE_COMMENT_CREATE, toStructuredCloneable(input)),
        prReviewApprove: (input: { owner: string; repo: string; number: number; headSha: string; body?: string }) =>
          ipcRenderer.invoke(IPC.PR.PR_REVIEW_APPROVE, toStructuredCloneable(input)),
    prMarkReady: (input: { owner: string; repo: string; number: number }) =>
      ipcRenderer.invoke(IPC.PR.PR_MARK_READY, toStructuredCloneable(input)),
    prMarkDraft: (input: { owner: string; repo: string; number: number }) =>
      ipcRenderer.invoke(IPC.PR.PR_MARK_DRAFT, toStructuredCloneable(input)),
    prClose: (input: { owner: string; repo: string; number: number }) =>
      ipcRenderer.invoke(IPC.PR.PR_CLOSE, toStructuredCloneable(input)),
    prUpdateBranch: (input: { owner: string; repo: string; number: number; expectedHeadSha?: string | null }) =>
      ipcRenderer.invoke(IPC.PR.PR_UPDATE_BRANCH, toStructuredCloneable(input)),
    branchListRemote: (input: { owner: string; repo: string }) => ipcRenderer.invoke(IPC.PR.BRANCH_LIST_REMOTE, toStructuredCloneable(input)),
    githubRemoteBranchesExist: (items: { id: string; owner: string; repo: string; branch: string }[]) =>
      ipcRenderer.invoke(IPC.PR.GITHUB_REMOTE_BRANCHES_EXIST, toStructuredCloneable(items)),
    githubDeleteRemoteBranch: (input: { owner: string; repo: string; branch: string; repoId: string }) =>
      ipcRenderer.invoke(IPC.PR.GITHUB_DELETE_REMOTE_BRANCH, toStructuredCloneable(input)),
    refCommitMessages: (input: { owner: string; repo: string; ref: string; maxCommits?: number }) =>
      ipcRenderer.invoke(IPC.PR.REF_COMMIT_MESSAGES, toStructuredCloneable(input)),
    branchLastCommitMessage: (input: { owner: string; repo: string; branch: string }) =>
      ipcRenderer.invoke(IPC.PR.BRANCH_LAST_COMMIT_MESSAGE, toStructuredCloneable(input)),
    localLastCommitMessage: (input: { cwd: string; branch?: string }) =>
      ipcRenderer.invoke(IPC.PR.LOCAL_LAST_COMMIT_MESSAGE, toStructuredCloneable(input)),
    branchCommits: (input: { owner: string; repo: string; branch: string; perPage?: number }) =>
      ipcRenderer.invoke(IPC.PR.BRANCH_COMMITS, toStructuredCloneable(input)),
    branchResetHard: (input: { repoId: string; branch: string; sha: string }) =>
      ipcRenderer.invoke(IPC.PR.BRANCH_RESET_HARD, toStructuredCloneable(input)),
    branchForcePush: (input: { repoId: string; branch: string }) =>
      ipcRenderer.invoke(IPC.PR.BRANCH_FORCE_PUSH, toStructuredCloneable(input)),
    automationList: (repoId?: string) => ipcRenderer.invoke(IPC.PR.AUTOMATION_LIST, repoId),
    automationUpsert: (input: {
      id?: string
      repoId: string
      name?: string | null
      triggerEvent: string
      sourcePattern?: string | null
      targetBranch?: string | null
      action: string
      nextTarget?: string | null
      prTitleTemplate?: string | null
      prBodyTemplate?: string | null
      isActive?: boolean
    }) => ipcRenderer.invoke(IPC.PR.AUTOMATION_UPSERT, toStructuredCloneable(input)),
    automationDelete: (id: string) => ipcRenderer.invoke(IPC.PR.AUTOMATION_DELETE, id),
    automationToggle: (id: string, isActive: boolean) => ipcRenderer.invoke(IPC.PR.AUTOMATION_TOGGLE, id, isActive),
    onCheckpointUpdated: (callback: (payload: { trackedBranchId: string; templateId: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { trackedBranchId: string; templateId: string }) => callback(payload)
      ipcRenderer.on(IPC.PR.EVENT_CHECKPOINT_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC.PR.EVENT_CHECKPOINT_UPDATED, handler)
    },
    onAutomationFired: (
      callback: (payload: { automationId: string; repoId: string; sourceBranch: string; from: string; to: string; prNumber: number; prUrl: string }) => void
    ) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: any) => callback(payload)
      ipcRenderer.on(IPC.PR.EVENT_AUTOMATION_FIRED, handler)
      return () => ipcRenderer.removeListener(IPC.PR.EVENT_AUTOMATION_FIRED, handler)
    },
    onTokenInvalid: (callback: (payload: { message: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { message: string }) => callback(payload)
      ipcRenderer.on(IPC.PR.EVENT_TOKEN_INVALID, handler)
      return () => ipcRenderer.removeListener(IPC.PR.EVENT_TOKEN_INVALID, handler)
    },
  },

  progress: {
    openWindow: () => ipcRenderer.send(IPC.WINDOW.PROGRESS),
    getAllUsers: () => ipcRenderer.invoke(IPC.PROGRESS.GET_ALL_USERS),
    getHeatmap: (userId: string, year: number) => ipcRenderer.invoke(IPC.PROGRESS.GET_HEATMAP, userId, year),
    getTrend: (userId: string, from: string, to: string, granularity: 'day' | 'week' | 'month') => ipcRenderer.invoke(IPC.PROGRESS.GET_TREND, userId, from, to, granularity),
    getRadar: (userId: string, yearMonth: string) => ipcRenderer.invoke(IPC.PROGRESS.GET_RADAR, userId, yearMonth),
    getRadarRange: (userId: string, from: string, to: string) => ipcRenderer.invoke(IPC.PROGRESS.GET_RADAR_RANGE, userId, from, to),
    getTaskPerformance: (userId: string, from: string, to: string, projectId?: string | null) =>
      ipcRenderer.invoke(IPC.PROGRESS.GET_TASK_PERFORMANCE, userId, from, to, projectId ?? undefined),
    getQualityTrend: (userId: string, weeksBack: number, teamUserIds?: string[] | null, from?: string | null, to?: string | null) =>
      ipcRenderer.invoke(IPC.PROGRESS.GET_QUALITY_TREND, userId, weeksBack, teamUserIds ?? undefined, from ?? undefined, to ?? undefined),
    getProductiveHours: (userId: string, weeksBack: number, from?: string | null, to?: string | null) =>
      ipcRenderer.invoke(IPC.PROGRESS.GET_PRODUCTIVE_HOURS, userId, weeksBack, from ?? undefined, to ?? undefined),
    getMonthlyHighlights: (userId: string, yearMonth: string) => ipcRenderer.invoke(IPC.PROGRESS.GET_MONTHLY_HIGHLIGHTS, userId, yearMonth),
    getTeamSummary: (payload: { userIds: string[]; from: string; to: string; projectId?: string | null }) => ipcRenderer.invoke(IPC.PROGRESS.GET_TEAM_SUMMARY, payload),
    getTeamOverviewUserProjects: (userIds: string[]) => ipcRenderer.invoke(IPC.PROGRESS.GET_TEAM_OVERVIEW_USER_PROJECTS, userIds),
    getOverviewProjects: () => ipcRenderer.invoke(IPC.PROGRESS.GET_OVERVIEW_PROJECTS),
    getProjectMemberUserIds: (projectId: string) => ipcRenderer.invoke(IPC.PROGRESS.GET_PROJECT_MEMBER_IDS, projectId),
  },

  teamProgress: {
    openWindow: () => ipcRenderer.send(IPC.WINDOW.TEAM_PROGRESS),
  },

  reportManager: {
    openWindow: () => ipcRenderer.send(IPC.WINDOW.REPORT_MANAGER),
  },

  prManager: {
    openWindow: () => ipcRenderer.send(IPC.WINDOW.PR_MANAGER),
    closeWindow: () => ipcRenderer.send(IPC.WINDOW.PR_MANAGER_CLOSE),
    requestDock: () => ipcRenderer.send(IPC.WINDOW.PR_MANAGER_DOCK_REQUEST),
  },

  on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, listener)
  },
  removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, listener)
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
