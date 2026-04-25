'use client'
import { t } from 'i18next'
import { Columns, Minus, RefreshCw, Save, Square, X } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

interface DiffToolbarProps {
  onRefresh?: () => void
  onSwapSides?: () => void
  onSave?: () => void
  isSaving?: boolean
  filePath: string
  disableSave: boolean
}

export const DiffToolbar: React.FC<DiffToolbarProps> = ({ onRefresh, onSwapSides, onSave, isSaving = false, filePath, disableSave }) => {
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  return (
    <div
      className="flex items-center justify-between h-8 text-sm select-none"
      style={
        {
          WebkitAppRegion: 'drag',
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as React.CSSProperties
      }
    >
      <div className="flex items-center h-full">
        <div className="w-15 h-6 flex justify-center pt-1.5 pl-1">
          <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
        </div>
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                size="sm"
                onClick={onRefresh}
                className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
              >
                <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.refresh')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                size="sm"
                onClick={onSwapSides}
                className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
              >
                <Columns strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.swap')}</TooltipContent>
          </Tooltip>

          {onSave && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving || disableSave}
                  className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                >
                  <Save strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.save')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Center Section (Title) */}
      <Button variant={buttonVariant} className="font-medium text-xs">
        {t('dialog.diffViewer.title')}: {filePath}
      </Button>

      {/* Right Section (Window Controls) */}
      <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button type="button" onClick={() => handleWindow('minimize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
          <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button type="button" onClick={() => handleWindow('maximize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
          <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
          <X size={20} strokeWidth={1} absoluteStrokeWidth />
        </button>
      </div>
    </div>
  )
}
