'use client'

import { useTranslation } from 'react-i18next'
import { useEVMStore } from '@/stores/useEVMStore'
import { AcScheduleUnifiedTable } from './components/AcScheduleUnifiedTable'

export function ACTab() {
  const { t } = useTranslation()
  const project = useEVMStore(s => s.project)

  if (!project.id) {
    return <p className="p-4 text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <AcScheduleUnifiedTable />
    </div>
  )
}
