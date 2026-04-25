/**
 * EVM tool V5.0 (Plan⇒Gantt) — khớp workbook Excel (`Dashboard`, `WBS (Schedule)`, `EV` / テーブル1, `AC`, `Resource`).
 *
 * **BAC (Dashboard A14):** `SUM(Q)` — cột Est. (MD) `estMd`; nếu trống thì Q suy ra từ kế hoạch: **effort/ngày** × ngày làm trong [Plan Start, Plan End] (`computeTaskBacLikeExcel`); effort mặc định 1.
 *
 * **PV / lưới ngày kế hoạch:** mỗi ngày làm việc trong cửa sổ plan nhận **effort/ngày** (mặc định 1), i.e. NETWORKDAYS × effort.
 *
 * **EV Dashboard (E11):** `SUMPRODUCT((K<=ReportDate)*Q*N)` — chỉ Actual Start K, **không** xét Actual End L (đúng `sheet1.xml`).
 *
 * **EV sheet ẩn / テーブル1:** hai nhánh — (K không trống, L trống, K≤ngày) hoặc (K,L có, L≤ngày); mọi nhánh dùng Q×N.
 *
 * **EAC:** Dashboard = `AC+(BAC-EV)/(CPI×SPI)`; bảng EV = `AC+(BAC-EV)/CPI` khi CPI≠0.
 *
 * AC man-day = tổng giờ đến mốc ÷ `hoursPerDay`.
 *
 * Đồng bộ DB (`schema.sql`): `evm_wbs_details.progress`, `evm_ac.percent_done`, rollup master `evm_wbs_master.progress` lưu tiến độ dạng 0…1; `mysqlEVMStore` chuẩn hoá đọc/ghi (kể legacy 0…100 ở WBS detail/master).
 */
import type { ACRow, EVMProject, WBSRow, WbsDayUnitRow } from 'shared/types/evm'

export const DEFAULT_EVM_HOURS_PER_DAY = 8

/** Progress 0…100% bước 10 — lưu nội bộ 0…1 (EVM_Tool.txt). */
export const EVM_PERCENT_DONE_OPTIONS_DEFAULT = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

/**
 * Chuẩn hóa ngày lịch (YYYY-MM-DD) theo múi giờ local để khớp cột lưới eachDayOfInterval(parseLocalDate).
 * Tránh: parseISO('yyyy-MM-dd') = UTC nửa đêm → có thể lệch 1 ngày so với format(local);
 * và chuỗi ISO đầy đủ không khớp key map nếu chỉ slice(0,10) một phía.
 */
export function normalizeEvmCalendarDay(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return undefined
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, mo, day] = t.split('-').map(Number)
    const d = new Date(y, mo - 1, day)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Count working days between start and end (inclusive), NETWORKDAYS-style: T7/CN + `nonWorkingDays` không tính. */
export function workingDaysBetweenInclusive(start: Date, end: Date, nonWorkingDays: string[]): number {
  const nw = nonWorkingSetForEvm(nonWorkingDays)
  let count = 0
  const current = new Date(start)
  current.setHours(0, 0, 0, 0)
  const endDate = new Date(end)
  endDate.setHours(0, 0, 0, 0)
  while (current <= endDate) {
    if (isCalendarWorkdayForEvm(current, nw)) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

function workingDaysBetween(start: Date, end: Date, nonWorkingDays: string[]): number {
  return workingDaysBetweenInclusive(start, end, nonWorkingDays)
}

function isCalendarWorkdayForEvm(d: Date, nonWorkingSet: Set<string>): boolean {
  const ds = toDateStr(d)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  if (nonWorkingSet.has(ds)) return false
  return true
}

function nonWorkingSetForEvm(nonWorkingDays: string[]): Set<string> {
  return new Set(nonWorkingDays.map(d => normalizeEvmCalendarDay(d) ?? d.slice(0, 10)))
}

/**
 * Ngày làm đầu tiên on hoặc sau `startYmd` (neo kế hoạch; T7/CN + ngày nghỉ master bị bỏ qua).
 */
export function evmFirstWorkdayOnOrAfter(startYmd: string, nonWorkingDays: string[]): string | null {
  const s = normalizeEvmCalendarDay(startYmd)
  if (!s) return null
  const nw = nonWorkingSetForEvm(nonWorkingDays)
  const parsed = parseDate(s)
  if (!parsed) return null
  const d = new Date(parsed)
  d.setHours(0, 0, 0, 0)
  while (!isCalendarWorkdayForEvm(d, nw)) {
    d.setDate(d.getDate() + 1)
  }
  return toDateStr(d)
}

/**
 * Excel `WORKDAY(start, days, holidays)` với `days` > 0: bước về phía sau, mỗi ngày làm được tính một bước
 * (T7/CN và `nonWorking` không tính).
 */
export function excelWorkdayAddForward(startYmd: string, workingDays: number, nonWorkingDays: string[]): string | null {
  if (!Number.isFinite(workingDays) || workingDays < 1) return null
  const s = normalizeEvmCalendarDay(startYmd)
  if (!s) return null
  const nw = nonWorkingSetForEvm(nonWorkingDays)
  const parsed = parseDate(s)
  if (!parsed) return null
  const d = new Date(parsed)
  d.setHours(0, 0, 0, 0)
  let remaining = workingDays
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (isCalendarWorkdayForEvm(d, nw)) remaining--
  }
  return toDateStr(d)
}

/**
 * Plan Start — WBS Details theo `EVM_Tool.txt` dòng 90:
 * `IF(ISBLANK(duration),"", IF(ISBLANK(predecessor), projectStartDate, WORKDAY(INDEX(tblWBS,MATCH(pred,No,0),8),1,nonWorking)))`.
 * Cột 8 (H) = Plan Start của dòng tiền nhiệm. Gọi khi đã có `duration >= 1` (duration trống thì Excel để trống plan start).
 */
/** Ngày làm việc theo master (T7/CN + nghỉ) — dùng khi chỉnh ô lưới Gantt / Resource. */
export function isEvmCalendarWorkdayYmd(ymd: string, nonWorkingDays: string[]): boolean {
  const ds = normalizeEvmCalendarDay(ymd)
  if (!ds) return false
  const d = parseDate(ds)
  if (!d) return false
  return isCalendarWorkdayForEvm(d, nonWorkingSetForEvm(nonWorkingDays))
}

/**
 * Suy Plan Start / Plan End / Duration (số ngày làm có phân bổ > 0) từ `evm_wbs_day_unit` sau khi nhập lưới —
 * khớp quy trình EVM Tool (phân bổ công số trên biểu đồ → ngày kế hoạch tự cập nhật).
 */
export function deriveWbsPlanFromSparseDayUnits(
  entries: { workDate: string; unit: number }[],
  nonWorkingDays: string[],
): { planStartDate?: string; planEndDate?: string; durationDays: number | null } {
  const nw = nonWorkingSetForEvm(nonWorkingDays)
  const days: string[] = []
  for (const e of entries) {
    if (e.unit <= 1e-9) continue
    const ds = normalizeEvmCalendarDay(e.workDate) ?? e.workDate.slice(0, 10)
    const p = parseDate(ds)
    if (!p || !isCalendarWorkdayForEvm(p, nw)) continue
    days.push(ds)
  }
  days.sort()
  if (days.length === 0) return { planStartDate: undefined, planEndDate: undefined, durationDays: null }
  return {
    planStartDate: days[0],
    planEndDate: days[days.length - 1],
    durationDays: days.length,
  }
}

export function planStartWbsDetailLine90(params: {
  projectStartYmd: string
  predecessorNo: number | null
  predecessorPlanStartYmd?: string | null
  predecessorPlanEndYmd?: string | null
  nonWorkingDays: string[]
}): string | null {
  const { projectStartYmd, predecessorNo, predecessorPlanStartYmd, predecessorPlanEndYmd, nonWorkingDays } = params
  const ps = normalizeEvmCalendarDay(projectStartYmd)
  if (!ps) return null

  if (predecessorNo == null) {
    return evmFirstWorkdayOnOrAfter(ps, nonWorkingDays)
  }

  const predStart = normalizeEvmCalendarDay(predecessorPlanStartYmd)
  if (predStart) {
    return excelWorkdayAddForward(predStart, 1, nonWorkingDays)
  }
  const predEnd = normalizeEvmCalendarDay(predecessorPlanEndYmd)
  if (predEnd) {
    return excelWorkdayAddForward(predEnd, 1, nonWorkingDays)
  }
  return evmFirstWorkdayOnOrAfter(ps, nonWorkingDays)
}

/**
 * Plan end khi duration là số **ngày làm việc** trong khoảng [start…end] (cả hai biên là ngày làm),
 * tương đương chuỗi ngày làm liên tiếp sau khi neo start lên ngày làm đầu tiên (EVM_Tool: WORKDAY + duration).
 */
export function planEndFromStartAndDurationWorkdays(
  planStartYmd: string,
  durationDays: number,
  nonWorkingDays: string[],
): string | null {
  if (!planStartYmd?.trim() || !Number.isFinite(durationDays) || durationDays < 1) return null
  const nw = new Set(nonWorkingDays.map(d => normalizeEvmCalendarDay(d) ?? d.slice(0, 10)))
  const parsed = parseDate(planStartYmd.trim())
  if (!parsed) return null
  const d = new Date(parsed)
  d.setHours(0, 0, 0, 0)
  while (!isCalendarWorkdayForEvm(d, nw)) {
    d.setDate(d.getDate() + 1)
  }
  let remaining = durationDays - 1
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (isCalendarWorkdayForEvm(d, nw)) remaining--
  }
  return toDateStr(d)
}

/**
 * Số ngày làm việc trễ so kế hoạch: sau plan end đến actual end (nếu có) hoặc đến ngày tham chiếu (vd. hôm nay).
 * Không ghi DB — chỉ gợi ý UI (gần NETWORKDAYS "Late" trong EVM_Tool).
 */
export function evmScheduleSlipWorkingDays(
  planEndYmd: string | null | undefined,
  actualEndYmd: string | null | undefined,
  referenceYmd: string,
  nonWorkingDays: string[],
): number | null {
  const pe = normalizeEvmCalendarDay(planEndYmd ?? undefined)
  if (!pe) return null
  const ae = normalizeEvmCalendarDay(actualEndYmd ?? undefined)
  const ref = normalizeEvmCalendarDay(referenceYmd) ?? referenceYmd.trim().slice(0, 10)
  if (ae) {
    if (ae <= pe) return null
    const start = parseDate(pe)
    if (!start) return null
    start.setDate(start.getDate() + 1)
    const end = parseDate(ae)
    if (!end || start > end) return null
    return workingDaysBetweenInclusive(start, end, nonWorkingDays)
  }
  if (!ref || ref <= pe) return null
  const start = parseDate(pe)
  if (!start) return null
  start.setDate(start.getDate() + 1)
  const end = parseDate(ref)
  if (!end || start > end) return null
  return workingDaysBetweenInclusive(start, end, nonWorkingDays)
}

/** Effort/ngày làm việc trên lưới kế hoạch; mặc định 1 khi chưa nhập. */
export function taskPlanEffortPerDay(r: WBSRow): number {
  const e = r.effort
  if (e != null && Number.isFinite(e) && e > 0) return e
  return 1
}

/**
 * Ô timeline thuộc dải kế hoạch (Excel): ngày trong [planStart, planEnd], không T7/CN, không ngày nghỉ master.
 * Dùng tô nền dải plan trên lưới AC (ô trắng = ngày làm; cuối tuần xám vẫn không tô xanh).
 */
export function isYmdInPlanWorkingRange(
  ds: string,
  planStart: string | null | undefined,
  planEnd: string | null | undefined,
  nonWorkingDays: string[],
): boolean {
  const dNorm = normalizeEvmCalendarDay(ds)
  const ps = normalizeEvmCalendarDay(planStart)
  const pe = normalizeEvmCalendarDay(planEnd)
  if (!dNorm || !ps || !pe || dNorm < ps || dNorm > pe) return false
  const nonWorkingSet = new Set(nonWorkingDays.map(x => normalizeEvmCalendarDay(x) ?? x.slice(0, 10)))
  if (nonWorkingSet.has(dNorm)) return false
  const [y, mo, day] = dNorm.split('-').map(Number)
  const dt = new Date(y, mo - 1, day)
  const dow = dt.getDay()
  if (dow === 0 || dow === 6) return false
  return true
}

/**
 * Sinh sparse đơn vị/ngày làm (mỗi ngày làm trong plan × effort/ngày, mặc định 1) để lưu `evm_wbs_day_unit`.
 */
export function buildWbsDayUnitsFromPlan(row: WBSRow, nonWorkingDays: string[]): { workDate: string; unit: number }[] {
  const h = parseDate(row.planStartDate)
  const i = parseDate(row.planEndDate)
  if (!h || !i) return []
  const nw = nonWorkingSetForEvm(nonWorkingDays)
  const w = taskPlanEffortPerDay(row)
  const out: { workDate: string; unit: number }[] = []
  const cur = new Date(h)
  cur.setHours(0, 0, 0, 0)
  const endDate = new Date(i)
  endDate.setHours(0, 0, 0, 0)
  if (endDate < cur) return []
  while (cur <= endDate) {
    const ds = toDateStr(cur)
    if (isCalendarWorkdayForEvm(cur, nw)) out.push({ workDate: ds, unit: w })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/**
 * Ô lưới WBS/Resource: mặc định từ plan × effort/ngày; nếu **đã có** bản ghi `evm_wbs_day_unit` cho dòng thì chỉ dùng DB
 * (tránh lấp lại ô plan sau khi người dùng xóa/xén phân bổ trên lưới Gantt).
 */
export function mergeWbsDayUnitsStoredWithPlan(
  wbs: WBSRow[],
  stored: WbsDayUnitRow[] | undefined,
  nonWorkingDays: string[],
): WbsDayUnitRow[] {
  const m = new Map<string, WbsDayUnitRow>()
  const storedByWbs = new Map<string, WbsDayUnitRow[]>()
  for (const u of stored ?? []) {
    const id = u.wbsId
    let list = storedByWbs.get(id)
    if (!list) {
      list = []
      storedByWbs.set(id, list)
    }
    list.push(u)
  }
  for (const row of wbs) {
    const forRow = storedByWbs.get(row.id)
    if (forRow && forRow.length > 0) {
      for (const u of forRow) {
        const wd = normalizeEvmCalendarDay(u.workDate) ?? u.workDate.slice(0, 10)
        if (!isEvmCalendarWorkdayYmd(wd, nonWorkingDays)) continue
        m.set(`${row.id}\t${wd}`, { wbsId: row.id, workDate: wd, unit: u.unit })
      }
    } else {
      for (const e of buildWbsDayUnitsFromPlan(row, nonWorkingDays)) {
        const wd = normalizeEvmCalendarDay(e.workDate) ?? e.workDate
        m.set(`${row.id}\t${wd}`, { wbsId: row.id, workDate: wd, unit: e.unit })
      }
    }
  }
  return [...m.values()]
}

/**
 * BAC dòng WBS kiểu Excel: effort/ngày × (số ngày làm từ planStart→planEnd); effort mặc định 1.
 * Nếu không có planStart/planEnd: dùng cột bac đã lưu (hành vi nhập tay / legacy).
 */
export function computeTaskBacLikeExcel(r: WBSRow, nonWorkingDays: string[]): number {
  const h = parseDate(r.planStartDate)
  const i = parseDate(r.planEndDate)
  if (h && i) {
    const w = taskPlanEffortPerDay(r)
    return w * workingDaysBetween(h, i, nonWorkingDays)
  }
  return r.bac ?? 0
}

/**
 * Cột Q (Est. MD) trên Excel: ưu tiên `estMd` đã nhập; nếu không thì Q suy ra từ cửa sổ kế hoạch × effort/ngày (mặc định 1).
 * Dùng cho BAC, EV (Q×N) khớp workbook.
 */
export function taskBudgetMdLikeExcel(r: WBSRow, nonWorkingDays: string[]): number {
  const md = r.estMd
  if (md != null && Number.isFinite(md) && md > 0) return md
  return computeTaskBacLikeExcel(r, nonWorkingDays)
}

function taskPercentNLikeExcel(r: WBSRow): number {
  return Math.min(1, Math.max(0, r.percentDone ?? 0))
}

export function pvForTaskUpToDate(r: WBSRow, reportDate: Date, project: EVMProject, nonWorkingDays: string[]): number {
  const h = parseDate(r.planStartDate)
  const i = parseDate(r.planEndDate)
  const w = taskPlanEffortPerDay(r)
  if (h && i) {
    if (reportDate < h) return 0
    const endClip = reportDate <= i ? reportDate : i
    return w * workingDaysBetween(h, endClip, nonWorkingDays)
  }
  const bac = r.bac ?? 0
  if (bac <= 0) return 0
  const ps = parseDate(project.startDate)
  const pe = parseDate(project.endDate)
  if (!ps || !pe) return 0
  const total = Math.max(1, workingDaysBetween(ps, pe, nonWorkingDays))
  if (reportDate < ps) return 0
  const endC = reportDate <= pe ? reportDate : pe
  const elapsed = workingDaysBetween(ps, endC, nonWorkingDays)
  const pct = Math.min(1, Math.max(0, elapsed / total))
  return bac * pct
}

/**
 * Khớp dòng AC với dòng WBS (cùng quy tắc gán giờ AC trong `WbsTaskTable.buildAcHoursByWbsRowId`).
 */
const PHASE_ASSIGNEE_KEY_SEP = '\u0000'

/** Gom WBS theo (phase, assignee) để cộng giờ AC không lặp O(|AC|×|WBS|) đầy đủ. */
export function groupWbsRowsByPhaseAssigneeKey(rows: WBSRow[]): Map<string, WBSRow[]> {
  const m = new Map<string, WBSRow[]>()
  for (const w of rows) {
    const k = `${w.phase ?? ''}${PHASE_ASSIGNEE_KEY_SEP}${w.assignee ?? ''}`
    const arr = m.get(k)
    if (arr) arr.push(w)
    else m.set(k, [w])
  }
  return m
}

export function acRowPhaseAssigneeKey(a: ACRow): string {
  return `${a.phase ?? ''}${PHASE_ASSIGNEE_KEY_SEP}${a.assignee ?? ''}`
}

export function acRowMatchesWbsForEvmExcel(w: WBSRow, a: ACRow): boolean {
  if ((w.phase ?? '') !== (a.phase ?? '')) return false
  if ((w.assignee ?? '') !== (a.assignee ?? '')) return false
  const wc = w.category?.trim()
  const acat = a.category?.trim()
  if (wc && acat && wc !== acat) return false
  const wf = w.feature?.trim()
  const af = a.feature?.trim()
  if (wf && af && wf !== af) return false
  const wt = (w.task ?? '').trim()
  const at = (a.task ?? a.workContents ?? '').trim()
  if (wt && at) {
    if (wt !== at && !wt.includes(at) && !at.includes(wt)) return false
  }
  return true
}

const PERCENT_SNAP_EPS = 1e-5

/**
 * Chuẩn hóa % hoàn thành (0…1) về một giá trị chuỗi khớp preset hoặc mã tùy chỉnh cho Combobox.
 */
export function snapPercentDoneToPresetOptions(
  raw: number | null | undefined,
  options: number[],
): { choice: string; orphanLabel?: string } {
  if (raw == null || !Number.isFinite(raw)) return { choice: '' }
  let p = raw > 1 ? raw / 100 : raw
  p = Math.min(1, Math.max(0, p))
  const opts = options.length > 0 ? options : [...EVM_PERCENT_DONE_OPTIONS_DEFAULT]
  for (const o of opts) {
    if (Math.abs(o - p) < PERCENT_SNAP_EPS) return { choice: String(o) }
  }
  let closest = opts[0] ?? 0
  let bestD = Math.abs(p - closest)
  for (const o of opts) {
    const d = Math.abs(p - o)
    if (d < bestD) {
      bestD = d
      closest = o
    }
  }
  if (bestD <= 0.05 + PERCENT_SNAP_EPS) return { choice: String(closest) }
  const rounded = Math.round(p * 10000) / 10000
  return { choice: String(rounded), orphanLabel: `${Math.round(p * 100)}%` }
}

/**
 * Snapshot WBS cho EV: dùng trực tiếp dữ liệu WBS (tab AC chỉ cập nhật WBS; không merge ledger AC).
 */
export function wbsRowsMergedWithAcForGuideline(
  wbs: WBSRow[],
  _ac: ACRow[],
  _reportCutoffStr: string,
  _hoursPerDay: number,
  _nonWorkingDays: string[]
): WBSRow[] {
  return wbs.map(r => ({ ...r }))
}

/**
 * EV một task — **sheet EV / テーブル1**: chỉ tính khi (đang làm: K≤B, L trống) hoặc (đã đóng: L≤B); Q = Est MD hoặc Q kế hoạch.
 */
export function evForTaskTableAtReportDate(r: WBSRow, reportDate: Date, nonWorkingDays: string[]): number {
  const b = toDateStr(reportDate)
  const q = taskBudgetMdLikeExcel(r, nonWorkingDays)
  const n = taskPercentNLikeExcel(r)
  const k = parseDate(r.actualStartDate)
  const lTrim = r.actualEndDate?.trim()

  if (!lTrim) {
    if (!k || toDateStr(k) > b) return 0
    return q * n
  }
  const l = parseDate(r.actualEndDate)
  if (!l || toDateStr(l) > b) return 0
  return q * n
}

/**
 * EV một task — **Dashboard E11:** `(K<=ReportDate)*Q*N` (Excel không lọc theo L).
 */
export function evForTaskDashboardAtReportDate(r: WBSRow, reportDate: Date, nonWorkingDays: string[]): number {
  const b = toDateStr(reportDate)
  const k = parseDate(r.actualStartDate)
  if (!k || toDateStr(k) > b) return 0
  const q = taskBudgetMdLikeExcel(r, nonWorkingDays)
  const n = taskPercentNLikeExcel(r)
  return q * n
}

/** @deprecated Dùng `evForTaskTableAtReportDate`; giữ tên cũ cho import bên ngoài nếu có. */
export function evForTaskAtReportDate(r: WBSRow, reportDate: Date, nonWorkingDays: string[]): number {
  return evForTaskTableAtReportDate(r, reportDate, nonWorkingDays)
}

export function evDashboardAtReportDate(wbs: WBSRow[], reportDate: Date | null, nonWorkingDays: string[]): number {
  if (!reportDate) return 0
  return wbs.reduce((s, r) => s + evForTaskDashboardAtReportDate(r, reportDate, nonWorkingDays), 0)
}

export function evTableAtReportDate(wbs: WBSRow[], reportDate: Date | null, nonWorkingDays: string[]): number {
  if (!reportDate) return 0
  return wbs.reduce((s, r) => s + evForTaskTableAtReportDate(r, reportDate, nonWorkingDays), 0)
}

/** BAC tổng dự án — khớp Dashboard `SUM(Q17:Q1016)` (Est MD + fallback kế hoạch). */
export function sumBacLikeExcel(wbs: WBSRow[], nonWorkingDays: string[]): number {
  return wbs.reduce((s, r) => s + taskBudgetMdLikeExcel(r, nonWorkingDays), 0)
}

export function pvUpToReportDate(project: EVMProject, wbs: WBSRow[], reportDate: Date | null, nonWorkingDays: string[]): number {
  if (!reportDate) return 0
  return wbs.reduce((s, r) => s + pvForTaskUpToDate(r, reportDate, project, nonWorkingDays), 0)
}

/** PV một dòng: lũy kế ô lưới ngày (merged plan + sparse) đến mốc báo cáo — khớp SUMIF timeline Excel (chỉ ngày làm). */
export function pvForTaskFromMergedDayUnits(
  r: WBSRow,
  reportDate: Date | null,
  merged: WbsDayUnitRow[],
  nonWorkingDays: string[] = [],
): number {
  if (!reportDate) return 0
  const cutoff = toDateStr(reportDate)
  let s = 0
  for (const u of merged) {
    if (u.wbsId !== r.id) continue
    const wd = normalizeEvmCalendarDay(u.workDate) ?? u.workDate.slice(0, 10)
    if (!isEvmCalendarWorkdayYmd(wd, nonWorkingDays)) continue
    if (wd <= cutoff) s += u.unit
  }
  return s
}

/** Tổng đơn vị MD/ngày (merged plan + sparse) cho cả nhóm detail tại một ngày — chỉ ngày làm (NETWORKDAYS). */
export function sumMergedDayUnitsForDetailRowsOnDate(
  detailRows: WBSRow[],
  merged: WbsDayUnitRow[],
  dateStr: string,
  nonWorkingDays: string[] = [],
): number {
  if (detailRows.length === 0) return 0
  const dNorm = normalizeEvmCalendarDay(dateStr) ?? dateStr.slice(0, 10)
  if (!isEvmCalendarWorkdayYmd(dNorm, nonWorkingDays)) return 0
  const ids = new Set(detailRows.map(r => r.id))
  let s = 0
  for (const u of merged) {
    if (!ids.has(u.wbsId)) continue
    const wd = normalizeEvmCalendarDay(u.workDate) ?? u.workDate.slice(0, 10)
    if (wd === dNorm) s += u.unit
  }
  return s
}

export function pvUpToReportDateFromMergedDayUnits(
  wbs: WBSRow[],
  reportDate: Date | null,
  merged: WbsDayUnitRow[],
  nonWorkingDays: string[] = [],
): number {
  if (!reportDate) return 0
  return wbs.reduce((s, r) => s + pvForTaskFromMergedDayUnits(r, reportDate, merged, nonWorkingDays), 0)
}

/**
 * Tổng MD (cột factor lưới) cho assignee — chỉ các ô workDate ≤ cutoff khi cutoff có;
 * khớp Resource Usage BAC/PV (SUM/8) khi `merged` = plan ∪ sparse.
 */
export function assigneeMdFromMergedDayUnitsUpTo(
  assigneeId: string,
  wbs: WBSRow[],
  merged: WbsDayUnitRow[],
  reportCutoffYmd: string | null,
  nonWorkingDays: string[] = [],
): number {
  const aid = assigneeId.trim()
  if (!aid) return 0
  const byId = new Map(wbs.map(r => [r.id, r] as const))
  let s = 0
  for (const u of merged) {
    const row = byId.get(u.wbsId)
    if (!row || (row.assignee ?? '').trim() !== aid) continue
    const wd = normalizeEvmCalendarDay(u.workDate) ?? u.workDate.slice(0, 10)
    if (!isEvmCalendarWorkdayYmd(wd, nonWorkingDays)) continue
    if (reportCutoffYmd != null && reportCutoffYmd !== '' && wd > reportCutoffYmd) continue
    s += u.unit
  }
  return s
}

/** TCPI theo EVM_Tool.txt: (BAC−EV) / IF((EAC−AC)=0, 1, (EAC−AC)). */
export function computeTcpiExcelTool(bac: number, ev: number, eac: number, ac: number): number | null {
  const etc = eac - ac
  const denom = !Number.isFinite(etc) || Math.abs(etc) < 1e-12 ? 1 : etc
  if (!Number.isFinite(bac - ev) || Math.abs(denom) < 1e-12) return null
  return (bac - ev) / denom
}

/**
 * TSPI (To-Complete Schedule Performance Index), khớp Excel: (BAC − EV) / IF(BAC = 0, 1, BAC − PV).
 * Khi BAC ≠ 0 mà BAC − PV = 0 thì không xác định (trả null, UI hiển thị "—").
 */
export function computeTspi(bac: number, ev: number, pv: number): number | null {
  const num = bac - ev
  if (!Number.isFinite(num)) return null
  const denom = Math.abs(bac) < 1e-12 ? 1 : bac - pv
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null
  return num / denom
}


/** AC (man-day) = tổng giờ các bản ghi có date ≤ reportDate, chia hoursPerDay (Excel: /8). */
export function acManDaysUpToReportDate(ac: ACRow[], reportDateStr: string, hoursPerDay: number): number {
  const rd = parseDate(reportDateStr)
  if (!rd) {
    return ac.reduce((s, r) => s + (r.workingHours ?? 0), 0) / Math.max(1e-9, hoursPerDay)
  }
  const cutoff = toDateStr(rd)
  let sumH = 0
  for (const r of ac) {
    const d = r.date?.trim()
    if (!d) {
      sumH += r.workingHours ?? 0
      continue
    }
    if (d <= cutoff) sumH += r.workingHours ?? 0
  }
  return sumH / Math.max(1e-9, hoursPerDay)
}

/** AC (MD) lũy kế đến ngày báo cáo, chỉ các dòng AC của assignee. */
export function acManDaysUpToReportDateForAssignee(
  ac: ACRow[],
  assignee: string,
  reportDateStr: string,
  hoursPerDay: number,
): number {
  const aid = assignee.trim()
  if (!aid) return 0
  const filtered = ac.filter(r => (r.assignee ?? '').trim() === aid)
  return acManDaysUpToReportDate(filtered, reportDateStr, hoursPerDay)
}

/** Ma trận giờ AC: khóa dòng = phase‖category‖feature‖task, cột = ngày (YYYY-MM-DD). */
export function aggregateAcWorkingHoursByLineAndDate(ac: ACRow[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const r of ac) {
    const d = r.date?.trim()
    if (!d) continue
    const key = [r.phase ?? '', r.category ?? '', r.feature ?? '', r.task ?? r.workContents ?? ''].join('\u0001')
    let inner = m.get(key)
    if (!inner) {
      inner = new Map()
      m.set(key, inner)
    }
    inner.set(d, (inner.get(d) ?? 0) + (r.workingHours ?? 0))
  }
  return m
}

export function acMatrixRowLabel(key: string): string {
  const parts = key.split('\u0001')
  const [phase, category, feature, task] = parts
  const segs = [phase, category, feature].filter(Boolean)
  const head = segs.join(' / ')
  const t = task?.trim()
  if (head && t) return `${head} — ${t}`
  if (t) return t
  return head || '—'
}

/** EAC trên Dashboard Excel: AC + (BAC−EV)/(CPI×SPI), nếu CPI=0 thì AC. */
export function computeEacExcelV5(bac: number, ev: number, ac: number, pv: number): number {
  const cpi = ac > 0 ? ev / ac : 0
  const spi = pv > 0 ? ev / pv : 0
  if (cpi === 0) return ac
  const denom = cpi * spi
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return ac
  return ac + (bac - ev) / denom
}

/** EAC cột テーブル1 / sheet EV: `IF(CPI=0,0, AC+(BAC-EV)/CPI)` — không nhân SPI. */
export function computeEacExcelTable1(bac: number, ev: number, ac: number): number {
  const cpi = ac > 0 ? ev / ac : 0
  if (cpi === 0 || !Number.isFinite(cpi)) return 0
  return ac + (bac - ev) / cpi
}

export interface EVMResult {
  bac: number
  pv: number
  ev: number
  ac: number
  spi: number
  cpi: number
  sv: number
  cv: number
  eac: number
  etc: number
  vac: number
  progress: number
  /** TCPI theo EVM_Tool.txt (Dashboard): (BAC−EV)/(EAC−AC hoặc 1 khi EAC=AC). */
  tcpi: number | null
  /** TCPI hướng tới BAC: (BAC − EV) / (BAC − AC); tham chiếu PMI / AI. */
  tcpiBac: number | null
  /** TSPI: (BAC − EV) / IF(BAC ≈ 0, 1, BAC − PV). */
  tspi: number | null
}

export interface EVMMetricsInput {
  project: EVMProject
  wbs: WBSRow[]
  ac: ACRow[]
  /** Man-day = sum(working hours) / hoursPerDay (Excel Master hours/day, thường 8). */
  hoursPerDay?: number
  nonWorkingDays?: string[]
  /** Sparse `evm_wbs_day_unit`; merge với plan trong hàm. */
  wbsDayUnits?: WbsDayUnitRow[]
}

/**
 * Tính KPI EVM khớp file Excel V5.0 (Plan⇒Gantt).
 */
export function computeEVMMetrics({
  project,
  wbs,
  ac,
  hoursPerDay = DEFAULT_EVM_HOURS_PER_DAY,
  nonWorkingDays = [],
  wbsDayUnits,
}: EVMMetricsInput): EVMResult {
  const hpd = Math.max(1e-9, hoursPerDay)
  const bac = sumBacLikeExcel(wbs, nonWorkingDays)
  const reportDate = parseDate(project.reportDate)
  const mergedDay = mergeWbsDayUnitsStoredWithPlan(wbs, wbsDayUnits ?? [], nonWorkingDays)
  const pv = pvUpToReportDateFromMergedDayUnits(wbs, reportDate, mergedDay, nonWorkingDays)
  const wbsEv = wbsRowsMergedWithAcForGuideline(wbs, ac ?? [], project.reportDate ?? '', hpd, nonWorkingDays)
  const ev = evDashboardAtReportDate(wbsEv, reportDate, nonWorkingDays)
  const acValue = acManDaysUpToReportDate(ac, project.reportDate, hpd)

  const spi = pv > 0 ? ev / pv : 0
  const cpi = acValue > 0 ? ev / acValue : 0
  const sv = ev - pv
  const cv = ev - acValue
  const eac = computeEacExcelV5(bac, ev, acValue, pv)
  const etc = eac - acValue
  const vac = bac - eac
  const progress = bac > 0 ? ev / bac : 0

  const tcpiDenom = bac - acValue
  let tcpiBac: number | null = null
  if (Number.isFinite(tcpiDenom) && Math.abs(tcpiDenom) > 1e-9) {
    tcpiBac = (bac - ev) / tcpiDenom
  }

  const tcpi = computeTcpiExcelTool(bac, ev, eac, acValue)
  const tspi = computeTspi(bac, ev, pv)

  return {
    bac,
    pv,
    ev,
    ac: acValue,
    spi,
    cpi,
    sv,
    cv,
    eac,
    etc,
    vac,
    progress,
    tcpi,
    tcpiBac,
    tspi,
  }
}

export interface EACScenarioRow {
  id: 'excel_v5' | 'typical' | 'bac_over_cpi' | 'atypical_remaining'
  label: string
  eac: number
  etc: number
  vac: number
}

/**
 * Kịch bản EAC: ưu tiên công thức Dashboard Excel; thêm các biến thể PMI để AI đối chiếu.
 */
export function computeEACScenarios(bac: number, ev: number, ac: number, cpi: number, pv?: number): EACScenarioRow[] {
  const out: EACScenarioRow[] = []
  if (pv != null && Number.isFinite(pv)) {
    const eacX = computeEacExcelV5(bac, ev, ac, pv)
    out.push({
      id: 'excel_v5',
      label: 'EAC = AC + (BAC-EV)/(CPI×SPI)  [Excel Dashboard]',
      eac: eacX,
      etc: eacX - ac,
      vac: bac - eacX,
    })
  }
  let eacTypical = ac
  if (cpi > 0) {
    eacTypical = ac + (bac - ev) / cpi
  }
  out.push({
    id: 'typical',
    label: 'EAC = AC + (BAC-EV)/CPI',
    eac: eacTypical,
    etc: eacTypical - ac,
    vac: bac - eacTypical,
  })
  if (cpi > 0) {
    const eacBacCpi = bac / cpi
    out.push({
      id: 'bac_over_cpi',
      label: 'EAC = BAC/CPI',
      eac: eacBacCpi,
      etc: eacBacCpi - ac,
      vac: bac - eacBacCpi,
    })
  }
  const eacAtypical = ac + (bac - ev)
  out.push({
    id: 'atypical_remaining',
    label: 'EAC = AC + (BAC-EV)',
    eac: eacAtypical,
    etc: eacAtypical - ac,
    vac: bac - eacAtypical,
  })
  return out
}

export interface EVMTimeSeriesPoint {
  date: string
  pv: number
  ev: number
  ac: number
  cv: number
  sv: number
  spi: number
  cpi: number
  eac: number
  progress: number
  tcpi: number | null
  tcpiBac: number | null
}

export type EvmReportGranularity = 'day' | 'month' | 'quarter'

function timeSeriesPeriodKey(dateStr: string, granularity: 'month' | 'quarter'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return dateStr
  const y = Number(m[1])
  const mo = Number(m[2])
  if (granularity === 'month') return `${y}-${String(mo).padStart(2, '0')}`
  const q = Math.floor((mo - 1) / 3) + 1
  return `${y}-Q${q}`
}

export function aggregateEvmTimeSeriesByPeriod(points: EVMTimeSeriesPoint[], granularity: EvmReportGranularity): EVMTimeSeriesPoint[] {
  if (granularity === 'day' || points.length === 0) return points
  const byPeriod = new Map<string, EVMTimeSeriesPoint>()
  for (const p of points) {
    const key = timeSeriesPeriodKey(p.date, granularity)
    const prev = byPeriod.get(key)
    if (!prev || p.date > prev.date) byPeriod.set(key, p)
  }
  return Array.from(byPeriod.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function effectiveProjectBounds(project: EVMProject, wbs: WBSRow[]): { start: Date; end: Date } | null {
  let ps = parseDate(project.startDate)
  let pe = parseDate(project.endDate)
  for (const r of wbs) {
    const a = parseDate(r.planStartDate)
    const b = parseDate(r.planEndDate)
    if (a && (!ps || a < ps)) ps = a
    if (b && (!pe || b > pe)) pe = b
  }
  if (ps && pe) return { start: ps, end: pe }
  return null
}

/**
 * Chuỗi PV/EV/AC theo ngày (cùng quy tắc Excel tại từng mốc).
 */
export function buildEVMTimeSeries(
  project: EVMProject,
  wbs: WBSRow[],
  ac: ACRow[],
  hoursPerDay = DEFAULT_EVM_HOURS_PER_DAY,
  nonWorkingDays: string[] = [],
  wbsDayUnits: WbsDayUnitRow[] = [],
): EVMTimeSeriesPoint[] {
  const bounds = effectiveProjectBounds(project, wbs)
  if (!bounds) return []

  const hpd = Math.max(1e-9, hoursPerDay)
  const mergedDay = mergeWbsDayUnitsStoredWithPlan(wbs, wbsDayUnits ?? [], nonWorkingDays)
  const dates = new Set<string>()
  const addDate = (d: Date | null) => {
    if (d) dates.add(toDateStr(d))
  }
  addDate(bounds.start)
  addDate(bounds.end)
  addDate(parseDate(project.reportDate))
  wbs.forEach(r => {
    addDate(parseDate(r.planStartDate))
    addDate(parseDate(r.planEndDate))
    addDate(parseDate(r.actualStartDate))
    addDate(parseDate(r.actualEndDate))
  })
  ac.forEach(r => {
    addDate(parseDate(r.date))
  })

  const sortedDates = Array.from(dates).sort()
  const bacTotal = sumBacLikeExcel(wbs, nonWorkingDays)

  const acSorted = ac
    .filter((r): r is ACRow & { date: string } => !!r.date)
    .map(r => ({ date: r.date, hours: r.workingHours ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let acIdx = 0
  let acHoursCumulative = 0

  return sortedDates.flatMap(dateStr => {
    const d = parseDate(dateStr)
    if (!d) return []

    const pv = pvUpToReportDateFromMergedDayUnits(wbs, d, mergedDay, nonWorkingDays)
    const wbsEv = wbsRowsMergedWithAcForGuideline(wbs, ac, dateStr, hpd, nonWorkingDays)
    while (acIdx < acSorted.length && acSorted[acIdx].date <= dateStr) {
      acHoursCumulative += acSorted[acIdx].hours
      acIdx++
    }
    const acCum = acHoursCumulative / hpd
    const ev = evDashboardAtReportDate(wbsEv, d, nonWorkingDays)

    const cv = ev - acCum
    const sv = ev - pv
    const spi = pv > 0 ? ev / pv : 0
    const cpi = acCum > 0 ? ev / acCum : 0
    const progress = bacTotal > 0 ? ev / bacTotal : 0
    const tcpiDenom = bacTotal - acCum
    let tcpiBac: number | null = null
    if (Number.isFinite(tcpiDenom) && Math.abs(tcpiDenom) > 1e-9) {
      tcpiBac = (bacTotal - ev) / tcpiDenom
    }

    const eacDash = computeEacExcelV5(bacTotal, ev, acCum, pv)
    const tcpi = computeTcpiExcelTool(bacTotal, ev, eacDash, acCum)

    return [
      {
        date: dateStr,
        pv,
        ev,
        ac: acCum,
        cv,
        sv,
        spi,
        cpi,
        eac: eacDash,
        progress,
        tcpi,
        tcpiBac,
      },
    ]
  })
}

export interface EVByPhaseRow {
  phase: string
  bac: number
  pv: number
  ev: number
  ac: number
  sv: number
  cv: number
  progress: number
  cpi: number
  spi: number
}

export interface EVByAssigneeRow {
  assignee: string
  bac: number
  pv: number
  ev: number
  ac: number
  sv: number
  cv: number
  progress: number
  cpi: number
  spi: number
}

export interface WbsMasterRollupRow {
  rollupKey: string
  /** Khóa `evm_wbs_master.id` (dòng đầu theo `no` trong nhóm). */
  masterId: string
  phase: string
  category: string
  feature: string
  note: string
  bac: number
  pv: number
  ev: number
  sv: number
  spi: number
  progress: number
  detailCount: number
  /** Excel Master: min plan start / max plan end trong nhóm. */
  planStartMin?: string
  planEndMax?: string
  actualStartMin?: string
  actualEndMax?: string
  /** Gợn gàng hiển thị assignee (nhiều người → số lượng). */
  assigneeSummary?: string
}

function ymdMinMax(dates: (string | undefined | null)[]): { min?: string; max?: string } {
  const xs = [...new Set(dates.filter((d): d is string => !!d?.trim()))].sort((a, b) => a.localeCompare(b))
  if (xs.length === 0) return {}
  return { min: xs[0], max: xs[xs.length - 1] }
}

/** Gom rollup Master theo Phase + Category (khớp một dòng `evm_wbs_master`). */
function wbsRollupKeyTuple(r: WBSRow): [string, string] {
  return [(r.phase ?? '').trim(), (r.category ?? '').trim()]
}

function rollupDistinctLabels(rows: WBSRow[], pick: (r: WBSRow) => string): string {
  const vals = [...new Set(rows.map(r => pick(r).trim()).filter(Boolean))]
  if (vals.length === 0) return ''
  if (vals.length <= 2) return vals.join(', ')
  return String(vals.length)
}

export function wbsDetailRowsForRollupKey(wbs: WBSRow[], rollupKey: string): WBSRow[] {
  return wbs.filter(r => JSON.stringify(wbsRollupKeyTuple(r)) === rollupKey)
}

/** Table 1 (Excel): group-by phase + category (một Master); SPI = EV/PV; Progress = EV/BAC. */
export function computeWbsMasterRollupRows(
  project: EVMProject,
  wbs: WBSRow[],
  nonWorkingDays: string[],
  wbsDayUnits: WbsDayUnitRow[] = [],
): WbsMasterRollupRow[] {
  const reportDate = parseDate(project.reportDate)
  const merged = mergeWbsDayUnitsStoredWithPlan(wbs, wbsDayUnits, nonWorkingDays)
  const byKey = new Map<string, WBSRow[]>()
  for (const row of wbs) {
    const key = JSON.stringify(wbsRollupKeyTuple(row))
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = []
      byKey.set(key, bucket)
    }
    bucket.push(row)
  }
  return Array.from(byKey.entries()).map(([rollupKey, rows]) => {
    const sorted = [...rows].sort((a, b) => a.no - b.no)
    const masterIds = new Set(sorted.map(r => (r.masterId ?? '').trim()).filter(Boolean))
    let masterId = ''
    if (masterIds.size === 1) {
      const only = [...masterIds][0]
      if (only) masterId = only
    } else {
      const firstMid = sorted[0]?.masterId?.trim()
      if (firstMid) masterId = firstMid
    }
    const [phase, category] = JSON.parse(rollupKey) as [string, string]
    const feature = rollupDistinctLabels(sorted, r => r.feature ?? '')
    const note = rollupDistinctLabels(sorted, r => r.wbsNote ?? '')
    const bac = rows.reduce((s, r) => s + taskBudgetMdLikeExcel(r, nonWorkingDays), 0)
    const pv = reportDate ? rows.reduce((s, r) => s + pvForTaskFromMergedDayUnits(r, reportDate, merged, nonWorkingDays), 0) : 0
    const ev = reportDate ? rows.reduce((s, r) => s + evForTaskDashboardAtReportDate(r, reportDate, nonWorkingDays), 0) : 0
    const sv = ev - pv
    const spi = pv > 1e-9 ? ev / pv : 0
    const progress = bac > 1e-9 ? ev / bac : 0
    const { min: planStartMin } = ymdMinMax(rows.map(r => r.planStartDate))
    const { max: planEndMax } = ymdMinMax(rows.map(r => r.planEndDate))
    const { min: actualStartMin } = ymdMinMax(rows.map(r => r.actualStartDate))
    const { max: actualEndMax } = ymdMinMax(rows.map(r => r.actualEndDate))
    const assignees = [...new Set(rows.map(r => (r.assignee ?? '').trim()).filter(Boolean))]
    let assigneeSummary: string | undefined
    if (assignees.length === 0) assigneeSummary = undefined
    else if (assignees.length <= 2) assigneeSummary = assignees.join(', ')
    else assigneeSummary = String(assignees.length)
    return {
      rollupKey,
      masterId,
      phase,
      category,
      feature,
      note,
      bac,
      pv,
      ev,
      sv,
      spi,
      progress,
      detailCount: rows.length,
      planStartMin,
      planEndMax,
      actualStartMin,
      actualEndMax,
      assigneeSummary,
    }
  })
}

export function aggregateAcHoursByAssigneeAndDate(ac: ACRow[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const r of ac) {
    const aid = (r.assignee ?? '').trim()
    const dNorm = normalizeEvmCalendarDay(r.date)
    if (!aid || !dNorm) continue
    let inner = m.get(aid)
    if (!inner) {
      inner = new Map()
      m.set(aid, inner)
    }
    inner.set(dNorm, (inner.get(dNorm) ?? 0) + (r.workingHours ?? 0))
  }
  return m
}

function dayUnitKey(wbsId: string, workDate: string): string {
  const ymd = normalizeEvmCalendarDay(workDate)
  return `${wbsId}\t${ymd ?? workDate.slice(0, 10)}`
}

/** Tổng hệ số ô ngày (Excel BZ) cho assignee tại một ngày. */
export function resourceFactorSumForAssigneeOnDate(
  assigneeId: string,
  dateStr: string,
  wbs: WBSRow[],
  wbsDayUnits: WbsDayUnitRow[],
): number {
  const unitMap = new Map(wbsDayUnits.map(u => [dayUnitKey(u.wbsId, u.workDate), u.unit]))
  let sum = 0
  for (const row of wbs) {
    if ((row.assignee ?? '') !== assigneeId) continue
    sum += unitMap.get(dayUnitKey(row.id, dateStr)) ?? 0
  }
  return sum
}

/** Giờ theo công thức Resource Excel: SUMPRODUCT(factor, match assignee) × hoursPerDay (T7/CN và nghỉ = 0). */
export function resourceHoursFromWbsDayUnitsForAssignee(
  assigneeId: string,
  dateStr: string,
  wbs: WBSRow[],
  wbsDayUnits: WbsDayUnitRow[],
  hoursPerDay: number,
  nonWorkingDays: string[] = [],
): number {
  if (!isEvmCalendarWorkdayYmd(dateStr, nonWorkingDays)) return 0
  return resourceFactorSumForAssigneeOnDate(assigneeId, dateStr, wbs, wbsDayUnits) * Math.max(1e-9, hoursPerDay)
}

function acManDaysForRowsUpTo(rows: ACRow[], reportDateStr: string, hoursPerDay: number): number {
  return acManDaysUpToReportDate(rows, reportDateStr, hoursPerDay)
}

export function computeEVByPhase(
  project: EVMProject,
  wbs: WBSRow[],
  ac: ACRow[],
  phases: string[],
  hoursPerDay = DEFAULT_EVM_HOURS_PER_DAY,
  nonWorkingDays: string[] = [],
  phaseNotes?: Record<string, string>,
  wbsDayUnits: WbsDayUnitRow[] = [],
): EVByPhaseRow[] {
  const hpd = Math.max(1e-9, hoursPerDay)
  const cutoff =
    project.reportDate?.trim() ? (normalizeEvmCalendarDay(project.reportDate) ?? project.reportDate.trim().slice(0, 10)) : null
  const acReportStr = (cutoff ?? project.reportDate ?? '').trim()
  const rollups = computeWbsMasterRollupRows(project, wbs, nonWorkingDays, wbsDayUnits)
  const agg = new Map<string, { bac: number; pv: number; ev: number }>()
  for (const rr of rollups) {
    const ph = rr.phase || ''
    const cur = agg.get(ph) ?? { bac: 0, pv: 0, ev: 0 }
    cur.bac += rr.bac
    cur.pv += rr.pv
    cur.ev += rr.ev
    agg.set(ph, cur)
  }

  return phases
    .map(phase => {
      const fromMaster = agg.get(phase) ?? { bac: 0, pv: 0, ev: 0 }
      const bac = fromMaster.bac
      const pv = fromMaster.pv
      const ev = fromMaster.ev
      const phaseAc = ac.filter(r => (r.phase ?? '') === phase)
      const acVal = acManDaysForRowsUpTo(phaseAc, acReportStr, hpd)
      const sv = ev - pv
      const cv = ev - acVal
      const progress = bac > 0 ? ev / bac : 0
      const spi = pv > 0 ? ev / pv : 0
      const cpi = acVal > 0 ? ev / acVal : 0
      return { phase, bac, pv, ev, ac: acVal, sv, cv, progress, cpi, spi }
    })
    .filter(
      r =>
        r.bac > 0 ||
        r.ac > 0 ||
        r.ev > 1e-12 ||
        Boolean(phaseNotes?.[r.phase]?.trim()),
    )
}

export function computeEVByAssignee(
  project: EVMProject,
  wbs: WBSRow[],
  ac: ACRow[],
  assignees: string[],
  hoursPerDay = DEFAULT_EVM_HOURS_PER_DAY,
  nonWorkingDays: string[] = [],
  assigneeNotes?: Record<string, string>,
  wbsDayUnits: WbsDayUnitRow[] = [],
): EVByAssigneeRow[] {
  const hpd = Math.max(1e-9, hoursPerDay)
  const merged = mergeWbsDayUnitsStoredWithPlan(wbs, wbsDayUnits, nonWorkingDays)
  const cutoff =
    project.reportDate?.trim() ? (normalizeEvmCalendarDay(project.reportDate) ?? project.reportDate.trim().slice(0, 10)) : null
  const reportDateForEv = parseDate(project.reportDate ?? '') ?? (cutoff ? parseDate(cutoff) : null)
  const wbsEv =
    reportDateForEv ? wbsRowsMergedWithAcForGuideline(wbs, ac, project.reportDate ?? cutoff ?? '', hpd, nonWorkingDays) : wbs
  const acReportStr = (cutoff ?? project.reportDate ?? '').trim()
  return assignees
    .map(assignee => {
      const assigneeWbsEv = wbsEv.filter(r => (r.assignee ?? '') === assignee)
      const bac = assigneeMdFromMergedDayUnitsUpTo(assignee, wbs, merged, null, nonWorkingDays)
      const pvRaw = cutoff ? assigneeMdFromMergedDayUnitsUpTo(assignee, wbs, merged, cutoff, nonWorkingDays) : 0
      const pv = reportDateForEv ? pvRaw : 0
      const ev = reportDateForEv
        ? assigneeWbsEv.reduce(
            (s, r) => s + evForTaskDashboardAtReportDate(r, reportDateForEv, nonWorkingDays),
            0,
          )
        : 0
      const assigneeAc = ac.filter(r => (r.assignee ?? '') === assignee)
      const acVal = acManDaysForRowsUpTo(assigneeAc, acReportStr, hpd)
      const sv = ev - pv
      const cv = ev - acVal
      const progress = bac > 0 ? ev / bac : 0
      const spi = pv > 0 ? ev / pv : 0
      const cpi = acVal > 0 ? ev / acVal : 0
      return { assignee, bac, pv, ev, ac: acVal, sv, cv, progress, cpi, spi }
    })
    .filter(r => r.bac > 0 || r.ac > 0 || Boolean(assigneeNotes?.[r.assignee]?.trim()))
}

export function evmAssigneeDisplayName(master: { assignees: { code: string; name?: string }[] }, assigneeCode?: string | null, wbsAssigneeName?: string | null): string {
  if (assigneeCode == null || assigneeCode === '') return '-'
  if (wbsAssigneeName) return wbsAssigneeName
  const a = master.assignees.find(x => x.code === assigneeCode)
  if (a?.name) return a.name
  return assigneeCode
}
