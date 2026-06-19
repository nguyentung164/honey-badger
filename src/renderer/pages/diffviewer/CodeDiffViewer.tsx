'use client'
import { DiffEditor, type DiffOnMount, useMonaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { IPC } from 'main/constants'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { SYNCED_EVENT, type UiSettingsSyncedDetail } from '@/lib/syncUiSettings'
import logger from '@/services/logger'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { DiffFooterBar } from './DiffFooterBar'
import { DiffToolbar } from './DiffToolbar'
import type { CharDiffStats, DiffStats } from './diffViewerTypes'
import {
  computeCharDiffStats,
  computeDiffStats,
  getChangePosition,
  getCharChangeCount,
  getCurrentLineChange,
  goToAdjacentChange,
  goToFirstChange,
  goToLastChange,
  resolveDiffViewerRevealPath,
  triggerFindReplaceWidget,
  triggerFindWidget,
  waitForDiffCompute,
} from './diffViewerUtils'
import { buildDiffEditorOptions, useDiffViewerOptions } from './useDiffViewerOptions'

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

/** Row staging Git dùng `conflicted`; porcelain còn có UU, AA, … — file có thể không có trên đĩa. */
function isLikelyGitUnmergedWorkingTree(fileStatus: string): boolean {
  const s = (fileStatus || '').trim()
  if (!s) return false
  if (s.toLowerCase() === 'conflicted') return true
  return /^(UU|DD|AA|AU|UA|UD|DU|DA|AD)$/i.test(s)
}

/** Bên “working copy” trong diff: ưu tiên đọc từ disk; conflict/unmerged hoặc ENOENT thì dùng blob/index qua main. */
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

export function CodeDiffViewer() {
  const monaco = useMonaco()
  const { themeMode } = useAppearanceStore()
  const [originalCode, setOriginalCode] = useState('')
  const [modifiedCode, setModifiedCode] = useState('')
  const [filePath, setFilePath] = useState('')
  const [fileStatus, setFileStatus] = useState('')
  const [revision, setRevision] = useState<string | undefined>(undefined)
  const [currentRevision, setCurrentRevision] = useState<string | undefined>(undefined)
  const [isGit, setIsGit] = useState(false)
  const [commitHash, setCommitHash] = useState<string | undefined>(undefined)
  const [currentCommitHash, setCurrentCommitHash] = useState<string | undefined>(undefined)
  const [isRootCommit, setIsRootCommit] = useState(false)
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const [isSwapped, setIsSwapped] = useState(false)
  const [language, setLanguage] = useState('javascript')
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [changePosition, setChangePosition] = useState({ current: 0, total: 0 })
  const [diffStats, setDiffStats] = useState<DiffStats>({ additions: 0, deletions: 0 })
  const [charDiffStats, setCharDiffStats] = useState<CharDiffStats>({ charAdditions: 0, charDeletions: 0 })
  const [charChangeRegions, setCharChangeRegions] = useState(0)
  const editorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null)
  const originalEditableRef = useRef(false)
  const { t } = useTranslation()
  const { viewOptions, setViewOption, adjustFontSize } = useDiffViewerOptions()
  const editorOptions = useMemo(() => buildDiffEditorOptions(viewOptions), [viewOptions])

  useEffect(() => {
    originalEditableRef.current = viewOptions.originalEditable
  }, [viewOptions.originalEditable])

  const refreshDiffState = useCallback(() => {
    const diffEditor = editorRef.current
    if (!diffEditor) return
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

  const filePathRef = useRef(filePath)
  const modifiedCodeRef = useRef(modifiedCode)
  useEffect(() => {
    modifiedCodeRef.current = modifiedCode
  }, [modifiedCode])
  useEffect(() => {
    filePathRef.current = filePath
  }, [filePath])

  const revisionRef = useRef(revision)
  useEffect(() => {
    revisionRef.current = revision
  }, [revision])

  useEffect(() => {
    const handleUiSettingsSynced = (e: CustomEvent<UiSettingsSyncedDetail>) => {
      const selectedTheme = e.detail.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
      monaco?.editor.setTheme(selectedTheme)
    }
    window.addEventListener(SYNCED_EVENT, handleUiSettingsSynced as EventListener)
    return () => window.removeEventListener(SYNCED_EVENT, handleUiSettingsSynced as EventListener)
  }, [monaco])

  const getExtension = (filePath: string): string => {
    const fileName = filePath.split('/').pop() || ''
    const lastDotIndex = fileName.lastIndexOf('.')
    if (lastDotIndex === -1) return ''
    return fileName.slice(lastDotIndex + 1).toLowerCase()
  }

  const detectLanguage = (filePath: string): string => {
    const ext = getExtension(filePath)
    return EXT_TO_LANG[ext] ?? 'plaintext'
  }

  useEffect(() => {
    const handler = (_event: any, { filePath, fileStatus, revision, currentRevision, isGit, commitHash, currentCommitHash, isRootCommit, cwd: cwdFromData }: any) => {
      const path = filePath ?? ''
      setFilePath(path)
      setFileStatus(fileStatus ?? '')
      setRevision(revision)
      setCurrentRevision(currentRevision)
      setIsGit(isGit || false)
      setCommitHash(commitHash)
      setCurrentCommitHash(currentCommitHash)
      setIsRootCommit(isRootCommit || false)
      setCwd(cwdFromData)
      setIsSwapped(false)
      setLanguage(detectLanguage(path))

      // Bỏ qua khi không có path (vd: GET_COMMIT_DIFF diff toàn commit)
      if (!path) return

      if (isGit) {
        handleRefreshGit(path, fileStatus ?? '', commitHash, currentCommitHash, isRootCommit, cwdFromData)
      } else {
        handleRefresh(path, fileStatus ?? '', revision, currentRevision, cwdFromData)
      }
    }
    window.api.on('load-diff-data', handler)

    // CodeDiffViewer lazy load có thể mount sau khi main đã gửi load-diff-data. Request lại để nhận data.
    window.api.electron.send(IPC.WINDOW.REQUEST_DIFF_DATA)

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveFile()
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
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.api.removeAllListeners('load-diff-data')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleFind, handleFindReplace, handleNextChange, handlePrevChange])

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

  const handleEditorMount: DiffOnMount = (editor, _monaco) => {
    editorRef.current = editor
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    editor.onDidUpdateDiff(() => {
      requestAnimationFrame(refreshDiffState)
    })

    modifiedEditor.onDidChangeModelContent(_event => {
      const newModifiedCode = modifiedEditor.getModel()?.getValue() || ''
      setModifiedCode(newModifiedCode)
      requestAnimationFrame(refreshDiffState)
    })

    originalEditor.onDidChangeModelContent(() => {
      if (originalEditableRef.current) {
        setOriginalCode(originalEditor.getModel()?.getValue() || '')
      }
      requestAnimationFrame(refreshDiffState)
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
    if (!diffEditor) return
    diffEditor.updateOptions(buildDiffEditorOptions(viewOptions))
    requestAnimationFrame(() => {
      diffEditor.layout()
      refreshDiffState()
    })
  }, [viewOptions, refreshDiffState])

  useEffect(() => {
    return () => {
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isLoading) return
    const timer = window.setTimeout(() => {
      void refreshDiffStateAfterCompute()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [originalCode, modifiedCode, isLoading, refreshDiffStateAfterCompute])

  const onRefresh = async () => {
    setIsSwapped(false)
    if (isGit) {
      handleRefreshGit(filePath, fileStatus, commitHash, currentCommitHash, isRootCommit, cwd)
    } else {
      handleRefresh(filePath, fileStatus, revision, currentRevision, cwd)
    }
  }

  const isSwap = (): boolean => {
    return currentRevision !== undefined && revision !== undefined && Number(currentRevision) < Number(revision)
  }

  const handleRefresh = async (path: string, fileStatus: string, revision?: string, currentRevision?: string, cwdOverride?: string) => {
    try {
      const swap = isSwap()
      setIsLoading(true)
      const catOpts = cwdOverride ? { cwd: cwdOverride } : undefined
      const originalCode = await window.api.svn.cat(path, fileStatus, revision, catOpts)
      const modifiedCode = currentRevision ? await window.api.svn.cat(path, fileStatus, String(Number(revision) - 1), catOpts) : await window.api.system.read_file(path, catOpts)
      setTimeout(() => {
        if (!currentRevision) {
          setOriginalCode(originalCode.data)
          setModifiedCode(modifiedCode)
        } else {
          if (swap) {
            setOriginalCode(originalCode.data)
            setModifiedCode(modifiedCode.data)
          } else {
            setOriginalCode(modifiedCode.data)
            setModifiedCode(originalCode.data)
          }
        }
      }, 500)
    } catch (error) {
      logger.error('Error loading file for diff:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefreshGit = async (path: string, fileStatus: string, commitHash?: string, currentCommitHash?: string, isRootCommit?: boolean, cwdOverride?: string) => {
    try {
      setIsLoading(true)

      const catOpts = cwdOverride ? { cwd: cwdOverride } : undefined

      // For Git, we need to get file content from different commits
      let originalCode = ''
      let modifiedCode = ''

      if (isRootCommit && commitHash) {
        // Root commit: file was just added, compare empty vs commit content
        const modifiedResult = await window.api.git.cat(path, fileStatus, commitHash, catOpts)
        originalCode = ''
        modifiedCode = modifiedResult.data || ''
      } else if (currentCommitHash) {
        // Comparing two commits
        const originalResult = await window.api.git.cat(path, fileStatus, currentCommitHash, catOpts)
        const modifiedResult = await window.api.git.cat(path, fileStatus, commitHash, catOpts)
        originalCode = originalResult.data || ''
        modifiedCode = modifiedResult.data || ''
      } else {
        // Comparing commit with working copy
        if (commitHash) {
          // Get file from specific commit vs working copy
          const originalResult = await window.api.git.cat(path, fileStatus, commitHash, catOpts)
          originalCode = originalResult.data || ''

          modifiedCode = await readGitWorkingTreeForDiff(path, fileStatus, catOpts)
        } else {
          // Get file from HEAD vs working copy
          const originalResult = await window.api.git.cat(path, fileStatus, 'HEAD', catOpts)
          originalCode = originalResult.data || ''

          modifiedCode = await readGitWorkingTreeForDiff(path, fileStatus, catOpts)
        }
      }

      setTimeout(() => {
        setOriginalCode(originalCode)
        setModifiedCode(modifiedCode)
      }, 500)
    } catch (error) {
      logger.error('Error loading file for Git diff:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSwap = () => {
    setOriginalCode(modifiedCode)
    setModifiedCode(originalCode)
    setIsSwapped(prev => !prev)
  }

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
    const result = await window.api.system.open_file_in_editor({
      filePath,
      lineNumber: line,
      cwd,
    })
    if (!result?.success) {
      toast.error(result?.error || t('dialog.diffViewer.openInEditorFailed'))
    }
  }, [filePath, cwd, cursorPosition.line, t])

  const handleRevealInExplorer = useCallback(() => {
    if (!filePath) return
    window.api.system.reveal_in_file_explorer(resolveDiffViewerRevealPath(filePath, cwd))
  }, [filePath, cwd])

  const handleCopyPath = useCallback(async () => {
    if (!filePath) return
    const text = resolveDiffViewerRevealPath(filePath, cwd)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('toast.copied'))
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }, [filePath, cwd, t])

  const handleSaveFile = async () => {
    try {
      // Don't save if comparing revisions/commits
      if (currentRevision || currentCommitHash) return
      const filePath = filePathRef.current
      if (!filePath || !modifiedCodeRef.current) return
      setIsSaving(true)

      const writeOpts = cwd ? { cwd } : undefined
      const result = await window.api.system.write_file(filePath, modifiedCodeRef.current, writeOpts)

      if (result.success) {
        toast.success(t('toast.fileSaved', { filePath }))
      } else {
        throw new Error(result.error || 'Unknown error')
      }
    } catch (_error) {
      toast.error(t('toast.errorSavingFile'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      <DiffToolbar
        onRefresh={onRefresh}
        onSwapSides={handleSwap}
        onSave={handleSaveFile}
        onPrevChange={handlePrevChange}
        onNextChange={handleNextChange}
        onFirstChange={handleFirstChange}
        onLastChange={handleLastChange}
        changePosition={changePosition}
        disableChangeNav={changePosition.total === 0 || isLoading}
        isSaving={isSaving}
        filePath={filePath}
        disableSave={currentRevision != null || currentCommitHash != null}
        viewOptions={viewOptions}
        onViewOptionChange={setViewOption}
        onFontSizeDecrease={() => adjustFontSize(-1)}
        onFontSizeIncrease={() => adjustFontSize(1)}
        onOpenInEditor={handleOpenInEditor}
        onRevealInExplorer={handleRevealInExplorer}
        onCopyPath={handleCopyPath}
        onFind={handleFind}
        onFindReplace={handleFindReplace}
      />
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <GlowLoader className="w-10 h-10" />
        </div>
      ) : (
        <div className="flex px-4 py-1 text-xs text-gray-500 border-b">
          <div className="flex items-center justify-center w-[50%]">
            <span className="border rounded px-2 dark:bg-gray-200 dark:text-gray-600 font-bold">
              {isGit
                ? isSwapped
                  ? currentCommitHash
                    ? commitHash?.substring(0, 8)
                    : 'Working Copy'
                  : currentCommitHash
                    ? currentCommitHash.substring(0, 8)
                    : commitHash
                      ? commitHash.substring(0, 8)
                      : 'HEAD'
                : isSwapped
                  ? currentRevision
                    ? revision
                    : 'Working Copy'
                  : currentRevision
                    ? Number(revision) - 1
                    : 'Working Base'}
            </span>
          </div>
          <div className="flex items-center justify-center w-[50%]">
            <span className="border rounded px-2 dark:bg-gray-200 dark:text-gray-600 font-bold">
              {isGit
                ? isSwapped
                  ? currentCommitHash
                    ? currentCommitHash.substring(0, 8)
                    : commitHash
                      ? commitHash.substring(0, 8)
                      : 'HEAD'
                  : currentCommitHash
                    ? commitHash?.substring(0, 8)
                    : 'Working Copy'
                : isSwapped
                  ? currentRevision
                    ? Number(revision) - 1
                    : 'Working Base'
                  : currentRevision
                    ? revision
                    : 'Working Copy'}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
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
      <DiffFooterBar
        language={language}
        setLanguage={setLanguage}
        cursorPosition={cursorPosition}
        diffStats={diffStats}
        charDiffStats={charDiffStats}
        charChangeRegions={charChangeRegions}
      />
    </div>
  )
}
