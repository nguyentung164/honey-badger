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

/** Resolve task project → automation test_projects (same id, else match by name). */
export async function resolveTestProjectIdForTaskProject(taskProjectId: string): Promise<string | null> {
  const listRes = await window.api.automation.project.list()
  if (listRes.status !== 'success' || !listRes.data) return null
  const autoProjects = listRes.data
  if (autoProjects.some(p => p.id === taskProjectId)) return taskProjectId
  const taskRes = await window.api.task.getProjectsForTaskUi()
  const taskName = taskRes.data?.find(p => p.id === taskProjectId)?.name?.trim()
  if (!taskName) return null
  const match = autoProjects.find(p => p.name.trim().toLowerCase() === taskName.toLowerCase())
  return match?.id ?? null
}
