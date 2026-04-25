'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildEVMTimeSeries, DEFAULT_EVM_HOURS_PER_DAY } from '@/lib/evmCalculations'
import { useEVMStore } from '@/stores/useEVMStore'
import { EarnedValueSeriesTable } from './components/EarnedValueSeriesTable'

export function EVTab() {
  const { t } = useTranslation()
  const project = useEVMStore(s => s.project)
  const wbs = useEVMStore(s => s.wbs)
  const ac = useEVMStore(s => s.ac)
  const master = useEVMStore(s => s.master)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])

  const nonWorkingDays = useMemo(
    () => master.nonWorkingDays.map(n => n.date),
    [master.nonWorkingDays]
  )

  const hpd = master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY
  const timeSeriesData = useMemo(
    () => buildEVMTimeSeries(project, wbs, ac, hpd, nonWorkingDays, wbsDayUnits),
    [project, wbs, ac, hpd, nonWorkingDays, wbsDayUnits]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4">
      <EarnedValueSeriesTable
        dailySeries={timeSeriesData}
        defaultGranularity="day"
        title={t('evm.evEarnedValueTableTitle')}
      />
    </div>
  )
}
