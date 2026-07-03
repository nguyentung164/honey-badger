import Editor, { useMonaco } from '@monaco-editor/react'
import { FileCode, Target } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { onAppMonacoBeforeMount, useAppMonacoThemeId, useSyncAppMonacoTheme } from '@/hooks/useAppMonacoTheme'

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
  const monacoTheme = useAppMonacoThemeId()
  useSyncAppMonacoTheme(monaco, { includeDiff: true, includeEditorRules: false })
  const editorRef = useRef<any>(null)
  const [isOpen, setIsOpen] = useState(false)

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
                theme={monacoTheme}
                beforeMount={onAppMonacoBeforeMount}
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
