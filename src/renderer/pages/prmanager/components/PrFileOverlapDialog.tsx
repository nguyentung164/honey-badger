'use client'

import { Copy, FileText, FileWarning, RefreshCw, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { buildGithubPrUrl, type PrFileOverlapCandidate } from '../collectPrFileOverlapCandidates'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE } from '../prManagerButtonStyles'
import { PR_MANAGER_REPO_GROUP_VISUAL } from '../prManagerRepoGroupVisual'

type OverlapData = {
  prResults: Array<{
    owner: string
    repo: string
    number: number
    fileCount: number
    error?: string
  }>
  clusters: Array<{
    owner: string
    repo: string
    prNumbers: number[]
    overlappingFiles: string[]
  }>
  analyzedCount: number
  failedCount: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  candidates: PrFileOverlapCandidate[]
  githubTokenOk: boolean
}

function candidateKey(c: { owner: string; repo: string; number: number }): string {
  return `${c.owner}/${c.repo}#${c.number}`
}

export function PrFileOverlapDialog({ open, onOpenChange, candidates, githubTokenOk }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<OverlapData | null>(null)
  const candidatesRef = useRef(candidates)
  candidatesRef.current = candidates

  const byKey = useMemo(() => {
    const m = new Map<string, PrFileOverlapCandidate>()
    for (const c of candidates) m.set(candidateKey(c), c)
    return m
  }, [candidates])

  const prListSpec = useMemo(() => candidates.map(c => `${c.owner}/${c.repo}#${c.number}`).join(';'), [candidates])

  const runAnalyze = useCallback(async () => {
    const list = candidatesRef.current
    if (list.length < 2 || !githubTokenOk) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await window.api.pr.prFileOverlap({
        items: list.map(c => ({ owner: c.owner, repo: c.repo, number: c.number })),
      })
      if (res.status === 'success' && res.data) {
        setData(res.data as OverlapData)
      } else {
        setError(res.message || t('prManager.fileOverlap.toastError'))
        setData(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('prManager.fileOverlap.toastError'))
    } finally {
      setLoading(false)
    }
  }, [githubTokenOk, t])

  useEffect(() => {
    if (!open) {
      setError(null)
      setData(null)
      setLoading(false)
      return
    }
    if (candidates.length < 2) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    if (!githubTokenOk) {
      setData(null)
      return
    }
    void runAnalyze()
  }, [open, prListSpec, githubTokenOk, runAnalyze, candidates.length])

  const openPrUrl = (owner: string, repo: string, num: number) => {
    const c = byKey.get(`${owner}/${repo}#${num}`)
    if (c?.prUrl) void window.api.system.open_external_url(c.prUrl)
    else void window.api.system.open_external_url(buildGithubPrUrl(owner, repo, num))
  }

  const copyFiles = async (paths: string[]) => {
    const text = paths.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('prManager.fileOverlap.toastCopied'))
    } catch {
      toast.error(t('prManager.fileOverlap.toastCopyFail'))
    }
  }

  const nPr = candidates.length
  const clusterItemValues = useMemo(() => data?.clusters.map((c, i) => `cl-${c.owner}/${c.repo}-${c.prNumbers.join('~')}-${i}`) ?? [], [data?.clusters])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-sans flex max-h-[min(90vh,880px)] min-h-0 w-[min(100vw-2rem,1000px)] flex-col gap-0 overflow-hidden border-0 bg-card p-0 shadow-xl sm:max-w-[min(100vw-2rem,1000px)]"
        showCloseButton={false}
        onPointerDownOutside={e => (loading ? e.preventDefault() : null)}
        onEscapeKeyDown={e => (loading ? e.preventDefault() : null)}
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-muted/30 py-1.5 pl-3 pr-1">
          <DialogHeader className="min-w-0 flex-1 space-y-0 p-0 text-left">
            <DialogTitle className="flex items-center gap-2 text-left text-sm font-medium leading-tight">
              <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-600/85 dark:text-amber-400/90" aria-hidden />
              {t('prManager.fileOverlap.title')}
            </DialogTitle>
          </DialogHeader>
          <DialogClose
            className={cn(
              'ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground -mr-px flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-80 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden [&_svg]:size-3.5',
              loading && 'pointer-events-none opacity-40'
            )}
            aria-label={t('prManager.fileOverlap.close')}
          >
            <X className="shrink-0" />
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {githubTokenOk ? null : (
            <Alert>
              <AlertTitle>{t('prManager.fileOverlap.noToken')}</AlertTitle>
              <AlertDescription>{t('prManager.fileOverlap.noTokenBody')}</AlertDescription>
            </Alert>
          )}

          {githubTokenOk && nPr < 2 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center">
              <XCircle className="h-10 w-10 text-muted-foreground/70" />
              <p className="max-w-sm text-sm text-muted-foreground">{t('prManager.fileOverlap.needTwoPrs')}</p>
            </div>
          ) : null}

          {githubTokenOk && nPr >= 2 && (
            <>
              {loading && (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-4">
                  <GlowLoader />
                  <p className="text-sm text-muted-foreground">{t('prManager.fileOverlap.loading', { n: nPr })}</p>
                </div>
              )}

              {error && !loading && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {data && !loading && !error && (
                <div className="space-y-3">
                  {data.clusters.length > 0 && (
                    <Accordion
                      key={clusterItemValues.length ? clusterItemValues.join('§') : 'none'}
                      type="multiple"
                      defaultValue={clusterItemValues}
                      className="w-full overflow-hidden rounded-lg border border-border/50 space-y-0"
                      variant="default"
                    >
                      {data.clusters.map((cl, i) => {
                        const itemId = `cl-${cl.owner}/${cl.repo}-${cl.prNumbers.join('~')}-${i}`
                        const vis = PR_MANAGER_REPO_GROUP_VISUAL[i % PR_MANAGER_REPO_GROUP_VISUAL.length]
                        return (
                          <AccordionItem key={itemId} value={itemId} className="border-b border-border/40 bg-transparent px-0 last:border-b-0">
                            <AccordionTrigger
                              className={cn(
                                'min-h-0 w-full items-center gap-2 rounded-none px-2.5 py-2 hover:no-underline hover:brightness-[1.01] dark:hover:brightness-[1.03]',
                                vis.rowHeader
                              )}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                <span className="min-w-0 flex-1 truncate text-sm font-bold leading-normal text-foreground">
                                  {cl.owner}/{cl.repo}
                                </span>
                                <span className="shrink-0 whitespace-nowrap text-sm font-normal tabular-nums text-muted-foreground">
                                  {t('prManager.fileOverlap.clusterTitle', {
                                    nPr: cl.prNumbers.length,
                                    nFiles: cl.overlappingFiles.length,
                                  })}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pt-2.5 pb-3">
                              <div className="space-y-3">
                                <div className="overflow-x-auto rounded-lg border border-border/50 bg-card/50 shadow-xs">
                                  <Table>
                                    <TableBody>
                                      {cl.prNumbers.map(num => {
                                        const c = byKey.get(`${cl.owner}/${cl.repo}#${num}`)
                                        const label = c?.title?.trim() || t('prManager.fileOverlap.untitled')
                                        const author = c?.author?.trim() || null
                                        return (
                                          <TableRow key={num} className="border-b border-border/35 text-sm last:border-0">
                                            <TableCell className="w-24 min-w-20 max-w-28 align-top py-1.5 pl-1.5 pr-1">
                                              <button
                                                type="button"
                                                onClick={e => {
                                                  e.stopPropagation()
                                                  void openPrUrl(cl.owner, cl.repo, num)
                                                }}
                                                className="text-left text-sm font-medium text-primary tabular-nums hover:underline"
                                              >
                                                #{num}
                                              </button>
                                            </TableCell>
                                            <TableCell className="min-w-0 px-2 py-2.5 align-top">
                                              <p className="line-clamp-2 w-full min-w-0 text-left text-sm leading-snug text-foreground" title={label}>
                                                {label}
                                              </p>
                                            </TableCell>
                                            <TableCell className="w-[7.5rem] min-w-28 max-w-[9rem] shrink-0 px-1.5 py-1.5 align-top text-sm text-muted-foreground sm:w-36 sm:min-w-32 sm:max-w-xs">
                                              <p className="line-clamp-1 break-words" title={author || undefined}>
                                                {author || '—'}
                                              </p>
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                                {cl.overlappingFiles.length > 0 ? (
                                  <div>
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs font-medium tracking-wide text-muted-foreground">{t('prManager.fileOverlap.overlapPaths')}</span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1 text-xs"
                                        onClick={e => {
                                          e.stopPropagation()
                                          void copyFiles(cl.overlappingFiles)
                                        }}
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                        {t('prManager.fileOverlap.copyList')}
                                      </Button>
                                    </div>
                                    <div
                                      className="max-h-44 divide-y divide-border/50 overflow-y-auto overscroll-y-contain rounded-lg border border-border/60 bg-muted/15 [scrollbar-gutter:stable]"
                                      onWheel={e => e.stopPropagation()}
                                    >
                                      {cl.overlappingFiles.map(f => (
                                        <div key={f} className="flex min-h-0 gap-2 bg-background/40 px-2 py-1.5 first:rounded-t-[inherit] last:rounded-b-[inherit]">
                                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                          <span className="min-w-0 break-words leading-relaxed text-foreground/90">{f}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )
                      })}
                    </Accordion>
                  )}

                  {data.prResults.some(p => p.error) ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{t('prManager.fileOverlap.errorsSection')}</p>
                      <ul className="space-y-1 rounded-md border border-rose-500/20 bg-rose-500/5 p-2 text-xs">
                        {data.prResults
                          .filter(p => p.error)
                          .map(p => (
                            <li key={`${p.owner}/${p.repo}#${p.number}`} className="text-rose-800 dark:text-rose-200">
                              {p.owner}/{p.repo}#{p.number}
                              {': '}
                              {p.error}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {githubTokenOk && nPr >= 2 && !loading ? (
          <DialogFooter className="shrink-0 flex-col-reverse gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('w-full sm:w-auto', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
              onClick={() => void runAnalyze()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('prManager.fileOverlap.refresh')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
