import os from 'node:os'
import path from 'node:path'
import Store from 'electron-store'
import type { AutomationSettingsState } from 'shared/automation/types'

const isElectronRuntime = process.versions.electron != null

type Schema = AutomationSettingsState & {
  /** Bí mật theo project, lưu plain string trong electron-store an toàn (đã encrypt-at-rest tuỳ OS). */
  projectSecrets: Record<string, Record<string, string>>
}

const store = new Store<Schema>({
  name: 'automation-settings',
  ...(!isElectronRuntime ? { cwd: path.join(os.tmpdir(), 'honey-badger-automation-settings') } : {}),
  defaults: {
    defaultWorkers: 1,
    defaultRetries: 0,
    runRetention: 20,
    aiProviderOverride: null,
    projectSecrets: {},
  },
})

export function getAutomationSettings(): AutomationSettingsState {
  return {
    defaultWorkers: store.get('defaultWorkers'),
    defaultRetries: store.get('defaultRetries'),
    runRetention: store.get('runRetention'),
    aiProviderOverride: store.get('aiProviderOverride') ?? null,
  }
}

export function setAutomationSettings(patch: Partial<AutomationSettingsState>): AutomationSettingsState {
  if (patch.defaultWorkers != null) store.set('defaultWorkers', patch.defaultWorkers)
  if (patch.defaultRetries != null) store.set('defaultRetries', patch.defaultRetries)
  if (patch.runRetention != null) store.set('runRetention', patch.runRetention)
  if (patch.aiProviderOverride !== undefined) store.set('aiProviderOverride', patch.aiProviderOverride)
  return getAutomationSettings()
}

export function getProjectSecrets(projectId: string): Record<string, string> {
  return store.get('projectSecrets')[projectId] ?? {}
}

export function setProjectSecrets(projectId: string, secrets: Record<string, string>): void {
  const all = { ...store.get('projectSecrets') }
  all[projectId] = secrets
  store.set('projectSecrets', all)
}

export function clearProjectSecrets(projectId: string): void {
  const all = { ...store.get('projectSecrets') }
  if (projectId in all) {
    delete all[projectId]
    store.set('projectSecrets', all)
  }
}
