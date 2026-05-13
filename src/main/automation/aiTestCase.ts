import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { ImportPreview, TestCase, TestCasePriority, TestStep, TestStepAction } from 'shared/automation/types'
import { AUTOMATION_JSON_SCHEMAS, PROMPT } from 'main/constants'
import { callStructuredJSON, type StructuredImagePart } from './aiStructured'

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

const MAX_AI_SCREENSHOTS = 5
const MAX_AI_IMAGE_BYTES = 4 * 1024 * 1024

function mimeForScreenshotExt(ext: string): string | null {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return null
  }
}

async function loadStructuredImages(paths: string[] | undefined): Promise<StructuredImagePart[]> {
  if (!paths?.length) return []
  const unique = [...new Set(paths)].slice(0, MAX_AI_SCREENSHOTS)
  const out: StructuredImagePart[] = []
  for (const p of unique) {
    const mime = mimeForScreenshotExt(path.extname(p))
    if (!mime) continue
    const st = await fs.stat(p).catch(() => null)
    if (!st?.isFile() || st.size > MAX_AI_IMAGE_BYTES) continue
    const buf = await fs.readFile(p).catch(() => null)
    if (!buf || buf.length > MAX_AI_IMAGE_BYTES) continue
    out.push({ mimeType: mime, base64: buf.toString('base64') })
  }
  return out
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}

/**
 * Sinh test cases có cấu trúc từ text tự do, ảnh chụp màn hình (tuỳ chọn), và project context.
 * Trả về preview (kèm warnings nếu cần) để renderer hiển thị bảng review trước khi save.
 */
export async function generateTestCases(args: {
  projectId: string
  projectContext: string
  inputText: string
  imagePaths?: string[]
}): Promise<ImportPreview> {
  const images = await loadStructuredImages(args.imagePaths)
  const warnings: string[] = []
  if (args.imagePaths?.length && images.length === 0) {
    warnings.push(
      'Could not read screenshots (use PNG/JPEG/WebP/GIF, max 4MB each, up to 5 files, valid paths on disk).'
    )
  }
  const hasText = args.inputText.trim().length > 0
  if (!hasText && images.length === 0) {
    return {
      cases: [],
      warnings: [...warnings, 'Add a text description and/or at least one readable screenshot.'],
    }
  }

  const visionNote = images.length
    ? 'Screenshots of the UI are attached to this request. Read visible controls, headings, navigation, labels, forms, and primary actions; derive realistic ordered test steps from what is shown.'
    : 'No screenshots are attached; derive test cases only from project context and tester notes below.'

  const prompt = fillTemplate(PROMPT.AUTOMATION_GEN_CASES, {
    vision_note: visionNote,
    project_context: args.projectContext,
    input_text: args.inputText.trim() || '(none — infer solely from screenshots and project context)',
  })

  const result = await callStructuredJSON<AiGenCasesPayload>({
    prompt,
    schema: AUTOMATION_JSON_SCHEMAS.GEN_CASES as unknown as Record<string, unknown>,
    schemaName: 'automation_test_cases',
    feature: 'AUTOMATION_GEN_CASES',
    images: images.length ? images : undefined,
  })

  const cases: TestCase[] = []

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
