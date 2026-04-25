import Editor, { useMonaco } from '@monaco-editor/react'
import { FileCode, Target } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import logger from '@/services/logger'
import { useAppearanceStore } from '@/stores/useAppearanceStore'

interface CodeSnippetDialogProps {
  trigger: React.ReactNode
  title: string
  fileContent: string | null | undefined
  codeSnippet: string | null | undefined
  startLine: number | null | undefined
  endLine: number | null | undefined
}

export const CodeSnippetDialog = ({ trigger, title, fileContent, codeSnippet, startLine, endLine }: CodeSnippetDialogProps) => {
  const { t } = useTranslation()
  const monaco = useMonaco()
  const { resolvedTheme } = useTheme()
  const appearanceStore = useAppearanceStore()
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

    const selectedTheme = appearanceStore.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
    monaco.editor.setTheme(selectedTheme)
  }, [monaco, appearanceStore.themeMode, resolvedTheme])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'ui-settings') {
        const storage = JSON.parse(event.newValue || '{}')
        const html = document.documentElement
        html.classList.remove('dark', 'light')
        html.setAttribute('data-theme-mode', storage.state.themeMode)
        html.setAttribute('data-font-size', storage.state.fontSize)
        html.setAttribute('data-font-family', storage.state.fontFamily)
        html.setAttribute('data-button-variant', storage.state.buttonVariant)
        for (const cls of html.classList) {
          if (cls.startsWith('theme-')) {
            html.classList.remove(cls)
          }
        }
        html.classList.add(storage.state.theme)
        html.classList.add(storage.state.themeMode)
        const selectedTheme = storage.state.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
        monaco?.editor.setTheme(selectedTheme)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [monaco])

  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isOpen && monaco) {
      try {
        const storedSettings = localStorage.getItem('ui-settings')
        if (storedSettings) {
          const settings = JSON.parse(storedSettings)
          const currentThemeMode = settings.state?.themeMode || appearanceStore.themeMode
          const selectedTheme = currentThemeMode === 'dark' ? 'custom-dark' : 'custom-light'
          monaco.editor.setTheme(selectedTheme)
        } else {
          const selectedTheme = appearanceStore.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
          monaco.editor.setTheme(selectedTheme)
        }
      } catch (error) {
        logger.error('Error reading theme from localStorage:', error)
        const selectedTheme = appearanceStore.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
        monaco.editor.setTheme(selectedTheme)
      }
    }
  }, [isOpen, monaco, appearanceStore.themeMode])

  const scrollToHighlightedLine = () => {
    if (editorRef.current && startLine !== null && startLine !== undefined) {
      let highlightStartLine: number
      if (fileContent) {
        highlightStartLine = startLine
      } else {
        highlightStartLine = Math.max(1, startLine - firstSnippetLineNumber + 1)
      }
      editorRef.current.revealLineInCenter(highlightStartLine)
    }
  }
  const firstSnippetLineNumber = startLine !== null && startLine !== undefined ? Math.max(1, startLine - 5) : 1

  const displayContent = fileContent ?? codeSnippet
  const displayLanguage = 'java'

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex flex-col h-full sm:max-w-[90vw] max-h-[90vh]" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center">
            <FileCode className="h-5 w-5 mr-2" />
            {title || t('dialog.spotbugs.codeSnippetTitle', { defaultValue: 'Code Snippet' })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden px-6 pb-6">
          {displayContent ? (
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-4 z-10 bg-background/80 hover:bg-background"
                onClick={scrollToHighlightedLine}
                title={t('dialog.spotbugs.focusOnErrorLine', { defaultValue: 'Focus on highlighted line' })}
              >
                <Target className="h-4 w-4" />
              </Button>
              <Editor
                height="100%"
                language={displayLanguage}
                value={displayContent}
                theme={(() => {
                  try {
                    const storedSettings = localStorage.getItem('ui-settings')
                    if (storedSettings) {
                      const settings = JSON.parse(storedSettings)
                      const currentThemeMode = settings.state?.themeMode || appearanceStore.themeMode
                      return currentThemeMode === 'dark' ? 'custom-dark' : 'custom-light'
                    }
                  } catch (error) {
                    logger.error('Error reading theme from localStorage:', error)
                  }
                  return appearanceStore.themeMode === 'dark' ? 'custom-dark' : 'custom-light'
                })()}
                key={`monaco-editor-${title}-${isOpen}`}
                onMount={(editor, monacoInstance) => {
                  editorRef.current = editor
                  if (startLine !== null && startLine !== undefined && endLine !== null && endLine !== undefined) {
                    let highlightStartLine: number
                    let highlightEndLine: number
                    if (fileContent) {
                      highlightStartLine = startLine
                      highlightEndLine = endLine
                    } else {
                      highlightStartLine = Math.max(1, startLine - firstSnippetLineNumber + 1)
                      highlightEndLine = Math.max(1, endLine - firstSnippetLineNumber + 1)
                    }
                    const decorationsCollection = editor.createDecorationsCollection()
                    decorationsCollection.set([
                      {
                        range: new monacoInstance.Range(highlightStartLine, 1, highlightEndLine, 1),
                        options: {
                          isWholeLine: true,
                          className: 'line-highlight',
                        },
                      },
                    ])
                    setTimeout(() => {
                      editor.revealLineInCenter(highlightStartLine)
                    }, 10)
                  }
                }}
                options={{
                  renderWhitespace: 'all',
                  readOnly: true,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  wordWrap: 'on',
                  lineNumbers: fileContent ? 'on' : line => String(line + firstSnippetLineNumber - 1),
                  lineNumbersMinChars: 4,
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground p-4">
              {t('dialog.spotbugs.noCodeSnippet', { defaultValue: 'No code snippet available' })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
