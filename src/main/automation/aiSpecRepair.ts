import { AUTOMATION_JSON_SCHEMAS, PROMPT } from 'main/constants'
import { callStructuredJSON } from './aiStructured'
import { patchSpecPlaywrightImport } from './workspace'

interface AiRepairPayload {
  proposedSpec: string
  rationale: string
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}

function tailLines(text: string, n: number): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  return lines.slice(Math.max(0, lines.length - n)).join('\n')
}

/**
 * Tạo đề xuất sửa spec khi test fail. V1: input = error + stdout tail +
 * screenshot path + originalSpec. Không parse trace zip.
 */
export async function proposeSpecRepair(args: {
  originalSpec: string
  errorMessage: string
  stdoutTail: string
  screenshotPath?: string
  failedStep?: string
}): Promise<{ proposedSpec: string; rationale: string }> {
  const prompt = fillTemplate(PROMPT.AUTOMATION_REPAIR_SPEC, {
    failed_step: args.failedStep ?? '(unknown)',
    error_message: args.errorMessage ?? '',
    stdout_tail: tailLines(args.stdoutTail, 50),
    screenshot_path: args.screenshotPath ?? '(none)',
    original_spec: args.originalSpec ?? '',
  })

  const result = await callStructuredJSON<AiRepairPayload>({
    prompt,
    schema: AUTOMATION_JSON_SCHEMAS.REPAIR_SPEC as unknown as Record<string, unknown>,
    schemaName: 'automation_spec_repair',
    feature: 'AUTOMATION_REPAIR_SPEC',
  })

  const proposedSpec = (result.data?.proposedSpec ?? '').trim()
  if (!proposedSpec) {
    throw new Error('AI returned empty proposedSpec.')
  }
  return {
    proposedSpec: patchSpecPlaywrightImport(proposedSpec),
    rationale: result.data.rationale ?? '',
  }
}
