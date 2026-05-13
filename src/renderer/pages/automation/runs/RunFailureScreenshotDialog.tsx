import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Pin, PinOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { failureHighlightNumericIndex, isFailureHighlightPath } from './runScreenshotGallery'

function fileNameLabel(p: string): string {
  const leaf = p.split(/[/\\]/).filter(Boolean).pop()
  return leaf?.trim() || p
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  runId: string
  /** Paths từ Playwright report */
  paths: string[]
}

/** `undefined` = đang tải, `null` = lỗi, string = data URL */
type PreviewEntry = string | null | undefined

export function RunFailureScreenshotDialog({ open, onOpenChange, projectId, runId, paths }: Props) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [previewByIndex, setPreviewByIndex] = useState<Record<number, PreviewEntry>>({})
  const [thumbStripPinned, setThumbStripPinned] = useState(false)

  useEffect(() => {
    if (open) {
      setIndex(0)
      setThumbStripPinned(false)
    }
  }, [open, paths])

  useEffect(() => {
    if (!open || paths.length === 0) {
      setPreviewByIndex({})
      return
    }
    let cancelled = false
    setPreviewByIndex({})
    paths.forEach((screenshotPath, i) => {
      void window.api.automation.run
        .readScreenshotPreview({ screenshotPath, projectId, runId })
        .then(res => {
          if (cancelled) return
          const ok = res.status === 'success' && res.data?.dataUrl
          setPreviewByIndex(prev => ({ ...prev, [i]: ok ? res.data!.dataUrl : null }))
          if (!ok && paths.length === 1) {
            toast.error(res.message ?? t('automation.runs.screenshotLoadError'))
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [open, paths, projectId, runId, t])

  const safeIndex = paths.length > 0 ? Math.min(Math.max(0, index), paths.length - 1) : 0
  const currentPath = paths.length > 0 ? paths[safeIndex] : ''
  const currentPreview = previewByIndex[safeIndex]

  const handleOpenExternally = async () => {
    if (!currentPath) return
    const res = await window.api.automation.run.openScreenshot({
      screenshotPath: currentPath,
      projectId,
      runId,
    })
    if (res.status !== 'success') toast.error(res.message ?? 'Open screenshot failed')
  }

  const canNavigate = paths.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          'flex max-h-[min(96dvh,1200px)] w-[min(96vw,1760px)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0',
          'h-[min(92dvh,1100px)] sm:max-w-[min(96vw,1760px)]'
        )}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b px-4 py-3 pr-12">
          <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle className="text-base">{t('automation.runs.previewScreenshot')}</DialogTitle>
              <p className="text-xs text-muted-foreground">{t('automation.runs.screenshotPlaywrightHint')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void handleOpenExternally()}
              disabled={!currentPath}
            >
              <ExternalLink className="mr-1 size-4 shrink-0" />
              {t('automation.runs.openScreenshotExternally')}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-4">
          <div className="relative flex min-h-[min(52dvh,640px)] flex-1 overflow-hidden rounded-md border bg-muted/30">
            {paths.length > 0 ? (
              <div className="absolute inset-x-0 top-0 z-20 border-b border-border/50 bg-background/80 px-1 py-1.5 backdrop-blur-sm sm:px-2">
                <div className="flex min-h-8 items-center gap-1.5">
                  {canNavigate ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="size-8 shrink-0 shadow-sm"
                        disabled={safeIndex <= 0}
                        onClick={() => setIndex(i => Math.max(0, i - 1))}
                        aria-label={t('automation.runs.screenshotPrevious')}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span
                        className="min-w-0 flex-1 truncate text-center font-mono text-[11px] leading-tight text-muted-foreground sm:text-xs"
                        title={
                          fileNameLabel(currentPath) +
                          (isFailureHighlightPath(currentPath)
                            ? ` (${t('automation.runs.failureHighlightIndexLabel', { n: failureHighlightNumericIndex(currentPath) })})`
                            : '') +
                          ` (${safeIndex + 1}/${paths.length})`
                        }
                      >
                        {fileNameLabel(currentPath)}
                        {isFailureHighlightPath(currentPath)
                          ? ` (${t('automation.runs.failureHighlightIndexLabel', { n: failureHighlightNumericIndex(currentPath) })})`
                          : ''}{' '}
                        <span className="whitespace-nowrap text-muted-foreground/80">
                          ({safeIndex + 1}/{paths.length})
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="size-8 shrink-0 shadow-sm"
                        disabled={safeIndex >= paths.length - 1}
                        onClick={() => setIndex(i => Math.min(paths.length - 1, i + 1))}
                        aria-label={t('automation.runs.screenshotNext')}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <span
                      className="w-full truncate px-2 text-center font-mono text-[11px] leading-tight text-muted-foreground sm:text-xs"
                      title={fileNameLabel(currentPath)}
                    >
                      {fileNameLabel(currentPath)}
                      {isFailureHighlightPath(currentPath)
                        ? ` (${t('automation.runs.failureHighlightIndexLabel', { n: failureHighlightNumericIndex(currentPath) })})`
                        : ''}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            <div
              className={cn(
                'flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 pb-2',
                paths.length > 0 && 'pt-12'
              )}
            >
              {currentPreview === undefined ? (
                <Loader2 className="size-10 animate-spin text-muted-foreground" aria-hidden />
              ) : currentPreview === null ? (
                <span className="text-sm text-muted-foreground">{t('automation.runs.screenshotLoadError')}</span>
              ) : (
                <img
                  src={currentPreview}
                  alt=""
                  className="max-h-[min(calc(96dvh-14rem),82dvh)] w-auto max-w-full object-contain"
                />
              )}
            </div>

            {paths.length > 1 ? (
              <div
                className={cn(
                  'absolute inset-x-0 bottom-0 z-10 border-t border-border/40 bg-background/50 px-2 pb-2 pt-1.5 backdrop-blur-[1px] transition-[opacity,backdrop-filter] duration-300',
                  thumbStripPinned
                    ? 'opacity-100 backdrop-blur-sm'
                    : 'opacity-[0.34] hover:opacity-100 hover:backdrop-blur-md'
                )}
              >
                <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
                  {t('automation.runs.screenshotThumbnailStrip')}
                </p>
                <div className="flex items-center gap-2">
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-8 shrink-0 shadow-sm"
                        aria-pressed={thumbStripPinned}
                        onClick={() => setThumbStripPinned(p => !p)}
                        aria-label={
                          thumbStripPinned
                            ? t('automation.runs.screenshotThumbnailStripPinOffAria')
                            : t('automation.runs.screenshotThumbnailStripPinOnAria')
                        }
                      >
                        {thumbStripPinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {thumbStripPinned
                        ? t('automation.runs.screenshotThumbnailStripPinOffAria')
                        : t('automation.runs.screenshotThumbnailStripPinOnAria')}
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex min-h-20 min-w-0 flex-1 justify-center gap-2 overflow-x-auto overflow-y-hidden py-0.5">
                    {paths.map((p, i) => {
                      const thumb = previewByIndex[i]
                      return (
                        <button
                          key={`${p}-${i}`}
                          type="button"
                          onClick={() => setIndex(i)}
                          className={cn(
                            'relative h-20 w-20 shrink-0 overflow-hidden rounded-md border-2 bg-muted/60 outline-none transition-[box-shadow,opacity,border-color] duration-150',
                            'hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                            safeIndex === i
                              ? 'border-primary opacity-100 shadow-md ring-2 ring-primary/20'
                              : 'border-transparent opacity-90 hover:border-muted-foreground/40'
                          )}
                          aria-label={t('automation.runs.screenshotThumbnailPick', { n: i + 1, name: fileNameLabel(p) })}
                          aria-current={safeIndex === i ? 'true' : undefined}
                        >
                          {thumb === undefined ? (
                            <div className="flex h-full w-full items-center justify-center">
                              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                            </div>
                          ) : thumb === null ? (
                            <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] text-muted-foreground">
                              —
                            </div>
                          ) : (
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
