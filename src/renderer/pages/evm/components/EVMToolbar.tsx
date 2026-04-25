'use client'

import { format } from 'date-fns'
import { Brain, CalendarIcon, Download, Pencil, Plus, Users2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, getDateFnsLocale, getDateOnlyPattern, parseLocalDate } from '@/lib/dateUtils'
import { buildWbsDayUnitsFromPlan } from '@/lib/evmCalculations'
import {
  mapTaskLikeToWbsImportRow,
  mapWbsImportRowToAcSnapshotRow,
  type MapTaskToWbsOptions,
} from '@/lib/evmImportFromTask'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import { evmTabSupportsAi, useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import { useEvmToolbarLayoutStore } from '@/stores/useEvmToolbarLayoutStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import i18n from '@/lib/i18n'
import type { EVMTabId } from './EVMSidebar'
import { EVM_PROJECT_CREATE_STUB, EvmProjectInfoDialog } from './EvmProjectInfoDialog'
import { useEvmAiPanelControl } from './EvmAiPanelContext'

const ProjectMembersDialog = lazy(() =>
  import('@/components/dialogs/task/ProjectMembersDialog').then(m => ({ default: m.ProjectMembersDialog }))
)

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
const dragRegion = { WebkitAppRegion: 'drag' } as React.CSSProperties

/** Cùng style nút tạo / import CSV trên header TaskManagement (cửa sổ riêng). */
const headerEmeraldActionBtn =
  'h-6 px-1.5! text-xs border-0 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 hover:text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-200'

/** Cùng hướng TitleBar (dropdown project / source folder): ghost, width theo nội dung, clamp khi rộng. */
const evmTitleBarLikeSelectTrigger = cn(
  'h-6 min-h-6 w-auto min-w-0 w-full gap-1 py-0! text-xs font-medium shadow-none transition-colors',
  'border-0! bg-transparent hover:bg-muted/80',
  '[&_svg]:size-3.5'
)

/** Một hàng, không clamp width; cuộn ngang nếu cửa sổ hẹp. */
const evmToolbarLeftRowTrigger = cn(evmTitleBarLikeSelectTrigger, 'max-w-none')

const evmFilterPhaseComboClass = 'w-[10rem] shrink-0'
const evmFilterAssigneeComboClass = 'w-[10rem] shrink-0'

export function EVMToolbar({ activeEvmTab }: { activeEvmTab: EVMTabId }) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const aiPanel = useEvmAiPanelControl()
  const setUiSegment = useEvmAiInsightStore(s => s.setUiSegment)
  const schedulePhaseFilter = useEvmAiInsightStore(s => s.schedulePhaseFilter)
  const scheduleAssigneeFilter = useEvmAiInsightStore(s => s.scheduleAssigneeFilter)
  const setScheduleFilters = useEvmAiInsightStore(s => s.setScheduleFilters)
  const requestWbsAdd = useEvmToolbarLayoutStore(s => s.requestWbsAdd)
  const requestMasterAdd = useEvmToolbarLayoutStore(s => s.requestMasterAdd)
  const project = useEVMStore(s => s.project)
  const master = useEVMStore(s => s.master)
  const updateProject = useEVMStore(s => s.updateProject)
  const addWbsRowsBatchToProject = useEVMStore(s => s.addWbsRowsBatchToProject)
  const addAcRowsBatchToProject = useEVMStore(s => s.addAcRowsBatchToProject)
  const replaceWbsDayUnitsForRow = useEVMStore(s => s.replaceWbsDayUnitsForRow)
  const [showImport, setShowImport] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<string>('')
  const [defaultBac, setDefaultBac] = useState('1')
  const [taskProjects, setTaskProjects] = useState<{ id: string; name: string }[]>([])
  const [evmProjects, setEvmProjects] = useState<{ id: string; projectName: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [importPhases, setImportPhases] = useState<{ code: string; name?: string }[]>([])
  const [importPhase, setImportPhase] = useState('')
  const [importAcSnapshots, setImportAcSnapshots] = useState(false)
  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const [reportDateDraft, setReportDateDraft] = useState('')
  const [reportDateOpen, setReportDateOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)

  const token = useTaskAuthStore(s => s.token)
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const [projectToManageMembers, setProjectToManageMembers] = useState<{ id: string; name: string } | null>(null)
  const [membersDialogUsers, setMembersDialogUsers] = useState<{ id: string; name: string; userCode: string }[]>([])
  const [membersCaps, setMembersCaps] = useState<{ canManagePl?: boolean; canManagePm?: boolean; canManageDev?: boolean }>({})

  useEffect(() => {
    if (!showImport || !selectedTaskProjectId) return
    let cancelled = false
    ;(async () => {
      try {
        const ensure = await window.api.evm.ensureProjectForEvm(selectedTaskProjectId)
        if (ensure.status !== 'success' || cancelled) return
        const phRes = await window.api.evm.getMasterPhases(selectedTaskProjectId)
        const phData = phRes.status === 'success' ? phRes.data : undefined
        if (!phData || cancelled) return
        setImportPhases(phData)
        setImportPhase(prev => (prev && phData.some(p => p.code === prev) ? prev : ''))
      } catch {
        if (!cancelled) setImportPhases([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showImport, selectedTaskProjectId])

  const handleImportClick = useCallback(async () => {
    const loggedIn = await verifySession()
    if (!loggedIn) {
      toast.error(t('evm.pleaseLoginFirst'))
      return
    }
    setShowImport(true)
    setLoading(true)
    try {
      const res = await window.api.task.getProjects()
      if (res.status === 'success' && res.data) {
        setTaskProjects(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
        if (res.data.length > 0) setSelectedTaskProjectId(res.data[0].id)
      } else {
        toast.error(res.message ?? t('evm.loadProjectsFailed'))
      }
    } catch {
      toast.error(t('evm.loadProjectsFailed'))
    } finally {
      setLoading(false)
    }
  }, [verifySession, t])

  const loadData = useEVMStore(s => s.loadData)

  const fetchEvmProjects = useCallback(async () => {
    try {
      const res = await window.api.evm.getProjects()
      if (res.status === 'success' && res.data) {
        setEvmProjects(res.data.map((p: { id: string; projectName: string }) => ({ id: p.id, projectName: p.projectName })))
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchEvmProjects()
  }, [fetchEvmProjects])

  useEffect(() => {
    const s = project.reportDate?.trim() ?? ''
    setReportDateDraft(s.length >= 10 ? s.slice(0, 10) : s)
  }, [project.id, project.reportDate])

  const persistReportDate = useCallback(
    async (ymdOverride?: string) => {
      if (!project.id) return
      const y = (ymdOverride ?? reportDateDraft).trim().slice(0, 10)
      const cur = project.reportDate?.trim().slice(0, 10) ?? ''
      if (!y || y === cur) return
      try {
        await updateProject({ reportDate: y })
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
        setReportDateDraft(cur)
      }
    },
    [project.id, project.reportDate, reportDateDraft, updateProject, t]
  )

  const reportDateFnsLocale = useMemo(() => getDateFnsLocale(i18n.language), [i18n.language])
  const reportDateDisplayPattern = useMemo(() => getDateOnlyPattern(i18n.language), [i18n.language])
  const reportDateSelected = useMemo(() => {
    const d = reportDateDraft.trim().slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? (parseLocalDate(d) ?? undefined) : undefined
  }, [reportDateDraft])

  const showScheduleFilters = activeEvmTab === 'gantt' || activeEvmTab === 'ac'
  const showAssigneeOnlyFilter = activeEvmTab === 'resource'
  const rangeStartDisp = project.startDate?.trim() ? formatDateDisplay(project.startDate, i18n.language) : '—'
  const rangeEndDisp = project.endDate?.trim() ? formatDateDisplay(project.endDate, i18n.language) : '—'

  const openProjectInfoForId = useCallback(
    async (projectId: string) => {
      setProjectMenuOpen(false)
      if (!projectId) return
      if (projectId !== project.id) {
        await loadData(projectId)
      }
      setShowProjectInfo(true)
    },
    [project.id, loadData]
  )

  const openManageMembersForId = useCallback(
    async (projectId: string, projectName: string) => {
      setProjectMenuOpen(false)
      const loggedIn = await verifySession()
      if (!loggedIn) {
        toast.error(t('evm.pleaseLoginFirst'))
        return
      }
      try {
        const [usersRes, memRes] = await Promise.all([window.api.user.getUsers(), window.api.task.getProjectMembers(projectId)])
        if (usersRes.status === 'success' && usersRes.data) {
          setMembersDialogUsers(
            usersRes.data.map((u: { id: string; name: string; userCode: string }) => ({ id: u.id, name: u.name, userCode: u.userCode }))
          )
        } else {
          setMembersDialogUsers([])
        }
        const data = memRes.status === 'success' && memRes.data ? memRes.data : null
        setMembersCaps({
          canManagePl: data?.canManagePl,
          canManagePm: data?.canManagePm,
          canManageDev: data?.canManageDev,
        })
        setProjectToManageMembers({ id: projectId, name: projectName })
      } catch {
        toast.error(t('evm.loadProjectsFailed'))
      }
    },
    [verifySession, t]
  )

  const projectComboboxOptions = useMemo(() => {
    const rows =
      project.id && !evmProjects.some(p => p.id === project.id)
        ? [{ id: project.id, projectName: project.projectName }, ...evmProjects]
        : evmProjects
    return rows.map(p => ({
      value: p.id,
      label: p.projectName,
      listRender: (
        <div className="flex w-full min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate">{p.projectName}</span>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('evm.dashboardProjectInfo')}
            aria-label={t('evm.dashboardProjectInfo')}
            onPointerDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              void openProjectInfoForId(p.id)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('taskManagement.manageMembers', 'Quản lý thành viên')}
            aria-label={t('taskManagement.manageMembers', 'Quản lý thành viên')}
            onPointerDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              void openManageMembersForId(p.id, p.projectName)
            }}
          >
            <Users2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    }))
  }, [evmProjects, project.id, project.projectName, t, openProjectInfoForId, openManageMembersForId])

  const projectComboboxFooter = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start gap-2 px-2 text-xs font-normal"
        onClick={() => {
          setProjectMenuOpen(false)
          setShowNewProject(true)
        }}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        {t('evm.newProject')}
      </Button>
    ),
    [t]
  )

  const showScheduleFiltersRow = project.id && (showScheduleFilters || showAssigneeOnlyFilter)

  const handleProjectChange = useCallback(
    (projectId: string) => {
      loadData(projectId)
    },
    [loadData]
  )

  const handleImport = useCallback(async () => {
    if (!selectedTaskProjectId || !token) return
    setLoading(true)
    try {
      const ensureRes = await window.api.evm.ensureProjectForEvm(selectedTaskProjectId)
      if (ensureRes.status !== 'success' || !ensureRes.data) {
        toast.error(ensureRes.message ?? t('evm.ensureProjectFailed'))
        return
      }
      const [tasksRes] = await Promise.all([window.api.task.getAll(selectedTaskProjectId)])
      if (tasksRes.status !== 'success' || !tasksRes.data) {
        const msg = tasksRes.code === 'UNAUTHORIZED' ? t('evm.pleaseLoginFirst') : (tasksRes.message ?? t('evm.loadTasksFailed'))
        toast.error(msg)
        return
      }
      const tasks = tasksRes.data
      const tasksWithTitle = tasks.filter((task: { title?: string }) => task.title)
      const bac = Number(defaultBac) || 1
      const phaseOpt = importPhase.trim() || undefined
      const wbsOpts: MapTaskToWbsOptions = { defaultBac: bac, defaultPhase: phaseOpt, nonWorkingDays: [] }
      const wbsRows = tasksWithTitle.map((task: Parameters<typeof mapTaskLikeToWbsImportRow>[0]) => mapTaskLikeToWbsImportRow(task, wbsOpts))
      if (wbsRows.length === 0) {
        toast.error(t('evm.noTasksToImport'))
        return
      }
      const reportDate =
        ensureRes.data?.reportDate && String(ensureRes.data.reportDate).length >= 10
          ? String(ensureRes.data.reportDate).slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      const createdWbs = await addWbsRowsBatchToProject(selectedTaskProjectId, wbsRows)
      let importedAcCount = 0
      if (importAcSnapshots) {
        const acRows = tasksWithTitle.map((task: Parameters<typeof mapTaskLikeToWbsImportRow>[0], i: number) =>
          mapWbsImportRowToAcSnapshotRow(wbsRows[i], reportDate, task.description)
        )
        importedAcCount = acRows.length
        await addAcRowsBatchToProject(selectedTaskProjectId, acRows)
      }
      await loadData(selectedTaskProjectId)
      const nw = useEVMStore.getState().master.nonWorkingDays.map(d => d.date)
      await Promise.all(
        createdWbs
          .filter(r => (r.planStartDate ?? '').trim() && (r.planEndDate ?? '').trim())
          .map(r => replaceWbsDayUnitsForRow(r.id, buildWbsDayUnitsFromPlan(r, nw))),
      )
      await fetchEvmProjects()
      if (importAcSnapshots) {
        toast.success(t('evm.importedWbsAcCount', { wbs: wbsRows.length, ac: importedAcCount }))
      } else {
        toast.success(t('evm.importedCount', { count: wbsRows.length }))
      }
      setShowImport(false)
    } catch {
      toast.error(t('evm.importFailed'))
    } finally {
      setLoading(false)
    }
  }, [
    selectedTaskProjectId,
    token,
    defaultBac,
    importPhase,
    importAcSnapshots,
    addWbsRowsBatchToProject,
    addAcRowsBatchToProject,
    replaceWbsDayUnitsForRow,
    loadData,
    fetchEvmProjects,
    t,
  ])

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="flex min-w-min flex-1 flex-nowrap items-center overflow-visible" style={noDrag}>
        <span className="text-muted-foreground font-medium">{t('taskManagement.project')}: </span>
        <Combobox
          open={projectMenuOpen}
          onOpenChange={setProjectMenuOpen}
          value={project.id}
          onValueChange={v => {
            if (v) handleProjectChange(v)
          }}
          options={projectComboboxOptions}
          placeholder={t('evm.selectProject')}
          variant="ghost"
          size="sm"
          className="min-w-[10rem] w-auto max-w-fit overflow-visible"
          triggerClassName={cn(evmToolbarLeftRowTrigger, 'rounded-md')}
          footer={projectComboboxFooter}
        />
        {project.id ? (
          <div className='flex gap-2 pr-4'>
            <span className="font-medium text-muted-foreground">{t('evm.toolbarDurationLabel')}</span>
            <span className="text-foreground whitespace-nowrap">
              {rangeStartDisp}
              <span className="px-1 text-muted-foreground">{t('evm.toolbarDateRangeSeparator')}</span>
              {rangeEndDisp}
            </span>
          </div>
        ) : null}
        <Separator orientation="vertical" className="h-4" />
        {showScheduleFilters && project.id ? (
          <>
            <span className="font-medium text-muted-foreground">{t('evm.filterPhase')}:</span>
            <Combobox
              value={schedulePhaseFilter}
              onValueChange={v => setScheduleFilters(v, scheduleAssigneeFilter)}
              options={[
                { value: 'all', label: t('evm.filterAll') },
                ...master.phases.map(p => ({ value: p.code, label: p.name ?? p.code })),
              ]}
              placeholder={t('evm.filterPhase')}
              variant="ghost"
              size="sm"
              className={evmFilterPhaseComboClass}
              triggerClassName={cn(evmToolbarLeftRowTrigger, 'rounded-md')}
            />
            <span className="font-medium text-muted-foreground">{t('evm.filterAssignee')}:</span>
            <Combobox
              value={scheduleAssigneeFilter}
              onValueChange={v => setScheduleFilters(schedulePhaseFilter, v)}
              options={[
                { value: 'all', label: t('evm.filterAll') },
                ...master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code })),
              ]}
              placeholder={t('evm.filterAssignee')}
              variant="ghost"
              size="sm"
              className={evmFilterAssigneeComboClass}
              triggerClassName={cn(evmToolbarLeftRowTrigger, 'rounded-md')}
            />
          </>
        ) : showAssigneeOnlyFilter && project.id ? (
          <>
            <span className="font-medium text-muted-foreground">{t('evm.filterAssignee')}</span>
            <Combobox
              value={scheduleAssigneeFilter}
              onValueChange={v => setScheduleFilters(schedulePhaseFilter, v)}
              options={[
                { value: 'all', label: t('evm.filterAll') },
                ...master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code })),
              ]}
              placeholder={t('evm.filterAssignee')}
              variant="ghost"
              size="sm"
              className={evmFilterAssigneeComboClass}
              triggerClassName={cn(evmToolbarLeftRowTrigger, 'rounded-md')}
            />
          </>
        ) : null}
        {activeEvmTab === 'gantt' && project.id ? (
          <Button
            type="button"
            variant={buttonVariant}
            size="sm"
            className={cn(headerEmeraldActionBtn, 'h-6 px-1.5!')}
            title={t('common.add')}
            onClick={() => requestWbsAdd()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {activeEvmTab === 'master' && project.id ? (
          <Button
            type="button"
            variant={buttonVariant}
            size="sm"
            className={cn(headerEmeraldActionBtn, 'h-6 px-1.5!')}
            title={t('common.add')}
            onClick={() => requestMasterAdd()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {aiPanel && evmTabSupportsAi(activeEvmTab) ? (
          <Button
            variant={buttonVariant}
            size="sm"
            type="button"
            className="h-6 w-6 p-0"
            title={t('evm.ai.togglePanel')}
            aria-label={t('evm.ai.togglePanel')}
            onClick={() => {
              setUiSegment('analyze')
              aiPanel.togglePanel()
            }}
          >
            <Brain className="h-3.5 w-3.5 text-purple-500" />
          </Button>
        ) : null}
      </div>
      <div className="min-h-6 min-w-4 flex-1 basis-0 self-stretch" style={dragRegion} aria-hidden />
      <div className="flex flex-wrap items-center justify-end gap-1" style={noDrag}>
        {project.id ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Label id="evm-toolbar-report-date-label" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {t('evm.toolbarReportDateLabel')}
            </Label>
            <Popover open={reportDateOpen} onOpenChange={setReportDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={buttonVariant}
                  size="sm"
                  aria-labelledby="evm-toolbar-report-date-label"
                  title={t('evm.dashboardReportDate')}
                  className={cn(
                    headerEmeraldActionBtn,
                    'h-6 px-2 text-xs font-normal justify-start gap-1.5',
                    !reportDateSelected && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
                  {reportDateSelected
                    ? format(reportDateSelected, reportDateDisplayPattern, { locale: reportDateFnsLocale })
                    : t('taskManagement.selectDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  locale={reportDateFnsLocale}
                  mode="single"
                  selected={reportDateSelected}
                  defaultMonth={reportDateSelected}
                  onSelect={d => {
                    setReportDateOpen(false)
                    if (!d) return
                    const ymd = format(d, 'yyyy-MM-dd')
                    setReportDateDraft(ymd)
                    void persistReportDate(ymd)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
        <Button
          variant={buttonVariant}
          size="sm"
          className={cn(headerEmeraldActionBtn, 'h-6 w-6 p-0')}
          onClick={handleImportClick}
          aria-label={t('evm.importFromTasks')}
          title={!token ? t('evm.pleaseLoginFirst') : t('evm.importFromTasks')}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('evm.importDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t('evm.selectTaskProject')}</Label>
              <Select value={selectedTaskProjectId} onValueChange={setSelectedTaskProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('evm.selectProject')} />
                </SelectTrigger>
                <SelectContent>
                  {taskProjects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('evm.defaultBac')}</Label>
              <Input type="number" min={0} step={1} value={defaultBac} onChange={e => setDefaultBac(e.target.value)} placeholder="1" />
              <p className="text-xs text-muted-foreground mt-1">{t('evm.defaultBacDescription')}</p>
            </div>
            <div>
              <Label>{t('evm.importPhaseLabel')}</Label>
              <Select value={importPhase || '__none__'} onValueChange={v => setImportPhase(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('evm.selectProject')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('evm.importPhaseNone')}</SelectItem>
                  {importPhases.map(p => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name ? `${p.name} (${p.code})` : p.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{t('evm.importPhaseHint')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="evm-import-ac"
                  checked={importAcSnapshots}
                  onCheckedChange={v => setImportAcSnapshots(v === true)}
                />
                <Label htmlFor="evm-import-ac" className="cursor-pointer font-normal">
                  {t('evm.importAcSnapshotsLabel')}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">{t('evm.importAcSnapshotsHint')}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t('evm.importDescription')}</p>
          </div>
          <DialogFooter>
            <Button variant={buttonVariant} onClick={() => setShowImport(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={buttonVariant} onClick={handleImport} disabled={loading || !selectedTaskProjectId}>
              {t('evm.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EvmProjectInfoDialog open={showProjectInfo} onOpenChange={setShowProjectInfo} project={project} />
      <EvmProjectInfoDialog
        mode="create"
        open={showNewProject}
        onOpenChange={setShowNewProject}
        project={EVM_PROJECT_CREATE_STUB}
        onAfterCreateSuccess={fetchEvmProjects}
      />
      {projectToManageMembers ? (
        <Suspense fallback={null}>
          <ProjectMembersDialog
            open={!!projectToManageMembers}
            onOpenChange={open => !open && setProjectToManageMembers(null)}
            projectId={projectToManageMembers.id}
            projectName={projectToManageMembers.name}
            users={membersDialogUsers}
            canManagePl={user?.role === 'admin' || (membersCaps.canManagePl ?? false)}
            canManagePm={user?.role === 'admin' || (membersCaps.canManagePm ?? false)}
            canManageDev={user?.role === 'admin' || (membersCaps.canManageDev ?? false)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
