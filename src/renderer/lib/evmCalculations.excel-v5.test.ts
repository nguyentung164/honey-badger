import type { ACRow, EVMProject, WBSRow } from 'shared/types/evm'
import { describe, expect, it } from 'vitest'
import {
  computeEacExcelV5,
  computeEacExcelTable1,
  computeEVMMetrics,
  computeTaskBacLikeExcel,
  computeTcpiExcelTool,
  computeTspi,
  computeWbsMasterRollupRows,
  DEFAULT_EVM_HOURS_PER_DAY,
  evForTaskDashboardAtReportDate,
  evForTaskTableAtReportDate,
  deriveWbsPlanFromSparseDayUnits,
  excelWorkdayAddForward,
  planStartWbsDetailLine90,
  pvUpToReportDate,
  taskBudgetMdLikeExcel,
  wbsDetailRowsForRollupKey,
} from './evmCalculations'

const project = (r: string): EVMProject => ({
  id: 'p1',
  projectName: 'P1',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  reportDate: r,
})

describe('EVM Excel V5 parity', () => {
  it('BAC = effort/ngày × working days trong cửa sổ plan', () => {
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        no: 1,
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        percentDone: 0.5,
        effort: 2,
      },
    ]
    const nw: string[] = []
    expect(computeTaskBacLikeExcel(wbs[0], nw)).toBe(10)
  })

  it('BAC từ plan khi effort > 1', () => {
    const row: WBSRow = {
      id: '1',
      projectId: 'p1',
      no: 1,
      planStartDate: '2025-01-06',
      planEndDate: '2025-01-10',
      percentDone: 0,
      effort: 3,
    }
    const nw: string[] = []
    expect(computeTaskBacLikeExcel(row, nw)).toBe(15)
  })

  it('PV tại mốc báo cáo = lũy kế effort/ngày (mặc định 1) × ngày làm đến mốc', () => {
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        no: 1,
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        actualStartDate: '2025-01-06',
        percentDone: 1,
      },
    ]
    const nw: string[] = []
    const pvWed = pvUpToReportDate(project('2025-01-08'), wbs, new Date('2025-01-08'), nw)
    expect(pvWed).toBe(3)
  })

  it('PV tại mốc báo cáo ưu tiên effort/ngày khi có effort', () => {
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        no: 1,
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        actualStartDate: '2025-01-06',
        percentDone: 1,
        effort: 2,
      },
    ]
    const nw: string[] = []
    const pvWed = pvUpToReportDate(project('2025-01-08'), wbs, new Date('2025-01-08'), nw)
    expect(pvWed).toBe(6)
  })

  it('AC only counts rows on or before report date (man-days)', () => {
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        no: 1,
        planStartDate: '2025-01-01',
        planEndDate: '2025-01-31',
        actualStartDate: '2025-01-01',
        percentDone: 1,
      },
    ]
    const ac: ACRow[] = [
      { id: 'a1', projectId: 'p1', no: 1, date: '2025-01-15', workingHours: 16 },
      { id: 'a2', projectId: 'p1', no: 2, date: '2025-02-15', workingHours: 80 },
    ]
    const m = computeEVMMetrics({
      project: project('2025-01-20'),
      wbs,
      ac,
      hoursPerDay: 8,
      nonWorkingDays: [],
    })
    expect(m.ac).toBe(2)
  })

  it('EAC matches Dashboard: AC + (BAC-EV)/(CPI*SPI)', () => {
    const bac = 100
    const ev = 40
    const ac = 50
    const pv = 50
    const cpi = ev / ac
    const spi = ev / pv
    expect(computeEacExcelV5(bac, ev, ac, pv)).toBeCloseTo(ac + (bac - ev) / (cpi * spi), 6)
  })

  it('TCPI Dashboard / EVM_Tool: (BAC-EV)/(EAC-AC), mẫu 1 khi EAC=AC', () => {
    const bac = 100
    const ev = 40
    const ac = 50
    const pv = 50
    const eac = computeEacExcelV5(bac, ev, ac, pv)
    const etc = eac - ac
    const denom = Math.abs(etc) < 1e-12 ? 1 : etc
    expect(computeTcpiExcelTool(bac, ev, eac, ac)).toBeCloseTo((bac - ev) / denom, 6)
    const m = computeEVMMetrics({
      project: project('2025-06-01'),
      wbs: [
        {
          id: '1',
          projectId: 'p1',
          no: 1,
          planStartDate: '2025-01-01',
          planEndDate: '2025-12-31',
          actualStartDate: '2025-01-01',
          percentDone: 0.4,
        },
      ],
      ac: [{ id: 'a1', projectId: 'p1', no: 1, date: '2025-06-01', workingHours: 400 }],
      hoursPerDay: 8,
      nonWorkingDays: [],
    })
    expect(m.tcpi).not.toBeNull()
    if (m.tcpi != null && m.eac != null) {
      expect(m.tcpi).toBeCloseTo(computeTcpiExcelTool(m.bac, m.ev, m.eac, m.ac) ?? 0, 6)
    }
  })

  it('TSPI Excel: (BAC − EV) ÷ IF(BAC = 0, 1, BAC − PV)', () => {
    expect(computeTspi(0, 5, 10)).toBeCloseTo(-5, 6)
    expect(computeTspi(100, 40, 50)).toBeCloseTo(60 / 50, 6)
    expect(computeTspi(100, 40, 100)).toBeNull()
    const m = computeEVMMetrics({
      project: project('2025-06-01'),
      wbs: [
        {
          id: '1',
          projectId: 'p1',
          no: 1,
          planStartDate: '2025-01-01',
          planEndDate: '2025-12-31',
          actualStartDate: '2025-01-01',
          percentDone: 0.4,
        },
      ],
      ac: [{ id: 'a1', projectId: 'p1', no: 1, date: '2025-06-01', workingHours: 400 }],
      hoursPerDay: 8,
      nonWorkingDays: [],
    })
    expect(m.tspi).toBeCloseTo(computeTspi(m.bac, m.ev, m.pv) ?? 0, 6)
  })

  it('DEFAULT hours per day is 8 (Excel)', () => {
    expect(DEFAULT_EVM_HOURS_PER_DAY).toBe(8)
  })

  it('BAC ưu tiên estMd (cột Q) khi có', () => {
    const nw: string[] = []
    const wbs: WBSRow = {
      id: '1',
      projectId: 'p1',
      no: 1,
      planStartDate: '2025-01-06',
      planEndDate: '2025-01-10',
      percentDone: 0,
      estMd: 3,
    }
    expect(taskBudgetMdLikeExcel(wbs, nw)).toBe(3)
    expect(computeTaskBacLikeExcel(wbs, nw)).toBe(5)
  })

  it('EAC bảng EV = AC+(BAC-EV)/CPI (không SPI)', () => {
    expect(computeEacExcelTable1(100, 40, 50)).toBeCloseTo(50 + 60 / 0.8, 6)
  })

  it('EV: sheet EV (L rỗng) K≤Report → Q×N; chỉ WBS không AC', () => {
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        no: 1,
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        actualStartDate: '2025-01-07',
        percentDone: 0.5,
      },
    ]
    const ac: ACRow[] = []
    const m = computeEVMMetrics({
      project: project('2025-01-10'),
      wbs,
      ac,
      hoursPerDay: 8,
      nonWorkingDays: [],
    })
    expect(m.ev).toBeCloseTo(5 * 0.5, 6)
  })

  it('EV chỉ từ WBS: Actual Start + % Done trên WBS; AC không ghi đè EV', () => {
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        no: 1,
        phase: 'Ph1',
        assignee: 'U1',
        task: 'Làm A',
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        actualStartDate: '2025-01-07',
        percentDone: 1,
      },
    ]
    const ac: ACRow[] = [
      {
        id: 'a1',
        projectId: 'p1',
        no: 1,
        date: '2025-01-07',
        phase: 'Ph1',
        assignee: 'U1',
        workContents: 'Làm A',
        workingHours: 80,
      },
    ]
    const m = computeEVMMetrics({
      project: project('2025-01-10'),
      wbs,
      ac,
      hoursPerDay: 8,
      nonWorkingDays: [],
    })
    expect(m.ev).toBeCloseTo(5, 6)
    expect(m.ac).toBeCloseTo(10, 6)
  })

  it('Table1 rollup: gom phase+category+feature+note — BAC/PV/EV/SPI', () => {
    const p = project('2025-01-10')
    const wbs: WBSRow[] = [
      {
        id: '1',
        projectId: 'p1',
        masterId: 'm1',
        no: 1,
        phase: 'A',
        category: 'c1',
        feature: 'f1',
        wbsNote: 'n1',
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        actualStartDate: '2025-01-06',
        percentDone: 1,
      },
      {
        id: '2',
        projectId: 'p1',
        masterId: 'm1',
        no: 2,
        phase: 'A',
        category: 'c1',
        feature: 'f1',
        wbsNote: 'n1',
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-10',
        actualStartDate: '2025-01-06',
        percentDone: 1,
      },
      {
        id: '3',
        projectId: 'p1',
        masterId: 'm2',
        no: 3,
        phase: 'B',
        category: 'c1',
        feature: 'f1',
        planStartDate: '2025-01-06',
        planEndDate: '2025-01-08',
        actualStartDate: '2025-01-06',
        percentDone: 0.5,
      },
    ]
    const rolls = computeWbsMasterRollupRows(p, wbs, [])
    const g1 = rolls.find(r => r.phase === 'A' && r.category === 'c1')
    expect(g1?.masterId).toBe('m1')
    expect(g1?.detailCount).toBe(2)
    expect(g1?.bac).toBe(10)
    expect(g1?.ev).toBeCloseTo(10, 6)
    expect(g1?.spi).toBeCloseTo(1, 6)
    const g2 = rolls.find(r => r.phase === 'B')
    expect(g2?.masterId).toBe('m2')
    expect(g2?.bac).toBe(3)
    expect(g2?.ev).toBeCloseTo(1.5, 6)
    expect(wbsDetailRowsForRollupKey(wbs, g1!.rollupKey).length).toBe(2)
  })

  it('Sheet EV / テーブル1: L sau ngày báo cáo → EV bảng = 0; Dashboard vẫn Q×N nếu K≤Report (khớp E11)', () => {
    const wbsOne: WBSRow = {
      id: '1',
      projectId: 'p1',
      no: 1,
      planStartDate: '2025-01-06',
      planEndDate: '2025-01-10',
      actualStartDate: '2025-01-06',
      actualEndDate: '2025-01-20',
      percentDone: 1,
    }
    const rep = new Date('2025-01-10')
    const nw: string[] = []
    expect(evForTaskTableAtReportDate(wbsOne, rep, nw)).toBe(0)
    expect(evForTaskDashboardAtReportDate(wbsOne, rep, nw)).toBeCloseTo(5, 6)
    const m = computeEVMMetrics({
      project: project('2025-01-10'),
      wbs: [wbsOne],
      ac: [],
      hoursPerDay: 8,
      nonWorkingDays: [],
    })
    expect(m.ev).toBeCloseTo(5, 6)
  })
})

describe('Plan Start / WORKDAY (EVM_Tool.txt WBS Details)', () => {
  const nw: string[] = []

  it('WORKDAY: thứ 3 + 1 ngày làm = thứ 4', () => {
    expect(excelWorkdayAddForward('2025-01-07', 1, nw)).toBe('2025-01-08')
  })

  it('WORKDAY: thứ 6 + 1 ngày làm = thứ 2', () => {
    expect(excelWorkdayAddForward('2025-01-10', 1, nw)).toBe('2025-01-13')
  })

  it('Plan start không predecessor = neo project start lên ngày làm', () => {
    expect(
      planStartWbsDetailLine90({
        projectStartYmd: '2025-01-04',
        predecessorNo: null,
        nonWorkingDays: nw,
      }),
    ).toBe('2025-01-06')
  })

  it('Plan start có predecessor = WORKDAY(plan start tiền nhiệm, 1)', () => {
    expect(
      planStartWbsDetailLine90({
        projectStartYmd: '2025-01-01',
        predecessorNo: 1,
        predecessorPlanStartYmd: '2025-01-07',
        nonWorkingDays: nw,
      }),
    ).toBe('2025-01-08')
  })

  it('derive plan từ sparse day units (chỉ ngày có effort)', () => {
    const r = deriveWbsPlanFromSparseDayUnits(
      [
        { workDate: '2025-01-08', unit: 1 },
        { workDate: '2025-01-10', unit: 0.5 },
      ],
      nw,
    )
    expect(r.planStartDate).toBe('2025-01-08')
    expect(r.planEndDate).toBe('2025-01-10')
    expect(r.durationDays).toBe(2)
  })
})
