export const AUTOMATION_LAST_SUBTAB_KEY = 'automation.shell.lastSubtabV1'
export const AUTOMATION_LAST_PROJECT_ID_KEY = 'automation.shell.lastProjectIdV1'

export type AutomationSubTab = 'projects' | 'cases' | 'runs' | 'map'

const ALLOWED: AutomationSubTab[] = ['projects', 'cases', 'runs', 'map']

/** Legacy persisted values map to a valid shell tab */
const LEGACY_SUBTAB: Record<string, AutomationSubTab> = {
  projects: 'projects',
  cases: 'cases',
  runs: 'runs',
  pageMap: 'map',
  map: 'map',
  dashboard: 'projects',
  settings: 'projects',
}

export function readStoredAutomationSubTab(): AutomationSubTab {
  try {
    const v = localStorage.getItem(AUTOMATION_LAST_SUBTAB_KEY)
    if (v && (ALLOWED as string[]).includes(v)) return v as AutomationSubTab
    if (v && LEGACY_SUBTAB[v]) return LEGACY_SUBTAB[v]
  } catch {
    /* ignore */
  }
  return 'projects'
}

export function writePersistedAutomationSubTab(v: AutomationSubTab): void {
  try {
    localStorage.setItem(AUTOMATION_LAST_SUBTAB_KEY, v)
  } catch {
    /* ignore */
  }
}

export function readStoredAutomationProjectId(): string | null {
  try {
    return localStorage.getItem(AUTOMATION_LAST_PROJECT_ID_KEY)
  } catch {
    return null
  }
}

export function writePersistedAutomationProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(AUTOMATION_LAST_PROJECT_ID_KEY, id)
    else localStorage.removeItem(AUTOMATION_LAST_PROJECT_ID_KEY)
  } catch {
    /* ignore */
  }
}

export const AUTOMATION_PROJECT_RAIL_OPEN_KEY = 'automation.projectList.railOpenV1'

export function readPersistedProjectRailOpen(): boolean {
  try {
    const v = localStorage.getItem(AUTOMATION_PROJECT_RAIL_OPEN_KEY)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    /* ignore */
  }
  return true
}

export function writePersistedProjectRailOpen(open: boolean): void {
  try {
    localStorage.setItem(AUTOMATION_PROJECT_RAIL_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}
