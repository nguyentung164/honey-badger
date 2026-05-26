import { describe, expect, it } from 'vitest'
import { buildCasePageLookupMaps, hasTerminalPageMapStatus, resolvePageIdForCaseResult } from './pageMapRunStatus'

describe('pageMapRunStatus', () => {
  const rows = [{ case_id: 'case-1', case_code: 'TC-01', page_id: 'page-a' }]
  const maps = buildCasePageLookupMaps(rows)

  it('resolves by case id', () => {
    expect(resolvePageIdForCaseResult({ caseId: 'case-1' }, maps)).toBe('page-a')
  })

  it('resolves by case code', () => {
    expect(resolvePageIdForCaseResult({ caseCode: 'TC-01' }, maps)).toBe('page-a')
  })

  it('resolves by spec file stem when code uses hyphen but file uses underscore', () => {
    expect(resolvePageIdForCaseResult({ specFile: 'tests/TC_01.spec.ts' }, maps)).toBe('page-a')
  })

  it('resolves by title when case code only appears in test title', () => {
    expect(resolvePageIdForCaseResult({ testTitle: 'Login flow TC-01 happy path' }, maps)).toBe('page-a')
  })

  it('detects terminal page statuses', () => {
    expect(hasTerminalPageMapStatus({ a: 'idle' })).toBe(false)
    expect(hasTerminalPageMapStatus({ a: 'done' })).toBe(true)
  })
})
