import type { CommitWorkflowContextSnapshot, SpotbugsStepSummary } from 'shared/commitWorkflow/types'
import { parseSpotBugsResult, runSpotBugs } from '../../utils/spotbugs'

export type SpotbugsStepResult = {
  status: 'pass' | 'fail' | 'skipped' | 'error'
  summary: SpotbugsStepSummary | null
  message?: string
}

export async function runSpotbugsStep(input: {
  repoPath: string
  context: CommitWorkflowContextSnapshot
  signal?: AbortSignal
}): Promise<SpotbugsStepResult> {
  if (input.signal?.aborted) return { status: 'error', summary: null, message: 'Cancelled' }

  const javaFiles = [...input.context.addedFiles, ...input.context.modifiedFiles].filter(f => f.endsWith('.java'))
  if (javaFiles.length === 0) {
    return {
      status: 'skipped',
      summary: { totalBugs: 0, high: 0, medium: 0, low: 0, pass: true },
      message: 'No Java files',
    }
  }

  try {
    const raw = await runSpotBugs(javaFiles)
    if (raw?.status === 'error') {
      return { status: 'error', summary: null, message: raw.message ?? 'SpotBugs failed' }
    }
    const xmlContent = typeof raw?.data === 'string' ? raw.data : typeof raw === 'string' ? raw : ''
    if (!xmlContent.trim()) {
      return { status: 'error', summary: null, message: 'Empty SpotBugs output' }
    }
    const parsed = parseSpotBugsResult(xmlContent)
    const high = parsed.bugCount?.byPriority?.high ?? parsed.summary?.priority1 ?? 0
    const medium = parsed.bugCount?.byPriority?.medium ?? parsed.summary?.priority2 ?? 0
    const low = parsed.bugCount?.byPriority?.low ?? parsed.summary?.priority3 ?? 0
    const totalBugs = parsed.bugCount?.total ?? parsed.summary?.totalBugs ?? 0
    const summary: SpotbugsStepSummary = {
      totalBugs,
      high: Number(high) || 0,
      medium: Number(medium) || 0,
      low: Number(low) || 0,
      pass: totalBugs === 0,
    }
    return { status: summary.pass ? 'pass' : 'fail', summary }
  } catch (e) {
    return { status: 'error', summary: null, message: e instanceof Error ? e.message : String(e) }
  }
}
