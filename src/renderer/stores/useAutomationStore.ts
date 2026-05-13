import type {
  AutomationSettingsState,
  RunStreamEvent,
  TestCase,
  TestCaseResult,
  TestProject,
  TestRunSummary,
} from 'shared/automation/types'
import { create } from 'zustand'

/**
 * Stable fallbacks for `useAutomationStore` selectors. Using `?? []` in a selector creates a fresh
 * array on every `getSnapshot` call, so React 19's `useSyncExternalStore` sees a changed snapshot
 * every render → infinite loop / "Maximum update depth exceeded".
 */
export const automationEmptyCases: TestCase[] = []
export const automationEmptyRuns: TestRunSummary[] = []
export const automationEmptyResults: TestCaseResult[] = []

interface CurrentRunState {
  runId: string | null
  projectId: string | null
  status: TestRunSummary['status'] | 'idle'
  tally: { total: number; passed: number; failed: number; skipped: number; currentTest?: string }
  /** Chi tiết lỗi (stream) — hiển thị dưới status / toast. */
  finishDetail: string | null
}

interface AutomationState {
  projects: TestProject[]
  projectsLoading: boolean
  cases: Record<string, TestCase[]>
  casesLoading: boolean
  runs: Record<string, TestRunSummary[]>
  results: Record<string, TestCaseResult[]>
  settings: AutomationSettingsState | null
  current: CurrentRunState
  streamLog: string[]
  installedBrowsers: string[]
  setProjects: (p: TestProject[]) => void
  setProjectsLoading: (v: boolean) => void
  upsertProject: (p: TestProject) => void
  removeProject: (id: string) => void
  setCases: (projectId: string, cases: TestCase[]) => void
  setCasesLoading: (v: boolean) => void
  setRuns: (projectId: string, runs: TestRunSummary[]) => void
  setResults: (runId: string, results: TestCaseResult[]) => void
  setSettings: (s: AutomationSettingsState) => void
  setInstalledBrowsers: (list: string[]) => void
  handleStreamEvent: (event: RunStreamEvent) => void
  resetCurrentRun: () => void
}

const MAX_LOG_LINES = 5000

export const useAutomationStore = create<AutomationState>(set => ({
  projects: [],
  projectsLoading: false,
  cases: {},
  casesLoading: false,
  runs: {},
  results: {},
  settings: null,
  current: { runId: null, projectId: null, status: 'idle', tally: { total: 0, passed: 0, failed: 0, skipped: 0 }, finishDetail: null },
  streamLog: [],
  installedBrowsers: [],
  setProjects: projects => set({ projects }),
  setProjectsLoading: projectsLoading => set({ projectsLoading }),
  upsertProject: p =>
    set(state => {
      const idx = state.projects.findIndex(x => x.id === p.id)
      if (idx === -1) return { projects: [p, ...state.projects] }
      const next = state.projects.slice()
      next[idx] = p
      return { projects: next }
    }),
  removeProject: id => set(state => ({ projects: state.projects.filter(p => p.id !== id) })),
  setCases: (projectId, cases) => set(state => ({ cases: { ...state.cases, [projectId]: cases } })),
  setCasesLoading: casesLoading => set({ casesLoading }),
  setRuns: (projectId, runs) => set(state => ({ runs: { ...state.runs, [projectId]: runs } })),
  setResults: (runId, results) => set(state => ({ results: { ...state.results, [runId]: results } })),
  setSettings: settings => set({ settings }),
  setInstalledBrowsers: list => set({ installedBrowsers: list }),
  handleStreamEvent: event =>
    set(state => {
      switch (event.kind) {
        case 'started':
          return {
            current: {
              runId: event.runId,
              projectId: event.projectId,
              status: 'running',
              tally: { total: 0, passed: 0, failed: 0, skipped: 0 },
              finishDetail: null,
            },
            streamLog: [],
          }
        case 'log': {
          const lines = (event.chunk ?? '').split('\n')
          const next = state.streamLog.concat(lines).slice(-MAX_LOG_LINES)
          return { streamLog: next }
        }
        case 'progress':
          if (state.current.runId !== event.runId) return {}
          return {
            current: {
              ...state.current,
              tally: {
                total: event.total,
                passed: event.passed,
                failed: event.failed,
                skipped: event.skipped,
                currentTest: event.currentTest,
              },
            },
          }
        case 'persist_failed':
          return {
            current: {
              ...state.current,
              finishDetail: [state.current.finishDetail, event.message].filter(Boolean).join('\n---\n'),
            },
          }
        case 'finished': {
          const finishedRunId = event.runId
          return {
            current: {
              ...state.current,
              status: event.status,
              finishDetail: event.failureDetail ?? null,
            },
            runs:
              state.current.projectId && state.runs[state.current.projectId]
                ? {
                    ...state.runs,
                    [state.current.projectId]: [
                      event.summary,
                      ...(state.runs[state.current.projectId]?.filter(r => r.id !== finishedRunId) ?? []),
                    ],
                  }
                : state.runs,
          }
        }
        default:
          return {}
      }
    }),
  resetCurrentRun: () =>
    set({
      current: { runId: null, projectId: null, status: 'idle', tally: { total: 0, passed: 0, failed: 0, skipped: 0 }, finishDetail: null },
      streamLog: [],
    }),
}))
