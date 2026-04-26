import { createContext, useContext } from 'react'

export type PrManagerToolbarPortalTargets = {
  /** Vùng giữa title bar khi tab PR Manager (nhúng): project, tab con PR, token, … */
  host: HTMLDivElement | null
}

export const PrManagerToolbarPortalContext = createContext<PrManagerToolbarPortalTargets>({
  host: null,
})

export function usePrManagerToolbarPortalTarget() {
  return useContext(PrManagerToolbarPortalContext)
}
