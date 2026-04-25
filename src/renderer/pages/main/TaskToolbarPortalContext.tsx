import { createContext, useContext } from 'react'

export type TaskToolbarPortalTargets = {
  /** Vùng giữa title bar: tab Tasks/Chart, date range, refresh */
  center: HTMLDivElement | null
  /** Sát tên user: Create task, Import CSV */
  actions: HTMLDivElement | null
}

export const TaskToolbarPortalContext = createContext<TaskToolbarPortalTargets>({
  center: null,
  actions: null,
})

export function useTaskToolbarPortalTarget() {
  return useContext(TaskToolbarPortalContext)
}
