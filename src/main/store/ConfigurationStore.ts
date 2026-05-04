import os from 'node:os'
import path from 'node:path'
import Store from 'electron-store'

import type { TaskDbTlsMode } from '../types/types'

/** `conf` cần `cwd` hoặc `projectName`; ngoài Electron, electron-store không có `app.getPath` → gán thư mục tạm (vd. seed:mock bằng tsx). */
const isElectronRuntime = process.versions.electron != null

export type ApiProvider = 'openai' | 'claude' | 'google'

export type CommitConventionMode = 'warn' | 'block'

export type GitleaksMode = 'warn' | 'block'

export type CommitMessageDetailLevel = 'detail' | 'normal' | 'simple'

export type OpenAIReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

export type Schema = {
  openaiApiKey: string
  openaiModel: string
  openaiReasoningEffort: OpenAIReasoningEffort
  claudeApiKey: string
  googleApiKey: string
  activeApiProvider: ApiProvider
  svnFolder: string
  sourceFolder: string
  webhookMS: string
  codingRule: string
  codingRuleId: string
  oneDriveClientId: string
  oneDriveClientSecret: string
  oneDriveRefreshToken: string
  dbHost: string
  dbPort: string
  dbUser: string
  dbPassword: string
  dbName: string
  /** Namespace PostgreSQL (schema), ví dụ public hoặc honey_badger — khác với tên database. */
  dbPgSchema: string
  dbTls: TaskDbTlsMode
  startOnLogin: boolean
  showNotifications: boolean
  playNotificationSound: boolean
  notificationSoundPath: string
  enableTeamsNotification: boolean
  versionControlSystem: 'svn' | 'git'
  commitConventionEnabled: boolean
  commitConventionMode: CommitConventionMode
  gitleaksEnabled: boolean
  gitleaksMode: GitleaksMode
  gitleaksConfigPath: string
  externalEditorPath: string
  autoRefreshEnabled: boolean
  developerMode: boolean
  commitMessageDetailLevel: CommitMessageDetailLevel
  multiRepoEnabled: boolean
  multiRepoSource: 'manual' | 'byProject'
  multiRepoPaths: string[]
}

const config = new Store<Schema>({
  name: 'configuration',
  ...(!isElectronRuntime ? { cwd: path.join(os.tmpdir(), 'honey-badger-config-store') } : {}),
  defaults: {
    openaiApiKey: '',
    openaiModel: 'gpt-5.4',
    openaiReasoningEffort: 'low',
    claudeApiKey: '',
    googleApiKey: '',
    activeApiProvider: 'openai',
    svnFolder: '',
    sourceFolder: '',
    webhookMS: '',
    codingRule: '',
    codingRuleId: '',
    oneDriveClientId: '',
    oneDriveClientSecret: '',
    oneDriveRefreshToken: '',
    dbHost: 'localhost',
    dbPort: '5432',
    dbUser: 'postgres',
    dbPassword: '',
    dbName: 'postgres',
    dbPgSchema: 'public',
    dbTls: 'auto',
    startOnLogin: false,
    showNotifications: true,
    playNotificationSound: true,
    notificationSoundPath: '',
    enableTeamsNotification: true,
    versionControlSystem: 'svn',
    commitConventionEnabled: true,
    commitConventionMode: 'block',
    gitleaksEnabled: false,
    gitleaksMode: 'block',
    gitleaksConfigPath: '',
    externalEditorPath: 'code',
    autoRefreshEnabled: true,
    developerMode: false,
    commitMessageDetailLevel: 'normal',
    multiRepoEnabled: false,
    multiRepoSource: 'manual',
    multiRepoPaths: [],
  },
})

export default config
