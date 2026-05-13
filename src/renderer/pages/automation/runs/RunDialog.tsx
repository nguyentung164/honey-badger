import { Loader2, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutomationBrowser, RunRequest, TestProject } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import toast from '@/components/ui-elements/Toast'
import { useAutomationStore } from '@/stores/useAutomationStore'

interface Props {
  project: TestProject
  open: boolean
  onOpenChange: (v: boolean) => void
  onStarted: (runId: string) => void
}

export function RunDialog({ project, open, onOpenChange, onStarted }: Props) {
  const { t } = useTranslation()
  const settings = useAutomationStore(s => s.settings)
  const [browsers, setBrowsers] = useState<AutomationBrowser[]>(project.browsers)
  const [workers, setWorkers] = useState(1)
  const [retries, setRetries] = useState(0)
  const [grep, setGrep] = useState('')
  const [headed, setHeaded] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!open) return
    setBrowsers(project.browsers)
    setWorkers(settings?.defaultWorkers ?? 1)
    setRetries(settings?.defaultRetries ?? 0)
    setGrep('')
    setHeaded(false)
  }, [open, project, settings])

  const handleStart = async () => {
    if (browsers.length === 0) {
      toast.error(t('automation.runs.errors.browsers'))
      return
    }
    setStarting(true)
    const req: RunRequest = {
      projectId: project.id,
      browsers,
      workers: Math.max(1, workers),
      retries: Math.max(0, retries),
      grep: grep.trim() || undefined,
      headed,
    }
    try {
      const res = await window.api.automation.run.start(req)
      if (res.status === 'success' && res.data) {
        toast.success(t('automation.runs.started'))
        onStarted(res.data.runId)
        onOpenChange(false)
      } else {
        toast.error(res.message ?? 'Run failed to start')
      }
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('automation.runs.start')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t('automation.runs.fields.browsers')}</Label>
            <ToggleGroup
              type="multiple"
              value={browsers}
              onValueChange={v => setBrowsers(v as AutomationBrowser[])}
              variant="outline"
              size="sm"
              className="justify-start"
            >
              {(['chromium', 'firefox', 'webkit'] as AutomationBrowser[]).map(b => (
                <ToggleGroupItem key={b} value={b} className="uppercase">
                  {b}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-workers">{t('automation.runs.fields.workers')}</Label>
              <Input id="r-workers" type="number" min={1} max={16} value={workers} onChange={e => setWorkers(Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-retries">{t('automation.runs.fields.retries')}</Label>
              <Input id="r-retries" type="number" min={0} max={5} value={retries} onChange={e => setRetries(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-grep">{t('automation.runs.fields.grep')}</Label>
            <Input id="r-grep" placeholder="@smoke" value={grep} onChange={e => setGrep(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label htmlFor="r-headed" className="text-sm">
              {t('automation.runs.fields.headed')}
            </Label>
            <Switch id="r-headed" checked={headed} onCheckedChange={setHeaded} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={starting}>
            {t('automation.common.cancel')}
          </Button>
          <Button onClick={handleStart} disabled={starting}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t('automation.runs.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
