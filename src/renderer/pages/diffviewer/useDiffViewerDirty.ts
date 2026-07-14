import { useCallback, useRef, useState } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'

export type DiffViewerProgrammaticEpoch = number

export type DiffViewerDirtyModel = MonacoEditor.ITextModel | null

function modelKey(model: MonacoEditor.ITextModel): string {
  return model.uri.toString()
}

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
 * VS Code-style dirty tracking for the diff viewer modified pane.
 * Dirty when `model.getAlternativeVersionId()` differs from the last clean snapshot
 * (after load or save). Matches the main editor's `isDirtyByVersion` pattern.
 */
export function useDiffViewerDirty(editable: boolean) {
  const [isDirty, setIsDirty] = useState(false)
  const editableRef = useRef(editable)
  const suppressDirtyRef = useRef(false)
  const baselineVersionIdRef = useRef<number | null>(null)
  const baselineModelKeyRef = useRef<string | null>(null)
  const baselineContentRef = useRef('')
  const baselineDiskMtimeMsRef = useRef<number | null>(null)
  const isDirtyRef = useRef(false)
  const programmaticEpochRef = useRef(createProgrammaticEpochTracker())
  editableRef.current = editable

  const applyDirty = useCallback((dirty: boolean) => {
    const effective = editableRef.current && dirty
    isDirtyRef.current = effective
    setIsDirty(effective)
  }, [])

  const readDirtyFromModel = useCallback((model: DiffViewerDirtyModel): boolean => {
    if (!model || !editableRef.current || suppressDirtyRef.current) return false
    const baseline = baselineVersionIdRef.current
    const baselineModelKey = baselineModelKeyRef.current
    if (baseline == null || !baselineModelKey) return false
    if (modelKey(model) !== baselineModelKey) return false
    return model.getAlternativeVersionId() !== baseline
  }, [])

  const syncDirtyFromModel = useCallback(
    (model: DiffViewerDirtyModel) => {
      applyDirty(readDirtyFromModel(model))
    },
    [applyDirty, readDirtyFromModel]
  )

  const markClean = useCallback(
    (model: DiffViewerDirtyModel, content?: string, diskMtimeMs?: number | null) => {
      if (model) {
        baselineVersionIdRef.current = model.getAlternativeVersionId()
        baselineModelKeyRef.current = modelKey(model)
        baselineContentRef.current = content ?? model.getValue()
      } else if (content !== undefined) {
        baselineVersionIdRef.current = null
        baselineModelKeyRef.current = null
        baselineContentRef.current = content
      }
      if (diskMtimeMs !== undefined) {
        baselineDiskMtimeMsRef.current = diskMtimeMs
      }
      applyDirty(false)
    },
    [applyDirty]
  )

  const resetBaseline = useCallback(() => {
    baselineVersionIdRef.current = null
    baselineModelKeyRef.current = null
    baselineContentRef.current = ''
    baselineDiskMtimeMsRef.current = null
    applyDirty(false)
  }, [applyDirty])

  /** @deprecated Prefer markClean(model). Kept for call sites that only pass content. */
  const setBaseline = useCallback(
    (content?: string, model?: DiffViewerDirtyModel) => {
      if (model) {
        markClean(model, content)
        return
      }
      if (content !== undefined) {
        baselineContentRef.current = content
        baselineVersionIdRef.current = null
        baselineModelKeyRef.current = null
      }
      applyDirty(false)
    },
    [applyDirty, markClean]
  )

  const beginProgrammaticUpdate = useCallback((): DiffViewerProgrammaticEpoch => {
    suppressDirtyRef.current = true
    return programmaticEpochRef.current.begin()
  }, [])

  const endProgrammaticUpdate = useCallback(
    (
      epoch: DiffViewerProgrammaticEpoch,
      model?: DiffViewerDirtyModel,
      content?: string,
      diskMtimeMs?: number | null
    ) => {
      if (!programmaticEpochRef.current.isCurrent(epoch)) return
      suppressDirtyRef.current = false
      if (model) {
        markClean(model, content, diskMtimeMs)
        return
      }
      applyDirty(false)
    },
    [applyDirty, markClean]
  )

  const getBaselineForDirtyWrite = useCallback(() => {
    return {
      content: baselineContentRef.current,
      diskMtimeMs: baselineDiskMtimeMsRef.current,
    }
  }, [])

  /**
   * VS Code TextFileEditorModel: only mark clean after save when the model version
   * still matches the snapshot taken before the async write.
   */
  const commitCleanAfterSave = useCallback(
    (
      model: DiffViewerDirtyModel,
      savedContent: string,
      snapshotVersionId: number,
      diskMtimeMs?: number | null
    ): boolean => {
      if (!model) {
        applyDirty(false)
        return false
      }
      if (model.getAlternativeVersionId() !== snapshotVersionId) {
        syncDirtyFromModel(model)
        return false
      }
      markClean(model, savedContent, diskMtimeMs)
      return true
    },
    [applyDirty, markClean, syncDirtyFromModel]
  )

  const notifyContentChange = useCallback(
    (model: DiffViewerDirtyModel) => {
      if (!model || !editableRef.current || suppressDirtyRef.current) return
      syncDirtyFromModel(model)
    },
    [syncDirtyFromModel]
  )

  /** Capture baseline when the Monaco model mounts or changes after async load. */
  const captureBaselineIfMissing = useCallback(
    (model: DiffViewerDirtyModel, content?: string) => {
      if (!model) return
      const key = modelKey(model)
      if (baselineVersionIdRef.current == null || baselineModelKeyRef.current !== key) {
        markClean(model, content)
      }
    },
    [markClean]
  )

  /** Revert modified pane to last clean snapshot (discard unsaved edits). */
  const revertToBaseline = useCallback(
    (model: DiffViewerDirtyModel, onContentApplied?: (content: string) => void) => {
      if (!model) {
        applyDirty(false)
        return
      }
      const epoch = beginProgrammaticUpdate()
      const content = baselineContentRef.current
      if (model.getValue() !== content) {
        model.setValue(content)
        onContentApplied?.(content)
      }
      endProgrammaticUpdate(epoch, model, content)
    },
    [applyDirty, beginProgrammaticUpdate, endProgrammaticUpdate]
  )

  return {
    isDirty,
    isDirtyRef,
    setBaseline,
    markClean,
    resetBaseline,
    notifyContentChange,
    beginProgrammaticUpdate,
    endProgrammaticUpdate,
    revertToBaseline,
    syncDirtyFromModel,
    captureBaselineIfMissing,
    getBaselineForDirtyWrite,
    commitCleanAfterSave,
  }
}
