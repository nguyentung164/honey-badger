'use client'

import { GitBranchPlus, Settings, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import type { PrAutomation, PrCheckpointTemplate, PrRepo } from '../hooks/usePrData'
import { AutomationsTab } from './AutomationsTab'
import { CheckpointTemplatesTab } from './CheckpointTemplatesTab'
import { RepoRegistryTab } from './RepoRegistryTab'

type Props = {
  projectId: string
  userId: string | null
  repos: PrRepo[]
  templates: PrCheckpointTemplate[]
  automations: PrAutomation[]
  onRefresh: () => void
}

export function PrManagerSettingsPanel({ projectId, userId, repos, templates, automations, onRefresh }: Props) {
  const { t } = useTranslation()
  return (
    <div className="min-h-0 flex-1 overflow-auto pr-0.5">
      <Accordion type="multiple" defaultValue={['repos', 'checkpoints', 'automations']} variant="framed">
        <AccordionItem value="repos" className="border-border/80">
          <AccordionTrigger className={cn('items-center py-3 text-sm hover:no-underline [&[data-state=open]]:border-b-0')}>
            <span className="flex items-center gap-2">
              <GitBranchPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t('prManager.shell.tabRepos')}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-0">
            <RepoRegistryTab projectId={projectId} userId={userId} repos={repos} onRefresh={onRefresh} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="checkpoints" className="border-border/80">
          <AccordionTrigger className={cn('items-center py-3 text-sm hover:no-underline [&[data-state=open]]:border-b-0')}>
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t('prManager.shell.tabCheckpoints')}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-0">
            <CheckpointTemplatesTab projectId={projectId} templates={templates} onRefresh={onRefresh} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="automations" className="last:border-b-0 border-border/80">
          <AccordionTrigger className={cn('items-center py-3 text-sm hover:no-underline [&[data-state=open]]:border-b-0')}>
            <span className="flex items-center gap-2">
              <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t('prManager.shell.tabAutomations')}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-0">
            <AutomationsTab automations={automations} repos={repos} onRefresh={onRefresh} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
