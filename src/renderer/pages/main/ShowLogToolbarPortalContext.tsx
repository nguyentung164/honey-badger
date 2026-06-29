import { createContext, useContext } from 'react'

export type ShowLogToolbarPortalTargets = {
  /** Vùng host toolbar cho mode embedded. */
  host: HTMLDivElement | null
}

export const ShowLogToolbarPortalContext = createContext<ShowLogToolbarPortalTargets>({
  host: null,
})

export function useShowLogToolbarPortalTarget() {
  return useContext(ShowLogToolbarPortalContext)
}
