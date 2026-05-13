import { promises as fs } from 'node:fs'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { ImportPreview, TestCase, TestStep } from 'shared/automation/types'
import { normalizePriority, normalizeTags } from './shared'

/**
 * Parse Markdown / Gherkin:
 *  - Mỗi case bắt đầu bằng heading `## TC-…` hoặc `## Scenario: …`.
 *  - Section `Steps:` (Markdown) hoặc các dòng `Given/When/Then/And` (Gherkin).
 *  - Section `Expected:` hoặc dòng `Then …` cuối cùng cho expected.
 */
export async function parseMarkdownFile(projectId: string, filePath: string): Promise<ImportPreview> {
  const content = await fs.readFile(filePath, 'utf8')
  return parseMarkdownContent(projectId, content)
}

interface MdSection {
  title: string
  body: string[]
}

function splitSections(content: string): MdSection[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const sections: MdSection[] = []
  let current: MdSection | null = null
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      if (current) sections.push(current)
      current = { title: m[1].trim(), body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
}

function extractFieldBlock(body: string[], labelRegex: RegExp): string[] {
  const start = body.findIndex(l => labelRegex.test(l))
  if (start === -1) return []
  const out: string[] = []
  for (let i = start + 1; i < body.length; i++) {
    const line = body[i]
    if (/^[A-Z][A-Za-z ]+:\s*$/.test(line) || /^##\s+/.test(line)) break
    out.push(line)
  }
  return out
}

function extractInlineField(body: string[], labelRegex: RegExp): string | undefined {
  const idx = body.findIndex(l => labelRegex.test(l))
  if (idx === -1) return undefined
  const line = body[idx]
  const stripped = line.replace(labelRegex, '').trim()
  if (stripped) return stripped
  // value nằm dòng kế.
  const next = body[idx + 1]
  return next?.trim() || undefined
}

function parseStepsFromLines(lines: string[]): TestStep[] {
  const out: TestStep[] = []
  let order = 1
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    // Bullet "- xxx" hoặc "* xxx".
    const bullet = /^[-*]\s+(.+)$/.exec(l)
    // Numbered "1. xxx".
    const num = /^\d+[.)]\s+(.+)$/.exec(l)
    // Gherkin "Given / When / Then / And ...".
    const gherkin = /^(Given|When|Then|And|But)\b\s+(.+)$/i.exec(l)
    const text = bullet?.[1] ?? num?.[1] ?? gherkin?.[2] ?? l
    out.push({ order, action: 'custom', note: text })
    order++
  }
  return out
}

export function parseMarkdownContent(projectId: string, content: string): ImportPreview {
  const sections = splitSections(content)
  const cases: TestCase[] = []
  const warnings: string[] = []

  for (const section of sections) {
    const titleMatch =
      /^(TC[-_]?[A-Za-z0-9-]+|Scenario:\s*.+)/i.exec(section.title) ?? /^(.+)$/.exec(section.title)
    if (!titleMatch) continue
    let code = section.title.replace(/^Scenario:\s*/i, '').trim()
    let title = code
    const tcMatch = /^(TC[-_]?[A-Za-z0-9-]+)\s*[:|-]\s*(.+)$/i.exec(section.title)
    if (tcMatch) {
      code = tcMatch[1]
      title = tcMatch[2]
    }
    const preconditions = extractInlineField(section.body, /^Preconditions?\s*:/i)
    const expected = extractInlineField(section.body, /^Expected\s*(Result)?\s*:/i)
    const priority = normalizePriority(extractInlineField(section.body, /^Priority\s*:/i))
    const tags = normalizeTags(extractInlineField(section.body, /^Tags?\s*:/i))

    const stepLines =
      extractFieldBlock(section.body, /^Steps?\s*:/i).length > 0
        ? extractFieldBlock(section.body, /^Steps?\s*:/i)
        : section.body.filter(l => /^(Given|When|Then|And|But)\b/i.test(l.trim()))
    const steps = parseStepsFromLines(stepLines)

    cases.push({
      id: randomUuidV7(),
      projectId,
      code: code.trim() || `TC-${Date.now().toString(36).toUpperCase()}`,
      title: title.trim(),
      tags,
      priority,
      preconditions,
      steps,
      expected: expected ?? '',
      source: 'markdown',
      specStatus: 'none',
    })
  }

  if (cases.length === 0) {
    warnings.push('No test cases detected in Markdown. Expected sections like "## TC-001: Title".')
  }
  return { cases, warnings }
}
