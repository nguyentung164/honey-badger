'use client'

import { GitBranch, ListOrdered, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { GitConflictPanel } from '@/components/conflict/GitConflictPanel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'

/** Mỗi lần chỉ tải tối đa số commit này cho mỗi panel (git log -n). */
const MAX_LOG_COUNT = 30

interface GitCherryPickBranchesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
  selectedProjectId?: string | null
  selectedSourceFolder?: string | null
}

interface LogRow {
  hash: string
  subject: string
  author: string
  date?: string
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function mergeLogRows(existing: LogRow[], incoming: LogRow[]): LogRow[] {
  if (incoming.length === 0) return existing
  const seen = new Set(existing.map(r => r.hash))
  const out = [...existing]
  for (const r of incoming) {
    if (!seen.has(r.hash)) {
      seen.add(r.hash)
      out.push(r)
    }
  }
  return out
}

function parseGitLogJson(data: string | undefined): LogRow[] {
  if (!data) return []
  try {
    const parsed = JSON.parse(data) as { hash: string; subject: string; author: string; date: string }[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(c => ({
      hash: c.hash,
      subject: (c.subject || '').split('\n')[0] || '',
      author: c.author || '',
      date: c.date,
    }))
  } catch {
    return []
  }
}

function isWorkingTreeDirty(data: {
  conflicted?: string[]
  not_added?: string[]
  created?: string[]
  deleted?: string[]
  modified?: string[]
  renamed?: string[]
  staged?: string[]
}): boolean {
  return (
    (data.conflicted?.length ?? 0) > 0 ||
    (data.not_added?.length ?? 0) > 0 ||
    (data.created?.length ?? 0) > 0 ||
    (data.deleted?.length ?? 0) > 0 ||
    (data.modified?.length ?? 0) > 0 ||
    (data.renamed?.length ?? 0) > 0 ||
    (data.staged?.length ?? 0) > 0
  )
}

async function getHeadHash(cwd: string): Promise<string> {
  const r = await window.api.git.log('.', { cwd, revision: 'HEAD', maxCount: 1 })
  if (r.status !== 'success' || !r.data) return ''
  const rows = parseGitLogJson(r.data as string)
  return rows[0]?.hash ?? ''
}

function buildBranchOptions(branches: { local?: { all?: string[] }; remote?: { all?: string[] } } | null): { value: string; label: string }[] {
  if (!branches) return []
  const local = (branches.local?.all || []).map(b => ({ value: b, label: `${b} (local)` }))
  const remote = (branches.remote?.all || [])
    .filter(b => !b.endsWith('/HEAD'))
    .map(b => ({ value: b, label: `${b} (remote)` }))
  return [...local, ...remote]
}

function buildLocalBranchOptions(
  branches: { local?: { all?: string[] } } | null
): { value: string; label: string }[] {
  if (!branches) return []
  return (branches.local?.all || []).map(b => ({ value: b, label: `${b} (local)` }))
}

export function GitCherryPickBranchesDialog({ open, onOpenChange, onComplete }: GitCherryPickBranchesDialogProps) {
  const { t } = useTranslation()
  const { sourceFolderList, loadSourceFolderConfig } = useSourceFolderStore()
  const repos = useMemo(
    () =>
      sourceFolderList
        .map(f => ({ path: (f.path ?? '').trim(), name: f.name ?? f.path ?? '' }))
        .filter(f => !!f.path),
    [sourceFolderList]
  )
  const [reposLoading, setReposLoading] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<{ path: string; name: string } | null>(null)
  const sourceFolder = selectedRepo?.path

  const [branches, setBranches] = useState<{ local?: { all?: string[] }; remote?: { all?: string[] }; current?: string } | null>(null)
  const [currentBranch, setCurrentBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState<string | null>(null)
  const [sourceBranch, setSourceBranch] = useState<string | null>(null)
  const [branchesLoading, setBranchesLoading] = useState(false)
  /** UI: nút nào đang quay khi fetch / reload log. */
  const [refreshSide, setRefreshSide] = useState<'repo' | 'left' | 'right' | null>(null)
  const refreshRemoteInFlight = useRef(false)

  const [leftLog, setLeftLog] = useState<LogRow[]>([])
  const [rightLog, setRightLog] = useState<LogRow[]>([])
  const [rightFullLog, setRightFullLog] = useState(false)
  const [logLoadingLeft, setLogLoadingLeft] = useState(false)
  const [logLoadingRight, setLogLoadingRight] = useState(false)
  const [loadingMoreLeft, setLoadingMoreLeft] = useState(false)
  const [loadingMoreRight, setLoadingMoreRight] = useState(false)
  const [hasMoreLeft, setHasMoreLeft] = useState(true)
  const [hasMoreRight, setHasMoreRight] = useState(true)

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const loadMoreLeftInFlight = useRef(false)
  const loadMoreRightInFlight = useRef(false)
  const clearBranchSelectionOnNextLoadRef = useRef(false)
  /** Lần cuối effect phải đã “thấy” bộ (target, source, full) — dùng để không refetch phải khi chỉ đổi target. */
  const prevRightSeenRef = useRef<{ target: string; source: string; full: boolean } | null>(null)

  const [selectedRight, setSelectedRight] = useState<Set<string>>(() => new Set())
  const [highlightLeft, setHighlightLeft] = useState<Set<string>>(() => new Set())

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [showConflictPanel, setShowConflictPanel] = useState(false)
  const [createNewBranch, setCreateNewBranch] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')

  const queueRef = useRef<string[]>([])
  const pickedNewHashesRef = useRef<string[]>([])
  const firstHighlightLeftIndex = useMemo(() => leftLog.findIndex(r => highlightLeft.has(r.hash)), [leftLog, highlightLeft])

  const targetBranchOptions = useMemo(() => buildLocalBranchOptions(branches), [branches])
  const sourceBranchOptions = useMemo(() => buildBranchOptions(branches), [branches])

  const loadBranches = useCallback(async () => {
    if (!sourceFolder) return
    setBranchesLoading(true)
    try {
      const [brRes, stRes] = await Promise.all([
        window.api.git.get_branches(sourceFolder),
        window.api.git.status({ cwd: sourceFolder }),
      ])
      if (brRes.status === 'success' && brRes.data) {
        setBranches(brRes.data)
        const cur = brRes.data.current || (stRes.status === 'success' && stRes.data?.current ? stRes.data.current : '') || ''
        setCurrentBranch(cur)
        const targetOpts = buildLocalBranchOptions(brRes.data)
        const sourceOpts = buildBranchOptions(brRes.data)
        if (clearBranchSelectionOnNextLoadRef.current) {
          clearBranchSelectionOnNextLoadRef.current = false
          setTargetBranch(null)
          setSourceBranch(null)
          return
        }
        if (targetOpts.length > 0) {
          // Target chỉ cho phép local branch để tránh detached HEAD (checkout origin/main -> commit không nằm trên branch).
          setTargetBranch(prev => (prev && targetOpts.some(o => o.value === prev) ? prev : cur || targetOpts[0].value))
        } else {
          setTargetBranch(null)
        }
        if (sourceOpts.length > 0) {
          const firstOther = sourceOpts.find(o => o.value !== (cur || sourceOpts[0].value))
          setSourceBranch(prev => (prev && sourceOpts.some(o => o.value === prev) ? prev : firstOther?.value ?? sourceOpts[0].value))
        } else {
          setSourceBranch(null)
        }
      } else {
        toast.error(brRes.message || t('git.cherryPickBranches.loadBranchesError'))
      }
    } catch (e) {
      logger.error(e)
      toast.error(t('git.cherryPickBranches.loadBranchesError'))
    } finally {
      setBranchesLoading(false)
    }
  }, [sourceFolder, t])

  const loadLeftLog = useCallback(async () => {
    const target = targetBranch?.trim() ?? ''
    if (!sourceFolder || !target) {
      setLeftLog([])
      setHasMoreLeft(false)
      return
    }
    setLogLoadingLeft(true)
    setHasMoreLeft(true)
    try {
      const r = await window.api.git.log('.', {
        cwd: sourceFolder,
        revision: target,
        maxCount: MAX_LOG_COUNT,
        skip: 0,
      })
      if (r.status === 'success' && r.data) {
        const rows = parseGitLogJson(r.data as string)
        setLeftLog(rows)
        setHasMoreLeft(rows.length >= MAX_LOG_COUNT)
      } else {
        setLeftLog([])
        setHasMoreLeft(false)
        if (r.status === 'error') toast.error(r.message || t('git.cherryPickBranches.loadLogError'))
      }
    } catch (e) {
      logger.error(e)
      setLeftLog([])
      setHasMoreLeft(false)
      toast.error(t('git.cherryPickBranches.loadLogError'))
    } finally {
      setLogLoadingLeft(false)
    }
  }, [sourceFolder, targetBranch, t])

  const loadMoreLeft = useCallback(async () => {
    const target = targetBranch?.trim() ?? ''
    if (!sourceFolder || !target || !hasMoreLeft || loadingMoreLeft || logLoadingLeft || loadMoreLeftInFlight.current) return
    loadMoreLeftInFlight.current = true
    setLoadingMoreLeft(true)
    try {
      const r = await window.api.git.log('.', {
        cwd: sourceFolder,
        revision: target,
        maxCount: MAX_LOG_COUNT,
        skip: leftLog.length,
      })
      if (r.status === 'success' && r.data) {
        const rows = parseGitLogJson(r.data as string)
        setLeftLog(prev => mergeLogRows(prev, rows))
        setHasMoreLeft(rows.length >= MAX_LOG_COUNT)
      } else {
        setHasMoreLeft(false)
      }
    } catch (e) {
      logger.error(e)
      setHasMoreLeft(false)
    } finally {
      setLoadingMoreLeft(false)
      loadMoreLeftInFlight.current = false
    }
  }, [sourceFolder, targetBranch, hasMoreLeft, loadingMoreLeft, logLoadingLeft, leftLog.length])

  const loadRightLog = useCallback(async () => {
    const target = targetBranch?.trim() ?? ''
    const source = sourceBranch?.trim() ?? ''
    if (!sourceFolder || !target || !source) {
      setRightLog([])
      setHasMoreRight(false)
      return
    }
    if (target === source) {
      setRightLog([])
      setHasMoreRight(false)
      return
    }
    setLogLoadingRight(true)
    setHasMoreRight(true)
    try {
      const options: {
        cwd: string
        maxCount: number
        skip?: number
        commitFrom?: string
        commitTo?: string
        revision?: string
      } = {
        cwd: sourceFolder,
        maxCount: MAX_LOG_COUNT,
        skip: 0,
      }
      if (rightFullLog) {
        options.revision = source
      } else {
        options.commitFrom = target
        options.commitTo = source
      }
      const r = await window.api.git.log('.', options)
      if (r.status === 'success' && r.data) {
        const rows = parseGitLogJson(r.data as string)
        setRightLog(rows)
        setHasMoreRight(rows.length >= MAX_LOG_COUNT)
      } else {
        setRightLog([])
        setHasMoreRight(false)
        if (r.status === 'error') toast.error(r.message || t('git.cherryPickBranches.loadLogError'))
      }
    } catch (e) {
      logger.error(e)
      setRightLog([])
      setHasMoreRight(false)
      toast.error(t('git.cherryPickBranches.loadLogError'))
    } finally {
      setLogLoadingRight(false)
    }
  }, [sourceFolder, targetBranch, sourceBranch, rightFullLog, t])

  const loadMoreRight = useCallback(async () => {
    const target = targetBranch?.trim() ?? ''
    const source = sourceBranch?.trim() ?? ''
    if (
      !sourceFolder ||
      !target ||
      !source ||
      target === source ||
      !hasMoreRight ||
      loadingMoreRight ||
      logLoadingRight ||
      loadMoreRightInFlight.current
    ) {
      return
    }
    loadMoreRightInFlight.current = true
    setLoadingMoreRight(true)
    try {
      const options: {
        cwd: string
        maxCount: number
        skip: number
        commitFrom?: string
        commitTo?: string
        revision?: string
      } = {
        cwd: sourceFolder,
        maxCount: MAX_LOG_COUNT,
        skip: rightLog.length,
      }
      if (rightFullLog) {
        options.revision = source
      } else {
        options.commitFrom = target
        options.commitTo = source
      }
      const r = await window.api.git.log('.', options)
      if (r.status === 'success' && r.data) {
        const rows = parseGitLogJson(r.data as string)
        setRightLog(prev => mergeLogRows(prev, rows))
        setHasMoreRight(rows.length >= MAX_LOG_COUNT)
      } else {
        setHasMoreRight(false)
      }
    } catch (e) {
      logger.error(e)
      setHasMoreRight(false)
    } finally {
      setLoadingMoreRight(false)
      loadMoreRightInFlight.current = false
    }
  }, [
    sourceFolder,
    targetBranch,
    sourceBranch,
    rightFullLog,
    hasMoreRight,
    loadingMoreRight,
    logLoadingRight,
    rightLog.length,
  ])

  /**
   * Cùng ý nghĩa với icon load ở hai nhánh: tải lại list commit đang hiển thị
   * (trái: nhánh đích; phải: nguồn / range — khi đủ điều kiện).
   */
  const reloadRepoVisibleCommits = useCallback(async () => {
    if (!sourceFolder || branchesLoading || refreshRemoteInFlight.current) return
    refreshRemoteInFlight.current = true
    setRefreshSide('repo')
    try {
      const tasks: Promise<void>[] = []
      if (targetBranch?.trim()) tasks.push(loadLeftLog())
      if (targetBranch?.trim() && sourceBranch?.trim() && targetBranch !== sourceBranch) {
        tasks.push(loadRightLog())
      }
      await Promise.all(tasks)
    } catch (e) {
      logger.error(e)
    } finally {
      refreshRemoteInFlight.current = false
      setRefreshSide(null)
    }
  }, [sourceFolder, branchesLoading, targetBranch, sourceBranch, loadLeftLog, loadRightLog])

  /** Tải lại danh sách commit của nhánh đích (panel trái). */
  const reloadTargetCommits = useCallback(async () => {
    if (!sourceFolder || !targetBranch?.trim() || branchesLoading || refreshRemoteInFlight.current) return
    refreshRemoteInFlight.current = true
    setRefreshSide('left')
    try {
      await loadLeftLog()
    } catch (e) {
      logger.error(e)
    } finally {
      refreshRemoteInFlight.current = false
      setRefreshSide(null)
    }
  }, [sourceFolder, branchesLoading, targetBranch, loadLeftLog])

  /** Tải lại danh sách commit panel phải (theo target/source / full log). */
  const reloadSourceCommits = useCallback(async () => {
    if (!sourceFolder || branchesLoading || refreshRemoteInFlight.current) return
    if (!targetBranch?.trim() || !sourceBranch?.trim() || targetBranch === sourceBranch) return
    refreshRemoteInFlight.current = true
    setRefreshSide('right')
    try {
      await loadRightLog()
    } catch (e) {
      logger.error(e)
    } finally {
      refreshRemoteInFlight.current = false
      setRefreshSide(null)
    }
  }, [sourceFolder, branchesLoading, targetBranch, sourceBranch, loadRightLog])

  const handleLeftScroll = useCallback(() => {
    const el = leftScrollRef.current
    if (!el || logLoadingLeft || loadingMoreLeft || !hasMoreLeft) return
    if (el.scrollHeight - (el.scrollTop + el.clientHeight) <= 80) {
      void loadMoreLeft()
    }
  }, [logLoadingLeft, loadingMoreLeft, hasMoreLeft, loadMoreLeft])

  const handleRightScroll = useCallback(() => {
    const el = rightScrollRef.current
    if (
      !el ||
      logLoadingRight ||
      loadingMoreRight ||
      !hasMoreRight ||
      !targetBranch?.trim() ||
      !sourceBranch?.trim() ||
      targetBranch === sourceBranch
    ) {
      return
    }
    if (el.scrollHeight - (el.scrollTop + el.clientHeight) <= 80) {
      void loadMoreRight()
    }
  }, [logLoadingRight, loadingMoreRight, hasMoreRight, targetBranch, sourceBranch, loadMoreRight])

  const handleRepoComboboxChange = useCallback(
    (v: string) => {
      if (running) return
      const next = repos.find(r => r.path === v) ?? null
      if (!next || (selectedRepo && normPath(next.path) === normPath(selectedRepo.path))) return
      setSelectedRepo(next)
      setBranchesLoading(false)
      clearBranchSelectionOnNextLoadRef.current = true
      setTargetBranch(null)
      setSourceBranch(null)
      setBranches(null)
      setCurrentBranch('')
      setLeftLog([])
      setRightLog([])
      setRightFullLog(false)
      setSelectedRight(new Set())
      setHighlightLeft(new Set())
      setHasMoreLeft(false)
      setHasMoreRight(false)
      setLogLoadingLeft(false)
      setLogLoadingRight(false)
      setLoadingMoreLeft(false)
      setLoadingMoreRight(false)
      loadMoreLeftInFlight.current = false
      loadMoreRightInFlight.current = false
      queueRef.current = []
      pickedNewHashesRef.current = []
      prevRightSeenRef.current = null
    },
    [repos, selectedRepo, running]
  )

  /** Mỗi lần mở dialog: không chọn repo mặc định; tải lại danh sách source folder. */
  useEffect(() => {
    if (!open) return
    setSelectedRepo(null)
    setBranches(null)
    setCurrentBranch('')
    setTargetBranch(null)
    setSourceBranch(null)
    setLeftLog([])
    setRightLog([])
    setRightFullLog(false)
    setHasMoreLeft(false)
    setHasMoreRight(false)
    setSelectedRight(new Set())
    setHighlightLeft(new Set())
    setCreateNewBranch(false)
    setNewBranchName('')
    prevRightSeenRef.current = null
    clearBranchSelectionOnNextLoadRef.current = false
    queueRef.current = []
    pickedNewHashesRef.current = []
    setReposLoading(true)
    loadSourceFolderConfig().finally(() => setReposLoading(false))
  }, [open, loadSourceFolderConfig])

  useEffect(() => {
    if (!open || !sourceFolder) return
    loadBranches()
  }, [open, sourceFolder, loadBranches])

  useEffect(() => {
    prevRightSeenRef.current = null
  }, [sourceFolder])

  useEffect(() => {
    if (!open) prevRightSeenRef.current = null
  }, [open])

  const loadLeftLogRef = useRef(loadLeftLog)
  const loadRightLogRef = useRef(loadRightLog)
  loadLeftLogRef.current = loadLeftLog
  loadRightLogRef.current = loadRightLog

  /** Chỉ load log trái (target) khi đổi target / repo / mở dialog. Bỏ qua khi đang chạy cherry-pick. */
  useEffect(() => {
    if (!open || !sourceFolder || !targetBranch?.trim() || running) return
    setSelectedRight(new Set())
    void loadLeftLogRef.current()
  }, [open, sourceFolder, targetBranch, running])

  /**
   * Chỉ load log phải khi đổi source hoặc full-log / repo / mở dialog.
   * Không refetch phải khi chỉ đổi combobox target (trái) — tránh gọi cả hai API cùng lúc.
   */
  useEffect(() => {
    if (!open || !sourceFolder || !targetBranch?.trim() || !sourceBranch?.trim()) return

    const target = targetBranch ?? ''
    const source = sourceBranch ?? ''
    const prev = prevRightSeenRef.current
    const onlyTargetChanged =
      prev != null &&
      prev.target !== target &&
      prev.source === source &&
      prev.full === rightFullLog

    if (onlyTargetChanged) {
      if (target === source) {
        setRightLog([])
        setHasMoreRight(false)
      }
      prevRightSeenRef.current = { target, source, full: rightFullLog }
      return
    }

    if (target === source) {
      setRightLog([])
      setHasMoreRight(false)
      prevRightSeenRef.current = { target, source, full: rightFullLog }
      return
    }

    setSelectedRight(new Set())
    void loadRightLogRef.current()
    prevRightSeenRef.current = { target, source, full: rightFullLog }
  }, [open, sourceFolder, targetBranch, sourceBranch, rightFullLog])

  useEffect(() => {
    if (!open || firstHighlightLeftIndex < 0) return
    const el = document.querySelector(`[data-cherry-pick-left-row="${firstHighlightLeftIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open, firstHighlightLeftIndex, leftLog])

  useEffect(() => {
    if (!open) {
      setSelectedRight(new Set())
      setHighlightLeft(new Set())
      setShowConflictPanel(false)
      queueRef.current = []
      pickedNewHashesRef.current = []
      setRunning(false)
      setConfirmOpen(false)
      setCreateNewBranch(false)
      setNewBranchName('')
    }
  }, [open])

  const toggleSelectRight = useCallback((e: MouseEvent<HTMLTableRowElement>, hash: string) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedRight(prev => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }, [])

  const sortSelectedForPick = useCallback(
    (selected: Set<string>): string[] => {
      const indexMap = new Map(rightLog.map((row, i) => [row.hash, i]))
      return [...selected].sort((a, b) => {
        const ia = indexMap.get(a) ?? -1
        const ib = indexMap.get(b) ?? -1
        return ib - ia
      })
    },
    [rightLog]
  )

  const runQueue = useCallback(async (): Promise<boolean> => {
    const cwd = sourceFolder
    if (!cwd) return false

    try {
      while (queueRef.current.length > 0) {
        const h = queueRef.current[0]
        const result = await window.api.git.cherry_pick(h, cwd)
        if (result.status === 'success') {
          const head = await getHeadHash(cwd)
          if (head) pickedNewHashesRef.current.push(head)
          queueRef.current.shift()
        } else if (result.status === 'conflict') {
          toast.warning(t('git.cherryPick.conflicts'))
          setShowConflictPanel(true)
          setRunning(false)
          return false
        } else {
          toast.error(result.message || t('git.cherryPick.error'))
          setRunning(false)
          queueRef.current = []
          return false
        }
      }

      setShowConflictPanel(false)
      queueRef.current = []
      await loadLeftLogRef.current()
      setHighlightLeft(new Set(pickedNewHashesRef.current))
      window.dispatchEvent(new CustomEvent('git-branch-changed'))
      toast.success(t('git.cherryPickBranches.success'))
      onComplete?.()
      return true
    } catch (e) {
      logger.error(e)
      toast.error(t('git.cherryPick.error'))
      return false
    } finally {
      setRunning(false)
    }
  }, [sourceFolder, onComplete, t])

  const handleConflictResolved = useCallback(async () => {
    const cwd = sourceFolder
    if (!cwd) return
    try {
      const head = await getHeadHash(cwd)
      if (head) pickedNewHashesRef.current.push(head)
      queueRef.current.shift()
      setShowConflictPanel(false)
      setRunning(true)
      await runQueue()
    } catch (e) {
      logger.error(e)
      setRunning(false)
    }
  }, [sourceFolder, runQueue])

  const handleConflictAbort = useCallback(() => {
    queueRef.current = []
    pickedNewHashesRef.current = []
    setRunning(false)
    setShowConflictPanel(false)
    void loadLeftLog()
  }, [loadLeftLog])

  const isValidBranchName = (name: string): boolean => {
    if (!name) return false
    // Git branch name rules: no spaces, no ~^:?*[\, no .., no trailing /, no @{}
    if (/[\s~^:?*[\\]@{}]/.test(name) || name.includes('..')) return false
    if (name.startsWith('/') || name.endsWith('/')) return false
    if (name.endsWith('.lock')) return false
    return true
  }

  const handleCherryPickClick = () => {
    if (!sourceFolder || !targetBranch || !sourceBranch || targetBranch === sourceBranch) {
      toast.warning(t('git.cherryPickBranches.selectBranches'))
      return
    }
    if (selectedRight.size === 0) {
      toast.warning(t('git.cherryPickBranches.selectCommits'))
      return
    }
    if (createNewBranch && !isValidBranchName(newBranchName.trim())) {
      toast.warning(t('git.cherryPickBranches.invalidBranchName'))
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirmExecute = async () => {
    setConfirmOpen(false)
    const cwd = sourceFolder
    const target = targetBranch?.trim() ?? ''
    const newName = newBranchName.trim()
    if (!cwd) return

    const cs = await window.api.git.get_conflict_status(cwd)
    if (cs.status === 'success' && cs.data?.conflictType) {
      toast.error(t('git.cherryPickBranches.stateBlocked'))
      return
    }

    const st = await window.api.git.status({ cwd })
    if (st.status !== 'success' || !st.data) {
      toast.error(t('git.cherryPickBranches.statusError'))
      return
    }
    if (!st.data.current?.trim()) {
      toast.error(t('git.cherryPickBranches.detachedHeadBlocked'))
      return
    }
    if (isWorkingTreeDirty(st.data)) {
      toast.error(t('git.cherryPickBranches.dirtyTree'))
      return
    }

    setRunning(true)
    pickedNewHashesRef.current = []
    setHighlightLeft(new Set())

    // Dùng biến local để tránh stale closure state
    const willCreateNew = createNewBranch && !!newName

    if (willCreateNew) {
      // create_branch(name, base, cwd) tự tạo và checkout sang nhánh mới từ base — không cần checkout trước
      const cr = await window.api.git.create_branch(newName, target, cwd)
      if (cr.status !== 'success') {
        toast.error(cr.message || t('git.cherryPickBranches.newBranchError'))
        setRunning(false)
        return
      }
      // Cập nhật targetBranch về nhánh mới TRƯỚC khi cherry-pick để
      // loadLeftLogRef.current() gọi sau khi xong sẽ load log nhánh mới
      setTargetBranch(newName)
      setCreateNewBranch(false)
      setNewBranchName('')
    } else {
      if (st.data.current !== target) {
        const co = await window.api.git.checkout_branch(target, undefined, cwd)
        if (co.status !== 'success') {
          toast.error(co.message || t('git.cherryPickBranches.checkoutError'))
          setRunning(false)
          return
        }
      }
    }

    const ordered = sortSelectedForPick(selectedRight)
    queueRef.current = ordered
    const succeeded = await runQueue()
    // Reload danh sách branch để nhánh mới xuất hiện trong combobox — chỉ khi thành công
    if (willCreateNew && succeeded) {
      void loadBranches()
    }
  }

  const sameBranch = !!(targetBranch && sourceBranch && targetBranch === sourceBranch)
  const newBranchNameTrimmed = newBranchName.trim()
  const canRun =
    !running &&
    !branchesLoading &&
    !reposLoading &&
    !!sourceFolder &&
    !!targetBranch &&
    !!sourceBranch &&
    !sameBranch &&
    selectedRight.size > 0 &&
    !showConflictPanel &&
    (!createNewBranch || !!newBranchNameTrimmed)

  const renderRepoPicker = () => (
    <div className="shrink-0 space-y-2">
      <Label>{t('git.cherryPickBranches.repo')}</Label>
      <div className="flex gap-2">
        <Combobox
          className="min-w-0 flex-1"
          value={selectedRepo?.path ?? ''}
          onValueChange={handleRepoComboboxChange}
          options={repos.map(r => ({ value: r.path, label: r.name }))}
          disabled={reposLoading || !!refreshSide || running}
          placeholder={reposLoading ? t('common.loading') : t('git.cherryPickBranches.repoPlaceholder')}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={!sourceFolder || branchesLoading || !!refreshSide || reposLoading || !targetBranch?.trim()}
          title={t('git.cherryPickBranches.refreshRepoTooltip')}
          aria-label={t('git.cherryPickBranches.refreshRepoTooltip')}
          onClick={() => void reloadRepoVisibleCommits()}
        >
          <RefreshCw className={cn('h-4 w-4', refreshSide === 'repo' && 'animate-spin')} />
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="!flex h-[min(90vh,70rem)] max-h-[90vh] w-full max-w-[90vw]! flex-col gap-4 overflow-x-hidden overflow-y-hidden overscroll-none p-6"
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5" />
              {t('git.cherryPickBranches.title')}
            </DialogTitle>
            <DialogDescription>{t('git.cherryPickBranches.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-0">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                {renderRepoPicker()}
                {showConflictPanel && sourceFolder ? (
                  <div className="shrink-0 space-y-2 rounded-md border bg-muted/30 p-2">
                    <p className="text-sm font-medium">{t('git.cherryPickBranches.conflictPanelTitle')}</p>
                    <GitConflictPanel
                      sourceFolder={sourceFolder}
                      onResolved={handleConflictResolved}
                      onAbort={handleConflictAbort}
                      compact
                    />
                  </div>
                ) : null}

                <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Label className="shrink-0 text-sm font-medium">{t('git.cherryPickBranches.targetBranch')}</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="create-new-branch"
                          checked={createNewBranch}
                          onCheckedChange={v => {
                            setCreateNewBranch(v)
                            if (!v) setNewBranchName('')
                          }}
                          disabled={!sourceFolder || running}
                        />
                        <Label htmlFor="create-new-branch" className="cursor-pointer text-sm font-normal">
                          {t('git.cherryPickBranches.createNewBranch')}
                        </Label>
                      </div>
                    </div>
                    {createNewBranch ? (
                      <>
                        <p className="text-xs text-muted-foreground">{t('git.cherryPickBranches.baseBranchHint')}</p>
                        <div className="flex gap-2">
                          <Combobox
                            className="min-w-0 flex-1"
                            value={targetBranch ?? ''}
                            onValueChange={setTargetBranch}
                            disabled={branchesLoading || !!refreshSide || running || !sourceFolder}
                            options={targetBranchOptions}
                            placeholder={t('git.cherryPickBranches.branchPlaceholder')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            disabled={!sourceFolder || branchesLoading || !!refreshSide || !targetBranch?.trim()}
                            title={t('git.cherryPickBranches.refreshFetchTooltip')}
                            aria-label={t('git.cherryPickBranches.refreshFetchTooltip')}
                            onClick={() => void reloadTargetCommits()}
                          >
                            <RefreshCw className={cn('h-4 w-4', refreshSide === 'left' && 'animate-spin')} />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <Input
                            className="h-8 text-sm"
                            placeholder={t('git.cherryPickBranches.newBranchNamePlaceholder')}
                            value={newBranchName}
                            onChange={e => setNewBranchName(e.target.value)}
                            disabled={running}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <Combobox
                          className="min-w-0 flex-1"
                          value={targetBranch ?? ''}
                          onValueChange={setTargetBranch}
                          disabled={branchesLoading || !!refreshSide || running || !sourceFolder}
                          options={targetBranchOptions}
                          placeholder={t('git.cherryPickBranches.branchPlaceholder')}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          disabled={!sourceFolder || branchesLoading || !!refreshSide || !targetBranch?.trim()}
                          title={t('git.cherryPickBranches.refreshFetchTooltip')}
                          aria-label={t('git.cherryPickBranches.refreshFetchTooltip')}
                          onClick={() => void reloadTargetCommits()}
                        >
                          <RefreshCw className={cn('h-4 w-4', refreshSide === 'left' && 'animate-spin')} />
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t('git.cherryPickBranches.targetHint', { branch: currentBranch || '—' })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('git.cherryPickBranches.sourceBranch')}</Label>
                    <div className="flex gap-2">
                      <Combobox
                        className="min-w-0 flex-1"
                        value={sourceBranch ?? ''}
                        onValueChange={setSourceBranch}
                        disabled={branchesLoading || !!refreshSide || running}
                        options={sourceBranchOptions}
                        placeholder={t('git.cherryPickBranches.branchPlaceholder')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        disabled={
                          !sourceFolder ||
                          branchesLoading ||
                          !!refreshSide ||
                          !targetBranch?.trim() ||
                          !sourceBranch?.trim() ||
                          targetBranch === sourceBranch
                        }
                        title={t('git.cherryPickBranches.refreshFetchTooltipSource')}
                        aria-label={t('git.cherryPickBranches.refreshFetchTooltipSource')}
                        onClick={() => void reloadSourceCommits()}
                      >
                        <RefreshCw className={cn('h-4 w-4', refreshSide === 'right' && 'animate-spin')} />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="right-full-log"
                      checked={rightFullLog}
                      onCheckedChange={v => setRightFullLog(!!v)}
                      disabled={!sourceBranch || !targetBranch || sameBranch}
                    />
                    <Label htmlFor="right-full-log" className="text-sm font-normal cursor-pointer">
                      {t('git.cherryPickBranches.fullRightLog')}
                    </Label>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('git.cherryPickBranches.maxCountHint', { count: MAX_LOG_COUNT })}
                  </span>
                </div>

                <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 basis-0 overflow-hidden rounded-md border">
                  <ResizablePanel defaultSize={50} minSize={25} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <div className="shrink-0 border-b bg-muted/40 px-2 py-1.5 text-xs font-medium">{t('git.cherryPickBranches.panelTarget')}</div>
                    <div
                      ref={leftScrollRef}
                      onScroll={handleLeftScroll}
                      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
                    >
                      {logLoadingLeft ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <Table>
                            <TableHeader sticky>
                              <TableRow>
                                <TableHead className="w-[100px] font-mono text-xs">{t('git.cherryPickBranches.colHash')}</TableHead>
                                <TableHead>{t('git.cherryPickBranches.colMessage')}</TableHead>
                                <TableHead className="w-[100px]">{t('git.cherryPickBranches.colAuthor')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {leftLog.map((row, idx) => {
                                const isHi = highlightLeft.has(row.hash)
                                return (
                                  <TableRow
                                    key={row.hash}
                                    data-cherry-pick-left-row={idx}
                                    className={cn(isHi && 'bg-primary/15')}
                                  >
                                    <TableCell className="font-mono text-xs">{row.hash.slice(0, 7)}</TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={row.subject}>
                                      {row.subject}
                                    </TableCell>
                                    <TableCell className="text-xs truncate">{row.author}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                          {loadingMoreLeft && hasMoreLeft && (
                            <div className="flex justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle={false} />
                  <ResizablePanel defaultSize={50} minSize={25} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <div className="shrink-0 border-b bg-muted/40 px-2 py-1.5 text-xs font-medium">{t('git.cherryPickBranches.panelSource')}</div>
                    <div
                      ref={rightScrollRef}
                      onScroll={handleRightScroll}
                      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
                    >
                      {logLoadingRight ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : sameBranch ? (
                        <p className="p-4 text-sm text-muted-foreground">{t('git.cherryPickBranches.sameBranch')}</p>
                      ) : (
                        <>
                          <Table>
                            <TableHeader sticky>
                              <TableRow>
                                <TableHead className="w-[100px] font-mono text-xs">{t('git.cherryPickBranches.colHash')}</TableHead>
                                <TableHead>{t('git.cherryPickBranches.colMessage')}</TableHead>
                                <TableHead className="w-[100px]">{t('git.cherryPickBranches.colAuthor')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className="[&>tr[data-selected=true]]:!bg-primary/15 [&>tr[data-selected=true]]:hover:!bg-primary/10">
                              {rightLog.map(row => {
                                const sel = selectedRight.has(row.hash)
                                return (
                                  <TableRow
                                    key={row.hash}
                                    data-selected={sel ? 'true' : undefined}
                                    className={cn(
                                      'cursor-pointer',
                                      sel && '!bg-primary/10 hover:!bg-primary/15'
                                    )}
                                    onClick={e => toggleSelectRight(e, row.hash)}
                                  >
                                    <TableCell className="font-mono text-xs">{row.hash.slice(0, 7)}</TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={row.subject}>
                                      {row.subject}
                                    </TableCell>
                                    <TableCell className="text-xs truncate">{row.author}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                          {loadingMoreRight && hasMoreRight && (
                            <div className="flex justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
          </div>

          <DialogFooter className="shrink-0 sm:justify-end">
            <Button type="button" variant="default" disabled={!canRun} onClick={handleCherryPickClick}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ListOrdered className="h-4 w-4 mr-2" />}
              {createNewBranch && newBranchNameTrimmed
                ? t('git.cherryPickBranches.actionNewBranch', { branch: newBranchNameTrimmed })
                : t('git.cherryPickBranches.action', { branch: targetBranch || '…' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.cherryPickBranches.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{t('git.cherryPickBranches.confirmIntro', {
                  target: (createNewBranch && newBranchNameTrimmed) ? `[new] ${newBranchNameTrimmed}` : (targetBranch ?? ''),
                  source: sourceBranch ?? '',
                })}</p>
                <ul className="list-disc pl-4 max-h-40 overflow-y-auto space-y-1">
                  {sortSelectedForPick(selectedRight).map(h => {
                    const row = rightLog.find(r => r.hash === h)
                    return (
                      <li key={h} className="font-mono text-xs">
                        {h.slice(0, 7)} — {row?.subject ?? ''}
                      </li>
                    )
                  })}
                </ul>
                <p className="text-amber-600 dark:text-amber-400">{t('git.cherryPickBranches.confirmWarn')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmExecute()}>{t('git.cherryPickBranches.confirmAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
