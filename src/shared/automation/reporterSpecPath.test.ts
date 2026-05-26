import { describe, expect, it } from 'vitest'
import { caseCodeToSpecStem, parseSpecRelPathFromReporterLine, specRelPathToStem } from './reporterSpecPath'

describe('caseCodeToSpecStem', () => {
  it('sanitizes like workspace getSpecStemForCaseCode', () => {
    expect(caseCodeToSpecStem('TC-01')).toBe('TC-01')
    expect(caseCodeToSpecStem('TC/02')).toBe('TC_02')
  })
})

describe('parseSpecRelPathFromReporterLine', () => {
  it('parses Playwright list reporter suffix with arrows', () => {
    const line = '[chromium] › tests/TC-01.spec.ts › Login works'
    expect(parseSpecRelPathFromReporterLine(line)).toBe('tests/TC-01.spec.ts')
  })

  it('parses Windows-style path segments normalized', () => {
    const line = '[chromium] › tests\\My_Case.spec.ts › t'
    expect(parseSpecRelPathFromReporterLine(line)).toBe('tests/My_Case.spec.ts')
  })

  it('returns null when no spec path', () => {
    expect(parseSpecRelPathFromReporterLine('Running 3 tests')).toBeNull()
  })
})

describe('specRelPathToStem', () => {
  it('returns stem from relative path', () => {
    expect(specRelPathToStem('tests/TC-01.spec.ts')).toBe('TC-01')
    expect(specRelPathToStem('tests/foo_bar.spec.ts')).toBe('foo_bar')
  })
})
