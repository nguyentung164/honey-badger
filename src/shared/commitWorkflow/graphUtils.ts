import { orderedStepNodeIds } from './defaultWorkflow'
import type { CommitWorkflowGraphJson, CommitWorkflowRunRecord, CommitWorkflowStepKind } from './types'

/** True when graph has positioned nodes and edges suitable for flow rendering. */
export function isGraphSnapshotComplete(graph: CommitWorkflowGraphJson | null | undefined): boolean {
  if (!graph?.nodes?.length) return false
  const nodeIds = new Set(graph.nodes.map(n => n.id))
  if (!graph.nodes.every(n => n.id && n.data?.stepKind && n.position != null)) return false
  if (graph.nodes.length <= 1) return true
  return (graph.edges ?? []).some(e => nodeIds.has(e.source) && nodeIds.has(e.target))
}

/** Synthetic run for editor preview or incomplete snapshot fallback. */
export function graphToPreviewRun(graph: CommitWorkflowGraphJson, opts?: { projectId?: string | null }): CommitWorkflowRunRecord {
  const stepIds = orderedStepNodeIds(graph)
  const now = new Date().toISOString()
  return {
    id: 'preview',
    projectId: opts?.projectId ?? null,
    userId: '',
    commitHash: '0000000',
    repoPath: '',
    workflowId: null,
    workflowVersion: 1,
    graphSnapshot: graph,
    status: 'completed',
    startedAt: now,
    finishedAt: now,
    contextSnapshot: { commitMessage: '', addedFiles: [], modifiedFiles: [], deletedFiles: [] },
    steps: stepIds.map((stepKey, sortOrder) => {
      const node = graph.nodes.find(n => n.id === stepKey)
      const enabled = node?.data.enabled !== false
      return {
        id: `preview-${stepKey}`,
        runId: 'preview',
        stepKey,
        stepKind: (node?.data.stepKind ?? 'coding-rules') as CommitWorkflowStepKind,
        sortOrder,
        status: enabled ? 'pass' : 'skipped',
        startedAt: now,
        finishedAt: now,
        summary: null,
        externalRef: null,
      }
    }),
  }
}
