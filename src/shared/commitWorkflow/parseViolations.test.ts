import { describe, expect, it } from 'vitest'
import { countViolations, parseViolationsMarkdown } from './parseViolations'

describe('parseViolationsMarkdown', () => {
  it('parses a simple markdown table', () => {
    const md = `
| No | Criterion | Result | Summary | Explanation | Code |
|----|-----------|--------|-----------|-------------|------|
| 1 | Naming | Fail | Bad name | Must use camelCase | foo() |
| 2 | Imports | Pass | - | - | - |
`
    const rows = parseViolationsMarkdown(md)
    expect(rows).toHaveLength(2)
    expect(rows[0].criterion).toBe('Naming')
    expect(countViolations(rows)).toBe(1)
  })
})
