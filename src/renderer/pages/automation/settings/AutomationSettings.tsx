import { Download, FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutomationSettingsState, TestProject } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from '@/components/ui-elements/Toast'
import { useAutomationStore } from '@/stores/useAutomationStore'

interface Props {
  selectedProject?: TestProject | null
}

type ProviderOverride = 'auto' | 'openai' | 'claude' | 'google'

export function AutomationSettings({ selectedProject }: Props) {
  const { t } = useTranslation()
  const settings = useAutomationStore(s => s.settings)
  const setSettings = useAutomationStore(s => s.setSettings)
  const installedBrowsers = useAutomationStore(s => s.installedBrowsers)
  const setInstalledBrowsers = useAutomationStore(s => s.setInstalledBrowsers)
  const [draft, setDraft] = useState<AutomationSettingsState>({
    defaultWorkers: 1,
    defaultRetries: 0,
    runRetention: 30,
    aiProviderOverride: null,
  })
  const [installing, setInstalling] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [installLog, setInstallLog] = useState<string[]>([])
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    void (async () => {
      const res = await window.api.automation.settings.get()
      if (res.status === 'success' && res.data) {
        setSettings(res.data)
        setDraft(res.data)
      }
      const status = await window.api.automation.browsers.status()
      if (status.status === 'success' && status.data) setInstalledBrowsers(status.data.installed)
    })()
  }, [setSettings, setInstalledBrowsers])

  useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  useEffect(() => {
    const off = window.api.automation.browsers.onInstallStream(chunk => {
      setInstallLog(prev => {
        const next = prev.concat(chunk.split('\n').filter(Boolean)).slice(-500)
        return next
      })
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
    return () => off()
  }, [])

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await window.api.automation.settings.set(draft)
      if (res.status === 'success' && res.data) {
        setSettings(res.data)
        toast.success(t('automation.settings.saved'))
      } else {
        toast.error(res.message ?? 'Save failed')
      }
    } finally {
      setSavingSettings(false)
    }
  }

  const handleInstallBrowsers = async () => {
    setInstalling(true)
    setInstallLog([])
    try {
      const res = await window.api.automation.browsers.install({ browsers: selectedProject?.browsers })
      if (res.status === 'success' && res.data) {
        toast.success(t('automation.settings.browsersInstalled', { browsers: res.data.installed.join(', ') }))
        setInstalledBrowsers(res.data.installed)
      } else {
        toast.error(res.message ?? 'Install failed')
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleOpenWorkspace = async () => {
    if (!selectedProject) {
      toast.info(t('automation.settings.noProject'))
      return
    }
    await window.api.automation.run.openWorkspace(selectedProject.id)
  }

  const providerValue: ProviderOverride = (draft.aiProviderOverride ?? 'auto') as ProviderOverride

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('automation.settings.runDefaults')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="s-workers">{t('automation.runs.fields.workers')}</Label>
            <Input
              id="s-workers"
              type="number"
              min={1}
              max={16}
              value={draft.defaultWorkers}
              onChange={e => setDraft({ ...draft, defaultWorkers: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-retries">{t('automation.runs.fields.retries')}</Label>
            <Input
              id="s-retries"
              type="number"
              min={0}
              max={5}
              value={draft.defaultRetries}
              onChange={e => setDraft({ ...draft, defaultRetries: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-retention">{t('automation.settings.retention')}</Label>
            <Input
              id="s-retention"
              type="number"
              min={5}
              max={500}
              value={draft.runRetention}
              onChange={e => setDraft({ ...draft, runRetention: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('automation.settings.aiTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="s-provider">{t('automation.settings.aiProvider')}</Label>
            <Select
              value={providerValue}
              onValueChange={v => setDraft({ ...draft, aiProviderOverride: v === 'auto' ? null : (v as 'openai' | 'claude' | 'google') })}
            >
              <SelectTrigger id="s-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('automation.settings.providerAuto')}</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="claude">Anthropic Claude</SelectItem>
                <SelectItem value="google">Google Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('automation.settings.browsersTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('automation.settings.installed')}:</span>
            <span className="font-mono text-sm uppercase">{installedBrowsers.length ? installedBrowsers.join(', ') : '—'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleInstallBrowsers} disabled={installing}>
              {installing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {t('automation.settings.reinstallBrowsers')}
            </Button>
            <Button size="sm" variant="outline" onClick={handleOpenWorkspace} disabled={!selectedProject}>
              <FolderOpen className="size-4" />
              {t('automation.settings.openWorkspace')}
            </Button>
          </div>
          {installLog.length > 0 ? (
            <pre
              ref={logRef}
              className="max-h-48 overflow-auto rounded-md border bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
            >
              {installLog.join('\n')}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => settings && setDraft(settings)} disabled={savingSettings}>
          <RefreshCw className="size-4" />
          {t('automation.common.reset')}
        </Button>
        <Button onClick={handleSaveSettings} disabled={savingSettings}>
          {savingSettings ? <Loader2 className="size-4 animate-spin" /> : null}
          {t('automation.common.save')}
        </Button>
      </div>
    </div>
  )
}
