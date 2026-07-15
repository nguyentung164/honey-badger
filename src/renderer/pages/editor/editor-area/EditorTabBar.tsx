'use client'

import { closestCenter, DndContext, type DragEndEvent, MouseSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { EditorSortableTabItem, EditorTabItem } from '@/pages/editor/editor-area/EditorTabItem'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import type { EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'

type EditorTabBarProps = {
  tabs: EditorTabSummary[]
  activeTabId: string | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onPinTab?: (tabId: string) => void
  onReorderTabs?: (activeTabId: string, overTabId: string) => void
  getGitStatus?: (relativePath: string) => GitFileStatusCode | null
  getTabMenuActions: (tab: EditorTabSummary, tabIndex: number) => EditorTabMenuActions
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

export function EditorTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onPinTab, onReorderTabs, getGitStatus, getTabMenuActions }: EditorTabBarProps) {
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
  const onReorderTabsRef = useRef(onReorderTabs)
  onReorderTabsRef.current = onReorderTabs

  const tabIds = useMemo(() => tabs.map(tab => tab.id), [tabs])
  const sortableEnabled = Boolean(onReorderTabs) && tabs.length > 1

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorderTabsRef.current?.(String(active.id), String(over.id))
  }, [])

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

      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
      if (delta === 0 || el.scrollWidth <= el.clientWidth) return

      e.preventDefault()
      e.stopPropagation()
      el.scrollLeft += delta
    }

    host.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => host.removeEventListener('wheel', onWheel, { capture: true })
  }, [tabs.length])

  const setTabRef = useCallback((tabId: string, el: HTMLDivElement | null) => {
    if (el) tabItemRefs.current.set(tabId, el)
    else tabItemRefs.current.delete(tabId)
  }, [])

  if (tabs.length === 0) return null

  const stickyCount = tabs.findIndex(t => !t.isSticky)
  const stickyEnd = stickyCount === -1 ? tabs.length : stickyCount

  const tabItems = tabs.map((tab, tabIndex) => {
    const itemProps = {
      tab,
      tabIndex,
      tabCount: tabs.length,
      active: tab.id === activeTabId,
      showStickySeparator: tabIndex === stickyEnd && stickyEnd > 0 && stickyEnd < tabs.length,
      gitStatus: !tab.isCompare ? (getGitStatus?.(tab.relativePath) ?? null) : null,
      getTabMenuActions,
      onSelectTab,
      onCloseTab,
      onPinTab,
      setTabRef,
    }
    return sortableEnabled ? <EditorSortableTabItem key={tab.id} {...itemProps} /> : <EditorTabItem key={tab.id} {...itemProps} />
  })

  const tabStrip = (
    <div ref={scrollRef} className="editor-tab-bar flex h-[var(--editor-chrome-row-height)] min-w-0 items-stretch overflow-x-auto overflow-y-hidden">
      {sortableEnabled ? (
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          {tabItems}
        </SortableContext>
      ) : (
        tabItems
      )}
    </div>
  )

  return (
    <div ref={hostRef} className="editor-tab-bar-host flex shrink-0 flex-col border-b bg-muted/20">
      {sortableEnabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToHorizontalAxis]} onDragEnd={handleDragEnd}>
          {tabStrip}
        </DndContext>
      ) : (
        tabStrip
      )}
      {(() => {
        const scrollRange = Math.max(0, scrollMetrics.scrollWidth - scrollMetrics.clientWidth)
        const hasOverflow = scrollRange > 1
        const thumbRatio = hasOverflow ? scrollMetrics.clientWidth / scrollMetrics.scrollWidth : 1
        const thumbWidthPercent = thumbRatio * 100
        const thumbLeftPercent = hasOverflow ? (scrollMetrics.scrollLeft / scrollRange) * (100 - thumbWidthPercent) : 0
        return hasOverflow ? (
          <div className="editor-tab-bar-scroll-track" aria-hidden>
            <div
              className="editor-tab-bar-scroll-thumb"
              style={{
                width: `${thumbWidthPercent}%`,
                left: `${thumbLeftPercent}%`,
              }}
            />
          </div>
        ) : null
      })()}
    </div>
  )
}
