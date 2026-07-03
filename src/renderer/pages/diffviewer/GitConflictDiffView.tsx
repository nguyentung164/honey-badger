'use client'

import { IPC } from 'main/constants'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  buildEmbeddedGitConflictPayloadSyncKey,
} from '@/lib/diffViewer/openDiffViewer'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { DiffConflictToolbar } from './DiffConflictToolbar'
import { DiffViewerConflictPane } from './DiffViewerConflictPane'
import { DiffViewerFileTreePanel, type DiffViewerFileTreeBulkAction } from './DiffViewerFileTreePanel'
import toast from '@/components/ui-elements/Toast'
import { resolveDiffViewerRevealPath } from './diffViewerUtils'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { enrichDiffViewerPayload } from './diffViewerPayload'
import type { DiffViewerLoadPayload } from './diffViewerPayload'
import { normalizeGitPath, pathsEqual, resolveDiffViewerRepoCwd, wrapFileNavIndex } from './diffViewerGitFiles'
import { useDiffViewerAutoAdvance } from './useDiffViewerAutoAdvance'
import { useDiffViewerFileNav } from './useDiffViewerFileNav'
import { useGitConflictFileActions } from './useGitConflictFileActions'
import { useGitConflictSession } from './useGitConflictSession'
import {
  DIFF_VIEWER_EDITOR_PANEL_ID,
  DIFF_VIEWER_TREE_PANEL_ID,
  DIFF_VIEWER_TREE_PANEL_MAX_WIDTH,
  DIFF_VIEWER_TREE_PANEL_MIN_WIDTH,
  useDiffViewerTreePanelWidth,
} from './useDiffViewerTreePanelWidth'
import type { CodeDiffViewerHandle } from './CodeDiffViewer'

export type GitConflictDiffViewProps = {
  embedded?: boolean
  embeddedPayload?: DiffViewerLoadPayload | null
  embeddedToolbarHost?: HTMLElement | null
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export const GitConflictDiffView = forwardRef<CodeDiffViewerHandle, GitConflictDiffViewProps>(
  function GitConflictDiffView({ embedded = false, embeddedPayload = null, embeddedToolbarHost = null }, ref) {
    const { t } = useTranslation()
    const sourceFolder = useConfigurationStore(s => s.sourceFolder)
    const [cwd, setCwd] = useState<string | undefined>()
    const [fileContent, setFileContent] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isLoadingFile, setIsLoadingFile] = useState(false)
    const [isTreeRefreshing, setIsTreeRefreshing] = useState(false)
    const [isEditorDirty, setIsEditorDirty] = useState(false)
    const [showLayoutLeaveConfirm, setShowLayoutLeaveConfirm] = useState(false)
    const sessionBaselineRef = useRef(0)
    const loadGenerationRef = useRef(0)
    const embeddedPayloadSyncKeyRef = useRef('')
    const loadContextRef = useRef<DiffViewerLoadPayload | null>(null)
    const pendingLayoutLeaveRef = useRef<(() => void) | null>(null)

    const { files, activeIndex, activeFile, initFiles, goToFile } = useDiffViewerFileNav()
    const { autoAdvance, toggleAutoAdvance } = useDiffViewerAutoAdvance()
    const { panelGroupRef, initialLayout, handleLayoutChanged } = useDiffViewerTreePanelWidth()

    const repoCwd = useMemo(
      () => resolveDiffViewerRepoCwd(loadContextRef.current?.cwd ?? cwd, cwd, sourceFolder),
      [cwd, sourceFolder]
    )

    const {
      conflictType,
      isLoading: isSessionLoading,
      isAborting,
      isContinuing,
      refreshSession,
      handleAbort,
      handleContinue,
      notifyConflictResolved,
    } = useGitConflictSession(repoCwd)

    const afterFileResolved = useCallback(async () => {
      notifyConflictResolved()
      const session = await refreshSession()
      if (!session) return
      const prevPath = loadContextRef.current?.filePath
      if (session.files.length === 0) {
        initFiles([], 0)
        setFileContent(null)
        setLoadError(null)
        setIsEditorDirty(false)
        loadContextRef.current = null
        return
      }
      let nextIndex = 0
      if (autoAdvance && prevPath) {
        const prevIdx = session.files.findIndex(f => pathsEqual(f.filePath, prevPath))
        if (prevIdx >= 0) {
          nextIndex = wrapFileNavIndex(prevIdx, 1, session.files.length) ?? 0
        }
      } else if (prevPath) {
        const sameIdx = session.files.findIndex(f => pathsEqual(f.filePath, prevPath))
        nextIndex = sameIdx >= 0 ? sameIdx : 0
      }
      sessionBaselineRef.current = Math.max(sessionBaselineRef.current, session.files.length)
      initFiles(session.files, nextIndex)
      const nextFile = session.files[nextIndex]
      if (nextFile && loadContextRef.current) {
        loadContextRef.current = enrichDiffViewerPayload({
          ...loadContextRef.current,
          filePath: nextFile.filePath,
          files: session.files,
          currentFileIndex: nextIndex,
          conflictType: session.conflictType,
        })
      }
    }, [autoAdvance, initFiles, notifyConflictResolved, refreshSession])

    const { resolvingFile, isSaving, resolveFile, loadFileContent, saveAndStage } = useGitConflictFileActions(
      repoCwd,
      () => void afterFileResolved()
    )

    const applyPayload = useCallback(
      (data: DiffViewerLoadPayload) => {
        const enriched = enrichDiffViewerPayload(data)
        const path = enriched.filePath ? normalizeGitPath(enriched.filePath) : ''
        const normalizedFiles = enriched.files?.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) }))
        const resolvedCwd = resolveDiffViewerRepoCwd(enriched.cwd, undefined, sourceFolder)
        setCwd(resolvedCwd)
        const fileCount = normalizedFiles?.length ?? 0
        sessionBaselineRef.current = Math.max(sessionBaselineRef.current, fileCount)
        initFiles(normalizedFiles, enriched.currentFileIndex)
        setIsEditorDirty(false)
        loadContextRef.current = { ...enriched, filePath: path, files: normalizedFiles, cwd: resolvedCwd }
      },
      [initFiles, sourceFolder]
    )

    const loadActiveFile = useCallback(
      async (filePath: string) => {
        if (!filePath) return
        const generation = ++loadGenerationRef.current
        setIsLoadingFile(true)
        setLoadError(null)
        try {
          const content = await loadFileContent(filePath)
          if (generation !== loadGenerationRef.current) return
          setFileContent(content)
        } catch (error) {
          if (generation !== loadGenerationRef.current) return
          setLoadError(formatLoadError(error))
          setFileContent(null)
        } finally {
          if (generation === loadGenerationRef.current) {
            setIsLoadingFile(false)
          }
        }
      },
      [loadFileContent]
    )

    useEffect(() => {
      const path = activeFile?.filePath ?? loadContextRef.current?.filePath
      if (!path) return
      void loadActiveFile(path)
    }, [activeFile?.filePath, loadActiveFile])

    const handleRefreshAll = useCallback(async () => {
      setIsTreeRefreshing(true)
      try {
        const session = await refreshSession()
        if (!session) return
        sessionBaselineRef.current = Math.max(sessionBaselineRef.current, session.files.length)
        initFiles(session.files, Math.min(activeIndex, Math.max(0, session.files.length - 1)))
        if (session.files.length === 0) {
          setFileContent(null)
          setIsEditorDirty(false)
        }
      } finally {
        setIsTreeRefreshing(false)
      }
    }, [activeIndex, initFiles, refreshSession])

    const handleTreeBulkAction = useCallback(
      async (action: DiffViewerFileTreeBulkAction, indices: number[]) => {
        if (indices.length === 0) return
        const uniqueIndices = [...new Set(indices)].filter(index => index >= 0 && index < files.length)
        if (uniqueIndices.length === 0) return

        const selectedPaths = [
          ...new Set(
            uniqueIndices
              .map(index => files[index]?.filePath)
              .filter(Boolean)
              .map(path => normalizeGitPath(path as string))
          ),
        ]

        if (action === 'reveal') {
          for (const path of selectedPaths) {
            window.api.system.reveal_in_file_explorer(resolveDiffViewerRevealPath(path, repoCwd))
          }
          return
        }

        if (action === 'openInEditor') {
          const path = selectedPaths[0]
          if (!path) return
          const result = await window.api.system.open_file_in_editor({ filePath: path, cwd: repoCwd })
          if (!result?.success) {
            toast.error(result?.error || t('dialog.diffViewer.openInEditorFailed'))
          }
        }
      },
      [files, repoCwd, t]
    )

    useEffect(() => {
      const handleFilesChanged = () => {
        void handleRefreshAll()
      }
      window.api.on(IPC.FILES_CHANGED, handleFilesChanged)
      return () => window.api.removeListener(IPC.FILES_CHANGED, handleFilesChanged)
    }, [handleRefreshAll])

    const navigateToFile = useCallback(
      (index: number) => {
        if (!goToFile(index)) return
        const entry = files[index]
        if (!entry || !loadContextRef.current) return
        setIsEditorDirty(false)
        loadContextRef.current = {
          ...loadContextRef.current,
          filePath: entry.filePath,
          currentFileIndex: index,
        }
      },
      [files, goToFile]
    )

    const handlePrevFile = useCallback(() => {
      if (files.length <= 1) return
      const nextIndex = wrapFileNavIndex(activeIndex, -1, files.length)
      if (nextIndex != null) navigateToFile(nextIndex)
    }, [activeIndex, files.length, navigateToFile])

    const handleNextFile = useCallback(() => {
      if (files.length <= 1) return
      const nextIndex = wrapFileNavIndex(activeIndex, 1, files.length)
      if (nextIndex != null) navigateToFile(nextIndex)
    }, [activeIndex, files.length, navigateToFile])

    const handleResolve = useCallback(
      async (resolution: 'ours' | 'theirs' | 'both') => {
        const path = activeFile?.filePath ?? loadContextRef.current?.filePath
        if (!path) return
        await resolveFile(path, resolution)
      },
      [activeFile?.filePath, resolveFile]
    )

    const handleSave = useCallback(
      async (content: string) => {
        const path = activeFile?.filePath ?? loadContextRef.current?.filePath
        if (!path) return
        await saveAndStage(path, content)
      },
      [activeFile?.filePath, saveAndStage]
    )

    const completePendingLayoutLeave = useCallback(() => {
      setIsEditorDirty(false)
      const proceed = pendingLayoutLeaveRef.current
      pendingLayoutLeaveRef.current = null
      proceed?.()
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        requestLayoutLeave: (onProceed: () => void) => {
          if (!isEditorDirty) {
            onProceed()
            return
          }
          pendingLayoutLeaveRef.current = onProceed
          setShowLayoutLeaveConfirm(true)
        },
      }),
      [isEditorDirty]
    )

    useEffect(() => {
      if (!embeddedPayload || embeddedPayload.mode !== 'git-conflict') return
      const syncKey = buildEmbeddedGitConflictPayloadSyncKey(embeddedPayload)
      if (syncKey === embeddedPayloadSyncKeyRef.current) return
      embeddedPayloadSyncKeyRef.current = syncKey
      applyPayload(embeddedPayload)
    }, [embeddedPayload, applyPayload])

    const resolvedCount = Math.max(0, sessionBaselineRef.current - files.length)
    const totalForProgress = sessionBaselineRef.current > 0 ? sessionBaselineRef.current : files.length
    const readyToContinue =
      files.length === 0 && conflictType !== undefined && (conflictType === 'rebase' || conflictType === 'cherry-pick')
    const showContinue = conflictType === 'rebase' || conflictType === 'cherry-pick'
    const activePath = activeFile?.filePath ?? loadContextRef.current?.filePath ?? ''

    if (!loadContextRef.current && isSessionLoading && files.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center h-full">
          <GlowLoader className="h-10 w-10" />
        </div>
      )
    }

    if (files.length === 0 && !isSessionLoading && !isLoadingFile) {
      return (
        <div className="flex flex-col h-full">
          <DiffConflictToolbar
            embedded={embedded}
            headerPortalTarget={embeddedToolbarHost}
            conflictType={conflictType}
            resolvedCount={resolvedCount}
            totalCount={totalForProgress}
            filePath=""
            files={[]}
            onSelectFile={() => {}}
            onRefresh={() => void handleRefreshAll()}
            isRefreshing={isTreeRefreshing}
            autoAdvance={autoAdvance}
            onToggleAutoAdvance={toggleAutoAdvance}
            onAbort={() => void handleAbort()}
            isAborting={isAborting}
            onContinue={() => void handleContinue()}
            isContinuing={isContinuing}
            showContinue={showContinue}
            readyToContinue={readyToContinue}
          />
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm p-4">
            {readyToContinue ? (
              <div className="flex flex-col items-center gap-3">
                <p>{t('git.conflict.readyToCommit')}</p>
                <button type="button" className="text-primary underline" onClick={() => void handleContinue()}>
                  {t('git.conflict.continue')}
                </button>
              </div>
            ) : (
              <p>{t('conflictResolver.noConflicts')}</p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col w-full h-full">
        <DiffConflictToolbar
          embedded={embedded}
          headerPortalTarget={embeddedToolbarHost}
          conflictType={conflictType}
          resolvedCount={resolvedCount}
          totalCount={totalForProgress}
          filePath={activePath}
          files={files}
          activeFile={activeFile}
          onSelectFile={navigateToFile}
          onPrevFile={handlePrevFile}
          onNextFile={handleNextFile}
          disableFileNav={isLoadingFile || Boolean(resolvingFile)}
          onRefresh={() => void handleRefreshAll()}
          isRefreshing={isTreeRefreshing}
          autoAdvance={autoAdvance}
          onToggleAutoAdvance={toggleAutoAdvance}
          onResolveOurs={() => void handleResolve('ours')}
          onResolveTheirs={() => void handleResolve('theirs')}
          onResolveBoth={() => void handleResolve('both')}
          isResolving={Boolean(resolvingFile)}
          onAbort={() => void handleAbort()}
          isAborting={isAborting}
          onContinue={() => void handleContinue()}
          isContinuing={isContinuing}
          showContinue={showContinue}
          readyToContinue={readyToContinue}
        />

        <div className="flex flex-1 min-h-0 h-full flex-col overflow-hidden">
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full"
            groupRef={panelGroupRef}
            defaultLayout={initialLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel
              id={DIFF_VIEWER_TREE_PANEL_ID}
              minSize={`${DIFF_VIEWER_TREE_PANEL_MIN_WIDTH}%`}
              maxSize={`${DIFF_VIEWER_TREE_PANEL_MAX_WIDTH}%`}
              className="h-full"
            >
              <div className="h-full pr-2 flex flex-col min-h-0 overflow-hidden">
                <DiffViewerFileTreePanel
                  files={files}
                  activeIndex={activeIndex}
                  splitStaging={false}
                  showStageActions={false}
                  disabled={Boolean(resolvingFile) || isSaving}
                  isRefreshing={isTreeRefreshing}
                  onSelectFile={navigateToFile}
                  onBulkAction={(action, indices) => void handleTreeBulkAction(action, indices)}
                  onRefresh={() => void handleRefreshAll()}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle className="bg-transparent" />

            <ResizablePanel id={DIFF_VIEWER_EDITOR_PANEL_ID} minSize="45%" className="h-full flex flex-col min-h-0">
              <DiffViewerConflictPane
                filePath={activePath}
                content={fileContent}
                isLoading={isLoadingFile}
                loadError={loadError}
                isSaving={isSaving}
                onSave={handleSave}
                onRetry={() => void loadActiveFile(activePath)}
                onDirtyChange={setIsEditorDirty}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <AlertDialog open={showLayoutLeaveConfirm} onOpenChange={setShowLayoutLeaveConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('dialog.diffViewer.closeConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('dialog.diffViewer.closeConfirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  pendingLayoutLeaveRef.current = null
                }}
              >
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowLayoutLeaveConfirm(false)
                  completePendingLayoutLeave()
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {t('dialog.diffViewer.discardAndClose')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }
)
