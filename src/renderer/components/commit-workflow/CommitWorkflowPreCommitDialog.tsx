'use client'

import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitWorkflowRunChoices } from 'shared/commitWorkflow/runChoices'
import { EMPTY_COMMIT_WORKFLOW_RUN_CHOICES } from 'shared/commitWorkflow/runChoices'
import { suggestRunChoices } from 'shared/commitWorkflow/suggestRunChoices'
import type { TestFlow } from 'shared/automation/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { CodingRuleItem } from '@/stores/useCodingRuleStore'
import {
  hasCommitWorkflowPrefs,
  loadCommitWorkflowPrefs,
  resolveTestProjectIdsForTaskProject,
  saveCommitWorkflowPrefs,
} from '@/lib/commitWorkflow/commitWorkflowPrefs'

export type PreCommitRepoTab = {
  repoPath: string
  label: string
  stagedFiles: string[]
}

type CatalogPage = { id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null
  tabs: PreCommitRepoTab[]
  onConfirm: (choicesByRepo: Record<string, CommitWorkflowRunChoices>) => void
}

function StepCard({
  title,
  enabled,
  onEnabledChange,
  switchId,
  runLabel,
  children,
  hint,
}: {
  title: string
  enabled: boolean
  onEnabledChange: (checked: boolean) => void
  switchId: string
  runLabel: string
  children: ReactNode
  hint?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border bg-card/40 transition-opacity',
        enabled ? 'border-border' : 'border-border/50 opacity-80'
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-2.5">
        <h3 className="text-sm font-medium leading-none">{title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor={switchId} className="cursor-pointer text-xs font-normal text-muted-foreground">
            {runLabel}
          </Label>
          <Switch id={switchId} size="sm" checked={enabled} onCheckedChange={onEnabledChange} aria-label={runLabel} />
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        {children}
        {hint ? (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{hint}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}

function ChoicesGrid({
  choices,
  onChange,
  codingRules,
  catalogPages,
  flowsByPage,
  flowsLoading,
  testProjectLinked,
  onLoadFlows,
}: {
  choices: CommitWorkflowRunChoices
  onChange: (next: CommitWorkflowRunChoices) => void
  codingRules: CodingRuleItem[]
  catalogPages: CatalogPage[]
  flowsByPage: Record<string, TestFlow[]>
  flowsLoading: boolean
  testProjectLinked: boolean
  onLoadFlows: (pageId: string) => void
}) {
  const { t } = useTranslation()
  const baseId = useId()
  const pageId = choices.playwright.catalogPageId ?? ''
  const flows = pageId ? (flowsByPage[pageId] ?? []) : []

  useEffect(() => {
    if (pageId && !flowsByPage[pageId] && !flowsLoading) onLoadFlows(pageId)
  }, [flowsByPage, flowsLoading, onLoadFlows, pageId])

  return (
    <div className="space-y-3">
      <StepCard
        title={t('commitWorkflow.stepKind.coding-rules')}
        enabled={choices.codingRules.enabled}
        onEnabledChange={c => onChange({ ...choices, codingRules: { ...choices.codingRules, enabled: c } })}
        switchId={`${baseId}-coding-rules`}
        runLabel={t('commitWorkflow.preCommit.colRun')}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-coding-rule-select`} className="text-xs text-muted-foreground">
            {t('commitWorkflow.preCommit.colConfig')}
          </Label>
          <Select
            value={choices.codingRules.codingRuleId ?? ''}
            onValueChange={v => {
              const rule = codingRules.find(r => r.id === v)
              onChange({
                ...choices,
                codingRules: {
                  ...choices.codingRules,
                  codingRuleId: v || null,
                  codingRuleName: rule?.name ?? null,
                },
              })
            }}
            disabled={!choices.codingRules.enabled}
          >
            <SelectTrigger id={`${baseId}-coding-rule-select`} className="h-9 w-full">
              <SelectValue placeholder={t('settings.configuration.selectCodingRule')} />
            </SelectTrigger>
            <SelectContent>
              {codingRules.map(rule => (
                <SelectItem key={rule.id} value={rule.id}>
                  {rule.name}
                  {rule.scope === 'global' ? ` (${t('commitWorkflow.codingRuleGlobal')})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </StepCard>

      <StepCard
        title={t('commitWorkflow.stepKind.spotbugs')}
        enabled={choices.spotbugs.enabled}
        onEnabledChange={c => onChange({ ...choices, spotbugs: { enabled: c } })}
        switchId={`${baseId}-spotbugs`}
        runLabel={t('commitWorkflow.preCommit.colRun')}
      >
        <p className="text-sm text-muted-foreground">{t('commitWorkflow.preCommit.none')}</p>
      </StepCard>

      <StepCard
        title={t('commitWorkflow.stepKind.playwright')}
        enabled={choices.playwright.enabled}
        onEnabledChange={c => onChange({ ...choices, playwright: { ...choices.playwright, enabled: c } })}
        switchId={`${baseId}-playwright`}
        runLabel={t('commitWorkflow.preCommit.colRun')}
        hint={!testProjectLinked ? t('commitWorkflow.noLinkedTestProject') : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${baseId}-playwright-page`} className="text-xs text-muted-foreground">
              {t('commitWorkflow.preCommit.selectPage')}
            </Label>
            <Select
              value={pageId}
              onValueChange={v => {
                const page = catalogPages.find(p => p.id === v)
                onChange({
                  ...choices,
                  playwright: {
                    ...choices.playwright,
                    catalogPageId: v || null,
                    catalogFlowId: null,
                    pageName: page?.name ?? null,
                    flowName: null,
                  },
                })
              }}
              disabled={!choices.playwright.enabled || !testProjectLinked}
            >
              <SelectTrigger id={`${baseId}-playwright-page`} className="h-9 w-full">
                <SelectValue placeholder={t('commitWorkflow.preCommit.selectPage')} />
              </SelectTrigger>
              <SelectContent>
                {catalogPages.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${baseId}-playwright-flow`} className="text-xs text-muted-foreground">
              {t('commitWorkflow.preCommit.selectFlowOptional')}
            </Label>
            <Select
              value={choices.playwright.catalogFlowId ?? ''}
              onValueChange={v => {
                const flow = flows.find(f => f.id === v)
                onChange({
                  ...choices,
                  playwright: {
                    ...choices.playwright,
                    catalogFlowId: v || null,
                    flowName: flow?.name ?? null,
                  },
                })
              }}
              disabled={!choices.playwright.enabled || !pageId}
            >
              <SelectTrigger id={`${baseId}-playwright-flow`} className="h-9 w-full">
                <SelectValue placeholder={t('commitWorkflow.preCommit.selectFlowOptional')} />
              </SelectTrigger>
              <SelectContent>
                {flows.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </StepCard>
    </div>
  )
}

export function CommitWorkflowPreCommitDialog({ open, onOpenChange, projectId, tabs, onConfirm }: Props) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState(0)
  const [choicesByRepo, setChoicesByRepo] = useState<Record<string, CommitWorkflowRunChoices>>({})
  const [codingRules, setCodingRules] = useState<CodingRuleItem[]>([])
  const [catalogPages, setCatalogPages] = useState<CatalogPage[]>([])
  const [flowsByPage, setFlowsByPage] = useState<Record<string, TestFlow[]>>({})
  const [flowsLoading, setFlowsLoading] = useState(false)
  const [testProjectLinked, setTestProjectLinked] = useState(false)
  const [loading, setLoading] = useState(false)

  const tabKey = tabs[activeTab]?.repoPath ?? ''

  const initChoicesForTab = useCallback(
    (tab: PreCommitRepoTab): CommitWorkflowRunChoices => {
      if (!projectId) return structuredClone(EMPTY_COMMIT_WORKFLOW_RUN_CHOICES)
      const saved = loadCommitWorkflowPrefs(projectId, tab.repoPath)
      return suggestRunChoices({
        stagedFiles: tab.stagedFiles,
        saved,
        codingRules,
        hasSavedPrefs: hasCommitWorkflowPrefs(projectId, tab.repoPath),
      })
    },
    [codingRules, projectId]
  )

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void (async () => {
      let rules: CodingRuleItem[] = []
      if (projectId) {
        const rulesRes = await window.api.task.codingRule.getForManagement()
        rules =
          rulesRes?.status === 'success' && Array.isArray(rulesRes.data)
            ? (rulesRes.data as CodingRuleItem[]).filter(r => !r.projectId || r.projectId === projectId)
            : []
        setCodingRules(rules)

        const testIds = await resolveTestProjectIdsForTaskProject(projectId)
        setTestProjectLinked(testIds.length > 0)
        if (testIds.length > 0) {
          const listRes = await window.api.automation.project.listForTask(projectId)
          const testProjects = listRes.status === 'success' && listRes.data ? listRes.data : []
          const multi = testProjects.length > 1
          const allPages: CatalogPage[] = []
          for (const tp of testProjects) {
            const pagesRes = await window.api.automation.catalogPage.list(tp.id)
            if (pagesRes.status === 'success' && pagesRes.data) {
              for (const p of pagesRes.data) {
                allPages.push({ id: p.id, name: multi ? `${tp.name} › ${p.name}` : p.name })
              }
            }
          }
          setCatalogPages(allPages)
        } else {
          setCatalogPages([])
        }
      } else {
        setCodingRules([])
        setCatalogPages([])
        setTestProjectLinked(false)
      }

      const initial: Record<string, CommitWorkflowRunChoices> = {}
      for (const tab of tabs) {
        initial[tab.repoPath] = projectId
          ? suggestRunChoices({
              stagedFiles: tab.stagedFiles,
              saved: loadCommitWorkflowPrefs(projectId, tab.repoPath),
              codingRules: rules,
              hasSavedPrefs: hasCommitWorkflowPrefs(projectId, tab.repoPath),
            })
          : structuredClone(EMPTY_COMMIT_WORKFLOW_RUN_CHOICES)
      }
      setChoicesByRepo(initial)
      setFlowsByPage({})
      setActiveTab(0)
    })().finally(() => setLoading(false))
  }, [open, projectId, tabs])

  const loadFlows = useCallback(async (pageId: string) => {
    if (flowsByPage[pageId]) return
    setFlowsLoading(true)
    try {
      const res = await window.api.automation.flow.list(pageId)
      if (res.status === 'success' && res.data) {
        setFlowsByPage(prev => ({ ...prev, [pageId]: res.data! }))
      }
    } finally {
      setFlowsLoading(false)
    }
  }, [flowsByPage])

  const currentChoices = useMemo(
    () => choicesByRepo[tabKey] ?? structuredClone(EMPTY_COMMIT_WORKFLOW_RUN_CHOICES),
    [choicesByRepo, tabKey]
  )

  const handleConfirm = () => {
    if (projectId) {
      for (const tab of tabs) {
        const c = choicesByRepo[tab.repoPath]
        if (c) saveCommitWorkflowPrefs(projectId, tab.repoPath, c)
      }
    }
    onConfirm(choicesByRepo)
    onOpenChange(false)
  }

  const singleTab = tabs.length <= 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,640px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('commitWorkflow.preCommit.title')}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!projectId ? (
            <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="text-amber-600 dark:text-amber-400" />
              <AlertDescription>{t('commitWorkflow.preCommit.noProjectWarning')}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : singleTab ? (
            <ChoicesGrid
              choices={currentChoices}
              onChange={next => setChoicesByRepo(prev => ({ ...prev, [tabKey]: next }))}
              codingRules={codingRules}
              catalogPages={catalogPages}
              flowsByPage={flowsByPage}
              flowsLoading={flowsLoading}
              testProjectLinked={testProjectLinked}
              onLoadFlows={loadFlows}
            />
          ) : (
            <Tabs value={String(activeTab)} onValueChange={v => setActiveTab(Number(v))}>
              <TabsList className="w-full justify-start">
                {tabs.map((tab, i) => (
                  <TabsTrigger key={tab.repoPath} value={String(i)} className="max-w-[12rem] truncate">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((tab, i) => (
                <TabsContent key={tab.repoPath} value={String(i)} className="mt-4">
                  <ChoicesGrid
                    choices={choicesByRepo[tab.repoPath] ?? initChoicesForTab(tab)}
                    onChange={next => setChoicesByRepo(prev => ({ ...prev, [tab.repoPath]: next }))}
                    codingRules={codingRules}
                    catalogPages={catalogPages}
                    flowsByPage={flowsByPage}
                    flowsLoading={flowsLoading}
                    testProjectLinked={testProjectLinked}
                    onLoadFlows={loadFlows}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={loading}>
            {t('commitWorkflow.preCommit.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
