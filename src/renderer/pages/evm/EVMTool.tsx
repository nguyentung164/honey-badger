'use client'

import { Minus, Square, X } from 'lucide-react'
import { type CSSProperties, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Layout, useGroupRef } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import { evmTabSupportsAi, useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import { useEvmToolbarLayoutStore } from '@/stores/useEvmToolbarLayoutStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import type { EVMTabId } from './components/EVMSidebar'
import { EVMSidebar } from './components/EVMSidebar'
import { EvmAiInsightPanel } from './components/EvmAiInsightPanel'
import { EvmAiPanelContext } from './components/EvmAiPanelContext'

const TabFallback = () => (
  <div className="flex items-center justify-center flex-1 min-h-0">
    <GlowLoader className="w-10 h-10" />
  </div>
)

const EVMDashboardTab = lazy(() => import('./EVMDashboardTab').then(m => ({ default: m.EVMDashboardTab })))
const WBSGanttTab = lazy(() => import('./WBSGanttTab').then(m => ({ default: m.WBSGanttTab })))
const EVTab = lazy(() => import('./EVTab').then(m => ({ default: m.EVTab })))
const ACTab = lazy(() => import('./ACTab').then(m => ({ default: m.ACTab })))
const EVMMasterTab = lazy(() => import('./EVMMasterTab').then(m => ({ default: m.EVMMasterTab })))
const EVMGuidelineTab = lazy(() => import('./EVMGuidelineTab').then(m => ({ default: m.EVMGuidelineTab })))
const EvmReportTab = lazy(() => import('./EvmReportTab').then(m => ({ default: m.EvmReportTab })))
const ResourceUsageTab = lazy(() => import('./ResourceUsageTab').then(m => ({ default: m.ResourceUsageTab })))
const EVMToolbar = lazy(() => import('./components/EVMToolbar').then(m => ({ default: m.EVMToolbar })))

const tabContentClass =
  'flex flex-col flex-1 min-h-0 motion-reduce:animate-none motion-reduce:transform-none motion-reduce:opacity-100 animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-out'

const titleBarDragStyle = {
  WebkitAppRegion: 'drag',
  backgroundColor: 'var(--main-bg)',
  color: 'var(--main-fg)',
} as CSSProperties

const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

const PANEL_MAIN = 'evm-main-panel'
const PANEL_AI = 'evm-ai-insight-panel'

/** Giống ShowLog: không dùng collapsible — panel AI = 0% khi đóng; kéo separator được vì minSize = 0. */
const LAYOUT_AI_CLOSED: Layout = { [PANEL_MAIN]: 100, [PANEL_AI]: 0 }

export function EVMTool() {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [activeTab, setActiveTab] = useState<EVMTabId>('dashboard')
  const dbError = useEVMStore(s => s.dbError)
  const loadData = useEVMStore(s => s.loadData)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const projectId = useEVMStore(s => s.project.id)
  const groupRef = useGroupRef()
  const lastOpenSplitRef = useRef({ main: 72, ai: 28 })

  const applyOpenLayout = useCallback(() => {
    const g = groupRef.current
    if (!g) return
    const { main, ai } = lastOpenSplitRef.current
    const next: Layout = { [PANEL_MAIN]: main, [PANEL_AI]: ai }
    g.setLayout(next)
  }, [groupRef])

  const toggleAiPanel = useCallback(() => {
    if (!evmTabSupportsAi(activeTab)) return
    const g = groupRef.current
    if (!g) return
    const cur = g.getLayout()
    const aiPct = cur[PANEL_AI] ?? 0
    if (aiPct < 0.5) {
      applyOpenLayout()
    } else {
      g.setLayout(LAYOUT_AI_CLOSED)
    }
  }, [activeTab, applyOpenLayout, groupRef])

  const onEvmAiLayoutChanged = useCallback((layout: Layout) => {
    const ai = layout[PANEL_AI]
    const main = layout[PANEL_MAIN]
    if (ai != null && main != null && ai >= 1) {
      lastOpenSplitRef.current = { main, ai }
    }
  }, [])

  const evmAiPanelControl = useMemo(() => ({ togglePanel: toggleAiPanel }), [toggleAiPanel])

  const supportsAiTab = evmTabSupportsAi(activeTab)

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  useEffect(() => {
    verifySession().finally(() => loadData())
  }, [verifySession, loadData])

  useEffect(() => {
    useEvmAiInsightStore.getState().resetForProjectSwitch()
    useEvmToolbarLayoutStore.getState().setMasterSubTab('phases')
  }, [projectId])

  useEffect(() => {
    if (!evmTabSupportsAi(activeTab)) {
      groupRef.current?.setLayout(LAYOUT_AI_CLOSED)
      useEvmAiInsightStore.getState().setUiSegment('analyze')
    }
  }, [activeTab, groupRef])

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Title bar — h-8; kéo cửa sổ: drag trên thanh, chỉ nút điều khiển + control no-drag */}
      <div className="flex shrink-0 select-none items-center justify-between gap-2 text-sm h-8" style={titleBarDragStyle}>
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 pl-1" style={noDrag}>
            <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
              <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
            </div>
          </div>
          <Suspense fallback={<div className="h-6 min-w-0 flex-1 animate-pulse rounded-sm bg-muted/50" />}>
            <EvmAiPanelContext.Provider value={evmAiPanelControl}>
              <EVMToolbar activeEvmTab={activeTab} />
            </EvmAiPanelContext.Provider>
          </Suspense>
        </div>
        <div className="flex shrink-0 items-center gap-1" style={noDrag}>
          <button
            type="button"
            onClick={() => handleWindow('minimize')}
            className="flex h-8 w-10 items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
          >
            <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button
            type="button"
            onClick={() => handleWindow('maximize')}
            className="flex h-8 w-10 items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
          >
            <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('close')} className="flex h-8 w-10 items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={20} strokeWidth={1} absoluteStrokeWidth />
          </button>
        </div>
      </div>

      {dbError && (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <span className="min-w-0 flex-1">{dbError}</span>
          <Button type="button" variant={buttonVariant} size="sm" className="shrink-0 border-destructive/40" onClick={() => loadData()}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <EVMSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <EvmAiPanelContext.Provider value={evmAiPanelControl}>
          <ResizablePanelGroup
            groupRef={groupRef}
            orientation="horizontal"
            className="flex min-h-0 min-w-0 flex-1"
            resizeTargetMinimumSize={{ fine: 10, coarse: 28 }}
            onLayoutChanged={onEvmAiLayoutChanged}
          >
            {/* v4: minSize/maxSize/defaultSize kiểu number = pixel; dùng "%" để kéo theo tỷ lệ màn. */}
            <ResizablePanel defaultSize="100%" minSize="50%" id={PANEL_MAIN} className="min-w-0">
              <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
                {activeTab === 'dashboard' && (
                  <div key="dashboard" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <EVMDashboardTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'gantt' && (
                  <div key="gantt" className={cn(tabContentClass, 'flex overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <WBSGanttTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'ev' && (
                  <div key="ev" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <EVTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'ac' && (
                  <div key="ac" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <ACTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'report' && (
                  <div key="report" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <EvmReportTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'resource' && (
                  <div key="resource" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <ResourceUsageTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'master' && (
                  <div key="master" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <EVMMasterTab />
                    </Suspense>
                  </div>
                )}
                {activeTab === 'guideline' && (
                  <div key="guideline" className={cn(tabContentClass, 'overflow-hidden')}>
                    <Suspense fallback={<TabFallback />}>
                      <EVMGuidelineTab />
                    </Suspense>
                  </div>
                )}
              </main>
            </ResizablePanel>
            <ResizableHandle disabled={!supportsAiTab} className={cn('bg-transparent', supportsAiTab ? '' : 'pointer-events-none w-0 min-w-0 max-w-0 border-0 p-0 opacity-0')} />
            <ResizablePanel id={PANEL_AI} defaultSize="0%" minSize="0%" maxSize="72%" className="min-h-0 min-w-0 overflow-hidden">
              {supportsAiTab ? <EvmAiInsightPanel activeTab={activeTab} /> : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        </EvmAiPanelContext.Provider>
      </div>
    </div>
  )
}
