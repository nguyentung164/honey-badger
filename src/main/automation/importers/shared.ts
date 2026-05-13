import { randomUuidV7 } from 'shared/randomUuidV7'
import type { ImportLayout, ImportPreview, TestCase, TestCasePriority, TestCaseSource, TestStep, TestStepAction } from 'shared/automation/types'

export interface RawCaseRow {
  code?: string
  title?: string
  priority?: string
  tags?: string
  preconditions?: string
  step?: string
  expected?: string
  /** Khi layout = row-per-case: tất cả step gộp 1 ô, ngăn `\n` hoặc `1.`,`2.`. */
  steps?: string
  /** Khi layout = row-per-step: phân biệt action ('click', 'fill', …). */
  action?: string
  target?: string
  value?: string
  note?: string
}

const PRIORITY_MAP: Record<string, TestCasePriority> = {
  low: 'low',
  medium: 'medium',
  med: 'medium',
  normal: 'medium',
  high: 'high',
  critical: 'critical',
  crit: 'critical',
  blocker: 'critical',
}

const ACTION_MAP: Record<string, TestStepAction> = {
  navigate: 'navigate',
  goto: 'navigate',
  visit: 'navigate',
  click: 'click',
  tap: 'click',
  press: 'click',
  fill: 'fill',
  type: 'fill',
  input: 'fill',
  enter: 'fill',
  select: 'select',
  choose: 'select',
  expect: 'expect',
  assert: 'expect',
  verify: 'expect',
  wait: 'wait',
}

export function normalizePriority(input?: string): TestCasePriority {
  if (!input) return 'medium'
  return PRIORITY_MAP[input.trim().toLowerCase()] ?? 'medium'
}

export function normalizeAction(input?: string): TestStepAction {
  if (!input) return 'custom'
  return ACTION_MAP[input.trim().toLowerCase()] ?? 'custom'
}

export function normalizeTags(input?: string): string[] {
  if (!input) return []
  return input
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean)
}

function splitInlineSteps(input: string): string[] {
  if (!input) return []
  const normalized = input.replace(/\r\n/g, '\n')
  // Tách theo dòng trước, nếu mỗi dòng còn dạng "1. xyz" thì giữ nguyên text sau prefix.
  const lines = normalized
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  if (lines.length > 1) return lines.map(stripStepPrefix)
  // Một dòng nhưng có "1) abc 2) def".
  return normalized.split(/(?:^|\s)\d+[.)]\s+/).map(s => s.trim()).filter(Boolean)
}

function stripStepPrefix(s: string): string {
  return s.replace(/^\s*\d+[.)]\s*/, '').trim()
}

/** Diễn giải 1 dòng step text → TestStep heuristic; AI sẽ refine sau nếu cần. */
function rawTextToStep(text: string, order: number): TestStep {
  const lower = text.toLowerCase()
  let action: TestStepAction = 'custom'
  if (/(go|navigate|visit)\b/.test(lower)) action = 'navigate'
  else if (/\bclick\b|\btap\b|\bpress\b/.test(lower)) action = 'click'
  else if (/\bfill\b|\btype\b|\benter\b|\binput\b/.test(lower)) action = 'fill'
  else if (/\bselect\b|\bchoose\b/.test(lower)) action = 'select'
  else if (/\bexpect\b|\bassert\b|\bverify\b|\bcheck\b/.test(lower)) action = 'expect'
  else if (/\bwait\b/.test(lower)) action = 'wait'
  return { order, action, note: text }
}

export function buildCaseFromRow(
  projectId: string,
  source: TestCaseSource,
  row: RawCaseRow,
  steps: TestStep[]
): TestCase {
  const code = (row.code ?? '').trim() || `TC-${Date.now().toString(36).toUpperCase()}`
  return {
    id: randomUuidV7(),
    projectId,
    code,
    title: (row.title ?? code).trim(),
    tags: normalizeTags(row.tags),
    priority: normalizePriority(row.priority),
    preconditions: (row.preconditions ?? '').trim() || undefined,
    steps,
    expected: (row.expected ?? '').trim(),
    source,
    specStatus: 'none',
  }
}

/** Gom các row theo `code`; trả về cases với steps order tăng dần. */
export function groupRowsPerStep(projectId: string, source: TestCaseSource, rows: RawCaseRow[]): ImportPreview {
  const warnings: string[] = []
  const map = new Map<string, { meta: RawCaseRow; steps: TestStep[] }>()
  rows.forEach((row, idx) => {
    const codeRaw = (row.code ?? '').trim()
    if (!codeRaw) {
      warnings.push(`Row ${idx + 1}: missing code, skipped.`)
      return
    }
    let bucket = map.get(codeRaw)
    if (!bucket) {
      bucket = { meta: row, steps: [] }
      map.set(codeRaw, bucket)
    }
    const order = bucket.steps.length + 1
    const stepText = (row.step ?? '').trim()
    if (!stepText && !row.action) {
      // chỉ có meta (không step) – bỏ qua tạo step.
      return
    }
    if (row.action) {
      bucket.steps.push({
        order,
        action: normalizeAction(row.action),
        target: (row.target ?? '').trim() || undefined,
        value: (row.value ?? '').trim() || undefined,
        expected: (row.expected ?? '').trim() || undefined,
        note: (row.note ?? stepText).trim() || undefined,
      })
    } else {
      bucket.steps.push(rawTextToStep(stepText, order))
    }
  })
  const cases: TestCase[] = Array.from(map.values()).map(({ meta, steps }) => buildCaseFromRow(projectId, source, meta, steps))
  return { cases, warnings }
}

export function buildPerCaseRow(projectId: string, source: TestCaseSource, rows: RawCaseRow[]): ImportPreview {
  const warnings: string[] = []
  const cases: TestCase[] = []
  rows.forEach((row, idx) => {
    if (!(row.code ?? '').trim()) {
      warnings.push(`Row ${idx + 1}: missing code, skipped.`)
      return
    }
    const stepTexts = splitInlineSteps((row.steps ?? row.step ?? '').toString())
    const steps: TestStep[] = stepTexts.map((t, i) => rawTextToStep(t, i + 1))
    cases.push(buildCaseFromRow(projectId, source, row, steps))
  })
  return { cases, warnings }
}

export function buildPreview(
  projectId: string,
  source: TestCaseSource,
  rows: RawCaseRow[],
  layout: ImportLayout
): ImportPreview {
  if (rows.length === 0) return { cases: [], warnings: ['No rows detected in file.'] }
  return layout === 'row-per-step' ? groupRowsPerStep(projectId, source, rows) : buildPerCaseRow(projectId, source, rows)
}

/** Map header text → key trong RawCaseRow (case-insensitive, bỏ khoảng trắng / dấu nháy). */
export function buildRowFromHeader(header: string[], values: string[]): RawCaseRow {
  const obj: RawCaseRow = {}
  header.forEach((rawH, idx) => {
    const h = (rawH ?? '').toString().trim().toLowerCase()
    const v = (values[idx] ?? '').toString()
    switch (h) {
      case 'code':
      case 'id':
      case 'tc':
      case 'tc id':
      case 'case id':
        obj.code = v
        break
      case 'title':
      case 'name':
      case 'summary':
        obj.title = v
        break
      case 'priority':
      case 'severity':
        obj.priority = v
        break
      case 'tags':
      case 'tag':
      case 'labels':
        obj.tags = v
        break
      case 'preconditions':
      case 'precondition':
      case 'setup':
        obj.preconditions = v
        break
      case 'step':
      case 'description':
        obj.step = v
        break
      case 'steps':
        obj.steps = v
        break
      case 'expected':
      case 'expected result':
      case 'result':
        obj.expected = v
        break
      case 'action':
        obj.action = v
        break
      case 'target':
      case 'selector':
      case 'element':
        obj.target = v
        break
      case 'value':
      case 'input':
        obj.value = v
        break
      case 'note':
      case 'notes':
      case 'comment':
        obj.note = v
        break
      default:
        break
    }
  })
  return obj
}
