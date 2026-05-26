'use client'

import { useReactFlow, useStore } from '@xyflow/react'
import { Focus, Lock, Maximize2, Unlock, ZoomIn, ZoomOut } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FLOW_CANVAS_MAX_ZOOM, FLOW_CANVAS_MIN_ZOOM } from 'shared/flowCanvasZoom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

const verticalBarRowTriggerClass =
  'h-auto min-h-7 w-full shrink-0 justify-start gap-1.5 px-2 py-1 text-xs font-normal shadow-none'

type FlowCanvasZoomLockControlsProps = {
  variant?: 'horizontal' | 'vertical'
  canvasLocked: boolean
  onCanvasLockedChange: (locked: boolean) => void
  fitViewPadding?: number
  className?: string
}

function VerticalBarActionButton({
  label,
  title: titleProp,
  onClick,
  disabled,
  variant: variantProp,
  children,
}: {
  label: string
  title?: string
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  children: React.ReactNode
}) {
  const buttonVariantSetting = useAppearanceStoreSelect(s => s.buttonVariant)
  const variant = variantProp ?? buttonVariantSetting
  const title = titleProp ?? label
  return (
    <Button
      type="button"
      variant={variant}
      className={verticalBarRowTriggerClass}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      <span className="flex shrink-0 items-center text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">{children}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </Button>
  )
}

export const FlowCanvasZoomLockControls = memo(function FlowCanvasZoomLockControls({
  variant = 'horizontal',
  canvasLocked,
  onCanvasLockedChange,
  fitViewPadding = 0.2,
  className,
}: FlowCanvasZoomLockControlsProps) {
  const { t } = useTranslation()
  const rf = useReactFlow()
  const zoom = useStore(s => s.transform[2])
  const zoomPct = Math.round(zoom * 100)
  const zoomInDisabled = zoom >= FLOW_CANVAS_MAX_ZOOM - 0.001
  const zoomOutDisabled = zoom <= FLOW_CANVAS_MIN_ZOOM + 0.001

  const handleZoomIn = useCallback(() => {
    void rf.zoomIn({ duration: 180 })
  }, [rf])

  const handleZoomOut = useCallback(() => {
    void rf.zoomOut({ duration: 180 })
  }, [rf])

  const handleResetZoom = useCallback(() => {
    void rf.zoomTo(1, { duration: 180 })
  }, [rf])

  const handleFitView = useCallback(() => {
    void rf.fitView({ padding: fitViewPadding, duration: 250 })
  }, [rf, fitViewPadding])

  const handleToggleLock = useCallback(() => {
    onCanvasLockedChange(!canvasLocked)
  }, [canvasLocked, onCanvasLockedChange])

  const lockLabel = canvasLocked ? t('devPipelines.unlockCanvas') : t('devPipelines.lockCanvas')

  if (variant === 'vertical') {
    return (
      <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
        <VerticalBarActionButton label={t('automation.pageMap.zoomOut')} onClick={handleZoomOut} disabled={zoomOutDisabled}>
          <ZoomOut />
        </VerticalBarActionButton>
        <VerticalBarActionButton label={`${zoomPct}%`} title={t('devPipelines.resetZoom')} onClick={handleResetZoom}>
          <Focus className="size-3.5" />
        </VerticalBarActionButton>
        <VerticalBarActionButton label={t('automation.pageMap.zoomIn')} onClick={handleZoomIn} disabled={zoomInDisabled}>
          <ZoomIn />
        </VerticalBarActionButton>
        <VerticalBarActionButton label={t('automation.pageMap.fitView')} onClick={handleFitView}>
          <Maximize2 />
        </VerticalBarActionButton>
        <VerticalBarActionButton
          label={lockLabel}
          variant={canvasLocked ? 'secondary' : undefined}
          onClick={handleToggleLock}
        >
          {canvasLocked ? <Lock /> : <Unlock />}
        </VerticalBarActionButton>
      </div>
    )
  }

  return (
    <div className={cn('flex shrink-0 items-center gap-0.5', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={zoomOutDisabled}
            onClick={handleZoomOut}
            aria-label={t('automation.pageMap.zoomOut')}
          >
            <ZoomOut className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('automation.pageMap.zoomOut')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 min-w-[2.75rem] px-1.5 tabular-nums text-[10px] font-medium"
            onClick={handleResetZoom}
            aria-label={t('devPipelines.resetZoom')}
          >
            {zoomPct}%
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('devPipelines.resetZoom')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={zoomInDisabled}
            onClick={handleZoomIn}
            aria-label={t('automation.pageMap.zoomIn')}
          >
            <ZoomIn className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('automation.pageMap.zoomIn')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={handleFitView}
            aria-label={t('automation.pageMap.fitView')}
          >
            <Focus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('automation.pageMap.fitView')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={canvasLocked ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7 shrink-0"
            aria-pressed={canvasLocked}
            onClick={handleToggleLock}
            aria-label={lockLabel}
          >
            {canvasLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{lockLabel}</TooltipContent>
      </Tooltip>
    </div>
  )
})
