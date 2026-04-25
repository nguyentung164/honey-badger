'use client'

import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react'
import { FileWarning, Loader2, Pencil } from 'lucide-react'
import { IPC } from 'main/constants'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { type BlockResolution, buildResolvedContent, parseSvnConflictBlocks, type SvnConflictBlock } from '@/lib/svnConflictBlocks'
import logger from '@/services/logger'
import { useAppearanceStore, useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'
import { ConflictEditor } from './ConflictEditor'

const EXT_TO_LANGUAGE: Record<string, string> = {
  java: 'java',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bat: 'bat',
  ps1: 'powershell',
}

function getEditorLanguage(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  const ext = lastDot >= 0 ? filePath.slice(lastDot + 1).toLowerCase() : ''
  return EXT_TO_LANGUAGE[ext] || 'plaintext'
}

function previewLines(text: string, maxLines = 3): string {
  const lines = text.split('\n').filter(Boolean)
  return lines.slice(0, maxLines).join('\n') || '(empty)'
}

interface ConflictBlockItemProps {
  block: SvnConflictBlock
  index: number
  resolution?: BlockResolution
  onResolutionChange: (res: BlockResolution) => void
  t: (key: string) => string
}

function ConflictBlockItem({ block, index, resolution, onResolutionChange, t }: ConflictBlockItemProps) {
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="text-sm font-medium">
        {t('svn.conflict.conflictBlock')} {index}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border bg-destructive/5 p-2 font-mono whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
          <div className="text-muted-foreground mb-1">{t('svn.conflict.mine')}</div>
          {previewLines(block.mineContent)}
        </div>
        <div className="rounded border bg-primary/5 p-2 font-mono whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
          <div className="text-muted-foreground mb-1">{t('svn.conflict.theirs')}</div>
          {previewLines(block.theirsContent)}
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" variant={resolution === 'mine' ? 'default' : buttonVariant} onClick={() => onResolutionChange('mine')}>
          {t('svn.conflict.useMine')}
        </Button>
        <Button size="sm" variant={resolution === 'theirs' ? 'default' : buttonVariant} onClick={() => onResolutionChange('theirs')}>
          {t('svn.conflict.useTheirs')}
        </Button>
        <Button size="sm" variant={resolution === 'both-mine-first' ? 'default' : buttonVariant} onClick={() => onResolutionChange('both-mine-first')}>
          {t('svn.conflict.useBothMineFirst')}
        </Button>
        <Button size="sm" variant={resolution === 'both-theirs-first' ? 'default' : buttonVariant} onClick={() => onResolutionChange('both-theirs-first')}>
          {t('svn.conflict.useBothTheirsFirst')}
        </Button>
      </div>
    </div>
  )
}

interface SvnConflictFile {
  path: string
  isRevisionConflict?: boolean
  isBinary?: boolean
}

interface SvnConflictPanelProps {
  sourceFolder?: string
  onResolved?: () => void
  compact?: boolean
}

export function SvnConflictPanel({ sourceFolder, onResolved, compact = false }: SvnConflictPanelProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const { themeMode } = useAppearanceStore()
  const monaco = useMonaco()

  const [conflictData, setConflictData] = useState<{
    hasConflict: boolean
    conflictedFiles: SvnConflictFile[]
  } | null>(null)
  const [selectedFile, setSelectedFile] = useState<SvnConflictFile | null>(null)
  const [conflictDetail, setConflictDetail] = useState<{
    path: string
    isRevisionConflict: boolean
    content?: { working: string; base: string; theirs: string; mine: string }
  } | null>(null)
  const [resolvingFile, setResolvingFile] = useState<string | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [blockResolutions, setBlockResolutions] = useState<Record<string, BlockResolution>>({})
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null)

  const mountedRef = useRef(true)
  const selectedFileRef = useRef<SvnConflictFile | null>(null)
  selectedFileRef.current = selectedFile

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadConflictStatus = useCallback(async () => {
    try {
      const result = await window.api.svn.get_conflict_status(sourceFolder || undefined)
      if (!mountedRef.current) return
      const currentSelected = selectedFileRef.current
      if (result.status === 'success' && result.data) {
        setConflictData(result.data)
        if (!result.data.hasConflict) {
          setSelectedFile(null)
          setConflictDetail(null)
        } else if (currentSelected && !result.data.conflictedFiles.some((f: { path: string }) => f.path === currentSelected.path)) {
          setSelectedFile(result.data.conflictedFiles[0] || null)
          setConflictDetail(null)
        }
      } else {
        if (!mountedRef.current) return
        setConflictData({ hasConflict: false, conflictedFiles: [] })
        setSelectedFile(null)
        setConflictDetail(null)
      }
    } catch (error) {
      logger.error('Error loading SVN conflict status:', error)
      if (!mountedRef.current) return
      setConflictData({ hasConflict: false, conflictedFiles: [] })
      setSelectedFile(null)
      setConflictDetail(null)
    }
  }, [sourceFolder])

  const dataSnapshotRef = useRef<string | null>(null)

  useEffect(() => {
    loadConflictStatus()
  }, [sourceFolder, loadConflictStatus])

  useEffect(() => {
    const handleConfigChange = () => {
      const newSnapshot = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
      if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
        return
      }
      dataSnapshotRef.current = newSnapshot
      loadConflictStatus()
    }
    const handleFilesChanged = () => loadConflictStatus()
    window.addEventListener('configuration-changed', handleConfigChange)
    window.api.on(IPC.FILES_CHANGED, handleFilesChanged)
    return () => {
      window.removeEventListener('configuration-changed', handleConfigChange)
      window.api.removeListener(IPC.FILES_CHANGED, handleFilesChanged)
    }
  }, [loadConflictStatus])

  useEffect(() => {
    if (!selectedFile || selectedFile.isBinary || selectedFile.isRevisionConflict) {
      setConflictDetail(selectedFile ? { path: selectedFile.path, isRevisionConflict: !!selectedFile.isRevisionConflict } : null)
      return
    }
    let cancelled = false
    setIsLoadingDetail(true)
    setConflictDetail(null)
    window.api.svn
      .get_conflict_detail(selectedFile.path, sourceFolder)
      .then(result => {
        if (cancelled) return
        if (result.status === 'success' && result.data) {
          setConflictDetail(result.data)
        } else {
          setConflictDetail({ path: selectedFile.path, isRevisionConflict: false })
        }
      })
      .catch(err => {
        if (!cancelled) {
          logger.error('Error loading conflict detail:', err)
          setConflictDetail({ path: selectedFile.path, isRevisionConflict: false })
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedFile, sourceFolder])

  useEffect(() => {
    if (conflictData?.hasConflict && conflictData.conflictedFiles.length > 0 && !selectedFile) {
      setSelectedFile(conflictData.conflictedFiles[0])
    }
  }, [conflictData, selectedFile])

  useEffect(() => {
    setBlockResolutions({})
  }, [selectedFile?.path])

  const parsedConflict = useMemo(() => {
    if (!conflictDetail?.content) return null
    const { working, base } = conflictDetail.content
    const fromWorking = parseSvnConflictBlocks(working || '')
    if (fromWorking.hasMarkers) return { ...fromWorking, sourceContent: working || '' }
    const fromBase = parseSvnConflictBlocks(base || '')
    if (fromBase.hasMarkers) return { ...fromBase, sourceContent: base || '' }
    return { ...fromWorking, sourceContent: working || '' }
  }, [conflictDetail?.content])

  const hasInlineBlocks = parsedConflict?.hasMarkers && (parsedConflict?.blocks?.length ?? 0) > 0

  const handleResolveWithContent = useCallback(
    async (filePath: string, content: string) => {
      setResolvingFile(filePath)
      try {
        const result = await window.api.svn.resolve_conflict_with_content(filePath, content, sourceFolder)
        if (result.status === 'success') {
          toast.success(t('svn.conflict.resolveSuccess'))
          await loadConflictStatus()
          onResolved?.()
        } else {
          toast.error(result.message || t('svn.conflict.resolveError'))
        }
      } catch (error) {
        logger.error('Error resolving SVN conflict with content:', error)
        toast.error(t('svn.conflict.resolveError'))
      } finally {
        setResolvingFile(null)
      }
    },
    [sourceFolder, loadConflictStatus, onResolved, t]
  )

  const handleApplyInlineResolve = useCallback(() => {
    if (!selectedFile || !parsedConflict?.blocks?.length || !parsedConflict?.sourceContent) return
    const content = buildResolvedContent(parsedConflict.sourceContent, parsedConflict.blocks, blockResolutions)
    void handleResolveWithContent(selectedFile.path, content)
  }, [selectedFile, parsedConflict, blockResolutions, handleResolveWithContent])

  const handleEditManually = useCallback(() => {
    if (!selectedFile || !conflictDetail?.content) return
    const contentToEdit = parsedConflict?.sourceContent ?? conflictDetail.content.working
    setEditingFile({ path: selectedFile.path, content: contentToEdit })
  }, [selectedFile, conflictDetail?.content, parsedConflict])

  const handleSaveManualEdit = useCallback(
    async (content: string) => {
      if (!editingFile || !sourceFolder) return
      try {
        await handleResolveWithContent(editingFile.path, content)
        setEditingFile(null)
      } catch (error) {
        logger.error('Error saving manual conflict resolution:', error)
        toast.error(t('svn.conflict.resolveError'))
        throw error
      }
    },
    [editingFile, sourceFolder, handleResolveWithContent, t]
  )

  useEffect(() => {
    if (!monaco) return
    monaco.editor.defineTheme('svn-conflict-dark', {
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
    monaco.editor.defineTheme('svn-conflict-light', {
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
    const theme = themeMode === 'dark' ? 'svn-conflict-dark' : 'svn-conflict-light'
    monaco.editor.setTheme(theme)
  }, [monaco, themeMode])

  const handleResolve = async (filePath: string, resolution: 'working' | 'theirs' | 'mine' | 'base' | '', isRevisionConflict?: boolean) => {
    setResolvingFile(filePath)
    try {
      const result = await window.api.svn.merge_resolve_conflict(filePath, resolution, isRevisionConflict)
      if (result.status === 'success') {
        toast.success(t('svn.conflict.resolveSuccess'))
        await loadConflictStatus()
        onResolved?.()
      } else {
        toast.error(result.message || t('svn.conflict.resolveError'))
      }
    } catch (error) {
      logger.error('Error resolving SVN conflict:', error)
      toast.error(t('svn.conflict.resolveError'))
    } finally {
      setResolvingFile(null)
    }
  }

  if (!conflictData?.hasConflict || conflictData.conflictedFiles.length === 0) {
    return null
  }

  const editorTheme = themeMode === 'dark' ? 'svn-conflict-dark' : 'svn-conflict-light'
  const editorLang = selectedFile ? getEditorLanguage(selectedFile.path) : 'plaintext'
  const editorOptions = {
    renderWhitespace: 'all' as const,
    readOnly: true,
    fontSize: 12,
    fontFamily: 'Jetbrains Mono NL, monospace',
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    contextmenu: true,
    showFoldingControls: 'always' as const,
    smoothScrolling: true,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    renderValidationDecorations: 'off' as const,
  }

  if (compact) {
    return (
      <div className="border rounded-lg p-2 space-y-2 bg-destructive/5 border-destructive/30">
        <Label className="text-destructive font-medium">{t('svn.conflict.title')}</Label>
        <ScrollArea className="rounded-md border h-[120px]">
          <div className="p-2 space-y-1">
            {conflictData.conflictedFiles.map(file => (
              <div key={file.path} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                <span className="text-sm truncate flex-1" title={file.path}>
                  {file.path}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file.path, 'mine', file.isRevisionConflict)} disabled={resolvingFile === file.path}>
                    {resolvingFile === file.path ? <Loader2 className="h-3 w-3 animate-spin" /> : t('svn.conflict.mine')}
                  </Button>
                  <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file.path, 'theirs', file.isRevisionConflict)} disabled={resolvingFile === file.path}>
                    {resolvingFile === file.path ? <Loader2 className="h-3 w-3 animate-spin" /> : t('svn.conflict.theirs')}
                  </Button>
                  <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file.path, 'base', file.isRevisionConflict)} disabled={resolvingFile === file.path}>
                    {resolvingFile === file.path ? <Loader2 className="h-3 w-3 animate-spin" /> : t('svn.conflict.base')}
                  </Button>
                  <Button size="sm" variant={buttonVariant} onClick={() => handleResolve(file.path, 'working', file.isRevisionConflict)} disabled={resolvingFile === file.path}>
                    {resolvingFile === file.path ? <Loader2 className="h-3 w-3 animate-spin" /> : t('svn.conflict.working')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-destructive/5 border-destructive/30 flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b">
        <Label className="text-destructive font-medium">{t('svn.conflict.title')}</Label>
      </div>
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={40} minSize={15} className="flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {conflictData.conflictedFiles.map(file => (
                <button
                  key={file.path}
                  type="button"
                  className={`w-full text-left p-1.5 rounded text-sm flex items-center gap-1 ${selectedFile?.path === file.path ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    }`}
                  onClick={() => setSelectedFile(file)}
                >
                  <FileWarning className="h-4 w-4 shrink-0" />
                  <span className="truncate">{file.path}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60} minSize={40} className="flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-h-0 p-2">
            {isLoadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : conflictDetail?.isRevisionConflict ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <p className="text-sm text-muted-foreground mb-4">{t('svn.conflict.conflictRevision')}</p>
                <Button variant={buttonVariant} onClick={() => selectedFile && handleResolve(selectedFile.path, 'working', true)} disabled={resolvingFile === selectedFile?.path}>
                  {resolvingFile === selectedFile?.path ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('svn.conflict.resolve')}
                </Button>
              </div>
            ) : selectedFile?.isBinary ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{t('svn.conflict.binaryFile')}</p>
              </div>
            ) : editingFile ? (
              <ConflictEditor
                filePath={editingFile.path}
                initialContent={editingFile.content}
                language={editorLang}
                onSave={handleSaveManualEdit}
                onCancel={() => setEditingFile(null)}
              />
            ) : conflictDetail?.content ? (
              <Tabs key={selectedFile?.path} defaultValue={hasInlineBlocks ? 'inline' : 'working'} className="flex-1 flex flex-col min-h-0">
                <TabsList className={`grid w-full ${hasInlineBlocks ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {hasInlineBlocks && <TabsTrigger value="inline">{t('svn.conflict.inlineResolve')}</TabsTrigger>}
                  <TabsTrigger value="base">{t('svn.conflict.base')}</TabsTrigger>
                  <TabsTrigger value="working">{t('svn.conflict.working')}</TabsTrigger>
                  <TabsTrigger value="diff">{t('svn.conflict.diff')}</TabsTrigger>
                </TabsList>
                {hasInlineBlocks && parsedConflict && (
                  <TabsContent value="inline" className="flex-1 min-h-0 mt-2">
                    <div className="flex flex-col h-full gap-3">
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-2 space-y-3">
                          {parsedConflict.blocks.map((block, idx) => (
                            <ConflictBlockItem
                              key={block.id}
                              block={block}
                              index={idx + 1}
                              resolution={blockResolutions[block.id]}
                              onResolutionChange={res => setBlockResolutions(prev => ({ ...prev, [block.id]: res }))}
                              t={t}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" onClick={handleApplyInlineResolve} disabled={resolvingFile === selectedFile?.path}>
                          {resolvingFile === selectedFile?.path ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                          {t('svn.conflict.applyAndResolve')}
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant={buttonVariant} onClick={handleEditManually}>
                                <Pencil className="h-3 w-3 mr-2" />
                                {t('svn.conflict.editManually')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('svn.conflict.editManuallyTooltip')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </TabsContent>
                )}
                <TabsContent value="base" className="flex-1 min-h-0 mt-2">
                  <Editor height="100%" language={editorLang} theme={editorTheme} value={conflictDetail.content.base} options={editorOptions} />
                </TabsContent>
                <TabsContent value="working" className="flex-1 min-h-0 mt-2">
                  <Editor height="100%" language={editorLang} theme={editorTheme} value={conflictDetail.content.working} options={editorOptions} />
                </TabsContent>
                <TabsContent value="diff" className="flex-1 min-h-0 mt-2">
                  <div className="h-full rounded border overflow-hidden">
                    <DiffEditor
                      height="100%"
                      language={editorLang}
                      theme={editorTheme}
                      original={conflictDetail.content.mine}
                      modified={conflictDetail.content.theirs}
                      options={{
                        ...editorOptions,
                        renderIndicators: true,
                        renderMarginRevertIcon: true,
                        diffAlgorithm: 'advanced',
                      }}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{t('svn.conflict.selectConflict')}</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      {selectedFile && !editingFile && (
        <div className="p-2 border-t flex gap-2 flex-wrap items-center">
          {selectedFile.isRevisionConflict ? (
            <Button variant={buttonVariant} size="sm" onClick={() => handleResolve(selectedFile.path, 'working', true)} disabled={resolvingFile === selectedFile.path}>
              {resolvingFile === selectedFile.path ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
              {t('svn.conflict.resolve')}
            </Button>
          ) : (
            <>
              <Button variant={buttonVariant} size="sm" onClick={() => handleResolve(selectedFile.path, 'mine')} disabled={resolvingFile === selectedFile.path}>
                {resolvingFile === selectedFile.path ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                {t('svn.conflict.mine')}
              </Button>
              <Button variant={buttonVariant} size="sm" onClick={() => handleResolve(selectedFile.path, 'theirs')} disabled={resolvingFile === selectedFile.path}>
                {resolvingFile === selectedFile.path ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                {t('svn.conflict.theirs')}
              </Button>
              <Button variant={buttonVariant} size="sm" onClick={() => handleResolve(selectedFile.path, 'base')} disabled={resolvingFile === selectedFile.path}>
                {resolvingFile === selectedFile.path ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                {t('svn.conflict.base')}
              </Button>
              <Button variant={buttonVariant} size="sm" onClick={() => handleResolve(selectedFile.path, 'working')} disabled={resolvingFile === selectedFile.path}>
                {resolvingFile === selectedFile.path ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                {t('svn.conflict.working')}
              </Button>
              {conflictDetail?.content && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={buttonVariant} size="sm" onClick={handleEditManually}>
                        <Pencil className="h-3 w-3 mr-2" />
                        {t('svn.conflict.editManually')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('svn.conflict.editManuallyTooltip')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
