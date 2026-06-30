import type { CommitWorkflowRunChoices } from 'shared/commitWorkflow/runChoices'

const STORAGE_KEY = 'commitWorkflow.prefs.v1'

type PrefsStore = Record<string, Record<string, CommitWorkflowRunChoices>>

function readStore(): PrefsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PrefsStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: PrefsStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function loadCommitWorkflowPrefs(projectId: string, repoPath: string): CommitWorkflowRunChoices | null {
  if (!projectId || !repoPath) return null
  const norm = repoPath.replace(/\\/g, '/').toLowerCase()
  return readStore()[projectId]?.[norm] ?? null
}

export function saveCommitWorkflowPrefs(
  projectId: string,
  repoPath: string,
  choices: CommitWorkflowRunChoices
): void {
  if (!projectId || !repoPath) return
  const norm = repoPath.replace(/\\/g, '/').toLowerCase()
  const store = readStore()
  const byProject = { ...(store[projectId] ?? {}), [norm]: choices }
  writeStore({ ...store, [projectId]: byProject })
}

export function hasCommitWorkflowPrefs(projectId: string, repoPath: string): boolean {
  return loadCommitWorkflowPrefs(projectId, repoPath) != null
}

/** Resolve task project → linked automation test_projects (via API; includes legacy id/name match). */
export async function resolveTestProjectIdsForTaskProject(taskProjectId: string): Promise<string[]> {
  const res = await window.api.automation.project.listForTask(taskProjectId)
  if (res.status !== 'success' || !res.data?.length) return []
  return res.data.map(p => p.id)
}

/** @deprecated Use resolveTestProjectIdsForTaskProject — returns first linked project id. */
export async function resolveTestProjectIdForTaskProject(taskProjectId: string): Promise<string | null> {
  const ids = await resolveTestProjectIdsForTaskProject(taskProjectId)
  return ids[0] ?? null
}
