'use client'

import { Bell, FileCode, Folder, FolderOpen, LayoutGrid, Link2, Loader2, Monitor, Pencil, Plus, Save, Square, Trash2, Volume2, Webhook } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NOTIFICATION_SOUND_EVENT, playNotificationSoundTest, stopNotificationSound } from '@/hooks/useNotificationSound'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import type { ApiProvider, ConfigFieldKey } from '../../../stores/useConfigurationStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'
import { useExternalEditorStore } from '../../../stores/useExternalEditorStore'
import { useWebhookStore } from '../../../stores/useWebhookStore'
import { AddOrEditExternalEditorDialog } from './AddOrEditExternalEditorDialog'
import { AddOrEditWebhookDialog } from './AddOrEditWebhookDialog'
import { ConfigInput } from './ConfigInput'

export interface ConfigurationTabContentProps {
  configDirty: boolean
  configDirtyTab: 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null
  onSetConfig: (key: ConfigFieldKey, value: string | boolean | ApiProvider) => void
  onSetConfigDeferred: (key: ConfigFieldKey, value: string | boolean | ApiProvider) => void
  onSave: () => void
  onTestWebhook: () => void
  testWebhookLoading: boolean
  webhookDialogOpen: boolean
  setWebhookDialogOpen: (v: boolean) => void
  editWebhookDialogOpen: boolean
  setEditWebhookDialogOpen: (v: boolean) => void
  webhookName: string
  setWebhookName: (v: string) => void
  webhookUrl: string
  setWebhookUrl: (v: string) => void
  onAddWebhook: () => void
  onUpdateWebhook: () => void
  onDeleteWebhook: (name: string) => void
  externalEditorDialogOpen: boolean
  setExternalEditorDialogOpen: (v: boolean) => void
  editExternalEditorDialogOpen: boolean
  setEditExternalEditorDialogOpen: (v: boolean) => void
  externalEditorNameForDialog: string
  setExternalEditorNameForDialog: (v: string) => void
  externalEditorPathForDialog: string
  setExternalEditorPathForDialog: (v: string) => void
  onAddExternalEditor: () => void
  onUpdateExternalEditor: () => void
  onDeleteExternalEditor: (name: string) => void
}

export const ConfigurationTabContent = memo(function ConfigurationTabContent({
  configDirty,
  configDirtyTab,
  onSetConfig,
  onSetConfigDeferred,
  onSave,
  onTestWebhook,
  testWebhookLoading,
  webhookDialogOpen,
  setWebhookDialogOpen,
  editWebhookDialogOpen,
  setEditWebhookDialogOpen,
  webhookName,
  setWebhookName,
  webhookUrl,
  setWebhookUrl,
  onAddWebhook,
  onUpdateWebhook,
  onDeleteWebhook,
  externalEditorDialogOpen,
  setExternalEditorDialogOpen,
  editExternalEditorDialogOpen,
  setEditExternalEditorDialogOpen,
  externalEditorNameForDialog,
  setExternalEditorNameForDialog,
  externalEditorPathForDialog,
  setExternalEditorPathForDialog,
  onAddExternalEditor,
  onUpdateExternalEditor,
  onDeleteExternalEditor,
}: ConfigurationTabContentProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const svnFolder = useConfigurationStore(s => s.svnFolder)
  const webhookMS = useConfigurationStore(s => s.webhookMS)
  const enableTeamsNotification = useConfigurationStore(s => s.enableTeamsNotification)
  const showNotifications = useConfigurationStore(s => s.showNotifications)
  const playNotificationSound = useConfigurationStore(s => s.playNotificationSound ?? true)
  const notificationSoundPath = useConfigurationStore(s => s.notificationSoundPath ?? '')
  const startOnLogin = useConfigurationStore(s => s.startOnLogin)
  const externalEditorPath = useConfigurationStore(s => s.externalEditorPath)
  const webhookList = useWebhookStore(s => s.webhookList)
  const externalEditorList = useExternalEditorStore(s => s.externalEditorList)

  const isConfigTabDirty = configDirty && configDirtyTab === 'configuration'
  const [isSelectingFolder, setIsSelectingFolder] = useState(false)
  const [isSelectingSound, setIsSelectingSound] = useState(false)
  const [isTestingSound, setIsTestingSound] = useState(false)
  const [isSoundPlaying, setIsSoundPlaying] = useState(false)

  useEffect(() => {
    const handler = (e: CustomEvent<boolean>) => setIsSoundPlaying(e.detail)
    window.addEventListener(NOTIFICATION_SOUND_EVENT, handler as EventListener)
    return () => window.removeEventListener(NOTIFICATION_SOUND_EVENT, handler as EventListener)
  }, [])

  return (
    <>
      <div className="space-y-4">
        <Card id="settings-svn-config-card" className="gap-2 py-4 rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="w-5 h-5" />
              {t('settings.configuration.svnConfig') || 'Cấu hình SVN'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div id="settings-svn-folder" className="space-y-3">
              <Label className="flex items-center gap-2">
                <Folder className="w-4 h-4" /> {t('settings.configuration.svnFolder')}
              </Label>
              <div className="flex items-center space-x-2">
                <ConfigInput type="text" placeholder={t('settings.configuration.svnFolderPlaceholder')} value={svnFolder} onSync={v => onSetConfig('svnFolder', v)} />
                <Button
                  variant={buttonVariant}
                  disabled={isSelectingFolder}
                  onClick={async () => {
                    setIsSelectingFolder(true)
                    try {
                      const folder = await window.api.system.select_folder()
                      if (folder) onSetConfig('svnFolder', folder)
                    } finally {
                      setIsSelectingFolder(false)
                    }
                  }}
                >
                  {isSelectingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                  {t('settings.configuration.chooseFolder')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="settings-notification-config-card" className="gap-2 py-4 rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {t('settings.configuration.notificationConfig') || 'Cấu hình thông báo'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div id="settings-webhook-ms" className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="mr-2 flex items-center gap-2">
                  <Webhook className="w-4 h-4" /> {t('settings.configuration.webhookMS')}
                </Label>
                <div className="flex items-center space-x-2">
                  <Label htmlFor="enable-teams-notification" className="cursor-pointer">
                    {t('settings.configuration.receiveTeamsNotification')}
                  </Label>
                  <Switch id="enable-teams-notification" checked={enableTeamsNotification} onCheckedChange={checked => onSetConfigDeferred('enableTeamsNotification', checked)} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Combobox
                  value={webhookMS}
                  onValueChange={value => onSetConfigDeferred('webhookMS', value)}
                  options={webhookList.map(webhook => ({ value: webhook.url, label: webhook.name }))}
                  placeholder={t('settings.configuration.selectWebhook')}
                  size="sm"
                  className="w-full"
                />
                <Button variant={buttonVariant} size="sm" onClick={onTestWebhook} disabled={!webhookMS?.trim() || testWebhookLoading} className="shrink-0">
                  {testWebhookLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      {t('common.test')}
                    </>
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant={buttonVariant}
                    size="icon-sm"
                    onClick={() => {
                      setWebhookName('')
                      setWebhookUrl('')
                      setWebhookDialogOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  {webhookMS && (
                    <>
                      <Button
                        variant={buttonVariant}
                        size="icon-sm"
                        onClick={() => {
                          const webhook = webhookList.find(w => w.url === webhookMS)
                          if (webhook) {
                            setWebhookName(webhook.name)
                            setWebhookUrl(webhook.url)
                            setEditWebhookDialogOpen(true)
                          }
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant={buttonVariant} size="icon-sm" onClick={() => onDeleteWebhook(webhookList.find(w => w.url === webhookMS)?.name || '')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <AddOrEditWebhookDialog
              open={webhookDialogOpen}
              onOpenChange={setWebhookDialogOpen}
              isEditMode={false}
              webhookName={webhookName}
              webhookUrl={webhookUrl}
              setWebhookName={setWebhookName}
              setWebhookUrl={setWebhookUrl}
              onAdd={onAddWebhook}
              onUpdate={() => { }}
            />
            {editWebhookDialogOpen && (
              <AddOrEditWebhookDialog
                open={editWebhookDialogOpen}
                onOpenChange={setEditWebhookDialogOpen}
                isEditMode={true}
                webhookName={webhookName}
                webhookUrl={webhookUrl}
                setWebhookName={setWebhookName}
                setWebhookUrl={setWebhookUrl}
                onUpdate={onUpdateWebhook}
                onAdd={() => { }}
              />
            )}

            <div id="settings-show-notifications" className="flex items-center justify-between space-x-2 py-1">
              <Label htmlFor="show-notifications" className="flex items-center gap-2 cursor-pointer">
                <Bell className="w-4 h-4" /> {t('settings.configuration.showNotifications')}
              </Label>
              <Switch id="show-notifications" checked={showNotifications} onCheckedChange={checked => onSetConfigDeferred('showNotifications', checked)} />
            </div>
            {playNotificationSound && (
              <div id="settings-notification-sound-custom" className="space-y-2 py-2">
                <Label className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" /> {t('settings.configuration.notificationSoundFile')}
                </Label>
                <div className="flex items-center gap-2">
                  <ConfigInput
                    type="text"
                    placeholder={t('settings.configuration.notificationSoundPlaceholder')}
                    value={notificationSoundPath}
                    onSync={v => onSetConfigDeferred('notificationSoundPath', v)}
                    className="flex-1"
                  />
                  <Button
                    variant={buttonVariant}
                    size="icon-sm"
                    disabled={isSelectingSound}
                    title={t('common.browse')}
                    onClick={async () => {
                      setIsSelectingSound(true)
                      try {
                        const path = await window.api.system.select_audio_file()
                        if (path) onSetConfigDeferred('notificationSoundPath', path)
                      } finally {
                        setIsSelectingSound(false)
                      }
                    }}
                  >
                    {isSelectingSound ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant={buttonVariant}
                    size="icon-sm"
                    disabled={isTestingSound}
                    onClick={
                      isSoundPlaying
                        ? () => stopNotificationSound()
                        : async () => {
                          setIsTestingSound(true)
                          try {
                            await playNotificationSoundTest(notificationSoundPath)
                          } catch {
                            // ignore
                          } finally {
                            setIsTestingSound(false)
                          }
                        }
                    }
                    title={isSoundPlaying ? t('settings.configuration.stopSound') : t('settings.configuration.testSound')}
                  >
                    {isTestingSound ? <Loader2 className="h-4 w-4 animate-spin" /> : isSoundPlaying ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
            <div id="settings-play-notification-sound" className="flex items-center justify-between space-x-2 py-1">
              <Label htmlFor="play-notification-sound" className="flex items-center gap-2 cursor-pointer">
                <Volume2 className="w-4 h-4" /> {t('settings.configuration.playNotificationSound')}
              </Label>
              <Switch id="play-notification-sound" checked={playNotificationSound} onCheckedChange={checked => onSetConfigDeferred('playNotificationSound', checked)} />
            </div>
          </CardContent>
        </Card>

        <Card id="settings-window-config-card" className="gap-2 py-4 rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              {t('settings.configuration.windowConfig') || 'Cửa sổ & Ứng dụng'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div id="settings-start-on-login" className="flex items-center justify-between space-x-2 py-1">
              <Label htmlFor="start-on-login" className="flex items-center gap-2 cursor-pointer">
                <LayoutGrid className="w-4 h-4" /> {t('settings.configuration.startOnLogin')}
              </Label>
              <Switch id="start-on-login" checked={startOnLogin} onCheckedChange={checked => onSetConfigDeferred('startOnLogin', checked)} />
            </div>
            <div id="settings-external-editor" className="space-y-3">
              <Label className="flex items-center gap-2">
                <FileCode className="w-4 h-4" /> {t('settings.configuration.externalEditor')}
              </Label>
              <div className="flex items-center justify-between gap-2">
                <Combobox
                  value={externalEditorPath || ''}
                  onValueChange={value => onSetConfigDeferred('externalEditorPath', value)}
                  options={externalEditorList.map(editor => ({ value: editor.path, label: editor.name }))}
                  placeholder={t('settings.configuration.selectExternalEditor') || 'Chọn editor'}
                  size="sm"
                  className="w-full"
                />
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant={buttonVariant}
                    size="icon-sm"
                    onClick={() => {
                      setExternalEditorNameForDialog('')
                      setExternalEditorPathForDialog('')
                      setExternalEditorDialogOpen(true)
                    }}
                    title={t('common.add')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  {externalEditorPath && externalEditorList.some(e => e.path === externalEditorPath) && (
                    <>
                      <Button
                        variant={buttonVariant}
                        size="icon-sm"
                        onClick={() => {
                          const editor = externalEditorList.find(e => e.path === externalEditorPath)
                          if (editor) {
                            setExternalEditorNameForDialog(editor.name)
                            setExternalEditorPathForDialog(editor.path)
                            setEditExternalEditorDialogOpen(true)
                          }
                        }}
                        title={t('common.update')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={buttonVariant}
                        size="icon-sm"
                        onClick={() => onDeleteExternalEditor(externalEditorList.find(e => e.path === externalEditorPath)?.name || '')}
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <AddOrEditExternalEditorDialog
                open={externalEditorDialogOpen}
                onOpenChange={setExternalEditorDialogOpen}
                isEditMode={false}
                editorName={externalEditorNameForDialog}
                editorPath={externalEditorPathForDialog}
                setEditorName={setExternalEditorNameForDialog}
                setEditorPath={setExternalEditorPathForDialog}
                onAdd={onAddExternalEditor}
                onUpdate={() => { }}
              />
              {editExternalEditorDialogOpen && (
                <AddOrEditExternalEditorDialog
                  open={editExternalEditorDialogOpen}
                  onOpenChange={setEditExternalEditorDialogOpen}
                  isEditMode={true}
                  editorName={externalEditorNameForDialog}
                  editorPath={externalEditorPathForDialog}
                  setEditorName={setExternalEditorNameForDialog}
                  setEditorPath={setExternalEditorPathForDialog}
                  onUpdate={onUpdateExternalEditor}
                  onAdd={() => { }}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center pt-4">
        <Button
          variant={isConfigTabDirty ? 'default' : buttonVariant}
          onClick={() => onSave()}
          className={isConfigTabDirty ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md' : ''}
        >
          <Save className="h-4 w-4" />
          {t('common.save')}
          {isConfigTabDirty && ` (${t('settings.configuration.unsavedChanges')})`}
        </Button>
      </div>
    </>
  )
})
