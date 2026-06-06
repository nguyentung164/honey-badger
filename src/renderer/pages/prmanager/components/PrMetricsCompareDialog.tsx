'use client'

import { ExternalLink, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import {
  buildComparePanels,
  buildLineMismatchFilenames,
  buildUnionFileSummary,
  loadComparePanelFiles,
  type ComparePanelLoadState,
  type ComparePanelSpec,
  type UnionFileRow,
} from './prMetricsCompareModel'
import { fileStatusBadgeClass } from './prChangedFileTypes'
import type { PrChangedFileView } from './prChangedFileTypes'
import { DiffPatchBlock } from './prDiffPatch'
import { githubBranchUrl } from './prBoardTableConstants'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  row: TrackedBranchRow
  repo: PrRepo
  prTemplates: PrCheckpointTemplate[]
  onOpenPrDetail: (repo: PrRepo, prNumber: number) => void
}

function openUrl(url: string): void {
  void window.api.system.open_external_url(url)
}

const LINE_MISMATCH_FILENAME = 'text-red-600 dark:text-red-400'
/** Badge lớn hơn trong bảng summary. */
const SUMMARY_METRIC_BADGE = 'h-6 border-0 px-2 text-xs font-medium shadow-none'
const SUMMARY_STATUS_BADGE = 'h-6 border-0 px-2 text-xs font-medium shadow-none capitalize'
const HEADER_BADGE = 'h-6 border-0 px-2 text-xs font-medium shadow-none'
const HEADER_CONTEXT_BADGE = 'h-7 border-0 px-2.5 text-sm font-normal shadow-none'
const HEADER_STATUS_BADGE = 'h-6 border-0 px-2 text-xs font-medium shadow-none capitalize'

export function PrMetricsCompareDialog({
  open,
  onOpenChange,
  row,
  repo,
  prTemplates,
  onOpenPrDetail,
}: Props) {
  const { t } = useTranslation()
  const panels = useMemo(() => buildComparePanels(row, prTemplates), [row, prTemplates])
  const [loading, setLoading] = useState(false)
  const [loadStates, setLoadStates] = useState<Map<string, ComparePanelLoadState>>(new Map())
  const [onlySharedFiles, setOnlySharedFiles] = useState(false)
  const [onlyLineMismatch, setOnlyLineMismatch] = useState(false)
  const [activeFilename, setActiveFilename] = useState<string | null>(null)
  const [fileCompareOpen, setFileCompareOpen] = useState(false)
  const diffScrollContainersRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const diffScrollSyncingRef = useRef(false)

  const unionRows = useMemo(() => buildUnionFileSummary(panels, loadStates), [panels, loadStates])

  const panelsWithPrCount = useMemo(() => panels.filter(p => p.prNumber != null).length, [panels])

  const lineMismatchFilenames = useMemo(
    () => buildLineMismatchFilenames(unionRows, panels),
    [unionRows, panels]
  )

  const displayedUnionRows = useMemo(() => {
    let rows = unionRows
    if (onlySharedFiles) rows = rows.filter(r => !r.isPartial)
    if (onlyLineMismatch) rows = rows.filter(r => lineMismatchFilenames.has(r.filename))
    return rows
  }, [unionRows, onlySharedFiles, onlyLineMismatch, lineMismatchFilenames])

  const summaryEmptyMessage = useMemo(() => {
    if (onlyLineMismatch && onlySharedFiles) {
      return t('prManager.metricsCompare.emptyLineMismatchSharedFiles')
    }
    if (onlyLineMismatch) return t('prManager.metricsCompare.emptyLineMismatchFiles')
    if (onlySharedFiles) return t('prManager.metricsCompare.emptySharedFiles')
    return t('prManager.metricsCompare.emptyFiles')
  }, [onlyLineMismatch, onlySharedFiles, t])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const next = new Map<string, ComparePanelLoadState>()
    for (const p of panels) {
      if (p.prNumber != null) {
        next.set(p.templateId, { templateId: p.templateId, loading: true, error: null, files: null })
      }
    }
    setLoadStates(prev => {
      const merged = new Map(prev)
      for (const [k, v] of next) merged.set(k, v)
      return merged
    })

    const result = await loadComparePanelFiles(repo, panels)
    setLoadStates(result)
    setLoading(false)
  }, [repo, panels])

  useEffect(() => {
    if (!open) return
    setOnlySharedFiles(false)
    setOnlyLineMismatch(false)
    setActiveFilename(null)
    setFileCompareOpen(false)
    diffScrollContainersRef.current.clear()
    void loadAll()
  }, [open, loadAll])

  useEffect(() => {
    if (!open) {
      setFileCompareOpen(false)
      setActiveFilename(null)
    }
  }, [open])

  useEffect(() => {
    diffScrollContainersRef.current.clear()
  }, [activeFilename])

  const handleOpenFileCompare = useCallback((filename: string) => {
    setActiveFilename(filename)
    setFileCompareOpen(true)
  }, [])

  const handleCloseFileCompare = useCallback(() => {
    setFileCompareOpen(false)
    setActiveFilename(null)
    diffScrollContainersRef.current.clear()
  }, [])

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (next) onOpenChange(true)
    },
    [onOpenChange]
  )

  const handleFileDialogOpenChange = useCallback((next: boolean) => {
    if (next) setFileCompareOpen(true)
  }, [])

  const registerDiffScrollContainer = useCallback((panelId: string, el: HTMLDivElement | null) => {
    if (!el) {
      diffScrollContainersRef.current.delete(panelId)
      return
    }
    diffScrollContainersRef.current.set(panelId, el)
  }, [])

  const handleDiffScrollSync = useCallback((sourcePanelId: string, scrollTop: number, scrollLeft: number) => {
    if (diffScrollSyncingRef.current) return
    diffScrollSyncingRef.current = true
    for (const [panelId, el] of diffScrollContainersRef.current) {
      if (panelId === sourcePanelId) continue
      el.scrollTop = scrollTop
      el.scrollLeft = scrollLeft
    }
    diffScrollSyncingRef.current = false
  }, [])

  const dialogChromeProps = {
    showCloseButton: false as const,
    onPointerDownOutside: (e: Event) => e.preventDefault(),
    onInteractOutside: (e: Event) => e.preventDefault(),
    onEscapeKeyDown: (e: Event) => e.preventDefault(),
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="flex max-w-[90vw]! h-[85vh]! flex-col gap-0 overflow-hidden p-0"
          {...dialogChromeProps}
        >
          <CompareDialogHeader
            title={t('prManager.metricsCompare.title')}
            row={row}
            loading={loading}
            onReload={() => void loadAll()}
            onClose={() => onOpenChange(false)}
            filterControls={
              panelsWithPrCount >= 2 ? (
                <>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={onlySharedFiles}
                      onCheckedChange={v => setOnlySharedFiles(v === true)}
                      aria-label={t('prManager.metricsCompare.onlySharedFiles')}
                    />
                    <span className="whitespace-nowrap">{t('prManager.metricsCompare.onlySharedFiles')}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={onlyLineMismatch}
                      onCheckedChange={v => setOnlyLineMismatch(v === true)}
                      aria-label={t('prManager.metricsCompare.onlyLineMismatchFiles')}
                    />
                    <span className="whitespace-nowrap">{t('prManager.metricsCompare.onlyLineMismatchFiles')}</span>
                  </label>
                </>
              ) : undefined
            }
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/15">
            <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
              {loading && unionRows.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <GlowLoader className="h-6 w-6" />
                </div>
              ) : unionRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('prManager.metricsCompare.emptyFiles')}</p>
              ) : displayedUnionRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">{summaryEmptyMessage}</p>
              ) : (
                <div className="h-full overflow-auto rounded-md border border-border/50">
                  <Table>
                    <TableHeader sticky>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 text-center text-xs">#</TableHead>
                        <TableHead className="min-w-[12rem] text-xs">{t('prManager.metricsCompare.fileColumn')}</TableHead>
                        {panels.map(p => (
                          <CompareSummaryColumnHead
                            key={p.templateId}
                            panel={p}
                            loadState={loadStates.get(p.templateId)}
                            loading={loading}
                          />
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedUnionRows.map((ur, index) => (
                        <UnionSummaryRow
                          key={ur.filename}
                          index={index + 1}
                          row={ur}
                          panels={panels}
                          lineMismatch={lineMismatchFilenames.has(ur.filename)}
                          onSelect={() => handleOpenFileCompare(ur.filename)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fileCompareOpen && activeFilename != null} onOpenChange={handleFileDialogOpenChange}>
        <DialogContent
          className="flex max-w-[95vw]! h-[90vh]! flex-col gap-0 overflow-hidden p-0"
          {...dialogChromeProps}
        >
          <CompareDialogHeader
            title={activeFilename ?? ''}
            row={row}
            loading={loading}
            onReload={() => void loadAll()}
            onClose={handleCloseFileCompare}
          />

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div
              className="grid h-full min-h-0 min-w-full gap-2 p-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(panels.length, 1)}, minmax(300px, 1fr))` }}
            >
              {panels.map(panel => (
                <CompareSingleFilePanel
                  key={panel.templateId}
                  panel={panel}
                  loadState={loadStates.get(panel.templateId)}
                  loading={loading}
                  filename={activeFilename ?? ''}
                  onOpenPrDetail={onOpenPrDetail}
                  repo={repo}
                  registerDiffScrollContainer={registerDiffScrollContainer}
                  onDiffScrollSync={handleDiffScrollSync}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CompareDialogHeader({
  title,
  row,
  loading,
  onReload,
  onClose,
  filterControls,
}: {
  title: string
  row: TrackedBranchRow
  loading: boolean
  onReload: () => void
  onClose: () => void
  filterControls?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <DialogHeader className="shrink-0 gap-0 border-b border-border/60 px-3 py-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <DialogTitle className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left text-sm font-semibold leading-none">
          <Badge variant="secondary" className={cn(HEADER_CONTEXT_BADGE, 'shrink-0 whitespace-nowrap')}>
            {row.repoOwner}/{row.repoRepo}
          </Badge>
          <Badge
            variant="secondary"
            asChild
            className={cn(HEADER_CONTEXT_BADGE, 'min-w-0 max-w-[14rem] shrink truncate hover:bg-secondary/80')}
          >
            <button
              type="button"
              className="min-w-0 max-w-full cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              title={row.branchName}
              onClick={() => openUrl(githubBranchUrl(row))}
            >
              {row.branchName}
            </button>
          </Badge>
          <span className="min-w-0 shrink truncate leading-none">{title}</span>
        </DialogTitle>
        {filterControls ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">{filterControls}</div>
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={loading}
                aria-label={t('prManager.metricsCompare.reloadAria')}
                onClick={onReload}
              >
                {loading ? <GlowLoader className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('prManager.metricsCompare.reload')}</TooltipContent>
          </Tooltip>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t('common.close')} onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </DialogHeader>
  )
}

function getPanelFileCount(panel: ComparePanelSpec, loadState: ComparePanelLoadState | undefined): number | null {
  if (panel.prNumber == null) return null
  if (loadState?.files) return loadState.files.length
  return panel.changedFiles
}

function CompareSummaryColumnHead({
  panel,
  loadState,
  loading,
}: {
  panel: ComparePanelSpec
  loadState: ComparePanelLoadState | undefined
  loading: boolean
}) {
  const { t } = useTranslation()
  const fileCount = getPanelFileCount(panel, loadState)
  const isPanelLoading = loadState?.loading || (loading && panel.prNumber != null && !loadState)

  return (
    <TableHead className="whitespace-nowrap text-center text-xs">
      <div className="inline-flex items-center justify-center gap-1">
        <span>
          {panel.templateCode}
          {panel.targetBranch ? (
            <span className="ml-1 font-normal text-muted-foreground">→ {panel.targetBranch}</span>
          ) : null}
        </span>
        {panel.prNumber != null ? (
          isPanelLoading && fileCount == null ? (
            <GlowLoader className="h-3 w-3 shrink-0" />
          ) : fileCount != null ? (
            <Badge
              variant="secondary"
              className={cn(HEADER_BADGE, 'shrink-0 tabular-nums')}
              title={t('prManager.metrics.files', { count: fileCount })}
            >
              {fileCount}
            </Badge>
          ) : null
        ) : null}
      </div>
    </TableHead>
  )
}

function SummaryPresenceCell({
  panel,
  pres,
}: {
  panel: ComparePanelSpec
  pres: UnionFileRow['presence'][string] | undefined
}) {
  const { t } = useTranslation()

  if (panel.prNumber == null) {
    return (
      <TableCell className="py-1.5 text-center align-middle">
        <Badge variant="secondary" className={cn(SUMMARY_METRIC_BADGE, 'max-w-full truncate font-normal tabular-nums')}>
          —
        </Badge>
      </TableCell>
    )
  }

  if (!pres?.present) {
    return (
      <TableCell className="py-1.5 text-center align-middle">
        <Badge className={cn(SUMMARY_STATUS_BADGE, 'bg-red-500/12 font-normal text-red-700 dark:text-red-300')}>
          {t('prManager.metricsCompare.absent')}
        </Badge>
      </TableCell>
    )
  }

  return (
    <TableCell className="py-1.5 text-center align-middle">
      <div className="inline-flex max-w-full items-center justify-center gap-1 whitespace-nowrap">
        <Badge className={cn(SUMMARY_STATUS_BADGE, fileStatusBadgeClass(pres.status ?? ''), 'max-w-[6rem] truncate')}>
          {pres.status ?? '—'}
        </Badge>
        {(pres.additions ?? 0) > 0 || (pres.deletions ?? 0) > 0 ? (
          <Badge variant="secondary" className={cn(SUMMARY_METRIC_BADGE, 'gap-0.5 tabular-nums')}>
            {(pres.additions ?? 0) > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-300">+{pres.additions}</span>
            ) : null}
            {(pres.deletions ?? 0) > 0 ? (
              <span className="text-rose-700 dark:text-rose-300">−{pres.deletions}</span>
            ) : null}
          </Badge>
        ) : null}
      </div>
    </TableCell>
  )
}

function UnionSummaryRow({
  index,
  row,
  panels,
  lineMismatch,
  onSelect,
}: {
  index: number
  row: UnionFileRow
  panels: ComparePanelSpec[]
  lineMismatch?: boolean
  onSelect: () => void
}) {
  return (
    <TableRow
      className={cn('cursor-pointer text-xs hover:bg-muted/40', row.isPartial && 'bg-amber-500/[0.06] dark:bg-amber-500/[0.08]')}
      onClick={onSelect}
    >
      <TableCell className="w-10 py-1.5 text-center align-middle tabular-nums text-muted-foreground">{index}</TableCell>
      <TableCell className="max-w-[20rem] py-1.5 align-middle">
        <span
          className={cn('block min-w-0 truncate font-mono text-xs leading-none', lineMismatch && LINE_MISMATCH_FILENAME)}
          title={row.filename}
        >
          {row.filename}
        </span>
      </TableCell>
      {panels.map(p => (
        <SummaryPresenceCell key={p.templateId} panel={p} pres={row.presence[p.templateId]} />
      ))}
    </TableRow>
  )
}

function CompareSingleFilePanel({
  panel,
  loadState,
  loading,
  filename,
  onOpenPrDetail,
  repo,
  registerDiffScrollContainer,
  onDiffScrollSync,
}: {
  panel: ComparePanelSpec
  loadState: ComparePanelLoadState | undefined
  loading: boolean
  filename: string
  onOpenPrDetail: (repo: PrRepo, prNumber: number) => void
  repo: PrRepo
  registerDiffScrollContainer: (panelId: string, el: HTMLDivElement | null) => void
  onDiffScrollSync: (sourcePanelId: string, scrollTop: number, scrollLeft: number) => void
}) {
  const { t } = useTranslation()
  const isLoading = loadState?.loading || (loading && panel.prNumber != null && !loadState)
  const file = useMemo(() => loadState?.files?.find(f => f.filename === filename) ?? null, [loadState?.files, filename])

  return (
    <div className="flex min-h-0 min-w-[300px] flex-col overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/20 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <span className="truncate text-xs font-semibold leading-none">{panel.templateCode}</span>
          {panel.prNumber != null ? (
            <>
              <Badge variant="secondary" className={cn(HEADER_BADGE, 'shrink-0 font-normal')}>
                PR
              </Badge>
              <Badge variant="secondary" className={cn(HEADER_BADGE, 'shrink-0 tabular-nums')}>
                #{panel.prNumber}
              </Badge>
              {isLoading ? (
                <GlowLoader className="h-3.5 w-3.5 shrink-0" />
              ) : file ? (
                <>
                  <Badge className={cn(HEADER_STATUS_BADGE, 'shrink-0', fileStatusBadgeClass(file.status))}>
                    {file.status}
                  </Badge>
                  {file.patchTruncated ? (
                    <Badge variant="secondary" className={cn(HEADER_BADGE, 'shrink-0 font-normal text-amber-800 dark:text-amber-200')}>
                      {t('prManager.detail.patchTruncated')}
                    </Badge>
                  ) : null}
                  {file.additions > 0 || file.deletions > 0 ? (
                    <Badge variant="secondary" className={cn(HEADER_BADGE, 'shrink-0 gap-0.5 tabular-nums')}>
                      {file.additions > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-300">+{file.additions}</span>
                      ) : null}
                      {file.deletions > 0 ? (
                        <span className="text-rose-700 dark:text-rose-300">−{file.deletions}</span>
                      ) : null}
                    </Badge>
                  ) : null}
                </>
              ) : loadState?.error ? null : (
                <Badge className={cn(HEADER_STATUS_BADGE, 'shrink-0 bg-red-500/12 font-normal text-red-700 dark:text-red-300')}>
                  {t('prManager.metricsCompare.absent')}
                </Badge>
              )}
            </>
          ) : panel.targetBranch ? (
            <Badge variant="secondary" className={cn(HEADER_BADGE, 'max-w-full truncate font-normal')}>
              → {panel.targetBranch}
            </Badge>
          ) : null}
        </div>
        {panel.prNumber != null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label={t('prManager.metricsCompare.openPrDetail')}
                onClick={() => onOpenPrDetail(repo, panel.prNumber!)}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{t('prManager.metricsCompare.openPrDetail')}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {panel.prNumber == null ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {t('prManager.metricsCompare.noPr', { branch: panel.targetBranch || panel.templateCode })}
          </p>
        ) : loadState?.error ? (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{loadState.error}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <GlowLoader className="h-6 w-6" />
          </div>
        ) : !file ? (
          <div className="rounded-md bg-red-500/8 px-2 py-2.5 text-center text-xs text-red-800 dark:text-red-200">
            {t('prManager.metricsCompare.noFileInPanel', { file: filename })}
          </div>
        ) : (
          <SingleFileDiffBody
            file={file}
            panelId={panel.templateId}
            registerDiffScrollContainer={registerDiffScrollContainer}
            onDiffScrollSync={onDiffScrollSync}
          />
        )}
      </div>
    </div>
  )
}

function SingleFileDiffBody({
  file,
  panelId,
  registerDiffScrollContainer,
  onDiffScrollSync,
}: {
  file: PrChangedFileView
  panelId: string
  registerDiffScrollContainer: (panelId: string, el: HTMLDivElement | null) => void
  onDiffScrollSync: (sourcePanelId: string, scrollTop: number, scrollLeft: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card/30">
      <div className="p-1.5">
        {!file.patch ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {t('prManager.detail.noPatch')}{' '}
            {file.blobUrl ? (
              <button type="button" className="underline" onClick={() => openUrl(file.blobUrl!)}>
                {t('prManager.detail.onGithub')}
              </button>
            ) : null}
          </p>
        ) : (
          <DiffPatchBlock
            patch={file.patch}
            maxHeightClass="max-h-[min(65vh,520px)]"
            scrollContainerRef={el => registerDiffScrollContainer(panelId, el)}
            onScrollSync={(top, left) => onDiffScrollSync(panelId, top, left)}
          />
        )}
      </div>
    </div>
  )
}
