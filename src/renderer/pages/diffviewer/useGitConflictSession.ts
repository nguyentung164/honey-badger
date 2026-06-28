import { IPC } from 'main/constants'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import type { GitConflictType } from './diffViewerPayload'
import { fetchGitConflictSession } from './diffViewerConflictPayload'

export function useGitConflictSession(cwd?: string) {
  const { t } = useTranslation()
  const [conflictType, setConflictType] = useState<GitConflictType | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [isAborting, setIsAborting] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const refreshSeqRef = useRef(0)

  const refreshSession = useCallback(async () => {
    const seq = ++refreshSeqRef.current
    setIsLoading(true)
    try {
      const session = await fetchGitConflictSession(cwd)
      if (seq !== refreshSeqRef.current) return session
      setConflictType(session.conflictType)
      return session
    } finally {
      if (seq === refreshSeqRef.current) setIsLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    const onBranchChange = () => void refreshSession()
    const onConfigChange = () => void refreshSession()
    const onConflictResolved = () => void refreshSession()
    window.addEventListener('git-branch-changed', onBranchChange)
    window.addEventListener('configuration-changed', onConfigChange)
    window.api.on('git-conflict-resolved', onConflictResolved)
    return () => {
      window.removeEventListener('git-branch-changed', onBranchChange)
      window.removeEventListener('configuration-changed', onConfigChange)
      window.api.removeListener('git-conflict-resolved', onConflictResolved)
    }
  }, [refreshSession])

  const notifyConflictResolved = useCallback(() => {
    window.api.electron.send(IPC.WINDOW.NOTIFY_CONFLICT_RESOLVED)
    window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
  }, [])

  const handleAbort = useCallback(async () => {
    if (!conflictType) return false
    setIsAborting(true)
    try {
      let result: { status: string; message?: string }
      const repoCwd = cwd?.trim() || undefined
      if (conflictType === 'merge') {
        result = await window.api.git.abort_merge(repoCwd)
      } else if (conflictType === 'rebase') {
        result = await window.api.git.abort_rebase(cwd)
      } else {
        result = await window.api.git.abort_cherry_pick(cwd)
      }
      if (result.status === 'success') {
        toast.success(t('git.conflict.abortSuccess'))
        notifyConflictResolved()
        await refreshSession()
        return true
      }
      toast.error(result.message || t('git.conflict.abortError'))
      return false
    } catch (error) {
      logger.error('Error aborting conflict:', error)
      toast.error(t('git.conflict.abortError'))
      return false
    } finally {
      setIsAborting(false)
    }
  }, [conflictType, cwd, notifyConflictResolved, refreshSession, t])

  const handleContinue = useCallback(async () => {
    if (conflictType !== 'rebase' && conflictType !== 'cherry-pick') return false
    setIsContinuing(true)
    try {
      const result =
        conflictType === 'rebase'
          ? await window.api.git.continue_rebase(cwd)
          : await window.api.git.continue_cherry_pick(cwd)
      if (result.status === 'success') {
        toast.success(t('git.conflict.continueSuccess'))
        notifyConflictResolved()
        await refreshSession()
        return true
      }
      if (result.status === 'conflict') {
        toast.warning(t('git.conflict.conflicts'))
        await refreshSession()
        return false
      }
      toast.error(result.message || t('git.conflict.continueError'))
      return false
    } catch (error) {
      logger.error('Error continuing conflict:', error)
      toast.error(t('git.conflict.continueError'))
      return false
    } finally {
      setIsContinuing(false)
    }
  }, [conflictType, cwd, notifyConflictResolved, refreshSession, t])

  return {
    conflictType,
    isLoading,
    isAborting,
    isContinuing,
    refreshSession,
    handleAbort,
    handleContinue,
    notifyConflictResolved,
  }
}
