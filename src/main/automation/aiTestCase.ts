import { randomUuidV7 } from 'shared/randomUuidV7'
import type { ImportPreview, TestCase, TestCasePriority, TestStep, TestStepAction } from 'shared/automation/types'
import { AUTOMATION_JSON_SCHEMAS, PROMPT } from 'main/constants'
import { callStructuredJSON } from './aiStructured'

interface AiGeneratedStep {
  order: number
  action: TestStepAction
  target?: string
  value?: string
  expected?: string
  note?: string
}

interface AiGeneratedCase {
  code: string
  title: string
  priority: TestCasePriority
  tags?: string[]
  preconditions?: string
  steps: AiGeneratedStep[]
  expected: string
}

interface AiGenCasesPayload {
  cases: AiGeneratedCase[]
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}

/**
 * Sinh test cases có cấu trúc từ free-form text + project context.
 * Trả về preview (kèm warnings nếu cần) để renderer hiển thị bảng review trước khi save.
 */
export async function generateTestCases(args: {
  projectId: string
  projectContext: string
  inputText: string
}): Promise<ImportPreview> {
  const prompt = fillTemplate(PROMPT.AUTOMATION_GEN_CASES, {
    project_context: args.projectContext,
    input_text: args.inputText,
  })

  const result = await callStructuredJSON<AiGenCasesPayload>({
    prompt,
    schema: AUTOMATION_JSON_SCHEMAS.GEN_CASES as unknown as Record<string, unknown>,
    schemaName: 'automation_test_cases',
    feature: 'AUTOMATION_GEN_CASES',
  })

  const cases: TestCase[] = []
  const warnings: string[] = []

  if (!result.data?.cases?.length) {
    warnings.push('AI returned no test cases.')
    return { cases, warnings }
  }

  for (const raw of result.data.cases) {
    const steps: TestStep[] = (raw.steps ?? []).map((s, idx) => ({
      order: typeof s.order === 'number' && s.order > 0 ? s.order : idx + 1,
      action: s.action ?? 'custom',
      target: s.target?.trim() || undefined,
      value: s.value?.trim() || undefined,
      expected: s.expected?.trim() || undefined,
      note: s.note?.trim() || undefined,
    }))
    cases.push({
      id: randomUuidV7(),
      projectId: args.projectId,
      code: (raw.code ?? '').trim() || `TC-${Date.now().toString(36).toUpperCase()}-${cases.length + 1}`,
      title: (raw.title ?? '').trim() || 'Untitled case',
      tags: Array.isArray(raw.tags) ? raw.tags.map(t => String(t).trim()).filter(Boolean) : [],
      priority: raw.priority ?? 'medium',
      preconditions: raw.preconditions?.trim() || undefined,
      steps,
      expected: (raw.expected ?? '').trim(),
      source: 'ai',
      specStatus: 'none',
    })
  }
  return { cases, warnings }
}
