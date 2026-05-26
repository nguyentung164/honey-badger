'use client'

import { memo, type ReactNode } from 'react'
import type {
  FlowNodeContentDensity,
  FlowNodeContentLayoutContext,
  FlowNodeContentLayoutKind,
  FlowNodeContentMetadataMode,
} from 'shared/flowNodeContentLayout'
import { contentLayoutSupportsMetadata } from 'shared/flowNodeContentLayout'
import {
  contentLayoutDensityClasses,
  effectiveMetadataModeForLayout,
  shouldShowInlineBadge,
} from '@/components/flow-inspector/flowNodeContentLayoutUi'
import { cn } from '@/lib/utils'

export type FlowNodeContentSlots = {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  statusBadge?: ReactNode
  statusIcon?: ReactNode
  metadata?: ReactNode
  metadataToggle?: ReactNode
  trailing?: ReactNode
}

type Props = {
  layout: FlowNodeContentLayoutKind
  density?: FlowNodeContentDensity
  metadataMode?: FlowNodeContentMetadataMode
  context: FlowNodeContentLayoutContext
  metadataExpanded?: boolean
  className?: string
  slots: FlowNodeContentSlots
}

function IconWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center [&>img]:object-contain [&>svg]:pointer-events-none [&>svg]:shrink-0',
        className,
      )}
    >
      {children}
    </span>
  )
}

function InlineLayout({
  density,
  metadataMode,
  metadataExpanded,
  slots,
}: {
  density: FlowNodeContentDensity
  metadataMode: FlowNodeContentMetadataMode
  metadataExpanded?: boolean
  slots: FlowNodeContentSlots
}) {
  const d = contentLayoutDensityClasses(density)
  const showBadge = shouldShowInlineBadge('inline') && slots.statusBadge
  const showMeta = contentLayoutSupportsMetadata('inline', metadataMode)

  return (
    <>
      <div className={cn('flex items-center', d.headerRow)}>
        {slots.icon ? <IconWrap className={d.iconBox}>{slots.icon}</IconWrap> : null}
        <span className={cn('min-w-0 flex-1 truncate py-px font-medium text-foreground', d.titleText)}>{slots.title}</span>
        {showBadge ? slots.statusBadge : null}
        {slots.trailing}
      </div>
      {showMeta ? (
        <>
          {metadataMode === 'toggle' && slots.metadataToggle ? slots.metadataToggle : null}
          {((metadataMode === 'toggle' && metadataExpanded) || metadataMode === 'always') && slots.metadata ? slots.metadata : null}
        </>
      ) : null}
    </>
  )
}

function StackedLayout({
  density,
  metadataMode,
  metadataExpanded,
  slots,
}: {
  density: FlowNodeContentDensity
  metadataMode: FlowNodeContentMetadataMode
  metadataExpanded?: boolean
  slots: FlowNodeContentSlots
}) {
  const d = contentLayoutDensityClasses(density)
  const showMeta =
    contentLayoutSupportsMetadata('stacked', metadataMode) &&
    slots.metadata &&
    (metadataMode === 'always' || (metadataMode === 'toggle' && metadataExpanded))
  return (
    <>
      <div className={cn('flex items-start', d.rowGap)}>
        {slots.statusIcon ? (
          <div className={cn('inline-flex shrink-0 items-center justify-center pt-px', d.iconBox)} aria-hidden>
            {slots.statusIcon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={cn('flex min-h-4 items-center font-semibold leading-none text-foreground', d.titleText, d.rowGap)}>
            {slots.icon ? <IconWrap className={d.iconBox}>{slots.icon}</IconWrap> : null}
            <span className="min-w-0 flex-1 truncate py-px">{slots.title}</span>
          </p>
          {slots.subtitle ? (
            <p className={cn('mt-0.5 flex items-center leading-tight text-muted-foreground', d.subtitleText, d.rowGap)}>
              {slots.subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {metadataMode === 'toggle' && slots.metadataToggle ? slots.metadataToggle : null}
      {showMeta ? slots.metadata : null}
    </>
  )
}

function IconBlockLayout({ density, slots }: { density: FlowNodeContentDensity; slots: FlowNodeContentSlots }) {
  const d = contentLayoutDensityClasses(density)
  return (
    <div className={cn('flex flex-col items-center text-center', d.rowGap)}>
      {slots.icon ? (
        <IconWrap className={density === 'spacious' ? 'size-8' : density === 'compact' ? 'size-5' : 'size-6'}>{slots.icon}</IconWrap>
      ) : slots.statusIcon ? (
        <div className={cn('inline-flex items-center justify-center', d.iconBox)}>{slots.statusIcon}</div>
      ) : null}
      <span className={cn('min-w-0 max-w-full truncate font-medium text-foreground', d.titleText)}>{slots.title}</span>
      {slots.subtitle ? <span className={cn('min-w-0 max-w-full truncate text-muted-foreground', d.subtitleText)}>{slots.subtitle}</span> : null}
      {shouldShowInlineBadge('iconBlock') && slots.statusBadge ? <div className="mt-0.5">{slots.statusBadge}</div> : null}
    </div>
  )
}

function BadgeLeadingLayout({ density, slots }: { density: FlowNodeContentDensity; slots: FlowNodeContentSlots }) {
  const d = contentLayoutDensityClasses(density)
  const leading = slots.statusBadge ?? slots.statusIcon
  return (
    <div className={cn('flex items-start', d.rowGap)}>
      {leading ? (
        <div className={cn('flex w-8 shrink-0 items-center justify-center', density === 'compact' ? 'w-6' : '')}>{leading}</div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center font-medium text-foreground', d.titleText, d.rowGap)}>
          {slots.icon ? <IconWrap className={d.iconBox}>{slots.icon}</IconWrap> : null}
          <span className="min-w-0 flex-1 truncate">{slots.title}</span>
          {slots.trailing}
        </div>
        {slots.subtitle ? <p className={cn('mt-0.5 truncate text-muted-foreground', d.subtitleText)}>{slots.subtitle}</p> : null}
      </div>
    </div>
  )
}

function CompactLayout({ density, slots }: { density: FlowNodeContentDensity; slots: FlowNodeContentSlots }) {
  const d = contentLayoutDensityClasses(density)
  return (
    <div className={cn('flex items-center', d.headerRow)}>
      {slots.icon ? <IconWrap className={d.iconBox}>{slots.icon}</IconWrap> : slots.statusIcon ? (
        <IconWrap className={d.iconBox}>{slots.statusIcon}</IconWrap>
      ) : null}
      <span className={cn('min-w-0 flex-1 truncate font-medium text-foreground', d.titleText)}>{slots.title}</span>
      {slots.trailing}
    </div>
  )
}

function MetadataLayout({
  density,
  metadataMode,
  metadataExpanded,
  slots,
}: {
  density: FlowNodeContentDensity
  metadataMode: FlowNodeContentMetadataMode
  metadataExpanded?: boolean
  slots: FlowNodeContentSlots
}) {
  const d = contentLayoutDensityClasses(density)
  const effective = effectiveMetadataModeForLayout('metadata', metadataMode)
  const showToggle = effective === 'toggle' && slots.metadataToggle
  const showMeta =
    slots.metadata &&
    (effective === 'always' || (effective === 'toggle' && metadataExpanded))

  return (
    <>
      <div className={cn('flex items-center border-b border-border/40 pb-1', d.rowGap)}>
        {slots.icon ? <IconWrap className={d.iconBox}>{slots.icon}</IconWrap> : null}
        <span className={cn('min-w-0 flex-1 truncate font-semibold text-foreground', d.titleText)}>{slots.title}</span>
        {shouldShowInlineBadge('metadata') && slots.statusBadge ? slots.statusBadge : null}
        {slots.trailing}
      </div>
      {slots.subtitle ? <p className={cn('mt-1 truncate text-muted-foreground', d.subtitleText)}>{slots.subtitle}</p> : null}
      {showToggle ? slots.metadataToggle : null}
      {showMeta ? slots.metadata : null}
    </>
  )
}

export const FlowNodeContentLayout = memo(function FlowNodeContentLayout({
  layout,
  density = 'comfortable',
  metadataMode = 'hidden',
  metadataExpanded,
  className,
  slots,
}: Props) {
  const effectiveMeta = effectiveMetadataModeForLayout(layout, metadataMode)

  return (
    <div className={cn('min-w-0', className)}>
      {layout === 'inline' ? (
        <InlineLayout density={density} metadataMode={effectiveMeta} metadataExpanded={metadataExpanded} slots={slots} />
      ) : layout === 'stacked' ? (
        <StackedLayout density={density} metadataMode={effectiveMeta} metadataExpanded={metadataExpanded} slots={slots} />
      ) : layout === 'iconBlock' ? (
        <IconBlockLayout density={density} slots={slots} />
      ) : layout === 'badgeLeading' ? (
        <BadgeLeadingLayout density={density} slots={slots} />
      ) : layout === 'compact' ? (
        <CompactLayout density={density} slots={slots} />
      ) : (
        <MetadataLayout density={density} metadataMode={effectiveMeta} metadataExpanded={metadataExpanded} slots={slots} />
      )}
    </div>
  )
})
