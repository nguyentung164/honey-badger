'use client'

import { FileCode, Save, Shield } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import { useCodingRuleStore } from '../../../stores/useCodingRuleStore'
import type { ConfigFieldKey } from '../../../stores/useConfigurationStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'

export interface RulesTabContentProps {
  configDirty: boolean
  configDirtyTab: 'configuration' | 'apikeys' | 'versioncontrol' | 'rules' | null
  onSetConfigDeferred: (key: ConfigFieldKey, value: string | boolean) => void
  onSave: () => void
}

export const RulesTabContent = memo(function RulesTabContent({ configDirty, configDirtyTab, onSetConfigDeferred, onSave }: RulesTabContentProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const codingRuleId = useConfigurationStore(s => s.codingRuleId)
  const codingRule = useConfigurationStore(s => s.codingRule)
  const commitConventionEnabled = useConfigurationStore(s => s.commitConventionEnabled)
  const commitConventionMode = useConfigurationStore(s => s.commitConventionMode)
  const versionControlSystem = useConfigurationStore(s => s.versionControlSystem)
  const gitleaksEnabled = useConfigurationStore(s => s.gitleaksEnabled)
  const gitleaksMode = useConfigurationStore(s => s.gitleaksMode)
  const gitleaksConfigPath = useConfigurationStore(s => s.gitleaksConfigPath)
  const codingRuleList = useCodingRuleStore(s => s.codingRuleList)

  const isRulesTabDirty = configDirty && configDirtyTab === 'rules'

  return (
    <>
      <Card className="gap-2 py-4 rounded-md">
        <CardContent className="space-y-6">
          <div id="settings-coding-rule" className="space-y-3">
            <Label className="mr-2 flex items-center gap-2">
              <FileCode className="w-4 h-4" /> {t('settings.configuration.codingRule', 'Coding Rule')}
            </Label>
            <div className="flex items-center justify-between gap-2">
              <Combobox
                value={codingRuleId || codingRule}
                onValueChange={value => {
                  const rule = codingRuleList.find(r => r.id === value || r.name === value)
                  onSetConfigDeferred('codingRuleId', rule?.id ?? value)
                  onSetConfigDeferred('codingRule', rule?.name ?? '')
                }}
                options={codingRuleList.map(rule => ({ value: rule.id, label: rule.name }))}
                placeholder={t('settings.configuration.selectCodingRule')}
                size="sm"
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <Label className="flex items-center gap-2">
              <FileCode className="w-4 h-4" /> {t('settings.versioncontrol.commitConvention')}
            </Label>
            <p className="text-sm text-muted-foreground">{t('settings.versioncontrol.commitConventionDescription')}</p>
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="commit-convention-enabled" className="cursor-pointer flex-1">
                {t('settings.versioncontrol.commitConventionEnabled')}
              </Label>
              <Switch id="commit-convention-enabled" checked={commitConventionEnabled} onCheckedChange={checked => onSetConfigDeferred('commitConventionEnabled', checked)} />
            </div>
            {commitConventionEnabled && (
              <div className="space-y-2">
                <Label>{t('settings.versioncontrol.commitConventionMode')}</Label>
                <Combobox
                  value={commitConventionMode}
                  onValueChange={value => onSetConfigDeferred('commitConventionMode', value)}
                  options={[
                    { value: 'warn', label: t('settings.versioncontrol.commitConventionModeWarn') },
                    { value: 'block', label: t('settings.versioncontrol.commitConventionModeBlock') },
                  ]}
                  size="sm"
                  className="w-full"
                />
              </div>
            )}
          </div>

          {versionControlSystem === 'git' && (
            <div className="space-y-3 pt-4 border-t">
              <Label className="flex items-center gap-2">
                <Shield className="w-4 h-4" /> {t('settings.versioncontrol.gitleaksTitle')}
              </Label>
              <p className="text-sm text-muted-foreground">{t('settings.versioncontrol.gitleaksDescription')}</p>
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="gitleaks-enabled" className="cursor-pointer flex-1">
                  {t('settings.versioncontrol.gitleaksEnabled')}
                </Label>
                <Switch id="gitleaks-enabled" checked={gitleaksEnabled} onCheckedChange={checked => onSetConfigDeferred('gitleaksEnabled', checked)} />
              </div>
              {gitleaksEnabled && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t('settings.versioncontrol.gitleaksMode')}</Label>
                    <Combobox
                      value={gitleaksMode}
                      onValueChange={value => onSetConfigDeferred('gitleaksMode', value)}
                      options={[
                        { value: 'warn', label: t('settings.versioncontrol.commitConventionModeWarn') },
                        { value: 'block', label: t('settings.versioncontrol.commitConventionModeBlock') },
                      ]}
                      size="sm"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gitleaks-config-path">{t('settings.versioncontrol.gitleaksConfigPath')}</Label>
                    <Input
                      id="gitleaks-config-path"
                      value={gitleaksConfigPath}
                      onChange={e => onSetConfigDeferred('gitleaksConfigPath', e.target.value)}
                      placeholder={t('settings.versioncontrol.gitleaksConfigPathPlaceholder')}
                      className="h-9"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-center pt-4">
        <Button
          variant={isRulesTabDirty ? 'default' : buttonVariant}
          onClick={() => onSave()}
          className={isRulesTabDirty ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md' : ''}
        >
          <Save className="h-4 w-4" />
          {t('common.save')}
          {isRulesTabDirty && ` (${t('settings.configuration.unsavedChanges')})`}
        </Button>
      </div>
    </>
  )
})
