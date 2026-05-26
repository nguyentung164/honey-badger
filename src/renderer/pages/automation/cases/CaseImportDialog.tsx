import { AlignLeft, FileText, FileUp, ImagePlus, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { type ClipboardEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
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
import { cn } from '@/lib/utils'

const AI_IMPORT_MAX_FILES = 5
const IMAGE_FILE_EXT_RE = /\.(png|jpe?g|webp|gif)$/i

function isImageFileLike(f: File): boolean {
  return (typeof f.type === 'string' && f.type.startsWith('image/')) || IMAGE_FILE_EXT_RE.test(f.name)
}

function fileWithDiskPath(f: File): f is File & { path: string } {
  const p = (f as File & { path?: string }).path
  return typeof p === 'string' && p.length > 0
}

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
  /** Mọi case import sẽ gán vào flow này. */
  defaultFlowId?: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}

export function CaseImportDialog({ projectId, defaultFlowId, open, onOpenChange, onImported }: Props) {
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
  /** Cảnh báo từ lần xuất JSON Excel gần nhất — ghép vào kết quả AI khi bấm Generate. */
  const [excelExportStagingWarnings, setExcelExportStagingWarnings] = useState<string[]>([])
  /** Tab chính của dialog: file (parse / Excel) vs AI prompt. */
  const [importMainTab, setImportMainTab] = useState<'file' | 'ai'>('file')
  const [aiScreenshotPreviews, setAiScreenshotPreviews] = useState<Record<string, string>>({})
  const [screenshotDropDepth, setScreenshotDropDepth] = useState(0)
  const aiImageCountRef = useRef(0)
  const screenshotDropRef = useRef<HTMLElement | null>(null)
  aiImageCountRef.current = aiImagePaths.length

  useEffect(() => {
    if (!open) {
      setAiScreenshotPreviews({})
      setScreenshotDropDepth(0)
      setExcelExportStagingWarnings([])
      setImportMainTab('file')
    }
  }, [open])

  useEffect(() => {
    if (!open || aiImagePaths.length === 0) {
      if (open && aiImagePaths.length === 0) setAiScreenshotPreviews({})
      return
    }
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const p of aiImagePaths) {
        if (cancelled) return
        const res = await window.api.automation.ai.readImportImagePreview(p)
        if (res.status === 'success' && res.data?.dataUrl) next[p] = res.data.dataUrl
      }
      if (!cancelled) setAiScreenshotPreviews(next)
    })()
    return () => {
      cancelled = true
    }
  }, [open, aiImagePaths.join('\0')])

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

  useEffect(() => {
    setExcelExportStagingWarnings([])
  }, [filePath])

  const toggleExcelSheet = (name: string) => {
    setExcelSelected(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))
  }

  const basename = (p: string) => p.replace(/^.*[/\\]/, '')

  const showImportImageError = useCallback(
    (code?: string) => {
      if (code === 'CLIPBOARD_EMPTY') toast.info(t('automation.cases.import.clipboardEmpty'))
      else if (code === 'IMAGE_TOO_LARGE') toast.error(t('automation.cases.import.importImageTooLarge'))
      else if (code === 'UNSUPPORTED_IMAGE') toast.error(t('automation.cases.import.unsupportedImage'))
      else if (code) toast.error(code)
      else toast.error(t('automation.cases.import.importImageFailed'))
    },
    [t]
  )

  const mergeScreenshotPaths = (incoming: string[]) => {
    if (incoming.length === 0) return
    setAiImagePaths(prev => {
      const merged = [...new Set([...prev, ...incoming])]
      const trimmed = merged.slice(0, AI_IMPORT_MAX_FILES)
      if (merged.length > trimmed.length) {
        queueMicrotask(() => toast.info(t('automation.cases.import.maxScreenshotsReached')))
      }
      return trimmed
    })
  }

  const tryAppendOneImportImage = async (opts?: { bytes?: ArrayBuffer }) => {
    if (aiImageCountRef.current >= AI_IMPORT_MAX_FILES) {
      toast.info(t('automation.cases.import.maxScreenshotsReached'))
      return false
    }
    const res = await window.api.automation.ai.saveImportImage(opts?.bytes != null ? { bytes: opts.bytes } : {})
    if (res.status !== 'success' || !res.data?.filePath) {
      showImportImageError(res.message)
      return false
    }
    const fp = res.data.filePath
    setAiImagePaths(prev => {
      if (prev.includes(fp)) return prev
      if (prev.length >= AI_IMPORT_MAX_FILES) {
        queueMicrotask(() => toast.info(t('automation.cases.import.maxScreenshotsReached')))
        return prev
      }
      return [...prev, fp]
    })
    return true
  }

  const handlePickScreenshots = async () => {
    const res = await window.api.automation.ai.pickScreenshots()
    const added = res.status === 'success' ? res.data?.filePaths : undefined
    if (added?.length) mergeScreenshotPaths(added)
  }

  const handleScreenshotZonePaste = async (e: ClipboardEvent<HTMLDivElement>) => {
    if (busy) return
    if (aiImageCountRef.current >= AI_IMPORT_MAX_FILES) {
      e.preventDefault()
      toast.info(t('automation.cases.import.maxScreenshotsReached'))
      return
    }
    const cd = e.clipboardData
    if (!cd) return

    const appendFromImageFile = async (file: File | null): Promise<boolean> => {
      if (!file || !isImageFileLike(file)) return false
      e.preventDefault()
      const buf = await file.arrayBuffer()
      return tryAppendOneImportImage({ bytes: buf })
    }

    const { files } = cd
    if (files?.length) {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (!isImageFileLike(f)) continue
        if (await appendFromImageFile(f)) return
      }
    }
    for (let i = 0; i < cd.items.length; i++) {
      const item = cd.items[i]
      if (item.kind === 'file') {
        if (await appendFromImageFile(item.getAsFile())) return
      }
    }

    e.preventDefault()
    await tryAppendOneImportImage()
  }

  const ingestDroppedScreenshotFiles = async (fileList: File[]) => {
    if (busy) return
    const candidates = [...fileList].filter(isImageFileLike)
    if (candidates.length === 0) {
      toast.info(t('automation.cases.import.dropNotImage'))
      return
    }
    const collected: string[] = []
    let room = AI_IMPORT_MAX_FILES - aiImagePaths.length
    for (const f of candidates) {
      if (room <= 0) break
      if (fileWithDiskPath(f) && IMAGE_FILE_EXT_RE.test(f.path)) {
        collected.push(f.path)
        room--
        continue
      }
      const buf = await f.arrayBuffer()
      const res = await window.api.automation.ai.saveImportImage({ bytes: buf })
      if (res.status === 'success' && res.data?.filePath) {
        collected.push(res.data.filePath)
        room--
      } else if (res.message) showImportImageError(res.message)
    }
    if (collected.length > 0) mergeScreenshotPaths(collected)
  }

  const handleScreenshotDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setScreenshotDropDepth(0)
    void ingestDroppedScreenshotFiles([...e.dataTransfer.files])
  }

  const handlePick = async () => {
    const res = await window.api.automation.importPickFile()
    if (res.status === 'success' && res.data?.filePath) {
      setFilePath(res.data.filePath)
    }
  }

  const handleExcelExportJson = async () => {
    if (!filePath || excelSelected.length === 0) return
    setBusy(true)
    try {
      const jsonRes = await window.api.automation.importExcelJson({
        filePath,
        sheetNames: excelSelected,
        headerRow: excelHeaderRowNum,
        firstDataRow: parseOptionalPositiveInt(excelFirstDataRowStr),
        lastRow: parseOptionalPositiveInt(excelLastRowStr),
        firstCol: excelFirstColNum >= 1 ? excelFirstColNum : 1,
        lastCol: parseOptionalPositiveInt(excelLastColStr),
      })
      if (jsonRes.status !== 'success' || !jsonRes.data) {
        toast.error(jsonRes.message ?? t('automation.cases.import.excelJsonFailed'))
        return
      }
      const exportWarn = jsonRes.data.warnings ?? []
      const json = (jsonRes.data.json ?? '').trim()
      if (!json) {
        toast.error(t('automation.cases.import.excelJsonEmpty'))
        setWarnings(exportWarn)
        setExcelExportStagingWarnings([])
        return
      }
      const preamble = t('automation.cases.import.excelAiPreamble', { file: basename(filePath) })
      const inputText = `${preamble}\n\n\`\`\`json\n${json}\n\`\`\``
      setExcelExportStagingWarnings(exportWarn)
      setWarnings(exportWarn)
      setAiInput(inputText)
      setImportMainTab('ai')
      toast.success(t('automation.cases.import.excelJsonExportedToast'))
    } finally {
      setBusy(false)
    }
  }

  const handleExcelExportPlainText = async () => {
    if (!filePath || excelSelected.length === 0) return
    setBusy(true)
    try {
      const plainRes = await window.api.automation.importExcelPlainText({
        filePath,
        sheetNames: excelSelected,
        headerRow: excelHeaderRowNum,
        firstDataRow: parseOptionalPositiveInt(excelFirstDataRowStr),
        lastRow: parseOptionalPositiveInt(excelLastRowStr),
        firstCol: excelFirstColNum >= 1 ? excelFirstColNum : 1,
        lastCol: parseOptionalPositiveInt(excelLastColStr),
      })
      if (plainRes.status !== 'success' || !plainRes.data) {
        toast.error(plainRes.message ?? t('automation.cases.import.excelPlainFailed'))
        return
      }
      const exportWarn = plainRes.data.warnings ?? []
      const text = (plainRes.data.text ?? '').trim()
      if (!text) {
        toast.error(t('automation.cases.import.excelPlainEmpty'))
        setWarnings(exportWarn)
        setExcelExportStagingWarnings([])
        return
      }
      const preamble = t('automation.cases.import.excelPlainAiPreamble', { file: basename(filePath) })
      const inputText = `${preamble}\n\n${text}`
      setExcelExportStagingWarnings(exportWarn)
      setWarnings(exportWarn)
      setAiInput(inputText)
      setImportMainTab('ai')
      toast.success(t('automation.cases.import.excelPlainExportedToast'))
    } finally {
      setBusy(false)
    }
  }

  const handleExcelGenerateWithAi = async () => {
    if (!aiInput.trim()) {
      toast.info(t('automation.cases.import.excelGenerateNeedPrompt'))
      return
    }
    setBusy(true)
    try {
      const aiRes = await window.api.automation.ai.generateCases({ projectId, inputText: aiInput })
      if (aiRes.status === 'success' && aiRes.data) {
        setPreviewCases(aiRes.data.cases)
        setWarnings([...excelExportStagingWarnings, ...(aiRes.data.warnings ?? [])])
      } else {
        toast.error(aiRes.message ?? 'AI failed')
        setWarnings(excelExportStagingWarnings)
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
    if (!defaultFlowId) {
      toast.info(t('automation.cases.import.needFlow'))
      return
    }
    setBusy(true)
    try {
      const casesWithFlow = previewCases.map(c => ({ ...c, flowId: defaultFlowId }))
      const res = await window.api.automation.case.bulkCreate({ projectId, cases: casesWithFlow })
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
        setExcelExportStagingWarnings([])
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
      <DialogContent className="max-h-[85vh] max-w-4xl! overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('automation.cases.import.title')}</DialogTitle>
        </DialogHeader>
        <Tabs value={importMainTab} onValueChange={v => setImportMainTab(v === 'ai' ? 'ai' : 'file')}>
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
                {excelListError ? <p className="text-xs text-destructive">{excelListError}</p> : null}
                {excelSheets && excelSheets.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
                      <Label className="text-xs shrink-0">{t('automation.cases.import.excelSheetsLabel')}</Label>
                      <div className="flex shrink-0 items-center gap-2">
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
                        <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0 text-xs" onClick={() => setExcelSelected([])} disabled={busy}>
                          {t('automation.cases.import.excelClearSheets')}
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[100px] rounded-md border p-2">
                      <div className="grid grid-cols-5 gap-x-2 gap-y-2.5 pr-3">
                        {excelSheets.map((s, idx) => (
                          <div key={s.name} className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="checkbox"
                              id={`excel-sheet-${idx}`}
                              checked={excelSelected.includes(s.name)}
                              onChange={() => toggleExcelSheet(s.name)}
                              disabled={busy}
                              className="size-3.5 shrink-0 accent-primary"
                            />
                            <Label htmlFor={`excel-sheet-${idx}`} className="min-w-0 flex-1 cursor-pointer truncate font-normal text-xs leading-tight" title={s.name}>
                              {s.name}
                            </Label>
                          </div>
                        ))}
                      </div>
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
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inline-flex items-center gap-2"
                        onClick={handleExcelExportJson}
                        disabled={busy || excelSelected.length === 0}
                      >
                        {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <FileText className="size-4 shrink-0" />}
                        {t('automation.cases.import.excelExportJson')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inline-flex items-center gap-2"
                        onClick={handleExcelExportPlainText}
                        disabled={busy || excelSelected.length === 0}
                      >
                        {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <AlignLeft className="size-4 shrink-0" />}
                        {t('automation.cases.import.excelExportPlain')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="inline-flex items-center gap-2"
                        onClick={handleExcelGenerateWithAi}
                        disabled={busy || !aiInput.trim()}
                      >
                        {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Sparkles className="size-4 shrink-0" />}
                        {t('automation.cases.import.excelGenerateWithAi')}
                      </Button>
                    </div>
                  </>
                ) : excelSheets && excelSheets.length === 0 && !excelListError ? (
                  <p className="text-xs text-muted-foreground">{t('automation.cases.import.excelNoSheets')}</p>
                ) : null}
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="ai" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">{t('automation.cases.import.aiScreenshots')}</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t('automation.cases.import.screenshotCount', { current: aiImagePaths.length, max: AI_IMPORT_MAX_FILES })}
                </span>
              </div>

              <section
                ref={screenshotDropRef}
                tabIndex={-1}
                onMouseDown={e => {
                  if (e.button !== 0) return
                  if ((e.target as HTMLElement).closest('button')) return
                  screenshotDropRef.current?.focus()
                }}
                aria-label={t('automation.cases.import.screenshotDropZoneAria')}
                onPaste={handleScreenshotZonePaste}
                onDragEnter={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setScreenshotDropDepth(d => d + 1)
                }}
                onDragLeave={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setScreenshotDropDepth(d => Math.max(0, d - 1))
                }}
                onDragOver={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={handleScreenshotDrop}
                className={cn(
                  'rounded-xl border-2 border-dashed p-4 sm:p-5 transition-colors outline-none',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40',
                  screenshotDropDepth > 0 ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 bg-muted/25 hover:border-muted-foreground/35',
                  busy && 'pointer-events-none opacity-50'
                )}
              >
                <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border">
                    <Upload className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-medium leading-snug">{t('automation.cases.import.aiScreenshotDropTitle')}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t('automation.cases.import.aiScreenshotDropHint')}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground/90">{t('automation.cases.import.aiScreenshotHint')}</p>
                    <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={handlePickScreenshots}
                        disabled={busy || aiImagePaths.length >= AI_IMPORT_MAX_FILES}
                        className="gap-2"
                      >
                        <ImagePlus className="size-4 shrink-0" />
                        {t('automation.cases.import.pickScreenshots')}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              {aiImagePaths.length > 0 ? (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" aria-label={t('automation.cases.import.screenshotThumbnailsAria')}>
                  {aiImagePaths.map(p => (
                    <li key={p} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/20 shadow-sm">
                      {aiScreenshotPreviews[p] ? (
                        <img src={aiScreenshotPreviews[p]} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center p-2">
                          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-6 pt-4 text-[10px] font-medium text-white">
                        {basename(p)}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-1 top-1 size-7 opacity-95 shadow-sm hover:opacity-100"
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
                <p className="text-center text-xs text-muted-foreground">{t('automation.cases.import.noScreenshots')}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="case-import-ai-prompt" className="text-xs font-medium">
                  {t('automation.cases.import.aiPrompt')}
                </Label>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
                  {t('automation.cases.import.aiPromptCharCount', { count: aiInput.length })}
                </span>
              </div>
              <Textarea
                id="case-import-ai-prompt"
                rows={8}
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                placeholder={t('automation.cases.import.aiPlaceholder')}
                className="min-h-[160px] max-h-[min(40vh,320px)] resize-y overflow-y-auto overflow-x-hidden text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" type="button" onClick={handleAiGenerate} disabled={busy || (!aiInput.trim() && aiImagePaths.length === 0)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t('automation.cases.import.aiGenerate')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {warnings.length > 0 ? (
          <div className="relative rounded-md border border-amber-500/40 bg-amber-500/5 p-2 pr-10 pt-1 text-xs">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-0.5 size-8 shrink-0 text-muted-foreground hover:bg-amber-500/15 hover:text-foreground"
              onClick={() => setWarnings([])}
              aria-label={t('automation.common.close')}
            >
              <X className="size-3.5" />
            </Button>
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
