export type HostingType = 'github' | 'gitlab' | 'azure'

export type MergeMethod = 'merge' | 'squash' | 'rebase'

export interface ParsedRemote {
  host: string
  owner: string
  repo: string
  hosting: HostingType
}

export interface PullRequestSummary {
  number: number
  title: string
  body?: string | null
  state: 'open' | 'closed'
  /** PR nh\u00e1p; ch\u1ec9 khi state=open. */
  draft: boolean
  merged: boolean
  mergedAt?: string | null
  mergedBy?: string | null
  htmlUrl: string
  head: string
  base: string
  /** Commit SHA tại nh\u00e1nh head (c\u1ea7n cho createReview, v.v.). */
  headSha: string | null
  author?: string | null
  createdAt: string
  updatedAt: string
  additions?: number | null
  deletions?: number | null
  changedFiles?: number | null
  mergeableState?: string | null
  assignees?: PrAssignee[] | null
  labels?: PrLabel[] | null
  /** Ng\u01b0\u1eddi \u0111\u01b0\u1ee3c g\u00e1n review (t\u1eeb PR \u2014 requested_reviewers). */
  requestedReviewers?: PrAssignee[] | null
  /** Nh\u00f3m \u0111\u01b0\u1ee3c y\u00eau c\u1ea7u review (t\u1eeb PR \u2014 requested_teams). */
  requestedTeams?: PrRequestedTeam[] | null
  /** C\u00e1c b\u1ea3n review \u0111\u00e3 g\u1eedi (t\u1eeb pulls.listReviews; m\u1ed7i user l\u1ea5y b\u1ea3n m\u1edbi nh\u1ea5t). */
  reviewSubmissions?: PrReviewSubmission[] | null
}

export interface PrRequestedTeam {
  name: string
  slug: string
}

export interface PrReviewSubmission {
  login: string
  avatarUrl: string | null
  state: string
  submittedAt: string | null
}

export interface PrAssignee {
  login: string
  id: number
  avatarUrl?: string | null
}

export interface PrLabel {
  name: string
  color: string
}

export interface PullRequestCommit {
  sha: string
  message: string
  author?: string | null
  date?: string | null
}

/** File trong PR (t\u1eeb pulls.listFiles). */
export interface PrChangedFile {
  filename: string
  status: string
  patch: string | null
  /** `true` khi n\u1ed9i dung `patch` b\u1ecb c\u1eaft \u1edf main (qu\u00e1 d\u00e0i). */
  patchTruncated: boolean
  additions: number
  deletions: number
  blobUrl: string | null
}

/** B\u00ecnh lu\u1eadn d\u1ea1ng issue (PR = issue t\u1eeb g\u00f3c \u0111\u1eb7t conversation). */
export interface PrIssueComment {
  id: number
  body: string
  userLogin: string | null
  userAvatarUrl: string | null
  createdAt: string
  updatedAt: string
  htmlUrl: string | null
}

/**
 * M\u1ed9t m\u1ee5c tr\u00ean timeline Conversation GitHub: issue comment, pull review (approve/...), ho\u1eb7c comment tr\u00ean d\u00f2ng file.
 */
export interface PrConversationEntry {
  kind: 'issue' | 'review' | 'inline'
  id: number
  body: string
  userLogin: string | null
  userAvatarUrl: string | null
  createdAt: string
  updatedAt: string
  htmlUrl: string | null
  /** V\u1edbi kind === "review" (APPROVED, CHANGES_REQUESTED, ...). */
  reviewState: string | null
  /** V\u1edbi kind === "inline" (comment tr\u00ean file / diff). */
  filePath?: string | null
}

export interface PrReviewResult {
  id: number
  state: string
  htmlUrl: string | null
}

export interface BranchCommit {
  sha: string
  shortSha: string
  message: string
  author?: string | null
  date?: string | null
  htmlUrl?: string | null
}

export interface CreatePRInput {
  owner: string
  repo: string
  title: string
  body?: string
  head: string
  base: string
  draft?: boolean
}

export interface MergePRInput {
  owner: string
  repo: string
  number: number
  method: MergeMethod
  commitTitle?: string
  commitMessage?: string
}

export interface ListPRsOptions {
  owner: string
  repo: string
  state?: 'open' | 'closed' | 'all'
  head?: string
  base?: string
  perPage?: number
  page?: number
}

export interface IHostingClient {
  getType(): HostingType
  createPR(input: CreatePRInput): Promise<PullRequestSummary>
  mergePR(input: MergePRInput): Promise<{ merged: boolean; message?: string }>
  getPR(owner: string, repo: string, number: number): Promise<PullRequestSummary>
  listPRs(options: ListPRsOptions): Promise<PullRequestSummary[]>
  getPRCommits(owner: string, repo: string, number: number): Promise<PullRequestCommit[]>
  getDefaultBranch(owner: string, repo: string): Promise<string>
  listBranches(owner: string, repo: string): Promise<string[]>
  getLatestCommitMessage(owner: string, repo: string, branch: string): Promise<string | null>
  listBranchCommits(owner: string, repo: string, branch: string, perPage?: number): Promise<BranchCommit[]>
}
