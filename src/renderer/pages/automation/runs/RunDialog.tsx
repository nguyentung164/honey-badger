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
import { cn } from '@/lib/utils'
import { useAutomationStore } from '@/stores/useAutomationStore'

interface Props {
  project: TestProject
  open: boolean
  onOpenChange: (v: boolean) => void
  onStarted: (runId: string) => void
  /** Chạy theo phạm vi page map: gửi `pageIds` lên main (gộp case). */
  pageIdsForRun?: string[]
  /** Chạy theo nhóm catalog (expand cây con); merge với `pageIdsForRun`. */
  groupIdsForRun?: string[]
  /** Một dòng mô tả phạm vi (vd "3 màn hình · 12 test"). */
  scopeSummaryHint?: string
  /** Chạy theo thứ tự nav edge (page map flow). */
  ordered?: boolean
  startPageId?: string
}

export function RunDialog({ project, open, onOpenChange, onStarted, pageIdsForRun, groupIdsForRun, scopeSummaryHint, ordered, startPageId }: Props) {
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
      ...(pageIdsForRun?.length ? { pageIds: pageIdsForRun } : {}),
      ...(groupIdsForRun?.length ? { groupIds: groupIdsForRun } : {}),
      ...(ordered ? { ordered: true } : {}),
      ...(startPageId ? { startPageId } : {}),
    }
    try {
      const res = await window.api.automation.run.start(req)
      if (res.status === 'success' && res.data) {
        toast.success(t('automation.runs.started'))
        onStarted(res.data.runId)
        onOpenChange(false)
      } else {
        const code = res.message ?? ''
        const msg =
          code === 'NO_CASES_FOR_SELECTED_PAGES'
            ? t('automation.runs.errors.noCasesForPages')
            : code === 'NO_CASES_FOR_SELECTED_GROUPS'
              ? t('automation.runs.errors.noCasesForGroups')
              : code === 'NO_SPECS_FOR_CASES'
                ? t('automation.runs.errors.noSpecsForCases')
                : (res.message ?? 'Run failed to start')
        toast.error(msg)
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
          {scopeSummaryHint ? <p className="rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2 text-xs leading-relaxed text-foreground">{scopeSummaryHint}</p> : null}
          <div className="grid gap-1.5">
            <Label>{t('automation.runs.fields.browsers')}</Label>
            <ToggleGroup type="multiple" value={browsers} onValueChange={v => setBrowsers(v as AutomationBrowser[])} variant="outline" size="sm" className="justify-start">
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
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={starting}>
            {t('automation.common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={starting}
            onClick={handleStart}
            className={cn(
              'gap-2 border-emerald-600/55 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-900',
              'dark:border-emerald-500/50 dark:text-emerald-400 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-200'
            )}
          >
            {starting ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Play className="size-4 shrink-0" />}
            {t('automation.runs.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
