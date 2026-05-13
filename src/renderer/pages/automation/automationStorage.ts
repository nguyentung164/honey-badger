export const AUTOMATION_LAST_SUBTAB_KEY = 'automation.shell.lastSubtabV1'
export const AUTOMATION_LAST_PROJECT_ID_KEY = 'automation.shell.lastProjectIdV1'

export type AutomationSubTab = 'projects' | 'cases' | 'runs' | 'dashboard' | 'settings'

const ALLOWED: AutomationSubTab[] = ['projects', 'cases', 'runs', 'dashboard', 'settings']

export function readStoredAutomationSubTab(): AutomationSubTab {
  try {
    const v = localStorage.getItem(AUTOMATION_LAST_SUBTAB_KEY)
    if (v && (ALLOWED as string[]).includes(v)) return v as AutomationSubTab
  } catch {
    /* ignore */
  }
  return 'dashboard'
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
