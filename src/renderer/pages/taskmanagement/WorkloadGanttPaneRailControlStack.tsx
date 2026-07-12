'use client'

import { ChevronsDown, ChevronsRight, FoldVertical, UnfoldVertical } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { hbGantt } from './ganttLayoutCssVars'
import {
  buildDisplayWorkloadSegments,
  getWorkloadProjectBulkCyclePhase,
  workloadRowKey,
} from './taskGanttWorkloadSegmentUtils'
import type { WorkloadBoardSegment } from './taskGanttWorkloadTypes'
import { Z_GANTT_META_RAIL_FLOATING_TOGGLE } from './taskGanttZIndex'

function useWorkloadPaneBulkExpand(
  segments: WorkloadBoardSegment[],
  workloadRowGrouping: 'flat' | 'assignee' | 'project',
  showActualBars: boolean,
  collapsedProjectIds: Set<string>,
  setCollapsedProjectIds: Dispatch<SetStateAction<Set<string>>>,
  expandedRowKeys: Set<string>,
  setExpandedRowKeys: Dispatch<SetStateAction<Set<string>>>
) {
  const displaySegments = useMemo(
    () => buildDisplayWorkloadSegments(workloadRowGrouping, segments, showActualBars),
    [workloadRowGrouping, segments, showActualBars]
  )

  const panelLayout: 'project' | 'flat' | 'assignee' =
    workloadRowGrouping === 'flat' ? 'flat' : workloadRowGrouping === 'assignee' ? 'assignee' : 'project'

  const workloadProjectBulkIds = useMemo(
    () =>
      panelLayout === 'project'
        ? displaySegments.filter(s => s.data.users.length > 0 && s.data.days.length > 0).map(s => s.projectId)
        : [],
    [displaySegments, panelLayout]
  )

  /** Assignee + flat: cùng mini-Gantt theo `rk = workloadRowKey(projectId, userId)`. */
  const workloadMiniGanttBulkRowKeys = useMemo(() => {
    if (workloadRowGrouping !== 'assignee' && workloadRowGrouping !== 'flat') return []
    const keys: string[] = []
    for (const seg of displaySegments) {
      if (seg.data.users.length === 0 || seg.data.days.length === 0) continue
      for (const u of seg.data.users) {
        keys.push(workloadRowKey(seg.projectId, u.userId))
      }
    }
    return keys
  }, [displaySegments, workloadRowGrouping])

  /** By-project: mọi khóa hàng user trong workload (mở mini-Gantt hàng loạt). */
  const workloadProjectBulkUserRowKeys = useMemo(() => {
    if (workloadRowGrouping !== 'project') return []
    const keys: string[] = []
    for (const seg of displaySegments) {
      if (seg.data.users.length === 0 || seg.data.days.length === 0) continue
      for (const u of seg.data.users) {
        keys.push(workloadRowKey(seg.projectId, u.userId))
      }
    }
    return keys
  }, [displaySegments, workloadRowGrouping])

  const workloadProjectBulkPhase = useMemo(() => {
    if (workloadRowGrouping !== 'project' || !workloadProjectBulkIds.length) return 0 as const
    return getWorkloadProjectBulkCyclePhase(
      workloadProjectBulkIds,
      workloadProjectBulkUserRowKeys,
      collapsedProjectIds,
      expandedRowKeys
    )
  }, [
    workloadRowGrouping,
    workloadProjectBulkIds,
    workloadProjectBulkUserRowKeys,
    collapsedProjectIds,
    expandedRowKeys,
  ])

  const workloadProjectBulkUpcomingPhase = useMemo(() => {
    if (workloadRowGrouping !== 'project' || !workloadProjectBulkIds.length) return 0 as const
    const cycleLen = workloadProjectBulkUserRowKeys.length > 0 ? 3 : 2
    return ((workloadProjectBulkPhase + 1) % cycleLen) as 0 | 1 | 2
  }, [workloadRowGrouping, workloadProjectBulkIds.length, workloadProjectBulkPhase, workloadProjectBulkUserRowKeys.length])

  const cycleWorkloadProjectBulkExpand = useCallback(() => {
    const projectIds = workloadProjectBulkIds
    const rowKeys = workloadProjectBulkUserRowKeys
    if (!projectIds.length) return

    const phase = getWorkloadProjectBulkCyclePhase(projectIds, rowKeys, collapsedProjectIds, expandedRowKeys)
    const cycleLen = rowKeys.length > 0 ? 3 : 2
    const next = ((phase + 1) % cycleLen) as 0 | 1 | 2

    if (next === 0) {
      setCollapsedProjectIds(prev => {
        const n = new Set(prev)
        for (const id of projectIds) n.add(id)
        return n
      })
      setExpandedRowKeys(new Set())
    } else if (next === 1) {
      setCollapsedProjectIds(prev => {
        const n = new Set(prev)
        for (const id of projectIds) n.delete(id)
        return n
      })
      setExpandedRowKeys(new Set())
    } else {
      setCollapsedProjectIds(prev => {
        const n = new Set(prev)
        for (const id of projectIds) n.delete(id)
        return n
      })
      setExpandedRowKeys(new Set(rowKeys))
    }
  }, [
    collapsedProjectIds,
    expandedRowKeys,
    setCollapsedProjectIds,
    setExpandedRowKeys,
    workloadProjectBulkIds,
    workloadProjectBulkUserRowKeys,
  ])

  const toggleWorkloadAssigneeMiniBulk = useCallback(() => {
    const keys = workloadMiniGanttBulkRowKeys
    if (!keys.length) return
    setExpandedRowKeys(prev => {
      const anyOpen = keys.some(k => prev.has(k))
      if (anyOpen) return new Set<string>()
      return new Set(keys)
    })
  }, [setExpandedRowKeys, workloadMiniGanttBulkRowKeys])

  const anyWorkloadAssigneeMiniOpen = useMemo(
    () => workloadMiniGanttBulkRowKeys.some(k => expandedRowKeys.has(k)),
    [expandedRowKeys, workloadMiniGanttBulkRowKeys]
  )

  const bulkVisible =
    (workloadRowGrouping === 'project' && workloadProjectBulkIds.length > 0) ||
    ((workloadRowGrouping === 'assignee' || workloadRowGrouping === 'flat') &&
      workloadMiniGanttBulkRowKeys.length > 0)

  return {
    bulkVisible,
    workloadRowGrouping,
    workloadProjectBulkUpcomingPhase,
    anyWorkloadAssigneeMiniOpen,
    cycleWorkloadProjectBulkExpand,
    toggleWorkloadAssigneeMiniBulk,
  }
}

/** Cạnh timeline pane workload: meta rail + bulk (icon, không nhãn). */
export function WorkloadGanttPaneRailControlStack({
  metaRailExpanded,
  onMetaRailToggle,
  segments,
  workloadRowGrouping,
  showActualBars,
  collapsedProjectIds,
  setCollapsedProjectIds,
  expandedRowKeys,
  setExpandedRowKeys,
  /** Chế độ Both: pane Timeline đã có nút meta — ẩn hàng meta ở đây, chỉ giữ nút workload. */
  includeMetaRail = true,
  includeWorkloadBulk = true,
}: {
  metaRailExpanded: boolean
  onMetaRailToggle: () => void
  segments: WorkloadBoardSegment[]
  workloadRowGrouping: 'flat' | 'assignee' | 'project'
  showActualBars: boolean
  collapsedProjectIds: Set<string>
  setCollapsedProjectIds: Dispatch<SetStateAction<Set<string>>>
  expandedRowKeys: Set<string>
  setExpandedRowKeys: Dispatch<SetStateAction<Set<string>>>
  includeMetaRail?: boolean
  includeWorkloadBulk?: boolean
}) {
  const { t } = useTranslation()
  const {
    bulkVisible,
    workloadRowGrouping: grouping,
    workloadProjectBulkUpcomingPhase,
    anyWorkloadAssigneeMiniOpen,
    cycleWorkloadProjectBulkExpand,
    toggleWorkloadAssigneeMiniBulk,
  } = useWorkloadPaneBulkExpand(
    segments,
    workloadRowGrouping,
    showActualBars,
    collapsedProjectIds,
    setCollapsedProjectIds,
    expandedRowKeys,
    setExpandedRowKeys
  )

  const showBulk = includeWorkloadBulk && bulkVisible
  const showMeta = includeMetaRail
  if (!showMeta && !showBulk) return null

  const bulkAria =
    grouping === 'project'
      ? workloadProjectBulkUpcomingPhase === 0
        ? t('taskManagement.workloadBulkByProjectCycleCloseAllAria')
        : workloadProjectBulkUpcomingPhase === 1
          ? t('taskManagement.workloadBulkByProjectCycleOpenProjectsAria')
          : t('taskManagement.workloadBulkByProjectCycleOpenUsersAria')
      : anyWorkloadAssigneeMiniOpen
        ? t('taskManagement.workloadBulkCollapseAllMiniGanttAria')
        : t('taskManagement.workloadBulkExpandAllMiniGanttAria')

  return (
    <div
      className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-r-md border border-border/80 border-l-0 bg-background/95 shadow-sm"
      style={{
        ...hbGantt.metaRailToggleLeft,
        top: 'calc(50% + 20px)',
        transform: 'translate(-1px, -50%)',
        zIndex: Z_GANTT_META_RAIL_FLOATING_TOGGLE,
      }}
    >
      {showMeta ? (
        <button
          type="button"
          className={cn(
            'flex h-7 w-5 shrink-0 items-center justify-center',
            'text-muted-foreground transition-[background-color,box-shadow,color] duration-200 ease-out',
            'hover:bg-muted hover:text-foreground',
            'motion-safe:active:scale-[0.97] motion-reduce:active:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset'
          )}
          onClick={e => {
            e.stopPropagation()
            onMetaRailToggle()
          }}
          aria-expanded={metaRailExpanded}
          aria-label={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
          title={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
        >
          <ChevronsRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none',
              metaRailExpanded && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
      ) : null}

      {showBulk ? (
        <button
          type="button"
          className={cn(
            'flex h-7 w-5 shrink-0 items-center justify-center',
            'text-muted-foreground transition-[background-color,color] duration-200 ease-out',
            'hover:bg-muted hover:text-foreground',
            'motion-safe:active:scale-[0.97] motion-reduce:active:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset',
            showMeta && 'border-t border-border/60'
          )}
          aria-label={bulkAria}
          title={bulkAria}
          onClick={e => {
            e.stopPropagation()
            if (grouping === 'project') cycleWorkloadProjectBulkExpand()
            else toggleWorkloadAssigneeMiniBulk()
          }}
        >
          {grouping === 'project' ? (
            workloadProjectBulkUpcomingPhase === 0 ? (
              <FoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : workloadProjectBulkUpcomingPhase === 1 ? (
              <UnfoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronsDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )
          ) : anyWorkloadAssigneeMiniOpen ? (
            <FoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <UnfoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  )
}
