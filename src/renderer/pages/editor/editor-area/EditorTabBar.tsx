'use client'

import { GitCompare, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GitFileStatusBadge, type GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { cn } from '@/lib/utils'
import { EditorTabContextMenu, type EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import { EXPLORER_GIT_LABEL_CLASS } from '@/pages/editor/explorer/explorerGitDecorations'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'

type EditorTabBarProps = {
  tabs: EditorTabSummary[]
  activeTabId: string | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onPinTab?: (tabId: string) => void
  getGitStatus?: (relativePath: string) => GitFileStatusCode | null
  tabMenuActionsById: ReadonlyMap<string, EditorTabMenuActions>
}

type TabBarScrollMetrics = {
  scrollWidth: number
  clientWidth: number
  scrollLeft: number
}

function readScrollMetrics(el: HTMLDivElement): TabBarScrollMetrics {
  return {
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollLeft: el.scrollLeft,
  }
}

export function EditorTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onPinTab, getGitStatus, tabMenuActionsById }: EditorTabBarProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabItemRefs = useRef(new Map<string, HTMLDivElement>())
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  const [scrollMetrics, setScrollMetrics] = useState<TabBarScrollMetrics>({
    scrollWidth: 0,
    clientWidth: 0,
    scrollLeft: 0,
  })
  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId

  const scrollTabIntoView = useCallback((tabId: string) => {
    tabItemRefs.current.get(tabId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [])

  const onSelectTabRef = useRef(onSelectTab)
  onSelectTabRef.current = onSelectTab

  const updateScrollMetrics = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollMetrics(readScrollMetrics(el))
  }, [])

  useEffect(() => {
    if (!activeTabId) return
    scrollTabIntoView(activeTabId)
    requestAnimationFrame(updateScrollMetrics)
  }, [activeTabId, scrollTabIntoView, updateScrollMetrics])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateScrollMetrics()
    el.addEventListener('scroll', updateScrollMetrics, { passive: true })
    const ro = new ResizeObserver(updateScrollMetrics)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', updateScrollMetrics)
      ro.disconnect()
    }
  }, [tabs.length, updateScrollMetrics])

  useLayoutEffect(() => {
    if (tabs.length === 0) return

    const host = hostRef.current
    if (!host) return

    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current
      if (!el) return

      const currentTabs = tabsRef.current
      const currentActiveId = activeTabIdRef.current

      // Shift + wheel — switch open tabs; explorer auto-reveal follows activeRelativePath
      if (e.shiftKey && currentTabs.length > 1) {
        const idx = currentTabs.findIndex(t => t.id === currentActiveId)
        if (idx < 0) return
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
        if (delta === 0) return
        e.preventDefault()
        e.stopPropagation()
        const nextIdx = Math.min(currentTabs.length - 1, Math.max(0, idx + (delta > 0 ? 1 : -1)))
        if (nextIdx === idx) return
        const nextTab = currentTabs[nextIdx]
        onSelectTabRef.current(nextTab.id)
        tabItemRefs.current.get(nextTab.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        return
      }

      // Normal wheel — horizontal scroll on tab strip when overflowing
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
      if (delta === 0 || el.scrollWidth <= el.clientWidth) return

      e.preventDefault()
      e.stopPropagation()
      el.scrollLeft += delta
    }

    host.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => host.removeEventListener('wheel', onWheel, { capture: true })
  }, [tabs.length])

  if (tabs.length === 0) return null

  const scrollRange = Math.max(0, scrollMetrics.scrollWidth - scrollMetrics.clientWidth)
  const hasOverflow = scrollRange > 1
  const thumbRatio = hasOverflow ? scrollMetrics.clientWidth / scrollMetrics.scrollWidth : 1
  const thumbWidthPercent = thumbRatio * 100
  const thumbLeftPercent = hasOverflow ? (scrollMetrics.scrollLeft / scrollRange) * (100 - thumbWidthPercent) : 0

  return (
    <div ref={hostRef} className="editor-tab-bar-host flex shrink-0 flex-col border-b bg-muted/20">
      <div ref={scrollRef} className="editor-tab-bar flex h-[var(--editor-chrome-row-height)] items-stretch overflow-x-auto overflow-y-hidden">
        {tabs.map((tab, tabIndex) => {
          const active = tab.id === activeTabId
          const isPreview = tab.isPreview && !tab.isPinned
          const gitStatus = !tab.isCompare ? (getGitStatus?.(tab.relativePath) ?? null) : null
          const tabMenuActions = tabMenuActionsById.get(tab.id)
          const tabRow = (
            <div
              ref={el => {
                if (el) tabItemRefs.current.set(tab.id, el)
                else tabItemRefs.current.delete(tab.id)
              }}
              className={cn(
                'group flex h-full max-w-[280px] shrink-0 items-center gap-1 border-r border-t-2 px-2 text-xs',
                active ? 'border-t-[#0078d4] bg-background text-foreground' : 'border-t-transparent bg-muted/10 text-muted-foreground hover:bg-muted/40',
                isPreview && !active && 'opacity-80'
              )}
            >
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-1.5"
                onClick={() => onSelectTab(tab.id)}
                onMouseDown={e => {
                  if (e.button === 1) {
                    e.preventDefault()
                    onCloseTab(tab.id)
                  }
                }}
                onDoubleClick={() => onPinTab?.(tab.id)}
              >
                {tab.isCompare ? (
                  <GitCompare className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                ) : (
                  <MaterialFileIcon name={tab.relativePath} size={14} className="h-4.5 w-4.5 shrink-0 opacity-90 relative top-[-0.5px]" />
                )}
                {tab.isDirty ? <span className="shrink-0 text-[10px] leading-none">●</span> : null}
                <span className={cn('min-w-0 truncate text-[13px] h-[20px]', (tab.isDirty || isPreview) && 'italic', gitStatus ? EXPLORER_GIT_LABEL_CLASS[gitStatus] : null)}>
                  {tab.tabLabel}
                </span>
                {gitStatus ? <GitFileStatusBadge status={gitStatus} variant="trailing" size="sm" /> : null}
              </button>
              <button
                type="button"
                className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                aria-label="Close"
                onClick={e => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )

          if (!tabMenuActions) {
            return <div key={tab.id}>{tabRow}</div>
          }

          return (
            <EditorTabContextMenu key={tab.id} tab={tab} tabIndex={tabIndex} tabCount={tabs.length} onSelectTab={onSelectTab} actions={tabMenuActions}>
              {tabRow}
            </EditorTabContextMenu>
          )
        })}
      </div>
      {hasOverflow ? (
        <div className="editor-tab-bar-scroll-track" aria-hidden>
          <div
            className="editor-tab-bar-scroll-thumb"
            style={{
              width: `${thumbWidthPercent}%`,
              left: `${thumbLeftPercent}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
