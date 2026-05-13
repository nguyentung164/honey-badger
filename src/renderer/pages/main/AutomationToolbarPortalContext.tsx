import { createContext, useContext } from 'react'

export type AutomationToolbarPortalTargets = {
  /** Vùng host toolbar (project picker, sub tabs, action buttons) cho mode embedded. */
  host: HTMLDivElement | null
}

export const AutomationToolbarPortalContext = createContext<AutomationToolbarPortalTargets>({
  host: null,
})

export function useAutomationToolbarPortalTarget() {
  return useContext(AutomationToolbarPortalContext)
}
