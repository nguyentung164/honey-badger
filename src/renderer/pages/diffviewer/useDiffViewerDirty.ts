import { useCallback, useRef, useState } from 'react'

/**
 * Tracks unsaved edits in the diff viewer modified pane.
 * Uses Monaco's isFlush flag — programmatic model updates must not mark dirty.
 */
export function useDiffViewerDirty(editable: boolean) {
  const [isDirty, setIsDirty] = useState(false)
  const editableRef = useRef(editable)
  const suppressDirtyRef = useRef(false)
  editableRef.current = editable

  const setBaseline = useCallback((_content?: string) => {
    setIsDirty(false)
  }, [])

  const beginProgrammaticUpdate = useCallback(() => {
    suppressDirtyRef.current = true
  }, [])

  const endProgrammaticUpdate = useCallback(() => {
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
