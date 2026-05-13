import { Editor } from '@monaco-editor/react'
import { Loader2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { TestCase, TestCasePriority, TestStep, TestStepAction } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

interface Props {
  projectId: string
  initial: TestCase | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

const PRIORITIES: TestCasePriority[] = ['low', 'medium', 'high', 'critical']
const ACTIONS: TestStepAction[] = ['navigate', 'click', 'fill', 'select', 'expect', 'wait', 'custom']

/** Shared with header row so column labels stay aligned with fields (SelectTrigger is w-fit by default and used to spill into the next grid track). */
const STEP_GRID_CLASS =
  'grid grid-cols-[2rem_minmax(4rem,8.5rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-x-3'

function emptyStep(order: number): TestStep {
  return { order, action: 'custom' }
}

export function CaseEditor({ projectId, initial, open, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation()
  const themeMode = useAppearanceStoreSelect(s => s.themeMode)
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TestCasePriority>('medium')
  const [tags, setTags] = useState('')
  const [preconditions, setPreconditions] = useState('')
  const [expected, setExpected] = useState('')
  const [steps, setSteps] = useState<TestStep[]>([emptyStep(1)])
  const [spec, setSpec] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiProposal, setAiProposal] = useState<string | null>(null)
  const [aiRationale, setAiRationale] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCode(initial?.code ?? '')
    setTitle(initial?.title ?? '')
    setPriority(initial?.priority ?? 'medium')
    setTags((initial?.tags ?? []).join(', '))
    setPreconditions(initial?.preconditions ?? '')
    setExpected(initial?.expected ?? '')
    setSteps(initial?.steps && initial.steps.length > 0 ? initial.steps : [emptyStep(1)])
    setAiProposal(null)
    setAiRationale(null)
    setSpec('')
    if (initial) {
      void window.api.automation.case.readSpec({ projectId, code: initial.code }).then(res => {
        if (res.status === 'success' && typeof res.data === 'string') setSpec(res.data)
      })
    }
  }, [open, initial, projectId])

  const handleStepChange = (idx: number, patch: Partial<TestStep>) => {
    setSteps(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  const addStep = () => setSteps(prev => [...prev, emptyStep(prev.length + 1)])
  const removeStep = (idx: number) => setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })))

  const handleSave = async () => {
    if (!code.trim()) {
      toast.error(t('automation.cases.errors.codeRequired'))
      return
    }
    if (!title.trim()) {
      toast.error(t('automation.cases.errors.titleRequired'))
      return
    }
    setSaving(true)
    try {
      const payload: TestCase = {
        id: initial?.id ?? randomUuidV7(),
        projectId,
        code: code.trim(),
        title: title.trim(),
        tags: tags
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        priority,
        preconditions: preconditions.trim() || undefined,
        steps,
        expected: expected.trim(),
        source: initial?.source ?? 'manual',
        specStatus: initial?.specStatus ?? 'none',
      }
      const res = initial ? await window.api.automation.case.update(payload) : await window.api.automation.case.create(payload)
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? 'Save failed')
        return
      }
      if (spec.trim()) {
        await window.api.automation.case.writeSpec({
          projectId,
          code: payload.code,
          content: spec,
          markSaved: true,
        })
      }
      toast.success(t('automation.cases.saved'))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateSpec = async () => {
    if (!initial) {
      toast.info(t('automation.cases.errors.saveBeforeGenerate'))
      return
    }
    setAiBusy(true)
    try {
      const res = await window.api.automation.ai.generateSpec({ caseId: initial.id })
      if (res.status === 'success' && res.data) {
        setAiProposal(res.data.code)
        setAiRationale(res.data.rationale ?? '')
      } else {
        toast.error(res.message ?? 'AI failed')
      }
    } finally {
      setAiBusy(false)
    }
  }

  const acceptAi = () => {
    if (aiProposal != null) {
      setSpec(aiProposal)
      setAiProposal(null)
      toast.success(t('automation.cases.aiApplied'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? t('automation.cases.edit') : t('automation.cases.new')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="meta" className="flex max-h-[70vh] flex-col">
          <TabsList>
            <TabsTrigger value="meta">{t('automation.cases.tabs.meta')}</TabsTrigger>
            <TabsTrigger value="steps">{t('automation.cases.tabs.steps')}</TabsTrigger>
            <TabsTrigger value="spec">{t('automation.cases.tabs.spec')}</TabsTrigger>
          </TabsList>
          <TabsContent value="meta" className="space-y-3 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="c-code">{t('automation.cases.fields.code')}</Label>
                <Input id="c-code" value={code} onChange={e => setCode(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-priority">{t('automation.cases.fields.priority')}</Label>
                <Select value={priority} onValueChange={v => setPriority(v as TestCasePriority)}>
                  <SelectTrigger id="c-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-tags">{t('automation.cases.fields.tags')}</Label>
                <Input id="c-tags" placeholder="smoke, regression" value={tags} onChange={e => setTags(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-title">{t('automation.cases.fields.title')}</Label>
              <Input id="c-title" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-pre">{t('automation.cases.fields.preconditions')}</Label>
              <Textarea id="c-pre" rows={2} value={preconditions} onChange={e => setPreconditions(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-exp">{t('automation.cases.fields.expected')}</Label>
              <Textarea id="c-exp" rows={2} value={expected} onChange={e => setExpected(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="steps" className="space-y-2 overflow-y-auto">
            <div className={`${STEP_GRID_CLASS} px-2 text-[10px] uppercase text-muted-foreground`}>
              <div className="text-center tabular-nums">#</div>
              <div>{t('automation.cases.fields.action')}</div>
              <div>{t('automation.cases.fields.target')}</div>
              <div>{t('automation.cases.fields.value')}</div>
              <div>{t('automation.cases.fields.note')}</div>
              <div aria-hidden className="h-px w-full" />
            </div>
            {steps.map((s, idx) => (
              <div key={idx} className={`${STEP_GRID_CLASS} rounded-md border p-2`}>
                <div className="text-center text-sm font-mono tabular-nums text-muted-foreground">{s.order}</div>
                <div className="min-w-0">
                  <Select value={s.action} onValueChange={v => handleStepChange(idx, { action: v as TestStepAction })}>
                    <SelectTrigger className="h-8 w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map(a => (
                        <SelectItem key={a} value={a} className="capitalize">
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0">
                  <Input className="h-8" value={s.target ?? ''} onChange={e => handleStepChange(idx, { target: e.target.value })} />
                </div>
                <div className="min-w-0">
                  <Input className="h-8" value={s.value ?? ''} onChange={e => handleStepChange(idx, { value: e.target.value })} />
                </div>
                <div className="min-w-0">
                  <Input className="h-8" value={s.note ?? ''} onChange={e => handleStepChange(idx, { note: e.target.value })} />
                </div>
                <div className="flex justify-center">
                  <Button size="sm" variant="ghost" className="size-8 shrink-0 p-0" onClick={() => removeStep(idx)} aria-label={t('automation.common.delete')}>
                    ×
                  </Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addStep}>
              {t('automation.cases.addStep')}
            </Button>
          </TabsContent>

          <TabsContent value="spec" className="flex flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t('automation.cases.specHint')}</span>
              <Button size="sm" variant="outline" onClick={handleGenerateSpec} disabled={aiBusy}>
                {aiBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {t('automation.cases.generateSpec')}
              </Button>
            </div>
            {aiProposal != null ? (
              <div className="flex flex-col gap-2 rounded-md border p-2">
                <div className="text-xs text-muted-foreground">{aiRationale}</div>
                <div className="h-48 overflow-hidden rounded">
                  <Editor
                    height="192px"
                    defaultLanguage="typescript"
                    value={aiProposal}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'vs'}
                    options={{ readOnly: true, minimap: { enabled: false } }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAiProposal(null)}>
                    {t('automation.common.reject')}
                  </Button>
                  <Button size="sm" onClick={acceptAi}>
                    {t('automation.common.applyAi')}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex-1 overflow-hidden rounded border">
              <Editor
                height="360px"
                defaultLanguage="typescript"
                value={spec}
                onChange={v => setSpec(v ?? '')}
                theme={themeMode === 'dark' ? 'vs-dark' : 'vs'}
                options={{ minimap: { enabled: false }, automaticLayout: true }}
              />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('automation.common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('automation.common.saving') : t('automation.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
