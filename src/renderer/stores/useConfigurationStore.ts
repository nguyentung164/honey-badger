import l from 'electron-log/renderer'
import { create } from 'zustand'

export type CommitConventionMode = 'warn' | 'block'

export type ApiProvider = 'openai' | 'claude' | 'google'

export type CommitMessageDetailLevel = 'detail' | 'normal' | 'simple'

export type OpenAIReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

type ConfigurationStore = {
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
  startOnLogin: boolean
  showNotifications: boolean
  playNotificationSound: boolean
  notificationSoundPath: string
  enableTeamsNotification: boolean
  versionControlSystem: 'svn' | 'git'
  commitConventionEnabled: boolean
  commitConventionMode: CommitConventionMode
  gitleaksEnabled: boolean
  gitleaksMode: CommitConventionMode
  gitleaksConfigPath: string
  externalEditorPath: string
  autoRefreshEnabled: boolean
  developerMode: boolean
  commitMessageDetailLevel: CommitMessageDetailLevel
  multiRepoEnabled: boolean
  multiRepoSource: 'manual' | 'byProject'
  multiRepoPaths: string[]
  isConfigLoaded: boolean
  setFieldConfiguration: (
    key: keyof Omit<ConfigurationStore, 'setFieldConfiguration' | 'saveConfigurationConfig' | 'loadConfigurationConfig' | 'isConfigLoaded'>,
    value: string | boolean | ApiProvider | CommitMessageDetailLevel | OpenAIReasoningEffort | string[] | 'manual' | 'byProject'
  ) => void
  saveConfigurationConfig: (options?: { omitIntegrationFieldsForDisk?: boolean }) => Promise<void>
  loadConfigurationConfig: () => Promise<void>
}

export type ConfigFieldKey = keyof Omit<ConfigurationStore, 'setFieldConfiguration' | 'saveConfigurationConfig' | 'loadConfigurationConfig' | 'isConfigLoaded'>

const CONFIG_INTEGRATION_DISK_KEYS = new Set<string>(['oneDriveClientId', 'oneDriveClientSecret', 'oneDriveRefreshToken', 'dbHost', 'dbPort', 'dbUser', 'dbPassword', 'dbName'])

export const useConfigurationStore = create<ConfigurationStore>((set, get) => ({
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
  dbPort: '3306',
  dbUser: 'root',
  dbPassword: '',
  dbName: 'honey_badger',
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
  isConfigLoaded: false,
  setFieldConfiguration: (key, value) => {
    set({ [key]: value })
  },
  saveConfigurationConfig: async (options?: { omitIntegrationFieldsForDisk?: boolean }) => {
    const state = get()
    const str = (v: unknown) => (v == null || v === undefined ? '' : String(v))
    const configToSave = {
      openaiApiKey: str(state.openaiApiKey),
      openaiModel: str(state.openaiModel),
      openaiReasoningEffort: (state.openaiReasoningEffort ?? 'low') as OpenAIReasoningEffort,
      claudeApiKey: str(state.claudeApiKey),
      googleApiKey: str(state.googleApiKey),
      activeApiProvider: state.activeApiProvider ?? 'openai',
      svnFolder: str(state.svnFolder),
      sourceFolder: str(state.sourceFolder),
      webhookMS: str(state.webhookMS),
      codingRule: str(state.codingRule),
      codingRuleId: str(state.codingRuleId),
      oneDriveClientId: str(state.oneDriveClientId),
      oneDriveClientSecret: str(state.oneDriveClientSecret),
      oneDriveRefreshToken: str(state.oneDriveRefreshToken),
      dbHost: str(state.dbHost),
      dbPort: str(state.dbPort),
      dbUser: str(state.dbUser),
      dbPassword: str(state.dbPassword),
      dbName: str(state.dbName),
      startOnLogin: state.startOnLogin ?? false,
      showNotifications: state.showNotifications ?? true,
      playNotificationSound: state.playNotificationSound ?? true,
      notificationSoundPath: str(state.notificationSoundPath),
      enableTeamsNotification: state.enableTeamsNotification ?? true,
      versionControlSystem: (state.versionControlSystem ?? 'svn') as 'svn' | 'git',
      commitConventionEnabled: state.commitConventionEnabled ?? true,
      commitConventionMode: (state.commitConventionMode ?? 'block') as CommitConventionMode,
      gitleaksEnabled: state.gitleaksEnabled ?? false,
      gitleaksMode: (state.gitleaksMode ?? 'block') as CommitConventionMode,
      gitleaksConfigPath: str(state.gitleaksConfigPath),
      externalEditorPath: str(state.externalEditorPath),
      autoRefreshEnabled: state.autoRefreshEnabled ?? true,
      developerMode: state.developerMode ?? false,
      commitMessageDetailLevel: (state.commitMessageDetailLevel ?? 'normal') as CommitMessageDetailLevel,
      multiRepoEnabled: state.multiRepoEnabled ?? false,
      multiRepoSource: (state.multiRepoSource ?? 'manual') as 'manual' | 'byProject',
      multiRepoPaths: Array.isArray(state.multiRepoPaths) ? state.multiRepoPaths.slice(0, 5) : [],
    }
    if (options?.omitIntegrationFieldsForDisk) {
      const patchPayload = Object.fromEntries(Object.entries(configToSave).filter(([k]) => !CONFIG_INTEGRATION_DISK_KEYS.has(k))) as Omit<
        typeof configToSave,
        'oneDriveClientId' | 'oneDriveClientSecret' | 'oneDriveRefreshToken' | 'dbHost' | 'dbPort' | 'dbUser' | 'dbPassword' | 'dbName'
      >
      await window.api.configuration.patch(patchPayload)
      l.info('Configuration patched (integration fields unchanged on disk)')
    } else {
      await window.api.configuration.set(configToSave)
      l.info('Configuration saved successfully')
    }
  },
  loadConfigurationConfig: async () => {
    try {
      if (!window.api?.configuration?.get) {
        throw new Error('window.api.configuration không khả dụng (preload?)')
      }
      const data = (await window.api.configuration.get()) as Record<string, unknown>
      l.info('Loading configuration from main process:', data)
      const state = get()
      const updates: Record<string, unknown> = { isConfigLoaded: true }

      for (const [key, value] of Object.entries(data)) {
        if (key in state) updates[key] = value
      }
      if (!('multiRepoEnabled' in data)) updates.multiRepoEnabled = false
      if (!('multiRepoSource' in data)) updates.multiRepoSource = 'manual'
      if (!('multiRepoPaths' in data) || !Array.isArray(data.multiRepoPaths)) updates.multiRepoPaths = []
      if (!('gitleaksEnabled' in data)) updates.gitleaksEnabled = false
      if (!('gitleaksMode' in data)) updates.gitleaksMode = 'block'
      if (!('gitleaksConfigPath' in data)) updates.gitleaksConfigPath = ''
      if (!('playNotificationSound' in data)) updates.playNotificationSound = true
      if (!('notificationSoundPath' in data)) updates.notificationSoundPath = ''
      set(updates as Partial<ConfigurationStore>)
      l.info('Configuration loaded, current versionControlSystem:', get().versionControlSystem)
    } catch (err) {
      l.error('loadConfigurationConfig failed — vẫn mở UI với mặc định', err)
    } finally {
      set(s => (s.isConfigLoaded ? s : { ...s, isConfigLoaded: true }))
    }
  },
}))

/** Snapshot of config fields that affect VCS/source data. Used to skip reloadData when only e.g. developerMode changed. */
export function getConfigDataRelevantSnapshot(
  state: Pick<ConfigurationStore, 'sourceFolder' | 'versionControlSystem' | 'multiRepoEnabled' | 'multiRepoSource' | 'multiRepoPaths'>
): string {
  return JSON.stringify({
    sourceFolder: state.sourceFolder ?? '',
    versionControlSystem: state.versionControlSystem ?? 'svn',
    multiRepoEnabled: state.multiRepoEnabled ?? false,
    multiRepoSource: state.multiRepoSource ?? 'manual',
    multiRepoPaths: Array.isArray(state.multiRepoPaths) ? state.multiRepoPaths : [],
  })
}
