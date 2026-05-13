import { FileUp, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportLayout, TestCase } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'

interface Props {
  projectId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}

export function CaseImportDialog({ projectId, open, onOpenChange, onImported }: Props) {
  const { t } = useTranslation()
  const [filePath, setFilePath] = useState<string | null>(null)
  const [layout, setLayout] = useState<ImportLayout>('row-per-step')
  const [previewCases, setPreviewCases] = useState<TestCase[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [aiInput, setAiInput] = useState('')

  const handlePick = async () => {
    const res = await window.api.automation.importPickFile()
    if (res.status === 'success' && res.data?.filePath) {
      setFilePath(res.data.filePath)
    }
  }

  const handleParse = async () => {
    if (!filePath) return
    setBusy(true)
    try {
      const res = await window.api.automation.importParse({ projectId, filePath, layout })
      if (res.status === 'success' && res.data) {
        setPreviewCases(res.data.cases)
        setWarnings(res.data.warnings)
      } else {
        toast.error(res.message ?? 'Parse failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleAiGenerate = async () => {
    if (!aiInput.trim()) return
    setBusy(true)
    try {
      const res = await window.api.automation.ai.generateCases({ projectId, inputText: aiInput })
      if (res.status === 'success' && res.data) {
        setPreviewCases(res.data.cases)
        setWarnings(res.data.warnings)
      } else {
        toast.error(res.message ?? 'AI failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCommit = async () => {
    if (previewCases.length === 0) {
      toast.info(t('automation.cases.import.nothingToImport'))
      return
    }
    setBusy(true)
    try {
      const res = await window.api.automation.case.bulkCreate({ projectId, cases: previewCases })
      if (res.status === 'success') {
        toast.success(t('automation.cases.import.committed', { count: previewCases.length }))
        setPreviewCases([])
        setWarnings([])
        setFilePath(null)
        setAiInput('')
        onImported()
      } else {
        toast.error(res.message ?? 'Import failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('automation.cases.import.title')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="file">
          <TabsList>
            <TabsTrigger value="file">{t('automation.cases.import.fileTab')}</TabsTrigger>
            <TabsTrigger value="ai">{t('automation.cases.import.aiTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePick} disabled={busy}>
                <FileUp className="size-4" />
                {t('automation.cases.import.pick')}
              </Button>
              <span className="truncate text-xs text-muted-foreground">{filePath ?? t('automation.cases.import.noFile')}</span>
            </div>
            <div className="space-y-1.5">
              <Label>{t('automation.cases.import.layout')}</Label>
              <RadioGroup value={layout} onValueChange={(v: string) => setLayout(v as ImportLayout)} className="flex gap-3">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="rps" value="row-per-step" />
                  <Label htmlFor="rps" className="text-xs">
                    {t('automation.cases.import.rowPerStep')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="rpc" value="row-per-case" />
                  <Label htmlFor="rpc" className="text-xs">
                    {t('automation.cases.import.rowPerCase')}
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleParse} disabled={!filePath || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t('automation.cases.import.parse')}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="ai" className="space-y-3">
            <Label className="text-xs">{t('automation.cases.import.aiPrompt')}</Label>
            <Textarea rows={8} value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder={t('automation.cases.import.aiPlaceholder')} />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAiGenerate} disabled={busy || !aiInput.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t('automation.cases.import.aiGenerate')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {warnings.length > 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            {warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        ) : null}

        {previewCases.length > 0 ? (
          <div className="max-h-64 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('automation.cases.columns.code')}</TableHead>
                  <TableHead>{t('automation.cases.columns.title')}</TableHead>
                  <TableHead className="w-20">{t('automation.cases.columns.priority')}</TableHead>
                  <TableHead className="w-20">{t('automation.cases.import.stepsCount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewCases.map(c => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="text-sm">{c.title}</TableCell>
                    <TableCell className="text-xs uppercase">{c.priority}</TableCell>
                    <TableCell className="text-xs">{c.steps.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('automation.common.cancel')}
          </Button>
          <Button onClick={handleCommit} disabled={previewCases.length === 0 || busy}>
            {t('automation.cases.import.commit', { count: previewCases.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
