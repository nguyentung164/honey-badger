import type { ACRow, EVMMaster, EVMProject, WBSRow, WbsDayUnitRow } from 'shared/types/evm'
import { taskPlanEffortPerDay } from '@/lib/evmCalculations'
import { computeEACScenarios, computeEVByPhase, computeEVMMetrics, DEFAULT_EVM_HOURS_PER_DAY, type EVMResult } from '@/lib/evmCalculations'

export const MAX_SCHEDULE_TASKS_IN_PAYLOAD = 120

export type EvmMetricIndicatorId = 'CPI' | 'SPI' | 'EAC' | 'ETC' | 'VAC' | 'PV' | 'EV' | 'AC' | 'SV' | 'CV' | 'BAC' | 'PROGRESS'

export const DEFAULT_EVM_EXPLAIN_INDICATORS: EvmMetricIndicatorId[] = ['CPI', 'SPI', 'EAC', 'ETC', 'VAC', 'PROGRESS']

/** Milestone theo phase — cùng logic Excel V5 (PV theo lịch WBS, EV khi đã actual start). */
export function buildMilestoneRows(
  master: EVMMaster,
  wbs: WBSRow[],
  project: EVMProject,
  ac: ACRow[],
  nonWorkingDays: string[],
  wbsDayUnits: WbsDayUnitRow[] = [],
): Array<{
  phaseCode: string
  phase: string
  pv: number
  ev: number
  sv: number
  progress: number
  note: string
}> {
  const hpd = master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY
  const phaseCodes = master.phases.map(p => p.code)
  const rows = computeEVByPhase(project, wbs, ac, phaseCodes, hpd, nonWorkingDays, undefined, wbsDayUnits)
  const byPhase = new Map(rows.map(r => [r.phase, r]))
  return master.phases.map(p => {
    const row = byPhase.get(p.code)
    return {
      phaseCode: p.code,
      phase: p.name ?? p.code,
      pv: row?.pv ?? 0,
      ev: row?.ev ?? 0,
      sv: row?.sv ?? 0,
      progress: row?.progress ?? 0,
      note: '',
    }
  })
}

export function buildExplainMetricsPayload(input: {
  project: EVMProject
  master: EVMMaster
  wbs: WBSRow[]
  ac: ACRow[]
  nonWorkingDays: string[]
  wbsDayUnits?: WbsDayUnitRow[]
  selectedIndicators: EvmMetricIndicatorId[]
  userNote?: string
}): string {
  const metrics = computeEVMMetrics({
    project: input.project,
    wbs: input.wbs,
    ac: input.ac,
    hoursPerDay: input.master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY,
    nonWorkingDays: input.nonWorkingDays,
    wbsDayUnits: input.wbsDayUnits,
  })
  const scenarios = computeEACScenarios(metrics.bac, metrics.ev, metrics.ac, metrics.cpi, metrics.pv)
  return JSON.stringify(
    {
      project: {
        projectName: input.project.projectName,
        reportDate: input.project.reportDate,
        startDate: input.project.startDate,
        endDate: input.project.endDate,
      },
      evmModel: 'excel_v5_plan_gantt',
      hoursPerDay: input.master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY,
      selectedIndicators: input.selectedIndicators,
      userNote: input.userNote?.trim() || undefined,
      metrics: pickMetricsForAi(metrics),
      eacScenarios: scenarios,
    },
    null,
    0
  )
}

function pickMetricsForAi(m: EVMResult) {
  return {
    bac: m.bac,
    pv: m.pv,
    ev: m.ev,
    ac: m.ac,
    spi: m.spi,
    cpi: m.cpi,
    sv: m.sv,
    cv: m.cv,
    eac: m.eac,
    etc: m.etc,
    vac: m.vac,
    progress: m.progress,
    progressPercent: m.progress * 100,
    tcpi: m.tcpi,
    tcpiBac: m.tcpiBac,
    tspi: m.tspi,
  }
}

export function buildScheduleRiskPayload(input: {
  project: EVMProject
  master: EVMMaster
  wbs: WBSRow[]
  ac: ACRow[]
  nonWorkingDays: string[]
  wbsDayUnits?: WbsDayUnitRow[]
  metrics: EVMResult
  /** Danh sách task gửi AI — ví dụ filteredWbs slice */
  tasks: WBSRow[]
  truncated?: boolean
}): string {
  const milestones = buildMilestoneRows(
    input.master,
    input.wbs,
    input.project,
    input.ac,
    input.nonWorkingDays,
    input.wbsDayUnits ?? [],
  )
  const taskRows = input.tasks.slice(0, MAX_SCHEDULE_TASKS_IN_PAYLOAD).map(r => ({
    phase: r.phase,
    task: r.task,
    planStartDate: r.planStartDate,
    planEndDate: r.planEndDate,
    actualStartDate: r.actualStartDate,
    actualEndDate: r.actualEndDate,
    percentDone: r.percentDone,
    status: r.statusName ?? r.status,
    assignee: r.assigneeName ?? r.assignee,
    effortPerDay: taskPlanEffortPerDay(r),
    bac: r.bac,
  }))
  return JSON.stringify(
    {
      evmModel: 'excel_v5_plan_gantt',
      reportDate: input.project.reportDate,
      planStart: input.project.startDate,
      planEnd: input.project.endDate,
      projectName: input.project.projectName,
      truncated: input.truncated ?? false,
      taskCountInPayload: taskRows.length,
      spi: input.metrics.spi,
      cpi: input.metrics.cpi,
      tasks: taskRows,
      milestones,
    },
    null,
    0
  )
}
