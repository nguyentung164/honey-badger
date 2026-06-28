import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { loadGitConflictFileContent } from './diffViewerConflictLoad'

export function useGitConflictFileActions(cwd?: string, onResolved?: () => void) {
  const { t } = useTranslation()
  const [resolvingFile, setResolvingFile] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const resolveFile = useCallback(
    async (filePath: string, resolution: 'ours' | 'theirs' | 'both') => {
      setResolvingFile(filePath)
      try {
        const result = await window.api.git.resolve_conflict(filePath, resolution, cwd?.trim() || undefined)
        if (result.status === 'success') {
          toast.success(t('git.conflict.resolveSuccess'))
          onResolved?.()
          return true
        }
        toast.error(result.message || t('git.conflict.resolveError'))
        return false
      } catch (error) {
        logger.error('Error resolving conflict:', error)
        toast.error(t('git.conflict.resolveError'))
        return false
      } finally {
        setResolvingFile(null)
      }
    },
    [cwd, onResolved, t]
  )

  const loadFileContent = useCallback(
    async (filePath: string) => {
      return loadGitConflictFileContent(filePath, cwd)
    },
    [cwd]
  )

  const saveAndStage = useCallback(
    async (filePath: string, content: string) => {
      setIsSaving(true)
      try {
        const writeOpts = cwd?.trim() ? { cwd: cwd.trim() } : undefined
        const writeResult = await window.api.system.write_file(filePath, content, writeOpts)
        if (!writeResult.success) {
          throw new Error(writeResult.error)
        }
        const addResult = await window.api.git.add([filePath], cwd ? { cwd } : undefined)
        if (addResult?.status !== 'success') {
          throw new Error(addResult?.message || 'Failed to stage file')
        }
        toast.success(t('git.conflict.resolveSuccess'))
        onResolved?.()
        return true
      } catch (error) {
        logger.error('Error saving conflict resolution:', error)
        toast.error(t('git.conflict.resolveError'))
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [cwd, onResolved, t]
  )

  return {
    resolvingFile,
    isSaving,
    resolveFile,
    loadFileContent,
    saveAndStage,
  }
}
