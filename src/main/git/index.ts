// Export all git functions

export { blame } from './blame'
export { checkoutBranch, createBranch, deleteBranch, deleteRemoteBranch, getBranches, renameBranch } from './branch'
export { checkForUpdates } from './check-updates'
export { abortCherryPick, cherryPick, continueCherryPick } from './cherry-pick'
export { type CloneOptions, clone, init } from './clone-init'
export { commit, undoCommit } from './commit'
export { type GitConflictType, getGitConflictStatus } from './conflict-status'
export { getCommitDiff, getDiff, getFileContent, getParentCommit, getStagedDiff } from './diff'
export {
  type GitleaksFinding,
  type GitleaksMultiScanResult,
  type GitleaksScanRepoInput,
  resolveGitleaksExecutable,
  scanStagedForRepos,
} from './gitleaks'
export {
  deleteHook,
  disableHook,
  enableHook,
  getHookContent,
  getHooks,
  getSampleHookContent,
  type HookInfo,
  type HookName,
  SUPPORTED_HOOKS,
  setHookContent,
} from './hooks'
export {
  getInteractiveRebaseCommits,
  type InteractiveRebaseAction,
  type InteractiveRebaseCommit,
  type InteractiveRebaseTodoItem,
  startInteractiveRebase,
} from './interactive-rebase'
export { type GitLogOptions, getCommitFiles, getLogGraph, log } from './log'
export { abortMerge, getMergeStatus, merge, readConflictWorkingContent, resolveConflict } from './merge'
export { fetch, fetchUpdateLocalBranch, getRemotes, pull, push } from './push-pull'
export { abortRebase, continueRebase, getRebaseStatus, rebase } from './rebase'
export { addRemote, removeRemote, setRemoteUrl } from './remote'
export { reset } from './reset'
export { add, discardChanges, discardFiles, resetStaged, revert } from './revert'
export {
  stash,
  stashApply,
  stashBranch,
  stashClear,
  stashDrop,
  stashIsLikelyApplied,
  stashList,
  stashPop,
  stashShow,
  stashShowFileContent,
  stashShowFileDiff,
  stashShowFiles,
} from './stash'
export { getStatistics, type StatisticsOptions } from './statistics'
export { status } from './status'
export { createTag, deleteTag, listRemoteTags, listTags, pushTag } from './tag'
export { validateBranchName, validateCommitMessage, validateTagName } from './validation'
