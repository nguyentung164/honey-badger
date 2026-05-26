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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { useAutomationStore } from '@/stores/useAutomationStore'
import {
  CheckCircle2,
  CircleDashed,
  Download,
  Flame,
  Layers,
  Loader2,
  Monitor,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutomationBrowser, AutomationSettingsState } from 'shared/automation/types'

const ALL_PLAYWRIGHT_BROWSERS: AutomationBrowser[] = ['chromium', 'firefox', 'webkit']

const BROWSER_TILE: Record<
  AutomationBrowser,
  { Icon: LucideIcon; tile: string; iconClass: string; slugClass: string }
> = {
  chromium: {
    Icon: Monitor,
    tile: 'bg-gradient-to-br from-sky-500/18 via-sky-500/5 to-transparent',
    iconClass: 'text-sky-600 dark:text-sky-400',
    slugClass: 'text-sky-600/80 dark:text-sky-400/80',
  },
  firefox: {
    Icon: Flame,
    tile: 'bg-gradient-to-br from-orange-500/18 via-orange-500/5 to-transparent',
    iconClass: 'text-orange-600 dark:text-orange-400',
    slugClass: 'text-orange-600/80 dark:text-orange-400/80',
  },
  webkit: {
    Icon: Layers,
    tile: 'bg-gradient-to-br from-violet-500/18 via-violet-500/5 to-transparent',
    iconClass: 'text-violet-600 dark:text-violet-400',
    slugClass: 'text-violet-600/80 dark:text-violet-400/80',
  },
}

export function AutomationSettings() {
  const { t } = useTranslation()
  const settings = useAutomationStore(s => s.settings)
  const setSettings = useAutomationStore(s => s.setSettings)
  const installedBrowsers = useAutomationStore(s => s.installedBrowsers)
  const setInstalledBrowsers = useAutomationStore(s => s.setInstalledBrowsers)
  const [draft, setDraft] = useState<AutomationSettingsState>({
    defaultWorkers: 1,
    defaultRetries: 0,
    runRetention: 30,
  })
  const [installingFor, setInstallingFor] = useState<AutomationBrowser | 'all' | null>(null)
  const [uninstallingBrowser, setUninstallingBrowser] = useState<AutomationBrowser | null>(null)
  const [uninstallConfirmBrowser, setUninstallConfirmBrowser] = useState<AutomationBrowser | null>(null)
  const [statusRefreshing, setStatusRefreshing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [installLog, setInstallLog] = useState<string[]>([])
  const logRef = useRef<HTMLPreElement>(null)

  const refreshBrowserStatus = useCallback(async () => {
    setStatusRefreshing(true)
    try {
      const status = await window.api.automation.browsers.status()
      if (status.status === 'success' && status.data) setInstalledBrowsers(status.data.installed)
    } finally {
      setStatusRefreshing(false)
    }
  }, [setInstalledBrowsers])

  useEffect(() => {
    void (async () => {
      const res = await window.api.automation.settings.get()
      if (res.status === 'success' && res.data) {
        setSettings(res.data)
        setDraft(res.data)
      }
      await refreshBrowserStatus()
    })()
  }, [setSettings, refreshBrowserStatus])

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

  const installBrowsersWithUi = async (browsers: AutomationBrowser[], target: AutomationBrowser | 'all') => {
    setInstallingFor(target)
    setInstallLog([])
    try {
      const res = await window.api.automation.browsers.install({ browsers })
      if (res.status === 'success' && res.data) {
        setInstalledBrowsers(res.data.installed)
        const names = browsers.map(b => t(`automation.settings.browserName.${b}`)).join(', ')
        toast.success(t('automation.settings.browsersInstalled', { browsers: names }))
      } else {
        toast.error(res.message ?? t('automation.settings.browserInstallFailed'))
      }
    } finally {
      setInstallingFor(null)
    }
  }

  const runUninstallConfirmed = async () => {
    const browser = uninstallConfirmBrowser
    if (!browser) return
    setUninstallConfirmBrowser(null)
    setUninstallingBrowser(browser)
    try {
      const res = await window.api.automation.browsers.uninstall({ browser })
      if (res.status === 'success' && res.data) {
        setInstalledBrowsers(res.data.installed)
        const name = t(`automation.settings.browserName.${browser}`)
        toast.success(t('automation.settings.browserUninstalled', { name }))
      } else {
        toast.error(res.message ?? t('automation.settings.browserUninstallFailed'))
      }
    } finally {
      setUninstallingBrowser(null)
    }
  }

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

  const installBusy = installingFor !== null || uninstallingBrowser !== null

  const pendingUninstallName = uninstallConfirmBrowser
    ? t(`automation.settings.browserName.${uninstallConfirmBrowser}`)
    : ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-auto">
      <AlertDialog
        open={uninstallConfirmBrowser !== null}
        onOpenChange={open => {
          if (!open) setUninstallConfirmBrowser(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('automation.settings.uninstallConfirmTitle', { name: pendingUninstallName })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('automation.settings.uninstallConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="ghost"
              className="bg-destructive/12 font-medium text-destructive shadow-none hover:bg-destructive/22 hover:text-destructive dark:bg-destructive/18 dark:hover:bg-destructive/28"
              onClick={() => void runUninstallConfirmed()}
            >
              {t('automation.settings.uninstallBrowser')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="gap-2 py-3 shadow-sm">
        <CardHeader className="px-4 pb-1 pt-0.5">
          <CardTitle className="text-sm font-semibold">{t('automation.settings.runDefaults')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 px-4 pb-3 pt-0 md:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="s-workers" className="text-xs">{t('automation.runs.fields.workers')}</Label>
            <Input
              id="s-workers"
              type="number"
              min={1}
              max={16}
              className="h-8"
              value={draft.defaultWorkers}
              onChange={e => setDraft({ ...draft, defaultWorkers: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="s-retries" className="text-xs">{t('automation.runs.fields.retries')}</Label>
            <Input
              id="s-retries"
              type="number"
              min={0}
              max={5}
              className="h-8"
              value={draft.defaultRetries}
              onChange={e => setDraft({ ...draft, defaultRetries: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="s-retention" className="text-xs">{t('automation.settings.retention')}</Label>
            <Input
              id="s-retention"
              type="number"
              min={5}
              max={500}
              className="h-8"
              value={draft.runRetention}
              onChange={e => setDraft({ ...draft, runRetention: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="gap-2 overflow-hidden py-3 shadow-sm">
        <CardHeader className="gap-1 bg-muted/15 px-4 pb-2 pt-1">
          <CardTitle className="text-sm font-semibold tracking-tight">{t('automation.settings.browsersTitle')}</CardTitle>
          <CardDescription className="text-[11px] leading-snug sm:max-w-[40rem]">
            {t('automation.settings.browsersHint')}
          </CardDescription>
          <CardAction className="flex flex-row flex-wrap items-center justify-end gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2.5 text-xs font-medium shadow-none"
              disabled={installBusy}
              onClick={() => void installBrowsersWithUi(ALL_PLAYWRIGHT_BROWSERS, 'all')}
            >
              {installingFor === 'all' ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <Download className="size-3.5 shrink-0" />
              )}
              <span className="max-w-[9rem] truncate sm:max-w-none">{t('automation.settings.installAllBrowsers')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 shadow-none"
              title={t('automation.settings.refreshBrowserStatus')}
              aria-label={t('automation.settings.refreshBrowserStatus')}
              onClick={() => void refreshBrowserStatus()}
              disabled={installBusy || statusRefreshing}
            >
              <RefreshCw className={cn('size-3.5', statusRefreshing && 'animate-spin')} />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 px-4 pb-3 pt-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ALL_PLAYWRIGHT_BROWSERS.map(browser => {
              const done = installedBrowsers.includes(browser)
              const rowBusy =
                installingFor === browser || installingFor === 'all' || uninstallingBrowser === browser
              const visual = BROWSER_TILE[browser]
              const { Icon } = visual
              return (
                <div
                  key={browser}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg bg-muted/25 p-3',
                    done && 'bg-emerald-500/[0.07]',
                    rowBusy && 'pointer-events-none opacity-[0.88]',
                  )}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg',
                          visual.tile,
                        )}
                      >
                        <Icon className={cn('size-4', visual.iconClass)} aria-hidden />
                      </div>
                      <div className="min-w-0 space-y-0">
                        <p className="truncate text-xs font-semibold leading-tight">
                          {t(`automation.settings.browserName.${browser}`)}
                        </p>
                        <p className={cn('truncate font-mono text-[9px] font-medium uppercase tracking-wider', visual.slugClass)}>
                          {browser}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'h-5 shrink-0 gap-0.5 border-0 px-1.5 py-0 text-[9px] font-medium uppercase leading-none tracking-wide shadow-none',
                        done
                          ? 'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {done ? (
                        <>
                          <CheckCircle2 className="size-2.5" aria-hidden />
                          {t('automation.settings.browserInstalled')}
                        </>
                      ) : (
                        <>
                          <CircleDashed className="size-2.5" aria-hidden />
                          {t('automation.settings.browserMissing')}
                        </>
                      )}
                    </Badge>
                  </div>

                  {done ? (
                    <div className="mt-auto grid grid-cols-2 gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 px-2 text-xs font-medium shadow-none"
                        disabled={installBusy}
                        onClick={() => void installBrowsersWithUi([browser], browser)}
                      >
                        {rowBusy && (installingFor === browser || installingFor === 'all') ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" />
                        ) : (
                          <Download className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">{t('automation.settings.reinstallBrowser')}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 bg-destructive/12 px-2 text-xs font-medium text-destructive shadow-none hover:bg-destructive/22 hover:text-destructive dark:bg-destructive/18 dark:hover:bg-destructive/28"
                        disabled={installBusy}
                        onClick={() => setUninstallConfirmBrowser(browser)}
                      >
                        {uninstallingBrowser === browser ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">{t('automation.settings.uninstallBrowser')}</span>
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="mt-auto h-7 w-full gap-1 px-2 text-xs font-medium shadow-none"
                      disabled={installBusy}
                      onClick={() => void installBrowsersWithUi([browser], browser)}
                    >
                      {rowBusy ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Download className="size-3.5 shrink-0" />}
                      <span className="truncate">{t('automation.settings.installBrowser')}</span>
                    </Button>
                  )}
                </div>
              )
            })}
          </div>

          {installLog.length > 0 ? (
            <div className="rounded-md bg-muted/30 p-0.5">
              <p className="px-1.5 pb-0.5 pt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('automation.settings.installLogLabel')}
              </p>
              <pre
                ref={logRef}
                className="max-h-32 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[10px] leading-snug text-zinc-100"
              >
                {installLog.join('\n')}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-1.5 pt-0.5">
        <Button variant="ghost" size="sm" className="h-8" onClick={() => settings && setDraft(settings)} disabled={savingSettings}>
          <RefreshCw className="size-3.5" />
          {t('automation.common.reset')}
        </Button>
        <Button size="sm" className="h-8" onClick={handleSaveSettings} disabled={savingSettings}>
          {savingSettings ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t('automation.common.save')}
        </Button>
      </div>
    </div>
  )
}
