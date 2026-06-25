import { useCallback, useState } from 'react'

export const DIFF_VIEWER_AUTO_ADVANCE_STORAGE_KEY = 'diff-viewer-auto-advance'

function readAutoAdvanceFromStorage(): boolean {
  try {
    return localStorage.getItem(DIFF_VIEWER_AUTO_ADVANCE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeAutoAdvanceToStorage(enabled: boolean) {
  try {
    localStorage.setItem(DIFF_VIEWER_AUTO_ADVANCE_STORAGE_KEY, String(enabled))
  } catch {
    // ignore quota / private mode errors
  }
}

export function useDiffViewerAutoAdvance() {
  const [autoAdvance, setAutoAdvance] = useState(() => readAutoAdvanceFromStorage())

  const toggleAutoAdvance = useCallback(() => {
    setAutoAdvance(prev => {
      const next = !prev
      writeAutoAdvanceToStorage(next)
      return next
    })
  }, [])

  return { autoAdvance, toggleAutoAdvance }
}
