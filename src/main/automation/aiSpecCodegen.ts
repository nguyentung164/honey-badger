import type { TestCase } from 'shared/automation/types'
import { AUTOMATION_JSON_SCHEMAS, PROMPT } from 'main/constants'
import { callStructuredJSON } from './aiStructured'

interface AiGenSpecPayload {
  code: string
  rationale: string
  helpers?: string[]
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}

function ensurePlaywrightImports(code: string): string {
  const trimmed = code.trim()
  if (/^\s*import\s+\{[^}]*\btest\b/m.test(trimmed) && /\bexpect\b/.test(trimmed)) {
    return trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`
  }
  return `import { test, expect } from '@playwright/test'\n\n${trimmed}\n`
}

/**
 * Sinh nội dung `.spec.ts` Playwright cho một TestCase. Caller tự ghi file
 * và cập nhật `test_cases.spec_status = 'draft'`.
 */
export async function generateSpecCode(args: {
  projectContext: string
  testCase: TestCase
}): Promise<{ code: string; rationale: string; helpers: string[] }> {
  const prompt = fillTemplate(PROMPT.AUTOMATION_GEN_SPEC, {
    project_context: args.projectContext,
    case_json: JSON.stringify(args.testCase, null, 2),
  })

  const result = await callStructuredJSON<AiGenSpecPayload>({
    prompt,
    schema: AUTOMATION_JSON_SCHEMAS.GEN_SPEC as unknown as Record<string, unknown>,
    schemaName: 'automation_spec_codegen',
    feature: 'AUTOMATION_GEN_SPEC',
  })

  const rawCode = (result.data?.code ?? '').trim()
  if (!rawCode) {
    throw new Error('AI returned empty spec code.')
  }
  return {
    code: ensurePlaywrightImports(rawCode),
    rationale: result.data.rationale ?? '',
    helpers: Array.isArray(result.data.helpers) ? result.data.helpers : [],
  }
}
