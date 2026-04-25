'use client'

import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEVMStore } from '@/stores/useEVMStore'

export function EVMGuidelineTab() {
  const { t } = useTranslation()
  const projectName = useEVMStore(s => s.project.projectName)

  const blocks = t('evm.guidelineContent').split(/\n\n+/)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <h2 className="shrink-0 text-sm font-semibold">{t('evm.titleGuidelineEvm', { project: projectName || '—' })}</h2>
      <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border/40 bg-card/30 p-4">
        <div className="space-y-4 pr-3 text-sm leading-relaxed text-foreground">
          {blocks.map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
