'use client'

import { addDays, format, parseISO } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import { CalendarIcon, ChevronDown, File, Loader2, Plus, RefreshCw, User, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { GIT_STATUS_COLOR_CLASS_MAP, GIT_STATUS_TEXT, STATUS_COLOR_CLASS_MAP, STATUS_TEXT } from '@/components/shared/constants'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUS_ICON } from '@/components/ui-elements/StatusIcon'
import toast from '@/components/ui-elements/Toast'
import { getDateOnlyPattern, getDateTimeWithSecondsDisplayPattern, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const getDateFnsLocale = (language: string) => {
  switch (language) {
    case 'ja':
      return ja
    case 'vi':
      return vi
    default:
      return enUS
  }
}

interface CommitItem {
  revision: string
  message: string
  author: string
  date: string
  files?: { filePath: string; status: string }[]
  sourceFolderPath?: string
  branch?: string
}

function commitKey(c: CommitItem): string {
  return `${c.sourceFolderPath ?? ''}:${c.revision}`
}

function getFirstLine(msg: string): string {
  const first = (msg || '').split(/\r?\n/)[0]?.trim()
  return first || '-'
}

function getStatusCounts(files: { filePath: string; status: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const f of files) {
    const code = f.status?.trim() || '?'
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return counts
}

function StatusIconsWithCount({ files, vcsType, className }: { files: { filePath: string; status: string }[]; vcsType: string | null; className?: string }) {
  const { t } = useTranslation()
  const counts = getStatusCounts(files)
  const isGit = vcsType === 'git'
  const statusTextMap = isGit ? GIT_STATUS_TEXT : STATUS_TEXT
  const colorMap = isGit ? GIT_STATUS_COLOR_CLASS_MAP : STATUS_COLOR_CLASS_MAP

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {Array.from(counts.entries()).map(([code, count]) => {
        const Icon = (STATUS_ICON as Record<string, React.ElementType>)[code] ?? File
        const colorClass = (colorMap as Record<string, string>)[code] ?? 'text-muted-foreground'
        const label = (statusTextMap as Record<string, string>)[code] ? t((statusTextMap as Record<string, string>)[code]) : code
        return (
          <Tooltip key={code}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5">
                <Icon strokeWidth={1.5} className={cn('w-3.5 h-3.5', colorClass)} />
                <span className="text-xs">({count})</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {label} ({count})
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function CommitDetailDialog({ commit, vcsType, onClose }: { commit: CommitItem; vcsType: string | null; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default border-0 bg-black/50 p-0"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-base font-semibold font-mono truncate" title={commit.revision}>
            {commit.revision.length > 12 ? `${commit.revision.substring(0, 12)}...` : commit.revision}
          </h3>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 -mr-4 pr-4">
          <div className="p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('dailyReport.commitMessage')}</h4>
              <p className="text-sm whitespace-pre-wrap">{commit.message || '-'}</p>
            </div>
            {commit.files && commit.files.length > 0 && (
              <div className="text-left">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 text-left">
                  {t('dailyReport.files')} ({commit.files.length})
                </h4>
                <div className="max-h-[250px] overflow-y-auto rounded-md border p-2 space-y-1.5 text-left">
                  {commit.files.map((f, j) => {
                    const Icon = (STATUS_ICON as Record<string, React.ElementType>)[f.status?.trim() || '?'] ?? File
                    const isGit = vcsType === 'git'
                    const colorMap = isGit ? GIT_STATUS_COLOR_CLASS_MAP : STATUS_COLOR_CLASS_MAP
                    const colorClass = (colorMap as Record<string, string>)[f.status?.trim() || '?'] ?? 'text-muted-foreground'
                    return (
                      <div key={j} className="flex items-center gap-2 text-sm">
                        <Icon strokeWidth={1.5} className={cn('w-4 h-4 shrink-0', colorClass)} />
                        <span className="break-all">{f.filePath}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

interface DevReportFormProps {
  initialReportDate?: string
  initialProjectId?: string | null
  initialProjectIds?: string[]
  refreshKey?: number
  onSuccess?: () => void
  isPlOrAdmin?: boolean
}

const MAX_FOLDERS = 10

function initialProjectIdsFromProps(initialProjectId?: string | null, initialProjectIds?: string[]): string[] {
  if (initialProjectIds && initialProjectIds.length > 0) return initialProjectIds
  if (initialProjectId) return [initialProjectId]
  return []
}

export function DevReportForm({ initialReportDate, initialProjectId, initialProjectIds, refreshKey, onSuccess, isPlOrAdmin = false }: DevReportFormProps) {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const { sourceFolderList, loadSourceFolderConfig } = useSourceFolderStore()
  const { sourceFolder, versionControlSystem } = useConfigurationStore()
  const locale = getDateFnsLocale(i18n.language)
  const dateDisplayPattern = getDateOnlyPattern(i18n.language)

  const [reportDate, setReportDate] = useState(() => initialReportDate ?? format(new Date(), 'yyyy-MM-dd'))
  const [projectIds, setProjectIds] = useState<string[]>(() => initialProjectIdsFromProps(initialProjectId, initialProjectIds))

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const isPastDate = reportDate < todayStr
  const isReadOnly = isPastDate && !isPlOrAdmin

  useEffect(() => {
    if (initialReportDate) setReportDate(initialReportDate)
    if (initialProjectId !== undefined || initialProjectIds !== undefined) {
      setProjectIds(initialProjectIdsFromProps(initialProjectId, initialProjectIds))
    }
  }, [initialReportDate, initialProjectId, initialProjectIds, refreshKey])

  const [workDescription, setWorkDescription] = useState('')
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set())
  const [folderVcsTypes, setFolderVcsTypes] = useState<Record<string, 'git' | 'svn'>>({})
  const [commits, setCommits] = useState<CommitItem[]>([])
  const [savedCommits, setSavedCommits] = useState<CommitItem[]>([])
  const [selectedCommit, setSelectedCommit] = useState<CommitItem | null>(null)
  const [isLoadingCommits, setIsLoadingCommits] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [displayFolderList, setDisplayFolderList] = useState<{ id: string; name: string; path: string }[]>([])
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)

  const loadSourceFolders = useCallback(async () => {
    await loadSourceFolderConfig()
  }, [loadSourceFolderConfig])

  useEffect(() => {
    loadSourceFolders()
  }, [loadSourceFolders])

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const res = await window.api.task.getProjectsForUser()
      if (res.status === 'success' && res.data) {
        setProjects(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      } else {
        setProjects([])
      }
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    if (user) loadProjects()
    else setProjects([])
  }, [user, loadProjects])

  const loadFoldersRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    const requestId = randomUuidV7()
    loadFoldersRequestIdRef.current = requestId

    const load = async () => {
      if (projectIds.length > 0 && user) {
        setIsLoadingFolders(true)
        try {
          const res = await window.api.task.getSourceFoldersByProjects(projectIds)
          if (loadFoldersRequestIdRef.current !== requestId) return
          if (res.status === 'success' && res.data) {
            setDisplayFolderList(res.data)
          } else if (res.status === 'error' && (res as { code?: string }).code === 'UNAUTHORIZED') {
            toast.warning(t('common.sessionExpired'))
            setDisplayFolderList([])
          } else {
            setDisplayFolderList([])
          }
        } catch {
          if (loadFoldersRequestIdRef.current !== requestId) return
          setDisplayFolderList([])
        } finally {
          if (loadFoldersRequestIdRef.current === requestId) {
            setIsLoadingFolders(false)
          }
        }
      } else {
        setDisplayFolderList([])
        setIsLoadingFolders(false)
      }
    }
    load()
  }, [projectIds, user, t])

  useEffect(() => {
    if (displayFolderList.length > 0) {
      setSelectedFolderIds(prev => {
        const valid = new Set(prev)
        const idSet = new Set(displayFolderList.map(f => f.id))
        for (const id of prev) {
          if (!idSet.has(id)) valid.delete(id)
        }
        if (valid.size === 0 && displayFolderList.length > 0) {
          valid.add(displayFolderList[0].id)
        }
        return valid
      })
    }
  }, [displayFolderList])

  useEffect(() => {
    if (displayFolderList.length > 0 && selectedFolderIds.size === 0 && !hasInitializedFolderSelectionRef.current) {
      hasInitializedFolderSelectionRef.current = true
      const current = displayFolderList.find(f => f.path === sourceFolder)
      if (current) {
        setSelectedFolderIds(new Set([current.id]))
        setFolderVcsTypes(prev => ({
          ...prev,
          [current.path]: (versionControlSystem as 'git' | 'svn') || 'git',
        }))
      } else {
        const first = displayFolderList[0]
        setSelectedFolderIds(new Set([first.id]))
        setFolderVcsTypes(prev => ({ ...prev, [first.path]: 'git' }))
      }
    }
  }, [displayFolderList, sourceFolder, versionControlSystem, selectedFolderIds.size])

  const effectiveFolders = useMemo(() => {
    const list = displayFolderList.filter(f => selectedFolderIds.has(f.id))
    return list.filter(f => folderVcsTypes[f.path]).map(f => ({ path: f.path, vcsType: folderVcsTypes[f.path] }))
  }, [displayFolderList, selectedFolderIds, folderVcsTypes])

  const loadCommits = useCallback(async () => {
    if (effectiveFolders.length === 0 || !user) return
    setIsLoadingCommits(true)
    setCommits([])
    try {
      const res = await window.api.dailyReport.getCommitsTodayMultiple({
        folders: effectiveFolders,
        reportDate,
      })
      if (res.status === 'success' && res.data) {
        setCommits(res.data)
      } else {
        toast.error(res.message || t('dailyReport.loadCommitsFailed'))
      }
    } catch {
      toast.error(t('dailyReport.loadCommitsError'))
    } finally {
      setIsLoadingCommits(false)
    }
  }, [effectiveFolders, reportDate, user])

  const loadCommitsRef = useRef(loadCommits)
  loadCommitsRef.current = loadCommits

  const savedSelectedCommitsRef = useRef<CommitItem[]>([])
  const hasInitializedFolderSelectionRef = useRef(false)
  const userHasManuallyChangedFoldersRef = useRef(false)

  /** Id từ API (selectedSourceFolders) */
  const [savedSourceFolderIds, setSavedSourceFolderIds] = useState<string[]>([])
  /** Path từ API khi chưa có id (tương thích / load trước khi có folder list) */
  const [savedPathHints, setSavedPathHints] = useState<string[]>([])
  const [hasExistingReport, setHasExistingReport] = useState(false)

  const loadExistingReport = useCallback(async () => {
    if (!user) return
    try {
      const res = await window.api.dailyReport.getMine(reportDate)
      if (res.status === 'success' && res.data) {
        setHasExistingReport(true)
        setWorkDescription(res.data.workDescription || '')
        const ids = res.data.projectIds && res.data.projectIds.length > 0 ? res.data.projectIds : res.data.projectId ? [res.data.projectId] : []
        setProjectIds(ids)
        const sf = (res.data.selectedSourceFolders ?? []) as { id: string; path: string; name?: string }[]
        if (sf.length > 0) {
          setSavedSourceFolderIds(sf.map(x => x.id))
          setSavedPathHints([])
        } else {
          setSavedSourceFolderIds([])
          setSavedPathHints((res.data.selectedSourceFolderPaths ?? []) as string[])
        }
        const saved = (res.data.selectedCommits ?? []) as CommitItem[]
        if (saved.length) {
          savedSelectedCommitsRef.current = saved
          setSavedCommits(saved)
        } else {
          savedSelectedCommitsRef.current = []
          setSavedCommits([])
          // Không xóa savedSourceFolderIds / savedPathHints: báo cáo có thể không có commit nhưng vẫn có folder đã chọn
        }
      } else {
        setHasExistingReport(false)
        setProjectIds([])
        savedSelectedCommitsRef.current = []
        setSavedCommits([])
        setSavedSourceFolderIds([])
        setSavedPathHints([])
      }
    } catch {
      setHasExistingReport(false)
      setProjectIds([])
      savedSelectedCommitsRef.current = []
      setSavedCommits([])
      setSavedSourceFolderIds([])
      setSavedPathHints([])
    }
  }, [user, reportDate])

  useEffect(() => {
    userHasManuallyChangedFoldersRef.current = false
  }, [reportDate, refreshKey])

  useEffect(() => {
    if (displayFolderList.length === 0) return
    if (userHasManuallyChangedFoldersRef.current) return
    const idsToAdd = new Set<string>()
    for (const id of savedSourceFolderIds) {
      if (displayFolderList.some(f => f.id === id)) idsToAdd.add(id)
    }
    if (idsToAdd.size === 0 && savedPathHints.length > 0) {
      savedPathHints.forEach(p => {
        const f = displayFolderList.find(x => x.path === p)
        if (f) idsToAdd.add(f.id)
      })
    }
    if (idsToAdd.size === 0 && savedCommits.length > 0) {
      savedCommits.forEach(c => {
        if (!c.sourceFolderPath) return
        const f = displayFolderList.find(x => x.path === c.sourceFolderPath)
        if (f) idsToAdd.add(f.id)
      })
    }
    if (idsToAdd.size > 0) {
      hasInitializedFolderSelectionRef.current = true
      setSelectedFolderIds(prev => {
        const next = new Set(prev)
        idsToAdd.forEach(id => {
          next.add(id)
        })
        return next.size === prev.size ? prev : next
      })
      setFolderVcsTypes(prev => {
        const updates: Record<string, 'git' | 'svn'> = {}
        for (const id of idsToAdd) {
          const p = displayFolderList.find(f => f.id === id)?.path
          if (p && !prev[p]) updates[p] = 'git'
        }
        return Object.keys(updates).length ? { ...prev, ...updates } : prev
      })
    }
  }, [savedSourceFolderIds, savedPathHints, savedCommits, displayFolderList])

  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const DEBOUNCE_MS = 300

  useEffect(() => {
    if (!user) return
    if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current)
    let cancelled = false
    loadDebounceRef.current = setTimeout(async () => {
      loadDebounceRef.current = null
      await loadExistingReport()
      if (cancelled) return
      loadCommitsRef.current()
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      if (loadDebounceRef.current) {
        clearTimeout(loadDebounceRef.current)
        loadDebounceRef.current = null
      }
    }
  }, [loadExistingReport, user, refreshKey, reportDate])

  const effectiveFoldersKey = useMemo(
    () =>
      effectiveFolders
        .map(f => f.path)
        .sort()
        .join(','),
    [effectiveFolders]
  )
  useEffect(() => {
    if (!user || effectiveFoldersKey === '') return
    loadCommitsRef.current()
  }, [user, effectiveFoldersKey])

  const allFoldersSelected = displayFolderList.length > 0 && selectedFolderIds.size === Math.min(displayFolderList.length, MAX_FOLDERS)

  const toggleAllFolders = useCallback(() => {
    if (allFoldersSelected) {
      userHasManuallyChangedFoldersRef.current = true
      setSelectedFolderIds(new Set())
    } else {
      const toSelect = displayFolderList.slice(0, MAX_FOLDERS)
      setSelectedFolderIds(new Set(toSelect.map(f => f.id)))
      const updates: Record<string, 'git' | 'svn'> = {}
      toSelect.forEach(f => {
        updates[f.path] = folderVcsTypes[f.path] || 'git'
      })
      setFolderVcsTypes(prev => ({ ...prev, ...updates }))
      toSelect.forEach(f => {
        if (!folderVcsTypes[f.path]) {
          window.api.system
            .get_version_control_details(f.path)
            .then(result => {
              const vcsType = result.status === 'success' && result.data?.isValid ? (result.data.type as 'git' | 'svn') : 'git'
              setFolderVcsTypes(prev => ({ ...prev, [f.path]: vcsType }))
            })
            .catch(() => {})
        }
      })
    }
  }, [allFoldersSelected, displayFolderList, folderVcsTypes])

  const toggleFolder = useCallback(
    (folderId: string, folderPath: string) => {
      setSelectedFolderIds(prev => {
        const next = new Set(prev)
        if (next.has(folderId)) {
          userHasManuallyChangedFoldersRef.current = true
          next.delete(folderId)
        } else {
          if (next.size >= MAX_FOLDERS) return prev
          next.add(folderId)
          if (!folderVcsTypes[folderPath]) {
            setFolderVcsTypes(t => ({ ...t, [folderPath]: 'git' }))
            window.api.system
              .get_version_control_details(folderPath)
              .then(result => {
                const vcsType = result.status === 'success' && result.data?.isValid ? (result.data.type as 'git' | 'svn') : 'git'
                setFolderVcsTypes(t => ({ ...t, [folderPath]: vcsType }))
              })
              .catch(() => setFolderVcsTypes(t => ({ ...t, [folderPath]: 'git' })))
          }
        }
        return next
      })
    },
    [folderVcsTypes]
  )

  const addToSaved = useCallback((c: CommitItem) => {
    const k = commitKey(c)
    setSavedCommits(prev => (prev.some(x => commitKey(x) === k) ? prev : [...prev, { ...c, sourceFolderPath: c.sourceFolderPath ?? undefined }]))
  }, [])

  const removeFromSaved = useCallback((c: CommitItem) => {
    const k = commitKey(c)
    setSavedCommits(prev => prev.filter(x => commitKey(x) !== k))
  }, [])

  const addAllAvailableToSaved = useCallback(() => {
    const savedKeys = new Set(savedCommits.map(commitKey))
    const availableCommits = savedCommits.length > 0 ? commits.filter(c => !savedKeys.has(commitKey(c))) : commits
    if (availableCommits.length === 0) return
    setSavedCommits(prev => {
      const existingKeys = new Set(prev.map(commitKey))
      const toAdd = availableCommits.filter(c => !existingKeys.has(commitKey(c))).map(c => ({ ...c, sourceFolderPath: c.sourceFolderPath ?? undefined }))
      return [...prev, ...toAdd]
    })
  }, [commits, savedCommits])

  const handleSave = async () => {
    if (!user) return
    if (projectIds.length === 0) {
      toast.error(t('dailyReport.selectAtLeastOneProject', 'Chọn ít nhất một project'))
      return
    }
    setIsSaving(true)
    try {
      const selectedCommits = savedCommits.map(c => {
        const vcs = getVcsTypeForCommit(c)
        return {
          ...c,
          sourceFolderPath: c.sourceFolderPath ?? undefined,
          vcsType: vcs ?? undefined,
        }
      })
      const orderedIds = displayFolderList.map(f => f.id).filter(id => selectedFolderIds.has(id))
      const res = await window.api.dailyReport.save({
        workDescription,
        selectedCommits,
        reportDate,
        projectIds,
        selectedUserProjectSourceFolderIds: orderedIds,
      })
      if (res.status === 'success') {
        toast.success(t('dailyReport.saveSuccess'))
        onSuccess?.()
      } else {
        toast.error(res.message || t('dailyReport.saveError'))
      }
    } catch {
      toast.error(t('dailyReport.saveReportError'))
    } finally {
      setIsSaving(false)
    }
  }

  const getFolderName = (path: string) => displayFolderList.find(f => f.path === path)?.name ?? sourceFolderList.find(f => f.path === path)?.name ?? path
  const getSourceBadgeLabel = (c: CommitItem) => {
    const name = c.sourceFolderPath ? getFolderName(c.sourceFolderPath) : ''
    if (!name) return ''
    return c.branch ? `${name} (${c.branch})` : name
  }

  const getVcsTypeForCommit = (c: CommitItem): 'git' | 'svn' | null => (c.sourceFolderPath ? folderVcsTypes[c.sourceFolderPath] : effectiveFolders[0]?.vcsType) ?? null

  const formatCommitDate = (dateStr: string) => {
    try {
      const d = /^\d{4}-\d{2}-\d{2}T/.test(dateStr) ? parseISO(dateStr) : new Date(dateStr)
      return Number.isNaN(d.getTime()) ? dateStr : format(d, getDateTimeWithSecondsDisplayPattern(i18n.language))
    } catch {
      return dateStr
    }
  }

  const applyWorkDescriptionTemplate = useCallback(() => {
    const reportDateParsed = reportDate ? parseLocalDate(reportDate) : null
    const baseDate = reportDateParsed ?? new Date()
    let nextDay = addDays(baseDate, 1)
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
      nextDay = addDays(nextDay, 1)
    }
    const nextDateStr = format(nextDay, getDateOnlyPattern(i18n.language))
    const template = [
      t('dailyReport.workDescriptionTemplateWorkDone'),
      '- ...',
      '',
      t('dailyReport.workDescriptionTemplateDifficulties'),
      '- ...',
      '',
      t('dailyReport.workDescriptionTemplateNextGoal', { date: nextDateStr }),
      '- ...',
    ].join('\n')
    setWorkDescription(prev => (prev ? `${prev}\n\n${template}` : template))
  }, [reportDate, t, i18n.language])

  return (
    <div className="flex flex-col gap-2 w-full">
      {isReadOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
          {t('dailyReport.readOnlyPastReport', 'Báo cáo quá khứ chỉ xem, không chỉnh sửa được.')}
        </p>
      )}
      {/* Header: Date, Reporter, Project, Save/Update - compact like TitleBar */}
      <div className="flex items-center justify-between text-sm select-none shrink-0" style={{ backgroundColor: 'var(--main-bg)', color: 'var(--main-fg)' } as React.CSSProperties}>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">{t('dailyReport.date', 'Date')}</span>
            <span className={cn('tabular-nums', !reportDate && 'text-muted-foreground')}>
              {reportDate ? format(parseLocalDate(reportDate) ?? new Date(reportDate), dateDisplayPattern, { locale }) : t('dailyReport.selectDate')}
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-muted-foreground shrink-0">{t('dailyReport.reporter', 'Người báo cáo')}</span>
              <span className="truncate">{user.name || user.userCode}</span>
            </div>
          )}
          {user && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-medium text-muted-foreground shrink-0">{t('dailyReport.project', 'Project')}</span>
              {isLoadingProjects ? (
                <Button variant="outline" size="sm" className="h-8 shrink-0" disabled>
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 justify-between min-w-0 w-[140px] sm:w-[180px] shrink-0" disabled={isReadOnly}>
                      <span className="truncate">
                        {projectIds.length > 0 ? projectIds.map(id => projects.find(p => p.id === id)?.name ?? id).join(', ') : t('dailyReport.selectProjects', 'Chọn project')}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                    {projects.map(p => (
                      <DropdownMenuCheckboxItem
                        key={p.id}
                        checked={projectIds.includes(p.id)}
                        onCheckedChange={checked => {
                          setProjectIds(prev => (checked ? [...prev, p.id] : prev.length > 1 ? prev.filter(id => id !== p.id) : prev))
                        }}
                      >
                        {p.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {projects.length === 0 && !isLoadingProjects && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('dailyReport.noProjects', 'Chưa có project nào')}</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving || isReadOnly} size="sm" className="h-7 shrink-0 bg-green-700 hover:bg-green-800 text-xs font-medium" variant="secondary">
          {isSaving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t('dailyReport.saving')}
            </>
          ) : hasExistingReport ? (
            t('dailyReport.updateReport')
          ) : (
            t('dailyReport.saveReport')
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Source folder + Work description */}
        <div className="space-y-4 min-w-0 flex flex-col">
          {/* Source Folder card - cùng chiều cao với Commit Today bên phải */}
          <div className="flex flex-col min-w-0 flex-1 rounded-xl border bg-muted/40 shadow-sm overflow-hidden min-h-[265px]! max-h-[265px]!">
            <div className="px-4 py-2.5 border-b shrink-0 flex items-center justify-between gap-2 bg-muted/30">
              <Label className="font-semibold text-sm shrink-0">{t('dailyReport.sourceFolderLabel')}</Label>
              {displayFolderList.length > 0 && (
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={toggleAllFolders} disabled={isReadOnly}>
                  {allFoldersSelected ? t('dailyReport.deselectAll') : t('dailyReport.selectAll')}
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {isLoadingFolders ? (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('dailyReport.loadingFolders', 'Đang tải...')}
                </div>
              ) : displayFolderList.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {displayFolderList.map(f => {
                    const selected = selectedFolderIds.has(f.id)
                    const disabled = isReadOnly || (!selected && selectedFolderIds.size >= MAX_FOLDERS)
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && toggleFolder(f.id, f.path)}
                        title={f.path}
                        className={cn(
                          'inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          selected ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                          disabled && !selected && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {f.name}
                      </button>
                    )
                  })}
                </div>
              ) : !isLoadingFolders ? (
                <p className="text-sm text-muted-foreground">
                  {projectIds.length > 0
                    ? t('dailyReport.noFolderForProject', 'Chưa có source folder cho project này. Vào Settings > Version Control để thêm.')
                    : t('dailyReport.selectProjectsToLoadFolders', 'Chọn ít nhất một project để tải source folder')}
                </p>
              ) : null}
            </div>
          </div>

          {/* Today's Work Description card */}
          <div className="flex flex-col min-w-0 flex-1 rounded-xl border bg-muted/40 shadow-sm overflow-hidden min-h-[265px]! max-h-[265px]!">
            <div className="px-4 py-2.5 border-b shrink-0 flex items-center justify-between bg-muted/30">
              <Label className="font-semibold text-sm">{t('dailyReport.workDescriptionLabel')}</Label>
              <Button variant="outline" size="sm" onClick={applyWorkDescriptionTemplate} disabled={isReadOnly}>
                {t('dailyReport.workDescriptionApplyTemplate')}
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <Textarea
                placeholder={t('dailyReport.workDescriptionPlaceholder')}
                value={workDescription}
                onChange={e => setWorkDescription(e.target.value)}
                readOnly={isReadOnly}
                className="resize-none flex-1 min-h-0 overflow-y-auto w-full rounded-none border-0 focus-visible:ring-0 shadow-none bg-transparent"
              />
            </div>
          </div>
        </div>

        {/* Column 2: Available commits (top) + Saved commits (bottom, when edit) */}
        <div className="space-y-4 min-w-0 flex flex-col">
          <div className="flex flex-col min-w-0 flex-1 rounded-xl border bg-muted/40 shadow-sm overflow-hidden min-h-[265px]! max-h-[265px]!">
            <div className="px-4 py-2.5 border-b shrink-0 flex items-center justify-between bg-muted/30">
              <Label className="font-semibold text-sm">{savedCommits.length > 0 ? t('dailyReport.availableCommits') : t('dailyReport.commitsToday')}</Label>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => loadCommits()}
                      disabled={isLoadingCommits || effectiveFolders.length === 0 || isReadOnly}
                    >
                      <RefreshCw className={cn('h-4 w-4', isLoadingCommits && 'animate-spin')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('dailyReport.refreshCommits', 'Tải lại commit')}</TooltipContent>
                </Tooltip>
                {commits.length > 0 &&
                  (() => {
                    const savedKeys = new Set(savedCommits.map(commitKey))
                    const availableCommits = savedCommits.length > 0 ? commits.filter(c => !savedKeys.has(commitKey(c))) : commits
                    const hasAvailable = availableCommits.length > 0
                    return (
                      hasAvailable && (
                        <Button variant="outline" size="sm" onClick={addAllAvailableToSaved} disabled={isReadOnly}>
                          {t('dailyReport.selectAll')}
                        </Button>
                      )
                    )
                  })()}
              </div>
            </div>
            {isLoadingCommits ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t('dailyReport.loadingCommits')}</span>
              </div>
            ) : (
              (() => {
                const savedKeys = new Set(savedCommits.map(commitKey))
                const availableCommits = savedCommits.length > 0 ? commits.filter(c => !savedKeys.has(commitKey(c))) : commits
                if (availableCommits.length === 0 && !isLoadingCommits) {
                  const emptyMsg =
                    effectiveFolders.length === 0
                      ? t('dailyReport.selectSourceFolderFirst')
                      : commits.length === 0
                        ? t('dailyReport.noCommitsInDate', {
                            date: reportDate ? format(parseLocalDate(reportDate) ?? parseISO(reportDate), dateDisplayPattern) : '',
                          })
                        : t('dailyReport.noAdditionalCommits')
                  return <div className="py-8 text-muted-foreground text-sm text-center border-t">{emptyMsg}</div>
                }
                return (
                  <div className="overflow-y-auto rounded-b-xl">
                    <div className="p-2 space-y-2">
                      {availableCommits.map(c => (
                        <div key={commitKey(c)} className="relative min-w-0">
                          <button
                            type="button"
                            className="relative flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border border-transparent bg-transparent p-2.5 text-left font-inherit transition-colors hover:border-muted-foreground/20 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setSelectedCommit(c)}
                          >
                            <div className="flex items-center justify-between gap-2 text-sm pr-9">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                {getSourceBadgeLabel(c) ? (
                                  <span
                                    className="inline-flex shrink-0 items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                                    title={getSourceBadgeLabel(c)}
                                  >
                                    {getSourceBadgeLabel(c)}
                                  </span>
                                ) : (
                                  <span className="shrink-0 font-mono text-xs text-primary" title={c.revision}>
                                    {c.revision.length > 8 ? c.revision.substring(0, 8) : c.revision}
                                  </span>
                                )}
                                {c.files && c.files.length > 0 && <StatusIconsWithCount files={c.files} vcsType={getVcsTypeForCommit(c)} className="shrink-0" />}
                              </div>
                              <span className="shrink-0 text-xs text-muted-foreground">{formatCommitDate(c.date)}</span>
                            </div>
                            <p className="line-clamp-1 pl-0 pr-9 text-sm text-muted-foreground">{getFirstLine(c.message)}</p>
                          </button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute top-1/2 right-1.5 z-10 h-7 w-7 -translate-y-1/2 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            onClick={() => addToSaved(c)}
                            disabled={isReadOnly}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1 rounded-xl border bg-muted/40 shadow-sm overflow-hidden min-h-[265px]! max-h-[265px]!">
            <div className="px-4 py-2.5 border-b shrink-0 flex items-center justify-between bg-muted/30">
              <Label className="font-semibold text-sm">
                {t('dailyReport.savedCommits')} ({savedCommits.length})
              </Label>
              <Button variant="outline" size="sm" onClick={() => setSavedCommits([])} disabled={savedCommits.length === 0 || isReadOnly}>
                {t('dailyReport.clearAllSaved', 'Xóa tất cả')}
              </Button>
            </div>
            <div className="max-h-[280px] overflow-y-auto rounded-b-xl">
              {savedCommits.length === 0 ? (
                <div className="py-8 text-muted-foreground text-sm text-center">
                  {t('dailyReport.savedCommitsEmpty', 'Chưa có commit nào được lưu. Chọn commit bên trên và bấm + để thêm.')}
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {savedCommits.map(c => {
                    const k = commitKey(c)
                    return (
                      <div key={k} className="relative min-w-0">
                        <button
                          type="button"
                          className="relative flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border border-transparent bg-background p-2.5 text-left font-inherit transition-colors hover:border-muted-foreground/20 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setSelectedCommit(c)}
                        >
                          <div className="flex items-center justify-between gap-2 text-sm pr-9">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              {getSourceBadgeLabel(c) ? (
                                <span
                                  className="inline-flex shrink-0 items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                                  title={getSourceBadgeLabel(c)}
                                >
                                  {getSourceBadgeLabel(c)}
                                </span>
                              ) : (
                                <span className="shrink-0 font-mono text-xs text-primary" title={c.revision}>
                                  {c.revision.length > 8 ? c.revision.substring(0, 8) : c.revision}
                                </span>
                              )}
                              {c.files && c.files.length > 0 && <StatusIconsWithCount files={c.files} vcsType={getVcsTypeForCommit(c)} className="shrink-0" />}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatCommitDate(c.date)}</span>
                          </div>
                          <p className="line-clamp-1 pl-0 pr-9 text-sm text-muted-foreground">{getFirstLine(c.message)}</p>
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="absolute top-1/2 right-1.5 z-10 h-7 w-7 -translate-y-1/2 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeFromSaved(c)}
                          title={t('dailyReport.removeFromSaved')}
                          disabled={isReadOnly}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedCommit && <CommitDetailDialog commit={selectedCommit} vcsType={getVcsTypeForCommit(selectedCommit)} onClose={() => setSelectedCommit(null)} />}
    </div>
  )
}
