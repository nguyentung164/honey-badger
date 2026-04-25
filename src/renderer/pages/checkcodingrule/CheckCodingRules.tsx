'use client'
import { Sparkles, X } from 'lucide-react'
import { IPC } from 'main/constants'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LANGUAGES } from '@/components/shared/constants'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { CheckCodingRulesToolbar } from './CheckCodingRulesToolbar'

interface ViolationRow {
  no: string
  criterion: string
  result: string
  violationSummary: string
  explanation: string
  offendingCode: string
}

export function CheckCodingRules() {
  const { language } = useAppearanceStore()
  const { versionControlSystem, loadConfigurationConfig } = useConfigurationStore()
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [result, setResult] = useState('')
  const [codingRuleName, setCodingRuleName] = useState('')
  const [codingRuleId, setCodingRuleId] = useState('')
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [parsedViolations, setParsedViolations] = useState<ViolationRow[]>([])
  const [selectedViolation, setSelectedViolation] = useState<ViolationRow | null>(null)
  const [isAIFixDialogOpen, setIsAIFixDialogOpen] = useState(false)
  const [aiFixResult, setAiFixResult] = useState('')
  const [isAIFixLoading, setIsAIFixLoading] = useState(false)

  const parseMarkdownTable = useCallback((markdown: string): ViolationRow[] => {
    const lines = markdown.split('\n').filter(line => line.trim())
    const violations: ViolationRow[] = []

    // Find table content (skip headers and separator)
    const tableRows = lines.filter(line => {
      const trimmed = line.trim()
      return trimmed.startsWith('|') && !trimmed.includes('---') && !trimmed.toLowerCase().includes('no') && !trimmed.toLowerCase().includes('criterion')
    })

    for (const row of tableRows) {
      const cells = row
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell)
      if (cells.length >= 6) {
        violations.push({
          no: cells[0],
          criterion: cells[1],
          result: cells[2],
          violationSummary: cells[3],
          explanation: cells[4],
          offendingCode: cells[5],
        })
      }
    }

    return violations
  }, [])

  const handleRefresh = useCallback(
    async (files: any[], ruleIdOrName?: string, ruleName?: string) => {
      if (files.length === 0) {
        toast.warning(t('message.noFilesWarning'))
        return
      }
      const languageName = LANGUAGES.find(lang => lang.code === language)?.label || 'English'
      setIsLoading(true)

      let result: any
      if (versionControlSystem === 'git') {
        const selectedFilePaths = files.map((file: any) => file.filePath || file)
        result = await window.api.git.get_diff(selectedFilePaths)
      } else {
        result = await window.api.svn.get_diff(files)
      }

      const { status, message, data } = result
      if (status === 'success') {
        const params = {
          type: 'CHECK_VIOLATIONS' as const,
          values: {
            diff_content: data.diffContent,
            language: languageName,
            codingRuleId: ruleIdOrName ?? '',
            codingRuleName: ruleName ?? ruleIdOrName ?? '',
          },
        }
        const openai_result = await window.api.openai.send_message(params)
        setResult(openai_result)
        setParsedViolations(parseMarkdownTable(openai_result))
        setIsLoading(false)
        toast.success(t('toast.checkSuccess'))
      } else {
        toast.error(message)
        setIsLoading(false)
      }
    },
    [versionControlSystem, language, t, parseMarkdownTable]
  )

  const handleRefreshWithState = useCallback(
    () => handleRefresh(selectedFiles, codingRuleId || undefined, codingRuleName),
    [handleRefresh, selectedFiles, codingRuleId, codingRuleName]
  )

  useEffect(() => {
    const initConfig = async () => {
      await loadConfigurationConfig()
      setIsConfigLoaded(true)
    }
    initConfig()
  }, [])

  useEffect(() => {
    if (!isConfigLoaded) return

    const handler = (_event: any, data: any) => {
      setSelectedFiles(data.selectedFiles)
      setCodingRuleName(data.codingRuleName ?? '')
      setCodingRuleId(data.codingRuleId ?? '')
      handleRefresh(data.selectedFiles, data.codingRuleId, data.codingRuleName)
    }
    window.api.on('load-diff-data', handler)

    // CheckCodingRules lazy load có thể mount sau khi main đã gửi load-diff-data. Request lại để nhận data.
    window.api.electron.send(IPC.WINDOW.REQUEST_DIFF_DATA)

    return () => {
      window.api.removeAllListeners('load-diff-data')
    }
  }, [isConfigLoaded, handleRefresh])

  const handleAIFix = async (violation: ViolationRow) => {
    setSelectedViolation(violation)
    setIsAIFixDialogOpen(true)
    setIsAIFixLoading(true)

    const languageName = LANGUAGES.find(lang => lang.code === language)?.label || 'English'

    try {
      const params = {
        type: 'AI_FIX_CODING_RULE' as const,
        values: {
          criterion: violation.criterion,
          violation_summary: violation.violationSummary,
          explanation: violation.explanation,
          offending_code: violation.offendingCode,
          language: languageName,
        },
      }
      const result = await window.api.openai.send_message(params)
      setAiFixResult(result)
    } catch (_error) {
      toast.error('Lỗi khi gọi AI Fix')
      setAiFixResult('Đã xảy ra lỗi khi phân tích. Vui lòng thử lại.')
    } finally {
      setIsAIFixLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full">
      <div className="flex flex-col flex-1 w-full">
        <CheckCodingRulesToolbar isLoading={isLoading} onRefresh={handleRefreshWithState} />
        <div className="p-4 space-y-4 flex-1 h-full flex flex-col overflow-hidden">
          <div className="flex flex-col border rounded-md overflow-auto h-full">
            <ScrollArea className="h-full w-full">
              <OverlayLoader isLoading={isLoading} />
              {result ? (
                <div className="p-4">
                  {parsedViolations.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-semibold">No</th>
                            <th className="text-left p-2 font-semibold">Criterion</th>
                            <th className="text-left p-2 font-semibold">Result</th>
                            <th className="text-left p-2 font-semibold">Violation Summary</th>
                            <th className="text-left p-2 font-semibold">Explanation</th>
                            <th className="text-left p-2 font-semibold">Offending Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedViolations.map((violation, index) => (
                            <tr key={index} className="border-b hover:bg-muted/50">
                              <td className="p-2">{violation.no}</td>
                              <td className="p-2">{violation.criterion}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <span className={violation.result.toLowerCase().includes('fail') ? 'text-red-500 font-semibold' : 'text-green-500 font-semibold'}>
                                    {violation.result}
                                  </span>
                                  {violation.result.toLowerCase().includes('fail') && (
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleAIFix(violation)} title="AI Fix">
                                      <Sparkles className="h-4 w-4 text-blue-500" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                              <td className="p-2">{violation.violationSummary}</td>
                              <td className="p-2">{violation.explanation}</td>
                              <td className="p-2 font-mono text-xs [&_pre]:text-xs [&_pre]:my-1 [&_pre]:p-2 [&_pre]:rounded [&_pre]:bg-muted">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{violation.offendingCode.replace(/\\n/g, '\n')}</ReactMarkdown>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-sm">{t('dialog.codingRules.noResults')}</div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* AI Fix Dialog */}
      <Dialog
        open={isAIFixDialogOpen}
        onOpenChange={open => {
          // Ngăn chặn close khi click ra ngoài, chỉ cho phép close qua button
          if (!open) return
          setIsAIFixDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[95vh] p-0 gap-0 overflow-hidden [&>button]:hidden">
          {/* Custom Toolbar */}
          <div
            className="flex items-center justify-between h-8 text-sm border-b select-none"
            style={{
              backgroundColor: 'var(--main-bg)',
              color: 'var(--main-fg)',
            }}
          >
            {/* Left side - Title */}
            <div className="flex items-center gap-2 pl-3">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">AI Fix - Phân tích và Giải pháp</span>
              {selectedViolation && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{selectedViolation.criterion}</span>
                </>
              )}
            </div>

            {/* Right side - Close */}
            <Button variant="ghost" size="sm" onClick={() => setIsAIFixDialogOpen(false)} className="h-7 px-2 gap-1.5 hover:bg-muted mr-2" title="Đóng">
              <X className="h-2.5 w-2.5" />
            </Button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(95vh-32px)] p-6">
            {isAIFixLoading ? (
              <div className="flex items-center justify-center min-h-[200px]">
                <OverlayLoader isLoading={true} />
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiFixResult}</ReactMarkdown>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
