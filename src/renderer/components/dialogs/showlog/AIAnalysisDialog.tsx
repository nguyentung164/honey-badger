'use client'
import { format } from 'date-fns'
import { Brain, Copy, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { getDateFnsLocale, getDateOnlyPattern, getDateTimeDisplayPattern } from '@/lib/dateUtils'
import logger from '@/services/logger'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

interface AIAnalysisDialogProps {
  data: any[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  filePath?: string
  dateRange?: DateRange
}

interface AnalysisResult {
  mostActiveUser: { author: string; count: number }
  leastActiveUser: { author: string; count: number }
  repeatFixes: Array<{
    issue: string
    fixCount: number
    authors: string[]
  }>
  summary: string
}

export function AIAnalysisDialog({ data, isOpen, onOpenChange, filePath, dateRange }: AIAnalysisDialogProps) {
  const { sourceFolder, versionControlSystem } = useConfigurationStore()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [hasStartedAnalysis, setHasStartedAnalysis] = useState(false)
  const [analysisDate, setAnalysisDate] = useState<string>('')
  const [sourceFolderName, setSourceFolderName] = useState<string>('')
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load analysis when dialog opens
  useEffect(() => {
    const loadAnalysis = async () => {
      if (isOpen && sourceFolder) {
        setIsLoadingHistory(true)
        try {
          const res = await window.api.aiAnalysis.get(sourceFolder)
          const record = res.status === 'success' ? res.data : null
          if (record) {
            setAnalysis(record.analysisResult)
            setAnalysisDate(record.analysisDate)
            setSourceFolderName(record.sourceFolderName)
            setHasStartedAnalysis(true)
          } else {
            setAnalysis(null)
            setHasStartedAnalysis(false)
            setAnalysisDate('')
          }
        } catch (error) {
          logger.error('Error loading analysis:', error)
        } finally {
          setIsLoadingHistory(false)
        }
      }
    }
    loadAnalysis()
  }, [isOpen, sourceFolder])

  // Save analysis to MySQL whenever analysis changes
  useEffect(() => {
    const saveAnalysis = async () => {
      if (analysis && sourceFolder && analysisDate) {
        setIsSaving(true)
        try {
          const record = {
            sourceFolderPath: sourceFolder,
            sourceFolderName: sourceFolderName || sourceFolder.split(/[/\\]/).pop() || sourceFolder,
            analysisDate,
            analysisResult: analysis,
          }
          const res = await window.api.aiAnalysis.save(record)
          if (res.status !== 'success') {
            logger.error('Error saving analysis:', res.message)
          }
        } catch (error) {
          logger.error('Error saving analysis:', error)
        } finally {
          setIsSaving(false)
        }
      }
    }
    saveAnalysis()
  }, [analysis, sourceFolder, analysisDate, sourceFolderName])

  const analyzeCommits = useCallback(async () => {
    if (!data || data.length === 0) {
      toast.error('Không có dữ liệu để phân tích')
      return
    }

    setHasStartedAnalysis(true)
    setIsAnalyzing(true)
    try {
      let dataToAnalyze = data

      // Check if data has files
      const hasFiles = data.some(entry => entry.changedFiles && entry.changedFiles.length > 0)

      // If no files and it's Git, load full data with files
      if (!hasFiles && versionControlSystem === 'git' && filePath) {
        logger.info('Loading full Git log data with files for AI analysis...')
        try {
          const options: any = {}
          if (dateRange?.from) {
            options.dateFrom = dateRange.from.toISOString()
            if (dateRange.to) {
              options.dateTo = dateRange.to.toISOString()
            }
          }

          // Use git.log() instead of log_graph() to get files
          const result = await window.api.git.log(filePath, options)

          if (result.status === 'success' && result.data) {
            const gitLogData = JSON.parse(result.data as string)
            // Transform to match data structure
            dataToAnalyze = gitLogData.map((entry: any) => ({
              revision: entry.hash?.substring(0, 8) || '',
              author: entry.author,
              date: entry.date,
              isoDate: new Date(entry.date).toISOString(),
              message: entry.body ? `${entry.subject}\n\n${entry.body}`.trim() : entry.subject,
              changedFiles:
                entry.files?.map((f: any) => ({
                  action: f.status,
                  filePath: f.file,
                })) || [],
            }))
            logger.info(`Loaded ${dataToAnalyze.length} commits with files`)
          }
        } catch (error) {
          logger.error('Error loading full Git log:', error)
          toast.error('Không thể load đầy đủ dữ liệu files. Phân tích có thể bị giới hạn.')
        }
      }

      // Prepare commit data for AI analysis
      // Handle both SVN and Git data structures
      const commitData = dataToAnalyze.map(entry => {
        let files: string[] = []

        // Parse changedFiles based on structure
        if (entry.changedFiles && Array.isArray(entry.changedFiles)) {
          files = entry.changedFiles
            .map((f: any) => {
              // Handle different structures:
              // SVN/Git list mode: { action, filePath }
              // Or just string
              if (typeof f === 'string') {
                return f
              }
              if (f.filePath) {
                return f.filePath
              }
              if (f.file) {
                return f.file
              }
              return String(f)
            })
            .filter(Boolean)
        }

        return {
          author: entry.author,
          date: entry.isoDate || entry.date,
          message: entry.message,
          files,
        }
      })

      // Log statistics for debugging
      const commitsWithFiles = commitData.filter(c => c.files.length > 0).length
      const totalFiles = commitData.reduce((sum, c) => sum + c.files.length, 0)
      logger.info(`AI Analysis Data: ${commitData.length} commits, ${commitsWithFiles} with files, ${totalFiles} total files`)

      if (commitsWithFiles === 0) {
        logger.warning('Warning: No commits have file information. Analysis may be limited.')
      }

      // Get date range
      const dates = dataToAnalyze.map(entry => new Date(entry.isoDate || entry.date).getTime())
      const loc = getDateFnsLocale(i18n.language)
      const datePat = getDateOnlyPattern(i18n.language)
      const minDate = format(new Date(Math.min(...dates)), datePat, { locale: loc })
      const maxDate = format(new Date(Math.max(...dates)), datePat, { locale: loc })
      const dateRangeStr = `${minDate} - ${maxDate}`

      // Call OpenAI API for analysis
      const params = {
        type: 'AI_ANALYSIS_COMMITS' as const,
        values: {
          commit_data: JSON.stringify(commitData, null, 2),
          date_range: dateRangeStr,
          language: 'Vietnamese',
        },
      }

      const aiResult = await window.api.openai.send_message(params)

      // Basic local analysis for fallback/comparison
      const authorStats = new Map<string, number>()
      const fileFixMap = new Map<string, Array<{ author: string; date: string; message: string }>>()

      // Đếm commit theo author
      for (const entry of data) {
        const count = authorStats.get(entry.author) || 0
        authorStats.set(entry.author, count + 1)

        // Track file changes
        if (entry.changedFiles && entry.changedFiles.length > 0) {
          for (const file of entry.changedFiles) {
            if (!fileFixMap.has(file.filePath)) {
              fileFixMap.set(file.filePath, [])
            }
            fileFixMap.get(file.filePath)?.push({
              author: entry.author,
              date: entry.isoDate || entry.date,
              message: entry.message,
            })
          }
        }
      }

      // Tìm người commit nhiều nhất và ít nhất
      const sortedAuthors = Array.from(authorStats.entries()).sort((a, b) => b[1] - a[1])
      const mostActive = sortedAuthors[0] || ['N/A', 0]
      const leastActive = sortedAuthors[sortedAuthors.length - 1] || ['N/A', 0]

      // Phân tích các vấn đề được fix nhiều lần
      const issueMap = new Map<string, Array<{ author: string; date: string }>>()

      for (const [filePath, fixes] of fileFixMap.entries()) {
        if (fixes.length > 2) {
          // File được fix nhiều hơn 2 lần
          const key = filePath
          if (!issueMap.has(key)) {
            issueMap.set(key, [])
          }
          for (const fix of fixes) {
            issueMap.get(key)?.push({
              author: fix.author,
              date: fix.date,
            })
          }
        }
      }

      const repeatFixes = Array.from(issueMap.entries())
        .map(([issue, fixes]) => ({
          issue,
          fixCount: fixes.length,
          authors: [...new Set(fixes.map(f => f.author))],
        }))
        .sort((a, b) => b.fixCount - a.fixCount)
        .slice(0, 5) // Top 5 issues được fix nhiều nhất

      // Set analysis date and source folder name
      const now = new Date()
      const currentDate = format(now, getDateTimeDisplayPattern(i18n.language), { locale: loc })
      setAnalysisDate(currentDate)
      setSourceFolderName(sourceFolder.split(/[/\\]/).pop() || sourceFolder)

      // Tạo summary kết hợp AI và local analysis
      const summary = aiResult

      setAnalysis({
        mostActiveUser: { author: mostActive[0], count: mostActive[1] },
        leastActiveUser: { author: leastActive[0], count: leastActive[1] },
        repeatFixes,
        summary,
      })

      // Save to history
      try {
        logger.info('Preparing to save analysis history...')

        const historyRecord = {
          sourceFolderPath: sourceFolder,
          sourceFolderName: sourceFolder.split(/[/\\]/).pop() || sourceFolder,
          analysisDate: currentDate,
          timestamp: Date.now(),
          totalCommits: dataToAnalyze.length,
          dateRange: dateRangeStr,
          analysisResult: {
            mostActiveUser: { author: mostActive[0], count: mostActive[1] },
            leastActiveUser: { author: leastActive[0], count: leastActive[1] },
            repeatFixes,
            summary,
          },
        }
        logger.info('History record to save:', {
          sourceFolderName: historyRecord.sourceFolderName,
          totalCommits: historyRecord.totalCommits,
          dateRange: historyRecord.dateRange,
          timestamp: historyRecord.timestamp,
        })

        const res = await window.api.aiAnalysis.historySave(historyRecord)
        const savedId = res.status === 'success' ? res.data : undefined
        if (savedId) logger.success('History saved successfully with ID:', savedId)
        toast.success('Đã lưu vào lịch sử')
      } catch (error) {
        logger.error('Error saving to history:', error)
        logger.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        })
        // Show error toast to inform user
        toast.error(`Lưu lịch sử thất bại: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      toast.success('Phân tích hoàn tất')
      setIsAnalyzing(false)
    } catch (error) {
      logger.error('Error analyzing commits:', error)
      toast.error('Lỗi khi phân tích dữ liệu')
    } finally {
      setIsAnalyzing(false)
    }
  }, [data, sourceFolder, versionControlSystem, filePath, dateRange])

  const handleStartAnalysis = () => {
    analyzeCommits()
  }

  const handleRefresh = () => {
    analyzeCommits()
  }

  const handleCopy = async () => {
    if (!analysis) return

    try {
      let content = `# Phân tích AI - Commit Insights\n\n`
      content += `**Source Folder:** ${sourceFolderName}\n`
      content += `**Ngày phân tích:** ${analysisDate}\n\n`
      content += `## Phân tích AI\n\n${analysis.summary}\n\n`
      await navigator.clipboard.writeText(content)
      toast.success('Đã copy nội dung phân tích')
    } catch (_error) {
      toast.error('Lỗi khi copy nội dung')
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        // Ngăn chặn close khi click ra ngoài, chỉ cho phép close qua button
        if (!open) return
        onOpenChange(open)
      }}
    >
      <DialogContent className="max-w-[90vw]! max-h-[95vh] p-0 gap-0 overflow-hidden [&>button]:hidden">
        {/* Custom Toolbar - Compact style */}
        <div
          className="flex items-center justify-between h-8 text-sm border-b select-none"
          style={{
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          }}
        >
          {hasStartedAnalysis && analysis ? (
            <>
              {/* Left side - Logo and Actions */}
              <div className="flex items-center h-full">
                <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
                  <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isAnalyzing} className="h-7 px-2 gap-1.5 hover:bg-muted" title="Phân tích lại">
                    <Brain className="h-2.5 w-2.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 gap-1.5 hover:bg-muted" title="Copy nội dung">
                    <Copy className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>

              {/* Center - Info on single line */}
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{sourceFolderName}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">{analysisDate}</span>
              </div>
            </>
          ) : (
            <>
              {/* Left side - Logo and Title for initial state */}
              <div className="flex items-center h-full">
                <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
                  <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
                </div>
                <div className="flex items-center gap-2 pl-3">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">Phân tích AI - Commit Insights</span>
                </div>
              </div>
              <div />
            </>
          )}

          {/* Right side - Close */}
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-7 px-2 gap-1.5 hover:bg-muted mr-2" title="Đóng">
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-32px)] p-6">
          {isAnalyzing || isLoadingHistory || isSaving ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <OverlayLoader isLoading={true} />
            </div>
          ) : !hasStartedAnalysis ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
              <div className="flex flex-col items-center gap-4">
                <Brain className="h-16 w-16 text-primary opacity-50" />
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Sẵn sàng phân tích commit history</h3>
                  <p className="text-sm text-muted-foreground max-w-md">Phân tích {data.length} commits để tìm ra patterns, xu hướng và insights hữu ích về team của bạn</p>
                </div>
              </div>
              <Button onClick={handleStartAnalysis} size="lg" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Bắt đầu phân tích
              </Button>
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              {/* Summary Card with AI Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-500" />
                    Phân tích AI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      remarkRehypeOptions={{ allowDangerousHtml: true }}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        a: ({ node, href, ...props }) => (
                          <span {...props} style={{ cursor: 'default', pointerEvents: 'none' }} />
                        ),
                      }}
                    >
                      {analysis.summary}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[400px]">
              <p className="text-muted-foreground">Không có dữ liệu để hiển thị</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
