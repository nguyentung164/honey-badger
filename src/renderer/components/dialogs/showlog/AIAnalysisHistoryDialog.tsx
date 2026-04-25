'use client'
import { ArrowBigLeft, Brain, Copy, Eye, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'

interface AIAnalysisHistoryDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

interface AIAnalysisHistoryRecord {
  id?: number
  sourceFolderPath: string
  sourceFolderName: string
  analysisDate: string
  timestamp: number
  totalCommits: number
  dateRange?: string
  analysisResult: { mostActiveUser: { author: string; count: number }; leastActiveUser: { author: string; count: number }; repeatFixes: any[]; summary: string }
}

export function AIAnalysisHistoryDialog({ isOpen, onOpenChange }: AIAnalysisHistoryDialogProps) {
  const [historyRecords, setHistoryRecords] = useState<AIAnalysisHistoryRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<AIAnalysisHistoryRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadHistory()
    }
  }, [isOpen])

  const loadHistory = async () => {
    setIsLoading(true)
    try {
      const res = await window.api.aiAnalysis.historyGetAll()
      const history = res.status === 'success' && res.data ? res.data : []
      setHistoryRecords(history)
    } catch (error) {
      logger.error('Error loading history:', error)
      toast.error('Không thể tải lịch sử phân tích')
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewRecord = async (record: AIAnalysisHistoryRecord) => {
    setSelectedRecord(record)
  }

  const handleDeleteRecord = (id: number | undefined, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!id) return
    setRecordToDelete(id)
  }

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return
    const idToDelete = recordToDelete
    setRecordToDelete(null)
    try {
      const res = await window.api.aiAnalysis.historyDelete(idToDelete)
      if (res.status !== 'success') throw new Error(res.message)
      toast.success('Đã xóa lịch sử phân tích')
      await loadHistory()
      if (selectedRecord?.id === idToDelete) {
        setSelectedRecord(null)
      }
    } catch (error) {
      logger.error('Error deleting history:', error)
      toast.error('Không thể xóa lịch sử')
    }
  }

  const handleClose = () => {
    setSelectedRecord(null)
    onOpenChange(false)
  }

  const handleBackToList = () => {
    setSelectedRecord(null)
  }

  const handleCopy = async () => {
    if (!selectedRecord) return

    try {
      let content = `# Phân tích AI - Commit Insights\n\n`
      content += `**Source Folder:** ${selectedRecord.sourceFolderName}\n`
      content += `**Ngày phân tích:** ${selectedRecord.analysisDate}\n`
      content += `**Khoảng thời gian:** ${selectedRecord.dateRange || '-'}\n`
      content += `**Tổng số commits:** ${selectedRecord.totalCommits}\n\n`
      content += `## Phân tích AI\n\n${selectedRecord.analysisResult.summary}\n\n`
      await navigator.clipboard.writeText(content)
      toast.success('Đã copy nội dung phân tích')
    } catch (_error) {
      toast.error('Lỗi khi copy nội dung')
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose()
        } else {
          onOpenChange(open)
        }
      }}
    >
      <DialogContent
        className={`max-h-[95vh]! p-0 gap-0 overflow-hidden [&>button]:hidden ${selectedRecord ? 'max-w-[90vw]!' : 'sm:max-w-6xl'}`}
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Toolbar */}
        <div
          className="relative flex items-center justify-between h-8 text-sm border-b select-none"
          style={{
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          }}
        >
          <div className="flex items-center gap-1 h-full">
            <div className="w-15 h-6 flex justify-center pt-1.5 pl-1">
              <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
            </div>
            {selectedRecord && (
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 gap-1.5 hover:bg-muted" title="Copy nội dung">
                <Copy className="h-2.5 w-2.5" />
              </Button>
            )}
          </div>

          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-primary flex items-center gap-1.5">
            {selectedRecord ? 'Chi tiết phân tích AI' : 'Lịch sử phân tích AI'}
          </span>

          <div className="flex items-center gap-1">
            {selectedRecord && (
              <Button variant="ghost" size="sm" onClick={handleBackToList} className="h-7 px-2 gap-1.5 hover:bg-muted mr-2" title="Quay lại danh sách">
                <span className="flex items-center gap-1 text-xs">
                  <ArrowBigLeft className="h-2.5 w-2.5" />
                  <span>Quay lại</span>
                </span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleClose} className="h-7 px-2 gap-1.5 hover:bg-muted mr-2" title="Đóng">
              <X className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-32px)] p-6">
          {selectedRecord ? (
            // Detail View
            <div className="space-y-4">
              {/* Info Table */}
              <div className="space-y-2">
                <div className="text-lg font-bold text-foreground">Thông tin phân tích</div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table className="w-max min-w-full">
                      <TableHeader sticky>
                        <TableRow className="bg-primary/10 hover:bg-primary/10">
                          <TableHead className="font-semibold text-foreground">Folder</TableHead>
                          <TableHead className="font-semibold text-foreground">Ngày phân tích</TableHead>
                          <TableHead className="font-semibold text-foreground">Khoảng thời gian</TableHead>
                          <TableHead className="font-semibold text-foreground">Tổng số commits</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-mono text-sm font-medium">{selectedRecord.sourceFolderName}</TableCell>
                          <TableCell className="text-sm font-medium">{selectedRecord.analysisDate}</TableCell>
                          <TableCell className="text-sm font-medium">{selectedRecord.dateRange || '-'}</TableCell>
                          <TableCell className="text-sm font-semibold text-primary">{selectedRecord.totalCommits}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Summary Card with AI Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-bold flex items-center gap-2 text-primary">
                    <Brain className="h-6 w-6 text-purple-500" />
                    Phân tích AI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-base dark:prose-invert max-w-none font-medium">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      remarkRehypeOptions={{ allowDangerousHtml: true }}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        a: ({ node, children, href: _href, ...props }) => (
                          <span {...props} className="text-primary underline underline-offset-4">
                            {children}
                          </span>
                        ),
                      }}
                    >
                      {selectedRecord.analysisResult.summary}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            // List View
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-base font-semibold text-foreground">Đang tải lịch sử...</p>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Brain className="h-20 w-20 text-primary/60" />
                  <p className="text-base font-semibold text-foreground">Chưa có lịch sử phân tích nào</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[min(55vh,480px)] overflow-auto overflow-x-auto">
                    <Table className="w-max min-w-full">
                      <TableHeader sticky>
                        <TableRow className="bg-primary/10 hover:bg-primary/10">
                          <TableHead className="w-16 font-semibold">No</TableHead>
                          <TableHead className="font-semibold">Ngày phân tích</TableHead>
                          <TableHead className="font-semibold">Folder</TableHead>
                          <TableHead className="text-center font-semibold">Số commits</TableHead>
                          <TableHead className="text-center font-semibold">Khoảng thời gian</TableHead>
                          <TableHead className="w-24 text-center font-semibold">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyRecords.map((record, index) => (
                          <TableRow key={record.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewRecord(record)}>
                            <TableCell className="font-semibold">{index + 1}</TableCell>
                            <TableCell className="font-medium">{record.analysisDate}</TableCell>
                            <TableCell className="font-mono text-sm font-medium">{record.sourceFolderName}</TableCell>
                            <TableCell className="text-center font-semibold text-primary">{record.totalCommits}</TableCell>
                            <TableCell className="text-center text-sm font-medium">{record.dateRange || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleViewRecord(record)
                                  }}
                                  className="h-7 w-7 p-0"
                                  title="Xem chi tiết"
                                >
                                  <Eye className="h-2.5 w-2.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={e => handleDeleteRecord(record.id, e)}
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  title="Xóa"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={recordToDelete !== null} onOpenChange={open => !open && setRecordToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc muốn xóa mục lịch sử phân tích này? Hành động này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
