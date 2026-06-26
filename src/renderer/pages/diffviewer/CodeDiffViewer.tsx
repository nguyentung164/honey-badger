'use client'
import { DiffEditor, type DiffOnMount, useMonaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { IPC } from 'main/constants'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { SYNCED_EVENT, type UiSettingsSyncedDetail } from '@/lib/syncUiSettings'
import logger from '@/services/logger'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { BinaryDiffPanel } from './BinaryDiffPanel'
import { DiffFooterBar } from './DiffFooterBar'
import { DiffToolbar } from './DiffToolbar'
import { DiffViewerCloseConfirm } from './DiffViewerCloseConfirm'
import { DiffViewerDiscardConfirm } from './DiffViewerDiscardConfirm'
import { DiffViewerFileTreePanel, type DiffViewerFileTreeBulkAction } from './DiffViewerFileTreePanel'
import { DiffViewerLoadState } from './DiffViewerLoadState'
import type { DiffViewerFileKind, DiffViewerLoadPayload, DiffViewerMode, ImageLoadContext } from './diffViewerPayload'
import { deriveDiffViewerMode, diffViewerSupportsFileListRefresh, diffViewerSupportsStageActions, enrichDiffViewerPayload } from './diffViewerPayload'
import { mergeGitFilesRefreshIntoContext, normalizeGitPath, pathsEqual, resolveAutoAdvanceTargetIndex, resolveDisplayedFileEntry, wrapFileNavIndex, type DiffViewerFilesRefreshResult } from './diffViewerGitFiles'
import type { CharDiffStats, DiffStats } from './diffViewerTypes'
import {
  computeCharDiffStats,
  computeDiffStats,
  clampEditorPosition,
  getChangePosition,
  getCharChangeCount,
  getCurrentLineChange,
  goToAdjacentChange,
  goToFirstChange,
  goToLastChange,
  resolveDiffViewerRevealPath,
  swapDiffEditorModels,
  triggerFindReplaceWidget,
  triggerFindWidget,
  formatDiffEditor,
  readDiffEditorPaneText,
  removeEmptyLinesFromDiffEditor,
  stabilizeDiffEditorAfterEdit,
  syncDiffEditorModelLanguage,
  waitForDiffCompute,
} from './diffViewerUtils'
import { useDiffViewerBlame } from './useDiffViewerBlame'
import { useDiffViewerMinimapHighlights } from './useDiffViewerMinimapHighlights'
import { useDiffViewerPaneLabels } from './useDiffViewerPaneLabels'
import { useDiffViewerDirty } from './useDiffViewerDirty'
import { useDiffViewerAutoAdvance } from './useDiffViewerAutoAdvance'
import { useDiffViewerFileNav } from './useDiffViewerFileNav'
import { useDiffViewerTreePanelWidth } from './useDiffViewerTreePanelWidth'
import { buildDiffEditorOptions, applyDiffViewerEditorOptions, useDiffViewerOptions } from './useDiffViewerOptions'

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
  jsx: 'javascriptreact',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescriptreact',
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

async function readGitWorkingTreeForDiff(filePath: string, fileStatus: string, catOpts?: { cwd?: string }): Promise<string> {
  if (isLikelyGitUnmergedWorkingTree(fileStatus)) {
    const r = await window.api.git.read_conflict_working_content(filePath, catOpts?.cwd)
    if (r.status === 'success' && typeof r.data === 'string') return r.data
    throw new Error(r.message || 'read_conflict_working_content failed')
  }
  try {
    return await window.api.system.read_file(filePath, catOpts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const looksMissing = msg.includes('ENOENT') || /no such file|cannot find|not found|The system cannot find the file/i.test(msg)
    if (looksMissing) {
      const r = await window.api.git.read_conflict_working_content(filePath, catOpts?.cwd)
      if (r.status === 'success' && typeof r.data === 'string') return r.data
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

export function CodeDiffViewer() {
  const monaco = useMonaco()
  const { themeMode } = useAppearanceStore()
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
  const [diffViewerMode, setDiffViewerMode] = useState<DiffViewerMode>('git-working')
  const [isSwapped, setIsSwapped] = useState(false)
  const [language, setLanguage] = useState('javascript')
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 })
  const [isLoading, setIsLoading] = useState(false)
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
  const originalEditableRef = useRef(false)
  const loadContextRef = useRef<DiffViewerLoadPayload | null>(null)
  const pendingCloseRef = useRef(false)
  const loadGenerationRef = useRef(0)
  const isGitActionInProgressRef = useRef(false)
  const isLoadingRef = useRef(false)

  const { viewOptions, setViewOption } = useDiffViewerOptions()
  const { autoAdvance, toggleAutoAdvance } = useDiffViewerAutoAdvance()
  const { treePanelWidth, handleTreePanelResize } = useDiffViewerTreePanelWidth()

  const editable = currentRevision == null && currentCommitHash == null
  const editorOptions = useMemo(
    () => buildDiffEditorOptions(viewOptions, { readOnly: !editable }),
    [viewOptions, editable]
  )

  const { isDirty, setBaseline, notifyContentChange } = useDiffViewerDirty(editable)
  const notifyContentChangeRef = useRef(notifyContentChange)
  notifyContentChangeRef.current = notifyContentChange
  const { files, activeIndex, activeFile, initFiles, goToFile, refreshFilesFromGit, refreshFromContext, hasMultipleFiles, setActiveEntryStagingState } =
    useDiffViewerFileNav()

  const displayedFileEntry = useMemo(() => {
    if (activeFile && pathsEqual(activeFile.filePath, filePath)) {
      return activeFile
    }
    return resolveDisplayedFileEntry(files, filePath, {
      fileStatus: loadContextRef.current?.fileStatus,
      stagingState: undefined,
    })
  }, [files, filePath, activeFile])

  const stagingHintForRefresh =
    activeFile && pathsEqual(activeFile.filePath, filePath) ? activeFile.stagingState : undefined

  const stagingHintRef = useRef(stagingHintForRefresh)
  stagingHintRef.current = stagingHintForRefresh

  useEffect(() => {
    originalEditableRef.current = viewOptions.originalEditable
  }, [viewOptions.originalEditable])

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
    themeMode,
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

  const loadImageDataUrl = useCallback(
    async (
      path: string,
      source?: { gitRevision?: string; svnRevision?: string; svnFileStatus?: string }
    ): Promise<string | null> => {
      const opts = {
        ...(cwd ? { cwd } : {}),
        ...(source?.gitRevision ? { gitRevision: source.gitRevision } : {}),
        ...(source && 'svnRevision' in source
          ? { svnRevision: source.svnRevision, svnFileStatus: source.svnFileStatus ?? '' }
          : {}),
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
      const svnAt = (revision?: string) =>
        loadImageDataUrl(path, { svnRevision: revision ?? '', svnFileStatus: fileStatus })

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

  const handleRefresh = useCallback(
    async (path: string, status: string, rev?: string, curRev?: string, cwdOverride?: string) => {
      const generation = ++loadGenerationRef.current
      const isStale = () => generation !== loadGenerationRef.current

      try {
        setLoadError(null)
        setIsLoading(true)
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

        setOriginalCode(nextOriginal)
        setModifiedCode(nextModified)
        setBaseline(nextModified)
        setContentEpoch(e => e + 1)
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
    [loadImageSides, setBaseline]
  )

  const handleRefreshGit = useCallback(
    async (path: string, status: string, hash?: string, curHash?: string, rootCommit?: boolean, cwdOverride?: string) => {
      const generation = ++loadGenerationRef.current
      const isStale = () => generation !== loadGenerationRef.current

      try {
        setLoadError(null)
        setIsLoading(true)
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
        } else {
          const originalResult = await window.api.git.cat(path, status, 'HEAD', catOpts)
          if (isStale()) return
          nextOriginal = originalResult.data || ''
          nextModified = await readGitWorkingTreeForDiff(path, status, catOpts)
          if (isStale()) return
        }

        setOriginalCode(nextOriginal)
        setModifiedCode(nextModified)
        setBaseline(nextModified)
        setContentEpoch(e => e + 1)
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
    [loadImageSides, setBaseline]
  )

  const runLoad = useCallback(
    (ctx: DiffViewerLoadPayload) => {
      const enriched = enrichDiffViewerPayload({
        ...ctx,
        filePath: ctx.filePath ? normalizeGitPath(ctx.filePath) : ctx.filePath,
        cwd: ctx.cwd ?? cwd,
        isGit: ctx.isGit ?? isGit,
        files: ctx.files?.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) })),
      })
      loadContextRef.current = enriched
      const path = enriched.filePath ?? ''
      if (!path) return
      setIsSwapped(false)
      if (enriched.isGit) {
        void handleRefreshGit(
          path,
          enriched.fileStatus ?? '',
          enriched.commitHash,
          enriched.currentCommitHash,
          enriched.isRootCommit,
          enriched.cwd
        )
      } else {
        void handleRefresh(path, enriched.fileStatus ?? '', enriched.revision, enriched.currentRevision, enriched.cwd)
      }
    },
    [handleRefresh, handleRefreshGit, cwd, isGit]
  )

  const applyPayload = useCallback(
    (data: DiffViewerLoadPayload) => {
      const enriched = enrichDiffViewerPayload(data)
      const path = enriched.filePath ? normalizeGitPath(enriched.filePath) : ''
      const normalizedFiles = enriched.files?.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) }))
      const mode = deriveDiffViewerMode(enriched)
      setFilePath(path)
      setRevision(enriched.revision)
      setCurrentRevision(enriched.currentRevision)
      setIsGit(enriched.isGit || false)
      setCommitHash(enriched.commitHash)
      setCurrentCommitHash(enriched.currentCommitHash)
      setCwd(enriched.cwd)
      setDiffViewerMode(mode)
      initFiles(normalizedFiles, enriched.currentFileIndex)
      setLanguage(detectLanguage(path))
      setLoadError(null)

      if (!path) return
      runLoad({ ...enriched, filePath: path, files: normalizedFiles })
    },
    [initFiles, runLoad]
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
        runLoad(
          refreshed.currentInList
            ? nextCtx
            : { ...nextCtx, filePath: ctx.filePath, fileStatus: ctx.fileStatus }
        )
        return
      }
    }

    setIsSwapped(false)
    runLoad(ctx)
  }, [runLoad, refreshFromContext, stagingHintForRefresh, filePath])

  const navigateToFile = useCallback(
    (index: number) => {
      const entry = files[index]
      if (!entry) return
      const base = loadContextRef.current ?? {}
      const nextCtx = enrichDiffViewerPayload({
        ...base,
        filePath: entry.filePath,
        fileStatus: entry.fileStatus ?? '',
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

  const handleCloseRequest = useCallback(() => {
    if (isDirty) {
      pendingCloseRef.current = true
      setShowCloseConfirm(true)
      return
    }
    window.api.electron.send('window:action', 'close')
  }, [isDirty])

  const handleDiscardAndClose = useCallback(() => {
    setShowCloseConfirm(false)
    if (pendingNavIndex != null) {
      const idx = pendingNavIndex
      setPendingNavIndex(null)
      goToFile(idx)
      navigateToFile(idx)
      return
    }
    if (pendingCloseRef.current) {
      pendingCloseRef.current = false
      window.api.electron.send('window:action', 'close')
    }
  }, [pendingNavIndex, goToFile, navigateToFile])

  const filePathRef = useRef(filePath)
  const modifiedCodeRef = useRef(modifiedCode)
  useEffect(() => {
    modifiedCodeRef.current = modifiedCode
  }, [modifiedCode])
  useEffect(() => {
    filePathRef.current = filePath
  }, [filePath])

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
    if (pendingNavIndex != null) {
      const idx = pendingNavIndex
      setPendingNavIndex(null)
      goToFile(idx)
      navigateToFile(idx)
      return
    }
    if (pendingCloseRef.current) {
      pendingCloseRef.current = false
      window.api.electron.send('window:action', 'close')
    }
  }, [handleSaveFile, pendingNavIndex, goToFile, navigateToFile])

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

      const targetIndex =
        autoAdvance
          ? resolveAutoAdvanceTargetIndex(advanceFromIndex, refreshed.files, actedFilePath)
          : refreshed.currentInList
            ? refreshed.activeIndex
            : null

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
    const repoCwd = cwd ?? loadContextRef.current?.cwd
    setIsStaging(true)
    isGitActionInProgressRef.current = true
    try {
      const opts = repoCwd ? { cwd: repoCwd } : undefined
      const result = isStaged
        ? await window.api.git.reset_staged([filePath], opts)
        : await window.api.git.add([filePath], opts)
      if (result.status === 'success') {
        setActiveEntryStagingState(activeIndex, filePath, nextStagingState)
        toast.success(isStaged ? t('dialog.diffViewer.unstageSuccess') : t('dialog.diffViewer.stageSuccess'))
        const lookupStagingState = isStaged ? 'staged' : nextStagingState
        const refreshed = repoCwd
          ? await refreshFilesFromGit(repoCwd, filePath, lookupStagingState)
          : null
        const ctx = loadContextRef.current
        if (!ctx) return
        applyGitActionRefresh(advanceFromIndex, filePath, refreshed, ctx, { stagingStateHint: nextStagingState })
        window.api.electron.send(IPC.WINDOW.NOTIFY_STAGING_CHANGED)
      } else {
        toast.error(result.message || t('toast.gitAddError'))
      }
    } catch (error) {
      toast.error(formatLoadError(error))
    } finally {
      isGitActionInProgressRef.current = false
      setIsStaging(false)
    }
  }, [
    filePath,
    diffViewerMode,
    stagingHintForRefresh,
    activeIndex,
    cwd,
    t,
    setActiveEntryStagingState,
    refreshFilesFromGit,
    applyGitActionRefresh,
  ])

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
    const repoCwd = cwd ?? loadContextRef.current?.cwd
    setShowDiscardConfirm(false)
    setDiscardConfirmPaths([])
    setIsReverting(true)
    isGitActionInProgressRef.current = true
    try {
      const result = await window.api.git.discardChanges(pathsToRevert, repoCwd)
      if (result.status === 'success') {
        toast.success(t('toast.revertSuccess'))
        const refreshed = repoCwd
          ? await refreshFilesFromGit(repoCwd, actedFilePath, 'unstaged')
          : null
        const ctx = loadContextRef.current
        if (!ctx) return
        applyGitActionRefresh(advanceFromIndex, actedFilePath, refreshed, ctx)
        window.api.electron.send(IPC.WINDOW.NOTIFY_STAGING_CHANGED)
      } else {
        toast.error(result.message || t('toast.revertError'))
      }
    } catch (error) {
      toast.error(formatLoadError(error))
    } finally {
      isGitActionInProgressRef.current = false
      setIsReverting(false)
    }
  }, [
    discardConfirmPaths,
    filePath,
    diffViewerMode,
    activeIndex,
    cwd,
    t,
    refreshFilesFromGit,
    applyGitActionRefresh,
  ])

  const refreshAfterTreeBulkGitAction = useCallback(
    async (actedFilePath: string, lookupStagingState?: 'staged' | 'unstaged') => {
      const repoCwd = cwd ?? loadContextRef.current?.cwd
      if (!repoCwd) return
      const refreshed = await refreshFilesFromGit(repoCwd, actedFilePath, lookupStagingState)
      const ctx = loadContextRef.current
      if (!ctx) return
      applyGitActionRefresh(activeIndex, actedFilePath, refreshed, ctx)
      window.api.electron.send(IPC.WINDOW.NOTIFY_STAGING_CHANGED)
    },
    [activeIndex, applyGitActionRefresh, cwd, refreshFilesFromGit]
  )

  const handleTreeBulkAction = useCallback(
    async (action: DiffViewerFileTreeBulkAction, indices: number[]) => {
      if (indices.length === 0) return
      const uniqueIndices = [...new Set(indices)].filter(index => index >= 0 && index < files.length)
      if (uniqueIndices.length === 0) return

      const selectedPaths = [...new Set(uniqueIndices.map(index => files[index]?.filePath).filter(Boolean) as string[])]
      const actedFilePath = files[activeIndex]?.filePath ?? selectedPaths[0] ?? filePath

      if (action === 'reveal') {
        for (const path of selectedPaths) {
          window.api.system.reveal_in_file_explorer(resolveDiffViewerRevealPath(path, cwd))
        }
        return
      }

      if (action === 'openInEditor') {
        const path = selectedPaths[0]
        if (!path) return
        const result = await window.api.system.open_file_in_editor({ filePath: path, cwd })
        if (!result?.success) {
          toast.error(result?.error || t('dialog.diffViewer.openInEditorFailed'))
        }
        return
      }

      if (!diffViewerSupportsStageActions(diffViewerMode)) return
      const repoCwd = cwd ?? loadContextRef.current?.cwd
      if (!repoCwd) return

      if (action === 'revert') {
        const unstagedPaths = [
          ...new Set(
            uniqueIndices
              .filter(index => files[index]?.stagingState !== 'staged')
              .map(index => files[index]?.filePath)
              .filter(Boolean) as string[]
          ),
        ]
        if (unstagedPaths.length === 0) return
        setDiscardConfirmPaths(unstagedPaths)
        setShowDiscardConfirm(true)
        return
      }

      isGitActionInProgressRef.current = true
      setIsStaging(true)
      try {
        if (action === 'stage') {
          const unstagedPaths = [
            ...new Set(
              uniqueIndices
                .filter(index => files[index]?.stagingState !== 'staged')
                .map(index => files[index]?.filePath)
                .filter(Boolean) as string[]
            ),
          ]
          if (unstagedPaths.length === 0) return
          const result = await window.api.git.add(unstagedPaths, { cwd: repoCwd })
          if (result.status === 'success') {
            toast.success(t('dialog.diffViewer.stageSuccess'))
            await refreshAfterTreeBulkGitAction(actedFilePath, 'staged')
          } else {
            toast.error(result.message || t('toast.gitAddError'))
          }
          return
        }

        if (action === 'unstage') {
          const stagedPaths = [
            ...new Set(
              uniqueIndices
                .filter(index => files[index]?.stagingState === 'staged')
                .map(index => files[index]?.filePath)
                .filter(Boolean) as string[]
            ),
          ]
          if (stagedPaths.length === 0) return
          const result = await window.api.git.reset_staged(stagedPaths, { cwd: repoCwd })
          if (result.status === 'success') {
            toast.success(t('dialog.diffViewer.unstageSuccess'))
            await refreshAfterTreeBulkGitAction(actedFilePath, 'staged')
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
    [
      files,
      activeIndex,
      filePath,
      cwd,
      diffViewerMode,
      t,
      refreshAfterTreeBulkGitAction,
    ]
  )

  useEffect(() => {
    if (diffViewerMode !== 'git-staging' || !cwd) return
    const handleFilesChanged = () => {
      if (isGitActionInProgressRef.current) return
      const ctx = loadContextRef.current
      if (!ctx?.filePath || !ctx.cwd) return
      void refreshFromContext(ctx, stagingHintRef.current).then(outcome => {
        if (!outcome || !loadContextRef.current) return
        loadContextRef.current = outcome.nextCtx
      })
    }
    window.api.on(IPC.FILES_CHANGED, handleFilesChanged)
    return () => window.api.removeListener(IPC.FILES_CHANGED, handleFilesChanged)
  }, [diffViewerMode, cwd, refreshFromContext])

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
      if (editable && viewOptions.originalEditable) {
        setOriginalCode(original)
      }
    },
    [editable, viewOptions.originalEditable]
  )

  const handleFormat = useCallback(async () => {
    const diffEditor = editorRef.current
    if (!diffEditor || !monaco || isLoadingRef.current || fileKind !== 'text') return
    const modifiedEditable = editable
    const originalEditable = editable && viewOptions.originalEditable
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
  }, [
    monaco,
    editable,
    fileKind,
    language,
    filePath,
    syncEditorTextFromModel,
    refreshDiffStateAfterCompute,
    t,
    viewOptions.originalEditable,
  ])

  const handleRemoveEmptyLines = useCallback(async () => {
    const diffEditor = editorRef.current
    if (!diffEditor || isLoadingRef.current || fileKind !== 'text') return
    const modifiedEditable = editable
    const originalEditable = editable && viewOptions.originalEditable
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
  }, [
    editable,
    fileKind,
    syncEditorTextFromModel,
    refreshDiffStateAfterCompute,
    t,
    viewOptions.originalEditable,
  ])

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

  const handleOpenInEditor = useCallback(async () => {
    if (!filePath) return
    const diffEditor = editorRef.current
    const change = diffEditor ? getCurrentLineChange(diffEditor) : null
    const line =
      change && change.modifiedStartLineNumber > 0
        ? change.modifiedStartLineNumber
        : change && change.originalStartLineNumber > 0
          ? change.originalStartLineNumber
          : cursorPosition.line
    const result = await window.api.system.open_file_in_editor({ filePath, lineNumber: line, cwd })
    if (!result?.success) {
      toast.error(result?.error || t('dialog.diffViewer.openInEditorFailed'))
    }
  }, [filePath, cwd, cursorPosition.line, t])

  const handleRevealInExplorer = useCallback(() => {
    if (!filePath) return
    window.api.system.reveal_in_file_explorer(resolveDiffViewerRevealPath(filePath, cwd))
  }, [filePath, cwd])

  const handleEditorMount: DiffOnMount = (editor, _monaco) => {
    editorRef.current = editor
    applyDiffViewerEditorOptions(editor, viewOptions, { readOnly: !editable })
    setEditorMountEpoch(e => e + 1)
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    editor.onDidUpdateDiff(() => {
      requestAnimationFrame(refreshDiffState)
    })

    modifiedEditor.onDidChangeModelContent(event => {
      const newModifiedCode = modifiedEditor.getModel()?.getValue() || ''
      setModifiedCode(newModifiedCode)
      notifyContentChangeRef.current(event)
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
      void refreshDiffStateAfterCompute()
    })
  }

  useEffect(() => {
    const diffEditor = editorRef.current
    if (!diffEditor || !monaco || fileKind !== 'text') return
    syncDiffEditorModelLanguage(diffEditor, monaco, language, filePath)
  }, [monaco, language, filePath, fileKind, editorMountEpoch])

  useEffect(() => {
    const handler = (_event: unknown, data: DiffViewerLoadPayload) => {
      applyPayload(data)
    }
    window.api.on('load-diff-data', handler)
    window.api.electron.send(IPC.WINDOW.REQUEST_DIFF_DATA)

    const handleKeyDown = (e: KeyboardEvent) => {
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
      window.api.removeListener('load-diff-data', handler)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    applyPayload,
    handleFind,
    handleFindReplace,
    handleFormat,
    handleNextChange,
    handlePrevChange,
    handleSaveFile,
    handlePrevFile,
    handleNextFile,
  ])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    const handleUiSettingsSynced = (e: CustomEvent<UiSettingsSyncedDetail>) => {
      const selectedTheme = e.detail.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
      monaco?.editor.setTheme(selectedTheme)
    }
    window.addEventListener(SYNCED_EVENT, handleUiSettingsSynced as EventListener)
    return () => window.removeEventListener(SYNCED_EVENT, handleUiSettingsSynced as EventListener)
  }, [monaco])

  useEffect(() => {
    if (!monaco) return
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#202020',
        'editorLineNumber.foreground': '#6c7086',
        'editorCursor.foreground': '#f38ba8',
        'diffEditor.insertedTextBackground': '#00fa5120',
        'diffEditor.removedTextBackground': '#ff000220',
        'diffEditor.insertedLineBackground': '#00aa5120',
        'diffEditor.removedLineBackground': '#aa000220',
      },
    })
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#f9f9f9',
        'editorLineNumber.foreground': '#9aa2b1',
        'editorCursor.foreground': '#931845',
        'diffEditor.insertedTextBackground': '#a2f3bdcc',
        'diffEditor.removedTextBackground': '#f19999cc',
        'diffEditor.insertedLineBackground': '#b7f5c6cc',
        'diffEditor.removedLineBackground': '#f2a8a8cc',
      },
    })
    const selectedTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light'
    monaco.editor.setTheme(selectedTheme)
  }, [monaco, themeMode])

  useEffect(() => {
    isLoadingRef.current = isLoading
    if (!isLoading && editable && fileKind === 'text') {
      setBaseline()
    }
  }, [isLoading, editable, fileKind, setBaseline])

  useEffect(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
    applyDiffViewerEditorOptions(diffEditor, viewOptions, { readOnly: !editable })
    requestAnimationFrame(() => {
      diffEditor.layout()
      refreshDiffState()
    })
  }, [viewOptions, editable, refreshDiffState])

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
    if (isGit) {
      if (isSwapped) {
        return currentCommitHash ? (commitHash?.substring(0, 8) ?? '') : 'Working Copy'
      }
      return currentCommitHash ? currentCommitHash.substring(0, 8) : commitHash ? commitHash.substring(0, 8) : 'HEAD'
    }
    if (isSwapped) return currentRevision ? (revision ?? '') : 'Working Copy'
    return currentRevision ? String(Number(revision) - 1) : 'Working Base'
  }, [isGit, isSwapped, currentCommitHash, commitHash, currentRevision, revision])

  const modifiedLabel = useMemo(() => {
    if (isGit) {
      if (isSwapped) {
        return currentCommitHash ? currentCommitHash.substring(0, 8) : commitHash ? commitHash.substring(0, 8) : 'HEAD'
      }
      return currentCommitHash ? (commitHash?.substring(0, 8) ?? '') : 'Working Copy'
    }
    if (isSwapped) return currentRevision ? String(Number(revision) - 1) : 'Working Base'
    return currentRevision ? (revision ?? '') : 'Working Copy'
  }, [isGit, isSwapped, currentCommitHash, commitHash, currentRevision, revision])

  const showSideBySideLabels = viewOptions.renderSideBySide && !viewOptions.diffOnly

  useDiffViewerPaneLabels({
    enabled: fileKind === 'text' && Boolean(filePath) && !loadError,
    editorRef,
    editorMountEpoch,
    originalLabel,
    modifiedLabel,
    renderSideBySide: showSideBySideLabels,
  })

  const showStageButton = diffViewerSupportsStageActions(diffViewerMode) && fileKind === 'text'
  const showRevertButton =
    showStageButton && stagingHintForRefresh !== 'staged' && displayedFileEntry?.stagingState !== 'staged'
  const showFormatButton = fileKind === 'text' && (editable || viewOptions.originalEditable)
  const showBlameToggle = isGit && fileKind === 'text'

  const isModifiedWithoutDiffChanges =
    !isLoading &&
    fileKind === 'text' &&
    changePosition.total === 0 &&
    ['modified', 'M'].includes((displayedFileEntry?.fileStatus ?? '').toLowerCase())

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
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : null}
        <DiffEditor
          height="100%"
          language={language}
          original={originalCode}
          modified={modifiedCode}
          theme={themeMode === 'dark' ? 'custom-dark' : 'custom-light'}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          onMount={handleEditorMount}
          options={editorOptions}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full h-full">
      <DiffToolbar
        onRefresh={onRefresh}
        onSwapSides={handleSwap}
        onSave={() => void handleSaveFile()}
        onPrevChange={handlePrevChange}
        onNextChange={handleNextChange}
        onFirstChange={handleFirstChange}
        onLastChange={handleLastChange}
        changePosition={changePosition}
        disableChangeNav={changePosition.total === 0 || isLoading || fileKind !== 'text'}
        showNoChangesBadge={isModifiedWithoutDiffChanges}
        isSaving={isSaving}
        filePath={filePath}
        files={files}
        activeFile={displayedFileEntry}
        onSelectFile={requestNavigateToFile}
        disableFilePicker={!filePath && files.length === 0}
        disableSave={!editable || fileKind !== 'text'}
        isDirty={isDirty}
        onCloseRequest={handleCloseRequest}
        hasMultipleFiles={hasMultipleFiles}
        filePosition={hasMultipleFiles ? { current: activeIndex + 1, total: files.length } : undefined}
        onPrevFile={handlePrevFile}
        onNextFile={handleNextFile}
        disableFileNav={isLoading}
        wrapFileNav={hasMultipleFiles}
        showStageActions={showStageButton}
        stagingState={displayedFileEntry?.stagingState}
        onStageToggle={() => void handleStageToggle()}
        isStaging={isStaging}
        showRevertAction={showRevertButton}
        onRevert={handleRevertRequest}
        isReverting={isReverting}
        showFormatAction={showFormatButton}
        onFormat={() => void handleFormat()}
        isFormatting={isFormatting}
        disableFormat={isLoading || !filePath}
        showRemoveEmptyLinesAction={showFormatButton}
        onRemoveEmptyLines={() => void handleRemoveEmptyLines()}
        isRemovingEmptyLines={isRemovingEmptyLines}
        disableRemoveEmptyLines={isLoading || !filePath}
        showAutoAdvanceToggle={showStageButton}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={toggleAutoAdvance}
        showBlameToggle={showBlameToggle}
        showBlame={viewOptions.showBlame}
        onToggleBlame={() => setViewOption('showBlame', !viewOptions.showBlame)}
        viewOptions={viewOptions}
        onViewOptionChange={setViewOption}
        onOpenInEditor={handleOpenInEditor}
        onRevealInExplorer={handleRevealInExplorer}
        onFind={handleFind}
        onFindReplace={handleFindReplace}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
          <ResizablePanel
            defaultSize={treePanelWidth}
            minSize={14}
            maxSize={42}
            onResize={handleTreePanelResize}
            className="min-h-0"
          >
            <DiffViewerFileTreePanel
              files={files}
              activeIndex={activeIndex}
              splitStaging={diffViewerMode === 'git-staging'}
              showStageActions={diffViewerSupportsStageActions(diffViewerMode)}
              disabled={isLoading || isStaging || isReverting}
              onSelectFile={requestNavigateToFile}
              onBulkAction={(action, indices) => void handleTreeBulkAction(action, indices)}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={100 - treePanelWidth} minSize={45} className="flex min-h-0 min-w-0 flex-col">
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
}
