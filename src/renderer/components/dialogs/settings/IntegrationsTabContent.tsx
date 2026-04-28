'use client'

import { Cloud, Database, Layers, Link2, Loader2, Lock, Mail, Network, RefreshCw, Save, User } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import type { Configuration } from 'main/types/types'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import type { ConfigFieldKey } from '../../../stores/useConfigurationStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'
import { useMailServerStore } from '../../../stores/useMailServerStore'
import { ConfigInput } from './ConfigInput'

export interface IntegrationsTabContentProps {
  integrationsDirty: boolean
  onSetConfig: (key: ConfigFieldKey, value: string) => void
  onSetMailServer: (key: 'smtpServer' | 'port' | 'email' | 'password', value: string) => void
  onSave: () => void
  onTestMail: () => void
  testMailLoading: boolean
}

export const IntegrationsTabContent = memo(function IntegrationsTabContent({
  integrationsDirty,
  onSetConfig,
  onSetMailServer,
  onSave,
  onTestMail,
  testMailLoading,
}: IntegrationsTabContentProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const smtpServer = useMailServerStore(s => s.smtpServer)
  const port = useMailServerStore(s => s.port)
  const email = useMailServerStore(s => s.email)
  const password = useMailServerStore(s => s.password)
  const oneDriveClientId = useConfigurationStore(s => s.oneDriveClientId)
  const oneDriveClientSecret = useConfigurationStore(s => s.oneDriveClientSecret)
  const oneDriveRefreshToken = useConfigurationStore(s => s.oneDriveRefreshToken)
  const dbHost = useConfigurationStore(s => s.dbHost)
  const dbPort = useConfigurationStore(s => s.dbPort)
  const dbUser = useConfigurationStore(s => s.dbUser)
  const dbPassword = useConfigurationStore(s => s.dbPassword)
  const dbName = useConfigurationStore(s => s.dbName)
  const [testDbLoading, setTestDbLoading] = useState(false)
  const [initSchemaLoading, setInitSchemaLoading] = useState(false)

  /** Đẩy Task DB từ Zustand sang main (electron-store) + reset pool, không broadcast — main mới đọc đúng khi test/init. */
  const pushTaskDbToMainSilent = async (): Promise<boolean> => {
    try {
      const s = useConfigurationStore.getState()
      const taskDbPatch: Partial<Configuration> = {
        dbHost: s.dbHost ?? '',
        dbPort: s.dbPort ?? '',
        dbUser: s.dbUser ?? '',
        dbPassword: s.dbPassword ?? '',
        dbName: s.dbName ?? '',
      }
      await window.api.configuration.patchSilent(taskDbPatch)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const handleTestDb = async () => {
    setTestDbLoading(true)
    try {
      if (!(await pushTaskDbToMainSilent())) return
      const res = await window.api.task.checkTaskApi()
      if (res.ok) {
        toast.success(t('settings.db.testSuccess', 'Connection successful'))
      } else {
        toast.error(res.code === 'TASK_DB_NOT_CONFIGURED' ? t('settings.db.notConfigured', 'Database not configured') : res.error || res.code || 'Connection failed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setTestDbLoading(false)
    }
  }

  const handleInitSchema = async () => {
    setInitSchemaLoading(true)
    try {
      if (!(await pushTaskDbToMainSilent())) return
      const { recreated } = await window.api.task.initSchema()
      toast.success(
        recreated
          ? t('settings.db.schemaRecreated', 'All tables recreated from schema')
          : t('settings.db.schemaInitSuccess', 'Schema initialized')
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err) || 'Schema init failed')
    } finally {
      setInitSchemaLoading(false)
    }
  }

  const sectionTriggerClass = 'hover:no-underline py-3 px-1 sm:px-2 items-center [&>svg:last-child]:self-center'

  return (
    <div className="space-y-4">
      <Card className="gap-0 overflow-hidden rounded-md py-0">
        <CardContent className="p-0">
          <Accordion type="single" collapsible defaultValue="database" className="w-full px-3 sm:px-4">
            <AccordionItem value="database">
              <AccordionTrigger className={sectionTriggerClass}>
                <span className="flex items-center gap-2 text-base font-semibold">
                  <Database className="size-5 shrink-0" />
                  {t('settings.db.database')}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-4 pt-0 sm:px-2">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  {integrationsDirty && <span className="text-sm text-amber-600">{t('settings.db.saveBeforeTest', 'Lưu cấu hình trước khi test hoặc khởi tạo schema')}</span>}
                  <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
                    <Button variant={buttonVariant} size="sm" onClick={handleTestDb} disabled={!dbHost?.trim() || !dbName?.trim() || testDbLoading}>
                      {testDbLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Link2 className="h-4 w-4" />
                          {t('settings.mailserver.testConnection')}
                        </>
                      )}
                    </Button>
                    <Button variant={buttonVariant} size="sm" onClick={handleInitSchema} disabled={!dbHost?.trim() || !dbName?.trim() || initSchemaLoading}>
                      {initSchemaLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Layers className="h-4 w-4" />
                          {t('settings.db.initSchema', 'Init schema')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div id="settings-task-db-host" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Network className="h-4 w-4" /> {t('settings.db.host', 'Host')}
                    </Label>
                    <ConfigInput type="text" value={dbHost} onSync={v => onSetConfig('dbHost', v)} placeholder="localhost" />
                  </div>
                  <div id="settings-task-db-port" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Network className="h-4 w-4" /> {t('settings.db.port', 'Port')}
                    </Label>
                    <ConfigInput type="text" value={dbPort} onSync={v => onSetConfig('dbPort', v)} placeholder="3306" />
                  </div>
                  <div id="settings-task-db-user" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" /> {t('settings.db.user', 'User')}
                    </Label>
                    <ConfigInput type="text" value={dbUser} onSync={v => onSetConfig('dbUser', v)} placeholder="root" />
                  </div>
                  <div id="settings-task-db-password" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-4 w-4" /> {t('settings.db.password', 'Password')}
                    </Label>
                    <ConfigInput type="password" value={dbPassword} onSync={v => onSetConfig('dbPassword', v)} placeholder="" />
                  </div>
                  <div id="settings-task-db-name" className="col-span-2 space-y-2">
                    <Label className="flex items-center gap-2">
                      <Database className="h-4 w-4" /> {t('settings.db.database', 'Database')}
                    </Label>
                    <ConfigInput type="text" value={dbName} onSync={v => onSetConfig('dbName', v)} placeholder="honey_badger" />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mail">
              <AccordionTrigger className={sectionTriggerClass}>
                <span className="flex items-center gap-2 text-base font-semibold">
                  <Mail className="size-5 shrink-0" />
                  {t('settings.tab.mailserver')}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-4 pt-0 sm:px-2">
                <div className="mb-3 flex justify-end">
                  <Button variant={buttonVariant} size="sm" onClick={onTestMail} disabled={!smtpServer?.trim() || !port?.trim() || !email?.trim() || !password?.trim() || testMailLoading}>
                    {testMailLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        {t('settings.mailserver.testConnection')}
                      </>
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div id="settings-smtp-server" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Database className="h-4 w-4" /> {t('settings.mailserver.smtpServer')}
                    </Label>
                    <ConfigInput type="text" value={smtpServer} onSync={v => onSetMailServer('smtpServer', v)} placeholder={t('settings.mailserver.smtpServerPlaceholder')} />
                  </div>
                  <div id="settings-mail-email" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4" /> {t('settings.mailserver.email')}
                    </Label>
                    <ConfigInput type="email" value={email} onSync={v => onSetMailServer('email', v)} placeholder={t('settings.mailserver.emailPlaceholder')} />
                  </div>
                  <div id="settings-port" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Network className="h-4 w-4" /> {t('settings.mailserver.port')}
                    </Label>
                    <ConfigInput type="text" value={port} onSync={v => onSetMailServer('port', v)} placeholder={t('settings.mailserver.portPlaceholder')} />
                  </div>
                  <div id="settings-mail-password" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-4 w-4" /> {t('settings.mailserver.password')}
                    </Label>
                    <ConfigInput type="password" value={password} onSync={v => onSetMailServer('password', v)} placeholder={t('settings.mailserver.passwordPlaceholder')} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="onedrive">
              <AccordionTrigger className={sectionTriggerClass}>
                <span className="flex items-center gap-2 text-base font-semibold">
                  <Cloud className="size-5 shrink-0" />
                  {t('settings.tab.onedrive')}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-4 pt-0 sm:px-2">
                <div className="grid grid-cols-2 gap-4">
                  <div id="settings-onedrive-client-id" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" /> {t('settings.onedrive.clientId')}
                    </Label>
                    <ConfigInput type="text" value={oneDriveClientId} onSync={v => onSetConfig('oneDriveClientId', v)} placeholder={t('settings.onedrive.clientIdPlaceholder')} />
                  </div>
                  <div id="settings-onedrive-refresh-token" className="row-span-2 space-y-2">
                    <Label className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" /> {t('settings.onedrive.refreshToken')}
                    </Label>
                    <ConfigInput
                      type="password"
                      value={oneDriveRefreshToken}
                      onSync={v => onSetConfig('oneDriveRefreshToken', v)}
                      placeholder={t('settings.onedrive.refreshTokenPlaceholder')}
                    />
                  </div>
                  <div id="settings-onedrive-client-secret" className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-4 w-4" /> {t('settings.onedrive.clientSecret')}
                    </Label>
                    <ConfigInput
                      type="password"
                      value={oneDriveClientSecret}
                      onSync={v => onSetConfig('oneDriveClientSecret', v)}
                      placeholder={t('settings.onedrive.clientSecretPlaceholder')}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-2 pt-1">
        <p className="max-w-lg text-center text-sm text-muted-foreground">
          {t('settings.integrations.saveLocalNote', 'Thông tin tích hợp chỉ được lưu trong cấu hình trên máy này.')}
        </p>
        <Button
          variant={integrationsDirty ? 'default' : buttonVariant}
          onClick={() => onSave()}
          className={integrationsDirty ? 'bg-amber-600 font-semibold text-white shadow-md hover:bg-amber-700' : ''}
        >
          <Save className="h-4 w-4" />
          {t('common.save')}
          {integrationsDirty && ` (${t('settings.configuration.unsavedChanges')})`}
        </Button>
      </div>
    </div>
  )
})
