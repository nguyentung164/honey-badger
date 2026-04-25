'use client'

import { Copy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import { buildExplainMetricsPayload, buildScheduleRiskPayload, type EvmMetricIndicatorId, MAX_SCHEDULE_TASKS_IN_PAYLOAD } from '@/lib/evmAiPayloads'
import { computeEVMMetrics, DEFAULT_EVM_HOURS_PER_DAY } from '@/lib/evmCalculations'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { EVMTabId } from '@/pages/evm/components/EVMSidebar'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import { type EvmAiPromptType, evmTabToPromptType, useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'

const EXPLAIN_OPTIONS: { id: EvmMetricIndicatorId; labelKey: string }[] = [
  { id: 'CPI', labelKey: 'evm.kpiCPI' },
  { id: 'SPI', labelKey: 'evm.kpiSPI' },
  { id: 'EAC', labelKey: 'evm.kpiEAC' },
  { id: 'ETC', labelKey: 'evm.kpiETC' },
  { id: 'VAC', labelKey: 'evm.kpiVAC' },
  { id: 'PV', labelKey: 'evm.kpiPV' },
  { id: 'EV', labelKey: 'evm.kpiEV' },
  { id: 'AC', labelKey: 'evm.kpiAC' },
  { id: 'SV', labelKey: 'evm.kpiSV' },
  { id: 'CV', labelKey: 'evm.kpiCV' },
  { id: 'BAC', labelKey: 'evm.kpiBAC' },
  { id: 'PROGRESS', labelKey: 'evm.kpiProgress' },
]

const ALL_EXPLAIN_IDS = EXPLAIN_OPTIONS.map(o => o.id)

const HISTORY_PAGE = 25

async function saveInsightToDb(projectId: string, insightType: EvmAiPromptType, outputMarkdown: string, inputPayloadJson: string | null): Promise<void> {
  if (!projectId?.trim()) {
    toast.warning(i18n.t('evm.ai.saveRequiresProject'))
    return
  }
  if (outputMarkdown.startsWith('Error')) return
  const res = await window.api.evm.saveAiInsight({
    projectId,
    insightType,
    outputMarkdown,
    inputPayloadJson,
  })
  if (res.status !== 'success') {
    toast.warning(res.message ?? 'Save insight failed')
  }
}

export function EvmAiInsightPanel({ activeTab }: { activeTab: EVMTabId }) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const project = useEVMStore(s => s.project)
  const wbs = useEVMStore(s => s.wbs)
  const ac = useEVMStore(s => s.ac)
  const master = useEVMStore(s => s.master)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])
  const promptType = evmTabToPromptType(activeTab)

  const uiSegment = useEvmAiInsightStore(s => s.uiSegment)
  const setUiSegment = useEvmAiInsightStore(s => s.setUiSegment)
  const explainIndicators = useEvmAiInsightStore(s => s.explainIndicators)
  const explainNote = useEvmAiInsightStore(s => s.explainNote)
  const setExplainNote = useEvmAiInsightStore(s => s.setExplainNote)
  const toggleExplainIndicator = useEvmAiInsightStore(s => s.toggleExplainIndicator)
  const setExplainIndicators = useEvmAiInsightStore(s => s.setExplainIndicators)
  const schedulePhaseFilter = useEvmAiInsightStore(s => s.schedulePhaseFilter)
  const scheduleAssigneeFilter = useEvmAiInsightStore(s => s.scheduleAssigneeFilter)

  const resultByType = useEvmAiInsightStore(s => s.resultByType)
  const setResultForType = useEvmAiInsightStore(s => s.setResultForType)
  const loadingType = useEvmAiInsightStore(s => s.loadingType)
  const setLoadingType = useEvmAiInsightStore(s => s.setLoadingType)

  const historyRows = useEvmAiInsightStore(s => s.historyRows)
  const historyLoading = useEvmAiInsightStore(s => s.historyLoading)
  const setHistoryRows = useEvmAiInsightStore(s => s.setHistoryRows)
  const setHistoryLoading = useEvmAiInsightStore(s => s.setHistoryLoading)
  const historySelected = useEvmAiInsightStore(s => s.historySelected)
  const setHistorySelected = useEvmAiInsightStore(s => s.setHistorySelected)

  const [historyHasMore, setHistoryHasMore] = useState(true)
  const [historyAppendLoading, setHistoryAppendLoading] = useState(false)

  const nonWorkingDays = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])

  const hpd = master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY
  const metrics = useMemo(
    () => computeEVMMetrics({ project, wbs, ac, hoursPerDay: hpd, nonWorkingDays, wbsDayUnits }),
    [project, wbs, ac, hpd, nonWorkingDays, wbsDayUnits]
  )

  const filteredWbs = useMemo(() => {
    let list = wbs
    if (schedulePhaseFilter !== 'all') list = list.filter(r => r.phase === schedulePhaseFilter)
    if (scheduleAssigneeFilter !== 'all') list = list.filter(r => r.assignee === scheduleAssigneeFilter)
    return list
  }, [wbs, schedulePhaseFilter, scheduleAssigneeFilter])

  const currentResult = promptType ? (resultByType[promptType] ?? '') : ''
  const isLoading = promptType ? loadingType === promptType : false

  const loadHistory = useCallback(
    async (append: boolean) => {
      if (!project.id || !promptType) {
        if (!append) setHistoryRows([])
        setHistoryHasMore(false)
        return
      }
      if (append) {
        setHistoryAppendLoading(true)
      } else {
        setHistoryLoading(true)
        setHistorySelected(null)
        setHistoryRows([])
        setHistoryHasMore(true)
      }
      const offset = append ? useEvmAiInsightStore.getState().historyRows.length : 0
      try {
        const res = await window.api.evm.listAiInsights({
          projectId: project.id,
          insightType: promptType,
          limit: HISTORY_PAGE,
          offset,
        })
        if (res.status !== 'success' || !res.data) {
          if (!append) setHistoryRows([])
          setHistoryHasMore(false)
          return
        }
        const rows = (res.data as { id: string; insightType: string; outputMarkdown: string; createdAt: string }[]).map(r => ({
          id: r.id,
          insightType: r.insightType,
          outputMarkdown: r.outputMarkdown,
          createdAt: r.createdAt,
        }))
        if (append) {
          const prev = useEvmAiInsightStore.getState().historyRows
          setHistoryRows([...prev, ...rows])
        } else {
          setHistoryRows(rows)
        }
        setHistoryHasMore(rows.length === HISTORY_PAGE)
      } finally {
        if (append) setHistoryAppendLoading(false)
        else setHistoryLoading(false)
      }
    },
    [project.id, promptType, setHistoryLoading, setHistoryRows, setHistorySelected]
  )

  useEffect(() => {
    setHistoryHasMore(true)
  }, [project.id, promptType])

  useEffect(() => {
    if (uiSegment === 'history' && promptType && project.id) void loadHistory(false)
  }, [uiSegment, promptType, project.id, loadHistory])

  const runExplain = useCallback(async () => {
    if (explainIndicators.length === 0) {
      toast.error(t('evm.ai.selectAtLeastOneIndicator'))
      return
    }
    setLoadingType('EVM_EXPLAIN_METRICS')
    try {
      const evm_data = buildExplainMetricsPayload({
        project,
        master,
        wbs,
        ac,
        nonWorkingDays,
        wbsDayUnits,
        selectedIndicators: explainIndicators,
        userNote: explainNote,
      })
      const text = await window.api.openai.send_message({
        type: 'EVM_EXPLAIN_METRICS',
        values: { evm_data },
      })
      setResultForType('EVM_EXPLAIN_METRICS', text)
      if (text.startsWith('Error')) toast.error(text)
      await saveInsightToDb(project.id, 'EVM_EXPLAIN_METRICS', text, evm_data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg)
      setResultForType('EVM_EXPLAIN_METRICS', `Error: ${msg}`)
    } finally {
      setLoadingType(null)
    }
  }, [ac, explainIndicators, explainNote, nonWorkingDays, project, setLoadingType, setResultForType, t, wbs, master, wbsDayUnits])

  const runSchedule = useCallback(async () => {
    if (filteredWbs.length === 0) {
      toast.error(t('evm.wbsEmptyForAi'))
      return
    }
    setLoadingType('EVM_SCHEDULE_RISK')
    try {
      const truncated = filteredWbs.length > MAX_SCHEDULE_TASKS_IN_PAYLOAD
      const schedule_data = buildScheduleRiskPayload({
        project,
        master,
        wbs,
        ac,
        nonWorkingDays,
        wbsDayUnits,
        metrics,
        tasks: filteredWbs,
        truncated,
      })
      const text = await window.api.openai.send_message({
        type: 'EVM_SCHEDULE_RISK',
        values: { schedule_data },
      })
      setResultForType('EVM_SCHEDULE_RISK', text)
      if (text.startsWith('Error')) toast.error(text)
      if (truncated) {
        toast.info(
          t('evm.ai.scheduleRiskTruncatedWarning', {
            sent: MAX_SCHEDULE_TASKS_IN_PAYLOAD,
            total: filteredWbs.length,
          })
        )
      }
      await saveInsightToDb(project.id, 'EVM_SCHEDULE_RISK', text, schedule_data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg)
      setResultForType('EVM_SCHEDULE_RISK', `Error: ${msg}`)
    } finally {
      setLoadingType(null)
    }
  }, [ac, filteredWbs, master, metrics, nonWorkingDays, project, setLoadingType, setResultForType, t, wbs, wbsDayUnits])

  const runCurrent = useCallback(() => {
    switch (promptType) {
      case 'EVM_EXPLAIN_METRICS':
        return void runExplain()
      case 'EVM_SCHEDULE_RISK':
        return void runSchedule()
      default:
        return undefined
    }
  }, [promptType, runExplain, runSchedule])

  const copyCurrentResult = useCallback(async () => {
    if (!currentResult) return
    try {
      await navigator.clipboard.writeText(currentResult)
      toast.success(t('evm.ai.copySuccess'))
    } catch {
      toast.error(t('evm.ai.copyFailed'))
    }
  }, [currentResult, t])

  const panelTitleKey = promptType === 'EVM_EXPLAIN_METRICS' ? 'evm.ai.explainTitle' : promptType === 'EVM_SCHEDULE_RISK' ? 'evm.ai.scheduleRiskTitle' : 'evm.ai.panelTitle'

  const markdownProseClass =
    'prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:mb-1 prose-headings:mt-2 first:prose-headings:mt-0 prose-ul:my-1 prose-li:my-0 prose-hr:my-2'

  if (!promptType) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border/50 px-2.5 py-1.5 text-xs font-medium">{t('evm.ai.panelTitle')}</div>
        <p className="p-2 text-xs leading-snug text-muted-foreground">{t('evm.ai.panelUnsupportedTab')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="p-2">
        <h2 className="text-xs font-semibold leading-tight tracking-tight">{t(panelTitleKey)}</h2>
        <Tabs value={uiSegment} onValueChange={v => setUiSegment(v as 'analyze' | 'history')} className="mt-1.5">
          <TabsList className="h-7 w-full justify-start gap-0.5 rounded-md bg-muted/40 p-1">
            <TabsTrigger value="analyze" className="h-6 px-2.5">
              {t('evm.ai.segmentAnalyze')}
            </TabsTrigger>
            <TabsTrigger value="history" className="h-6 px-2.5">
              {t('evm.ai.segmentHistory')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {uiSegment === 'history' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
          {historyLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />…
            </div>
          ) : historyRows.length === 0 ? (
            <p className="text-xs leading-snug text-muted-foreground">{t('evm.ai.historyEmpty')}</p>
          ) : (
            <>
              <ScrollArea className="h-24 shrink-0 rounded-md border border-border/40 bg-muted/10">
                <ul className="p-0.5">
                  {historyRows.map(row => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={cn(
                          'w-full rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-muted/70',
                          historySelected?.id === row.id && 'bg-muted shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
                        )}
                        onClick={() => setHistorySelected(row)}
                      >
                        <span className="font-mono text-[10px] leading-none text-muted-foreground">{row.createdAt?.replace('T', ' ').slice(0, 19)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              {historyHasMore && historyRows.length > 0 && (
                <Button type="button" variant="outline" size="sm" className="h-6 shrink-0 px-2 text-[11px]" disabled={historyAppendLoading} onClick={() => void loadHistory(true)}>
                  {historyAppendLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : t('evm.ai.historyLoadMore')}
                </Button>
              )}
              <div className={cn('min-h-0 flex-1 overflow-y-auto rounded-md border border-border/40 bg-background/40 p-2 text-xs', markdownProseClass)}>
                {historySelected ? (
                  <>
                    <div className="mb-1.5 flex not-prose">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          setResultForType(promptType, historySelected.outputMarkdown)
                          setUiSegment('analyze')
                          toast.success(t('evm.ai.historyAppliedToEditor'))
                        }}
                      >
                        {t('evm.ai.applyHistoryToCurrent')}
                      </Button>
                    </div>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{historySelected.outputMarkdown}</ReactMarkdown>
                  </>
                ) : (
                  <p className="text-[11px] leading-snug text-muted-foreground not-prose">{t('evm.ai.historyPickRow')}</p>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
          {promptType === 'EVM_EXPLAIN_METRICS' && (
            <div className="shrink-0 space-y-1.5 rounded-md bg-card/40 p-2 shadow-sm">
              <p className="text-[11px] leading-snug text-muted-foreground">{t('evm.ai.explainHint')}</p>
              <ScrollArea className="max-h-[5.5rem]">
                <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 pr-2 sm:grid-cols-3">
                  {EXPLAIN_OPTIONS.map(opt => {
                    const id = `evm-ai-panel-${opt.id}`
                    const checked = explainIndicators.includes(opt.id)
                    return (
                      <label
                        key={opt.id}
                        htmlFor={id}
                        className={cn(
                          'flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11px] leading-tight transition-colors hover:bg-muted/60',
                          checked && 'bg-primary/10'
                        )}
                      >
                        <Checkbox id={id} className="size-3.5 shrink-0 rounded-[3px]" checked={checked} onCheckedChange={() => toggleExplainIndicator(opt.id)} />
                        <span className="min-w-0 truncate font-medium text-foreground/90">{t(opt.labelKey)}</span>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
              <div className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-1.5">
                <Button type="button" variant={buttonVariant} size="sm" className="h-6 px-2 text-[11px]" onClick={() => setExplainIndicators([...ALL_EXPLAIN_IDS])}>
                  {t('evm.ai.explainSelectAll')}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setExplainIndicators([])}>
                  {t('evm.ai.explainClear')}
                </Button>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[11px] text-muted-foreground">{t('evm.ai.explainNote')}</Label>
                <Textarea
                  value={explainNote}
                  onChange={e => setExplainNote(e.target.value)}
                  placeholder={t('evm.ai.explainNotePlaceholder')}
                  rows={2}
                  className="min-h-0 resize-none py-1.5 text-[11px] leading-snug"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant={buttonVariant} size="sm" className="h-7 px-3 text-xs" disabled={isLoading} onClick={runCurrent}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>{t('evm.ai.runAnalysis')}</span>}
            </Button>
            {currentResult && !isLoading && (
              <Button type="button" variant={buttonVariant} size="sm" className="h-7 px-2.5 text-xs" onClick={() => void copyCurrentResult()}>
                <Copy className="h-3.5 w-3.5" />
                <span className="ml-1">{t('evm.ai.copy')}</span>
              </Button>
            )}
          </div>

          {promptType === 'EVM_SCHEDULE_RISK' && filteredWbs.length > MAX_SCHEDULE_TASKS_IN_PAYLOAD && (
            <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-500">
              {t('evm.ai.scheduleRiskTruncatedWarning', {
                sent: MAX_SCHEDULE_TASKS_IN_PAYLOAD,
                total: filteredWbs.length,
              })}
            </p>
          )}

          <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/40 bg-background/40">
            <div className={cn('p-2 text-xs', markdownProseClass)}>
              {isLoading ? (
                <div className="flex items-center gap-1.5 text-muted-foreground not-prose">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />…
                </div>
              ) : currentResult ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentResult}</ReactMarkdown>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground not-prose">{t('evm.ai.resultPlaceholder')}</p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
