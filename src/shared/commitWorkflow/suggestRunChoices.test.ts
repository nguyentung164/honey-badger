import { describe, expect, it } from 'vitest'
import { hasJavaStaged, isFeOnlyStaged, suggestCodingRuleId, suggestRunChoices } from './suggestRunChoices'

const rules = [
  { id: 'fe', name: 'Frontend React Rules' },
  { id: 'be', name: 'Backend Java Spring' },
]

describe('suggestRunChoices heuristics', () => {
  it('detects java and fe-only staged files', () => {
    expect(hasJavaStaged(['src/Foo.java'])).toBe(true)
    expect(isFeOnlyStaged(['src/App.tsx', 'index.html'])).toBe(true)
    expect(isFeOnlyStaged(['src/Foo.java', 'App.tsx'])).toBe(false)
  })

  it('suggests rule by file kind', () => {
    expect(suggestCodingRuleId(rules, ['a.tsx'])).toBe('fe')
    expect(suggestCodingRuleId(rules, ['a.java'])).toBe('be')
  })

  it('enables spotbugs for java on first open', () => {
    const out = suggestRunChoices({
      stagedFiles: ['x.java'],
      codingRules: rules,
      hasSavedPrefs: false,
    })
    expect(out.spotbugs.enabled).toBe(true)
    expect(out.codingRules.codingRuleId).toBe('be')
  })

  it('disables spotbugs for fe-only on first open', () => {
    const out = suggestRunChoices({
      stagedFiles: ['x.tsx'],
      codingRules: rules,
      hasSavedPrefs: false,
    })
    expect(out.spotbugs.enabled).toBe(false)
    expect(out.codingRules.codingRuleId).toBe('fe')
  })

  it('keeps saved combobox but adjusts spotbugs heuristic when prefs exist', () => {
    const out = suggestRunChoices({
      stagedFiles: ['x.tsx'],
      codingRules: rules,
      hasSavedPrefs: true,
      saved: {
        codingRules: { enabled: true, codingRuleId: 'be', codingRuleName: 'Backend Java Spring' },
        spotbugs: { enabled: true },
        playwright: { enabled: false, catalogPageId: null, catalogFlowId: null },
      },
    })
    expect(out.codingRules.codingRuleId).toBe('be')
    expect(out.spotbugs.enabled).toBe(false)
  })

  it('keeps coding rules switch off when prefs disabled', () => {
    const out = suggestRunChoices({
      stagedFiles: ['x.java'],
      codingRules: rules,
      hasSavedPrefs: true,
      saved: {
        codingRules: { enabled: false, codingRuleId: 'be', codingRuleName: 'Backend Java Spring' },
        spotbugs: { enabled: false },
        playwright: { enabled: false, catalogPageId: null, catalogFlowId: null },
      },
    })
    expect(out.codingRules.enabled).toBe(false)
    expect(out.spotbugs.enabled).toBe(true)
  })
})
