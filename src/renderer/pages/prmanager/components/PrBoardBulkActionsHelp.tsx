'use client'

import {
  ArrowDownToLine,
  CircleCheckBig,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestCreate,
  GitPullRequestCreateArrow,
  GitPullRequestDraft,
  HelpCircle,
  Trash2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { BulkActionKind } from './prBoardBulkResolve'

type BulkHelpItem = {
  kind: BulkActionKind
  Icon: LucideIcon
  iconClassName: string
}

const BULK_HELP_ITEMS: BulkHelpItem[] = [
  { kind: 'createPr', Icon: GitPullRequestCreate, iconClassName: 'text-sky-600 dark:text-sky-400' },
  { kind: 'merge', Icon: GitMerge, iconClassName: 'text-violet-600 dark:text-violet-400' },
  { kind: 'approve', Icon: CircleCheckBig, iconClassName: 'text-teal-600 dark:text-teal-400' },
  { kind: 'close', Icon: GitPullRequestClosed, iconClassName: 'text-rose-600 dark:text-rose-400' },
  { kind: 'reopen', Icon: GitPullRequestCreateArrow, iconClassName: 'text-orange-600 dark:text-orange-400' },
  { kind: 'draft', Icon: GitPullRequestDraft, iconClassName: 'text-slate-600 dark:text-slate-400' },
  { kind: 'ready', Icon: GitPullRequestArrow, iconClassName: 'text-emerald-600 dark:text-emerald-400' },
  { kind: 'requestReviewers', Icon: UserPlus, iconClassName: 'text-fuchsia-600 dark:text-fuchsia-400' },
  { kind: 'updateBranch', Icon: ArrowDownToLine, iconClassName: 'text-green-600 dark:text-green-400' },
  { kind: 'deleteRemoteBranch', Icon: Trash2, iconClassName: 'text-red-600 dark:text-red-400' },
]

export function PrBoardBulkActionsHelp() {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t('prManager.bulk.helpAria')}
        >
          <HelpCircle className="h-5 w-5 pl-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[min(22rem,calc(100vw-2rem))] p-3">
        <p className="mb-2 text-xs font-medium leading-snug text-foreground">{t('prManager.bulk.helpIntro')}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {BULK_HELP_ITEMS.map(({ kind, Icon, iconClassName }) => (
            <div key={kind} className="flex min-w-0 gap-1.5">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted/50',
                  iconClassName
                )}
                aria-hidden
              >
                <Icon className="h-3 w-3" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] font-medium leading-tight text-foreground">{t(`prManager.bulk.title.${kind}`)}</p>
                <p className="text-[10px] leading-snug text-muted-foreground">{t(`prManager.bulk.tt.${kind}`)}</p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
