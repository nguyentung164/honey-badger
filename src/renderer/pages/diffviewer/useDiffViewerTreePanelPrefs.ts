import { useCallback, useState } from 'react'
import type {
  DiffFileTreeSortBy,
  DiffFileTreeStatusFilter,
  DiffFileTreeViewMode,
} from './diffViewerFileTree'

const STORAGE_KEY = 'diff-viewer-tree-panel-prefs'
const STAGING_CHANGES_PANEL_DEFAULT_SIZE = 50
const STAGING_CHANGES_PANEL_MIN_SIZE = 15
const STAGING_CHANGES_PANEL_MAX_SIZE = 85
const STAGING_STAGED_PANEL_DEFAULT_SIZE = 55
const STAGING_STAGED_PANEL_MIN_SIZE = 15
const STAGING_STAGED_PANEL_MAX_SIZE = 85

type TreePanelPrefs = {
  viewMode: DiffFileTreeViewMode
  sortBy: DiffFileTreeSortBy
  groupByFolder: boolean
  statusFilter: DiffFileTreeStatusFilter
  stagingChangesPanelSize: number
  stagingStagedPanelSize: number
}

const DEFAULT_PREFS: TreePanelPrefs = {
  viewMode: 'tree',
  sortBy: 'path',
  groupByFolder: false,
  statusFilter: 'all',
  stagingChangesPanelSize: STAGING_CHANGES_PANEL_DEFAULT_SIZE,
  stagingStagedPanelSize: STAGING_STAGED_PANEL_DEFAULT_SIZE,
}

function clampStagingChangesPanelSize(size: number): number {
  if (!Number.isFinite(size)) return STAGING_CHANGES_PANEL_DEFAULT_SIZE
  return Math.min(STAGING_CHANGES_PANEL_MAX_SIZE, Math.max(STAGING_CHANGES_PANEL_MIN_SIZE, size))
}

function clampStagingStagedPanelSize(size: number): number {
  if (!Number.isFinite(size)) return STAGING_STAGED_PANEL_DEFAULT_SIZE
  return Math.min(STAGING_STAGED_PANEL_MAX_SIZE, Math.max(STAGING_STAGED_PANEL_MIN_SIZE, size))
}

const STATUS_FILTERS: DiffFileTreeStatusFilter[] = [
  'all',
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'conflicted',
]

function readPrefs(): TreePanelPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<TreePanelPrefs>
    const viewMode = parsed.viewMode === 'flat' ? 'flat' : 'tree'
    const sortBy = parsed.sortBy === 'name' || parsed.sortBy === 'status' ? parsed.sortBy : 'path'
    const groupByFolder = parsed.groupByFolder === true
    const statusFilter = STATUS_FILTERS.includes(parsed.statusFilter as DiffFileTreeStatusFilter)
      ? (parsed.statusFilter as DiffFileTreeStatusFilter)
      : 'all'
    const stagingChangesPanelSize =
      typeof parsed.stagingChangesPanelSize === 'number'
        ? clampStagingChangesPanelSize(parsed.stagingChangesPanelSize)
        : STAGING_CHANGES_PANEL_DEFAULT_SIZE
    const stagingStagedPanelSize =
      typeof parsed.stagingStagedPanelSize === 'number'
        ? clampStagingStagedPanelSize(parsed.stagingStagedPanelSize)
        : STAGING_STAGED_PANEL_DEFAULT_SIZE
    return { viewMode, sortBy, groupByFolder, statusFilter, stagingChangesPanelSize, stagingStagedPanelSize }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(prefs: TreePanelPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

function readPrefsPartial(): Partial<TreePanelPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<TreePanelPrefs>
  } catch {
    return {}
  }
}

/** Persist panel size without React state — avoids re-render jank while dragging. */
export function persistStagingChangesPanelSize(stagingChangesPanelSize: number) {
  const nextSize = clampStagingChangesPanelSize(stagingChangesPanelSize)
  const partial = readPrefsPartial()
  writePrefs({
    ...DEFAULT_PREFS,
    ...partial,
    stagingChangesPanelSize: nextSize,
    stagingStagedPanelSize:
      typeof partial.stagingStagedPanelSize === 'number'
        ? clampStagingStagedPanelSize(partial.stagingStagedPanelSize)
        : DEFAULT_PREFS.stagingStagedPanelSize,
  })
}

/** Persist staged/commit split without React state — avoids re-render jank while dragging. */
export function persistStagingStagedPanelSize(stagingStagedPanelSize: number) {
  const nextSize = clampStagingStagedPanelSize(stagingStagedPanelSize)
  const partial = readPrefsPartial()
  writePrefs({
    ...DEFAULT_PREFS,
    ...partial,
    stagingStagedPanelSize: nextSize,
    stagingChangesPanelSize:
      typeof partial.stagingChangesPanelSize === 'number'
        ? clampStagingChangesPanelSize(partial.stagingChangesPanelSize)
        : DEFAULT_PREFS.stagingChangesPanelSize,
  })
}

export function useDiffViewerTreePanelPrefs() {
  const [prefs, setPrefs] = useState<TreePanelPrefs>(() => readPrefs())

  const setViewMode = useCallback((viewMode: DiffFileTreeViewMode) => {
    setPrefs(prev => {
      const next = { ...prev, viewMode }
      writePrefs(next)
      return next
    })
  }, [])

  const setSortBy = useCallback((sortBy: DiffFileTreeSortBy) => {
    setPrefs(prev => {
      const next = { ...prev, sortBy }
      writePrefs(next)
      return next
    })
  }, [])

  const setGroupByFolder = useCallback((groupByFolder: boolean) => {
    setPrefs(prev => {
      const next = {
        ...prev,
        groupByFolder,
        viewMode: groupByFolder && prev.viewMode === 'tree' ? 'flat' as const : prev.viewMode,
      }
      writePrefs(next)
      return next
    })
  }, [])

  const setStatusFilter = useCallback((statusFilter: DiffFileTreeStatusFilter) => {
    setPrefs(prev => {
      const next = { ...prev, statusFilter }
      writePrefs(next)
      return next
    })
  }, [])

  const toggleViewMode = useCallback(() => {
    setPrefs(prev => {
      const viewMode = prev.viewMode === 'tree' ? 'flat' : 'tree'
      const next = {
        ...prev,
        viewMode,
        groupByFolder: viewMode === 'tree' ? false : prev.groupByFolder,
      }
      writePrefs(next)
      return next
    })
  }, [])

  const toggleGroupByFolder = useCallback(() => {
    setGroupByFolder(!prefs.groupByFolder)
  }, [prefs.groupByFolder, setGroupByFolder])

  const setStagingChangesPanelSize = useCallback((stagingChangesPanelSize: number) => {
    const nextSize = clampStagingChangesPanelSize(stagingChangesPanelSize)
    setPrefs(prev => {
      if (prev.stagingChangesPanelSize === nextSize) return prev
      const next = { ...prev, stagingChangesPanelSize: nextSize }
      writePrefs(next)
      return next
    })
  }, [])

  const setStagingStagedPanelSize = useCallback((stagingStagedPanelSize: number) => {
    const nextSize = clampStagingStagedPanelSize(stagingStagedPanelSize)
    setPrefs(prev => {
      if (prev.stagingStagedPanelSize === nextSize) return prev
      const next = { ...prev, stagingStagedPanelSize: nextSize }
      writePrefs(next)
      return next
    })
  }, [])

  return {
    viewMode: prefs.viewMode,
    sortBy: prefs.sortBy,
    groupByFolder: prefs.groupByFolder,
    statusFilter: prefs.statusFilter,
    stagingChangesPanelSize: prefs.stagingChangesPanelSize,
    stagingStagedPanelSize: prefs.stagingStagedPanelSize,
    setViewMode,
    setSortBy,
    setGroupByFolder,
    setStatusFilter,
    setStagingChangesPanelSize,
    setStagingStagedPanelSize,
    toggleViewMode,
    toggleGroupByFolder,
  }
}
