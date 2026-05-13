import { promises as fs } from 'node:fs'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { ImportPreview, TestCase } from 'shared/automation/types'

/**
 * Trích xuất text từ PDF qua pdfjs-dist (Node legacy build).
 * Dynamic import vì pdfjs-dist nặng và chỉ load khi user thật sự import PDF.
 */
export async function extractPdfText(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = (pdfjsLib as unknown as {
    getDocument: (args: { data: Uint8Array; useWorker?: boolean; isEvalSupported?: boolean }) => { promise: Promise<unknown> }
  }).getDocument({ data: new Uint8Array(buf), useWorker: false, isEvalSupported: false })
  const doc = (await loadingTask.promise) as {
    numPages: number
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str: string }> }> }>
  }
  const chunks: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const text = await page.getTextContent()
    chunks.push(text.items.map(i => i.str).join(' '))
  }
  return chunks.join('\n\n')
}

/**
 * Parser PDF v1: chỉ extract text + tạo một "draft case" tổng để user / AI
 * tiếp tục. PDF layout quá đa dạng để parse deterministic ở đây.
 */
export async function parsePdfFile(projectId: string, filePath: string): Promise<ImportPreview> {
  const text = await extractPdfText(filePath)
  if (text.trim().length < 10) {
    return {
      cases: [],
      warnings: [
        'PDF returned no extractable text (likely scanned image). Paste OCR text manually in the import dialog and let AI generate cases.',
      ],
    }
  }
  // Trả về 1 draft case để user xem/chỉnh; AI generator có thể chuyển text này thành nhiều case.
  const draft: TestCase = {
    id: randomUuidV7(),
    projectId,
    code: `PDF-${Date.now().toString(36).toUpperCase()}`,
    title: 'Imported from PDF (draft)',
    tags: ['pdf-import'],
    priority: 'medium',
    preconditions: undefined,
    steps: [],
    expected: '',
    source: 'pdf',
    specStatus: 'none',
    aiRationale: text.slice(0, 4000),
  }
  return {
    cases: [draft],
    warnings: ['PDF extracted as a single draft case. Use "Generate cases with AI" to split it into structured tests.'],
  }
}
