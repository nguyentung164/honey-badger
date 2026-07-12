import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MainShellView } from 'shared/mainShellView'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { cn } from '@/lib/utils'

export type LazyShellView = 'tasks' | 'prManager' | 'automation' | 'devPipelines' | 'showLog'

export const LAZY_SHELL_VIEWS: readonly LazyShellView[] = [
  'tasks',
  'prManager',
  'automation',
  'devPipelines',
  'showLog',
] as const

/** Set to 0 to disable idle unload entirely. */
export const SHELL_TAB_IDLE_UNLOAD_MS = 30 * 60 * 1000
export const SHELL_TAB_IDLE_CHECK_INTERVAL_MS = 60_000

export function isLazyShellView(view: MainShellView): view is LazyShellView {
  return (LAZY_SHELL_VIEWS as readonly string[]).includes(view)
}

export function createInitialVisitedShellTabs(initialView: MainShellView, includeEditor: boolean): Set<MainShellView> {
  const next = new Set<MainShellView>(['vcs'])
  if (includeEditor) next.add('editor')
  if (initialView !== 'vcs') next.add(initialView)
  return next
}

export type ShellTabPanelProps = {
  visible: boolean
  mounted: boolean
  children: ReactNode
  className?: string
}

/** Keep-alive panel: CSS hidden when inactive (never unmount Monaco subtrees). */
export function ShellTabPanel({ visible, mounted, children, className }: ShellTabPanelProps) {
  if (!mounted) return null
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', !visible && 'hidden', className)}
      aria-hidden={!visible}
    >
      {children}
    </div>
  )
}

export function useShellTabVisited(initialView: MainShellView, includeEditor: boolean) {
  const [visitedShellTabs, setVisitedShellTabs] = useState<Set<MainShellView>>(() =>
    createInitialVisitedShellTabs(initialView, includeEditor)
  )

  const markVisited = useCallback((view: MainShellView) => {
    setVisitedShellTabs(prev => {
      if (prev.has(view)) return prev
      const next = new Set(prev)
      next.add(view)
      return next
    })
  }, [])

  const unmarkVisited = useCallback((view: MainShellView) => {
    setVisitedShellTabs(prev => {
      if (!prev.has(view)) return prev
      const next = new Set(prev)
      next.delete(view)
      return next
    })
  }, [])

  const resetVisited = useCallback((view: MainShellView, withEditor: boolean) => {
    setVisitedShellTabs(createInitialVisitedShellTabs(view, withEditor))
  }, [])

  return { visitedShellTabs, markVisited, unmarkVisited, resetVisited }
}

export function useShellTabIdleUnload(options: {
  enabled: boolean
  activeView: MainShellView
  visitedShellTabs: Set<MainShellView>
  shellTabLastActiveAtRef: React.MutableRefObject<Partial<Record<MainShellView, number>>>
  onUnloadLazy: (view: LazyShellView) => void
  onUnloadEditor?: () => void
}) {
  const { enabled, activeView, visitedShellTabs, shellTabLastActiveAtRef, onUnloadLazy, onUnloadEditor } = options

  useEffect(() => {
    shellTabLastActiveAtRef.current[activeView] = Date.now()
  }, [activeView, shellTabLastActiveAtRef])

  useEffect(() => {
    if (!enabled || SHELL_TAB_IDLE_UNLOAD_MS <= 0) return

    const tick = () => {
      const now = Date.now()
      for (const view of LAZY_SHELL_VIEWS) {
        if (!visitedShellTabs.has(view)) continue
        if (activeView === view) continue
        const last = shellTabLastActiveAtRef.current[view]
        if (last == null || now - last < SHELL_TAB_IDLE_UNLOAD_MS) continue
        onUnloadLazy(view)
      }

      if (onUnloadEditor && visitedShellTabs.has('editor') && activeView !== 'editor') {
        if (useEditorWorkspace.getState().hasDirtyTabs()) return
        const last = shellTabLastActiveAtRef.current.editor
        if (last != null && now - last >= SHELL_TAB_IDLE_UNLOAD_MS) {
          onUnloadEditor()
        }
      }
    }

    const id = window.setInterval(tick, SHELL_TAB_IDLE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [enabled, activeView, visitedShellTabs, onUnloadLazy, onUnloadEditor, shellTabLastActiveAtRef])
}

/** Tracks last-active timestamps for shell tabs (ref-only, no re-renders). */
export function useShellTabLastActiveAt() {
  return useRef<Partial<Record<MainShellView, number>>>({})
}
