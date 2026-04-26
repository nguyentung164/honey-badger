'use client'
import { Bug, Cloud, Download, FileCode, GitBranch, Info, KeyRound, LifeBuoy, Loader2, Palette, ScrollText, Settings, Upload, X } from 'lucide-react'
import { IPC } from 'main/constants'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import toast from '@/components/ui-elements/Toast'
import { stopNotificationSound } from '@/hooks/useNotificationSound'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import { useCodingRuleStore } from '../../../stores/useCodingRuleStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'
import { useExternalEditorStore } from '../../../stores/useExternalEditorStore'
import { useMailServerStore } from '../../../stores/useMailServerStore'
import { useSelectedProjectStore } from '../../../stores/useSelectedProjectStore'
import { useSourceFolderStore } from '../../../stores/useSourceFolderStore'
import { useTaskAuthStore } from '../../../stores/useTaskAuthStore'
import { useWebhookStore } from '../../../stores/useWebhookStore'
import { ApiKeysTabContent } from '../settings/ApiKeysTabContent'
import { AppearanceTabContent } from '../settings/AppearanceTabContent'
import { ConfigurationTabContent } from '../settings/ConfigurationTabContent'
import { IntegrationsTabContent } from '../settings/IntegrationsTabContent'
import { RulesTabContent } from '../settings/RulesTabContent'
import { VersionControlTabContent } from '../settings/VersionControlTabContent'
import { InfoDialog } from './AboutDialog'
import { SupportFeedbackDialog } from './SupportFeedbackDialog'

interface SettingsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type IntegrationsSavePayload = {
  mail: { smtpServer: string; port: string; email: string; password: string }
  onedrive: { clientId: string; clientSecret: string; refreshToken: string }
  db: { host: string; port: string; user: string; password: string; databaseName: string }
}

/** IPC preload dùng JSON.stringify; object không thuần (vd. có tham chiếu window) gây lỗi circular. */
function integrationFieldToString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  return String(v)
}

function isIntegrationsSavePayload(v: unknown): v is IntegrationsSavePayload {
  if (v == null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return o.mail != null && typeof o.mail === 'object' && o.onedrive != null && typeof o.onedrive === 'object' && o.db != null && typeof o.db === 'object'
}

function toIntegrationsSavePayloadFromFormState(args: {
  smtpServer: unknown
  port: unknown
  email: unknown
  password: unknown
  oneDriveClientId: unknown
  oneDriveClientSecret: unknown
  oneDriveRefreshToken: unknown
  dbHost: unknown
  dbPort: unknown
  dbUser: unknown
  dbPassword: unknown
  dbName: unknown
}): IntegrationsSavePayload {
  const s = integrationFieldToString
  return {
    mail: {
      smtpServer: s(args.smtpServer),
      port: s(args.port),
      email: s(args.email),
      password: s(args.password),
    },
    onedrive: {
      clientId: s(args.oneDriveClientId),
      clientSecret: s(args.oneDriveClientSecret),
      refreshToken: s(args.oneDriveRefreshToken),
    },
    db: {
      host: s(args.dbHost),
      port: s(args.dbPort),
      user: s(args.dbUser),
      password: s(args.dbPassword),
      databaseName: s(args.dbName),
    },
  }
}

/** Các key này thuộc tab Integrations (integrationsDirty), không tính vào configDirty để tránh configDirtyTab=null. */
const SETTINGS_ZUSTAND_KEYS_FOR_INTEGRATIONS_TAB = new Set([
  'oneDriveClientId',
  'oneDriveClientSecret',
  'oneDriveRefreshToken',
  'dbHost',
  'dbPort',
  'dbUser',
  'dbPassword',
  'dbName',
])

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const language = useAppearanceStoreSelect(s => s.language)
  const { t, i18n } = useTranslation()

  const {
    openaiApiKey,
    openaiModel,
    openaiReasoningEffort,
    claudeApiKey,
    googleApiKey,
    activeApiProvider,
    svnFolder,
    externalEditorPath,
    webhookMS,
    codingRule,
    codingRuleId,
    oneDriveClientId,
    oneDriveClientSecret,
    oneDriveRefreshToken,
    startOnLogin,
    showNotifications,
    playNotificationSound,
    notificationSoundPath,
    enableTeamsNotification,
    commitConventionEnabled,
    commitConventionMode,
    gitleaksEnabled,
    gitleaksMode,
    gitleaksConfigPath,
    developerMode,
    commitMessageDetailLevel,
    multiRepoSource,
    multiRepoPaths,
    setFieldConfiguration,
    saveConfigurationConfig,
    loadConfigurationConfig,
    dbHost,
    dbPort,
    dbUser,
    dbPassword,
    dbName,
  } = useConfigurationStore()

  const { smtpServer, port, email, password, setFieldMailServer, loadMailServerConfig, saveMailServerConfig } = useMailServerStore()
  const user = useTaskAuthStore(s => s.user)
  const authToken = useTaskAuthStore(s => s.token)
  const isGuest = useTaskAuthStore(s => s.isGuest)
  const isAdmin = user?.role === 'admin'
  /** Lưu Integrations lên DB task (đồng bộ server) — cần admin + token; nếu không thì chỉ ghi file cấu hình local. */
  const integrationsSaveUsesServer = Boolean(authToken && isAdmin)
  const clearSession = useTaskAuthStore(s => s.clearSession)
  const { loadWebhookConfig, addWebhook, deleteWebhook, updateWebhook } = useWebhookStore()
  const { loadCodingRuleConfig } = useCodingRuleStore()
  const { loadSourceFolderConfig, addSourceFolder, deleteSourceFolder, updateSourceFolder } = useSourceFolderStore()
  const { externalEditorList, loadExternalEditorConfig, addExternalEditor, deleteExternalEditor, updateExternalEditor } = useExternalEditorStore()
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false)
  const [editWebhookDialogOpen, setEditWebhookDialogOpen] = useState(false)
  const [sourceFolderDialogOpen, setSourceFolderDialogOpen] = useState(false)
  const [editSourceFolderDialogOpen, setEditSourceFolderDialogOpen] = useState(false)
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [sourceFolderName, setSourceFolderName] = useState('')
  const [sourceFolderPath, setSourceFolderPath] = useState('')
  const [externalEditorDialogOpen, setExternalEditorDialogOpen] = useState(false)
  const [editExternalEditorDialogOpen, setEditExternalEditorDialogOpen] = useState(false)
  const [externalEditorNameForDialog, setExternalEditorNameForDialog] = useState('')
  const [externalEditorPathForDialog, setExternalEditorPathForDialog] = useState('')
  const [activeTab, setActiveTab] = useState('appearance')
  /** Chỉ dùng khi đã đăng nhập, không guest, không admin: ẩn tab Integrations nếu schema task đã có (tránh lộ mail/OneDrive). */
  const [hideIntegrationsForNonAdmin, setHideIntegrationsForNonAdmin] = useState(false)

  const showIntegrationsTab = isAdmin || isGuest || user == null || !hideIntegrationsForNonAdmin

  useEffect(() => {
    if (!open) {
      setHideIntegrationsForNonAdmin(false)
      return
    }
    if (isAdmin || isGuest || user == null) {
      setHideIntegrationsForNonAdmin(false)
      return
    }
    void window.api.task.checkTaskSchemaApplied().then(res => {
      setHideIntegrationsForNonAdmin(res.ok === true && res.applied === true)
    })
  }, [open, isAdmin, isGuest, user])

  const refreshIntegrationsTabGate = useCallback(() => {
    if (isAdmin || isGuest || user == null) return
    void window.api.task.checkTaskSchemaApplied().then(res => {
      setHideIntegrationsForNonAdmin(res.ok === true && res.applied === true)
    })
  }, [isAdmin, isGuest, user])

  useEffect(() => {
    if (open && activeTab === 'integrations' && !showIntegrationsTab) {
      setActiveTab('appearance')
    }
  }, [open, activeTab, showIntegrationsTab])

  const [showInfo, setShowInfo] = useState(false)
  const [showSupportFeedback, setShowSupportFeedback] = useState(false)
  const [testMailLoading, setTestMailLoading] = useState(false)
  const [testWebhookLoading, setTestWebhookLoading] = useState(false)
  const [isSourceFolderActionLoading, setIsSourceFolderActionLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const VERSION_CONTROL_DEFERRED_KEYS = ['multiRepoEnabled', 'sourceFolder', 'versionControlSystem', 'autoRefreshEnabled'] as const
  const [draftSelectedProjectId, setDraftSelectedProjectId] = useState<string | null>(null)
  const [versionControlDraft, setVersionControlDraft] = useState<{
    multiRepoEnabled: boolean
    sourceFolder: string
    versionControlSystem: 'svn' | 'git'
    autoRefreshEnabled: boolean
  }>({
    multiRepoEnabled: false,
    sourceFolder: '',
    versionControlSystem: 'svn',
    autoRefreshEnabled: true,
  })

  const initialConfigRef = useRef<Record<string, unknown> | null>(null)
  const initialIntegrationsRef = useRef<{ config: Record<string, unknown>; mail: Record<string, unknown> } | null>(null)
  const [dirtyCheckVersion, setDirtyCheckVersion] = useState(0)
  const isDirtyRef = useRef(false)

  const handleSetConfig = useCallback(
    (key: Parameters<typeof setFieldConfiguration>[0], value: Parameters<typeof setFieldConfiguration>[1]) => {
      setFieldConfiguration(key, value)
    },
    [setFieldConfiguration]
  )

  const handleSetConfigDeferred = useCallback(
    (key: Parameters<typeof setFieldConfiguration>[0], value: Parameters<typeof setFieldConfiguration>[1]) => {
      if (VERSION_CONTROL_DEFERRED_KEYS.includes(key as (typeof VERSION_CONTROL_DEFERRED_KEYS)[number])) {
        startTransition(() =>
          setVersionControlDraft(prev => ({
            ...prev,
            [key]: value,
          }))
        )
        return
      }
      startTransition(() => setFieldConfiguration(key, value))
    },
    [setFieldConfiguration]
  )

  const handleSetMailServer = useCallback(
    (key: Parameters<typeof setFieldMailServer>[0], value: Parameters<typeof setFieldMailServer>[1]) => {
      setFieldMailServer(key, value)
    },
    [setFieldMailServer]
  )

  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language)
    }
  }, [language, i18n])

  useEffect(() => {
    if (open) {
      const init = async () => {
        await Promise.all([loadConfigurationConfig(), loadMailServerConfig()])
        const auth = useTaskAuthStore.getState()
        if (auth.user?.role === 'admin' && auth.token) {
          try {
            const intRes = await window.api.task.getIntegrationsForSettings(auth.token)
            if (intRes.status === 'success' && intRes.data) {
              const d = intRes.data
              const s = integrationFieldToString
              const ms = useMailServerStore.getState()
              ms.setFieldMailServer('smtpServer', s(d.mail.smtpServer))
              ms.setFieldMailServer('port', s(d.mail.port))
              ms.setFieldMailServer('email', s(d.mail.email))
              ms.setFieldMailServer('password', s(d.mail.password))
              const cs = useConfigurationStore.getState()
              cs.setFieldConfiguration('oneDriveClientId', s(d.onedrive.clientId))
              cs.setFieldConfiguration('oneDriveClientSecret', s(d.onedrive.clientSecret))
              cs.setFieldConfiguration('oneDriveRefreshToken', s(d.onedrive.refreshToken))
              cs.setFieldConfiguration('dbHost', s(d.db.host))
              cs.setFieldConfiguration('dbPort', s(d.db.port))
              cs.setFieldConfiguration('dbUser', s(d.db.user))
              cs.setFieldConfiguration('dbPassword', s(d.db.password))
              cs.setFieldConfiguration('dbName', s(d.db.databaseName))
            }
          } catch {
            // ignore — dùng cache local
          }
        }
        loadWebhookConfig()
        loadCodingRuleConfig(useConfigurationStore.getState().sourceFolder || '')
        loadSourceFolderConfig()
        loadExternalEditorConfig()
        const configState = useConfigurationStore.getState()
        const mailState = useMailServerStore.getState()
        const initProjectId = useSelectedProjectStore.getState().selectedProjectId
        setDraftSelectedProjectId(initProjectId)
        const configSnapshot = {
          openaiApiKey: configState.openaiApiKey,
          openaiModel: configState.openaiModel,
          openaiReasoningEffort: configState.openaiReasoningEffort,
          claudeApiKey: configState.claudeApiKey,
          googleApiKey: configState.googleApiKey,
          activeApiProvider: configState.activeApiProvider,
          svnFolder: configState.svnFolder,
          sourceFolder: configState.sourceFolder,
          webhookMS: configState.webhookMS,
          codingRule: configState.codingRule,
          codingRuleId: configState.codingRuleId,
          oneDriveClientId: configState.oneDriveClientId,
          oneDriveClientSecret: configState.oneDriveClientSecret,
          oneDriveRefreshToken: configState.oneDriveRefreshToken,
          dbHost: configState.dbHost,
          dbPort: configState.dbPort,
          dbUser: configState.dbUser,
          dbPassword: configState.dbPassword,
          dbName: configState.dbName,
          startOnLogin: configState.startOnLogin,
          showNotifications: configState.showNotifications,
          playNotificationSound: configState.playNotificationSound ?? true,
          notificationSoundPath: configState.notificationSoundPath ?? '',
          enableTeamsNotification: configState.enableTeamsNotification,
          versionControlSystem: configState.versionControlSystem,
          commitConventionEnabled: configState.commitConventionEnabled,
          commitConventionMode: configState.commitConventionMode,
          gitleaksEnabled: configState.gitleaksEnabled,
          gitleaksMode: configState.gitleaksMode,
          gitleaksConfigPath: configState.gitleaksConfigPath,
          externalEditorPath: configState.externalEditorPath,
          autoRefreshEnabled: configState.autoRefreshEnabled,
          developerMode: configState.developerMode,
          commitMessageDetailLevel: configState.commitMessageDetailLevel,
          multiRepoEnabled: configState.multiRepoEnabled,
          multiRepoSource: configState.multiRepoSource,
          multiRepoPaths: configState.multiRepoPaths,
          selectedProjectId: initProjectId,
        }
        initialConfigRef.current = configSnapshot
        setVersionControlDraft({
          multiRepoEnabled: configState.multiRepoEnabled ?? false,
          sourceFolder: configState.sourceFolder ?? '',
          versionControlSystem: (configState.versionControlSystem ?? 'svn') as 'svn' | 'git',
          autoRefreshEnabled: configState.autoRefreshEnabled ?? true,
        })
        initialIntegrationsRef.current = {
          config: {
            oneDriveClientId: configState.oneDriveClientId,
            oneDriveClientSecret: configState.oneDriveClientSecret,
            oneDriveRefreshToken: configState.oneDriveRefreshToken,
            dbHost: configState.dbHost,
            dbPort: configState.dbPort,
            dbUser: configState.dbUser,
            dbPassword: configState.dbPassword,
            dbName: configState.dbName,
          },
          mail: {
            smtpServer: mailState.smtpServer,
            port: mailState.port,
            email: mailState.email,
            password: mailState.password,
          },
        }
      }
      init()
    } else {
      initialConfigRef.current = null
      initialIntegrationsRef.current = null
      setDirtyCheckVersion(0)
    }
  }, [open, loadWebhookConfig, loadCodingRuleConfig, loadConfigurationConfig, loadMailServerConfig, loadSourceFolderConfig, loadExternalEditorConfig])

  const { configDirty, configDirtyTab } = useMemo(() => {
    if (!open || !initialConfigRef.current) return { configDirty: false, configDirtyTab: null as 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null }
    const init = initialConfigRef.current
    const current = {
      openaiApiKey,
      openaiModel,
      openaiReasoningEffort,
      claudeApiKey,
      googleApiKey,
      activeApiProvider,
      svnFolder,
      sourceFolder: versionControlDraft.sourceFolder,
      webhookMS,
      codingRule,
      codingRuleId,
      oneDriveClientId,
      oneDriveClientSecret,
      oneDriveRefreshToken,
      dbHost,
      dbPort,
      dbUser,
      dbPassword,
      dbName,
      startOnLogin,
      showNotifications,
      playNotificationSound,
      notificationSoundPath,
      enableTeamsNotification,
      versionControlSystem: versionControlDraft.versionControlSystem,
      commitConventionEnabled,
      commitConventionMode,
      gitleaksEnabled,
      gitleaksMode,
      gitleaksConfigPath,
      externalEditorPath,
      autoRefreshEnabled: versionControlDraft.autoRefreshEnabled,
      developerMode,
      commitMessageDetailLevel,
      multiRepoEnabled: versionControlDraft.multiRepoEnabled,
      multiRepoSource,
      multiRepoPaths,
      selectedProjectId: draftSelectedProjectId,
    }
    const dirtyKeys = Object.keys(init).filter(k => !SETTINGS_ZUSTAND_KEYS_FOR_INTEGRATIONS_TAB.has(k))
    const isDirty = dirtyKeys.some(k => {
      const a = (init as Record<string, unknown>)[k]
      const b = (current as Record<string, unknown>)[k]
      if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b)
      return String(a ?? '') !== String(b ?? '')
    })
    if (!isDirty) return { configDirty: false, configDirtyTab: null as 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null }
    const configTabFields = [
      'svnFolder',
      'webhookMS',
      'enableTeamsNotification',
      'startOnLogin',
      'showNotifications',
      'playNotificationSound',
      'notificationSoundPath',
      'externalEditorPath',
      'developerMode',
    ]
    const apikeysFields = ['openaiApiKey', 'openaiModel', 'openaiReasoningEffort', 'claudeApiKey', 'googleApiKey', 'activeApiProvider', 'commitMessageDetailLevel']
    const versioncontrolFields = ['sourceFolder', 'versionControlSystem', 'autoRefreshEnabled', 'multiRepoEnabled', 'selectedProjectId']
    const rulesFields = ['codingRule', 'codingRuleId', 'commitConventionEnabled', 'commitConventionMode', 'gitleaksEnabled', 'gitleaksMode', 'gitleaksConfigPath']
    const tabHasChanges = (fields: string[]) => fields.some(k => String((init as Record<string, unknown>)[k] ?? '') !== String((current as Record<string, unknown>)[k] ?? ''))
    let tab: 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null = null
    if (tabHasChanges(configTabFields)) tab = 'configuration'
    else if (tabHasChanges(apikeysFields)) tab = 'apikeys'
    else if (tabHasChanges(versioncontrolFields)) tab = 'versioncontrol'
    else if (tabHasChanges(rulesFields)) tab = 'rules'
    return { configDirty: true, configDirtyTab: tab }
  }, [
    dirtyCheckVersion,
    open,
    openaiApiKey,
    openaiModel,
    openaiReasoningEffort,
    claudeApiKey,
    googleApiKey,
    activeApiProvider,
    svnFolder,
    webhookMS,
    codingRule,
    codingRuleId,
    oneDriveClientId,
    oneDriveClientSecret,
    oneDriveRefreshToken,
    dbHost,
    dbPort,
    dbUser,
    dbPassword,
    dbName,
    startOnLogin,
    showNotifications,
    playNotificationSound,
    notificationSoundPath,
    enableTeamsNotification,
    commitConventionEnabled,
    commitConventionMode,
    gitleaksEnabled,
    gitleaksMode,
    gitleaksConfigPath,
    externalEditorPath,
    developerMode,
    commitMessageDetailLevel,
    versionControlDraft,
    multiRepoSource,
    multiRepoPaths,
    draftSelectedProjectId,
  ])

  const integrationsDirty = useMemo(() => {
    if (!open || !initialIntegrationsRef.current) return false
    const { config: initConfig, mail: initMail } = initialIntegrationsRef.current
    const currentMail = { smtpServer, port, email, password }
    const currentIntegrationsConfig = { oneDriveClientId, oneDriveClientSecret, oneDriveRefreshToken, dbHost, dbPort, dbUser, dbPassword, dbName }
    const mailDirty = Object.keys(initMail).some(k => String((initMail as Record<string, unknown>)[k] ?? '') !== String((currentMail as Record<string, unknown>)[k] ?? ''))
    const integrationsConfigDirty = Object.keys(initConfig).some(
      k => String((initConfig as Record<string, unknown>)[k] ?? '') !== String((currentIntegrationsConfig as Record<string, unknown>)[k] ?? '')
    )
    return mailDirty || integrationsConfigDirty
  }, [dirtyCheckVersion, open, smtpServer, port, email, password, oneDriveClientId, oneDriveClientSecret, oneDriveRefreshToken, dbHost, dbPort, dbUser, dbPassword, dbName])

  const isDirty = configDirty || integrationsDirty
  isDirtyRef.current = isDirty

  useEffect(() => {
    if (!open) stopNotificationSound()
  }, [open])

  const handleRequestClose = useCallback(() => {
    if (isDirtyRef.current) {
      setShowDiscardConfirm(true)
    } else {
      stopNotificationSound()
      onOpenChange?.(false)
    }
  }, [onOpenChange])

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false)
    stopNotificationSound()
    onOpenChange?.(false)
  }, [onOpenChange])

  const handleAddWebhook = async () => {
    if (!webhookName.trim() || !webhookUrl.trim()) {
      return
    }
    const newWebhook = {
      name: webhookName,
      url: webhookUrl,
    }
    const result = await addWebhook(newWebhook)
    if (result) {
      setWebhookName('')
      setWebhookUrl('')
      setWebhookDialogOpen(false)
      handleSetConfig('webhookMS', webhookUrl)
    }
  }

  const handleUpdateWebhook = async () => {
    if (!webhookName.trim() || !webhookUrl.trim()) {
      return
    }
    const updatedWebhook = {
      name: webhookName,
      url: webhookUrl,
    }
    const result = await updateWebhook(updatedWebhook)
    if (result) {
      setEditWebhookDialogOpen(false)
    }
  }

  const handleDeleteWebhook = async (name: string) => {
    deleteWebhook(name)
    handleSetConfig('webhookMS', '')
  }

  const handleSaveConfigurationConfig = async (silent = false) => {
    try {
      setFieldConfiguration('multiRepoEnabled', versionControlDraft.multiRepoEnabled)
      setFieldConfiguration('sourceFolder', versionControlDraft.sourceFolder)
      setFieldConfiguration('versionControlSystem', versionControlDraft.versionControlSystem)
      setFieldConfiguration('autoRefreshEnabled', versionControlDraft.autoRefreshEnabled)
      useSelectedProjectStore.getState().setSelectedProjectId(draftSelectedProjectId)
      await saveConfigurationConfig({ omitIntegrationFieldsForDisk: true })
      const configState = useConfigurationStore.getState()
      initialConfigRef.current = {
        openaiApiKey: configState.openaiApiKey,
        openaiModel: configState.openaiModel,
        openaiReasoningEffort: configState.openaiReasoningEffort,
        claudeApiKey: configState.claudeApiKey,
        googleApiKey: configState.googleApiKey,
        activeApiProvider: configState.activeApiProvider,
        svnFolder: configState.svnFolder,
        sourceFolder: configState.sourceFolder,
        webhookMS: configState.webhookMS,
        codingRule: configState.codingRule,
        codingRuleId: configState.codingRuleId,
        oneDriveClientId: configState.oneDriveClientId,
        oneDriveClientSecret: configState.oneDriveClientSecret,
        oneDriveRefreshToken: configState.oneDriveRefreshToken,
        dbHost: configState.dbHost,
        dbPort: configState.dbPort,
        dbUser: configState.dbUser,
        dbPassword: configState.dbPassword,
        dbName: configState.dbName,
        startOnLogin: configState.startOnLogin,
        showNotifications: configState.showNotifications,
        playNotificationSound: configState.playNotificationSound ?? true,
        notificationSoundPath: configState.notificationSoundPath ?? '',
        enableTeamsNotification: configState.enableTeamsNotification,
        versionControlSystem: configState.versionControlSystem,
        commitConventionEnabled: configState.commitConventionEnabled,
        commitConventionMode: configState.commitConventionMode,
        gitleaksEnabled: configState.gitleaksEnabled,
        gitleaksMode: configState.gitleaksMode,
        gitleaksConfigPath: configState.gitleaksConfigPath,
        externalEditorPath: configState.externalEditorPath,
        autoRefreshEnabled: configState.autoRefreshEnabled,
        developerMode: configState.developerMode,
        commitMessageDetailLevel: configState.commitMessageDetailLevel,
        multiRepoEnabled: configState.multiRepoEnabled,
        multiRepoSource: configState.multiRepoSource,
        multiRepoPaths: configState.multiRepoPaths,
        selectedProjectId: draftSelectedProjectId,
      }
      const afterSave = useConfigurationStore.getState()
      setVersionControlDraft({
        multiRepoEnabled: afterSave.multiRepoEnabled ?? false,
        sourceFolder: afterSave.sourceFolder ?? '',
        versionControlSystem: (afterSave.versionControlSystem ?? 'svn') as 'svn' | 'git',
        autoRefreshEnabled: afterSave.autoRefreshEnabled ?? true,
      })
      if (!silent) {
        toast.success(t('toast.configSaved'))
      }
      stopNotificationSound()
      setDirtyCheckVersion(v => v + 1)
      // Không dispatch configuration-changed ở đây - main process đã broadcast CONFIG_UPDATED
      // khi save, MainPage sẽ nhận và dispatch, tránh double dispatch gây vòng lặp detect
    } catch (err) {
      logger.error('Failed to save configuration:', err)
      if (!silent) {
        const detail = err instanceof Error && err.message?.trim() ? err.message : ''
        toast.error(detail ? `${t('toast.configSaveFailed')} ${detail}` : t('toast.configSaveFailed'))
      }
      throw err
    }
  }

  const handleSaveIntegrationsConfig = async (payloadOverride?: IntegrationsSavePayload) => {
    const override = isIntegrationsSavePayload(payloadOverride) ? payloadOverride : undefined
    const payload: IntegrationsSavePayload =
      override ??
      toIntegrationsSavePayloadFromFormState({
        smtpServer,
        port,
        email,
        password,
        oneDriveClientId,
        oneDriveClientSecret,
        oneDriveRefreshToken,
        dbHost,
        dbPort,
        dbUser,
        dbPassword,
        dbName,
      })
    try {
      const auth = useTaskAuthStore.getState()
      const saveViaTaskServer = Boolean(auth.token && isAdmin)
      if (!saveViaTaskServer) {
        await saveConfigurationConfig()
        await saveMailServerConfig()
        const configState = useConfigurationStore.getState()
        const mailState = useMailServerStore.getState()
        initialConfigRef.current = {
          openaiApiKey: configState.openaiApiKey,
          openaiModel: configState.openaiModel,
          openaiReasoningEffort: configState.openaiReasoningEffort,
          claudeApiKey: configState.claudeApiKey,
          googleApiKey: configState.googleApiKey,
          activeApiProvider: configState.activeApiProvider,
          svnFolder: configState.svnFolder,
          sourceFolder: configState.sourceFolder,
          webhookMS: configState.webhookMS,
          codingRule: configState.codingRule,
          codingRuleId: configState.codingRuleId,
          oneDriveClientId: configState.oneDriveClientId,
          oneDriveClientSecret: configState.oneDriveClientSecret,
          oneDriveRefreshToken: configState.oneDriveRefreshToken,
          dbHost: configState.dbHost,
          dbPort: configState.dbPort,
          dbUser: configState.dbUser,
          dbPassword: configState.dbPassword,
          dbName: configState.dbName,
          startOnLogin: configState.startOnLogin,
          showNotifications: configState.showNotifications,
          playNotificationSound: configState.playNotificationSound ?? true,
          notificationSoundPath: configState.notificationSoundPath ?? '',
          enableTeamsNotification: configState.enableTeamsNotification,
          versionControlSystem: configState.versionControlSystem,
          commitConventionEnabled: configState.commitConventionEnabled,
          commitConventionMode: configState.commitConventionMode,
          gitleaksEnabled: configState.gitleaksEnabled,
          gitleaksMode: configState.gitleaksMode,
          gitleaksConfigPath: configState.gitleaksConfigPath,
          externalEditorPath: configState.externalEditorPath,
          autoRefreshEnabled: configState.autoRefreshEnabled,
          developerMode: configState.developerMode,
          commitMessageDetailLevel: configState.commitMessageDetailLevel,
          multiRepoEnabled: configState.multiRepoEnabled,
          multiRepoSource: configState.multiRepoSource,
          multiRepoPaths: configState.multiRepoPaths,
          selectedProjectId: draftSelectedProjectId,
        }
        stopNotificationSound()
        initialIntegrationsRef.current = {
          config: {
            oneDriveClientId: configState.oneDriveClientId,
            oneDriveClientSecret: configState.oneDriveClientSecret,
            oneDriveRefreshToken: configState.oneDriveRefreshToken,
            dbHost: configState.dbHost,
            dbPort: configState.dbPort,
            dbUser: configState.dbUser,
            dbPassword: configState.dbPassword,
            dbName: configState.dbName,
          },
          mail: {
            smtpServer: mailState.smtpServer,
            port: mailState.port,
            email: mailState.email,
            password: mailState.password,
          },
        }
        toast.success(t('toast.configSaved'))
        setDirtyCheckVersion(v => v + 1)
        window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
        return
      }
      const res = await window.api.task.saveIntegrationsSettings(auth.token!, payload)
      if (res.status !== 'success') {
        toast.error('message' in res && res.message ? String(res.message) : t('toast.configSaveFailed'))
        throw new Error('SETTINGS_INTEGRATIONS_SAVE_ABORTED')
      }
      const configState = useConfigurationStore.getState()
      const mailState = useMailServerStore.getState()
      initialConfigRef.current = {
        openaiApiKey: configState.openaiApiKey,
        openaiModel: configState.openaiModel,
        openaiReasoningEffort: configState.openaiReasoningEffort,
        claudeApiKey: configState.claudeApiKey,
        googleApiKey: configState.googleApiKey,
        activeApiProvider: configState.activeApiProvider,
        svnFolder: configState.svnFolder,
        sourceFolder: configState.sourceFolder,
        webhookMS: configState.webhookMS,
        codingRule: configState.codingRule,
        codingRuleId: configState.codingRuleId,
        oneDriveClientId: configState.oneDriveClientId,
        oneDriveClientSecret: configState.oneDriveClientSecret,
        oneDriveRefreshToken: configState.oneDriveRefreshToken,
        dbHost: configState.dbHost,
        dbPort: configState.dbPort,
        dbUser: configState.dbUser,
        dbPassword: configState.dbPassword,
        dbName: configState.dbName,
        startOnLogin: configState.startOnLogin,
        showNotifications: configState.showNotifications,
        playNotificationSound: configState.playNotificationSound ?? true,
        notificationSoundPath: configState.notificationSoundPath ?? '',
        enableTeamsNotification: configState.enableTeamsNotification,
        versionControlSystem: configState.versionControlSystem,
        commitConventionEnabled: configState.commitConventionEnabled,
        commitConventionMode: configState.commitConventionMode,
        gitleaksEnabled: configState.gitleaksEnabled,
        gitleaksMode: configState.gitleaksMode,
        gitleaksConfigPath: configState.gitleaksConfigPath,
        externalEditorPath: configState.externalEditorPath,
        autoRefreshEnabled: configState.autoRefreshEnabled,
        developerMode: configState.developerMode,
        commitMessageDetailLevel: configState.commitMessageDetailLevel,
        multiRepoEnabled: configState.multiRepoEnabled,
        multiRepoSource: configState.multiRepoSource,
        multiRepoPaths: configState.multiRepoPaths,
        selectedProjectId: draftSelectedProjectId,
      }
      stopNotificationSound()
      initialIntegrationsRef.current = {
        config: {
          oneDriveClientId: configState.oneDriveClientId,
          oneDriveClientSecret: configState.oneDriveClientSecret,
          oneDriveRefreshToken: configState.oneDriveRefreshToken,
          dbHost: configState.dbHost,
          dbPort: configState.dbPort,
          dbUser: configState.dbUser,
          dbPassword: configState.dbPassword,
          dbName: configState.dbName,
        },
        mail: {
          smtpServer: mailState.smtpServer,
          port: mailState.port,
          email: mailState.email,
          password: mailState.password,
        },
      }
      toast.success(t('toast.configSaved'))
      setDirtyCheckVersion(v => v + 1)
      window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
    } catch (err) {
      logger.error('Failed to save integrations configuration:', err)
      const aborted = err instanceof Error && err.message === 'SETTINGS_INTEGRATIONS_SAVE_ABORTED'
      if (!aborted) {
        const detail = err instanceof Error && err.message?.trim() ? err.message : ''
        toast.error(detail ? `${t('toast.configSaveFailed')} ${detail}` : t('toast.configSaveFailed'))
      }
      throw err
    }
  }

  const handleSaveAndClose = useCallback(async () => {
    try {
      const bothDirty = integrationsDirty && configDirty
      if (bothDirty) {
        const integrationSnapshot = toIntegrationsSavePayloadFromFormState({
          smtpServer,
          port,
          email,
          password,
          oneDriveClientId,
          oneDriveClientSecret,
          oneDriveRefreshToken,
          dbHost,
          dbPort,
          dbUser,
          dbPassword,
          dbName,
        })
        await handleSaveConfigurationConfig(false)
        await handleSaveIntegrationsConfig(integrationSnapshot)
      } else {
        if (integrationsDirty) {
          await handleSaveIntegrationsConfig()
        }
        if (configDirty) {
          await handleSaveConfigurationConfig(false)
        }
      }
      setShowDiscardConfirm(false)
      onOpenChange?.(false)
    } catch {
      // toast đã xử lý trong handleSave*; không đóng dialog khi lưu lỗi
    }
  }, [
    configDirty,
    integrationsDirty,
    onOpenChange,
    smtpServer,
    port,
    email,
    password,
    oneDriveClientId,
    oneDriveClientSecret,
    oneDriveRefreshToken,
    dbHost,
    dbPort,
    dbUser,
    dbPassword,
    dbName,
  ])

  const handleTestMailConnection = async () => {
    setTestMailLoading(true)
    try {
      const result = await window.api.mail_server.test({ smtpServer, port, email, password })
      if (result.success) {
        toast.success(t('toast.testMailSuccess'))
      } else {
        toast.error(t('toast.testMailError') + (result.error ? `: ${result.error}` : ''))
      }
    } catch (_err) {
      toast.error(t('toast.testMailError'))
    } finally {
      setTestMailLoading(false)
    }
  }

  const handleTestWebhookConnection = async () => {
    if (!webhookMS?.trim()) {
      toast.error(`${t('toast.testWebhookError')}: ${t('settings.configuration.selectWebhook')}`)
      return
    }
    setTestWebhookLoading(true)
    try {
      const result = await window.api.webhook.test(webhookMS)
      if (result.success) {
        toast.success(t('toast.testWebhookSuccess'))
      } else {
        toast.error(t('toast.testWebhookError') + (result.error ? `: ${result.error}` : ''))
      }
    } catch (_err) {
      toast.error(t('toast.testWebhookError'))
    } finally {
      setTestWebhookLoading(false)
    }
  }

  const handleAddSourceFolder = async (): Promise<{ folder: { name: string; path: string } } | undefined> => {
    if (!sourceFolderName.trim() || !sourceFolderPath.trim()) return
    const newSourceFolder = {
      name: sourceFolderName.trim(),
      path: sourceFolderPath.trim(),
    }
    const result = await addSourceFolder(newSourceFolder)
    if (result) {
      setSourceFolderName('')
      setSourceFolderPath('')
      setSourceFolderDialogOpen(false)
      setVersionControlDraft(prev => ({ ...prev, sourceFolder: newSourceFolder.path }))
      return { folder: newSourceFolder }
    }
  }

  const handleDeleteSourceFolder = async (name: string) => {
    setIsSourceFolderActionLoading(true)
    try {
      const { sourceFolderList } = useSourceFolderStore.getState()
      const folder = sourceFolderList.find(f => f.name === name)
      if (folder) {
        const res = await window.api.task.deleteUserProjectSourceFolder(folder.path)
        if (res.status !== 'success') {
          if (res.code === 'UNAUTHORIZED') {
            if (user) {
              clearSession()
              toast.error(t('common.sessionExpired'))
              return
            }
          } else {
            toast.error(res.message ?? t('toast.error'))
            return
          }
        }
      }
      deleteSourceFolder(name)
      setVersionControlDraft(prev => ({ ...prev, sourceFolder: '' }))
    } finally {
      setIsSourceFolderActionLoading(false)
    }
  }

  const handleUpdateSourceFolder = async (projectId: string, options?: { oldPath?: string; oldProjectId?: string }) => {
    if (!sourceFolderName.trim() || !sourceFolderPath.trim()) return
    setIsSourceFolderActionLoading(true)
    try {
      const newPath = sourceFolderPath.trim()
      const pathChanged = options?.oldPath != null && options.oldPath !== newPath
      const projectChanged = options?.oldProjectId != null && options.oldProjectId !== projectId
      if (projectId && (pathChanged || projectChanged) && options?.oldPath && options?.oldProjectId) {
        const delRes = await window.api.task.deleteUserProjectSourceFolder(options.oldPath)
        if (delRes.status !== 'success') {
          toast.error(delRes.message ?? t('toast.error'))
          return
        }
      }
      if (projectId) {
        const res = await window.api.task.upsertUserProjectSourceFolder(projectId, newPath, sourceFolderName.trim())
        if (res.status !== 'success') {
          toast.error(res.message ?? t('toast.error'))
          return
        }
      }
      const updatedSourceFolder = {
        name: sourceFolderName,
        path: sourceFolderPath,
      }
      const result = await updateSourceFolder(updatedSourceFolder)
      if (result) {
        setEditSourceFolderDialogOpen(false)
        if (options?.oldPath != null && versionControlDraft.sourceFolder === options.oldPath) {
          setVersionControlDraft(prev => ({ ...prev, sourceFolder: newPath }))
        }
        window.dispatchEvent(new CustomEvent('multi-repo-links-changed'))
        if (versionControlDraft.versionControlSystem === 'git' && pathChanged) {
          const det = await window.api.system.detect_version_control(newPath)
          if (det.status !== 'success' || det.data?.type !== 'git' || !det.data?.isValid) {
            toast.warning(t('git.notAGitRepo'))
          }
        }
      }
    } finally {
      setIsSourceFolderActionLoading(false)
    }
  }

  const handleAddExternalEditor = async () => {
    if (!externalEditorNameForDialog.trim() || !externalEditorPathForDialog.trim()) return
    const pathToSet = externalEditorPathForDialog.trim()
    const result = await addExternalEditor({
      name: externalEditorNameForDialog.trim(),
      path: pathToSet,
    })
    if (result) {
      setExternalEditorNameForDialog('')
      setExternalEditorPathForDialog('')
      setExternalEditorDialogOpen(false)
      handleSetConfig('externalEditorPath', pathToSet)
    }
  }

  const handleUpdateExternalEditor = async () => {
    if (!externalEditorNameForDialog.trim() || !externalEditorPathForDialog.trim()) return
    const newPath = externalEditorPathForDialog.trim()
    const result = await updateExternalEditor({
      name: externalEditorNameForDialog.trim(),
      path: newPath,
    })
    if (result) {
      setEditExternalEditorDialogOpen(false)
      const editingSelected = externalEditorList.find(e => e.name === externalEditorNameForDialog.trim())?.path === externalEditorPath
      if (editingSelected) handleSetConfig('externalEditorPath', newPath)
    }
  }

  const handleDeleteExternalEditor = async (name: string) => {
    const editor = externalEditorList.find(e => e.name === name)
    await deleteExternalEditor(name)
    if (editor && externalEditorPath === editor.path) {
      handleSetConfig('externalEditorPath', '')
    }
  }

  return (
    <>
      <InfoDialog open={showInfo} onOpenChange={setShowInfo} />
      <SupportFeedbackDialog open={showSupportFeedback} onOpenChange={setShowSupportFeedback} />
      <AlertDialog open={showDiscardConfirm} onOpenChange={open => !open && setShowDiscardConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.configuration.closeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.configuration.closeConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row flex-nowrap justify-between gap-2 sm:justify-between">
            <AlertDialogCancel className="mr-auto sm:mr-auto">{t('common.cancel')}</AlertDialogCancel>
            <div className="flex gap-2">
              <Button type="button" onClick={handleSaveAndClose} className="bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-600">
                {t('settings.configuration.saveAndClose')}
              </Button>
              <AlertDialogAction onClick={handleDiscardAndClose} className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600">
                {t('settings.configuration.discardAndClose')}
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={open}
        onOpenChange={next => {
          if (next === false) handleRequestClose()
          else onOpenChange?.(next)
        }}
      >
        <DialogContent onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()} className="max-w-3xl! p-0 gap-0 overflow-hidden [&>button]:hidden">
          <DialogTitle className="sr-only">{t('title.settings')}</DialogTitle>
          {/* Custom Toolbar - Compact style like AIAnalysisDialog */}
          <div
            className="flex items-center justify-between h-8 text-sm border-b select-none relative"
            style={{
              backgroundColor: 'var(--main-bg)',
              color: 'var(--main-fg)',
            }}
          >
            <div className="flex items-center h-full">
              <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
                <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
              </div>
              <div className="flex items-center gap-1 ml-2">
                <Button id="settings-about-button" variant="ghost" size="sm" onClick={() => setShowInfo(true)} className="h-7 px-2 gap-1.5" title={t('title.about')}>
                  <Info className="h-2.5 w-2.5" />
                </Button>
                <Button
                  id="settings-support-button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSupportFeedback(true)}
                  className="h-7 px-2 gap-1.5"
                  title={t('title.supportFeedback')}
                >
                  <LifeBuoy className="h-2.5 w-2.5" />
                </Button>
                {developerMode && (
                  <Button
                    id="settings-app-logs-button"
                    variant="ghost"
                    size="sm"
                    onClick={() => window.api.electron.send(IPC.WINDOW.APP_LOGS)}
                    className="h-7 px-2 gap-1.5"
                    title={t('appLogs.viewLogs')}
                  >
                    <ScrollText className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
            </div>
            <span className="absolute left-1/2 -translate-x-1/2 text-xs font-medium">{t('title.settings')}</span>
            <div className="flex items-center gap-2 mr-1">
              {isAdmin && (
                <div className="flex items-center gap-1.5" title={t('settings.developerModeDescription')}>
                  <Bug className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs">{t('settings.developerMode')}</span>
                  <Switch
                    id="developer-mode"
                    checked={developerMode}
                    onCheckedChange={checked => {
                      handleSetConfig('developerMode', checked)
                      if (initialConfigRef.current) {
                        initialConfigRef.current = { ...initialConfigRef.current, developerMode: checked }
                      }
                      handleSaveConfigurationConfig(true)
                    }}
                  />
                </div>
              )}
              <Button
                id="settings-export-config"
                variant="ghost"
                size="sm"
                disabled={isExporting || isImporting}
                onClick={async () => {
                  setIsExporting(true)
                  try {
                    const result = await window.api.configuration.exportToFile()
                    if (result.success) toast.success(t('settings.backup.exportSuccess'))
                    else toast.error(t('settings.backup.exportError') || 'Lỗi khi xuất cấu hình')
                  } catch (_err) {
                    toast.error(t('settings.backup.exportError') || 'Lỗi khi xuất cấu hình')
                  } finally {
                    setIsExporting(false)
                  }
                }}
                className="h-7 px-2 gap-1.5"
                title={t('settings.backup.export') || 'Xuất cấu hình'}
              >
                {isExporting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
              </Button>
              <Button
                id="settings-import-config"
                variant="ghost"
                size="sm"
                disabled={isExporting || isImporting}
                onClick={async () => {
                  setIsImporting(true)
                  try {
                    const result = await window.api.configuration.importFromFile()
                    if (result.canceled) return
                    if (result.success) {
                      toast.success(t('settings.backup.importSuccess') || 'Đã khôi phục cấu hình thành công')
                      toast.warning(t('settings.backup.integrationsLocalCacheNote'))
                      await loadConfigurationConfig()
                      await loadMailServerConfig()
                      loadWebhookConfig()
                      loadCodingRuleConfig(useConfigurationStore.getState().sourceFolder || '')
                      loadSourceFolderConfig()
                      onOpenChange?.(false)
                      window.location.reload()
                    } else {
                      toast.error((result as { error?: string }).error || t('settings.backup.importError') || 'Lỗi khi khôi phục')
                    }
                  } catch (_err) {
                    toast.error(t('settings.backup.importError') || 'Lỗi khi khôi phục cấu hình')
                  } finally {
                    setIsImporting(false)
                  }
                }}
                className="h-7 px-2 gap-1.5"
                title={t('settings.backup.import') || 'Nhập cấu hình'}
              >
                {isImporting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Upload className="h-2.5 w-2.5" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRequestClose} className="h-7 px-2 gap-1.5" title={t('common.close')}>
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-4! p-4">
            <TabsList className={`grid w-full ${showIntegrationsTab ? 'grid-cols-6' : 'grid-cols-5'}`}>
              <TabsTrigger id="settings-tab-appearance" value="appearance" className="flex items-center gap-1.5">
                <Palette />
                {t('settings.tab.appearance')}
              </TabsTrigger>
              <TabsTrigger id="settings-tab-configuration" value="configuration" className="flex items-center gap-1.5 relative">
                <Settings />
                {t('settings.tab.configuration')}
                {configDirty && configDirtyTab === 'configuration' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" title={t('settings.configuration.unsavedChanges')} />
                )}
              </TabsTrigger>
              <TabsTrigger id="settings-tab-apikeys" value="apikeys" className="flex items-center gap-1.5 relative">
                <KeyRound />
                {t('settings.tab.apikeys') || 'API Keys'}
                {configDirty && configDirtyTab === 'apikeys' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" title={t('settings.configuration.unsavedChanges')} />
                )}
              </TabsTrigger>
              <TabsTrigger id="settings-tab-versioncontrol" value="versioncontrol" className="flex items-center gap-1.5 relative">
                <GitBranch />
                {t('settings.tab.versioncontrol') || 'VCS'}
                {configDirty && configDirtyTab === 'versioncontrol' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" title={t('settings.configuration.unsavedChanges')} />
                )}
              </TabsTrigger>
              <TabsTrigger id="settings-tab-rules" value="rules" className="flex items-center gap-1.5 relative">
                <FileCode />
                {t('settings.tab.rules')}
                {configDirty && configDirtyTab === 'rules' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" title={t('settings.configuration.unsavedChanges')} />
                )}
              </TabsTrigger>
              {showIntegrationsTab && (
                <TabsTrigger id="settings-tab-integrations" value="integrations" className="flex items-center gap-1.5 relative">
                  <Cloud />
                  {t('settings.tab.integrations')}
                  {integrationsDirty && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" title={t('settings.configuration.unsavedChanges')} />}
                </TabsTrigger>
              )}
            </TabsList>

            {/* Appearance Tab */}
            <TabsContent value="appearance">{activeTab === 'appearance' && <AppearanceTabContent />}</TabsContent>

            {/* Configuration Tab */}
            <TabsContent value="configuration">
              {activeTab === 'configuration' && (
                <ConfigurationTabContent
                  configDirty={configDirty}
                  configDirtyTab={configDirtyTab}
                  onSetConfig={handleSetConfig}
                  onSetConfigDeferred={handleSetConfigDeferred}
                  onSave={() => handleSaveConfigurationConfig(false)}
                  onTestWebhook={handleTestWebhookConnection}
                  testWebhookLoading={testWebhookLoading}
                  webhookDialogOpen={webhookDialogOpen}
                  setWebhookDialogOpen={setWebhookDialogOpen}
                  editWebhookDialogOpen={editWebhookDialogOpen}
                  setEditWebhookDialogOpen={setEditWebhookDialogOpen}
                  webhookName={webhookName}
                  setWebhookName={setWebhookName}
                  webhookUrl={webhookUrl}
                  setWebhookUrl={setWebhookUrl}
                  onAddWebhook={handleAddWebhook}
                  onUpdateWebhook={handleUpdateWebhook}
                  onDeleteWebhook={handleDeleteWebhook}
                  externalEditorDialogOpen={externalEditorDialogOpen}
                  setExternalEditorDialogOpen={setExternalEditorDialogOpen}
                  editExternalEditorDialogOpen={editExternalEditorDialogOpen}
                  setEditExternalEditorDialogOpen={setEditExternalEditorDialogOpen}
                  externalEditorNameForDialog={externalEditorNameForDialog}
                  setExternalEditorNameForDialog={setExternalEditorNameForDialog}
                  externalEditorPathForDialog={externalEditorPathForDialog}
                  setExternalEditorPathForDialog={setExternalEditorPathForDialog}
                  onAddExternalEditor={handleAddExternalEditor}
                  onUpdateExternalEditor={handleUpdateExternalEditor}
                  onDeleteExternalEditor={handleDeleteExternalEditor}
                />
              )}
            </TabsContent>

            {/* API Keys Tab */}
            <TabsContent value="apikeys">
              {activeTab === 'apikeys' && (
                <ApiKeysTabContent
                  configDirty={configDirty}
                  configDirtyTab={configDirtyTab}
                  onSetConfig={handleSetConfig}
                  onSetConfigDeferred={handleSetConfigDeferred}
                  onSave={() => handleSaveConfigurationConfig(false)}
                />
              )}
            </TabsContent>

            {/* Version Control Tab */}
            <TabsContent value="versioncontrol">
              {activeTab === 'versioncontrol' && (
                <VersionControlTabContent
                  configDirty={configDirty}
                  configDirtyTab={configDirtyTab}
                  onSetConfigDeferred={handleSetConfigDeferred}
                  onSave={handleSaveConfigurationConfig}
                  sourceFolder={versionControlDraft.sourceFolder}
                  versionControlSystem={versionControlDraft.versionControlSystem}
                  autoRefreshEnabled={versionControlDraft.autoRefreshEnabled}
                  multiRepoEnabled={versionControlDraft.multiRepoEnabled}
                  draftProjectId={draftSelectedProjectId}
                  setDraftProjectId={setDraftSelectedProjectId}
                  sourceFolderDialogOpen={sourceFolderDialogOpen}
                  setSourceFolderDialogOpen={setSourceFolderDialogOpen}
                  editSourceFolderDialogOpen={editSourceFolderDialogOpen}
                  setEditSourceFolderDialogOpen={setEditSourceFolderDialogOpen}
                  sourceFolderName={sourceFolderName}
                  setSourceFolderName={setSourceFolderName}
                  sourceFolderPath={sourceFolderPath}
                  setSourceFolderPath={setSourceFolderPath}
                  onAddSourceFolder={handleAddSourceFolder}
                  onUpdateSourceFolder={handleUpdateSourceFolder}
                  onDeleteSourceFolder={handleDeleteSourceFolder}
                  isSourceFolderActionLoading={isSourceFolderActionLoading}
                />
              )}
            </TabsContent>

            {/* Commit Convention & Coding Rules Tab */}
            <TabsContent value="rules">
              {activeTab === 'rules' && (
                <RulesTabContent
                  configDirty={configDirty}
                  configDirtyTab={configDirtyTab}
                  onSetConfigDeferred={handleSetConfigDeferred}
                  onSave={() => handleSaveConfigurationConfig(false)}
                />
              )}
            </TabsContent>

            {/* Integrations: admin luôn; hoặc khi chưa đăng nhập/guest/schema chưa áp dụng để cấu hình DB + Init schema */}
            {showIntegrationsTab && (
              <TabsContent value="integrations">
                {activeTab === 'integrations' && (
                  <IntegrationsTabContent
                    integrationsDirty={integrationsDirty}
                    onSetConfig={handleSetConfig}
                    onSetMailServer={handleSetMailServer}
                    onSave={handleSaveIntegrationsConfig}
                    onTestMail={handleTestMailConnection}
                    testMailLoading={testMailLoading}
                    saveUsesLocalDiskOnly={!integrationsSaveUsesServer}
                    onAfterInitSchema={refreshIntegrationsTabGate}
                  />
                )}
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
