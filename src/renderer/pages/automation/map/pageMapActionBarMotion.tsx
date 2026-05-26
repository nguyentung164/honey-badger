'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const
const DURATION = 0.2

type Orientation = 'vertical' | 'horizontal'

function motionTransition(reduceMotion: boolean | null) {
  return reduceMotion ? { duration: 0 } : { duration: DURATION, ease: EASE }
}

/** Secondary toolbar strip (group / page actions) — expand + fade. */
export function ActionBarMotionStrip({
  show,
  orientation,
  children,
  className,
  separator,
}: {
  show: boolean
  orientation: Orientation
  children: ReactNode
  className?: string
  /** Shown above strip content in vertical layout (e.g. `<Separator />`). */
  separator?: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const isVertical = orientation === 'vertical'
  const transition = motionTransition(reduceMotion)

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="action-bar-strip"
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
          transition={transition}
          className="overflow-hidden"
        >
          {separator && isVertical ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={transition}
            >
              {separator}
            </motion.div>
          ) : null}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: isVertical ? -6 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: isVertical ? -4 : 3 }}
            transition={transition}
            className={className}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Single control that mounts/unmounts (select all, path actions, …). */
export function ActionBarMotionItem({
  show,
  orientation,
  children,
  className,
  motionKey = 'action-bar-item',
}: {
  show: boolean
  orientation: Orientation
  children: ReactNode
  className?: string
  motionKey?: string
}) {
  const reduceMotion = useReducedMotion()
  const isVertical = orientation === 'vertical'
  const transition = motionTransition(reduceMotion)

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {show ? (
        <motion.div
          key={motionKey}
          layout={!reduceMotion}
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  scale: 0.96,
                  x: isVertical ? -5 : 0,
                }
          }
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          exit={
            reduceMotion
              ? undefined
              : {
                  opacity: 0,
                  scale: 0.96,
                  x: isVertical ? -5 : 0,
                }
          }
          transition={transition}
          className={cn(isVertical ? 'w-full min-w-0' : 'inline-flex shrink-0', className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Inline button group inside a horizontal flex row. */
export function ActionBarMotionInlineGroup({
  show,
  children,
  className,
  motionKey = 'action-bar-inline-group',
}: {
  show: boolean
  children: ReactNode
  className?: string
  motionKey?: string
}) {
  const reduceMotion = useReducedMotion()
  const transition = motionTransition(reduceMotion)

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {show ? (
        <motion.div
          key={motionKey}
          layout={!reduceMotion}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96, x: -8 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, x: -8 }}
          transition={transition}
          className={cn('inline-flex shrink-0 flex-wrap items-center gap-0.5', className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
