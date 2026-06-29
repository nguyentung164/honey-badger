export type ViolationRow = {
  no: string
  criterion: string
  result: string
  violationSummary: string
  explanation: string
  offendingCode: string
}

/** Parse markdown table from CHECK_VIOLATIONS AI response. */
export function parseViolationsMarkdown(markdown: string): ViolationRow[] {
  const lines = markdown.split('\n').filter(line => line.trim())
  const violations: ViolationRow[] = []

  const tableRows = lines.filter(line => {
    const trimmed = line.trim()
    return (
      trimmed.startsWith('|') &&
      !trimmed.includes('---') &&
      !trimmed.toLowerCase().includes('| no |') &&
      !trimmed.toLowerCase().includes('|no|') &&
      !trimmed.toLowerCase().includes('criterion') &&
      !trimmed.toLowerCase().includes('tiêu chí')
    )
  })

  for (const row of tableRows) {
    const cells = row
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell)
    if (cells.length >= 6) {
      violations.push({
        no: cells[0],
        criterion: cells[1],
        result: cells[2],
        violationSummary: cells[3],
        explanation: cells[4],
        offendingCode: cells[5],
      })
    }
  }

  return violations
}

export function countViolations(violations: ViolationRow[]): number {
  return violations.filter(v => {
    const r = v.result.trim().toLowerCase()
    return r === 'fail' || r.includes('fail') || r.includes('vi phạm')
  }).length
}

export function topViolationLabels(violations: ViolationRow[], max = 5): string[] {
  return violations
    .filter(v => {
      const r = v.result.trim().toLowerCase()
      return r === 'fail' || r.includes('fail')
    })
    .slice(0, max)
    .map(v => v.criterion || v.violationSummary)
    .filter(Boolean)
}
