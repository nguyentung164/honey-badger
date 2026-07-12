import { useCallback, useRef, useState } from 'react'

export type DiffViewerProgrammaticEpoch = number

export function createProgrammaticEpochTracker() {
  let currentEpoch = 0
  return {
    begin(): DiffViewerProgrammaticEpoch {
      currentEpoch += 1
      return currentEpoch
    },
    isCurrent(epoch: DiffViewerProgrammaticEpoch) {
      return epoch === currentEpoch
    },
  }
}

/**
 * Tracks unsaved edits in the diff viewer modified pane.
 * Uses Monaco's isFlush flag — programmatic model updates must not mark dirty.
 *
 * Programmatic updates are generation-scoped so stale end callbacks from a prior
 * file load cannot clear dirty state while a newer load or user edit is active.
 */
export function useDiffViewerDirty(editable: boolean) {
  const [isDirty, setIsDirty] = useState(false)
  const editableRef = useRef(editable)
  const suppressDirtyRef = useRef(false)
  const programmaticEpochRef = useRef(createProgrammaticEpochTracker())
  editableRef.current = editable

  const setBaseline = useCallback((_content?: string) => {
    setIsDirty(false)
  }, [])

  const beginProgrammaticUpdate = useCallback((): DiffViewerProgrammaticEpoch => {
    suppressDirtyRef.current = true
    return programmaticEpochRef.current.begin()
  }, [])

  const endProgrammaticUpdate = useCallback((epoch: DiffViewerProgrammaticEpoch) => {
    if (!programmaticEpochRef.current.isCurrent(epoch)) return
    suppressDirtyRef.current = false
    setIsDirty(false)
  }, [])

  const notifyContentChange = useCallback((event: { isFlush?: boolean }) => {
    if (!editableRef.current || suppressDirtyRef.current) return
    if (event.isFlush === false) {
      setIsDirty(true)
    } else {
      setIsDirty(false)
    }
  }, [])

  return {
    isDirty: editable && isDirty,
    setBaseline,
    notifyContentChange,
    beginProgrammaticUpdate,
    endProgrammaticUpdate,
  }
}
