'use client'

import { KeyRound, Save } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import type { ApiProvider, CommitMessageDetailLevel, ConfigFieldKey, OpenAIReasoningEffort } from '../../../stores/useConfigurationStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'
import { ConfigInput } from './ConfigInput'

export interface ApiKeysTabContentProps {
  configDirty: boolean
  configDirtyTab: 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null
  onSetConfig: (key: ConfigFieldKey, value: string) => void
  onSetConfigDeferred: (key: ConfigFieldKey, value: string | boolean | ApiProvider | CommitMessageDetailLevel | OpenAIReasoningEffort) => void
  onSave: () => void
}

export const ApiKeysTabContent = memo(function ApiKeysTabContent({ configDirty, configDirtyTab, onSetConfig, onSetConfigDeferred, onSave }: ApiKeysTabContentProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const activeApiProvider = useConfigurationStore(s => s.activeApiProvider)
  const commitMessageDetailLevel = useConfigurationStore(s => s.commitMessageDetailLevel)
  const openaiApiKey = useConfigurationStore(s => s.openaiApiKey)
  const openaiModel = useConfigurationStore(s => s.openaiModel)
  const openaiReasoningEffort = useConfigurationStore(s => s.openaiReasoningEffort)
  const claudeApiKey = useConfigurationStore(s => s.claudeApiKey)
  const googleApiKey = useConfigurationStore(s => s.googleApiKey)

  const isApiKeysTabDirty = configDirty && configDirtyTab === 'apikeys'

  return (
    <>
      <Card className="gap-2 py-4 rounded-md">
        <CardContent className="space-y-4">
          <div id="settings-active-api-provider" className="space-y-3">
            <Label className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> {t('settings.apikeys.activeProvider') || 'API đang sử dụng'}
            </Label>
            <Combobox
              value={activeApiProvider}
              onValueChange={value => onSetConfigDeferred('activeApiProvider', value as ApiProvider)}
              options={[
                { value: 'openai', label: t('settings.apikeys.openai') || 'OpenAI (GPT)' },
                { value: 'claude', label: t('settings.apikeys.claude') || 'Claude (Anthropic)' },
                { value: 'google', label: t('settings.apikeys.google') || 'Google AI (Gemini)' },
              ]}
              size="sm"
              className="w-full"
            />
          </div>

          {activeApiProvider === 'openai' && (
            <div id="settings-openai-key" className="space-y-3">
              <Label className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> {t('settings.configuration.openaiApiKey')}
              </Label>
              <ConfigInput type="password" placeholder={t('settings.configuration.openaiApiKeyPlaceholder')} value={openaiApiKey} onSync={v => onSetConfig('openaiApiKey', v)} />
              <div className="space-y-2">
                <Label>{t('settings.apikeys.openaiModel') || 'Model OpenAI'}</Label>
                <ConfigInput
                  placeholder={t('settings.apikeys.openaiModelPlaceholder') || 'Ví dụ: gpt-5.4, gpt-5'}
                  value={openaiModel}
                  onSync={v => onSetConfig('openaiModel', v)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.apikeys.openaiReasoningEffort') || 'Mức độ reasoning'}</Label>
                <Combobox
                  value={openaiReasoningEffort}
                  onValueChange={v => onSetConfigDeferred('openaiReasoningEffort', v as OpenAIReasoningEffort)}
                  options={[
                    { value: 'low', label: t('settings.apikeys.reasoningLow') || 'Thấp (nhanh, ít token)' },
                    { value: 'medium', label: t('settings.apikeys.reasoningMedium') || 'Trung bình' },
                    { value: 'high', label: t('settings.apikeys.reasoningHigh') || 'Cao (chính xác hơn, nhiều token)' },
                    { value: 'xhigh', label: t('settings.apikeys.reasoningXhigh') || 'Rất cao (tối đa, chậm hơn, nhiều token)' },
                  ]}
                  size="sm"
                  className="w-full"
                />
              </div>
            </div>
          )}

          {activeApiProvider === 'claude' && (
            <div id="settings-claude-key" className="space-y-3">
              <Label className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> {t('settings.apikeys.claudeApiKey') || 'Claude API Key'}
              </Label>
              <ConfigInput
                type="password"
                placeholder={t('settings.apikeys.claudeApiKeyPlaceholder') || 'Nhập khóa API Claude'}
                value={claudeApiKey}
                onSync={v => onSetConfig('claudeApiKey', v)}
              />
            </div>
          )}

          {activeApiProvider === 'google' && (
            <div id="settings-google-key" className="space-y-3">
              <Label className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> {t('settings.apikeys.googleApiKey') || 'Google AI API Key'}
              </Label>
              <ConfigInput
                type="password"
                placeholder={t('settings.apikeys.googleApiKeyPlaceholder') || 'Nhập khóa API Google AI'}
                value={googleApiKey}
                onSync={v => onSetConfig('googleApiKey', v)}
              />
            </div>
          )}

          <div id="settings-commit-message-detail-level" className="space-y-3">
            <Label className="flex items-center gap-2">
              {t('settings.apikeys.commitMessageDetailLevel') || 'Độ chi tiết commit message'}
            </Label>
            <Combobox
              value={commitMessageDetailLevel}
              onValueChange={value => onSetConfigDeferred('commitMessageDetailLevel', value as CommitMessageDetailLevel)}
              options={[
                { value: 'detail', label: t('settings.apikeys.commitMessageDetailLevelDetail') || 'Chi tiết (2400 ký tự)' },
                { value: 'normal', label: t('settings.apikeys.commitMessageDetailLevelNormal') || 'Bình thường (1200 ký tự)' },
                { value: 'simple', label: t('settings.apikeys.commitMessageDetailLevelSimple') || 'Đơn giản (600 ký tự)' },
              ]}
              size="sm"
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-center pt-4">
        <Button
          variant={isApiKeysTabDirty ? 'default' : buttonVariant}
          onClick={() => onSave()}
          className={isApiKeysTabDirty ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md' : ''}
        >
          <Save className="h-4 w-4" />
          {t('common.save')}
          {isApiKeysTabDirty && ` (${t('settings.configuration.unsavedChanges')})`}
        </Button>
      </div>
    </>
  )
})
