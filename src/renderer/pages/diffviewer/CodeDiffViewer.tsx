'use client'
import { DiffEditor, type DiffOnMount, useMonaco } from '@monaco-editor/react'
import { IPC } from 'main/constants'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useTheme } from 'next-themes'
import { forwardRef, type ReactNode, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FilesChangedPayload } from 'shared/filesChanged'
import { filesChangedTargetsRepo } from 'shared/filesChanged'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import toast from '@/components/ui-elements/Toast'
import { useAppMonacoThemeId, useSyncAppMonacoTheme } from '@/hooks/useAppMonacoTheme'
import { buildEmbeddedGitConflictPayloadSyncKey, buildEmbeddedGitStagingPayloadSyncKey } from '@/lib/diffViewer/openDiffViewer'
import { requestOpenEditor } from '@/lib/openEditor'
import logger from '@/services/logger'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { BinaryDiffPanel } from './BinaryDiffPanel'
import { DiffFooterBar } from './DiffFooterBar'
import { DiffToolbar } from './DiffToolbar'
import { DiffViewerCloseConfirm } from './DiffViewerCloseConfirm'
import { DiffViewerDiscardConfirm } from './DiffViewerDiscardConfirm'
import { type DiffViewerFileTreeBulkAction, DiffViewerFileTreePanel } from './DiffViewerFileTreePanel'
import { DiffViewerLoadState } from './DiffViewerLoadState'
import {
  type DiffViewerFilesRefreshResult,
  isGitEntryStaged,
  isGitEntryUnstaged,
  mergeGitFilesRefreshIntoContext,
  normalizeGitPath,
  pathsEqual,
  resolveAutoAdvanceTargetIndex,
  resolveDiffViewerRepoCwd,
  resolveDisplayedFileEntry,
  wrapFileNavIndex,
} from './diffViewerGitFiles'
import type { DiffViewerFileKind, DiffViewerLoadPayload, DiffViewerMode, ImageLoadContext } from './diffViewerPayload'
import { deriveDiffViewerMode, diffViewerIsGitConflictMode, diffViewerSupportsFileListRefresh, diffViewerSupportsStageActions, enrichDiffViewerPayload } from './diffViewerPayload'
import { loadGitStagingDiffContent, resolveStagingDiffProfile, resolveStagingPaneLabels } from './diffViewerStagingDiff'
import type { CharDiffStats, DiffStats } from './diffViewerTypes'
import {
  clampEditorPosition,
  computeCharDiffStats,
  computeDiffStats,
  formatDiffEditor,
  getChangePosition,
  getCharChangeCount,
  getCurrentLineChange,
  goToAdjacentChange,
  goToFirstChange,
  goToLastChange,
  readDiffEditorPaneText,
  removeEmptyLinesFromDiffEditor,
  resetDiffEditorCursors,
  collapseAllDiffUnchangedRegions,
  resolveDiffViewerRevealPath,
  stabilizeDiffEditorAfterEdit,
  swapDiffEditorModels,
  syncDiffEditorModelLanguage,
  triggerFindReplaceWidget,
  triggerFindWidget,
  waitForDiffCompute,
} from './diffViewerUtils'
import { GitConflictDiffView } from './GitConflictDiffView'
import { useDiffViewerAutoAdvance } from './useDiffViewerAutoAdvance'
import { useDiffViewerBlame } from './useDiffViewerBlame'
import { useDiffViewerDirty } from './useDiffViewerDirty'
import { useDiffViewerFileNav } from './useDiffViewerFileNav'
import { useDiffViewerMinimapHighlights } from './useDiffViewerMinimapHighlights'
import { applyDiffViewerEditorOptions, buildDiffEditorOptions, isDiffCollapseActive, useDiffViewerOptions } from './useDiffViewerOptions'
import { useDiffViewerPaneLabels } from './useDiffViewerPaneLabels'
import {
  DIFF_VIEWER_EDITOR_PANEL_ID,
  DIFF_VIEWER_TREE_PANEL_ID,
  DIFF_VIEWER_TREE_PANEL_MAX_WIDTH,
  DIFF_VIEWER_TREE_PANEL_MIN_WIDTH,
  useDiffViewerTreePanelWidth,
} from './useDiffViewerTreePanelWidth'

export type CodeDiffViewerHandle = {
  /** Run after user saves/discards or when there are no unsaved edits. */
  requestLayoutLeave: (onProceed: () => void) => void
}

export type CodeDiffViewerProps = {
  /** Render inside MainPage git staging area instead of a dedicated window. */
  embedded?: boolean
  /** Repo root when embedded (multi-repo); prevents falling back to global sourceFolder. */
  embeddedRepoCwd?: string
  /** Parent-driven payload when `embedded` (git staging vertical layout). */
  embeddedPayload?: DiffViewerLoadPayload | null
  /** Host element for toolbar controls (Git Staging title row). */
  embeddedToolbarHost?: HTMLElement | null
  /** Commit message panel below Staged in tree (MainPage diff layout only). */
  embeddedStagingFooter?: ReactNode
  /** Reload git staging file list from parent (embedded MainPage diff layout). */
  embeddedOnReloadFileList?: () => void | Promise<void>
  /** Open local hide patterns dialog (embedded MainPage diff layout). */
  embeddedOnOpenLocalIgnorePatterns?: () => void
}

const EXT_TO_LANG: Record<string, string> = {
  abap: 'abap',
  apex: 'apex',
  azcli: 'azcli',
  bat: 'bat',
  cmd: 'bat',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  csharp: 'csharp',
  cs: 'csharp',
  css: 'css',
  dart: 'dart',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  fsharp: 'fsharp',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  go: 'go',
  graphql: 'graphql',
  gql: 'graphql',
  handlebars: 'handlebars',
  hbs: 'handlebars',
  html: 'html',
  htm: 'html',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  kotlin: 'kotlin',
  kt: 'kotlin',
  less: 'less',
  lua: 'lua',
  markdown: 'markdown',
  md: 'markdown',
  mysql: 'mysql',
  'objective-c': 'objective-c',
  m: 'objective-c',
  perl: 'perl',
  pl: 'perl',
  pgsql: 'pgsql',
  php: 'php',
  plaintext: 'plaintext',
  txt: 'plaintext',
  powershell: 'powershell',
  ps1: 'powershell',
  python: 'python',
  py: 'python',
  r: 'r',
  ruby: 'ruby',
  rb: 'ruby',
  rust: 'rust',
  rs: 'rust',
  scss: 'scss',
  shell: 'shell',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  swift: 'swift',
  vb: 'vb',
  xml: 'xml',
  xsd: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
}

function isLikelyGitUnmergedWorkingTree(fileStatus: string): boolean {
  const s = (fileStatus || '').trim()
  if (!s) return false
  if (s.toLowerCase() === 'conflicted') return true
  return /^(UU|DD|AA|AU|UA|UD|DU|DA|AD)$/i.test(s)
}

function isGitDeletedFromWorkingTree(fileStatus: string): boolean {
  const s = (fileStatus || '').trim().toLowerCase()
  return s === 'deleted' || s === 'd'
}

async function readGitWorkingTreeForDiff(filePath: string, fileStatus: string, catOpts?: { cwd?: string }): Promise<string> {
  if (isLikelyGitUnmergedWorkingTree(fileStatus)) {
    const r = await window.api.git.read_conflict_working_content(filePath, catOpts?.cwd)
    if (r.status === 'success' && typeof r.data === 'string') return r.data
    throw new Error(r.message || 'read_conflict_working_content failed')
  }
  if (isGitDeletedFromWorkingTree(fileStatus)) {
    return ''
  }
  try {
    return await window.api.system.read_file(filePath, catOpts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const looksMissing = msg.includes('ENOENT') || /no such file|cannot find|not found|The system cannot find the file/i.test(msg)
    if (looksMissing) {
      return ''
    }
    throw err
  }
}

function getExtension(filePath: string): string {
  const fileName = filePath.split('/').pop() || ''
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex === -1) return ''
  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

function detectLanguage(filePath: string): string {
  const ext = getExtension(filePath)
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export const CodeDiffViewer = forwardRef<CodeDiffViewerHandle, CodeDiffViewerProps>(function CodeDiffViewer(
  { embedded = false, embeddedRepoCwd, embeddedPayload = null, embeddedToolbarHost = null, embeddedStagingFooter = null, embeddedOnReloadFileList, embeddedOnOpenLocalIgnorePatterns },
  ref
) {
  const monaco = useMonaco()
  const monacoTheme = useAppMonacoThemeId()
  useSyncAppMonacoTheme(monaco, { includeDiff: true, includeEditorRules: false })
  const { themeMode } = useAppearanceStore()
  const { resolvedTheme } = useTheme()
  const minimapThemeMode = useMemo((): 'light' | 'dark' => {
    if (themeMode === 'dark' || themeMode === 'light') return themeMode
    return resolvedTheme === 'dark' ? 'dark' : 'light'
  }, [themeMode, resolvedTheme])
  const { t } = useTranslation()
  const [originalCode, setOriginalCode] = useState('')
  const [modifiedCode, setModifiedCode] = useState('')
  const [filePath, setFilePath] = useState('')
  const [revision, setRevision] = useState<string | undefined>(undefined)
  const [currentRevision, setCurrentRevision] = useState<string | undefined>(undefined)
  const [isGit, setIsGit] = useState(false)
  const [commitHash, setCommitHash] = useState<string | undefined>(undefined)
  const [currentCommitHash, setCurrentCommitHash] = useState<string | undefined>(undefined)
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const sourceFolder = useConfigurationStore(s => s.sourceFolder)
  const getRepoCwd = useCallback(
    (payloadCwd?: string) => resolveDiffViewerRepoCwd(payloadCwd ?? loadContextRef.current?.cwd, cwd ?? embeddedRepoCwd, embedded ? undefined : sourceFolder),
    [cwd, embeddedRepoCwd, sourceFolder, embedded]
  )
  const notifyStagingChanged = useCallback(() => {
    const repoCwd = getRepoCwd()
    window.api.electron.send(IPC.WINDOW.NOTIFY_STAGING_CHANGED, repoCwd ? { cwd: repoCwd } : undefined)
  }, [getRepoCwd])
  const [diffViewerMode, setDiffViewerMode] = useState<DiffViewerMode>('git-working')
  const [gitConflictPayload, setGitConflictPayload] = useState<DiffViewerLoadPayload | null>(null)
  const [isSwapped, setIsSwapped] = useState(false)
  const [language, setLanguage] = useState('javascript')
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [isTreeRefreshing, setIsTreeRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isStaging, setIsStaging] = useState(false)
  const [isReverting, setIsReverting] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [isRemovingEmptyLines, setIsRemovingEmptyLines] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [discardConfirmPaths, setDiscardConfirmPaths] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fileKind, setFileKind] = useState<DiffViewerFileKind>('text')
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null)
  const [modifiedDataUrl, setModifiedDataUrl] = useState<string | null>(null)
  const [fileTooLarge, setFileTooLarge] = useState(false)
  const [changePosition, setChangePosition] = useState({ current: 0, total: 0 })
  const [diffStats, setDiffStats] = useState<DiffStats>({ additions: 0, deletions: 0 })
  const [charDiffStats, setCharDiffStats] = useState<CharDiffStats>({ charAdditions: 0, charDeletions: 0 })
  const [charChangeRegions, setCharChangeRegions] = useState(0)
  const [contentEpoch, setContentEpoch] = useState(0)
  const [editorMountEpoch, setEditorMountEpoch] = useState(0)
  const [pendingNavIndex, setPendingNavIndex] = useState<number | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  const editorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const originalEditableRef = useRef(false)
  const loadContextRef = useRef<DiffViewerLoadPayload | null>(null)
  const pendingCloseRef = useRef(false)
  const pendingLayoutLeaveRef = useRef<(() => void) | null>(null)
  const loadGenerationRef = useRef(0)
  const autoFocusFirstChangeKeyRef = useRef('')
  const isGitActionInProgressRef = useRef(false)
  const isLoadingRef = useRef(false)
  const filePathRef = useRef(filePath)
  const fileKindRef = useRef(fileKind)
  const modifiedCodeRef = useRef(modifiedCode)

  const { viewOptions, setViewOption } = useDiffViewerOptions()
  const { autoAdvance, toggleAutoAdvance } = useDiffViewerAutoAdvance()
  const { panelGroupRef, initialLayout, handleLayoutChanged } = useDiffViewerTreePanelWidth()

  const notifyContentChangeRef = useRef<((event: { isFlush?: boolean }) => void) | null>(null)
  const { files, activeIndex, activeFile, initFiles, goToFile, refreshFilesFromGit, refreshFromContext, hasMultipleFiles, setActiveEntryStagingState } = useDiffViewerFileNav()

  const displayedFileEntry = useMemo(() => {
    if (activeFile && pathsEqual(activeFile.filePath, filePath)) {
      return activeFile
    }
    return resolveDisplayedFileEntry(files, filePath, {
      fileStatus: loadContextRef.current?.fileStatus,
      stagingState: loadContextRef.current?.stagingState,
    })
  }, [files, filePath, activeFile])

  const stagingHintForRefresh = activeFile && pathsEqual(activeFile.filePath, filePath) ? activeFile.stagingState : undefined

  const stagingDiffProfile = useMemo(() => {
    if (diffViewerMode !== 'git-staging') return null
    const state = stagingHintForRefresh ?? displayedFileEntry?.stagingState
    if (state !== 'staged' && state !== 'unstaged') return null
    return resolveStagingDiffProfile(state)
  }, [diffViewerMode, stagingHintForRefresh, displayedFileEntry?.stagingState])

  const hasStagedEntryForPath = useMemo(() => Boolean(filePath) && files.some(f => pathsEqual(f.filePath, filePath) && isGitEntryStaged(f)), [files, filePath])

  const stagingPaneLabels = useMemo(() => {
    if (diffViewerMode !== 'git-staging') return null
    const state = stagingHintForRefresh ?? displayedFileEntry?.stagingState
    if (state !== 'staged' && state !== 'unstaged') return null
    return resolveStagingPaneLabels(state, {
      hasStagedEntryForPath,
      fileStatus: displayedFileEntry?.fileStatus,
    })
  }, [diffViewerMode, stagingHintForRefresh, displayedFileEntry?.stagingState, displayedFileEntry?.fileStatus, hasStagedEntryForPath])

  const baseVcsEditable = currentRevision == null && currentCommitHash == null
  const editable = baseVcsEditable && (stagingDiffProfile?.modifiedEditable ?? true)
  const editorViewOptions = useMemo(
    () => (stagingDiffProfile ? { ...viewOptions, originalEditable: stagingDiffProfile.originalEditable && viewOptions.originalEditable } : viewOptions),
    [viewOptions, stagingDiffProfile]
  )

  const editorOptions = useMemo(() => buildDiffEditorOptions(editorViewOptions, { readOnly: !editable }), [editorViewOptions, editable])

  /** Remount diff editor per loaded file when collapse is on — updateOptions alone is ignored after content changes (monaco-react #548). */
  const diffEditorRemountKey = useMemo(
    () => (isDiffCollapseActive(editorViewOptions) ? `collapse-${contentEpoch}` : 'diff-editor'),
    [editorViewOptions, contentEpoch]
  )

  const { isDirty, setBaseline, notifyContentChange, beginProgrammaticUpdate, endProgrammaticUpdate } = useDiffViewerDirty(editable)
  notifyContentChangeRef.current = notifyContentChange

  const stagingHintRef = useRef(stagingHintForRefresh)
  stagingHintRef.current = stagingHintForRefresh
  const editorViewOptionsRef = useRef(editorViewOptions)
  editorViewOptionsRef.current = editorViewOptions
  const editableRef = useRef(editable)
  editableRef.current = editable

  useEffect(() => {
    originalEditableRef.current = editorViewOptions.originalEditable
  }, [editorViewOptions.originalEditable])

  const blameRevision = useMemo(() => {
    if (!isGit) return undefined
    const ctx = loadContextRef.current
    if (currentCommitHash && commitHash) {
      return commitHash
    }
    if (ctx?.isRootCommit && commitHash) {
      return commitHash
    }
    return undefined
  }, [isGit, commitHash, currentCommitHash, contentEpoch])

  useDiffViewerBlame({
    enabled: viewOptions.showBlame,
    isGit,
    fileKind,
    filePath,
    cwd,
    revision: blameRevision,
    isLoading,
    editorRef,
    editorMountEpoch,
    contentEpoch,
    lineDecorationsWidth: viewOptions.lineDecorationsWidth,
  })

  useDiffViewerMinimapHighlights({
    enabled: viewOptions.minimap,
    fileKind,
    themeMode: minimapThemeMode,
    editorRef,
    editorMountEpoch,
    contentEpoch,
  })

  const refreshDiffState = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    clampEditorPosition(diffEditor.getModifiedEditor())
    clampEditorPosition(diffEditor.getOriginalEditor())
    const changes = diffEditor.getLineChanges() ?? []
    setChangePosition(getChangePosition(diffEditor, changes))
    setDiffStats(computeDiffStats(changes))
    setCharDiffStats(computeCharDiffStats(changes))
    setCharChangeRegions(getCharChangeCount(changes))
  }, [])

  const refreshDiffStateAfterCompute = useCallback(async () => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    await waitForDiffCompute(diffEditor)
    refreshDiffState()
  }, [refreshDiffState])

  useEffect(() => {
    if (fileKind !== 'text') return

    const focusKey = `${contentEpoch}:${editorMountEpoch}`
    const skipAutoFocus = autoFocusFirstChangeKeyRef.current === focusKey

    const diffEditor = editorRef.current
    if (!diffEditor) return

    const generation = loadGenerationRef.current
    let cancelled = false

    const runAfterLayout = (fn: () => void) => {
      requestAnimationFrame(() => {
        if (cancelled || generation !== loadGenerationRef.current) return
        requestAnimationFrame(() => {
          if (cancelled || generation !== loadGenerationRef.current) return
          try {
            fn()
          } catch {
            // Monaco may throw while hide-unchanged view zones are mounting.
          }
        })
      })
    }

    const viewOpts = editorViewOptionsRef.current
    const collapseActive = viewOpts.collapseUnchangedRegions || viewOpts.diffOnly

    void (async () => {
      await waitForDiffCompute(diffEditor)
      if (cancelled || generation !== loadGenerationRef.current) return

      if (!skipAutoFocus && !collapseActive) {
        const changes = diffEditor.getLineChanges() ?? []
        autoFocusFirstChangeKeyRef.current = focusKey
        if (changes.length > 0) {
          try {
            goToFirstChange(diffEditor, { focus: false })
          } catch {
            // model mid-update
          }
        }
      }

      runAfterLayout(() => {
        diffEditor.layout()

        if (!skipAutoFocus && collapseActive) {
          const changes = diffEditor.getLineChanges() ?? []
          autoFocusFirstChangeKeyRef.current = focusKey
          if (changes.length > 0) {
            goToFirstChange(diffEditor, { focus: false })
          }
        }

        refreshDiffState()
      })
    })()

    return () => {
      cancelled = true
    }
  }, [contentEpoch, editorMountEpoch, fileKind, refreshDiffState])

  const loadImageDataUrl = useCallback(
    async (path: string, source?: { gitRevision?: string; svnRevision?: string; svnFileStatus?: string }): Promise<string | null> => {
      const opts = {
        ...(cwd ? { cwd } : {}),
        ...(source?.gitRevision ? { gitRevision: source.gitRevision } : {}),
        ...(source && 'svnRevision' in source ? { svnRevision: source.svnRevision, svnFileStatus: source.svnFileStatus ?? '' } : {}),
      }
      const result = await window.api.system.read_file_data_url(path, opts)
      if (result.success) return result.dataUrl
      if (result.error === 'FILE_TOO_LARGE') setFileTooLarge(true)
      return null
    },
    [cwd]
  )

  const loadImageSides = useCallback(
    async (path: string, fileStatus: string, ctx: ImageLoadContext) => {
      setFileTooLarge(false)
      setOriginalDataUrl(null)
      setModifiedDataUrl(null)

      if (ctx.isGit) {
        if (ctx.isRootCommit && ctx.commitHash) {
          setModifiedDataUrl(await loadImageDataUrl(path, { gitRevision: ctx.commitHash }))
          return
        }
        if (ctx.currentCommitHash && ctx.commitHash) {
          setOriginalDataUrl(await loadImageDataUrl(path, { gitRevision: ctx.currentCommitHash }))
          setModifiedDataUrl(await loadImageDataUrl(path, { gitRevision: ctx.commitHash }))
          return
        }
        if (ctx.commitHash) {
          setOriginalDataUrl(await loadImageDataUrl(path, { gitRevision: ctx.commitHash }))
          setModifiedDataUrl(await loadImageDataUrl(path))
          return
        }
        setOriginalDataUrl(await loadImageDataUrl(path, { gitRevision: 'HEAD' }))
        setModifiedDataUrl(await loadImageDataUrl(path))
        return
      }

      const { revision: rev, currentRevision: curRev } = ctx
      const svnAt = (revision?: string) => loadImageDataUrl(path, { svnRevision: revision ?? '', svnFileStatus: fileStatus })

      if (!curRev) {
        setOriginalDataUrl(await svnAt(rev))
        setModifiedDataUrl(await loadImageDataUrl(path))
        return
      }

      const swap = rev !== undefined && Number(curRev) < Number(rev)
      const prevRev = rev && Number(rev) > 1 ? String(Number(rev) - 1) : undefined
      const atRev = await svnAt(rev)
      const atPrevRev = prevRev ? await svnAt(prevRev) : null

      if (swap) {
        setOriginalDataUrl(atRev)
        setModifiedDataUrl(atPrevRev)
      } else {
        setOriginalDataUrl(atPrevRev)
        setModifiedDataUrl(atRev)
      }
    },
    [loadImageDataUrl]
  )

  const applyLoadedTextContent = useCallback(
    (nextOriginal: string, nextModified: string) => {
      beginProgrammaticUpdate()
      resetDiffEditorCursors(editorRef.current)
      const diffEditor = editorRef.current
      if (diffEditor) {
        const originalModel = diffEditor.getOriginalEditor().getModel()
        const modifiedModel = diffEditor.getModifiedEditor().getModel()
        if (originalModel && originalModel.getValue() !== nextOriginal) {
          originalModel.setValue(nextOriginal)
        }
        if (modifiedModel && modifiedModel.getValue() !== nextModified) {
          modifiedModel.setValue(nextModified)
        }
      }
      setCursorPosition({ line: 1, column: 1 })
      setOriginalCode(nextOriginal)
      setModifiedCode(nextModified)
      setBaseline(nextModified)
      setContentEpoch(e => e + 1)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          endProgrammaticUpdate()
        })
      })
    },
    [beginProgrammaticUpdate, endProgrammaticUpdate, setBaseline]
  )

  const handleRefresh = useCallback(
    async (path: string, status: string, rev?: string, curRev?: string, cwdOverride?: string) => {
      const generation = ++loadGenerationRef.current
      const isStale = () => generation !== loadGenerationRef.current

      try {
        setLoadError(null)
        const switchingTextFile = fileKindRef.current === 'text' && Boolean(filePathRef.current)
        if (!switchingTextFile) {
          setIsLoading(true)
        }
        const catOpts = cwdOverride ? { cwd: cwdOverride } : undefined
        const kindResult = await window.api.system.detect_file_kind(path, catOpts)
        if (isStale()) return
        const kind = kindResult?.kind ?? 'text'
        setFileKind(kind)

        if (kind === 'binary') {
          setOriginalDataUrl(null)
          setModifiedDataUrl(null)
          setFileTooLarge(false)
          setOriginalCode('')
          setModifiedCode('')
          setBaseline('')
          return
        }

        if (kind === 'image') {
          await loadImageSides(path, status, {
            isGit: false,
            revision: rev,
            currentRevision: curRev,
          })
          if (isStale()) return
          setOriginalCode('')
          setModifiedCode('')
          setBaseline('')
          return
        }

        const swap = curRev !== undefined && rev !== undefined && Number(curRev) < Number(rev)
        const originalResult = await window.api.svn.cat(path, status, rev, catOpts)
        const modifiedResult = curRev
          ? Number(rev) > 1
            ? await window.api.svn.cat(path, status, String(Number(rev) - 1), catOpts)
            : { status: 'success' as const, data: '' }
          : await window.api.system.read_file(path, catOpts)
        if (isStale()) return

        let nextOriginal = ''
        let nextModified = ''

        if (!curRev) {
          nextOriginal = originalResult.data
          nextModified = typeof modifiedResult === 'string' ? modifiedResult : modifiedResult.data
        } else if (swap) {
          nextOriginal = originalResult.data
          nextModified = modifiedResult.data
        } else {
          nextOriginal = modifiedResult.data
          nextModified = originalResult.data
        }

        applyLoadedTextContent(nextOriginal, nextModified)
      } catch (error) {
        if (isStale()) return
        const message = formatLoadError(error)
        setLoadError(message)
        logger.error('Error loading file for diff:', error)
      } finally {
        if (generation === loadGenerationRef.current) {
          setIsLoading(false)
        }
      }
    },
    [applyLoadedTextContent, loadImageSides, setBaseline]
  )

  const handleRefreshGit = useCallback(
    async (path: string, status: string, hash?: string, curHash?: string, rootCommit?: boolean, cwdOverride?: string, stagingState?: 'staged' | 'unstaged') => {
      const generation = ++loadGenerationRef.current
      const isStale = () => generation !== loadGenerationRef.current

      try {
        setLoadError(null)
        const switchingTextFile = fileKindRef.current === 'text' && Boolean(filePathRef.current)
        if (!switchingTextFile) {
          setIsLoading(true)
        }
        const catOpts = cwdOverride ? { cwd: cwdOverride } : undefined
        const kindResult = await window.api.system.detect_file_kind(path, catOpts)
        if (isStale()) return
        const kind = kindResult?.kind ?? 'text'
        setFileKind(kind)

        if (kind === 'binary') {
          setOriginalDataUrl(null)
          setModifiedDataUrl(null)
          setFileTooLarge(false)
          setOriginalCode('')
          setModifiedCode('')
          setBaseline('')
          return
        }

        if (kind === 'image') {
          await loadImageSides(path, status, {
            isGit: true,
            isRootCommit: rootCommit,
            commitHash: hash,
            currentCommitHash: curHash,
          })
          if (isStale()) return
          setOriginalCode('')
          setModifiedCode('')
          setBaseline('')
          return
        }

        let nextOriginal = ''
        let nextModified = ''

        if (rootCommit && hash) {
          const modifiedResult = await window.api.git.cat(path, status, hash, catOpts)
          if (isStale()) return
          nextOriginal = ''
          nextModified = modifiedResult.data || ''
        } else if (curHash) {
          const originalResult = await window.api.git.cat(path, status, curHash, catOpts)
          if (isStale()) return
          const modifiedResult = await window.api.git.cat(path, status, hash, catOpts)
          if (isStale()) return
          nextOriginal = originalResult.data || ''
          nextModified = modifiedResult.data || ''
        } else if (hash) {
          const originalResult = await window.api.git.cat(path, status, hash, catOpts)
          if (isStale()) return
          nextOriginal = originalResult.data || ''
          nextModified = await readGitWorkingTreeForDiff(path, status, catOpts)
          if (isStale()) return
        } else if (!hash && !curHash && stagingState) {
          const sides = await loadGitStagingDiffContent(path, status, stagingState, catOpts)
          if (isStale()) return
          nextOriginal = sides.original
          nextModified = sides.modified
        } else {
          const originalResult = await window.api.git.cat(path, status, 'HEAD', catOpts)
          if (isStale()) return
          nextOriginal = originalResult.data || ''
          nextModified = await readGitWorkingTreeForDiff(path, status, catOpts)
          if (isStale()) return
        }

        applyLoadedTextContent(nextOriginal, nextModified)
      } catch (error) {
        if (isStale()) return
        const message = formatLoadError(error)
        setLoadError(message)
        logger.error('Error loading file for Git diff:', error)
      } finally {
        if (generation === loadGenerationRef.current) {
          setIsLoading(false)
        }
      }
    },
    [applyLoadedTextContent, loadImageSides, setBaseline]
  )

  const handleRefreshWorkspaceCompare = useCallback(
    async (leftPath: string, rightPath: string, cwdOverride?: string) => {
      const generation = ++loadGenerationRef.current
      const isStale = () => generation !== loadGenerationRef.current
      try {
        setLoadError(null)
        setIsLoading(true)
        const catOpts = cwdOverride ? { cwd: cwdOverride } : undefined
        const [leftContent, rightContent] = await Promise.all([window.api.system.read_file(leftPath, catOpts), window.api.system.read_file(rightPath, catOpts)])
        if (isStale()) return
        setFileKind('text')
        applyLoadedTextContent(leftContent, rightContent)
      } catch (error) {
        if (isStale()) return
        setLoadError(formatLoadError(error))
        logger.error('Error loading workspace compare:', error)
      } finally {
        if (generation === loadGenerationRef.current) setIsLoading(false)
      }
    },
    [applyLoadedTextContent]
  )

  const runLoad = useCallback(
    (ctx: DiffViewerLoadPayload) => {
      const enriched = enrichDiffViewerPayload({
        ...ctx,
        filePath: ctx.filePath ? normalizeGitPath(ctx.filePath) : ctx.filePath,
        cwd: getRepoCwd(ctx.cwd),
        isGit: ctx.isGit ?? isGit,
        files: ctx.files?.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) })),
      })
      loadContextRef.current = enriched
      const path = enriched.filePath ?? ''
      if (!path) return
      setIsSwapped(false)
      const mode = deriveDiffViewerMode(enriched)
      if (mode === 'workspace-compare' && enriched.compareWithPath) {
        void handleRefreshWorkspaceCompare(path, normalizeGitPath(enriched.compareWithPath), enriched.cwd)
        return
      }
      if (enriched.isGit) {
        void handleRefreshGit(
          path,
          enriched.fileStatus ?? '',
          enriched.commitHash,
          enriched.currentCommitHash,
          enriched.isRootCommit,
          enriched.cwd,
          mode === 'git-staging' ? enriched.stagingState : undefined
        )
      } else {
        void handleRefresh(path, enriched.fileStatus ?? '', enriched.revision, enriched.currentRevision, enriched.cwd)
      }
    },
    [handleRefresh, handleRefreshGit, handleRefreshWorkspaceCompare, getRepoCwd, isGit]
  )

  const applyPayload = useCallback(
    (data: DiffViewerLoadPayload) => {
      const enriched = enrichDiffViewerPayload(data)
      const mode = deriveDiffViewerMode(enriched)
      if (diffViewerIsGitConflictMode(mode)) {
        setGitConflictPayload({
          ...enriched,
          filePath: enriched.filePath ? normalizeGitPath(enriched.filePath) : enriched.filePath,
          files: enriched.files?.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) })),
          cwd: getRepoCwd(enriched.cwd),
        })
        setDiffViewerMode(mode)
        return
      }
      setGitConflictPayload(null)
      const path = enriched.filePath ? normalizeGitPath(enriched.filePath) : ''
      const normalizedFiles = enriched.files?.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) }))
      const resolvedCwd = getRepoCwd(enriched.cwd)
      setFilePath(path)
      setRevision(enriched.revision)
      setCurrentRevision(enriched.currentRevision)
      setIsGit(enriched.isGit || false)
      setCommitHash(enriched.commitHash)
      setCurrentCommitHash(enriched.currentCommitHash)
      setCwd(resolvedCwd)
      setDiffViewerMode(mode)
      initFiles(normalizedFiles, enriched.currentFileIndex)
      setLanguage(detectLanguage(path))
      setLoadError(null)

      const activeEntry = normalizedFiles?.[Math.max(0, enriched.currentFileIndex ?? 0)]

      if (!path) return
      runLoad({
        ...enriched,
        filePath: path,
        files: normalizedFiles,
        cwd: resolvedCwd,
        stagingState: activeEntry?.stagingState,
      })
    },
    [getRepoCwd, initFiles, runLoad]
  )

  const onRefresh = useCallback(async () => {
    const ctx = loadContextRef.current
    if (!ctx?.filePath) return

    const mode = deriveDiffViewerMode(ctx)
    if (diffViewerSupportsFileListRefresh(mode)) {
      const outcome = await refreshFromContext(ctx, stagingHintForRefresh)
      if (outcome) {
        const { refreshed, nextCtx } = outcome
        loadContextRef.current = nextCtx

        if (refreshed.currentInList && refreshed.activeFile && !pathsEqual(refreshed.activeFile.filePath, filePath)) {
          setFilePath(normalizeGitPath(refreshed.activeFile.filePath))
          setLanguage(detectLanguage(refreshed.activeFile.filePath))
        }

        if (nextCtx.currentCommitHash !== ctx.currentCommitHash) {
          setCurrentCommitHash(nextCtx.currentCommitHash)
        }

        setIsSwapped(false)
        runLoad(refreshed.currentInList ? nextCtx : { ...nextCtx, filePath: ctx.filePath, fileStatus: ctx.fileStatus, stagingState: ctx.stagingState })
        return
      }
    }

    setIsSwapped(false)
    runLoad(ctx)
  }, [runLoad, refreshFromContext, stagingHintForRefresh, filePath])

  const handleTreeRefresh = useCallback(() => {
    if (embedded && embeddedOnReloadFileList) {
      void embeddedOnReloadFileList()
      toast.info(t('toast.getListSuccess'))
      return
    }
    setIsTreeRefreshing(true)
    void onRefresh().finally(() => setIsTreeRefreshing(false))
  }, [embedded, embeddedOnReloadFileList, onRefresh, t])

  const navigateToFile = useCallback(
    (index: number) => {
      const entry = files[index]
      if (!entry) return
      const base = loadContextRef.current ?? {}
      const nextCtx = enrichDiffViewerPayload({
        ...base,
        filePath: entry.filePath,
        fileStatus: entry.fileStatus ?? '',
        stagingState: entry.stagingState,
        files,
        currentFileIndex: index,
      })
      loadContextRef.current = nextCtx
      setFilePath(entry.filePath)
      setLanguage(detectLanguage(entry.filePath))
      setIsSwapped(false)
      runLoad(nextCtx)
    },
    [files, runLoad]
  )

  const requestNavigateToFile = useCallback(
    (index: number) => {
      if (index === activeIndex) return
      if (isDirty) {
        setPendingNavIndex(index)
        setShowCloseConfirm(true)
        return
      }
      goToFile(index)
      navigateToFile(index)
    },
    [activeIndex, isDirty, goToFile, navigateToFile]
  )

  const handlePrevFile = useCallback(() => {
    if (files.length <= 1) return
    const nextIndex = wrapFileNavIndex(activeIndex, -1, files.length)
    if (nextIndex != null) requestNavigateToFile(nextIndex)
  }, [activeIndex, files.length, requestNavigateToFile])

  const handleNextFile = useCallback(() => {
    if (files.length <= 1) return
    const nextIndex = wrapFileNavIndex(activeIndex, 1, files.length)
    if (nextIndex != null) requestNavigateToFile(nextIndex)
  }, [activeIndex, files.length, requestNavigateToFile])

  const embeddedPayloadSyncKeyRef = useRef('')

  const clearEmbeddedViewerState = useCallback(() => {
    embeddedPayloadSyncKeyRef.current = ''
    autoFocusFirstChangeKeyRef.current = ''
    loadContextRef.current = null
    loadGenerationRef.current += 1
    setFilePath('')
    setOriginalCode('')
    setModifiedCode('')
    setBaseline('')
    setLoadError(null)
    setFileKind('text')
    setOriginalDataUrl(null)
    setModifiedDataUrl(null)
    setIsSwapped(false)
    initFiles([], 0)
    setContentEpoch(e => e + 1)
  }, [initFiles, setBaseline])

  const requestLayoutLeave = useCallback(
    (onProceed: () => void) => {
      if (!isDirty) {
        onProceed()
        return
      }
      pendingLayoutLeaveRef.current = onProceed
      setShowCloseConfirm(true)
    },
    [isDirty]
  )

  useImperativeHandle(ref, () => ({ requestLayoutLeave }), [requestLayoutLeave])

  const completePendingLeaveAction = useCallback(() => {
    if (pendingNavIndex != null) {
      const idx = pendingNavIndex
      setPendingNavIndex(null)
      goToFile(idx)
      navigateToFile(idx)
      return true
    }
    if (pendingLayoutLeaveRef.current) {
      const proceed = pendingLayoutLeaveRef.current
      pendingLayoutLeaveRef.current = null
      proceed()
      return true
    }
    if (pendingCloseRef.current) {
      pendingCloseRef.current = false
      if (!embedded) {
        window.api.electron.send('window:action', 'close')
      }
      return true
    }
    return false
  }, [embedded, pendingNavIndex, goToFile, navigateToFile])

  const handleCloseRequest = useCallback(() => {
    if (embedded) return
    if (isDirty) {
      pendingCloseRef.current = true
      setShowCloseConfirm(true)
      return
    }
    window.api.electron.send('window:action', 'close')
  }, [embedded, isDirty])

  const handleDiscardAndClose = useCallback(() => {
    setShowCloseConfirm(false)
    completePendingLeaveAction()
  }, [completePendingLeaveAction])

  useEffect(() => {
    modifiedCodeRef.current = modifiedCode
  }, [modifiedCode])
  useEffect(() => {
    filePathRef.current = filePath
  }, [filePath])
  useEffect(() => {
    fileKindRef.current = fileKind
  }, [fileKind])

  const handleSaveFile = useCallback(async () => {
    try {
      if (currentRevision || currentCommitHash) return false
      if (isLoadingRef.current) return false
      const path = filePathRef.current
      if (!path) return false
      setIsSaving(true)
      const writeOpts = cwd ? { cwd } : undefined
      const result = await window.api.system.write_file(path, modifiedCodeRef.current, writeOpts)
      if (result.success) {
        setBaseline()
        toast.success(t('toast.fileSaved', { filePath: path }))
        return true
      }
      throw new Error(result.error || 'Unknown error')
    } catch (_error) {
      toast.error(t('toast.errorSavingFile'))
      return false
    } finally {
      setIsSaving(false)
    }
  }, [currentRevision, currentCommitHash, cwd, setBaseline, t])

  const handleSaveAndClose = useCallback(async () => {
    const saved = await handleSaveFile()
    if (!saved) return
    setShowCloseConfirm(false)
    completePendingLeaveAction()
  }, [handleSaveFile, completePendingLeaveAction])

  const applyGitActionRefresh = useCallback(
    (
      advanceFromIndex: number,
      actedFilePath: string,
      refreshed: DiffViewerFilesRefreshResult | null,
      ctx: DiffViewerLoadPayload,
      options?: { stagingStateHint?: 'staged' | 'unstaged' }
    ) => {
      if (!refreshed) {
        setIsSwapped(false)
        runLoad(ctx)
        return
      }

      const nextCtx = mergeGitFilesRefreshIntoContext(ctx, refreshed)
      loadContextRef.current = nextCtx

      if (refreshed.files.length === 0) {
        setFilePath('')
        setIsSwapped(false)
        return
      }

      const targetIndex = autoAdvance ? resolveAutoAdvanceTargetIndex(advanceFromIndex, refreshed.files, actedFilePath) : refreshed.currentInList ? refreshed.activeIndex : null

      if (targetIndex != null && refreshed.files[targetIndex]) {
        const entry = refreshed.files[targetIndex]
        goToFile(targetIndex, refreshed.files.length)
        const navCtx = enrichDiffViewerPayload({
          ...nextCtx,
          filePath: entry.filePath,
          fileStatus: entry.fileStatus ?? ctx.fileStatus ?? '',
          files: refreshed.files,
          currentFileIndex: targetIndex,
        })
        loadContextRef.current = navCtx
        setFilePath(entry.filePath)
        setLanguage(detectLanguage(entry.filePath))
        setIsSwapped(false)
        runLoad(navCtx)
        return
      }

      if (refreshed.currentInList && refreshed.activeFile) {
        if (!pathsEqual(refreshed.activeFile.filePath, filePath)) {
          setFilePath(normalizeGitPath(refreshed.activeFile.filePath))
          setLanguage(detectLanguage(refreshed.activeFile.filePath))
        }
      }

      setIsSwapped(false)
      runLoad(
        refreshed.currentInList
          ? nextCtx
          : {
            ...nextCtx,
            filePath: ctx.filePath,
            fileStatus: refreshed.activeFile?.fileStatus ?? options?.stagingStateHint ?? ctx.fileStatus,
          }
      )
    },
    [autoAdvance, filePath, goToFile, runLoad]
  )

  const handleStageToggle = useCallback(async () => {
    if (!filePath || !diffViewerSupportsStageActions(diffViewerMode)) return
    const isStaged = stagingHintForRefresh === 'staged'
    const nextStagingState = isStaged ? 'unstaged' : 'staged'
    const advanceFromIndex = activeIndex
    const repoCwd = getRepoCwd()
    setIsStaging(true)
    isGitActionInProgressRef.current = true
    try {
      const opts = repoCwd ? { cwd: repoCwd } : undefined
      const result = isStaged ? await window.api.git.reset_staged([filePath], opts) : await window.api.git.add([filePath], opts)
      if (result.status === 'success') {
        setActiveEntryStagingState(activeIndex, filePath, nextStagingState)
        toast.success(isStaged ? t('dialog.diffViewer.unstageSuccess') : t('dialog.diffViewer.stageSuccess'))
        const lookupStagingState = isStaged ? 'staged' : nextStagingState
        const refreshed = repoCwd ? await refreshFilesFromGit(repoCwd, filePath, lookupStagingState) : null
        const ctx = loadContextRef.current
        if (!ctx) return
        applyGitActionRefresh(advanceFromIndex, filePath, refreshed, ctx, { stagingStateHint: nextStagingState })
        notifyStagingChanged()
      } else {
        toast.error(result.message || t('toast.gitAddError'))
      }
    } catch (error) {
      toast.error(formatLoadError(error))
    } finally {
      isGitActionInProgressRef.current = false
      setIsStaging(false)
    }
  }, [filePath, diffViewerMode, stagingHintForRefresh, activeIndex, getRepoCwd, t, setActiveEntryStagingState, refreshFilesFromGit, applyGitActionRefresh, notifyStagingChanged])

  const handleRevertRequest = useCallback(() => {
    if (!filePath || !diffViewerSupportsStageActions(diffViewerMode)) return
    if (stagingHintForRefresh === 'staged') return
    setDiscardConfirmPaths([filePath])
    setShowDiscardConfirm(true)
  }, [filePath, diffViewerMode, stagingHintForRefresh])

  const handleRevertConfirm = useCallback(async () => {
    const pathsToRevert = discardConfirmPaths.length > 0 ? discardConfirmPaths : filePath ? [filePath] : []
    if (pathsToRevert.length === 0 || !diffViewerSupportsStageActions(diffViewerMode)) return
    const advanceFromIndex = activeIndex
    const actedFilePath = filePath
    const repoCwd = getRepoCwd()
    setShowDiscardConfirm(false)
    setDiscardConfirmPaths([])
    setIsReverting(true)
    isGitActionInProgressRef.current = true
    try {
      const result = await window.api.git.discardChanges(pathsToRevert, repoCwd)
      if (result.status === 'success') {
        toast.success(t('toast.revertSuccess'))
        const refreshed = repoCwd ? await refreshFilesFromGit(repoCwd, actedFilePath, 'unstaged') : null
        const ctx = loadContextRef.current
        if (!ctx) return
        applyGitActionRefresh(advanceFromIndex, actedFilePath, refreshed, ctx)
        notifyStagingChanged()
      } else {
        toast.error(result.message || t('toast.revertError'))
      }
    } catch (error) {
      toast.error(formatLoadError(error))
    } finally {
      isGitActionInProgressRef.current = false
      setIsReverting(false)
    }
  }, [discardConfirmPaths, filePath, diffViewerMode, activeIndex, getRepoCwd, t, refreshFilesFromGit, applyGitActionRefresh, notifyStagingChanged])

  const refreshAfterTreeBulkGitAction = useCallback(
    async (actedFilePath: string, lookupStagingState?: 'staged' | 'unstaged', stagingStateHint?: 'staged' | 'unstaged') => {
      const repoCwd = getRepoCwd()
      if (!repoCwd) return
      const refreshed = await refreshFilesFromGit(repoCwd, actedFilePath, lookupStagingState)
      const ctx = loadContextRef.current
      if (!ctx) return
      applyGitActionRefresh(activeIndex, actedFilePath, refreshed, ctx, {
        stagingStateHint: stagingStateHint ?? lookupStagingState,
      })
      notifyStagingChanged()
    },
    [activeIndex, applyGitActionRefresh, getRepoCwd, refreshFilesFromGit, notifyStagingChanged]
  )

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
            .map(path => normalizeGitPath(path as string)) as string[]
        ),
      ]
      const actedFilePath = normalizeGitPath(files[uniqueIndices[0]]?.filePath ?? files[activeIndex]?.filePath ?? filePath ?? selectedPaths[0] ?? '')

      if (action === 'reveal') {
        for (const path of selectedPaths) {
          window.api.system.reveal_in_file_explorer(resolveDiffViewerRevealPath(path, cwd))
        }
        return
      }

      if (action === 'openInEditor') {
        const path = selectedPaths[0]
        if (!path) return
        requestOpenEditor({ filePath: path, cwd: getRepoCwd() })
        return
      }

      const ctx = loadContextRef.current
      const mode = ctx ? deriveDiffViewerMode(ctx) : diffViewerMode
      if (!diffViewerSupportsStageActions(mode)) return

      const repoCwd = getRepoCwd(ctx?.cwd)
      const gitCwdOpts = repoCwd ? { cwd: repoCwd } : undefined

      if (action === 'revert') {
        const unstagedPaths = [
          ...new Set(
            uniqueIndices
              .filter(index => isGitEntryUnstaged(files[index]))
              .map(index => files[index]?.filePath)
              .filter(Boolean)
              .map(path => normalizeGitPath(path as string)) as string[]
          ),
        ]
        if (unstagedPaths.length === 0) return
        setDiscardConfirmPaths(unstagedPaths)
        setShowDiscardConfirm(true)
        return
      }

      const unstagedPaths = [
        ...new Set(
          uniqueIndices
            .filter(index => isGitEntryUnstaged(files[index]))
            .map(index => files[index]?.filePath)
            .filter(Boolean)
            .map(path => normalizeGitPath(path as string)) as string[]
        ),
      ]
      const stagedPaths = [
        ...new Set(
          uniqueIndices
            .filter(index => isGitEntryStaged(files[index]))
            .map(index => files[index]?.filePath)
            .filter(Boolean)
            .map(path => normalizeGitPath(path as string)) as string[]
        ),
      ]

      if (action === 'stage' && unstagedPaths.length === 0) return
      if (action === 'unstage' && stagedPaths.length === 0) return

      isGitActionInProgressRef.current = true
      setIsStaging(true)
      try {
        if (action === 'stage') {
          const result = await window.api.git.add(unstagedPaths, gitCwdOpts)
          if (result.status === 'success') {
            toast.success(t('dialog.diffViewer.stageSuccess'))
            await refreshAfterTreeBulkGitAction(actedFilePath, 'staged', 'staged')
          } else {
            toast.error(result.message || t('toast.gitAddError'))
          }
          return
        }

        if (action === 'unstage') {
          const result = await window.api.git.reset_staged(stagedPaths, gitCwdOpts)
          if (result.status === 'success') {
            toast.success(t('dialog.diffViewer.unstageSuccess'))
            await refreshAfterTreeBulkGitAction(actedFilePath, 'unstaged', 'unstaged')
          } else {
            toast.error(result.message || t('toast.gitUnstageError'))
          }
        }
      } catch (error) {
        toast.error(formatLoadError(error))
      } finally {
        isGitActionInProgressRef.current = false
        setIsStaging(false)
      }
    },
    [files, activeIndex, filePath, getRepoCwd, diffViewerMode, t, refreshAfterTreeBulkGitAction]
  )

  useEffect(() => {
    if (embedded) return
    const repoCwd = getRepoCwd()
    if (diffViewerMode !== 'git-staging' || !repoCwd) return
    const handleFilesChanged = (_event: unknown, detail?: FilesChangedPayload) => {
      if (isGitActionInProgressRef.current) return
      const ctx = loadContextRef.current
      if (!ctx?.filePath) return
      const refreshCwd = getRepoCwd(ctx.cwd)
      if (!refreshCwd) return
      if (!filesChangedTargetsRepo(detail, refreshCwd)) return
      void refreshFromContext({ ...ctx, cwd: refreshCwd }, stagingHintRef.current).then(outcome => {
        if (!outcome || !loadContextRef.current) return
        loadContextRef.current = outcome.nextCtx
      })
    }
    window.api.on(IPC.FILES_CHANGED, handleFilesChanged)
    return () => window.api.removeListener(IPC.FILES_CHANGED, handleFilesChanged)
  }, [embedded, diffViewerMode, getRepoCwd, refreshFromContext])

  const handlePrevChange = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    goToAdjacentChange(diffEditor, 'prev')
    requestAnimationFrame(refreshDiffState)
  }, [refreshDiffState])

  const handleNextChange = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    goToAdjacentChange(diffEditor, 'next')
    requestAnimationFrame(refreshDiffState)
  }, [refreshDiffState])

  const handleFirstChange = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    goToFirstChange(diffEditor)
    requestAnimationFrame(refreshDiffState)
  }, [refreshDiffState])

  const handleLastChange = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    goToLastChange(diffEditor)
    requestAnimationFrame(refreshDiffState)
  }, [refreshDiffState])

  const handleFind = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    triggerFindWidget(diffEditor)
  }, [])

  const handleFindReplace = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    triggerFindReplaceWidget(diffEditor)
  }, [])

  const syncEditorTextFromModel = useCallback(
    (diffEditor: MonacoEditor.IStandaloneDiffEditor) => {
      const { original, modified } = readDiffEditorPaneText(diffEditor)
      setModifiedCode(modified)
      if (editable && editorViewOptions.originalEditable) {
        setOriginalCode(original)
      }
    },
    [editable, editorViewOptions.originalEditable]
  )

  const handleFormat = useCallback(async () => {
    const diffEditor = editorRef.current
    if (!diffEditor || !monaco || isLoadingRef.current || fileKind !== 'text') return
    const modifiedEditable = editable
    const originalEditable = editable && editorViewOptions.originalEditable
    if (!modifiedEditable && !originalEditable) return

    setIsFormatting(true)
    try {
      await waitForDiffCompute(diffEditor)
      const result = await formatDiffEditor(diffEditor, monaco, {
        modifiedEditable,
        originalEditable,
        languageId: language,
        filePath,
      })
      if (result === 'success') {
        syncEditorTextFromModel(diffEditor)
        await refreshDiffStateAfterCompute()
        return
      }
      if (result === 'unsupported') {
        toast.warning(t('dialog.diffViewer.formatUnsupported', { language }))
        return
      }
      toast.warning(t('dialog.diffViewer.formatReadonly'))
    } finally {
      setIsFormatting(false)
    }
  }, [monaco, editable, fileKind, language, filePath, syncEditorTextFromModel, refreshDiffStateAfterCompute, t, editorViewOptions.originalEditable])

  const handleRemoveEmptyLines = useCallback(async () => {
    const diffEditor = editorRef.current
    if (!diffEditor || isLoadingRef.current || fileKind !== 'text') return
    const modifiedEditable = editable
    const originalEditable = editable && editorViewOptions.originalEditable
    if (!modifiedEditable && !originalEditable) return

    setIsRemovingEmptyLines(true)
    try {
      await waitForDiffCompute(diffEditor)
      stabilizeDiffEditorAfterEdit(diffEditor)
      const result = removeEmptyLinesFromDiffEditor(diffEditor, { modifiedEditable, originalEditable })
      if (result === 'success') {
        syncEditorTextFromModel(diffEditor)
        await refreshDiffStateAfterCompute()
        return
      }
      if (result === 'unchanged') {
        toast.info(t('dialog.diffViewer.removeEmptyLinesNone'))
        return
      }
      if (result === 'failed') {
        toast.error(t('dialog.diffViewer.removeEmptyLinesFailed'))
        return
      }
      toast.warning(t('dialog.diffViewer.formatReadonly'))
    } finally {
      setIsRemovingEmptyLines(false)
    }
  }, [editable, fileKind, syncEditorTextFromModel, refreshDiffStateAfterCompute, t, editorViewOptions.originalEditable])

  const handleSwap = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor || !swapDiffEditorModels(diffEditor)) return
    setIsSwapped(prev => !prev)
    const nextOriginal = diffEditor.getOriginalEditor().getModel()?.getValue() ?? ''
    const nextModified = diffEditor.getModifiedEditor().getModel()?.getValue() ?? ''
    setOriginalCode(nextOriginal)
    setModifiedCode(nextModified)
    if (editable) setBaseline()
    requestAnimationFrame(refreshDiffState)
  }, [editable, refreshDiffState, setBaseline])

  const handleOpenInEditor = useCallback(() => {
    if (!filePath) return
    const diffEditor = editorRef.current
    const change = diffEditor ? getCurrentLineChange(diffEditor) : null
    const line =
      change && change.modifiedStartLineNumber > 0
        ? change.modifiedStartLineNumber
        : change && change.originalStartLineNumber > 0
          ? change.originalStartLineNumber
          : cursorPosition.line
    requestOpenEditor({ filePath, cwd: getRepoCwd(), line })
  }, [filePath, getRepoCwd, cursorPosition.line])

  const handleRevealInExplorer = useCallback(() => {
    if (!filePath) return
    window.api.system.reveal_in_file_explorer(resolveDiffViewerRevealPath(filePath, cwd))
  }, [filePath, cwd])

  const handleEditorMount: DiffOnMount = (editor, _monaco) => {
    editorRef.current = editor
    applyDiffViewerEditorOptions(editor, editorViewOptions, { readOnly: !editable })
    setEditorMountEpoch(e => e + 1)
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    editor.onDidUpdateDiff(() => {
      requestAnimationFrame(refreshDiffState)
    })

    modifiedEditor.onDidChangeModelContent(event => {
      const newModifiedCode = modifiedEditor.getModel()?.getValue() || ''
      setModifiedCode(newModifiedCode)
      notifyContentChangeRef.current?.(event)
      requestAnimationFrame(() => {
        clampEditorPosition(modifiedEditor)
        refreshDiffState()
      })
    })

    originalEditor.onDidChangeModelContent(() => {
      if (originalEditableRef.current) {
        setOriginalCode(originalEditor.getModel()?.getValue() || '')
      }
      requestAnimationFrame(() => {
        clampEditorPosition(originalEditor)
        refreshDiffState()
      })
    })

    modifiedEditor.onDidChangeCursorPosition(event => {
      const { lineNumber, column } = event.position
      setCursorPosition({ line: lineNumber, column })
      refreshDiffState()
    })
    originalEditor.onDidChangeCursorPosition(event => {
      const { lineNumber, column } = event.position
      setCursorPosition({ line: lineNumber, column })
      refreshDiffState()
    })

    requestAnimationFrame(() => {
      void refreshDiffStateAfterCompute().then(() => {
        if (isDiffCollapseActive(editorViewOptionsRef.current)) {
          collapseAllDiffUnchangedRegions(editor)
        }
      })
    })
  }

  useEffect(() => {
    const diffEditor = editorRef.current
    if (!diffEditor || !monaco || fileKind !== 'text') return
    syncDiffEditorModelLanguage(diffEditor, monaco, language, filePath)
  }, [monaco, language, filePath, fileKind, editorMountEpoch])

  useEffect(() => {
    if (!embedded) return
    if (embeddedPayload) return
    clearEmbeddedViewerState()
  }, [embedded, embeddedPayload, clearEmbeddedViewerState])

  useEffect(() => {
    if (!embedded || !embeddedPayload) return

    if (embeddedRepoCwd && embeddedPayload.cwd) {
      const expected = normalizeGitPath(embeddedRepoCwd)
      const payloadCwd = normalizeGitPath(embeddedPayload.cwd)
      if (expected && payloadCwd && expected !== payloadCwd) return
    }

    if (embeddedPayload.mode === 'git-conflict') {
      setGitConflictPayload(null)
      const syncKey = buildEmbeddedGitConflictPayloadSyncKey(embeddedPayload)
      if (syncKey !== embeddedPayloadSyncKeyRef.current) {
        embeddedPayloadSyncKeyRef.current = syncKey
      }
      return
    }

    setGitConflictPayload(null)

    const syncKey = buildEmbeddedGitStagingPayloadSyncKey(embeddedPayload)
    if (syncKey === embeddedPayloadSyncKeyRef.current) return

    const hadPriorSync = embeddedPayloadSyncKeyRef.current.length > 0
    embeddedPayloadSyncKeyRef.current = syncKey

    const currentPath = loadContextRef.current?.filePath || filePathRef.current
    const files = embeddedPayload.files ?? []
    const hasActiveFile = Boolean(currentPath) && files.some(f => pathsEqual(f.filePath, currentPath))

    if (hadPriorSync && hasActiveFile && files.length > 0) {
      const ctx = loadContextRef.current
      if (ctx) {
        const activeEntry =
          files.find(f => pathsEqual(f.filePath, currentPath) && (f.stagingState === ctx.stagingState || f.stagingState === stagingHintRef.current)) ??
          files.find(f => pathsEqual(f.filePath, currentPath))
        const activeIndex = activeEntry ? files.indexOf(activeEntry) : Math.max(0, ctx.currentFileIndex ?? 0)
        const nextStaging = activeEntry?.stagingState ?? ctx.stagingState
        const stagingChanged = nextStaging !== ctx.stagingState
        const nextCtx = enrichDiffViewerPayload({
          ...ctx,
          files,
          cwd: embeddedPayload.cwd ?? ctx.cwd,
          currentFileIndex: activeIndex,
          stagingState: nextStaging,
        })
        loadContextRef.current = nextCtx
        initFiles(files, activeIndex)
        if (stagingChanged) {
          runLoad({
            ...nextCtx,
            filePath: activeEntry?.filePath ?? currentPath,
            fileStatus: activeEntry?.fileStatus ?? ctx.fileStatus,
            stagingState: nextStaging,
          })
        }
        return
      }
    }

    applyPayload(embeddedPayload)
  }, [embedded, embeddedRepoCwd, embeddedPayload, applyPayload, initFiles, runLoad])

  useEffect(() => {
    if (embedded) return
    const handler = (_event: unknown, data: DiffViewerLoadPayload) => {
      applyPayload(data)
    }
    window.api.on('load-diff-data', handler)
    window.api.electron.send(IPC.WINDOW.REQUEST_DIFF_DATA)
    return () => {
      window.api.removeListener('load-diff-data', handler)
    }
  }, [embedded, applyPayload])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (embedded) {
        const root = rootRef.current
        const target = e.target
        if (!root || !(target instanceof Node) || !root.contains(target)) return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void handleSaveFile()
      }
      if (e.key === 'F7') {
        e.preventDefault()
        if (e.shiftKey) handlePrevChange()
        else handleNextChange()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        handleFind()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        handleFindReplace()
      }
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        void handleFormat()
      }
      if (e.altKey && e.key === '[') {
        e.preventDefault()
        handlePrevFile()
      }
      if (e.altKey && e.key === ']') {
        e.preventDefault()
        handleNextFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [embedded, handleFind, handleFindReplace, handleFormat, handleNextChange, handlePrevChange, handleSaveFile, handlePrevFile, handleNextFile])

  useEffect(() => {
    if (embedded) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [embedded, isDirty])

  useEffect(() => {
    isLoadingRef.current = isLoading
    if (!isLoading && editable && fileKind === 'text') {
      setBaseline()
    }
  }, [isLoading, editable, fileKind, setBaseline])

  useEffect(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    applyDiffViewerEditorOptions(diffEditor, editorViewOptions, { readOnly: !editable })
    void (async () => {
      if (!isDiffCollapseActive(editorViewOptions)) {
        requestAnimationFrame(() => {
          diffEditor.layout()
          refreshDiffState()
        })
        return
      }
      await waitForDiffCompute(diffEditor)
      collapseAllDiffUnchangedRegions(diffEditor)
      requestAnimationFrame(() => {
        diffEditor.layout()
        refreshDiffState()
      })
    })()
  }, [editorViewOptions, editable, refreshDiffState])

  useEffect(() => {
    return () => {
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isLoading || fileKind !== 'text') return
    const timer = window.setTimeout(() => {
      void refreshDiffStateAfterCompute()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [originalCode, modifiedCode, isLoading, fileKind, refreshDiffStateAfterCompute])

  const originalLabel = useMemo(() => {
    if (stagingPaneLabels && isGit && !commitHash && !currentCommitHash) {
      return t(stagingPaneLabels.originalLabelKey)
    }
    if (isGit) {
      if (isSwapped) {
        return currentCommitHash ? (commitHash?.substring(0, 8) ?? '') : 'Working Copy'
      }
      return currentCommitHash ? currentCommitHash.substring(0, 8) : commitHash ? commitHash.substring(0, 8) : 'HEAD'
    }
    if (isSwapped) return currentRevision ? (revision ?? '') : 'Working Copy'
    return currentRevision ? String(Number(revision) - 1) : 'Working Base'
  }, [stagingPaneLabels, isGit, isSwapped, currentCommitHash, commitHash, currentRevision, revision, t])

  const modifiedLabel = useMemo(() => {
    if (stagingPaneLabels && isGit && !commitHash && !currentCommitHash) {
      return t(stagingPaneLabels.modifiedLabelKey)
    }
    if (isGit) {
      if (isSwapped) {
        return currentCommitHash ? currentCommitHash.substring(0, 8) : commitHash ? commitHash.substring(0, 8) : 'HEAD'
      }
      return currentCommitHash ? (commitHash?.substring(0, 8) ?? '') : 'Working Copy'
    }
    if (isSwapped) return currentRevision ? String(Number(revision) - 1) : 'Working Base'
    return currentRevision ? (revision ?? '') : 'Working Copy'
  }, [stagingPaneLabels, isGit, isSwapped, currentCommitHash, commitHash, currentRevision, revision, t])

  useDiffViewerPaneLabels({
    enabled: fileKind === 'text' && Boolean(filePath) && !loadError,
    editorRef,
    editorMountEpoch,
    originalLabel,
    modifiedLabel,
  })

  const showStageButton = diffViewerSupportsStageActions(diffViewerMode) && fileKind === 'text'
  const showRevertButton = showStageButton && stagingHintForRefresh !== 'staged' && displayedFileEntry?.stagingState !== 'staged'
  const showFormatButton = fileKind === 'text' && (editable || editorViewOptions.originalEditable)
  const showBlameToggle = isGit && fileKind === 'text'

  const isModifiedWithoutDiffChanges =
    !isLoading && fileKind === 'text' && changePosition.total === 0 && ['modified', 'M'].includes((displayedFileEntry?.fileStatus ?? '').toLowerCase())

  const renderMainContent = () => {
    if (!filePath) {
      return <DiffViewerLoadState variant="empty" />
    }
    if (loadError) {
      return <DiffViewerLoadState variant="error" errorMessage={loadError} onRetry={onRefresh} />
    }
    if (fileKind === 'binary' || fileKind === 'image') {
      return (
        <BinaryDiffPanel
          kind={fileKind}
          originalLabel={originalLabel}
          modifiedLabel={modifiedLabel}
          originalDataUrl={originalDataUrl}
          modifiedDataUrl={modifiedDataUrl}
          fileTooLarge={fileTooLarge}
          isLoading={isLoading}
        />
      )
    }
    return (
      <div className="relative flex-1 overflow-hidden">
        <DiffEditor
          key={diffEditorRemountKey}
          height="100%"
          language={language}
          original={originalCode}
          modified={modifiedCode}
          theme={monacoTheme}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          onMount={handleEditorMount}
          options={editorOptions}
        />
      </div>
    )
  }

  const conflictEmbeddedPayload = embedded && embeddedPayload?.mode === 'git-conflict' ? embeddedPayload : embedded ? null : gitConflictPayload

  if (conflictEmbeddedPayload || (!embedded && gitConflictPayload)) {
    return <GitConflictDiffView ref={ref} embedded={embedded} embeddedPayload={conflictEmbeddedPayload ?? gitConflictPayload} embeddedToolbarHost={embeddedToolbarHost} />
  }

  const toolbarProps = {
    embedded,
    headerPortalTarget: embedded ? embeddedToolbarHost : null,
    onRefresh,
    onSwapSides: handleSwap,
    onSave: () => void handleSaveFile(),
    onPrevChange: handlePrevChange,
    onNextChange: handleNextChange,
    onFirstChange: handleFirstChange,
    onLastChange: handleLastChange,
    changePosition,
    disableChangeNav: changePosition.total === 0 || isLoading || fileKind !== 'text',
    showNoChangesBadge: isModifiedWithoutDiffChanges,
    isSaving,
    filePath,
    files,
    activeFile: displayedFileEntry,
    onSelectFile: requestNavigateToFile,
    disableFilePicker: !filePath && files.length === 0,
    disableSave: !editable || fileKind !== 'text',
    isDirty,
    onCloseRequest: embedded ? undefined : handleCloseRequest,
    hasMultipleFiles,
    filePosition: hasMultipleFiles ? { current: activeIndex + 1, total: files.length } : undefined,
    onPrevFile: handlePrevFile,
    onNextFile: handleNextFile,
    disableFileNav: isLoading,
    wrapFileNav: hasMultipleFiles,
    showStageActions: showStageButton,
    stagingState: displayedFileEntry?.stagingState,
    onStageToggle: () => void handleStageToggle(),
    isStaging,
    showRevertAction: showRevertButton,
    onRevert: handleRevertRequest,
    isReverting,
    showFormatAction: showFormatButton,
    onFormat: () => void handleFormat(),
    isFormatting,
    disableFormat: isLoading || !filePath,
    showRemoveEmptyLinesAction: showFormatButton,
    onRemoveEmptyLines: () => void handleRemoveEmptyLines(),
    isRemovingEmptyLines,
    disableRemoveEmptyLines: isLoading || !filePath,
    showAutoAdvanceToggle: showStageButton,
    autoAdvance,
    onToggleAutoAdvance: toggleAutoAdvance,
    showBlameToggle,
    showBlame: viewOptions.showBlame,
    onToggleBlame: () => setViewOption('showBlame', !viewOptions.showBlame),
    viewOptions,
    onViewOptionChange: setViewOption,
    onOpenInEditor: handleOpenInEditor,
    onRevealInExplorer: handleRevealInExplorer,
    onFind: handleFind,
    onFindReplace: handleFindReplace,
  }

  return (
    <div ref={rootRef} className="flex flex-col w-full h-full">
      {(!embedded || embeddedToolbarHost) && <DiffToolbar {...toolbarProps} />}

      <div className="flex flex-1 min-h-0 h-full flex-col overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="h-full" groupRef={panelGroupRef} defaultLayout={initialLayout} onLayoutChanged={handleLayoutChanged}>
          <ResizablePanel id={DIFF_VIEWER_TREE_PANEL_ID} minSize={`${DIFF_VIEWER_TREE_PANEL_MIN_WIDTH}%`} maxSize={`${DIFF_VIEWER_TREE_PANEL_MAX_WIDTH}%`} className="h-full">
            <div className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border/40">
              <DiffViewerFileTreePanel
                files={files}
                activeIndex={activeIndex}
                splitStaging={diffViewerMode === 'git-staging'}
                showStageActions={diffViewerSupportsStageActions(diffViewerMode)}
                disabled={isStaging || isReverting}
                isRefreshing={isTreeRefreshing}
                stagingFooter={embedded && embeddedStagingFooter ? embeddedStagingFooter : undefined}
                onSelectFile={requestNavigateToFile}
                onBulkAction={(action, indices) => void handleTreeBulkAction(action, indices)}
                onRefresh={handleTreeRefresh}
                showLocalIgnorePatterns={Boolean(embedded && embeddedOnOpenLocalIgnorePatterns)}
                onOpenLocalIgnorePatterns={embeddedOnOpenLocalIgnorePatterns}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle className="bg-transparent" />

          <ResizablePanel id={DIFF_VIEWER_EDITOR_PANEL_ID} minSize="45%" className="h-full flex flex-col min-h-0">
            {renderMainContent()}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {fileKind === 'text' && filePath && !loadError ? (
        <DiffFooterBar
          language={language}
          setLanguage={setLanguage}
          cursorPosition={cursorPosition}
          diffStats={diffStats}
          charDiffStats={charDiffStats}
          charChangeRegions={charChangeRegions}
        />
      ) : null}

      <DiffViewerCloseConfirm
        open={showCloseConfirm}
        onOpenChange={open => {
          if (!open) {
            setShowCloseConfirm(false)
            setPendingNavIndex(null)
            pendingCloseRef.current = false
            pendingLayoutLeaveRef.current = null
          }
        }}
        onSaveAndClose={handleSaveAndClose}
        onDiscard={handleDiscardAndClose}
      />

      <DiffViewerDiscardConfirm
        open={showDiscardConfirm}
        filePaths={discardConfirmPaths}
        filePath={filePath || null}
        isDirty={isDirty}
        onOpenChange={open => {
          setShowDiscardConfirm(open)
          if (!open) setDiscardConfirmPaths([])
        }}
        onConfirm={handleRevertConfirm}
      />
    </div>
  )
})
