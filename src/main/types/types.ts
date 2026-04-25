export type CommitInfo = {
  commitUser: string
  commitTime: string
  commitMessage: string
  addedFiles: string[]
  modifiedFiles: string[]
  deletedFiles: string[]
  hasCheckCodingRule: boolean
  hasCheckSpotbugs: boolean
  // Optional - Git
  commitHash?: string
  branchName?: string
  insertions?: number
  deletions?: number
  changes?: number
  // Optional - SVN
  revision?: string
  // Optional - common
  projectName?: string
  vcsType?: 'git' | 'svn'
  /** Path tại thời điểm commit - dùng để tra projectId khi gửi mail (tránh sai khi user đổi folder giữa commit và push) */
  sourceFolderPath?: string
}

export type Configuration = {
  openaiApiKey?: string
  openaiModel?: string
  openaiReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
  claudeApiKey?: string
  googleApiKey?: string
  activeApiProvider?: string
  svnFolder?: string
  sourceFolder?: string
  webhookMS?: string
  codingRule?: string
  oneDriveClientId?: string
  oneDriveClientSecret?: string
  oneDriveRefreshToken?: string
  dbHost?: string
  dbPort?: string
  dbUser?: string
  dbPassword?: string
  dbName?: string
  startOnLogin?: boolean
  showNotifications?: boolean
  enableTeamsNotification?: boolean
  versionControlSystem?: 'svn' | 'git'
  commitConventionEnabled?: boolean
  commitConventionMode?: string
  gitleaksEnabled?: boolean
  gitleaksMode?: string
  gitleaksConfigPath?: string
  externalEditorPath?: string
  developerMode?: boolean
  commitMessageDetailLevel?: 'detail' | 'normal' | 'simple'
  multiRepoEnabled?: boolean
  multiRepoSource?: 'manual' | 'byProject'
  multiRepoPaths?: string[]
}

export type MailServerConfig = {
  smtpServer: string
  port: string
  email: string
  password: string
}

export type SVNResponse = {
  status: string
  message?: string
  data?: any
  totalEntries?: number
  suggestedStartDate?: string | null
  sourceFolderPrefix?: string
  workingCopyRootFolder?: string
}

export type SupportFeedback = {
  type: 'support' | 'feedback'
  email: string
  message: string
  images: string[]
}

export type HistoryCommitMessage = {
  message: string
  date: string
}
