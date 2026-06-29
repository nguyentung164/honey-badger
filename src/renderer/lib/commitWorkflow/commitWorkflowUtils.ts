import type { TFunction } from 'i18next'
import { DEFAULT_COMMIT_WORKFLOW_GRAPH } from 'shared/commitWorkflow/defaultWorkflow'
import type {
  CommitWorkflowRunRecord,
  CommitWorkflowRunStreamPayload,
  CommitWorkflowStepStatusEntry,
} from 'shared/commitWorkflow/types'
import { create } from 'zustand'

type CommitWorkflowState = {
  stream: CommitWorkflowRunStreamPayload | null
  detailDialogOpen: boolean
  qualityDialogOpen: boolean
  dismissedRunId: string | null
  setStream: (p: CommitWorkflowRunStreamPayload | null) => void
  setDetailDialogOpen: (open: boolean) => void
  setQualityDialogOpen: (open: boolean) => void
  dismissStream: () => void
}

export const useCommitWorkflowStore = create<CommitWorkflowState>(set => ({
  stream: null,
  detailDialogOpen: false,
  qualityDialogOpen: false,
  dismissedRunId: null,
  setStream: stream => set(s => ({ stream, dismissedRunId: stream?.runId !== s.stream?.runId ? null : s.dismissedRunId })),
  setDetailDialogOpen: detailDialogOpen => set({ detailDialogOpen }),
  setQualityDialogOpen: qualityDialogOpen => set({ qualityDialogOpen }),
  dismissStream: () => set(s => ({ dismissedRunId: s.stream?.runId ?? null })),
}))

export function formatStepStatusLabel(status: CommitWorkflowStepStatusEntry['status'], t: TFunction): string {
  return t(`commitWorkflow.stepStatus.${status}`, { defaultValue: String(status) })
}

export function formatRunStatusLabel(status: string, t: TFunction): string {
  return t(`commitWorkflow.runStatus.${status}`, { defaultValue: status })
}

export function formatStepElapsed(startedAt?: string, finishedAt?: string | null): string {
  if (!startedAt) return '—'
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const sec = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000))
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

export function countCompletedSteps(stepStatus: Record<string, CommitWorkflowStepStatusEntry>): { done: number; total: number; pass: number } {
  const entries = Object.values(stepStatus)
  const total = entries.length
  const done = entries.filter(s => !['pending', 'running'].includes(s.status)).length
  const pass = entries.filter(s => s.status === 'pass' || s.status === 'skipped').length
  return { done, total, pass }
}

/** Build a run record from stream payload — avoids extra getRun IPC for drawer step detail. */
export function runRecordFromStream(
  stream: CommitWorkflowRunStreamPayload,
  base?: CommitWorkflowRunRecord | null
): CommitWorkflowRunRecord {
  const steps = Object.entries(stream.stepStatus)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stepKey, entry], sortOrder) => ({
      id: `${stream.runId}-${stepKey}`,
      runId: stream.runId,
      stepKey,
      stepKind: entry.stepKind,
      sortOrder,
      status: entry.status,
      startedAt: entry.startedAt ?? null,
      finishedAt: entry.finishedAt ?? null,
      summary: entry.summary ?? null,
      externalRef: entry.externalRef ?? null,
    }))
  return {
    id: stream.runId,
    projectId: base?.projectId ?? null,
    userId: base?.userId ?? '',
    commitHash: stream.commitHash,
    repoPath: stream.repoPath,
    workflowId: base?.workflowId ?? null,
    workflowVersion: base?.workflowVersion ?? 1,
    graphSnapshot: base?.graphSnapshot ?? DEFAULT_COMMIT_WORKFLOW_GRAPH,
    status: stream.runStatus,
    startedAt: base?.startedAt ?? null,
    finishedAt: base?.finishedAt ?? null,
    contextSnapshot: base?.contextSnapshot ?? {
      commitMessage: '',
      addedFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
    },
    steps,
  }
}

export async function triggerCommitWorkflowAfterCommit(
  commitInfo: {
    commitHash?: string
    commitMessage: string
    branchName?: string
    addedFiles: string[]
    modifiedFiles: string[]
    deletedFiles: string[]
    sourceFolderPath?: string
    isAmend?: boolean
    replacesCommitHash?: string
    svnDiffContent?: string
  },
  repoPath: string,
  runChoices: import('shared/commitWorkflow/runChoices').CommitWorkflowRunChoices
): Promise<void> {
  if (!commitInfo.commitHash || !repoPath) return
  try {
    await window.api.commitWorkflow.start({
      commitHash: commitInfo.commitHash,
      repoPath,
      isAmend: commitInfo.isAmend,
      replacesCommitHash: commitInfo.replacesCommitHash,
      runChoices,
      commitInfo: {
        commitMessage: commitInfo.commitMessage,
        branch: commitInfo.branchName,
        addedFiles: commitInfo.addedFiles ?? [],
        modifiedFiles: commitInfo.modifiedFiles ?? [],
        deletedFiles: commitInfo.deletedFiles ?? [],
        ...(commitInfo.svnDiffContent ? { svnDiffContent: commitInfo.svnDiffContent } : {}),
      },
    })
  } catch {
    /* workflow is best-effort */
  }
}
