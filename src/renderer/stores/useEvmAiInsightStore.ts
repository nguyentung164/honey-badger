import { create } from 'zustand'
import type { EvmMetricIndicatorId } from '@/lib/evmAiPayloads'
import { DEFAULT_EVM_EXPLAIN_INDICATORS } from '@/lib/evmAiPayloads'
import type { EVMTabId } from '@/pages/evm/components/EVMSidebar'

export type EvmAiPromptType = 'EVM_EXPLAIN_METRICS' | 'EVM_SCHEDULE_RISK'

export function evmTabToPromptType(tab: EVMTabId): EvmAiPromptType | null {
  switch (tab) {
    case 'dashboard':
    case 'ev':
    case 'ac':
      return 'EVM_EXPLAIN_METRICS'
    case 'gantt':
      return 'EVM_SCHEDULE_RISK'
    case 'report':
    case 'resource':
    case 'master':
    case 'guideline':
      return null
    default:
      return null
  }
}

export function evmTabSupportsAi(tab: EVMTabId): boolean {
  return evmTabToPromptType(tab) !== null
}

export interface EvmAiHistoryRow {
  id: string
  insightType: string
  outputMarkdown: string
  createdAt: string
}

interface EvmAiInsightState {
  uiSegment: 'analyze' | 'history'
  setUiSegment: (s: 'analyze' | 'history') => void

  explainIndicators: EvmMetricIndicatorId[]
  explainNote: string
  setExplainIndicators: (v: EvmMetricIndicatorId[]) => void
  setExplainNote: (v: string) => void
  toggleExplainIndicator: (id: EvmMetricIndicatorId) => void

  /** Đồng bộ từ bảng WBS (tab AC, syncScheduleFilters) để payload schedule khớp bộ lọc */
  schedulePhaseFilter: string
  scheduleAssigneeFilter: string
  setScheduleFilters: (phase: string, assignee: string) => void

  resultByType: Partial<Record<EvmAiPromptType, string>>
  setResultForType: (type: EvmAiPromptType, text: string) => void

  loadingType: EvmAiPromptType | null
  setLoadingType: (t: EvmAiPromptType | null) => void

  historyRows: EvmAiHistoryRow[]
  historyLoading: boolean
  setHistoryRows: (rows: EvmAiHistoryRow[]) => void
  setHistoryLoading: (v: boolean) => void
  historySelected: EvmAiHistoryRow | null
  setHistorySelected: (row: EvmAiHistoryRow | null) => void

  /** Gọi khi đổi project.id để tránh hiển thị kết quả / lịch sử nhầm dự án. */
  resetForProjectSwitch: () => void
}

export const useEvmAiInsightStore = create<EvmAiInsightState>(set => ({
  uiSegment: 'analyze',
  setUiSegment: s => set({ uiSegment: s }),

  explainIndicators: [...DEFAULT_EVM_EXPLAIN_INDICATORS],
  explainNote: '',
  setExplainIndicators: v => set({ explainIndicators: v }),
  setExplainNote: v => set({ explainNote: v }),
  toggleExplainIndicator: id =>
    set(s => {
      const cur = s.explainIndicators
      const has = cur.includes(id)
      const next = has ? cur.filter(x => x !== id) : [...cur, id]
      return { explainIndicators: next }
    }),

  schedulePhaseFilter: 'all',
  scheduleAssigneeFilter: 'all',
  setScheduleFilters: (phase, assignee) => set({ schedulePhaseFilter: phase, scheduleAssigneeFilter: assignee }),

  resultByType: {},
  setResultForType: (type, text) =>
    set(s => ({ resultByType: { ...s.resultByType, [type]: text } })),

  loadingType: null,
  setLoadingType: t => set({ loadingType: t }),

  historyRows: [],
  historyLoading: false,
  setHistoryRows: rows => set({ historyRows: rows }),
  setHistoryLoading: v => set({ historyLoading: v }),
  historySelected: null,
  setHistorySelected: row => set({ historySelected: row }),

  resetForProjectSwitch: () =>
    set({
      uiSegment: 'analyze',
      explainIndicators: [...DEFAULT_EVM_EXPLAIN_INDICATORS],
      explainNote: '',
      schedulePhaseFilter: 'all',
      scheduleAssigneeFilter: 'all',
      resultByType: {},
      loadingType: null,
      historyRows: [],
      historyLoading: false,
      historySelected: null,
    }),
}))
