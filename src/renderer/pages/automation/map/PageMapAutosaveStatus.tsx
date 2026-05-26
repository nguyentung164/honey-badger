'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Loader2, XCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  getPageMapSaveState,
  subscribePageMapSaveState,
  type PageMapSaveState,
} from '@/pages/automation/map/pageMapAutosaveStore'

const BADGE_EASE = [0.22, 1, 0.36, 1] as const
const BADGE_DURATION = 0.22

function badgeClass(state: PageMapSaveState) {
  switch (state) {
    case 'saving':
      return 'bg-muted text-muted-foreground'
    case 'saved':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'error':
      return 'bg-destructive/10 text-destructive'
    default:
      return ''
  }
}

function badgeContent(state: PageMapSaveState, t: (key: string) => string) {
  switch (state) {
    case 'saving':
      return (
        <>
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {t('devPipelines.autosaveSaving')}
        </>
      )
    case 'saved':
      return (
        <>
          <Check className="size-3" aria-hidden />
          {t('devPipelines.autosaveSaved')}
        </>
      )
    case 'error':
      return (
        <>
          <XCircle className="size-3" aria-hidden />
          {t('devPipelines.autosaveError')}
        </>
      )
    default:
      return null
  }
}

export function PageMapAutosaveStatus({ className }: { className?: string }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const saveState = useSyncExternalStore(subscribePageMapSaveState, getPageMapSaveState, () => 'idle' as PageMapSaveState)
  const visible = saveState !== 'idle'
  const transition = reduceMotion ? { duration: 0 } : { duration: BADGE_DURATION, ease: BADGE_EASE }

  return (
    <span
      className={cn('inline-flex h-[25px] min-w-[4.75rem] shrink-0 items-center justify-center', className)}
      aria-hidden={!visible}
    >
      <AnimatePresence mode="wait" initial={false}>
        {visible ? (
          <motion.span
            key={saveState}
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 3 }}
            animate={
              reduceMotion
                ? { opacity: 1, scale: 1, y: 0 }
                : saveState === 'saved'
                  ? { opacity: 1, scale: [0.92, 1.04, 1], y: 0 }
                  : saveState === 'error'
                    ? { opacity: 1, scale: 1, x: [0, -2, 2, -1, 0], y: 0 }
                    : { opacity: 1, scale: 1, y: 0 }
            }
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.92, y: -2 }}
            transition={
              saveState === 'saved' && !reduceMotion
                ? { duration: 0.35, ease: BADGE_EASE, times: [0, 0.55, 1] }
                : saveState === 'error' && !reduceMotion
                  ? { duration: 0.4, ease: BADGE_EASE }
                  : transition
            }
            className={cn(
              'inline-flex h-[25px] items-center gap-1 rounded-full px-2 text-[10px] font-medium leading-none',
              badgeClass(saveState)
            )}
          >
            {badgeContent(saveState, t)}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
