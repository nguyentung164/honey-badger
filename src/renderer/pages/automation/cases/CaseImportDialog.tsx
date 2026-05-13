import { FileUp, ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportLayout, TestCase } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'

function isExcelModernPath(p: string | null): boolean {
  if (!p) return false
  const dot = p.lastIndexOf('.')
  const ext = dot >= 0 ? p.slice(dot).toLowerCase() : ''
  return ext === '.xlsx' || ext === '.xlsm'
}

function parseOptionalPositiveInt(raw: string): number | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const n = Number(t)
  if (!Number.isFinite(n)) return undefined
  const i = Math.floor(n)
  return i >= 1 ? i : undefined
}

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
  const [aiImagePaths, setAiImagePaths] = useState<string[]>([])
  const [excelSheets, setExcelSheets] = useState<Array<{ name: string }> | null>(null)
  const [excelSelected, setExcelSelected] = useState<string[]>([])
  const [excelListError, setExcelListError] = useState<string | null>(null)
  const [excelHeaderRowNum, setExcelHeaderRowNum] = useState(1)
  const [excelFirstDataRowStr, setExcelFirstDataRowStr] = useState('')
  const [excelLastRowStr, setExcelLastRowStr] = useState('')
  const [excelFirstColNum, setExcelFirstColNum] = useState(1)
  const [excelLastColStr, setExcelLastColStr] = useState('')

  useEffect(() => {
    if (!open) {
      setExcelSheets(null)
      setExcelSelected([])
      setExcelListError(null)
      return
    }
    if (!filePath || !isExcelModernPath(filePath)) {
      setExcelSheets(null)
      setExcelSelected([])
      setExcelListError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await window.api.automation.importExcelListSheets(filePath)
      if (cancelled) return
      if (res.status !== 'success' || !res.data) {
        setExcelSheets([])
        setExcelSelected([])
        setExcelListError(res.message ?? t('automation.cases.import.excelListFailed'))
        return
      }
      setExcelListError(null)
      const sheets = res.data.sheets ?? []
      setExcelSheets(sheets)
      setExcelSelected(sheets.map(s => s.name))
    })()
    return () => {
      cancelled = true
    }
  }, [open, filePath])

  const toggleExcelSheet = (name: string) => {
    setExcelSelected(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))
  }

  const basename = (p: string) => p.replace(/^.*[/\\]/, '')

  const handlePick = async () => {
    const res = await window.api.automation.importPickFile()
    if (res.status === 'success' && res.data?.filePath) {
      setFilePath(res.data.filePath)
    }
  }

  const handleExcelAiImport = async () => {
    if (!filePath || excelSelected.length === 0) return
    setBusy(true)
    try {
      const mdRes = await window.api.automation.importExcelMarkdown({
        filePath,
        sheetNames: excelSelected,
        headerRow: excelHeaderRowNum,
        firstDataRow: parseOptionalPositiveInt(excelFirstDataRowStr),
        lastRow: parseOptionalPositiveInt(excelLastRowStr),
        firstCol: excelFirstColNum >= 1 ? excelFirstColNum : 1,
        lastCol: parseOptionalPositiveInt(excelLastColStr),
      })
      if (mdRes.status !== 'success' || !mdRes.data) {
        toast.error(mdRes.message ?? t('automation.cases.import.excelMarkdownFailed'))
        return
      }
      const mdWarn = mdRes.data.warnings ?? []
      const markdown = (mdRes.data.markdown ?? '').trim()
      if (!markdown) {
        toast.error(t('automation.cases.import.excelMarkdownEmpty'))
        setWarnings(mdWarn)
        return
      }
      const preamble = t('automation.cases.import.excelAiPreamble', { file: basename(filePath) })
      const inputText = `${preamble}\n\n${markdown}`
      const aiRes = await window.api.automation.ai.generateCases({ projectId, inputText })
      if (aiRes.status === 'success' && aiRes.data) {
        setPreviewCases(aiRes.data.cases)
        setWarnings([...mdWarn, ...(aiRes.data.warnings ?? [])])
      } else {
        toast.error(aiRes.message ?? 'AI failed')
        setWarnings(mdWarn)
      }
    } finally {
      setBusy(false)
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

  const handlePickScreenshots = async () => {
    const res = await window.api.automation.ai.pickScreenshots()
    const added = res.status === 'success' ? res.data?.filePaths : undefined
    if (added?.length) {
      setAiImagePaths(prev => {
        const merged = [...new Set([...prev, ...added])]
        return merged.slice(0, 5)
      })
    }
  }

  const handleAiGenerate = async () => {
    if (!aiInput.trim() && aiImagePaths.length === 0) return
    setBusy(true)
    try {
      const res = await window.api.automation.ai.generateCases({
        projectId,
        inputText: aiInput,
        imagePaths: aiImagePaths.length > 0 ? aiImagePaths : undefined,
      })
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
        setAiImagePaths([])
        setExcelSheets(null)
        setExcelSelected([])
        setExcelListError(null)
        setExcelHeaderRowNum(1)
        setExcelFirstDataRowStr('')
        setExcelLastRowStr('')
        setExcelFirstColNum(1)
        setExcelLastColStr('')
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
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
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
              <Button variant="outline" size="sm" type="button" onClick={handlePick} disabled={busy}>
                <FileUp className="size-4" />
                {t('automation.cases.import.pick')}
              </Button>
              <span className="truncate text-xs text-muted-foreground">{filePath ?? t('automation.cases.import.noFile')}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('automation.cases.import.legacyParseHint')}</Label>
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
              <Button size="sm" type="button" onClick={handleParse} disabled={!filePath || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t('automation.cases.import.parse')}
              </Button>
            </div>

            {filePath && isExcelModernPath(filePath) ? (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <p className="text-sm font-medium">{t('automation.cases.import.excelAiHeading')}</p>
                  <p className="text-xs text-muted-foreground">{t('automation.cases.import.excelAiDescription')}</p>
                </div>
                {excelSheets === null && !excelListError ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t('automation.cases.import.excelLoadingSheets')}
                  </p>
                ) : null}
                {excelListError ? (
                  <p className="text-xs text-destructive">{excelListError}</p>
                ) : null}
                {excelSheets && excelSheets.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs shrink-0">{t('automation.cases.import.excelSheetsLabel')}</Label>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 py-0 text-xs"
                        onClick={() => setExcelSelected(excelSheets.map(s => s.name))}
                        disabled={busy}
                      >
                        {t('automation.cases.import.excelSelectAll')}
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 py-0 text-xs"
                        onClick={() => setExcelSelected([])}
                        disabled={busy}
                      >
                        {t('automation.cases.import.excelClearSheets')}
                      </Button>
                    </div>
                    <ScrollArea className="h-[140px] rounded-md border p-2">
                      <ul className="space-y-2 pr-3">
                        {excelSheets.map((s, idx) => (
                          <li key={s.name} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`excel-sheet-${idx}`}
                              checked={excelSelected.includes(s.name)}
                              onChange={() => toggleExcelSheet(s.name)}
                              disabled={busy}
                              className="size-4 accent-primary"
                            />
                            <Label htmlFor={`excel-sheet-${idx}`} className="cursor-pointer font-normal text-xs leading-tight">
                              {s.name}
                            </Label>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('automation.cases.import.excelHeaderRow')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={excelHeaderRowNum}
                          onChange={e => setExcelHeaderRowNum(Math.max(1, Number(e.target.value) || 1))}
                          disabled={busy}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('automation.cases.import.excelFirstDataRow')}</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder={t('automation.cases.import.excelOptionalAuto')}
                          value={excelFirstDataRowStr}
                          onChange={e => setExcelFirstDataRowStr(e.target.value)}
                          disabled={busy}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('automation.cases.import.excelLastRow')}</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder={t('automation.cases.import.excelOptionalAuto')}
                          value={excelLastRowStr}
                          onChange={e => setExcelLastRowStr(e.target.value)}
                          disabled={busy}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('automation.cases.import.excelFirstCol')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={excelFirstColNum}
                          onChange={e => setExcelFirstColNum(Math.max(1, Number(e.target.value) || 1))}
                          disabled={busy}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">{t('automation.cases.import.excelLastCol')}</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder={t('automation.cases.import.excelOptionalAuto')}
                          value={excelLastColStr}
                          onChange={e => setExcelLastColStr(e.target.value)}
                          disabled={busy}
                          className="h-8 text-xs max-w-[200px]"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="inline-flex items-center gap-2"
                        onClick={handleExcelAiImport}
                        disabled={busy || excelSelected.length === 0}
                      >
                        {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Sparkles className="size-4 shrink-0" />}
                        {t('automation.cases.import.excelGenerateAi')}
                      </Button>
                    </div>
                  </>
                ) : excelSheets && excelSheets.length === 0 && !excelListError ? (
                  <p className="text-xs text-muted-foreground">{t('automation.cases.import.excelNoSheets')}</p>
                ) : null}
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="ai" className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">{t('automation.cases.import.aiScreenshots')}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" type="button" onClick={handlePickScreenshots} disabled={busy || aiImagePaths.length >= 5}>
                  <ImagePlus className="size-4" />
                  {t('automation.cases.import.pickScreenshots')}
                </Button>
                <span className="text-xs text-muted-foreground">{t('automation.cases.import.aiScreenshotHint')}</span>
              </div>
              {aiImagePaths.length > 0 ? (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {aiImagePaths.map(p => (
                    <li
                      key={p}
                      className="flex max-w-full items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs font-mono"
                      title={p}
                    >
                      <span className="max-w-[220px] truncate">{basename(p)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label={t('automation.cases.import.removeScreenshot')}
                        onClick={() => setAiImagePaths(prev => prev.filter(x => x !== p))}
                        disabled={busy}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{t('automation.cases.import.noScreenshots')}</p>
              )}
            </div>
            <Label className="text-xs">{t('automation.cases.import.aiPrompt')}</Label>
            <Textarea rows={8} value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder={t('automation.cases.import.aiPlaceholder')} />
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                onClick={handleAiGenerate}
                disabled={busy || (!aiInput.trim() && aiImagePaths.length === 0)}
              >
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
