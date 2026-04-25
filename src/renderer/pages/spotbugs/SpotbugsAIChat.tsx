'use client'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Bot, Check, Copy, FileCode, Target } from 'lucide-react'
import { useTheme } from 'next-themes'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { LANGUAGES } from '@/components/shared/constants'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useAppearanceStore, useButtonVariant } from '@/stores/useAppearanceStore'
import type { BugInstance } from './constants'

interface CustomCodeProps {
  node?: any
  inline?: boolean
  className?: string
  children?: ReactNode
  [key: string]: any
}

interface SourceLineOption {
  label: string
  value: string
  sourceLine: {
    classname: string
    start: number | null
    end: number | null
    sourcefile: string
    fileContent?: string
    filePath?: string
  }
}

export const SpotbugsAIChat = ({
  bug,
  isLoading: isParentLoading,
  filePaths,
  selectedSourceLineKey = '',
  onAiLoadingChange,
}: {
  bug: BugInstance | null
  isLoading: boolean
  filePaths: string[]
  selectedSourceLineKey?: string
  onAiLoadingChange?: (isLoading: boolean) => void
}) => {
  const variant = useButtonVariant()
  const { t } = useTranslation()
  const appearanceStore = useAppearanceStore()
  const { language, themeMode } = appearanceStore
  const monaco = useMonaco()
  const { resolvedTheme } = useTheme()
  const [aiResponses, setAiResponses] = useState<Record<string, Record<string, string>>>({})
  const [aiResponse, setAiResponse] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [sourceLineOptions, setSourceLineOptions] = useState<SourceLineOption[]>([])
  const [selectedSourceLine, setSelectedSourceLine] = useState<string>('')
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('code')
  const editorRef = useRef<any>(null)

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
  }, [monaco, themeMode, resolvedTheme])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'ui-settings') {
        try {
          const storage = JSON.parse(event.newValue || '{}')
          const currentThemeMode = storage.state?.themeMode
          if (currentThemeMode && monaco) {
            const selectedTheme = currentThemeMode === 'dark' ? 'custom-dark' : 'custom-light'
            monaco.editor.setTheme(selectedTheme)
          }
        } catch (error) {
          logger.error('Error parsing storage event:', error)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [monaco])

  useEffect(() => {
    if (activeTab === 'code' && monaco) {
      try {
        const storedSettings = localStorage.getItem('ui-settings')
        if (storedSettings) {
          const settings = JSON.parse(storedSettings)
          const currentThemeMode = settings.state?.themeMode || themeMode
          const selectedTheme = currentThemeMode === 'dark' ? 'custom-dark' : 'custom-light'
          monaco.editor.setTheme(selectedTheme)
        } else {
          const selectedTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light'
          monaco.editor.setTheme(selectedTheme)
        }
      } catch (error) {
        logger.error('Error reading theme from localStorage:', error)
        const selectedTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light'
        monaco.editor.setTheme(selectedTheme)
      }
    }
  }, [activeTab, monaco, themeMode])

  useEffect(() => {
    setIsAiLoading(false)
    setSourceLineOptions([])
    setSelectedSourceLine('')
    setFileContents({})
    if (bug?.sourceLines && bug.sourceLines.length > 0) {
      loadSourceLineOptions(bug)
    }
    if (selectedSourceLineKey && sourceLineOptions.some(option => option.value === selectedSourceLineKey)) {
      setSelectedSourceLine(selectedSourceLineKey)
    }
  }, [bug])

  useEffect(() => {
    if (bug?.id && selectedSourceLine) {
      const savedResponse = aiResponses[bug.id]?.[selectedSourceLine] || ''
      setAiResponse(savedResponse)
    } else {
      setAiResponse('')
    }
  }, [bug?.id, selectedSourceLine, aiResponses])

  const loadSourceLineOptions = async (bug: BugInstance | null) => {
    if (!bug || !bug.sourceLines) return
    if (!bug.sourceLines || bug.sourceLines.length === 0) return
    const options: SourceLineOption[] = []
    const contents: Record<string, string> = {}
    const pathsMap: Record<string, string> = {}
    for (const sourceLine of bug.sourceLines) {
      if (!sourceLine.start || !sourceLine.end || !sourceLine.sourcefile) continue
      const start = sourceLine.start || 0
      const end = sourceLine.end || 0
      const optionValue = `${sourceLine.classname}:${start}-${end}`
      const optionLabel = `${sourceLine.sourcefile} (${start}-${end})`
      const { fileContent, filePath } = await getFileContent(sourceLine.sourcefile)
      options.push({
        label: optionLabel,
        value: optionValue,
        sourceLine: {
          ...sourceLine,
          fileContent,
          filePath,
        },
      })
      contents[optionValue] = fileContent || ''
      if (filePath) pathsMap[optionValue] = filePath
    }
    setSourceLineOptions(options)
    setFileContents(contents)
    if (options.length > 0) {
      setSelectedSourceLine(options[0].value)
    }
  }

  const getFileContent = async (sourceFile: string): Promise<{ fileContent: string; filePath?: string }> => {
    try {
      const matchingFilePath = filePaths.find(filePath => filePath.endsWith(sourceFile) || sourceFile.endsWith(filePath))
      if (matchingFilePath) {
        logger.info(`Reading file from filePaths: ${matchingFilePath}`)
        const fileContent = await window.api.system.read_file(matchingFilePath)
        if (fileContent && typeof fileContent === 'string') {
          return { fileContent, filePath: matchingFilePath }
        }
      } else {
        logger.error(`No matching file found in filePaths for ${sourceFile}`)
      }
    } catch (fileError) {
      logger.error('Error reading source file:', fileError)
    }
    return { fileContent: '' }
  }

  const handleExplainError = async () => {
    if (!bug) return
    setIsAiLoading(true)
    onAiLoadingChange?.(true)
    setAiResponse('')
    try {
      const languageName = LANGUAGES.find(lang => lang.code === language)?.label || 'English'
      const selectedOption = sourceLineOptions.find(option => option.value === selectedSourceLine)
      if (!selectedOption) {
        throw new Error('No source line selected')
      }
      const { sourcefile, start, end } = selectedOption.sourceLine
      const fileContent = fileContents[selectedSourceLine] || ''

      let selectedCodeContent = ''
      if (fileContent && start && end) {
        const lines = fileContent.split('\n')
        const selectedLines = lines.slice(start - 3, end + 3)
        selectedCodeContent = selectedLines.join('\n')
      }

      let methodMessage = ''
      if (bug.methods && Array.isArray(bug.methods)) {
        if (selectedOption?.sourceLine) {
          const matchingMethod = bug.methods.find(
            method => method?.sourceLine?.start === selectedOption.sourceLine?.start && method?.sourceLine?.end === selectedOption.sourceLine?.end
          )

          if (matchingMethod?.message) {
            methodMessage = matchingMethod.message
          } else if (bug.methods.length > 0 && bug.methods[0]?.message) {
            methodMessage = bug.methods[0].message
          }
        } else if (bug.methods.length > 0 && bug.methods[0]?.message) {
          methodMessage = bug.methods[0].message
        }
      } else if (bug.message) {
        methodMessage = bug.message
      }

      const prompt = `Formatting re-enabled.
      Explain the following SpotBugs issue. Bug type: "${bug.type}", Category: "${bug.category}", Priority: ${bug.priority}, Message: "${methodMessage}\n\n".
      ${selectedCodeContent ? `Code from file ${sourcefile} (lines ${start}-${end}):\n\`\`\`\n${selectedCodeContent}\n\`\`\`` : `Unable to retrieve code from file "${sourcefile}".`}\n\n
      Provide a concise explanation and suggest possible solutions in ${languageName}.`
      logger.debug('Prompt for AI:', prompt)
      const response = await window.api.openai.chat(prompt)
      const responseText = response || t('dialog.spotbugs.ai.noResponse')
      setAiResponse(responseText)

      if (bug.id) {
        setAiResponses(prev => ({
          ...prev,
          [bug.id]: {
            ...(prev[bug.id] || {}),
            [selectedSourceLine]: responseText,
          },
        }))
      }
    } catch (error) {
      logger.error('AI explanation error:', error)
      setAiResponse(t('dialog.spotbugs.ai.error'))
      toast.error(t('toast.aiError'))
    } finally {
      setIsAiLoading(false)
      onAiLoadingChange?.(false)
    }
  }

  const handleSourceLineChange = (value: string) => {
    setSelectedSourceLine(value)
    setTimeout(() => {
      if (editorRef.current && monaco) {
        const selectedOption = sourceLineOptions.find(option => option.value === value)
        if (selectedOption?.sourceLine?.start && selectedOption?.sourceLine?.end) {
          const decorationsCollection = editorRef.current.createDecorationsCollection()
          decorationsCollection.set([
            {
              range: new monaco.Range(selectedOption.sourceLine.start, 1, selectedOption.sourceLine.end, 1),
              options: {
                isWholeLine: true,
                className: 'line-highlight',
              },
            },
          ])
          editorRef.current.revealLineInCenter(selectedOption.sourceLine.start)
        }
      }
    }, 200)
  }

  const handleEditorDidMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor
    const selectedOption = sourceLineOptions.find(option => option.value === selectedSourceLine)
    if (selectedOption?.sourceLine?.start && selectedOption?.sourceLine?.end) {
      const decorationsCollection = editor.createDecorationsCollection()
      decorationsCollection.set([
        {
          range: new monacoInstance.Range(selectedOption.sourceLine.start, 1, selectedOption.sourceLine.end, 1),
          options: {
            isWholeLine: true,
            className: 'line-highlight',
          },
        },
      ])
      setTimeout(() => {
        editor.revealLineInCenter(selectedOption.sourceLine.start)
      }, 10)
    }
  }

  const scrollToErrorLine = () => {
    if (editorRef.current && selectedSourceLine) {
      const selectedOption = sourceLineOptions.find(option => option.value === selectedSourceLine)
      if (selectedOption?.sourceLine?.start) {
        editorRef.current.revealLineInCenter(selectedOption.sourceLine.start)
      }
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  if (isParentLoading || !bug) {
    return <div className="p-4 text-center text-muted-foreground">{isParentLoading ? t('message.loading') : t('message.selectIssueToUseAI')}</div>
  }

  const selectedOption = sourceLineOptions.find(option => option.value === selectedSourceLine)

  return (
    <div className="flex flex-col h-full p-2 space-y-2">
      {sourceLineOptions.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="source-line-select">Chọn Source Line</Label>
          <div className="flex items-center space-x-2">
            <Combobox
              value={selectedSourceLine}
              onValueChange={handleSourceLineChange}
              options={sourceLineOptions.map(option => ({ value: option.value, label: option.label }))}
              placeholder="Chọn source line"
              className="flex-grow"
            />

            <Button
              id="ai-assistant-button"
              className={`relative ${isAiLoading ? 'border-effect cursor-progress' : ''}`}
              variant={variant}
              size="icon"
              title={t('dialog.spotbugs.ai.explainButton')}
              onClick={() => {
                setActiveTab('ai')
                if (!isAiLoading && selectedOption) {
                  handleExplainError()
                }
              }}
              disabled={!selectedOption || isAiLoading}
            >
              {isAiLoading ? <GlowLoader /> : <Bot className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {selectedOption && (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full h-full">
          <TabsList className="mb-2">
            <TabsTrigger value="code" className="flex items-center gap-1">
              <FileCode className="h-4 w-4" />
              <span>File Content</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-1">
              <Bot className="h-4 w-4" />
              <span>AI Assistant</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code">
            <div className="rounded-md border bg-muted/50 p-2 h-full relative overflow-auto h-full" style={{ minHeight: '300px' }}>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 z-10 hover:bg-background/50"
                onClick={scrollToErrorLine}
                title={t('dialog.spotbugs.focusOnErrorLine', { defaultValue: 'Focus on error line' })}
              >
                <Target className="h-4 w-4" />
              </Button>
              <Editor
                defaultLanguage="java"
                value={fileContents[selectedSourceLine] || '// Không có nội dung file'}
                theme={(() => {
                  try {
                    const storedSettings = localStorage.getItem('ui-settings')
                    if (storedSettings) {
                      const settings = JSON.parse(storedSettings)
                      const currentThemeMode = settings.state?.themeMode || themeMode
                      return currentThemeMode === 'dark' ? 'custom-dark' : 'custom-light'
                    }
                  } catch (error) {
                    logger.error('Error reading theme from localStorage:', error)
                  }
                  return themeMode === 'dark' ? 'custom-dark' : 'custom-light'
                })()}
                key={`monaco-editor-${selectedSourceLine}-${activeTab}`}
                options={{
                  renderWhitespace: 'all',
                  fontSize: 13,
                  readOnly: true,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                }}
                onMount={handleEditorDidMount}
              />
            </div>
          </TabsContent>

          <TabsContent value="ai">
            <div className="rounded-md border bg-muted/50 p-2 h-full relative overflow-auto">
              <div className="absolute inset-0 p-4 prose prose-sm dark:prose-invert max-w-none h-full">
                <OverlayLoader isLoading={isAiLoading} />
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: CustomCodeProps) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeString = String(children).replace(/\n$/, '')
                      const copyToClipboard = (text: string) => {
                        navigator.clipboard
                          .writeText(text)
                          .then(() => {
                            setCopiedCode(text)
                            setTimeout(() => setCopiedCode(null), 2000)
                          })
                          .catch(err => {
                            logger.error('Không thể copy vào clipboard:', err)
                            toast.error('Không thể copy vào clipboard')
                          })
                      }
                      return !inline && match ? (
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(codeString)}
                            title="Copy code"
                          >
                            {copiedCode === codeString ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <SyntaxHighlighter style={dracula as any} language={match[1]} PreTag="div" className={className}>
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      )
                    },
                  }}
                >
                  {aiResponse}
                </ReactMarkdown>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
