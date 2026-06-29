'use client'

import { CommitQualityDialog } from '@/components/commit-workflow/CommitQualityDialog'
import { CommitWorkflowDetailDialog } from '@/components/commit-workflow/CommitWorkflowDetailDialog'
import { useCommitWorkflowStore } from '@/lib/commitWorkflow/commitWorkflowUtils'

/** App-level commit workflow dialogs — available from any route. */
export function CommitWorkflowGlobalDialogs() {
  const repoPath = useCommitWorkflowStore(s => s.stream?.repoPath)

  return (
    <>
      <CommitWorkflowDetailDialog repoPath={repoPath} />
      <CommitQualityDialog />
    </>
  )
}
