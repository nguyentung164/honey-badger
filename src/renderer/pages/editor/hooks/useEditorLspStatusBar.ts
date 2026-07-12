import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LspServerId, LspServerState } from 'shared/lsp/types'
import { languageIdForLsp } from '@/lib/monacoLanguage'
import { uriRootsMatch, workspaceRootUri } from '@/pages/editor/lsp/documentUri'

type TrackedServerState = {
  state: LspServerState
  error?: string
}

const READY_CLEAR_MS = 8_000
const STARTING_TIMEOUT_MS = 25_000

/**
 * Status bar LSP label scoped to the active file's language server and workspace root.
 * Avoids showing "starting" forever when another server (e.g. Java) starts in the background.
 */
export function useEditorLspStatusBar(repoCwd: string, activeLanguageId?: string): string | undefined {
  const { t } = useTranslation()
  const [lspStatus, setLspStatus] = useState('')
  const serverStatesRef = useRef<Partial<Record<LspServerId, TrackedServerState>>>({})
  const readyClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeLanguageIdRef = useRef(activeLanguageId)
  activeLanguageIdRef.current = activeLanguageId

  const clearReadyTimer = useCallback(() => {
    if (readyClearTimerRef.current) {
      clearTimeout(readyClearTimerRef.current)
      readyClearTimerRef.current = null
    }
  }, [])

  const clearStartingTimer = useCallback(() => {
    if (startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current)
      startingTimeoutRef.current = null
    }
  }, [])

  const resolveActiveServerId = useCallback((): LspServerId | null => {
    const languageId = activeLanguageIdRef.current
    return languageId ? languageIdForLsp(languageId) : null
  }, [])

  const applyStatusForActiveServer = useCallback(() => {
    const serverId = resolveActiveServerId()
    if (!serverId) {
      clearReadyTimer()
      clearStartingTimer()
      setLspStatus('')
      return
    }

    const entry = serverStatesRef.current[serverId]
    if (!entry || entry.state === 'stopped') {
      clearReadyTimer()
      clearStartingTimer()
      setLspStatus('')
      return
    }

    if (entry.state === 'starting') {
      setLspStatus(t('editor.lsp.starting'))
      return
    }

    if (entry.state === 'ready') {
      setLspStatus(t('editor.lsp.ready'))
      return
    }

    if (entry.state === 'error') {
      clearReadyTimer()
      clearStartingTimer()
      setLspStatus(entry.error ?? t('editor.lsp.serverFailed'))
    }
  }, [clearReadyTimer, clearStartingTimer, resolveActiveServerId, t])

  const scheduleReadyClear = useCallback(() => {
    clearReadyTimer()
    readyClearTimerRef.current = setTimeout(() => setLspStatus(''), READY_CLEAR_MS)
  }, [clearReadyTimer])

  const scheduleStartingTimeout = useCallback(
    (serverId: LspServerId) => {
      clearStartingTimer()
      startingTimeoutRef.current = setTimeout(() => {
        startingTimeoutRef.current = null
        if (resolveActiveServerId() !== serverId) return
        if (serverStatesRef.current[serverId]?.state !== 'starting') return
        setLspStatus(t('editor.lsp.serverFailed'))
      }, STARTING_TIMEOUT_MS)
    },
    [clearStartingTimer, resolveActiveServerId, t]
  )

  useEffect(() => {
    if (!repoCwd) {
      serverStatesRef.current = {}
      clearReadyTimer()
      clearStartingTimer()
      setLspStatus('')
      return
    }

    const rootUri = workspaceRootUri(repoCwd)

    const unsub = window.api.lsp.onState(event => {
      if (!uriRootsMatch(event.rootUri, rootUri)) return

      serverStatesRef.current[event.serverId] = { state: event.state, error: event.error }

      if (resolveActiveServerId() !== event.serverId) return

      if (event.state === 'starting') {
        clearReadyTimer()
        setLspStatus(t('editor.lsp.starting'))
        scheduleStartingTimeout(event.serverId)
        return
      }

      clearStartingTimer()

      if (event.state === 'ready') {
        setLspStatus(t('editor.lsp.ready'))
        if (import.meta.env.DEV) {
          console.info(`[lsp] status: IntelliSense ready (${event.serverId})`)
        }
        scheduleReadyClear()
        return
      }

      if (event.state === 'error') {
        clearReadyTimer()
        setLspStatus(event.error ?? t('editor.lsp.serverFailed'))
        return
      }

      if (event.state === 'stopped') {
        clearReadyTimer()
        setLspStatus('')
      }
    })

    applyStatusForActiveServer()

    return () => {
      unsub()
      clearReadyTimer()
      clearStartingTimer()
    }
  }, [applyStatusForActiveServer, clearReadyTimer, clearStartingTimer, repoCwd, resolveActiveServerId, scheduleReadyClear, scheduleStartingTimeout, t])

  useEffect(() => {
    applyStatusForActiveServer()
  }, [activeLanguageId, applyStatusForActiveServer])

  return lspStatus || undefined
}
