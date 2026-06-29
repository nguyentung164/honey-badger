import { createContext, useContext } from 'react'

export type DevPipelinesToolbarPortalTargets = {
  /** Vùng host toolbar (sidebar toggle, active bar) cho mode embedded. */
  host: HTMLDivElement | null
}

export const DevPipelinesToolbarPortalContext = createContext<DevPipelinesToolbarPortalTargets>({
  host: null,
})

export function useDevPipelinesToolbarPortalTarget() {
  return useContext(DevPipelinesToolbarPortalContext)
}
