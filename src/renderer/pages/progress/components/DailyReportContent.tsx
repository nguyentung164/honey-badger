'use client'

import { ClipboardList, RefreshCw } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { SectionHeader } from './SectionHeader'

const DevReportHistory = lazy(() => import('@/pages/dailyreport/DevReportHistory').then(m => ({ default: m.DevReportHistory })))

interface DailyReportContentProps {
  selectedUserId?: string | null
  selectedUserName?: string | null
}

export function DailyReportContent({ selectedUserId, selectedUserName }: DailyReportContentProps) {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const [refreshKey, setRefreshKey] = useState(0)

  const isViewingOtherUser = !!(selectedUserId && user && selectedUserId !== user.id)

  useEffect(() => {
    verifySession()
  }, [verifySession])

  if (!user) {
    return (
      <div className="space-y-6 p-6 bg-muted/20">
        <SectionHeader
          icon={<ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          title={t('dailyReport.open')}
          description={t('progress.dailyReportDesc')}
        />
        <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
          {t('dailyReport.pleaseLogin')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-6 bg-muted/20">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent shrink-0">
            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {isViewingOtherUser && selectedUserName
                ? `${t('dailyReport.open')} — ${selectedUserName}`
                : t('dailyReport.open')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('progress.dailyReportDesc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRefreshKey(k => k + 1)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.refresh')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col mt-4">
        <Suspense
          fallback={
            <div className="relative flex-1 min-h-0">
              <OverlayLoader isLoading={true} />
            </div>
          }
        >
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <DevReportHistory
              refreshKey={refreshKey}
              onOpenEditReport={() => {}}
              targetUserId={selectedUserId ?? undefined}
              isViewingOtherUser={isViewingOtherUser}
            />
          </div>
        </Suspense>
      </div>
    </div>
  )
}
