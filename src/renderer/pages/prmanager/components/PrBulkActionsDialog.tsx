'use client'

import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableCell, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import { usePrOperationLog } from '../PrOperationLogContext'
import { checkpointTableHeadGroupClass } from '../checkpointHeaderGroup'
import { BULK_DIALOG_CHROME } from '../prBulkDialogChrome'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE } from '../prManagerButtonStyles'
import { PR_MANAGER_REPO_GROUP_VISUAL } from '../prManagerRepoGroupVisual'
import { buildIssueStylePrTitle, pickIssueKeyAndVersion } from '../utils/buildIssuePrTitle'
import {
  activePrTemplates,
  type BulkActionKind,
  type BulkCreatePrTarget,
  type BulkDeleteBranchTarget,
  type BulkPrRowTarget,
  resolveBulkCreatePrTargets,
  resolveBulkDeleteBranchTargets,
  resolveBulkPrTargets,
} from './prBoardBulkResolve'

type MergeMethod = 'squash' | 'merge' | 'rebase'

type RowResult = { ok: boolean; message?: string }

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  kind: BulkActionKind
  projectId: string
  /** Bắt buộc cho lô tạo PR (theo user trong DB). */
  userId: string | null
  selectedRows: TrackedBranchRow[]
  repos: PrRepo[]
  activeTemplates: PrCheckpointTemplate[]
  remoteExistMap: Record<string, boolean> | null
  onlyExistingOnRemote: boolean
  githubTokenOk: boolean
  onAfterBatch: () => void | Promise<void>
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function githubPrWebUrl(owner: string, repo: string, prNumber: number): string {
  return `https://github.com/${owner}/${repo}/pull/${prNumber}`
}

function openUrlInDefaultBrowser(url: string): void {
  void window.api.system.open_external_url(url)
}

const BULK_ELIGIBLE_HINT_CLASS = 'text-xs text-emerald-700 dark:text-emerald-400'

/** Cột cuối (icon trạng thái / chữ "Lỗi" ngắn) — width cố định để cột nội dung giãn hết phần còn lại. */
const BULK_STATUS_COL_CLASS = 'w-16 max-w-16 shrink-0 px-1.5 align-middle text-center'

/** Gom các dòng bulk theo owner/repo; sort tên repo ổn định. */
function groupByOwnerRepo<T extends { owner: string; repo: string }>(items: T[]): { key: string; owner: string; repo: string; items: T[] }[] {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = `${it.owner}/${it.repo}`
    let bucket = m.get(k)
    if (!bucket) {
      bucket = []
      m.set(k, bucket)
    }
    bucket.push(it)
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([key, arr]) => ({
      key,
      owner: arr[0].owner,
      repo: arr[0].repo,
      items: arr,
    }))
}

/** Bulk create preview: gom theo thứ tự template trong project, rồi theo owner/repo. */
function groupBulkCreateTargetsForPreview(
  items: BulkCreatePrTarget[],
  templateOrder: PrCheckpointTemplate[]
): {
  templateId: string
  label: string
  code: string
  targetBranch: string | null | undefined
  repoGroups: ReturnType<typeof groupByOwnerRepo<BulkCreatePrTarget>>
}[] {
  const byId = new Map<string, BulkCreatePrTarget[]>()
  for (const it of items) {
    let arr = byId.get(it.templateId)
    if (!arr) {
      arr = []
      byId.set(it.templateId, arr)
    }
    arr.push(it)
  }
  const out: {
    templateId: string
    label: string
    code: string
    targetBranch: string | null | undefined
    repoGroups: ReturnType<typeof groupByOwnerRepo<BulkCreatePrTarget>>
  }[] = []
  const seen = new Set<string>()
  for (const tpl of templateOrder) {
    const arr = byId.get(tpl.id)
    if (!arr?.length) continue
    seen.add(tpl.id)
    out.push({
      templateId: tpl.id,
      label: tpl.label,
      code: tpl.code,
      targetBranch: tpl.targetBranch,
      repoGroups: groupByOwnerRepo(arr),
    })
  }
  const orphans: (typeof out)[number][] = []
  for (const [tid, arr] of byId) {
    if (seen.has(tid)) continue
    orphans.push({
      templateId: tid,
      label: arr[0]?.templateLabel ?? tid,
      code: '',
      targetBranch: undefined,
      repoGroups: groupByOwnerRepo(arr),
    })
  }
  orphans.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return [...out, ...orphans]
}

/** Offset chỉ số dòng phẳng trong bảng (qua mọi nhóm repo) để zebra nền liên tục. */
function bulkGroupItemBaseOffsets<T>(groups: { items: T[] }[]): number[] {
  const offsets: number[] = []
  let acc = 0
  for (const g of groups) {
    offsets.push(acc)
    acc += g.items.length
  }
  return offsets
}

/** Nền xen kẽ trong nhóm template PR — lớp mỏng để lộ màu nền repo (`row`) / vùng template. */
function bulkTemplateGroupStripeCellClass(flatIndex: number): string {
  return flatIndex % 2 === 0
    ? 'bg-black/[0.06] dark:bg-white/[0.08]'
    : 'bg-black/[0.03] dark:bg-white/[0.04]'
}

/** Nền xen kẽ — gắn lên từng `TableCell` để bảng lồng vẫn phủ đủ (một số layout `tr` không tô kín). */
function bulkItemRowStripeCellClass(flatIndex: number): string {
  return flatIndex % 2 === 0 ? 'bg-muted/40 dark:bg-muted/30' : 'bg-muted/10 dark:bg-muted/10'
}

const BULK_COLLAPSE_MS = 320
const BULK_COLLAPSE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Accordion trong `<td>`: `max-height` trong layout table thường không chạy transition — dùng `height` px + reflow + `transitionend` → `auto` khi mở xong. */
function BulkRepoGroupCollapsibleRows({
  collapsed,
  children,
  toneRowClassName,
}: {
  collapsed: boolean
  children: ReactNode
  /** Nền `<tr>` bọc accordion (vd. `rowHeader` template hoặc `row` repo như PrBoard). */
  toneRowClassName?: string
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const collapsedRef = useRef(collapsed)
  collapsedRef.current = collapsed
  const prevCollapsedRef = useRef(collapsed)
  const isFirstLayoutRef = useRef(true)

  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const inner = innerRef.current
    if (!shell || !inner) return

    let onEnd: ((ev: TransitionEvent) => void) | null = null
    const clearEnd = () => {
      if (onEnd) {
        shell.removeEventListener('transitionend', onEnd)
        onEnd = null
      }
    }

    const applyReduce = () => {
      clearEnd()
      shell.style.transition = 'none'
      shell.style.overflow = 'hidden'
      shell.style.height = collapsed ? '0px' : 'auto'
    }

    if (isFirstLayoutRef.current) {
      isFirstLayoutRef.current = false
      prevCollapsedRef.current = collapsed
      if (reduceMotion) {
        applyReduce()
        return clearEnd
      }
      shell.style.overflow = 'hidden'
      shell.style.transition = 'none'
      shell.style.height = collapsed ? '0px' : 'auto'
      return clearEnd
    }

    const collapsedChanged = prevCollapsedRef.current !== collapsed
    prevCollapsedRef.current = collapsed

    if (reduceMotion) {
      applyReduce()
      return clearEnd
    }

    shell.style.overflow = 'hidden'
    shell.style.transition = `height ${BULK_COLLAPSE_MS}ms ${BULK_COLLAPSE_EASE}`

    if (!collapsedChanged) {
      return clearEnd
    }

    clearEnd()

    if (collapsed) {
      const rectH = shell.getBoundingClientRect().height
      const h = Number.isFinite(rectH) && rectH > 0 ? rectH : inner.scrollHeight
      shell.style.height = `${h}px`
      void shell.offsetHeight
      shell.style.height = '0px'
    } else {
      const full = Math.max(inner.scrollHeight, 1)
      shell.style.height = '0px'
      void shell.offsetHeight
      shell.style.height = `${full}px`
      onEnd = (ev: TransitionEvent) => {
        if (ev.propertyName !== 'height' || ev.target !== shell) return
        clearEnd()
        if (!collapsedRef.current) {
          shell.style.height = 'auto'
        }
      }
      shell.addEventListener('transitionend', onEnd)
    }

    return clearEnd
  }, [collapsed, children, reduceMotion])

  return (
    <TableRow className={cn('border-0 hover:bg-transparent', toneRowClassName)}>
      <TableCell colSpan={3} className="border-0 bg-transparent p-0 align-top">
        <div ref={shellRef} className="overflow-hidden">
          <div ref={innerRef} className={cn(collapsed && 'pointer-events-none select-none')}>
            <table className="w-full table-fixed border-separate border-spacing-0 bg-transparent caption-bottom text-xs [&_td]:align-middle" role="presentation">
              <tbody>{children}</tbody>
            </table>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

function uniqueReviewerLogins(picked: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of picked) {
    const t = s.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** GitHub không cho yêu cầu chính tác giả PR làm reviewer — bỏ khỏi danh sách. */
function reviewerLoginsExcludingPrAuthor(picked: string[], ghPrAuthor: string | null | undefined): string[] {
  const a = (ghPrAuthor ?? '').trim().toLowerCase()
  if (!a) return uniqueReviewerLogins(picked)
  return uniqueReviewerLogins(picked.filter(x => x.trim().toLowerCase() !== a))
}

export function PrBulkActionsDialog({
  open,
  onOpenChange,
  kind,
  projectId,
  userId,
  selectedRows,
  repos,
  activeTemplates,
  remoteExistMap,
  onlyExistingOnRemote,
  githubTokenOk,
  onAfterBatch,
}: Props) {
  const { t } = useTranslation()
  const opLog = usePrOperationLog()
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash')
  const [enabledIds, setEnabledIds] = useState<Set<string>>(() => new Set())
  const [running, setRunning] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, RowResult>>({})

  const prTemplates = useMemo(() => activePrTemplates(activeTemplates), [activeTemplates])
  const [createTemplateIds, setCreateTemplateIds] = useState<Set<string>>(() => new Set())
  const [createDraft, setCreateDraft] = useState(false)
  const [createTitles, setCreateTitles] = useState<Record<string, string>>({})
  const [suggestingTitles, setSuggestingTitles] = useState(false)
  /** Khóa đóng dialog / thao tác khi đang chạy bulk hoặc gợi ý tiêu đề. */
  const dialogBusy = running || suggestingTitles
  const [requestReviewersPicked, setRequestReviewersPicked] = useState<string[]>([])
  const [repoAssigneeLogins, setRepoAssigneeLogins] = useState<string[]>([])
  const [assigneesLoadState, setAssigneesLoadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  /** Bật: chỉ hiển thị các dòng đủ điều kiện thao tác trong bảng xem trước. */
  const [showOnlyEligibleRows, setShowOnlyEligibleRows] = useState(true)
  /** Các key `owner/repo` đang thu gọn trong bảng (ẩn dòng con). */
  const [collapsedRepoGroupKeys, setCollapsedRepoGroupKeys] = useState<Set<string>>(() => new Set())
  const bulkCreatePrPrevOpenRef = useRef(false)

  useEffect(() => {
    if (!open) setShowOnlyEligibleRows(false)
  }, [open])

  useEffect(() => {
    setCollapsedRepoGroupKeys(new Set())
  }, [open, kind])

  /** Đồng bộ lựa chọn template bulk create: mở dialog = chọn hết; giữ các id còn hợp lệ khi danh sách template đổi. */
  useEffect(() => {
    const wasOpen = bulkCreatePrPrevOpenRef.current
    bulkCreatePrPrevOpenRef.current = open

    if (!open || kind !== 'createPr') return
    if (prTemplates.length === 0) {
      setCreateTemplateIds(new Set())
      return
    }
    if (!wasOpen && open) {
      setCreateTemplateIds(new Set(prTemplates.map(t => t.id)))
      return
    }
    setCreateTemplateIds(prev => {
      const next = new Set([...prev].filter(id => prTemplates.some(t => t.id === id)))
      if (next.size === 0) return new Set(prTemplates.map(t => t.id))
      return next
    })
  }, [open, kind, prTemplates])

  const createTemplateSelectionKey = useMemo(() => [...createTemplateIds].sort().join('\0'), [createTemplateIds])

  const prTargets: BulkPrRowTarget[] = useMemo(() => {
    if (kind === 'deleteRemoteBranch' || kind === 'createPr' || !githubTokenOk) return []
    return resolveBulkPrTargets(kind, selectedRows, activeTemplates, repos)
  }, [kind, selectedRows, activeTemplates, repos, githubTokenOk])

  /** Login (lowercase) của tác giả từng PR đủ điều kiện trong lô — GitHub không thêm tác giả làm requested reviewer. */
  const bulkPrAuthorLoginSet = useMemo(() => {
    const s = new Set<string>()
    for (const t of prTargets) {
      if (!t.eligible) continue
      const a = (t.ghPrAuthor ?? '').trim().toLowerCase()
      if (a) s.add(a)
    }
    return s
  }, [prTargets])

  const deleteTargets: BulkDeleteBranchTarget[] = useMemo(() => {
    if (kind !== 'deleteRemoteBranch' || !githubTokenOk) return []
    return resolveBulkDeleteBranchTargets(selectedRows, repos, activeTemplates, remoteExistMap, onlyExistingOnRemote)
  }, [kind, selectedRows, repos, activeTemplates, remoteExistMap, onlyExistingOnRemote, githubTokenOk])

  const createTargets: BulkCreatePrTarget[] = useMemo(() => {
    if (kind !== 'createPr' || !githubTokenOk) return []
    const out: BulkCreatePrTarget[] = []
    for (const tpl of prTemplates) {
      if (!createTemplateIds.has(tpl.id)) continue
      out.push(...resolveBulkCreatePrTargets(selectedRows, tpl, repos, remoteExistMap, onlyExistingOnRemote))
    }
    return out
  }, [kind, prTemplates, createTemplateIds, selectedRows, repos, remoteExistMap, onlyExistingOnRemote, githubTokenOk])

  const tableDeleteTargets = useMemo(() => (showOnlyEligibleRows ? deleteTargets.filter(x => x.eligible) : deleteTargets), [deleteTargets, showOnlyEligibleRows])
  const tableCreateTargets = useMemo(() => (showOnlyEligibleRows ? createTargets.filter(x => x.eligible) : createTargets), [createTargets, showOnlyEligibleRows])
  const tablePrTargets = useMemo(() => (showOnlyEligibleRows ? prTargets.filter(x => x.eligible) : prTargets), [prTargets, showOnlyEligibleRows])

  const groupedTableDelete = useMemo(() => groupByOwnerRepo(tableDeleteTargets), [tableDeleteTargets])
  /** Chỉ dùng cho bulk tạo PR: template → repo → dòng. */
  const groupedTableCreateByTemplate = useMemo(() => {
    if (kind !== 'createPr') return []
    return groupBulkCreateTargetsForPreview(tableCreateTargets, prTemplates)
  }, [kind, tableCreateTargets, prTemplates])

  const bulkCreateStripeByItemId = useMemo(() => {
    const m: Record<string, number> = {}
    let i = 0
    for (const tg of groupedTableCreateByTemplate) {
      for (const rg of tg.repoGroups) {
        for (const item of rg.items) {
          m[item.id] = i++
        }
      }
    }
    return m
  }, [groupedTableCreateByTemplate])

  const groupedTablePr = useMemo(() => groupByOwnerRepo(tablePrTargets), [tablePrTargets])

  const bulkStripeOffDelete = useMemo(() => bulkGroupItemBaseOffsets(groupedTableDelete), [groupedTableDelete])
  const bulkStripeOffPr = useMemo(() => bulkGroupItemBaseOffsets(groupedTablePr), [groupedTablePr])

  const toggleRepoGroupCollapse = useCallback((key: string) => {
    setCollapsedRepoGroupKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleCreateTemplateId = useCallback((templateId: string, checked: boolean) => {
    if (dialogBusy) return
    setCreateTemplateIds(prev => {
      if (!checked) {
        if (prev.size <= 1 && prev.has(templateId)) return prev
        const next = new Set(prev)
        next.delete(templateId)
        return next
      }
      if (prev.has(templateId)) return prev
      return new Set([...prev, templateId])
    })
  }, [dialogBusy])

  useEffect(() => {
    if (!open) return
    if (kind === 'createPr') {
      const next = new Set(createTargets.filter(x => x.eligible).map(x => x.id))
      setEnabledIds(next)
      const titles: Record<string, string> = {}
      for (const x of createTargets) {
        if (x.eligible) titles[x.id] = x.suggestedTitle
      }
      setCreateTitles(titles)
      return
    }
    if (kind === 'deleteRemoteBranch') {
      setEnabledIds(new Set(deleteTargets.filter(x => x.eligible).map(x => x.id)))
    } else {
      setEnabledIds(new Set(prTargets.filter(x => x.eligible).map(x => x.id)))
    }
  }, [open, kind, prTargets, deleteTargets, createTargets])

  useEffect(() => {
    if (!open) return
    setResults({})
    setCurrentId(null)
  }, [open, kind, createTemplateSelectionKey])

  const reviewersParsed = useMemo(() => uniqueReviewerLogins(requestReviewersPicked), [requestReviewersPicked])

  useEffect(() => {
    if (!open || kind !== 'requestReviewers') {
      setRequestReviewersPicked([])
      setRepoAssigneeLogins([])
      setAssigneesLoadState('idle')
      return
    }
    setAssigneesLoadState('loading')
    const keySet = new Set<string>()
    const pairs: { owner: string; repo: string }[] = []
    for (const t of prTargets) {
      if (!t.eligible) continue
      const k = `${t.owner}\0${t.repo}`
      if (keySet.has(k)) continue
      keySet.add(k)
      pairs.push({ owner: t.owner, repo: t.repo })
    }
    if (pairs.length === 0) {
      setRepoAssigneeLogins([])
      setAssigneesLoadState('done')
      return
    }
    let cancelled = false
    void (async () => {
      const loginSet = new Set<string>()
      for (const p of pairs) {
        if (cancelled) return
        const res = await window.api.pr.repoListAssignees(p)
        if (cancelled) return
        if (res.status === 'success' && res.data) {
          for (const u of res.data) {
            if (u?.login) loginSet.add(String(u.login))
          }
        }
      }
      if (!cancelled) {
        setRepoAssigneeLogins([...loginSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
        setAssigneesLoadState('done')
      }
    })().catch(() => {
      if (!cancelled) {
        setAssigneesLoadState('error')
        setRepoAssigneeLogins([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, kind, prTargets])

  useEffect(() => {
    if (!open || kind !== 'requestReviewers') return
    setRequestReviewersPicked(prev => {
      const next = prev.filter(l => !bulkPrAuthorLoginSet.has(l.trim().toLowerCase()))
      return next.length === prev.length ? prev : next
    })
  }, [open, kind, bulkPrAuthorLoginSet])

  const titleKey = useMemo(() => `prManager.bulk.title.${kind}` as const, [kind])
  const bulkChrome = BULK_DIALOG_CHROME[kind]

  const eligibleCount = useMemo(() => {
    if (kind === 'deleteRemoteBranch') {
      return deleteTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok).length
    }
    if (kind === 'createPr') {
      return createTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok).length
    }
    return prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok).length
  }, [kind, prTargets, deleteTargets, createTargets, enabledIds, results])

  const runCount = useMemo(() => {
    if (kind === 'requestReviewers' && reviewersParsed.length === 0) return 0
    return eligibleCount
  }, [kind, eligibleCount, reviewersParsed.length])

  const toggleId = useCallback(
    (id: string, eligible: boolean) => {
      if (!eligible || dialogBusy || results[id]?.ok) return
      setEnabledIds(prev => {
        const n = new Set(prev)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
    },
    [dialogBusy, results]
  )

  const runBatch = async () => {
    if (!githubTokenOk || running) return
    if (kind === 'createPr' && !userId?.trim()) {
      toast.error(t('evm.pleaseLoginFirst'))
      return
    }
    if (kind === 'requestReviewers' && reviewersParsed.length === 0) {
      toast.error(t('prManager.bulk.requestReviewersNeedOne'))
      return
    }
    const actionLabel = t(`prManager.bulk.title.${kind}`)
    if (!opLog.startOperation('prManager.operationLog.bulkTitle', { action: actionLabel, count: runCount })) return
    setRunning(true)
    setResults({})
    const markRowSuccess = (id: string) => {
      setResults(prev => ({ ...prev, [id]: { ok: true } }))
      setEnabledIds(prev => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
    }
    const lineOk = () => opLog.appendLine(t('prManager.operationLog.lineOk'))
    const lineErr = (message: string) => opLog.appendLine(t('prManager.operationLog.lineError', { message: message || '—' }))
    try {
      if (kind === 'merge') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.lineMerge', { owner: item.owner, repo: item.repo, n: item.prNumber, method: mergeMethod }))
          const commitTitle = (item.ghTitle?.trim() || `PR #${item.prNumber}`).slice(0, 256)
          const res = await window.api.pr.prMerge({
            projectId,
            repoId: item.repoId,
            owner: item.owner,
            repo: item.repo,
            number: item.prNumber,
            method: mergeMethod,
            commitTitle,
            commitMessage: '',
          })
          if (res.status === 'success' && res.data?.merged) {
            markRowSuccess(item.id)
            lineOk()
          } else {
            const msg = res.message || res.data?.message || t('prManager.bulk.toast.mergeFail')
            setResults(prev => ({
              ...prev,
              [item.id]: { ok: false, message: msg },
            }))
            lineErr(msg)
          }
          await sleep(200)
        }
      } else if (kind === 'close') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.lineClose', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const res = await window.api.pr.prClose({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'draft') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.lineMarkDraft', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const res = await window.api.pr.prMarkDraft({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'ready') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.lineMarkReady', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const res = await window.api.pr.prMarkReady({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'approve') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.linePrGet', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const g = await window.api.pr.prGet({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (g.status !== 'success' || !g.data?.headSha) {
            const msg = g.message || t('prManager.bulk.toast.noHeadSha')
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: msg } }))
            lineErr(msg)
            await sleep(200)
            continue
          }
          opLog.appendLine(t('prManager.operationLog.lineApprove', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const res = await window.api.pr.prReviewApprove({
            owner: item.owner,
            repo: item.repo,
            number: item.prNumber,
            headSha: g.data.headSha as string,
          })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'reopen') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.lineReopen', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const res = await window.api.pr.prReopen({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'requestReviewers') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          const toSend = reviewerLoginsExcludingPrAuthor(reviewersParsed, item.ghPrAuthor)
          if (toSend.length === 0) {
            const msg = t('prManager.bulk.toast.requestReviewersExcludesAuthor')
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: msg } }))
            opLog.appendLine(
              t('prManager.operationLog.lineRequestReviewers', {
                owner: item.owner,
                repo: item.repo,
                n: item.prNumber,
                logins: reviewersParsed.join(', '),
              })
            )
            lineErr(msg)
            await sleep(200)
            continue
          }
          opLog.appendLine(
            t('prManager.operationLog.lineRequestReviewers', {
              owner: item.owner,
              repo: item.repo,
              n: item.prNumber,
              logins: toSend.join(', '),
            })
          )
          const res = await window.api.pr.prRequestReviewers({
            owner: item.owner,
            repo: item.repo,
            number: item.prNumber,
            reviewers: toSend,
          })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'updateBranch') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.linePrGet', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const g = await window.api.pr.prGet({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (g.status !== 'success' || !g.data?.headSha) {
            const msg = g.message || t('prManager.bulk.toast.noHeadSha')
            setResults(prev => ({
              ...prev,
              [item.id]: { ok: false, message: msg },
            }))
            lineErr(msg)
            await sleep(200)
            continue
          }
          lineOk()
          opLog.appendLine(t('prManager.operationLog.lineUpdateBranch', { owner: item.owner, repo: item.repo, n: item.prNumber }))
          const res = await window.api.pr.prUpdateBranch({
            owner: item.owner,
            repo: item.repo,
            number: item.prNumber,
            expectedHeadSha: g.data.headSha as string,
          })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      } else if (kind === 'deleteRemoteBranch') {
        const list = deleteTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          opLog.appendLine(t('prManager.operationLog.lineDeleteRemote', { owner: item.owner, repo: item.repo, branch: item.branch }))
          const res = await window.api.pr.githubDeleteRemoteBranch({
            owner: item.owner,
            repo: item.repo,
            branch: item.branch,
            repoId: item.repoId,
          })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(250)
        }
      } else if (kind === 'createPr') {
        const list = createTargets.filter(x => x.eligible && enabledIds.has(x.id) && !results[x.id]?.ok)
        for (const item of list) {
          setCurrentId(item.id)
          const title = (createTitles[item.id] ?? item.suggestedTitle).trim()
          if (!title) {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: t('prManager.bulk.toast.emptyTitle') } }))
            opLog.appendLine(t('prManager.operationLog.lineCreatePr', { owner: item.owner, repo: item.repo, head: item.head, base: item.base }))
            lineErr(t('prManager.bulk.toast.emptyTitle'))
            await sleep(100)
            continue
          }
          opLog.appendLine(t('prManager.operationLog.lineCreatePr', { owner: item.owner, repo: item.repo, head: item.head, base: item.base }))
          const res = await window.api.pr.prCreate({
            projectId,
            repoId: item.repoId,
            owner: item.owner,
            repo: item.repo,
            title,
            body: '',
            head: item.head,
            base: item.base,
            draft: createDraft,
            openInBrowser: false,
            userId: userId!.trim(),
          })
          if (res.status === 'success') {
            markRowSuccess(item.id)
            lineOk()
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
            lineErr(res.message || '—')
          }
          await sleep(200)
        }
      }

      opLog.finishSuccess()
      await Promise.resolve(onAfterBatch())
      toast.success(t('prManager.bulk.toast.doneToast'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('prManager.bulk.toast.unexpected')
      opLog.finishError(msg)
      toast.error(msg)
    } finally {
      setCurrentId(null)
      setRunning(false)
    }
  }

  const handleSuggestAllTitles = async () => {
    if (createTemplateIds.size === 0 || suggestingTitles) return
    const list = createTargets.filter(x => x.eligible && enabledIds.has(x.id))
    if (list.length === 0) return
    if (!opLog.startOperation('prManager.operationLog.titleSuggestTitles', undefined, { silent: true })) return
    setSuggestingTitles(true)
    try {
      for (const item of list) {
        opLog.appendLine(t('prManager.operationLog.suggestLine', { owner: item.owner, repo: item.repo, ref: item.head }))
        const res = await window.api.pr.refCommitMessages({
          owner: item.owner,
          repo: item.repo,
          ref: item.head,
          maxCommits: 500,
        })
        if (res.status === 'success' && res.data) {
          const picked = pickIssueKeyAndVersion(res.data, item.head)
          if (picked) {
            setCreateTitles(prev => ({
              ...prev,
              [item.id]: buildIssueStylePrTitle(picked.key, picked.version, item.base),
            }))
            opLog.appendLine(t('prManager.operationLog.lineOk'))
          } else {
            opLog.appendLine(t('prManager.operationLog.lineError', { message: t('prManager.createPr.toastPattern') }))
          }
        } else {
          opLog.appendLine(t('prManager.operationLog.lineError', { message: res.message || t('prManager.createPr.toastLoadHistory') }))
        }
        await sleep(120)
      }
      opLog.finishSuccess()
    } catch (e) {
      opLog.finishError(e instanceof Error ? e.message : t('prManager.bulk.toast.unexpected'))
    } finally {
      setSuggestingTitles(false)
    }
  }

  const closeDialog = () => {
    if (dialogBusy) return
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (v) {
          onOpenChange(true)
          return
        }
        if (dialogBusy) return
        onOpenChange(false)
      }}
    >
      <DialogContent className="font-sans flex max-h-[min(90dvh,720px)] min-h-0 w-full max-w-4xl! flex-col gap-0 overflow-hidden border-0 bg-card p-0 shadow-xl sm:max-w-3xl">
        <DialogHeader className={cn('shrink-0 border-b border-border/80 px-4 py-3 pr-12 text-left', bulkChrome.headerBar)}>
          <DialogTitle className={cn('text-base font-semibold tracking-tight', bulkChrome.title)}>{t(titleKey)}</DialogTitle>
          <DialogDescription>
            {t('prManager.bulk.summary', {
              rows: selectedRows.length,
              run: kind === 'requestReviewers' ? runCount : eligibleCount,
            })}
          </DialogDescription>
          {!githubTokenOk ? (
            <Alert className="mt-1 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100 [&>svg]:text-amber-700 dark:[&>svg]:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">{t('prManager.bulk.noToken')}</AlertDescription>
            </Alert>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-muted/15 px-4 py-3 dark:bg-muted/10">
          {kind === 'createPr' ? (
            <div className="shrink-0 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 min-w-0 sm:col-span-2">
                <Label className="text-xs">{t('prManager.bulk.createTemplates')}</Label>
                <p className="text-xs text-muted-foreground">{t('prManager.bulk.createTemplatesHint')}</p>
                {prTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('prManager.emptyNoTemplates')}</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-gray-500/25 bg-muted/25 p-2 dark:border-gray-400/20">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {prTemplates.map(tpl => {
                        const checked = createTemplateIds.has(tpl.id)
                        const disabled = dialogBusy || (checked && createTemplateIds.size <= 1)
                        return (
                          <div key={tpl.id} className="flex min-h-7 items-center gap-2 text-xs">
                            <div className="flex shrink-0 items-center justify-center self-center">
                              <Checkbox
                                id={`bulk-create-tpl-${tpl.id}`}
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={v => toggleCreateTemplateId(tpl.id, v === true)}
                              />
                            </div>
                            <Label
                              htmlFor={disabled ? undefined : `bulk-create-tpl-${tpl.id}`}
                              className={cn(
                                'line-clamp-2 min-w-0 font-normal',
                                disabled && checked ? 'cursor-not-allowed text-foreground' : 'cursor-pointer'
                              )}
                              title={`${tpl.label} (${tpl.code})`}
                            >
                              <span className="font-medium">{tpl.label}</span>
                              <span className="text-muted-foreground"> · {tpl.code}</span>
                              {tpl.targetBranch ? (
                                <span className="text-muted-foreground"> → {tpl.targetBranch}</span>
                              ) : null}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="bulk-create-draft" checked={createDraft} onCheckedChange={v => setCreateDraft(v === true)} disabled={dialogBusy} />
                <Label htmlFor="bulk-create-draft" className="cursor-pointer text-sm font-normal">
                  {t('prManager.bulk.createAsDraft')}
                </Label>
              </div>
            </div>
          ) : null}

          {kind === 'merge' ? (
            <div className="shrink-0 space-y-2">
              <Label className="text-xs">{t('prManager.bulk.mergeMethod')}</Label>
              <RadioGroup value={mergeMethod} onValueChange={v => setMergeMethod(v as MergeMethod)} className="flex flex-wrap gap-3">
                {(['squash', 'merge', 'rebase'] as const).map(m => (
                  <div key={m} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={m} id={`bulk-merge-${m}`} disabled={dialogBusy} />
                    <Label htmlFor={`bulk-merge-${m}`} className="cursor-pointer font-normal">
                      {t(`prManager.mergePr.method.${m}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          {kind === 'requestReviewers' ? (
            <div className="shrink-0 space-y-2">
              <Label className="text-xs">
                {t('prManager.bulk.requestReviewersFromRepo', {
                  count: assigneesLoadState === 'loading' ? '…' : String(repoAssigneeLogins.length),
                })}
              </Label>
              {assigneesLoadState === 'loading' ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  {t('prManager.bulk.requestReviewersLoadingAssignees')}
                </div>
              ) : assigneesLoadState === 'error' ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">{t('prManager.bulk.requestReviewersAssigneesError')}</p>
              ) : repoAssigneeLogins.length > 0 ? (
                <div className="max-h-36 overflow-y-auto rounded-md border border-gray-500/25 bg-muted/25 p-2 dark:border-gray-400/20">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {repoAssigneeLogins.map(login => {
                      const loginKey = login.trim().toLowerCase()
                      const isPrAuthorInBatch = bulkPrAuthorLoginSet.has(loginKey)
                      const isChecked = !isPrAuthorInBatch && requestReviewersPicked.some(x => x.trim().toLowerCase() === loginKey)
                      return (
                        <div
                          key={login}
                          className="flex min-h-7 items-center gap-2 text-xs"
                          title={isPrAuthorInBatch ? t('prManager.bulk.requestReviewersAssigneeIsAuthor') : undefined}
                        >
                          <div className="flex shrink-0 items-center justify-center self-center">
                            <Checkbox
                              id={`bulk-rev-${login}`}
                              checked={isChecked}
                              disabled={dialogBusy || isPrAuthorInBatch}
                              onCheckedChange={v => {
                                if (isPrAuthorInBatch) return
                                if (v === true) {
                                  setRequestReviewersPicked(prev => (prev.some(x => x.trim().toLowerCase() === loginKey) ? prev : [...prev, login]))
                                } else {
                                  setRequestReviewersPicked(prev => prev.filter(x => x.trim().toLowerCase() !== loginKey))
                                }
                              }}
                            />
                          </div>
                          <Label
                            htmlFor={isPrAuthorInBatch ? undefined : `bulk-rev-${login}`}
                            className={cn('font-normal', isPrAuthorInBatch ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                          >
                            {login}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('prManager.bulk.requestReviewersNoAssignees')}</p>
              )}
              <p className="text-xs text-muted-foreground">{t('prManager.bulk.requestReviewersAuthorNote')}</p>
            </div>
          ) : null}

          <div
            className={cn(
              'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed border-emerald-500/30 bg-muted/30 px-2.5 py-2 dark:border-emerald-400/25',
              kind === 'createPr' && 'justify-between'
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox id="bulk-show-eligible-only" checked={showOnlyEligibleRows} onCheckedChange={v => setShowOnlyEligibleRows(v === true)} disabled={dialogBusy} />
              <Label htmlFor="bulk-show-eligible-only" className="cursor-pointer text-xs font-normal leading-tight">
                {t('prManager.bulk.showOnlyEligible')}
              </Label>
            </div>
            {kind === 'createPr' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('gap-1 shrink-0', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                disabled={dialogBusy}
                onClick={() => void handleSuggestAllTitles()}
              >
                {suggestingTitles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {t('prManager.bulk.suggestTitles')}
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(52dvh,420px)] w-full overflow-y-auto overflow-x-auto overscroll-y-contain rounded-md border border-border/80 bg-card shadow-xs">
            <Table className="w-full table-fixed text-xs">
              <tbody data-slot="table-body" className="[&_tr:last-child]:border-0">
                {kind === 'deleteRemoteBranch'
                  ? groupedTableDelete.map((grp, groupIdx) => {
                    const repoCollapsed = collapsedRepoGroupKeys.has(grp.key)
                    const vis = PR_MANAGER_REPO_GROUP_VISUAL[groupIdx % PR_MANAGER_REPO_GROUP_VISUAL.length]
                    return (
                      <Fragment key={grp.key}>
                        <TableRow className="border-0 bg-transparent">
                          <TableCell colSpan={3} className="p-0">
                            <button
                              type="button"
                              className={cn(
                                'flex w-full min-h-0 items-center gap-2 px-3 py-2.5 text-left transition-colors',
                                'hover:brightness-[1.01] dark:hover:brightness-[1.03]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
                                vis.row,
                                vis.accent
                              )}
                              onClick={() => toggleRepoGroupCollapse(grp.key)}
                              aria-expanded={!repoCollapsed}
                              aria-label={repoCollapsed ? t('prManager.bulk.repoGroupExpand') : t('prManager.bulk.repoGroupCollapse')}
                            >
                              <ChevronDown
                                className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out', repoCollapsed && '-rotate-90')}
                                aria-hidden
                              />
                              <span className="min-w-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                                {grp.owner}/{grp.repo}
                              </span>
                              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">({grp.items.length})</span>
                            </button>
                          </TableCell>
                        </TableRow>
                        <BulkRepoGroupCollapsibleRows collapsed={repoCollapsed} toneRowClassName={vis.row}>
                          {grp.items.map((item, itemIdx) => {
                            const flat = (bulkStripeOffDelete[groupIdx] ?? 0) + itemIdx
                            const stripe = bulkItemRowStripeCellClass(flat)
                            return (
                              <TableRow key={item.id}>
                                <TableCell className={cn('w-10 px-2 align-middle', stripe)}>
                                  <div className="flex min-h-8 items-center justify-center">
                                    <Checkbox
                                      checked={enabledIds.has(item.id)}
                                      disabled={!item.eligible || dialogBusy || !!results[item.id]?.ok}
                                      onCheckedChange={() => toggleId(item.id, item.eligible)}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className={cn('min-w-0 p-2 text-xs', stripe)}>
                                  <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 break-words">
                                    <span className="font-medium">{item.branch}</span>
                                    {item.eligible && !results[item.id]?.ok ? (
                                      <>
                                        <span className="text-muted-foreground">·</span>
                                        <span className={BULK_ELIGIBLE_HINT_CLASS}>{t('prManager.bulk.itemEligibleHint')}</span>
                                      </>
                                    ) : null}
                                    {!item.eligible && item.skipReasonKey ? (
                                      <>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="text-xs text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  {item.prColumnSummaries.length > 0 ? (
                                    <div className="mt-0.5 break-words leading-snug text-muted-foreground">
                                      {item.prColumnSummaries.map((col, i) => (
                                        <Fragment key={`${col.templateLabel}\0${i}`}>
                                          {i > 0 ? <span className="text-muted-foreground/60"> | </span> : null}
                                          <span>
                                            {col.templateLabel} - {t(`prManager.bulk.deletePrColumnStatuses.${col.status}`)}
                                          </span>
                                        </Fragment>
                                      ))}
                                    </div>
                                  ) : null}
                                </TableCell>
                                <TableCell className={cn(BULK_STATUS_COL_CLASS, stripe)}>
                                  <div className="flex min-h-8 items-center justify-center">
                                    {running && currentId === item.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                                    {results[item.id] ? (
                                      results[item.id].ok ? (
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                      ) : (
                                        <span className="line-clamp-2 text-xs text-rose-600" title={results[item.id].message}>
                                          {t('prManager.bulk.error')}
                                        </span>
                                      )
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </BulkRepoGroupCollapsibleRows>
                      </Fragment>
                    )
                  })
                  : null}

                {kind === 'createPr'
                  ? groupedTableCreateByTemplate.map(tplGrp => {
                    const tplKey = `bc:tpl:${tplGrp.templateId}`
                    const tplCollapsed = collapsedRepoGroupKeys.has(tplKey)
                    const tplDef = prTemplates.find(t => t.id === tplGrp.templateId) ?? activeTemplates.find(t => t.id === tplGrp.templateId)
                    const tplHeadClass = checkpointTableHeadGroupClass(tplDef?.headerGroupId)
                    const tplRowCount = tplGrp.repoGroups.reduce((n, g) => n + g.items.length, 0)
                    const baseHint = (tplGrp.targetBranch?.trim() || tplGrp.repoGroups[0]?.items[0]?.base || '').trim()
                    return (
                      <Fragment key={tplGrp.templateId}>
                        <TableRow className="border-0">
                          <TableCell colSpan={3} className={cn('border-0 p-0 align-top backdrop-blur-sm', tplHeadClass)}>
                            <button
                              type="button"
                              className={cn(
                                'flex w-full min-h-0 items-center gap-2 border-b border-border/50 bg-transparent px-3 py-2.5 text-left transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset'
                              )}
                              onClick={() => toggleRepoGroupCollapse(tplKey)}
                              aria-expanded={!tplCollapsed}
                              aria-label={tplCollapsed ? t('prManager.bulk.templateGroupExpand') : t('prManager.bulk.templateGroupCollapse')}
                            >
                              <ChevronDown
                                className={cn('size-4 shrink-0 opacity-70 transition-transform duration-300 ease-out', tplCollapsed && '-rotate-90')}
                                aria-hidden
                              />
                              <span className="min-w-0 text-left text-xs font-semibold leading-snug">
                                <span className="font-sans">{tplGrp.label}</span>
                                <span className="font-normal opacity-85"> · {tplGrp.code}</span>
                                {baseHint ? <span className="font-normal opacity-85"> → {baseHint}</span> : null}
                              </span>
                              <span className="ml-auto shrink-0 text-xs tabular-nums opacity-80">({tplRowCount})</span>
                            </button>
                          </TableCell>
                        </TableRow>
                        <BulkRepoGroupCollapsibleRows collapsed={tplCollapsed}>
                          {tplGrp.repoGroups.map((grp, groupIdx) => {
                            const repoKey = `bc:repo:${tplGrp.templateId}:${grp.key}`
                            const repoCollapsed = collapsedRepoGroupKeys.has(repoKey)
                            const visRepo = PR_MANAGER_REPO_GROUP_VISUAL[groupIdx % PR_MANAGER_REPO_GROUP_VISUAL.length]
                            return (
                              <Fragment key={repoKey}>
                                <TableRow className="border-0 bg-transparent">
                                  <TableCell colSpan={3} className="p-0">
                                    <button
                                      type="button"
                                      className={cn(
                                        'flex w-full min-h-0 items-center gap-2 border-b border-border/30 py-2 pr-3 pl-8 text-left transition-colors',
                                        'hover:brightness-[1.01] dark:hover:brightness-[1.03]',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
                                        visRepo.row,
                                        visRepo.accent
                                      )}
                                      onClick={() => toggleRepoGroupCollapse(repoKey)}
                                      aria-expanded={!repoCollapsed}
                                      aria-label={repoCollapsed ? t('prManager.bulk.repoGroupExpand') : t('prManager.bulk.repoGroupCollapse')}
                                    >
                                      <ChevronDown
                                        className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out', repoCollapsed && '-rotate-90')}
                                        aria-hidden
                                      />
                                      <span className="min-w-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                                        {grp.owner}/{grp.repo}
                                      </span>
                                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">({grp.items.length})</span>
                                    </button>
                                  </TableCell>
                                </TableRow>
                                <BulkRepoGroupCollapsibleRows collapsed={repoCollapsed} toneRowClassName={visRepo.row}>
                                  {grp.items.map(item => {
                                    const stripe = bulkTemplateGroupStripeCellClass(bulkCreateStripeByItemId[item.id] ?? 0)
                                    return (
                                      <TableRow key={item.id}>
                                        <TableCell className={cn('w-10 px-2 align-middle', stripe)}>
                                          <div className="flex min-h-8 items-center justify-center">
                                            <Checkbox
                                              checked={enabledIds.has(item.id)}
                                              disabled={!item.eligible || dialogBusy || !!results[item.id]?.ok}
                                              onCheckedChange={() => toggleId(item.id, item.eligible)}
                                            />
                                          </div>
                                        </TableCell>
                                        <TableCell className={cn('min-w-0 p-2 text-xs', stripe)}>
                                          {item.existingPrNumber != null ? (
                                            <>
                                              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 break-words">
                                                <button
                                                  type="button"
                                                  className="shrink-0 text-left font-medium text-primary hover:underline"
                                                  onClick={e => {
                                                    e.stopPropagation()
                                                    const n = item.existingPrNumber
                                                    if (n != null) openUrlInDefaultBrowser(githubPrWebUrl(item.owner, item.repo, n))
                                                  }}
                                                >
                                                  #{item.existingPrNumber}
                                                </button>
                                                <span className="shrink-0 text-muted-foreground">·</span>
                                                <span>{(item.existingPrTitle ?? '').trim() || `PR #${item.existingPrNumber}`}</span>
                                                {!item.eligible && item.skipReasonKey ? (
                                                  <>
                                                    <span className="shrink-0 text-muted-foreground">·</span>
                                                    <span className="shrink-0 text-xs text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</span>
                                                  </>
                                                ) : null}
                                                {item.eligible && !results[item.id]?.ok ? (
                                                  <>
                                                    <span className="shrink-0 text-muted-foreground">·</span>
                                                    <span className={cn('shrink-0', BULK_ELIGIBLE_HINT_CLASS)}>{t('prManager.bulk.itemEligibleHint')}</span>
                                                  </>
                                                ) : null}
                                              </div>
                                              <div className="mt-0.5 break-words text-xs text-muted-foreground">
                                                {item.head} → {item.base}
                                              </div>
                                            </>
                                          ) : (
                                            <div className="flex flex-col gap-2">
                                              <div className="flex min-w-0 items-center gap-2">
                                                <Input
                                                  value={createTitles[item.id] ?? ''}
                                                  onChange={e => setCreateTitles(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                  disabled={!item.eligible || dialogBusy || !!results[item.id]?.ok}
                                                  className="h-8 min-w-0 flex-1 text-xs sm:min-w-[10rem]"
                                                  placeholder={item.suggestedTitle}
                                                />
                                                {item.eligible && !results[item.id]?.ok ? (
                                                  <span
                                                    className={cn(BULK_ELIGIBLE_HINT_CLASS, 'max-w-[min(100%,11rem)] shrink-0 truncate sm:max-w-[13rem]')}
                                                    title={t('prManager.bulk.itemEligibleHint')}
                                                  >
                                                    {t('prManager.bulk.itemEligibleHint')}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words text-xs text-muted-foreground">
                                                <span>
                                                  {item.head} → {item.base}
                                                </span>
                                                {!item.eligible && item.skipReasonKey ? (
                                                  <>
                                                    <span className="text-muted-foreground/60" aria-hidden>
                                                      ·
                                                    </span>
                                                    <span className="text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</span>
                                                  </>
                                                ) : null}
                                              </div>
                                            </div>
                                          )}
                                        </TableCell>
                                        <TableCell className={cn(BULK_STATUS_COL_CLASS, stripe)}>
                                          <div className="flex min-h-8 items-center justify-center">
                                            {running && currentId === item.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                                            {results[item.id] ? (
                                              results[item.id].ok ? (
                                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                              ) : (
                                                <span className="line-clamp-2 text-xs text-rose-600" title={results[item.id].message}>
                                                  {t('prManager.bulk.error')}
                                                </span>
                                              )
                                            ) : null}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </BulkRepoGroupCollapsibleRows>
                              </Fragment>
                            )
                          })}
                        </BulkRepoGroupCollapsibleRows>
                      </Fragment>
                    )
                  })
                  : null}

                {kind !== 'deleteRemoteBranch' && kind !== 'createPr'
                  ? groupedTablePr.map((grp, groupIdx) => {
                    const repoCollapsed = collapsedRepoGroupKeys.has(grp.key)
                    const vis = PR_MANAGER_REPO_GROUP_VISUAL[groupIdx % PR_MANAGER_REPO_GROUP_VISUAL.length]
                    return (
                      <Fragment key={grp.key}>
                        <TableRow className="border-0 bg-transparent">
                          <TableCell colSpan={3} className="p-0">
                            <button
                              type="button"
                              className={cn(
                                'flex w-full min-h-0 items-center gap-2 px-3 py-2.5 text-left transition-colors',
                                'hover:brightness-[1.01] dark:hover:brightness-[1.03]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
                                vis.row,
                                vis.accent
                              )}
                              onClick={() => toggleRepoGroupCollapse(grp.key)}
                              aria-expanded={!repoCollapsed}
                              aria-label={repoCollapsed ? t('prManager.bulk.repoGroupExpand') : t('prManager.bulk.repoGroupCollapse')}
                            >
                              <ChevronDown
                                className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out', repoCollapsed && '-rotate-90')}
                                aria-hidden
                              />
                              <span className="min-w-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                                {grp.owner}/{grp.repo}
                              </span>
                              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">({grp.items.length})</span>
                            </button>
                          </TableCell>
                        </TableRow>
                        <BulkRepoGroupCollapsibleRows collapsed={repoCollapsed} toneRowClassName={vis.row}>
                          {grp.items.map((item, itemIdx) => {
                            const mergedSkip = item.skipReasonKey === 'prManager.bulk.skip.merged'
                            const flat = (bulkStripeOffPr[groupIdx] ?? 0) + itemIdx
                            const stripe = bulkItemRowStripeCellClass(flat)
                            return (
                              <TableRow key={item.id}>
                                <TableCell className={cn('w-10 px-2 align-middle', stripe)}>
                                  <div className="flex min-h-8 items-center justify-center">
                                    <Checkbox
                                      checked={enabledIds.has(item.id)}
                                      disabled={!item.eligible || dialogBusy || !!results[item.id]?.ok}
                                      onCheckedChange={() => toggleId(item.id, item.eligible)}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className={cn('min-w-0 p-2 text-xs', stripe)}>
                                  <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 break-words">
                                    <button
                                      type="button"
                                      className="shrink-0 text-left font-medium text-primary hover:underline"
                                      onClick={e => {
                                        e.stopPropagation()
                                        openUrlInDefaultBrowser(githubPrWebUrl(item.owner, item.repo, item.prNumber))
                                      }}
                                    >
                                      #{item.prNumber}
                                    </button>
                                    <span className="shrink-0 text-muted-foreground">·</span>
                                    <span>{item.templateLabel}</span>
                                    {!item.eligible && item.skipReasonKey ? (
                                      <>
                                        <span className="shrink-0 text-muted-foreground">·</span>
                                        <span className="shrink-0 text-xs text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</span>
                                      </>
                                    ) : null}
                                    {item.eligible && !results[item.id]?.ok ? (
                                      <>
                                        <span className="shrink-0 text-muted-foreground">·</span>
                                        <span className={cn('shrink-0', BULK_ELIGIBLE_HINT_CLASS)}>{t('prManager.bulk.itemEligibleHint')}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words text-xs text-muted-foreground">
                                    {!mergedSkip ? (
                                      <span>
                                        {item.headBranch}
                                        {item.baseBranch ? ` → ${item.baseBranch}` : ''}
                                      </span>
                                    ) : null}
                                    {!mergedSkip ? <span className="text-muted-foreground/60" aria-hidden>·</span> : null}
                                    <span>
                                      {t('prManager.bulk.itemAuthorLine', {
                                        author: (item.ghPrAuthor ?? '').trim() || '—',
                                      })}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className={cn(BULK_STATUS_COL_CLASS, stripe)}>
                                  <div className="flex min-h-8 items-center justify-center">
                                    {running && currentId === item.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                                    {results[item.id] ? (
                                      results[item.id].ok ? (
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                      ) : (
                                        <span className="line-clamp-2 text-xs text-rose-600" title={results[item.id].message}>
                                          {t('prManager.bulk.error')}
                                        </span>
                                      )
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </BulkRepoGroupCollapsibleRows>
                      </Fragment>
                    )
                  })
                  : null}

                {kind === 'deleteRemoteBranch' && deleteTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      {t('prManager.bulk.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind === 'createPr' && createTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      {t('prManager.bulk.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind !== 'deleteRemoteBranch' && kind !== 'createPr' && prTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      {t('prManager.bulk.emptyPr')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind === 'deleteRemoteBranch' && showOnlyEligibleRows && deleteTargets.length > 0 && tableDeleteTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      {t('prManager.bulk.showOnlyEligibleEmpty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind === 'createPr' && showOnlyEligibleRows && createTargets.length > 0 && tableCreateTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      {t('prManager.bulk.showOnlyEligibleEmpty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind !== 'deleteRemoteBranch' && kind !== 'createPr' && showOnlyEligibleRows && prTargets.length > 0 && tablePrTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      {t('prManager.bulk.showOnlyEligibleEmpty')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </tbody>
            </Table>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 bg-muted/40 px-4 py-3">
          <Button type="button" variant="outline" onClick={closeDialog} disabled={dialogBusy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void runBatch()} disabled={dialogBusy || !githubTokenOk || runCount === 0}>
            {running ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                {t('prManager.bulk.running')}
              </>
            ) : (
              t('prManager.bulk.runButton', { count: runCount })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
