'use client'

import { Bot, Copy, Loader2, SendHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import type { PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import {
  buildTrackedContextJson,
  parseAiIntent,
  parseHeuristicCreatePr,
  type ResolveBranchCandidate,
  type ResolveCreatePrErr,
  type ResolveCreatePrOk,
  resolveCreatePrTarget,
} from '../prAiAssistResolve'
import { buildIssueStylePrTitle, pickIssueKeyAndVersion } from '../utils/buildIssuePrTitle'

export type PrAiAssistOpenCreatePrPayload = {
  repoId: string
  head: string
  base: string
  suggestedTitle?: string
  suggestedBody?: string
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Lưu chat theo user + project trong DB task. */
  projectId: string | null
  userId: string | null
  repos: PrRepo[]
  tracked: TrackedBranchRow[]
  githubTokenOk: boolean
  onOpenCreatePrDialog: (payload: PrAiAssistOpenCreatePrPayload) => void
  onOpenBulkCreatePrDialog: (payload: { trackedRowIds: string[] }) => void
}

type ChatAction = { kind: 'openCreatePr'; payload: PrAiAssistOpenCreatePrPayload } | { kind: 'openBulkCreatePr'; trackedRowIds: string[] }

type ChatLine =
  | { clientKey: string; role: 'user'; text: string; createdAtMs?: number }
  | { clientKey: string; role: 'assistant'; text: string; createdAtMs?: number; action?: ChatAction }

function newUserLine(text: string): ChatLine {
  return { clientKey: crypto.randomUUID(), role: 'user', text, createdAtMs: Date.now() }
}

function newAssistantLine(text: string, action?: ChatAction): ChatLine {
  const base = { clientKey: crypto.randomUUID(), role: 'assistant' as const, text, createdAtMs: Date.now() }
  return action !== undefined ? { ...base, action } : base
}

function linesWithoutClientKeys(
  lines: ChatLine[]
): Array<{ role: 'user'; text: string; createdAtMs?: number } | { role: 'assistant'; text: string; createdAtMs?: number; action?: ChatAction }> {
  return lines.map(({ clientKey: _k, ...rest }) => rest)
}

function parseStoredCreatedAtMs(o: Record<string, unknown>): number | undefined {
  const raw = o.createdAtMs ?? o.at
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

function formatChatLineTime(ms: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale || 'en', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toLocaleString()
  }
}

function ChatLineTimeFooter({ atMs, locale }: { atMs: number | undefined; locale: string }) {
  if (atMs == null || !Number.isFinite(atMs)) return null
  const d = new Date(atMs)
  return (
    <div className="flex justify-end pr-2 pb-2 pt-0">
      <time dateTime={d.toISOString()} className="text-[10px] tabular-nums leading-none text-muted-foreground">
        {formatChatLineTime(atMs, locale)}
      </time>
    </div>
  )
}

/** Văn bản sao chép cho một dòng (kèm gợi ý hành động nếu có). */
function buildCopyTextForLine(ln: ChatLine): string {
  if (ln.role === 'user') return ln.text
  let s = ln.text
  if (ln.action?.kind === 'openCreatePr') {
    const p = ln.action.payload
    s += `\n[Create PR: ${p.head} → ${p.base}]`
  } else if (ln.action?.kind === 'openBulkCreatePr') {
    s += `\n[Bulk Create PR: ${ln.action.trackedRowIds.length} branch(es)]`
  }
  return s
}

/** Chuẩn hoá JSON từ DB (migration / tay chỉnh có thể lệch schema). */
function normalizeLoadedLines(raw: unknown): ChatLine[] {
  if (!Array.isArray(raw)) return []
  const out: ChatLine[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const at = parseStoredCreatedAtMs(o)
    const text = typeof o.text === 'string' ? o.text : ''
    if (o.role === 'user') {
      if (!text.trim()) continue
      out.push({ clientKey: crypto.randomUUID(), role: 'user', text, ...(at != null ? { createdAtMs: at } : {}) })
      continue
    }
    if (o.role !== 'assistant') continue
    const rawAct = o.action
    let action: ChatAction | undefined
    if (rawAct && typeof rawAct === 'object') {
      const ak = (rawAct as { kind?: string }).kind
      const r = rawAct as Record<string, unknown>
      if (ak === 'openCreatePr' && r.payload && typeof r.payload === 'object') {
        const p = r.payload as Record<string, unknown>
        const repoId = typeof p.repoId === 'string' ? p.repoId : ''
        const head = typeof p.head === 'string' ? p.head : ''
        const base = typeof p.base === 'string' ? p.base : ''
        if (repoId && head && base) {
          action = {
            kind: 'openCreatePr',
            payload: {
              repoId,
              head,
              base,
              suggestedTitle: typeof p.suggestedTitle === 'string' ? p.suggestedTitle : undefined,
              suggestedBody: typeof p.suggestedBody === 'string' ? p.suggestedBody : undefined,
            },
          }
        }
      } else if (ak === 'openBulkCreatePr' && Array.isArray(r.trackedRowIds)) {
        const ids = r.trackedRowIds.filter((x): x is string => typeof x === 'string')
        if (ids.length > 0) action = { kind: 'openBulkCreatePr', trackedRowIds: ids }
      }
    }
    const baseAsst = { clientKey: crypto.randomUUID(), role: 'assistant' as const, text, ...(at != null ? { createdAtMs: at } : {}) }
    out.push(action ? { ...baseAsst, action } : baseAsst)
  }
  return out
}

function translateResolveError(t: (key: string, options?: Record<string, unknown>) => string, err: { code: ResolveCreatePrErr['code'] }): string {
  switch (err.code) {
    case 'ambiguous':
      return t('prManager.aiAssist.resolveAmbiguous')
    case 'no_repo':
      return t('prManager.aiAssist.resolveNoRepo')
    case 'no_head':
      return t('prManager.aiAssist.resolveNoHead')
    case 'no_match':
      return t('prManager.aiAssist.resolveNoMatch')
    default:
      return t('prManager.aiAssist.resolveGeneric')
  }
}

function listIncludesBranch(branches: string[], want: string): boolean {
  const w = want.trim().toLowerCase()
  return branches.some(b => b.trim().toLowerCase() === w)
}

function resolveRemoteBranchName(branches: string[], want: string): string | null {
  const w = want.trim().toLowerCase()
  const exact = branches.find(b => b.trim().toLowerCase() === w)
  if (exact) return exact
  return branches.find(b => b.trim().toLowerCase().includes(w)) ?? null
}

async function suggestTitleFromCommits(repo: PrRepo, head: string, base: string): Promise<string | undefined> {
  const res = await window.api.pr.refCommitMessages({
    owner: repo.owner,
    repo: repo.repo,
    ref: head.trim(),
    maxCommits: 500,
  })
  if (res.status !== 'success' || !res.data) return undefined
  const picked = pickIssueKeyAndVersion(res.data, head.trim())
  if (!picked) return `${head.trim()} → ${base.trim()}`
  return buildIssueStylePrTitle(picked.key, picked.version, base.trim())
}

function ChatLineHoverToolbar({ copyText, onRemove, disabled }: { copyText: string; onRemove?: () => void; disabled?: boolean }) {
  const { t } = useTranslation()

  const copyLine = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(copyText)
      toast.success(t('prManager.aiAssist.copyLineToast'))
    } catch {
      toast.error(t('appLogs.copyError'))
    }
  }

  const deleteLine = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onRemove?.()
    toast.success(t('prManager.aiAssist.deleteLineToast'))
  }

  return (
    <div className="flex justify-end" role="toolbar" aria-label={t('prManager.aiAssist.lineToolbarAria')}>
      <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/95 px-1 py-0.5 shadow-md backdrop-blur-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={disabled}
          title={t('prManager.aiAssist.copyLineTitle')}
          onClick={e => void copyLine(e)}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={disabled}
            title={t('prManager.aiAssist.deleteLineTitle')}
            onClick={deleteLine}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Hàng hiển thị khi AI đang xử lý sau khi đã gửi tin nhắn. */
function AiAssistThinkingBubble({ label }: { label: string }) {
  return (
    <div className="ml-0 mr-4 flex w-fit max-w-[min(100%,28rem)] flex-col">
      <div
        className="rounded-lg bg-gradient-to-br from-muted/95 to-muted/75 px-3 py-2.5 text-xs shadow-sm dark:from-muted/55 dark:to-muted/35"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-[18px] shrink-0 text-violet-500 animate-pulse dark:text-violet-400" aria-hidden />
          <span className="font-medium tracking-tight text-foreground">{label}</span>
          <span className="pr-ai-assist-thinking-dots shrink-0 text-violet-600 dark:text-violet-400" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  )
}

function AssistantLineContent({
  text,
  action,
  t,
  onOpenCreatePrDialog,
  onOpenBulkCreatePrDialog,
  onCloseSheet,
}: {
  text: string
  action: ChatAction | undefined
  t: (key: string, options?: Record<string, unknown>) => string
  onOpenCreatePrDialog: (payload: PrAiAssistOpenCreatePrPayload) => void
  onOpenBulkCreatePrDialog: (payload: { trackedRowIds: string[] }) => void
  onCloseSheet: (v: boolean) => void
}) {
  const openCreate = action?.kind === 'openCreatePr' ? action : undefined
  const openBulk = action?.kind === 'openBulkCreatePr' ? action : undefined

  return (
    <>
      <p className="whitespace-pre-wrap select-text">{text}</p>
      {openCreate ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-8 w-full shrink-0 text-xs font-medium sm:w-auto"
          onClick={() => {
            onOpenCreatePrDialog(openCreate.payload)
            onCloseSheet(false)
          }}
        >
          {t('prManager.aiAssist.buttonOpenCreatePr')}
        </Button>
      ) : null}
      {openBulk ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-8 w-full shrink-0 text-xs font-medium sm:w-auto"
          onClick={() => {
            onOpenBulkCreatePrDialog({ trackedRowIds: openBulk.trackedRowIds })
            onCloseSheet(false)
          }}
        >
          {t('prManager.aiAssist.buttonOpenBulkCreatePr')}
        </Button>
      ) : null}
    </>
  )
}

export function PrAiAssistSheet({ open, onOpenChange, projectId, userId, repos, tracked, githubTokenOk, onOpenCreatePrDialog, onOpenBulkCreatePrDialog }: Props) {
  const { t, i18n } = useTranslation()
  const [lines, setLines] = useState<ChatLine[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [persistReady, setPersistReady] = useState(false)
  const [ambiguousPick, setAmbiguousPick] = useState<{
    baseGuess: string
    candidates: ResolveBranchCandidate[]
  } | null>(null)
  const aiThinkingAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      setInput('')
      setAmbiguousPick(null)
    }
  }, [open])

  useEffect(() => {
    const uid = userId?.trim() ?? ''
    const pid = projectId?.trim() ?? ''
    if (!open || !uid || !pid) {
      setPersistReady(false)
      return
    }
    let alive = true
    setPersistReady(false)
      ; (async () => {
        try {
          const res = await window.api.pr.aiAssistChatGet(uid, pid)
          if (!alive) return
          if (res.status !== 'success') {
            setLines([])
            setPersistReady(false)
            return
          }
          setLines(normalizeLoadedLines(res.data?.lines))
          setPersistReady(true)
        } catch {
          if (alive) {
            setLines([])
            setPersistReady(false)
          }
        }
      })()
    return () => {
      alive = false
    }
  }, [open, userId, projectId])

  useEffect(() => {
    if (!busy) return
    const id = requestAnimationFrame(() => {
      aiThinkingAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
    return () => cancelAnimationFrame(id)
  }, [busy, lines.length])

  useEffect(() => {
    const uid = userId?.trim() ?? ''
    const pid = projectId?.trim() ?? ''
    if (!persistReady || !uid || !pid) return
    const tmr = setTimeout(() => {
      void window.api.pr.aiAssistChatSave({
        userId: uid,
        projectId: pid,
        lines: linesWithoutClientKeys(lines),
      })
    }, 650)
    return () => clearTimeout(tmr)
  }, [lines, persistReady, userId, projectId])

  const appendAssistantSingleAction = async (resolved: ResolveCreatePrOk) => {
    const remote = await window.api.pr.branchListRemote({ owner: resolved.repo.owner, repo: resolved.repo.repo })
    if (remote.status !== 'success' || !remote.data?.length) {
      toast.error(remote.message || t('prManager.aiAssist.branchListFail'))
      setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.cannotVerifyRemote'))])
      return
    }
    const branches = remote.data
    const headResolvedName = resolveRemoteBranchName(branches, resolved.head)
    if (!headResolvedName) {
      setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.headMissingOnRemote', { head: resolved.head }))])
      toast.error(t('prManager.aiAssist.headMissingOnRemote', { head: resolved.head }))
      return
    }
    const baseResolvedName = resolveRemoteBranchName(branches, resolved.base) ?? resolved.base.trim()
    if (!listIncludesBranch(branches, baseResolvedName)) {
      toast.info(t('prManager.aiAssist.baseNotInListWarn', { base: baseResolvedName }))
    }
    const suggestedTitle = await suggestTitleFromCommits(resolved.repo, headResolvedName, baseResolvedName)
    const headF = headResolvedName
    const baseF = baseResolvedName.trim()
    setLines(ls => [
      ...ls,
      newAssistantLine(
        t('prManager.aiAssist.readyOpenCreate', {
          repo: `${resolved.repo.owner}/${resolved.repo.repo}`,
          head: headF,
          base: baseF,
        }),
        {
          kind: 'openCreatePr',
          payload: {
            repoId: resolved.repo.id,
            head: headF,
            base: baseF,
            suggestedTitle,
            suggestedBody: undefined,
          },
        }
      ),
    ])
  }

  async function handleCreatePrMulti(parsed: { intent: 'create_pr_multi'; targets: Array<{ head: string | null; base: string | null; repo_hint: string | null }> }) {
    const rowIds = new Map<string, ResolveCreatePrOk>()
    const failed: string[] = []
    for (const tgt of parsed.targets) {
      const resolved = resolveCreatePrTarget(tgt.head, tgt.base, tgt.repo_hint, tracked, repos)
      if (!resolved.ok) {
        failed.push(`${tgt.head ?? '?'} → ${tgt.base ?? '?'}`)
        continue
      }
      if (!resolved.matchedRow) {
        failed.push(t('prManager.aiAssist.multiNeedTracked', { head: resolved.head }))
        continue
      }
      rowIds.set(resolved.matchedRow.id, resolved)
    }
    const uniqueIds = [...rowIds.keys()]
    if (failed.length > 0 && uniqueIds.length === 0) {
      setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.multiFailed', { detail: failed.slice(0, 5).join('; ') }))])
      return
    }
    if (uniqueIds.length >= 2) {
      setLines(ls => [
        ...ls,
        newAssistantLine(t('prManager.aiAssist.readyOpenBulk', { count: uniqueIds.length }), {
          kind: 'openBulkCreatePr',
          trackedRowIds: uniqueIds,
        }),
      ])
      if (failed.length) {
        setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.multiPartialSkip', { detail: failed.join('; ') }))])
      }
      return
    }
    if (uniqueIds.length === 1) {
      const firstId = uniqueIds[0]
      const only = firstId ? rowIds.get(firstId) : undefined
      if (!only) {
        setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.multiNoneResolved'))])
        return
      }
      if (failed.length) {
        setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.multiPartialSkip', { detail: failed.join('; ') }))])
      }
      await appendAssistantSingleAction(only)
      return
    }
    setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.multiNoneResolved'))])
  }

  async function runAiAndResolve(userLine: string) {
    let headT: string | null = null
    let baseT: string | null = null
    let repoHintT: string | null = null
    let fromHeuristic = false

    const heuristic = parseHeuristicCreatePr(userLine)
    if (heuristic) {
      headT = heuristic.head
      baseT = heuristic.base
      repoHintT = heuristic.repoHint
      fromHeuristic = true
    } else {
      const ctx = buildTrackedContextJson(tracked)
      const promptRes = await window.api.openai.send_message({
        type: 'PR_CHAT_INTENT',
        values: {
          tracked_context: ctx,
          user_message: userLine,
        },
      })
      if (typeof promptRes === 'string' && promptRes.startsWith('Error')) {
        setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.apiError', { message: promptRes }))])
        toast.error(t('prManager.aiAssist.toastApi'))
        return
      }
      try {
        const parsed = parseAiIntent(promptRes as string)
        if (parsed.intent === 'reply') {
          setLines(ls => [...ls, newAssistantLine(parsed.message)])
          return
        }
        if (parsed.intent === 'create_pr_multi') {
          await handleCreatePrMulti(parsed)
          return
        }
        headT = parsed.head
        baseT = parsed.base
        repoHintT = parsed.repo_hint
      } catch {
        setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.parseError'))])
        return
      }
    }

    const resolved = resolveCreatePrTarget(headT, baseT, repoHintT, tracked, repos)
    if (!resolved.ok) {
      if (resolved.code === 'ambiguous') {
        const cands = resolved.candidates ?? []
        if (cands.length > 0) {
          setAmbiguousPick({
            baseGuess: baseT ?? '',
            candidates: cands,
          })
          setLines(ls => [...ls, newAssistantLine(t('prManager.aiAssist.ambiguous', { count: cands.length }))])
          return
        }
      }
      const errText = translateResolveError(t, resolved)
      setLines(ls => [...ls, newAssistantLine(errText)])
      if (fromHeuristic) {
        toast.info(t('prManager.aiAssist.heuristicNoMatch'))
      }
      return
    }

    await appendAssistantSingleAction(resolved)
  }

  async function submitChat() {
    const text = input.trim()
    if (!text) return
    if (!userId?.trim()) {
      toast.error(t('evm.pleaseLoginFirst'))
      return
    }
    if (!projectId?.trim()) {
      toast.error(t('prManager.shell.selectProjectHint'))
      return
    }
    if (!githubTokenOk) {
      toast.error(t('prManager.aiAssist.needGithubToken'))
      return
    }
    setLines(ls => [...ls, newUserLine(text)])
    setInput('')
    setBusy(true)
    try {
      await runAiAndResolve(text)
    } finally {
      setBusy(false)
    }
  }

  function chooseCandidate(c: ResolveBranchCandidate) {
    const row = tracked.find(r => r.repoOwner === c.owner && r.repoRepo === c.repo && r.branchName === c.branch)
    const repo = repos.find(x => x.owner === c.owner && x.repo === c.repo)
    if (!repo) {
      toast.error(t('prManager.aiAssist.resolveNoRepo'))
      return
    }
    const savedBaseGuess = ambiguousPick?.baseGuess
    setAmbiguousPick(null)
    void (async () => {
      setBusy(true)
      try {
        const headName = row?.branchName ?? c.branch
        const baseGuess = savedBaseGuess?.trim() || repo.defaultBaseBranch || 'stage'
        const resolvedOk: ResolveCreatePrOk = {
          ok: true,
          repo,
          head: headName,
          base: baseGuess,
          matchedRow: row ?? null,
        }
        await appendAssistantSingleAction(resolvedOk)
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" showCloseButton className="flex w-full max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-500" />
              {t('prManager.aiAssist.sheetTitle')}
            </SheetTitle>
            <p className="text-xs font-normal leading-snug text-muted-foreground">{t('prManager.aiAssist.sheetHintActions')}</p>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScrollArea className="min-h-[200px] flex-1 px-4">
              <div className="space-y-3 py-3 pr-2">
                {lines.length === 0 ? (
                  <div className="flex gap-2 rounded-md border border-dashed border-border/60 bg-muted/15 p-3 text-xs leading-relaxed text-muted-foreground">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{t('prManager.aiAssist.emptyState')}</p>
                  </div>
                ) : null}
                {lines.map(ln => {
                  const copyPayload = buildCopyTextForLine(ln)
                  const onRemoveLine = () => setLines(ls => ls.filter(x => x.clientKey !== ln.clientKey))
                  const floatingToolbar =
                    'pointer-events-none absolute right-1 top-1 z-[2] opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
                  if (ln.role === 'user') {
                    return (
                      <div key={ln.clientKey} className="group ml-auto w-fit max-w-[min(100%,28rem)]">
                        <div className="relative flex flex-col overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-slate-100/95 text-xs leading-relaxed text-foreground shadow-sm dark:from-slate-900/80 dark:to-slate-900/55 dark:shadow-black/25">
                          <div className="relative px-3 pt-2 pb-1.5 pr-16">
                            <div className={floatingToolbar} role="presentation">
                              <ChatLineHoverToolbar copyText={copyPayload} disabled={busy} onRemove={onRemoveLine} />
                            </div>
                            <p className="whitespace-pre-wrap select-text">{ln.text}</p>
                          </div>
                          <ChatLineTimeFooter atMs={ln.createdAtMs} locale={i18n.language} />
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={ln.clientKey} className="group ml-0 w-fit max-w-[min(100%,28rem)]">
                      <div className="relative flex flex-col overflow-hidden rounded-lg bg-gradient-to-br from-muted/95 to-muted/75 text-xs leading-relaxed text-foreground shadow-sm dark:from-muted/55 dark:to-muted/35">
                        <div className="relative px-3 pt-2 pb-1.5 pr-16">
                          <div className={floatingToolbar} role="presentation">
                            <ChatLineHoverToolbar copyText={copyPayload} disabled={busy} onRemove={onRemoveLine} />
                          </div>
                          <AssistantLineContent
                            text={ln.text}
                            action={ln.action}
                            t={t}
                            onOpenCreatePrDialog={onOpenCreatePrDialog}
                            onOpenBulkCreatePrDialog={onOpenBulkCreatePrDialog}
                            onCloseSheet={onOpenChange}
                          />
                        </div>
                        <ChatLineTimeFooter atMs={ln.createdAtMs} locale={i18n.language} />
                      </div>
                    </div>
                  )
                })}
                {busy ? (
                  <div ref={aiThinkingAnchorRef}>
                    <AiAssistThinkingBubble label={t('prManager.aiAssist.thinking')} />
                  </div>
                ) : null}
              </div>
            </ScrollArea>
            <div className="border-t border-border/60 p-3">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={t('prManager.aiAssist.inputPlaceholder')}
                  rows={2}
                  className="min-h-0 resize-none text-sm"
                  disabled={busy}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (!busy) void submitChat()
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-full min-h-[3.25rem] shrink-0"
                  disabled={busy || !input.trim() || !githubTokenOk || !userId?.trim() || !projectId?.trim()}
                  onClick={() => void submitChat()}
                  title={t('prManager.aiAssist.send')}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
              </div>
              {!userId?.trim() ? (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500">{t('evm.pleaseLoginFirst')}</p>
              ) : !projectId?.trim() ? (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500">{t('prManager.shell.selectProjectHint')}</p>
              ) : !githubTokenOk ? (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500">{t('prManager.aiAssist.needGithubToken')}</p>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={ambiguousPick != null} onOpenChange={o => !o && setAmbiguousPick(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('prManager.aiAssist.pickBranchTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('prManager.aiAssist.pickBranchDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {ambiguousPick?.candidates.map(c => (
              <li key={`${c.owner}/${c.repo}@${c.branch}`}>
                <button
                  type="button"
                  className="w-full rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-left text-xs transition hover:bg-muted/60"
                  onClick={() => chooseCandidate(c)}
                >
                  <span className="font-medium">
                    {c.owner}/{c.repo}
                  </span>{' '}
                  <span className="font-mono text-[11px] text-muted-foreground">{c.branch}</span>
                </button>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
