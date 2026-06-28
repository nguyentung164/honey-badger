'use client'

import { FileWarning, Minus, RefreshCw, Square, X } from 'lucide-react'
import { IPC } from 'main/constants'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SvnConflictPanel } from '@/components/conflict/SvnConflictPanel'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'

const handleWindow = (action: string) => {
  window.api.electron.send('window:action', action)
}

export function ConflictResolver() {
  const { t } = useTranslation()
  const loadConfigurationConfig = useConfigurationStore(s => s.loadConfigurationConfig)
  const sourceFolder = useConfigurationStore(s => s.sourceFolder)
  const versionControlSystem = useConfigurationStore(s => s.versionControlSystem)
  const isConfigLoaded = useConfigurationStore(s => s.isConfigLoaded)
  const dataSnapshotRef = useRef<string | null>(null)
  const refreshPanelRef = useRef<(() => void) | null>(null)
  const [conflictCount, setConflictCount] = useState<number | null>(null)
  const conflictBaselineRef = useRef(0)
  const [initialData, setInitialData] = useState<{ path?: string; versionControlSystem?: 'svn' } | null>(null)
  const [contextReady, setContextReady] = useState(false)

  const effectiveSourceFolder = initialData?.path ?? sourceFolder
  const effectiveVcs = initialData?.versionControlSystem ?? versionControlSystem

  useEffect(() => {
    loadConfigurationConfig().catch(() => {})
  }, [loadConfigurationConfig])

  useEffect(() => {
    const handler = (_event: unknown, data: { path?: string; versionControlSystem?: 'svn' }) => {
      setInitialData(data)
      setContextReady(true)
      setConflictCount(null)
    }
    window.api.on('load-conflict-resolver-data', handler)
    window.api.electron.send(IPC.WINDOW.REQUEST_CONFLICT_RESOLVER_DATA)
    const fallbackTimer = setTimeout(() => setContextReady(true), 200)
    return () => {
      window.api.removeListener('load-conflict-resolver-data', handler)
      clearTimeout(fallbackTimer)
    }
  }, [])

  const checkConflict = useCallback(async () => {
    if (!effectiveSourceFolder || effectiveVcs !== 'svn') {
      setConflictCount(0)
      return
    }
    try {
      const r = await window.api.svn.get_conflict_status(effectiveSourceFolder)
      if (r.status === 'success' && r.data) {
        const count = r.data.conflictedFiles?.length ?? 0
        if (r.data.hasConflict && count > conflictBaselineRef.current) {
          conflictBaselineRef.current = count
        }
        if (!r.data.hasConflict) {
          conflictBaselineRef.current = 0
        }
        setConflictCount(r.data.hasConflict ? count : 0)
      } else {
        setConflictCount(0)
      }
    } catch {
      setConflictCount(0)
    }
    refreshPanelRef.current?.()
  }, [effectiveSourceFolder, effectiveVcs])

  useEffect(() => {
    if (!contextReady) return
    void checkConflict()
  }, [checkConflict, contextReady])

  useEffect(() => {
    const handleConfigChange = () => {
      const newSnapshot = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
      if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
        return
      }
      dataSnapshotRef.current = newSnapshot
      void checkConflict()
    }
    window.addEventListener('configuration-changed', handleConfigChange)
    return () => window.removeEventListener('configuration-changed', handleConfigChange)
  }, [checkConflict])

  const handleRefresh = () => {
    void checkConflict()
  }

  const handleConflictCountChange = useCallback((remaining: number) => {
    if (remaining > conflictBaselineRef.current) {
      conflictBaselineRef.current = remaining
    }
    setConflictCount(remaining)
  }, [])

  const resolvedConflictCount =
    conflictBaselineRef.current > 0 && conflictCount != null
      ? Math.max(0, conflictBaselineRef.current - conflictCount)
      : 0
  const totalConflictCount = conflictBaselineRef.current > 0 ? conflictBaselineRef.current : (conflictCount ?? 0)

  return (
    <div className="flex h-screen w-full flex-col">
      <div
        className="flex items-center h-8 text-sm select-none shrink-0 border-b"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        <div className="flex items-center h-full pl-3 shrink-0">
          <div className="w-10 h-6 flex justify-center items-center shrink-0">
            <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <span className="font-medium text-xs">{t('conflictResolver.title')}</span>
          {conflictCount != null && conflictCount > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('dialog.diffViewer.conflictMode.progress', { resolved: resolvedConflictCount, total: totalConflictCount })}
            </span>
          ) : null}
        </div>
        <div className="flex gap-1 shrink-0 items-center pr-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.refresh')}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => handleWindow('minimize')}
            className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
          >
            <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button
            type="button"
            onClick={() => handleWindow('maximize')}
            className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
          >
            <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={20} strokeWidth={1} absoluteStrokeWidth />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!isConfigLoaded ? (
          <div className="flex items-center justify-center flex-1">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : !effectiveSourceFolder ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <FileWarning className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">{t('conflictResolver.noSourceFolder')}</p>
          </div>
        ) : effectiveVcs !== 'svn' ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground p-4 text-center">
            <FileWarning className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">{t('conflictResolver.svnOnlyHint')}</p>
          </div>
        ) : conflictCount === null ? (
          <div className="flex items-center justify-center flex-1">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : conflictCount === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <FileWarning className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">{t('conflictResolver.noConflicts')}</p>
          </div>
        ) : (
          <SvnConflictPanel
            sourceFolder={effectiveSourceFolder}
            compact={false}
            onRegisterRefresh={fn => {
              refreshPanelRef.current = fn
            }}
            onConflictCountChange={handleConflictCountChange}
            onResolved={() => {
              void checkConflict()
              window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
            }}
          />
        )}
      </div>
    </div>
  )
}
