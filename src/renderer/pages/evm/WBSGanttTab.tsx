'use client'

import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { WBSRow } from 'shared/types/evm'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { matchesEvmAssigneeFilter, matchesEvmPhaseFilter } from '@/lib/evmUi'
import { useEVMStore } from '@/stores/useEVMStore'
import { useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import { WbsRollupTable } from './components/WbsRollupTable'
import { WbsScheduleUnifiedTable } from './components/WbsScheduleUnifiedTable'

export function WBSGanttTab() {
  const { t } = useTranslation()
  const project = useEVMStore(s => s.project)
  const wbs = useEVMStore(s => s.wbs)
  const master = useEVMStore(s => s.master)

  const filterPhase = useEvmAiInsightStore(s => s.schedulePhaseFilter)
  const filterAssignee = useEvmAiInsightStore(s => s.scheduleAssigneeFilter)

  const wbsFiltered = useMemo(() => {
    let list: WBSRow[] = wbs
    list = list.filter(r => matchesEvmPhaseFilter(r.phase, filterPhase))
    list = list.filter(r => matchesEvmAssigneeFilter(r.assignee, filterAssignee))
    return list
  }, [wbs, filterPhase, filterAssignee])

  const nonWorkingDays = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])

  const wbsRollupScrollRef = useRef<HTMLDivElement>(null)
  const wbsScheduleScrollRef = useRef<HTMLDivElement>(null)

  if (!project.id) {
    return <p className="p-4 text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <ResizablePanelGroup orientation="vertical" className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-md">
        <ResizablePanel defaultSize={34} minSize={18} className="min-h-0 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <WbsRollupTable
              master={master}
              wbsFiltered={wbsFiltered}
              nonWorkingDays={nonWorkingDays}
              scrollContainerRef={wbsRollupScrollRef}
              horizontalScrollPeerRef={wbsScheduleScrollRef}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle className="h-1.5 bg-transparent" />
        <ResizablePanel defaultSize={66} minSize={30} className="min-h-0 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <WbsScheduleUnifiedTable
              wbsRows={wbsFiltered}
              scrollContainerRef={wbsScheduleScrollRef}
              horizontalScrollPeerRef={wbsRollupScrollRef}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
