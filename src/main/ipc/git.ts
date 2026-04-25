import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import {
  type GitLogOptions,
  abortCherryPick as gitAbortCherryPick,
  abortMerge as gitAbortMerge,
  abortRebase as gitAbortRebase,
  add as gitAdd,
  addRemote as gitAddRemote,
  blame as gitBlame,
  checkForUpdates as gitCheckForUpdates,
  checkoutBranch as gitCheckoutBranch,
  cherryPick as gitCherryPick,
  clone as gitClone,
  commit as gitCommit,
  continueCherryPick as gitContinueCherryPick,
  continueRebase as gitContinueRebase,
  createBranch as gitCreateBranch,
  createTag as gitCreateTag,
  deleteBranch as gitDeleteBranch,
  deleteHook as gitDeleteHook,
  deleteRemoteBranch as gitDeleteRemoteBranch,
  deleteTag as gitDeleteTag,
  disableHook as gitDisableHook,
  discardChanges as gitDiscardChanges,
  discardFiles as gitDiscardFiles,
  enableHook as gitEnableHook,
  fetch as gitFetch,
  getBranches as gitGetBranches,
  getCommitFiles as gitGetCommitFiles,
  getGitConflictStatus as gitGetConflictStatus,
  getDiff as gitGetDiff,
  getFileContent as gitGetFileContent,
  getHookContent as gitGetHookContent,
  getHooks as gitGetHooks,
  getInteractiveRebaseCommits as gitGetInteractiveRebaseCommits,
  getLogGraph as gitGetLogGraph,
  getMergeStatus as gitGetMergeStatus,
  getParentCommit as gitGetParentCommit,
  getRebaseStatus as gitGetRebaseStatus,
  getRemotes as gitGetRemotes,
  getSampleHookContent as gitGetSampleHookContent,
  getStagedDiff as gitGetStagedDiff,
  getStatistics as gitGetStatistics,
  init as gitInit,
  listRemoteTags as gitListRemoteTags,
  listTags as gitListTags,
  log as gitLog,
  merge as gitMerge,
  pull as gitPull,
  push as gitPush,
  pushTag as gitPushTag,
  readConflictWorkingContent as gitReadConflictWorkingContent,
  rebase as gitRebase,
  removeRemote as gitRemoveRemote,
  renameBranch as gitRenameBranch,
  reset as gitReset,
  resetStaged as gitResetStaged,
  resolveConflict as gitResolveConflict,
  revert as gitRevert,
  scanStagedForRepos as gitScanStagedForRepos,
  setHookContent as gitSetHookContent,
  setRemoteUrl as gitSetRemoteUrl,
  startInteractiveRebase as gitStartInteractiveRebase,
  stash as gitStash,
  stashApply as gitStashApply,
  stashBranch as gitStashBranch,
  stashClear as gitStashClear,
  stashDrop as gitStashDrop,
  stashIsLikelyApplied as gitStashIsLikelyApplied,
  stashList as gitStashList,
  stashPop as gitStashPop,
  stashShow as gitStashShow,
  stashShowFileContent as gitStashShowFileContent,
  stashShowFileDiff as gitStashShowFileDiff,
  stashShowFiles as gitStashShowFiles,
  status as gitStatus,
  undoCommit as gitUndoCommit,
  type StatisticsOptions,
} from 'main/git'
import { onBranchCreated, onMerge, onPush, onStash, recordRebaseCompletedIfIdle } from '../task/achievementService'
import { getTokenFromStore, verifyToken } from '../task/auth'

function getCurrentUserId(): string | null {
  const token = getTokenFromStore()
  const session = token ? verifyToken(token) : null
  return session?.userId ?? null
}

export function registerGitIpcHandlers() {
  l.info('🔄 Registering Git IPC Handlers...')

  // Git log
  ipcMain.handle(IPC.GIT.LOG, async (_event, filePath: string | string[], options?: GitLogOptions) => await gitLog(filePath, options))

  // Git log graph
  ipcMain.handle(IPC.GIT.LOG_GRAPH, async (_event, filePath: string | string[], options?: GitLogOptions) => await gitGetLogGraph(filePath, options))

  // Git commit files
  ipcMain.handle(IPC.GIT.GET_COMMIT_FILES, async (_event, commitHash: string, options?: { cwd?: string }) => await gitGetCommitFiles(commitHash, options?.cwd))

  // Git status
  ipcMain.handle(IPC.GIT.STATUS, async (_event, options?: { cwd?: string }) => await gitStatus(options?.cwd))

  // Git commit
  ipcMain.handle(
    IPC.GIT.COMMIT,
    async (
      event,
      commitMessage: string,
      selectedFiles: string[],
      options: { hasCheckCodingRule: boolean; hasCheckSpotbugs: boolean; amend?: boolean; signOff?: boolean; scope?: 'staged' | 'all'; cwd?: string }
    ) => await gitCommit(commitMessage, selectedFiles, options, event.sender, options.cwd)
  )

  ipcMain.handle(
    IPC.GIT.GITLEAKS_SCAN_STAGED,
    async (_event, payload: { repos: { cwd: string; label?: string }[]; configPath?: string; timeoutMs?: number }) =>
      await gitScanStagedForRepos(payload.repos ?? [], { configPath: payload.configPath, timeoutMs: payload.timeoutMs })
  )

  // Git undo commit
  ipcMain.handle(IPC.GIT.UNDO_COMMIT, async (_event, cwd?: string) => await gitUndoCommit(cwd))

  // Git diff
  ipcMain.handle(IPC.GIT.GET_DIFF, async (_event, selectedFiles: string[], options?: { cwd?: string }) => await gitGetDiff(selectedFiles, options?.cwd))

  ipcMain.handle(IPC.GIT.GET_STAGED_DIFF, async () => await gitGetStagedDiff())

  // Git cat (get file content)
  ipcMain.handle(
    IPC.GIT.CAT,
    async (_event, filePath: string, fileStatus: string, commitHash?: string, options?: { cwd?: string }) => await gitGetFileContent(filePath, fileStatus, commitHash, options?.cwd)
  )

  // Git parent commit (for diff: compare commit vs parent)
  ipcMain.handle(IPC.GIT.GET_PARENT_COMMIT, async (_event, commitHash: string, options?: { cwd?: string }) => await gitGetParentCommit(commitHash, options?.cwd))

  // Git revert
  ipcMain.handle(IPC.GIT.REVERT, async (_event, filePath: string | string[]) => await gitRevert(filePath))
  ipcMain.handle(IPC.GIT.DISCARD_CHANGES, async (_event, paths: string[], cwd?: string) => await gitDiscardChanges(paths, cwd))
  ipcMain.handle(IPC.GIT.DISCARD_FILES, async (_event, paths: string[], cwd?: string) => await gitDiscardFiles(paths, cwd))
  ipcMain.handle(IPC.GIT.RESET_STAGED, async (_event, files?: string[], options?: { cwd?: string }) => await gitResetStaged(files, options?.cwd))
  ipcMain.handle(IPC.GIT.ADD, async (_event, files: string[], options?: { cwd?: string }) => await gitAdd(files, options?.cwd))

  // Git branches
  ipcMain.handle(IPC.GIT.GET_BRANCHES, async (_event, cwd?: string) => await gitGetBranches(cwd))
  ipcMain.handle(IPC.GIT.CREATE_BRANCH, async (_event, branchName: string, sourceBranch?: string, cwd?: string) => {
    const result = await gitCreateBranch(branchName, sourceBranch, cwd)
    if (result.status === 'success') {
      const userId = getCurrentUserId()
      if (userId) onBranchCreated(userId).catch(() => {})
    }
    return result
  })
  ipcMain.handle(
    IPC.GIT.CHECKOUT_BRANCH,
    async (_event, branchName: string, options?: { force?: boolean; stash?: boolean }, cwd?: string) => await gitCheckoutBranch(branchName, options, cwd)
  )
  ipcMain.handle(IPC.GIT.DELETE_BRANCH, async (_event, branchName: string, force: boolean) => await gitDeleteBranch(branchName, force))
  ipcMain.handle(IPC.GIT.DELETE_REMOTE_BRANCH, async (_event, remote: string, branchName: string) => await gitDeleteRemoteBranch(remote, branchName))
  ipcMain.handle(IPC.GIT.RENAME_BRANCH, async (_event, oldName: string, newName: string) => await gitRenameBranch(oldName, newName))

  // Git push/pull
  ipcMain.handle(IPC.GIT.PUSH, async (event, remote: string, branch?: string, commitQueueData?: Record<string, any>, cwd?: string, force?: boolean) => {
    const result = await gitPush(remote, branch, commitQueueData, event.sender, cwd, force)
    if (result.status === 'success') {
      const userId = getCurrentUserId()
      if (userId) onPush(userId).catch(() => {})
    }
    return result
  })
  ipcMain.handle(IPC.GIT.PULL, async (event, remote: string, branch?: string, options?: { rebase?: boolean }, cwd?: string) => {
    const result = await gitPull(remote, branch, options, event.sender, cwd)
    if (result.status === 'success' && options?.rebase === true && result.data?.headChanged === true) {
      const userId = getCurrentUserId()
      if (userId) recordRebaseCompletedIfIdle(userId, cwd).catch(() => {})
    }
    return result
  })

  ipcMain.handle(IPC.GIT.FETCH, async (event, remote: string, options?: { prune?: boolean; all?: boolean }, cwd?: string) => await gitFetch(remote, options, event.sender, cwd))

  ipcMain.handle(IPC.GIT.GET_REMOTES, async (_event, cwd?: string) => await gitGetRemotes(cwd))

  // Clone / Init
  ipcMain.handle(IPC.GIT.CLONE, async (_event, url: string, targetPath: string, options?: { branch?: string; depth?: number }) => await gitClone(url, targetPath, options))
  ipcMain.handle(IPC.GIT.INIT, async (_event, targetPath: string) => await gitInit(targetPath))

  ipcMain.handle(IPC.GIT.CHECK_FOR_UPDATES, async () => await gitCheckForUpdates())

  // Stash operations
  ipcMain.handle(IPC.GIT.STASH, async (_event, message?: string, options?: { includeUntracked?: boolean; stagedOnly?: boolean }, cwd?: string) => {
    const result = await gitStash(message, options, cwd)
    if (result.status === 'success') {
      const userId = getCurrentUserId()
      if (userId) onStash(userId).catch(() => {})
    }
    return result
  })
  ipcMain.handle(IPC.GIT.STASH_LIST, async (_event, cwd?: string) => await gitStashList(cwd))
  ipcMain.handle(IPC.GIT.STASH_POP, async (_event, stashIndex: number, options?: { index?: boolean }, cwd?: string) => await gitStashPop(stashIndex, options, cwd))
  ipcMain.handle(IPC.GIT.STASH_APPLY, async (_event, stashIndex: number, options?: { index?: boolean }, cwd?: string) => await gitStashApply(stashIndex, options, cwd))
  ipcMain.handle(IPC.GIT.STASH_DROP, async (_event, stashIndex: number, cwd?: string) => await gitStashDrop(stashIndex, cwd))
  ipcMain.handle(IPC.GIT.STASH_CLEAR, async (_event, cwd?: string) => await gitStashClear(cwd))
  ipcMain.handle(IPC.GIT.STASH_SHOW, async (_event, stashIndex: number, cwd?: string) => await gitStashShow(stashIndex, cwd))
  ipcMain.handle(IPC.GIT.STASH_SHOW_FILES, async (_event, stashIndex: number, cwd?: string) => await gitStashShowFiles(stashIndex, cwd))
  ipcMain.handle(IPC.GIT.STASH_SHOW_FILE_DIFF, async (_event, stashIndex: number, filePath: string, cwd?: string) => await gitStashShowFileDiff(stashIndex, filePath, cwd))
  ipcMain.handle(IPC.GIT.STASH_SHOW_FILE_CONTENT, async (_event, stashIndex: number, filePath: string, cwd?: string) => await gitStashShowFileContent(stashIndex, filePath, cwd))
  ipcMain.handle(IPC.GIT.STASH_IS_LIKELY_APPLIED, async (_event, stashIndex: number, cwd?: string) => await gitStashIsLikelyApplied(stashIndex, cwd))
  ipcMain.handle(IPC.GIT.STASH_BRANCH, async (_event, stashIndex: number, branchName: string, cwd?: string) => await gitStashBranch(stashIndex, branchName, cwd))

  // Merge operations
  ipcMain.handle(IPC.GIT.MERGE, async (_event, branchName: string, strategy?: string, cwd?: string) => {
    const result = await gitMerge(branchName, strategy, cwd)
    if (result.status === 'success') {
      const userId = getCurrentUserId()
      if (userId) onMerge(userId).catch(() => {})
    }
    return result
  })
  ipcMain.handle(IPC.GIT.ABORT_MERGE, async (_event, cwd?: string) => await gitAbortMerge(cwd))
  ipcMain.handle(
    IPC.GIT.RESOLVE_CONFLICT,
    async (_event, filePath: string, resolution: 'ours' | 'theirs' | 'both', cwd?: string) => await gitResolveConflict(filePath, resolution, cwd)
  )
  ipcMain.handle(IPC.GIT.GET_MERGE_STATUS, async (_event, cwd?: string) => await gitGetMergeStatus(cwd))

  // Remote management
  ipcMain.handle(IPC.GIT.ADD_REMOTE, async (_event, name: string, url: string, cwd?: string) => await gitAddRemote(name, url, cwd))
  ipcMain.handle(IPC.GIT.REMOVE_REMOTE, async (_event, name: string, cwd?: string) => await gitRemoveRemote(name, cwd))
  ipcMain.handle(IPC.GIT.SET_REMOTE_URL, async (_event, name: string, url: string, cwd?: string) => await gitSetRemoteUrl(name, url, cwd))

  // Cherry-pick operations
  ipcMain.handle(IPC.GIT.CHERRY_PICK, async (_event, commitHash: string, cwd?: string) => await gitCherryPick(commitHash, cwd))
  ipcMain.handle(IPC.GIT.ABORT_CHERRY_PICK, async (_event, cwd?: string) => await gitAbortCherryPick(cwd))
  ipcMain.handle(IPC.GIT.CONTINUE_CHERRY_PICK, async (_event, cwd?: string) => await gitContinueCherryPick(cwd))
  ipcMain.handle(IPC.GIT.GET_CONFLICT_STATUS, async (_event, cwd?: string) => await gitGetConflictStatus(cwd))
  ipcMain.handle(IPC.GIT.READ_CONFLICT_WORKING_CONTENT, async (_event, filePath: string, cwd?: string) => await gitReadConflictWorkingContent(filePath, cwd))

  // Reset operations
  ipcMain.handle(IPC.GIT.RESET, async (_event, commitHash: string, mode: 'soft' | 'mixed' | 'hard', cwd?: string) => await gitReset(commitHash, mode, cwd))

  // Rebase operations
  ipcMain.handle(IPC.GIT.REBASE, async (_event, ontoBranch: string, cwd?: string) => {
    const result = await gitRebase(ontoBranch, cwd)
    if (result.status === 'success') {
      const userId = getCurrentUserId()
      if (userId) recordRebaseCompletedIfIdle(userId, cwd).catch(() => {})
    }
    return result
  })
  ipcMain.handle(IPC.GIT.CONTINUE_REBASE, async (_event, cwd?: string) => {
    const result = await gitContinueRebase(cwd)
    if (result.status === 'success') {
      const userId = getCurrentUserId()
      if (userId) recordRebaseCompletedIfIdle(userId, cwd).catch(() => {})
    }
    return result
  })
  ipcMain.handle(IPC.GIT.ABORT_REBASE, async (_event, cwd?: string) => await gitAbortRebase(cwd))
  ipcMain.handle(IPC.GIT.GET_REBASE_STATUS, async (_event, cwd?: string) => await gitGetRebaseStatus(cwd))

  // Tag operations
  ipcMain.handle(IPC.GIT.CREATE_TAG, async (_event, tagName: string, message?: string, commitHash?: string, cwd?: string) => await gitCreateTag(tagName, message, commitHash, cwd))
  ipcMain.handle(IPC.GIT.LIST_TAGS, async (_event, cwd?: string) => await gitListTags(cwd))
  ipcMain.handle(IPC.GIT.LIST_REMOTE_TAGS, async (_event, remote: string, cwd?: string) => await gitListRemoteTags(remote, cwd))
  ipcMain.handle(IPC.GIT.DELETE_TAG, async (_event, tagName: string, remote?: string, cwd?: string) => await gitDeleteTag(tagName, remote, cwd))
  ipcMain.handle(IPC.GIT.PUSH_TAG, async (_event, tagName: string, remote: string, cwd?: string) => await gitPushTag(tagName, remote, cwd))

  // Blame operation
  ipcMain.handle(IPC.GIT.BLAME, async (_event, filePath: string) => await gitBlame(filePath))

  // Statistics operation
  ipcMain.handle(IPC.GIT.STATISTICS, async (_event, filePath: string, options?: StatisticsOptions) => await gitGetStatistics(filePath, options))

  // Hooks operations
  ipcMain.handle(IPC.GIT.HOOKS_GET, async (_event, cwd?: string) => await gitGetHooks(cwd))
  ipcMain.handle(IPC.GIT.HOOK_GET_CONTENT, async (_event, hookName: string, cwd?: string) => await gitGetHookContent(hookName, cwd))
  ipcMain.handle(IPC.GIT.HOOK_SET_CONTENT, async (_event, hookName: string, content: string, cwd?: string) => await gitSetHookContent(hookName, content, cwd))
  ipcMain.handle(IPC.GIT.HOOK_DELETE, async (_event, hookName: string, cwd?: string) => await gitDeleteHook(hookName, cwd))
  ipcMain.handle(IPC.GIT.HOOK_ENABLE, async (_event, hookName: string, cwd?: string) => await gitEnableHook(hookName, cwd))
  ipcMain.handle(IPC.GIT.HOOK_DISABLE, async (_event, hookName: string, cwd?: string) => await gitDisableHook(hookName, cwd))
  ipcMain.handle(IPC.GIT.HOOK_GET_SAMPLE, async (_event, hookName: string, cwd?: string) => await gitGetSampleHookContent(hookName, cwd))

  // Interactive rebase
  ipcMain.handle(IPC.GIT.GET_INTERACTIVE_REBASE_COMMITS, async (_event, baseRef: string, cwd?: string) => await gitGetInteractiveRebaseCommits(baseRef, cwd))
  ipcMain.handle(
    IPC.GIT.START_INTERACTIVE_REBASE,
    async (_event, baseRef: string, todoItems: { hash: string; shortHash: string; action: string; message: string; author: string; date: string }[], cwd?: string) => {
      const result = await gitStartInteractiveRebase(baseRef, todoItems as import('main/git/interactive-rebase').InteractiveRebaseTodoItem[], cwd)
      if (result.status === 'success') {
        const userId = getCurrentUserId()
        if (userId) recordRebaseCompletedIfIdle(userId, cwd).catch(() => {})
      }
      return result
    }
  )

  l.info('✅ Git IPC Handlers Registered')
}
