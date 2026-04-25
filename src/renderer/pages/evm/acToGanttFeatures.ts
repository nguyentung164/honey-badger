import type { ACRow, EVMMaster } from 'shared/types/evm'
import type { GanttFeature } from '@/components/kibo-ui/gantt'
import { parseLocalDate } from '@/lib/dateUtils'
import { evmAssigneeDisplayName } from '@/lib/evmCalculations'
import { matchesEvmAssigneeFilterForAcGantt, matchesEvmPhaseFilterForAcGantt } from '@/lib/evmUi'

export function parseYmdGantt(s: string | undefined): Date | null {
  if (!s?.trim()) return null
  const t = s.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (y && mo && d) return new Date(y, mo - 1, d)
  }
  const head = t.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const loc = parseLocalDate(head)
    if (loc) return loc
  }
  return null
}

function norm(s: string | undefined) {
  return (s ?? '').trim()
}

function shortText(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

/** Id ổn định cho nhóm AC (tránh %00 / trùng sau slice từ encodeURIComponent). */
function acGanttGroupId(key: string): string {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `ac-${(h >>> 0).toString(16)}`
}

/** Một nhóm AC dùng chung cho Gantt (actual) và bảng tab AC — khớp phase + assignee + workContents. */
export type AcLedgerGanttGroup = {
  key: string
  phase: string
  assignee: string
  work: string
  dates: string[]
  totalHours: number
}

export function groupAcRowsForGanttLedger(ac: ACRow[], phaseFilter: string, assigneeFilter: string): Map<string, AcLedgerGanttGroup> {
  const groups = new Map<string, AcLedgerGanttGroup>()

  for (const row of ac) {
    if (!row.date?.trim()) continue
    const phase = norm(row.phase)
    const assignee = norm(row.assignee)
    if (!matchesEvmPhaseFilterForAcGantt(row.phase, phaseFilter)) continue
    if (!matchesEvmAssigneeFilterForAcGantt(row.assignee, assigneeFilter)) continue
    const work = norm(row.workContents)
    const key = `${phase}\0${assignee}\0${work}`
    let g = groups.get(key)
    if (!g) {
      g = { key, phase, assignee, work, dates: [], totalHours: 0 }
      groups.set(key, g)
    }
    g.dates.push(row.date)
    g.totalHours += row.workingHours ?? 0
  }
  return groups
}

/** Cùng nhóm / khóa với từng thanh Gantt ở chế độ thực tế. */
export function listAcLedgerGanttGroupsSorted(ac: ACRow[], phaseFilter: string, assigneeFilter: string): AcLedgerGanttGroup[] {
  const map = groupAcRowsForGanttLedger(ac, phaseFilter, assigneeFilter)
  const list = [...map.values()].filter(g => g.dates.length > 0)
  for (const g of list) {
    g.dates.sort((a, b) => a.localeCompare(b))
  }
  list.sort((a, b) => {
    const da = a.dates[0] ?? ''
    const db = b.dates[0] ?? ''
    if (da !== db) return da.localeCompare(db)
    return a.key.localeCompare(b.key)
  })
  return list
}

export function buildGanttFeaturesFromAc(
  ac: ACRow[],
  master: EVMMaster,
  assigneeNameFromWbs: Map<string, string>,
  phaseFilter: string,
  assigneeFilter: string,
  ungroupedLabel: string
): GanttFeature[] {
  const groups = groupAcRowsForGanttLedger(ac, phaseFilter, assigneeFilter)

  const features: GanttFeature[] = []
  let rowNo = 0
  for (const [key, g] of groups) {
    if (g.dates.length === 0) continue
    g.dates.sort((a, b) => a.localeCompare(b))
    const startStr = g.dates[0]
    const endStr = g.dates[g.dates.length - 1]
    const start = parseYmdGantt(startStr)
    if (!start) continue
    let end = parseYmdGantt(endStr) ?? start
    if (end < start) end = new Date(start)

    const assigneeLabel = !g.assignee ? '—' : evmAssigneeDisplayName(master, g.assignee, assigneeNameFromWbs.get(g.assignee) ?? null)
    const workPart = g.work ? shortText(g.work, 48) : ''
    const phaseLabel = g.phase || ungroupedLabel
    const name =
      [phaseLabel !== ungroupedLabel ? phaseLabel : null, assigneeLabel !== '—' ? assigneeLabel : null, workPart].filter(Boolean).join(' — ') ||
      shortText(key.replace(/\0/g, ' / '), 48)

    const laneKey = g.phase || '__ungrouped__'
    const id = `ac-${rowNo++}-${acGanttGroupId(`${key}\0${startStr}\0${endStr}\0${g.totalHours}`)}`

    features.push({
      id,
      name,
      startAt: start,
      endAt: end,
      status: { id: 'ac-actual', name: 'AC', color: '#15803d' },
      lane: laneKey,
    })
  }
  return features
}

export type AcGanttPhaseBlock = { key: string; label: string; features: GanttFeature[] }

/** Gom nhóm theo lane (phase) để khớp layout Gantt hiện tại. */
export function groupAcGanttFeaturesByPhase(features: GanttFeature[], ungroupedLabel: string): AcGanttPhaseBlock[] {
  const map = new Map<string, GanttFeature[]>()
  const order: string[] = []
  for (const f of features) {
    const lane = typeof f.lane === 'string' ? f.lane : '__ungrouped__'
    if (!map.has(lane)) {
      map.set(lane, [])
      order.push(lane)
    }
    const bucket = map.get(lane)
    if (bucket) bucket.push(f)
  }
  return order.map(key => ({
    key,
    label: key === '__ungrouped__' ? ungroupedLabel : key,
    features: map.get(key) ?? [],
  }))
}
