'use client'

import { FileWarning, Minus, Square, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitConflictPanel } from '@/components/conflict/GitConflictPanel'
import { SvnConflictPanel } from '@/components/conflict/SvnConflictPanel'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { IPC } from 'main/constants'
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
  const checkSeqRef = useRef(0)
  const [hasConflict, setHasConflict] = useState<boolean | null>(null)
  const [initialData, setInitialData] = useState<{ path?: string; versionControlSystem?: 'git' | 'svn' } | null>(null)
  // false = chưa nhận phản hồi REQUEST_CONFLICT_RESOLVER_DATA lần đầu
  const [contextReady, setContextReady] = useState(false)

  const effectiveSourceFolder = initialData?.path ?? sourceFolder
  const effectiveVcs = initialData?.versionControlSystem ?? versionControlSystem

  useEffect(() => {
    loadConfigurationConfig().catch(() => {})
  }, [loadConfigurationConfig])

  useEffect(() => {
    const handler = (_event: any, data: { path?: string; versionControlSystem?: 'git' | 'svn' }) => {
      setInitialData(data)
      setContextReady(true)
      // Reset để re-check với path đúng
      setHasConflict(null)
    }
    window.api.on('load-conflict-resolver-data', handler)
    window.api.electron.send(IPC.WINDOW.REQUEST_CONFLICT_RESOLVER_DATA)
    // Nếu không có pending data, main sẽ không respond → dùng sourceFolder từ store
    const fallbackTimer = setTimeout(() => setContextReady(true), 200)
    return () => {
      window.api.removeListener('load-conflict-resolver-data', handler)
      clearTimeout(fallbackTimer)
    }
  }, [])

  const checkConflict = useCallback(async () => {
    if (!effectiveSourceFolder || !effectiveVcs) {
      setHasConflict(false)
      return
    }
    const seq = ++checkSeqRef.current
    try {
      if (effectiveVcs === 'git') {
        const r = await window.api.git.get_conflict_status(effectiveSourceFolder)
        if (seq !== checkSeqRef.current) return
        setHasConflict(r.status === 'success' && r.data?.hasConflict === true)
      } else {
        const r = await window.api.svn.get_conflict_status(effectiveSourceFolder)
        if (seq !== checkSeqRef.current) return
        setHasConflict(r.status === 'success' && r.data?.hasConflict === true)
      }
    } catch {
      if (seq !== checkSeqRef.current) return
      setHasConflict(false)
    }
  }, [effectiveSourceFolder, effectiveVcs])

  // Chỉ chạy checkConflict sau khi context sẵn sàng
  useEffect(() => {
    if (!contextReady) return
    checkConflict()
  }, [checkConflict, contextReady])

  useEffect(() => {
    const handleConfigChange = () => {
      const newSnapshot = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
      if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
        return
      }
      dataSnapshotRef.current = newSnapshot
      checkConflict()
    }
    const handleBranchChange = () => checkConflict()
    // Khi main window resolve conflict, cửa sổ này cũng cần refresh
    const handleConflictResolved = () => checkConflict()
    window.addEventListener('configuration-changed', handleConfigChange)
    window.addEventListener('git-branch-changed', handleBranchChange)
    window.api.on('git-conflict-resolved', handleConflictResolved)
    return () => {
      window.removeEventListener('configuration-changed', handleConfigChange)
      window.removeEventListener('git-branch-changed', handleBranchChange)
      window.api.removeListener('git-conflict-resolved', handleConflictResolved)
    }
  }, [checkConflict])

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Title Bar */}
      <div
        className="flex items-center h-8 text-sm select-none shrink-0"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        <div className="flex items-center h-full pl-3 shrink-0">
          <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
            <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <span className="font-medium text-xs">{t('conflictResolver.title')}</span>
        </div>
        <div className="flex gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 p-4 overflow-auto">
        {!isConfigLoaded ? (
          <div className="flex items-center justify-center flex-1">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : !effectiveSourceFolder ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <FileWarning className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">{t('conflictResolver.noSourceFolder')}</p>
          </div>
        ) : effectiveVcs === 'git' ? (
          hasConflict === null ? (
            <div className="flex items-center justify-center flex-1">
              <GlowLoader className="w-10 h-10" />
            </div>
          ) : hasConflict === false ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
              <FileWarning className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">{t('conflictResolver.noConflicts')}</p>
            </div>
          ) : (
            <GitConflictPanel
              sourceFolder={effectiveSourceFolder}
              compact={false}
              onStatusChanged={() => {
                window.api.electron.send(IPC.WINDOW.NOTIFY_CONFLICT_RESOLVED)
                checkConflict()
              }}
              onResolved={() => {
                checkConflict()
                window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
              }}
              onAbort={() => {
                checkConflict()
                window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
              }}
            />
          )
        ) : effectiveVcs === 'svn' ? (
          hasConflict === null ? (
            <div className="flex items-center justify-center flex-1">
              <GlowLoader className="w-10 h-10" />
            </div>
          ) : hasConflict === false ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
              <FileWarning className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">{t('conflictResolver.noConflicts')}</p>
            </div>
          ) : (
            <SvnConflictPanel
              sourceFolder={effectiveSourceFolder}
              compact={false}
              onResolved={() => {
                checkConflict()
                window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
              }}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <FileWarning className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">{t('conflictResolver.unsupportedVcs')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
