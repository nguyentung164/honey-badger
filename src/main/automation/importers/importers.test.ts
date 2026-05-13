import { describe, expect, it } from 'vitest'
import { buildPreview, buildRowFromHeader, normalizeAction, normalizePriority, normalizeTags } from './shared'

describe('automation importer shared utilities', () => {
  it('normalizes priorities (case-insensitive, alias-aware)', () => {
    expect(normalizePriority('Low')).toBe('low')
    expect(normalizePriority('CRIT')).toBe('critical')
    expect(normalizePriority('blocker')).toBe('critical')
    expect(normalizePriority(undefined)).toBe('medium')
    expect(normalizePriority('weird')).toBe('medium')
  })

  it('normalizes actions to Playwright-friendly verbs', () => {
    expect(normalizeAction('Visit')).toBe('navigate')
    expect(normalizeAction('TAP')).toBe('click')
    expect(normalizeAction('Type')).toBe('fill')
    expect(normalizeAction('verify')).toBe('expect')
    expect(normalizeAction(undefined)).toBe('custom')
    expect(normalizeAction('flap')).toBe('custom')
  })

  it('splits tags by comma or semicolon and trims', () => {
    expect(normalizeTags('smoke, regression;critical')).toEqual(['smoke', 'regression', 'critical'])
    expect(normalizeTags('')).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
  })

  it('builds RawCaseRow from arbitrary header aliases', () => {
    const row = buildRowFromHeader(['Tc Id', 'Summary', 'Steps', 'Result', 'Tags'], ['TC-1', 'Login flow', '1. open\n2. login', 'home page', 'smoke,login'])
    expect(row.code).toBe('TC-1')
    expect(row.title).toBe('Login flow')
    expect(row.steps).toContain('open')
    expect(row.expected).toBe('home page')
    expect(row.tags).toBe('smoke,login')
  })

  it('groups row-per-step into one case with ordered steps', () => {
    const rows = [
      { code: 'TC-1', title: 'Login', action: 'navigate', target: '/login', priority: 'high' },
      { code: 'TC-1', action: 'fill', target: '#user', value: 'alice' },
      { code: 'TC-1', action: 'click', target: '#submit' },
    ]
    const preview = buildPreview('proj1', 'excel', rows, 'row-per-step')
    expect(preview.cases).toHaveLength(1)
    expect(preview.cases[0].steps).toHaveLength(3)
    expect(preview.cases[0].steps[0].action).toBe('navigate')
    expect(preview.cases[0].steps[2].action).toBe('click')
    expect(preview.cases[0].priority).toBe('high')
  })

  it('builds row-per-case with inline numbered steps', () => {
    const rows = [
      { code: 'TC-2', title: 'Search', steps: '1. open home\n2. type query\n3. press enter', expected: 'results displayed' },
    ]
    const preview = buildPreview('proj1', 'csv', rows, 'row-per-case')
    expect(preview.cases).toHaveLength(1)
    expect(preview.cases[0].steps.length).toBe(3)
    expect(preview.cases[0].expected).toBe('results displayed')
  })

  it('emits a warning when a row is missing code', () => {
    const preview = buildPreview('proj1', 'excel', [{ title: 'No code' }], 'row-per-step')
    expect(preview.cases).toHaveLength(0)
    expect(preview.warnings.length).toBeGreaterThan(0)
  })
})
