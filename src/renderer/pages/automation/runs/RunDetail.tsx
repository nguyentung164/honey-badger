import { ExternalLink, FileText, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseResultStatus, TestCaseResult, TestRunSummary } from 'shared/automation/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { automationEmptyResults, useAutomationStore } from '@/stores/useAutomationStore'
import { AiRepairDialog } from './AiRepairDialog'

interface Props {
  run: TestRunSummary
}

function statusVariant(status: CaseResultStatus): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'passed') return 'default'
  if (status === 'failed' || status === 'timedOut' || status === 'interrupted') return 'destructive'
  if (status === 'flaky') return 'secondary'
  return 'outline'
}

export function RunDetail({ run }: Props) {
  const { t } = useTranslation()
  const results = useAutomationStore(s => s.results[run.id] ?? automationEmptyResults)
  const setResults = useAutomationStore(s => s.setResults)
  const [loading, setLoading] = useState(false)
  const [repairTarget, setRepairTarget] = useState<string | null>(null)
  const [repairOpen, setRepairOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.automation.run
      .results(run.id)
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && res.data) setResults(run.id, res.data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [run.id, setResults])

  const handleOpenTrace = async (r: TestCaseResult) => {
    if (!r.tracePath) {
      toast.info(t('automation.runs.noTrace'))
      return
    }
    const res = await window.api.automation.run.openTrace({ tracePath: r.tracePath })
    if (res.status !== 'success') toast.error(res.message ?? 'Open trace failed')
  }

  const handleOpenReport = async () => {
    const res = await window.api.automation.run.openReport(run.id)
    if (res.status !== 'success') toast.error(res.message ?? 'Open report failed')
  }

  const handleRepair = (r: TestCaseResult) => {
    if (r.status === 'passed') {
      toast.info(t('automation.repair.notNeeded'))
      return
    }
    setRepairTarget(r.id)
    setRepairOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.status')}</div>
            <Badge variant={run.status === 'passed' ? 'default' : run.status === 'failed' || run.status === 'error' ? 'destructive' : 'secondary'} className="capitalize">
              {run.status}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.totals')}</div>
            <div className="font-mono text-sm">
              {run.passed}P / {run.failed}F / {run.skipped}S / {run.flaky}? / {run.total}T
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.duration')}</div>
            <div className="font-mono text-sm">{(run.durationMs / 1000).toFixed(1)}s</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.browsers')}</div>
            <div className="text-sm uppercase">{run.browsers.join(', ')}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenReport} disabled={!run.reportPath}>
            <FileText className="size-4" />
            {t('automation.runs.openReport')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t('automation.runs.columns.browser')}</TableHead>
              <TableHead>{t('automation.runs.columns.case')}</TableHead>
              <TableHead className="w-28">{t('automation.runs.columns.status')}</TableHead>
              <TableHead className="w-24">{t('automation.runs.columns.attempts')}</TableHead>
              <TableHead className="w-28">{t('automation.runs.columns.duration')}</TableHead>
              <TableHead className="w-40 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t('automation.common.loading')}
                </TableCell>
              </TableRow>
            ) : results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t('automation.runs.noResults')}
                </TableCell>
              </TableRow>
            ) : (
              results.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs uppercase">{r.browser}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{r.caseId}</div>
                    {r.errorMessage ? (
                      <div className="mt-1 line-clamp-2 text-xs text-destructive">{r.errorMessage}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)} className="capitalize">
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.attempts}</TableCell>
                  <TableCell className="font-mono text-xs">{(r.durationMs / 1000).toFixed(2)}s</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleOpenTrace(r)}
                        disabled={!r.tracePath}
                        aria-label={t('automation.runs.openTrace')}
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRepair(r)}
                        aria-label={t('automation.repair.title')}
                      >
                        {r.status === 'failed' || r.status === 'timedOut' ? (
                          <Wrench className="size-4 text-amber-600" />
                        ) : (
                          <Sparkles className="size-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AiRepairDialog caseResultId={repairTarget} open={repairOpen} onOpenChange={setRepairOpen} />
    </div>
  )
}
