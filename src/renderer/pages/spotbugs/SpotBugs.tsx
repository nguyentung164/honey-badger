'use client'
import { AlertTriangle, BarChart3, BarChart as BarChartIcon, Bot, Bug, FileCode, Info, List, OctagonAlert, PieChart as PieChartIcon } from 'lucide-react'
import { IPC } from 'main/constants'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { CodeSnippetDialog } from '@/components/dialogs/tools/CodeSnippetDialog'
import { BUG_DESCRIPTIONS } from '@/components/shared/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import type { BugInstance, SpotBugsResult } from './constants'
import { SpotbugsAIChat } from './SpotbugsAIChat'
import { SpotbugsToolbar } from './SpotbugsToolbar'
import { buildCodeSnippet, filterBugsByTab, getCategoryDescriptions, nextSortState, processSpotBugsResult, sortBugs } from './spotbugsUtils'

const SPOTBUGS_PANEL_SIZES_KEY = 'spotbugs-panel-sizes-config'

interface SpotbugsPanelSizes {
  leftPanelSize: number
  rightPanelSize: number
}

export function SpotBugs() {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [spotbugsResult, setSpotbugsResult] = useState<SpotBugsResult>({
    version: { version: '', sequence: null, timestamp: null, analysisTimestamp: null, release: '' },
    project: { projectName: '', filename: '', jars: [], srcDirs: [] },
    summary: { timestamp: '', totalClasses: 0, referencedClasses: 0, totalBugs: 0, totalSize: 0, numPackages: 0, priority1: 0, priority2: 0, priority3: 0 },
    fileStats: [],
    packageStats: [],
    errors: { errors: 0, missingClasses: 0, missingClassList: [] },
    bugCategories: {},
    bugPatterns: {},
    bugCodes: {},
    bugInstances: [],
    bugCount: { total: 0, byPriority: { high: 0, medium: 0, low: 0 } },
  })
  const [selectedBug, setSelectedBug] = useState<BugInstance | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [activeDetailTab, setActiveDetailTab] = useState('ai')

  const [fileContent, setFileContent] = useState('')
  const [codeSnippets, setCodeSnippets] = useState<Record<string, string>>({})
  const [selectedSourceLineKey, setSelectedSourceLineKey] = useState<string>('')
  const [activeChartType, setActiveChartType] = useState<'priority' | 'file' | 'package'>('priority') // State for active chart

  const [panelSizes, setPanelSizes] = useState<SpotbugsPanelSizes>({
    leftPanelSize: 50,
    rightPanelSize: 50,
  })

  const panelGroupRef = useRef<any>(null)

  useEffect(() => {
    const handler = (_event: any, data: { filePaths: string[]; spotbugsResult?: any; error?: string }) => {
      setFilePaths(data.filePaths || [])
      if (data.error) {
        toast.error(t('toast.spotbugsError', { 0: data.error }))
        setIsLoading(false)
        return
      }
      if (data.spotbugsResult) {
        logger.info('SpotBugs result:', data.spotbugsResult)
        const processedResult = processSpotBugsResult(data.spotbugsResult)
        setSpotbugsResult(processedResult)

        if (processedResult.bugInstances.length > 0) {
          const firstBug = processedResult.bugInstances[0]
          setSelectedBug(firstBug)
          setActiveDetailTab('ai')
        } else {
          setSelectedBug(null)
        }
        toast.success(t('toast.spotbugsSuccess', { 0: processedResult.bugCount.total }))
        setIsLoading(false)
      } else {
        setIsLoading(false)
      }
    }

    window.api.on('load-diff-data', handler)

    // SpotBugs lazy load có thể mount sau khi main đã gửi load-diff-data. Request lại để nhận data.
    window.api.electron.send(IPC.WINDOW.REQUEST_DIFF_DATA)

    return () => {
      window.api.removeAllListeners('load-diff-data')
    }
  }, [t])

  useEffect(() => {
    try {
      const savedPanelSizes = localStorage.getItem(SPOTBUGS_PANEL_SIZES_KEY)
      if (savedPanelSizes) {
        const sizes: SpotbugsPanelSizes = JSON.parse(savedPanelSizes)
        const left = Math.max(10, Math.min(90, sizes.leftPanelSize))
        const right = Math.max(10, Math.min(90, sizes.rightPanelSize))
        const normalized = { leftPanelSize: left, rightPanelSize: right }
        setPanelSizes(normalized)

        setTimeout(() => {
          panelGroupRef.current?.setLayout?.({
            'spotbugs-bug-list': left,
            'spotbugs-detail': right,
          })
        }, 0)
      }
    } catch (error) {
      logger.error('Lỗi khi đọc kích thước panel từ localStorage:', error)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SPOTBUGS_PANEL_SIZES_KEY, JSON.stringify(panelSizes))
      } catch (error) {
        logger.error('Lỗi khi lưu kích thước panel vào localStorage:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [panelSizes])

  useEffect(() => {
    if (selectedBug) {
      fetchCodeSnippetsForBug(selectedBug)
      if (selectedBug.sourceFile && selectedBug.startLine && selectedBug.startLine > 0) {
        logger.info(`Requesting to open file: ${selectedBug.sourceFile} at line ${selectedBug.startLine}`)
        window.api.electron.send('open-file-in-editor', { filePath: selectedBug.sourceFile, lineNumber: selectedBug.startLine })
      } else {
        logger.info('Cannot open file: sourceFile or startLine is missing or invalid.', selectedBug)
      }
    } else {
      setCodeSnippets({})
      setFileContent('')
    }
  }, [selectedBug, filePaths])

  const fetchCodeSnippetsForBug = async (bug: BugInstance) => {
    if (bug.sourceLines && bug.sourceLines.length > 0) {
      const snippets: Record<string, string> = {}
      let mainFileContent = ''
      for (const sourceLine of bug.sourceLines) {
        if (!sourceLine.sourcefile || sourceLine.start === null || sourceLine.end === null) continue
        try {
          const matchingFilePath = filePaths.find(filePath => filePath.endsWith(sourceLine.sourcefile) || sourceLine.sourcefile.endsWith(filePath))
          if (matchingFilePath) {
            const content = await window.api.system.read_file(matchingFilePath)
            if (content && typeof content === 'string') {
              const key = `${sourceLine.classname}:${sourceLine.start}-${sourceLine.end}`
              snippets[key] = buildCodeSnippet(content, sourceLine.start, sourceLine.end)
              if (sourceLine.primary || !mainFileContent) {
                mainFileContent = content
              }
            }
          }
        } catch (error) {
          logger.error('Error reading source file:', error)
        }
      }
      setCodeSnippets(snippets)
      setFileContent(mainFileContent)
    }
  }

  const handleRefresh = () => {
    setIsLoading(true)
    setSelectedBug(null)
    setActiveDetailTab('ai')

    setSpotbugsResult({
      version: { version: '', sequence: null, timestamp: null, analysisTimestamp: null, release: '' },
      project: { projectName: '', filename: '', jars: [], srcDirs: [] },
      summary: { timestamp: '', totalClasses: 0, referencedClasses: 0, totalBugs: 0, totalSize: 0, numPackages: 0, priority1: 0, priority2: 0, priority3: 0 },
      fileStats: [],
      packageStats: [],
      errors: { errors: 0, missingClasses: 0, missingClassList: [] },
      bugCategories: {},
      bugPatterns: {},
      bugCodes: {},
      bugInstances: [],
      bugCount: { total: 0, byPriority: { high: 0, medium: 0, low: 0 } },
    })
    window.api.electron.send('window:action', 'refresh-spotbugs')
    logger.info(t('toast.refreshingSpotbugs'))
  }


  const getPrioriyIcon = (priority: number) => {
    switch (priority) {
      case 1:
        return <OctagonAlert strokeWidth={1.25} className="h-4 w-4 text-red-800 dark:text-red-400 border-red-500/20" />
      case 2:
        return <AlertTriangle strokeWidth={1.25} className="h-4 w-4 text-yellow-800 dark:text-yellow-400 border-yellow-500/20" />
      case 3:
        return <Info strokeWidth={1.25} className="h-4 w-4 text-blue-800 dark:text-blue-400 border-blue-500/20" />
      default:
        return <Info strokeWidth={1.25} className="h-4 w-4 text-gray-800 dark:text-gray-400 border-gray-500/20" />
    }
  }

  const getPriorityName = (priority: number) => {
    switch (priority) {
      case 1:
        return 'dialog.spotbugs.high'
      case 2:
        return 'dialog.spotbugs.medium'
      case 3:
        return 'dialog.spotbugs.low'
      default:
        return ''
    }
  }

  const getBugDescriptionDetails = (bugType: string): string => {
    return BUG_DESCRIPTIONS[bugType] || 'No details available for this bug type.'
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'bg-red-200/10 text-red-800 dark:text-red-400 border-red-500/20'
      case 2:
        return 'bg-yellow-200/10 text-yellow-800 dark:text-yellow-400 border-yellow-500/20'
      case 3:
        return 'bg-blue-200/10 text-blue-800 dark:text-blue-400 border-blue-500/20'
      default:
        return 'bg-gray-200/10 text-gray-800 dark:text-gray-400 border-gray-500/20'
    }
  }

  const getRankColor = (rank: number) => {
    if (rank <= 4) return 'bg-red-200/10 text-red-800 dark:text-red-400 border-red-500/20'
    if (rank <= 9) return 'bg-yellow-200/10 text-yellow-800 dark:text-yellow-400 border-yellow-500/20'
    if (rank <= 14) return 'bg-amber-200/10 text-amber-800 dark:text-amber-400 border-amber-500/20'
    if (rank <= 20) return 'bg-blue-200/10 text-blue-800 dark:text-blue-400 border-blue-500/20'
    return 'bg-emerald-200/10 text-emerald-800 dark:text-emerald-400 border-emerald-500/20'
  }

  const filteredBugs = useMemo(
    () => filterBugsByTab(spotbugsResult.bugInstances, activeTab as any),
    [spotbugsResult.bugInstances, activeTab]
  )

  const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, ...props }, ref) => {
    return (
      <div className={cn('absolute w-full', wrapperClassName)}>
        <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
      </div>
    )
  })
  Table.displayName = 'Table'

  const [sortKey, setSortKey] = useState<'priority' | 'category' | 'sourceFile' | 'type' | ''>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | ''>('')

  const sortedBugs = useMemo(
    () => sortBugs(filteredBugs, sortKey, sortDirection),
    [filteredBugs, sortKey, sortDirection]
  )

  const handleSort = (key: typeof sortKey) => {
    const next = nextSortState(sortKey, sortDirection, key)
    setSortKey(next.sortKey)
    setSortDirection(next.sortDirection)
  }

  function roundedRect(x: any, y: any, width: any, height: any, radiusTopLeft: any, radiusTopRight: number, radiusBottomRight: number, radiusBottomLeft: number) {
    return `
        M${x + radiusTopLeft},${y}
        H${x + width - radiusTopRight}
        Q${x + width},${y} ${x + width},${y + radiusTopRight}
        V${y + height - radiusBottomRight}
        Q${x + width},${y + height} ${x + width - radiusBottomRight},${y + height}
        H${x + radiusBottomLeft}
        Q${x},${y + height} ${x},${y + height - radiusBottomLeft}
        V${y + radiusTopLeft}
        Q${x},${y} ${x + radiusTopLeft},${y}
        Z
      `
  }

  function getBarRadius(data: any[], priorityKeys: string[]) {
    const posMap: Record<string, { single?: string; top?: string; bottom?: string }> = {}
    for (const row of data) {
      const prioritiesWithValue = priorityKeys.filter(key => row[key] > 0)
      if (prioritiesWithValue.length === 1) {
        posMap[row.packageName] = { single: prioritiesWithValue[0] }
      } else if (prioritiesWithValue.length > 1) {
        const bottomKey = priorityKeys.find(key => row[key] > 0)
        const topKey = [...priorityKeys].reverse().find(key => row[key] > 0)
        posMap[row.packageName] = {
          top: topKey,
          bottom: bottomKey,
        }
      }
    }
    return posMap
  }

  const getRadiusForPriority = (packageName: string, priority: string, posMap: Record<string, any>) => {
    if (!posMap[packageName]) return [0, 0, 0, 0]
    if (posMap[packageName].single === priority) return [4, 4, 4, 4]
    if (posMap[packageName].top === priority) return [4, 4, 0, 0]
    if (posMap[packageName].bottom === priority) return [0, 0, 4, 4]
    return [0, 0, 0, 0]
  }

  const CustomBarShape = (props: any) => {
    const { x, y, width, height, payload, dataKey, fill, posMap } = props
    const packageName = payload.packageName
    const radius = getRadiusForPriority(packageName, dataKey, posMap)
    const d = roundedRect(x, y, width, height, ...(radius as [number, number, number, number]))
    return <path d={d} fill={fill} />
  }

  const packageStatsData = useMemo(() => {
    return spotbugsResult.packageStats.slice(0, 10).map(stat => ({
      packageName: stat.packageName.split('.').pop() || stat.packageName,
      priority1: stat.priority1,
      priority2: stat.priority2,
      priority3: stat.priority3,
      fullPackage: stat.packageName,
    }))
  }, [spotbugsResult.packageStats])

  const packagePosMap = useMemo(() => {
    return getBarRadius(packageStatsData, ['priority3', 'priority2', 'priority1'])
  }, [packageStatsData])

  const handleBugSelection = (bug: BugInstance) => {
    setSelectedBug(bug)
    setActiveDetailTab('ai')
  }

  const handleExplainInAI = (sourceLine: any) => {
    const sourceLineKey = `${sourceLine.classname}:${sourceLine.start}-${sourceLine.end}`
    setSelectedSourceLineKey(sourceLineKey)
    setActiveDetailTab('ai')
  }

  return (
    <div className="flex h-screen w-full">
      <div className="flex flex-col flex-1 w-full">
        <SpotbugsToolbar isLoadingAI={isLoadingAI} onRefresh={handleRefresh} />
        <div className="p-4 space-y-4 flex-1 h-full flex flex-col">
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList aria-disabled={isLoading}>
              <TabsTrigger value="all">
                <Bug strokeWidth={1.25} className="h-4 w-4  text-green-800 dark:text-green-400 border-green-500/20" />
                {t('dialog.spotbugs.allIssues')}
                <Badge variant="outline" className="rounded-md ml-2">
                  {spotbugsResult.bugCount.total}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="high">
                <OctagonAlert strokeWidth={1.25} className="h-4 w-4 text-red-800 dark:text-red-400 border-red-500/20" />
                {t('dialog.spotbugs.high')}
                <Badge variant="outline" className="rounded-md ml-2 bg-red-200/10 text-red-800 dark:text-red-400 border-red-500/20 font-bold">
                  {spotbugsResult.bugCount.byPriority.high}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="medium">
                <AlertTriangle strokeWidth={1.25} className="h-4 w-4 text-yellow-800 dark:text-yellow-400 border-yellow-500/20" />
                {t('dialog.spotbugs.medium')}
                <Badge variant="outline" className="rounded-md ml-2 bg-yellow-200/10 text-yellow-800 dark:text-yellow-400 border-yellow-500/20 font-bold">
                  {spotbugsResult.bugCount.byPriority.medium}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="low">
                <Info strokeWidth={1.25} className="h-4 w-4 text-blue-800 dark:text-blue-400 border-blue-500/20" />
                {t('dialog.spotbugs.low')}
                <Badge variant="outline" className="rounded-md ml-2 bg-blue-200/10 text-blue-800 dark:text-blue-400 border-blue-500/20 font-bold">
                  {spotbugsResult.bugCount.byPriority.low}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="chart">
                <BarChartIcon strokeWidth={1.25} className="h-4 w-4 text-pink-800 dark:text-pink-400 border-pink-500/20" />
                {t('dialog.spotbugs.chart')}
              </TabsTrigger>
              <TabsTrigger value="filelist">
                <List strokeWidth={1.25} className="h-4 w-4" />
                {t('dialog.spotbugs.fileList')}
                <Badge variant="outline" className="rounded-md ml-2">
                  {filePaths.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="flex-1 flex flex-col h-full mt-4">
              <div className="space-y-4 flex-1 h-full flex flex-col overflow-hidden">
                {(activeTab === 'all' || activeTab === 'high' || activeTab === 'medium' || activeTab === 'low') && (
                  <ResizablePanelGroup
                    groupRef={panelGroupRef}
                    orientation="horizontal"
                    className="flex flex-1 min-h-0 gap-1"
                    defaultLayout={{ 'spotbugs-bug-list': panelSizes.leftPanelSize, 'spotbugs-detail': panelSizes.rightPanelSize }}
                    onLayoutChanged={layout => {
                      const left = layout['spotbugs-bug-list']
                      const right = layout['spotbugs-detail']
                      if (typeof left === 'number' && typeof right === 'number') {
                        setPanelSizes({ leftPanelSize: left, rightPanelSize: right })
                      }
                    }}
                    resizeTargetMinimumSize={{ coarse: 37, fine: 27 }}
                  >
                    <ResizablePanel id="spotbugs-bug-list" minSize={10} className="h-full min-h-0 overflow-hidden">
                      <div className="h-full">
                        <div className="flex flex-col h-full w-full">
                          <div className="flex flex-col border rounded-md overflow-auto h-full">
                            <ScrollArea className="h-full w-full">
                              <OverlayLoader isLoading={isLoading} />
                              <Table wrapperClassName={cn('overflow-unset', sortedBugs.length === 0 && 'h-full')}>
                                <TableHeader sticky>
                                  <TableRow>
                                    <TableHead className="w-24 cursor-pointer h-9!" onClick={() => handleSort('priority')}>
                                      <div className="flex items-center gap-1">
                                        {t('table.severity')}
                                        {sortKey !== 'priority'}
                                        {sortKey === 'priority' && sortDirection === 'asc' && '↑'}
                                        {sortKey === 'priority' && sortDirection === 'desc' && '↓'}
                                      </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer h-9!" onClick={() => handleSort('sourceFile')}>
                                      <div className="flex items-center gap-1">
                                        {t('table.file')}
                                        {sortKey !== 'sourceFile'}
                                        {sortKey === 'sourceFile' && sortDirection === 'asc' && '↑'}
                                        {sortKey === 'sourceFile' && sortDirection === 'desc' && '↓'}
                                      </div>
                                    </TableHead>
                                    <TableHead className="w-15 cursor-pointer h-9!" onClick={() => handleSort('category')}>
                                      <div className="flex items-center gap-1">
                                        {t('table.category')}
                                        {sortKey !== 'category'}
                                        {sortKey === 'category' && sortDirection === 'asc' && '↑'}
                                        {sortKey === 'category' && sortDirection === 'desc' && '↓'}
                                      </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer h-9!" onClick={() => handleSort('type')}>
                                      <div className="flex items-center gap-1">
                                        {t('table.issue')}
                                        {sortKey !== 'type'}
                                        {sortKey === 'type' && sortDirection === 'asc' && '↑'}
                                        {sortKey === 'type' && sortDirection === 'desc' && '↓'}
                                      </div>
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sortedBugs.length > 0 ? (
                                    sortedBugs.map(bug => (
                                      <TableRow
                                        key={bug.id}
                                        className={cn(
                                          selectedBug?.id === bug.id ? 'bg-blue-100 hover:bg-blue-100 dark:bg-blue-900 dark:hover:bg-blue-900' : '',
                                          'transition-colors duration-150'
                                        )}
                                        onClick={() => handleBugSelection(bug)}
                                        style={{ cursor: 'pointer' }}
                                      >
                                        <TableCell>
                                          <div className="flex items-center gap-1">
                                            {bug.priority !== null ? getPrioriyIcon(bug.priority) : null}
                                            <span>{t(getPriorityName(bug.priority))}</span>
                                          </div>
                                        </TableCell>
                                        <TableCell title={bug.sourceFile}>{bug.sourceFile}</TableCell>
                                        <TableCell>{bug.category}</TableCell>
                                        <TableCell>
                                          <div className="flex flex-col">
                                            <span className="font-medium text-xs break-all" title={bug.type}>
                                              {bug.type}
                                            </span>
                                            <span className="text-xs text-muted-foreground break-all" title={bug.message}>
                                              {bug.message}
                                            </span>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  ) : (
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-center py-4">
                                        {isLoading ? t('message.loading') : t('message.noIssues')}
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>
                    <ResizableHandle className="bg-transparent" />
                    <ResizablePanel id="spotbugs-detail" minSize={10} className="h-full min-h-0 overflow-hidden">
                      {selectedBug ? (
                        <div className="flex flex-col gap-4 h-full">
                          <div className="border rounded-md overflow-hidden h-full flex flex-col">
                            <div className="bg-muted p-2 font-medium flex items-center justify-between">
                              <div className="flex items-center justify-between gap-2 w-full">
                                <div className="flex flex-row items-end gap-2">
                                  <h3 className="text-sm font-semibold">{t('table.severity')}</h3>
                                  <Badge variant="outline" className={`${getPriorityColor(selectedBug.priority)} w-fit`}>
                                    {t(getPriorityName(selectedBug.priority))} ({selectedBug.priority})
                                  </Badge>
                                  <h3 className="text-sm font-semibold">{t('table.rank')}</h3>
                                  <Badge variant="outline" className={`${getRankColor(selectedBug.rank)} w-fit`}>
                                    {selectedBug.rank}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="w-full flex-1 flex flex-col overflow-hidden">
                              <TabsList className="w-full justify-start flex-shrink-0 rounded-none">
                                <TabsTrigger value="ai" className="flex items-center gap-1">
                                  <Bot strokeWidth={1.25} className="h-4 w-4" />
                                  <span>{t('dialog.spotbugs.aiAssistant')}</span>
                                </TabsTrigger>
                                <TabsTrigger value="summary" className="flex items-center gap-1">
                                  <OctagonAlert strokeWidth={1.25} className="h-4 w-4" />
                                  <span>{t('dialog.spotbugs.bugSummary')}</span>
                                </TabsTrigger>
                                <TabsTrigger value="details" className="flex items-center gap-1">
                                  <Bug strokeWidth={1.25} className="h-4 w-4" />
                                  <span>{t('dialog.spotbugs.bugDetails')}</span>
                                </TabsTrigger>
                              </TabsList>
                              {/* Bug Summary Tab */}
                              <TabsContent value="summary" className="relative h-full">
                                <div className="absolute inset-0 overflow-y-auto p-2 space-y-2">
                                  {/* Category */}
                                  <div className="border rounded-md bg-muted/30 p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h3 className="text-sm font-semibold">{t('table.category')}</h3>
                                      <Badge className="bg-black text-white dark:bg-white dark:text-black">{selectedBug.category}</Badge>
                                    </div>
                                    <p className="text-sm break-all">{t(getCategoryDescriptions(selectedBug.category))}</p>
                                  </div>
                                  {/* Type */}
                                  <div className="border rounded-md bg-muted/30 p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h3 className="text-sm font-semibold">{t('table.type')}</h3>
                                      <Badge className="bg-black text-white dark:bg-white dark:text-black">{selectedBug.type}</Badge>
                                    </div>
                                    <p className="text-sm break-all">{t(getBugDescriptionDetails(selectedBug.type))}</p>
                                  </div>
                                  {/* Message */}
                                  <div className="border rounded-md bg-muted/30 p-4">
                                    <h3 className="text-sm font-semibold">{t('table.message')}</h3>
                                    <p className="text-sm mt-2 break-all">{selectedBug.longMessage}</p>
                                  </div>
                                  <div className="border rounded-md bg-muted/30 p-4">
                                    <h3 className="text-sm font-medium">{t('table.class')}</h3>
                                    <p className="text-sm font-mono">{selectedBug.className}</p>
                                    {selectedBug.methods && selectedBug.methods.length > 0 && (
                                      <div>
                                        <h3 className="text-sm font-medium">{t('dialog.spotbugs.methods')}</h3>
                                        <div className="space-y-4 mt-2">
                                          {selectedBug.methods.map((method, index) => (
                                            <div key={index} className="overflow-x-auto border rounded-md bg-muted/30">
                                              <table className="min-w-full">
                                                <tbody>
                                                  {/* Method Name */}
                                                  <tr>
                                                    <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px] w-[90px]">{t('dialog.spotbugs.name')}</th>
                                                    <td className="text-xs p-2 border-b-[1px] font-mono font-bold">{method.name}</td>
                                                  </tr>
                                                  {/* Message */}
                                                  {method.message && (
                                                    <tr>
                                                      <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">{t('table.message')}</th>
                                                      <td className="text-xs p-2 border-b-[1px] break-all">{method.message}</td>
                                                    </tr>
                                                  )}
                                                  {/* Lines */}
                                                  {method.sourceLine && (
                                                    <tr>
                                                      <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">{t('dialog.spotbugs.lines')}</th>
                                                      <td className="text-xs p-2 border-b-[1px]">
                                                        {method.sourceLine.start} - {method.sourceLine.end}
                                                      </td>
                                                    </tr>
                                                  )}
                                                  {/* Roles (Colspan 2) */}
                                                  {(method.isStatic || method.primary || (method.role && method.role !== 'PRIMARY')) && (
                                                    <tr>
                                                      <td className="text-xs p-2" colSpan={2}>
                                                        <div className="flex flex-wrap gap-2">
                                                          {method.isStatic && <Badge className="bg-black text-white dark:bg-white dark:text-black">STATIC</Badge>}
                                                          {method.primary && <Badge className="bg-black text-white dark:bg-white dark:text-black">PRIMARY</Badge>}
                                                          {method.role && method.role !== 'PRIMARY' && (
                                                            <Badge className="bg-black text-white dark:bg-white dark:text-black">{method.role}</Badge>
                                                          )}
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  )}
                                                </tbody>
                                              </table>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TabsContent>
                              {/* Bug Details Tab */}
                              <TabsContent value="details" className="relative h-full">
                                <div className="absolute inset-0 overflow-y-auto p-2 space-y-2">
                                  {/* Source Lines */}
                                  {selectedBug.sourceLines && selectedBug.sourceLines.length > 0 && (
                                    <div>
                                      <h3 className="text-sm font-medium">{t('dialog.spotbugs.sourceLines')}</h3>
                                      <div className="mt-2 space-y-4">
                                        {selectedBug.sourceLines.map((sourceLine, index) => {
                                          const sourceLineKey = `${sourceLine.classname}:${sourceLine.start}-${sourceLine.end}`
                                          const codeSnippet = codeSnippets[sourceLineKey]
                                          return (
                                            <div key={index} className="overflow-x-auto border rounded-md bg-muted/30">
                                              <table className="min-w-full">
                                                <tbody>
                                                  <tr>
                                                    <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px] w-[90px]">{t('table.class')}</th>
                                                    <td className="text-xs p-2 border-b-[1px] break-all">{sourceLine.classname}</td>
                                                  </tr>
                                                  {sourceLine.sourcefile && (
                                                    <tr>
                                                      <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">{t('table.file')}</th>
                                                      <td className="text-xs p-2 border-b-[1px] break-all">{sourceLine.sourcefile}</td>
                                                    </tr>
                                                  )}
                                                  {(sourceLine.start !== null || sourceLine.end !== null) && (
                                                    <tr>
                                                      <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">{t('dialog.spotbugs.lines')}</th>
                                                      <td className="text-xs p-2 border-b-[1px]">
                                                        <div className="flex items-center justify-between">
                                                          {/* Flex container */}
                                                          <span>{`${sourceLine.start !== null ? sourceLine.start : '?'} - ${sourceLine.end !== null ? sourceLine.end : '?'}`}</span>
                                                          <div className="flex items-center space-x-2">
                                                            {/* Container cho các nút */}
                                                            {codeSnippet && (
                                                              <CodeSnippetDialog
                                                                trigger={
                                                                  <Button variant={buttonVariant} size="icon" title="Code Snippet" className="h-6 w-6">
                                                                    <FileCode className="h-3 w-3" />
                                                                  </Button>
                                                                }
                                                                title={`${sourceLine.sourcefile} (${sourceLine.start}-${sourceLine.end})`}
                                                                fileContent={fileContent}
                                                                codeSnippet={null}
                                                                startLine={sourceLine.start}
                                                                endLine={sourceLine.end}
                                                              />
                                                            )}
                                                            <Button
                                                              variant={buttonVariant}
                                                              size="icon"
                                                              onClick={() => handleExplainInAI(sourceLine)}
                                                              title="Giải thích lỗi"
                                                              className="h-6 w-6"
                                                            >
                                                              {/* Icon button */}
                                                              <Bot className="h-3 w-3" />
                                                            </Button>
                                                          </div>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  )}
                                                  {sourceLine.role && (
                                                    <tr>
                                                      <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">Role</th>
                                                      <td className="text-xs p-2 border-b-[1px]">
                                                        <Badge className="bg-black text-white dark:bg-white dark:text-black">{sourceLine.role}</Badge>
                                                      </td>
                                                    </tr>
                                                  )}
                                                  <tr>
                                                    <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">Primary</th>
                                                    <td className="text-xs p-2 border-b-[1px]">
                                                      {sourceLine.primary ? <Badge className="bg-black text-white dark:bg-white dark:text-black">PRIMARY</Badge> : '-'}
                                                    </td>
                                                  </tr>
                                                  {sourceLine.message && (
                                                    <tr>
                                                      <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">{t('table.message')}</th>
                                                      <td className="text-xs p-2 border-b-[1px] break-all">{sourceLine.message}</td>
                                                    </tr>
                                                  )}
                                                  {/* Các tr cho Code Snippet và Giải thích lỗi đã bị xóa */}
                                                </tbody>
                                              </table>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {/* Local Variables */}
                                  {selectedBug.localVariables && selectedBug.localVariables.length > 0 && (
                                    <div>
                                      <h3 className="text-sm font-medium">{t('dialog.spotbugs.localVariables')}</h3>
                                      <div className="mt-2 space-y-4">
                                        {selectedBug.localVariables?.map((variable, index) => (
                                          <div key={index} className="overflow-x-auto border rounded-md bg-muted/30">
                                            <table className="min-w-full">
                                              <tbody>
                                                <tr>
                                                  <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px] w-[90px]">{t('dialog.spotbugs.name')}</th>
                                                  <td className="text-xs p-2 border-b-[1px] font-mono font-bold">{variable.name || t('dialog.spotbugs.notAvailable')}</td>
                                                </tr>
                                                {variable.message && (
                                                  <tr>
                                                    <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px]">{t('table.message')}</th>
                                                    <td className="text-xs p-2 border-b-[1px] break-all">{variable.message}</td>
                                                  </tr>
                                                )}
                                                {variable.role && (
                                                  <tr>
                                                    <th className="text-xs p-2 text-left border-r-[1px]">Role</th>
                                                    <td className="text-xs p-2">
                                                      <Badge className="bg-black text-white dark:bg-white dark:text-black">{variable.role}</Badge>
                                                    </td>
                                                  </tr>
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Properties */}
                                  {selectedBug.properties && selectedBug.properties.length > 0 && (
                                    <div>
                                      <h3 className="text-sm font-medium">{t('dialog.spotbugs.properties')}</h3>
                                      <div className="mt-2 space-y-4">
                                        {selectedBug.properties?.map((property, index) => (
                                          <div key={index} className="overflow-x-auto border rounded-md bg-muted/30">
                                            <table className="min-w-full">
                                              <tbody>
                                                <tr>
                                                  <th className="text-xs p-2 text-left border-b-[1px] border-r-[1px] w-[90px]">{t('dialog.spotbugs.name')}</th>
                                                  <td className="text-xs p-2 border-b-[1px] font-mono font-bold">{property.name || t('dialog.spotbugs.notAvailable')}</td>
                                                </tr>
                                                {property.value && (
                                                  <tr>
                                                    <th className="text-xs p-2 text-left border-r-[1px]">{t('dialog.spotbugs.value')}</th>
                                                    <td className="text-xs p-2 font-mono break-all">{property.value}</td>
                                                  </tr>
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TabsContent>
                              {/* AI Assistant Tab */}
                              <TabsContent value="ai" className="relative h-full">
                                <SpotbugsAIChat
                                  bug={selectedBug}
                                  isLoading={isLoading}
                                  filePaths={filePaths}
                                  selectedSourceLineKey={selectedSourceLineKey}
                                  onAiLoadingChange={setIsLoadingAI}
                                />
                              </TabsContent>
                            </Tabs>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
                          <Bug className="h-12 w-12 mb-2 opacity-50" />
                          <p className="text-sm">{t('message.selectIssue')}</p>
                        </div>
                      )}
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
                {activeTab === 'filelist' && (
                  <div className="flex flex-col border rounded-md overflow-hidden h-full">
                    <div className="bg-muted p-2 font-medium">
                      {t('dialog.spotbugs.fileList')} ({filePaths.length})
                    </div>
                    <ScrollArea className="h-full w-full overflow-auto">
                      <Table wrapperClassName={cn('overflow-unset', filePaths.length === 0 && 'h-full')}>
                        <TableHeader sticky>
                          <TableRow>
                            <TableHead>{t('table.filePath')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filePaths.length > 0 ? (
                            filePaths.map((filePath, index) => (
                              <TableRow key={index}>
                                <TableCell className="text-xs font-mono">{filePath}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell className="text-center py-4">{isLoading ? t('message.loading') : t('message.noFilesAnalyzed')}</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
                {activeTab === 'chart' && (
                  <div className="h-full flex flex-col gap-4">
                    {/* Chart Type Selection Buttons */}
                    <div className="flex gap-2 mb-4 justify-center">
                      <Button
                        size="icon"
                        variant={activeChartType === 'priority' ? 'default' : 'outline'}
                        onClick={() => setActiveChartType('priority')}
                        title={t('dialog.spotbugs.priorityChart')}
                      >
                        <PieChartIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={activeChartType === 'file' ? 'default' : 'outline'}
                        onClick={() => setActiveChartType('file')}
                        title={t('dialog.spotbugs.fileStatsChart')}
                      >
                        <BarChartIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={activeChartType === 'package' ? 'default' : 'outline'}
                        onClick={() => setActiveChartType('package')}
                        title={t('dialog.spotbugs.packageStatsChart')}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Conditional Chart Rendering */}
                    <div className="flex-1 overflow-hidden">
                      {activeChartType === 'priority' && (
                        <Card className="flex flex-col w-full h-full relative">
                          <OverlayLoader isLoading={isLoading} />
                          <CardHeader className="items-center pb-0">
                            <CardTitle>{t('dialog.spotbugs.priorityChart')}</CardTitle>
                            <CardDescription>{t('dialog.spotbugs.priorityChartDescription')}</CardDescription>
                          </CardHeader>
                          <CardContent className="absolute inset-0 py-10">
                            {!isLoading && spotbugsResult.bugCount.total > 0 ? (
                              <ChartContainer
                                config={{
                                  count: { label: t('dialog.spotbugs.bugCount'), color: 'var(--color-red-500)' },
                                  high: { label: t('dialog.spotbugs.high'), color: 'var(--color-red-500)' },
                                  medium: { label: t('dialog.spotbugs.medium'), color: 'var(--color-yellow-500)' },
                                  low: { label: t('dialog.spotbugs.low'), color: 'var(--color-blue-500)' },
                                }}
                                className="w-full h-full relative"
                              >
                                <PieChart>
                                  <Pie
                                    data={[
                                      { priority: t('dialog.spotbugs.high'), count: spotbugsResult.bugCount.byPriority.high, fill: 'var(--color-red-500)' },
                                      { priority: t('dialog.spotbugs.medium'), count: spotbugsResult.bugCount.byPriority.medium, fill: 'var(--color-yellow-500)' },
                                      { priority: t('dialog.spotbugs.low'), count: spotbugsResult.bugCount.byPriority.low, fill: 'var(--color-blue-500)' },
                                    ]}
                                    dataKey="count"
                                    nameKey="priority"
                                    label
                                    cx="50%"
                                    cy="50%"
                                    outerRadius="80%"
                                  />
                                  <ChartTooltip content={<ChartTooltipContent />} />
                                  <ChartLegend layout="horizontal" verticalAlign="bottom" align="center" />
                                </PieChart>
                              </ChartContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full w-full">
                                <p className="text-muted-foreground">{isLoading ? t('message.loading') : t('common.noData')}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                      {activeChartType === 'file' && (
                        <Card className="flex flex-col w-full h-full relative">
                          <OverlayLoader isLoading={isLoading} />
                          <CardHeader className="items-center pb-0">
                            <CardTitle>{t('dialog.spotbugs.fileStatsChart')}</CardTitle>
                            <CardDescription>{t('dialog.spotbugs.fileStatsChartDescription')}</CardDescription>
                          </CardHeader>
                          <CardContent className="absolute inset-0 pt-20">
                            {!isLoading && spotbugsResult.fileStats.length > 0 ? (
                              <ChartContainer config={{ bugCount: { label: t('dialog.spotbugs.bugCount'), color: 'hsl(var(--chart-1))' } }} className="w-full h-full relative">
                                <BarChart
                                  accessibilityLayer
                                  data={spotbugsResult.fileStats.slice(0, 10).map(stat => ({
                                    path: stat.path.split(/[\\/]/).pop() || stat.path,
                                    bugCount: stat.bugCount,
                                    fullPath: stat.path,
                                  }))}
                                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                                >
                                  <CartesianGrid vertical={false} />
                                  <XAxis dataKey="path" tickLine={false} tickMargin={10} axisLine={false} height={60} interval={0} angle={-45} textAnchor="end" />
                                  <YAxis allowDecimals={false} />
                                  <ChartTooltip
                                    cursor={false}
                                    content={({ active, payload }) => {
                                      /* Tooltip content */
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="rounded-lg border bg-background p-2 shadow-sm max-w-[300px]">
                                            <div className="grid grid-cols-1 gap-2">
                                              <div className="flex flex-row gap-2">
                                                <span className="font-bold text-muted-foreground break-all">{payload[0].payload.fullPath}</span>
                                              </div>
                                              <div className="flex flex-row gap-2">
                                                <span className="text-[0.70rem] text-muted-foreground">{t('dialog.spotbugs.bugCount')}</span>
                                                <span className="font-bold">{payload[0].payload.bugCount}</span>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      }
                                      return null
                                    }}
                                  />
                                  <ChartLegend content={() => null} />
                                  <Bar dataKey="bugCount" fill="var(--color-chart-1)" radius={4} />
                                </BarChart>
                              </ChartContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full w-full">
                                <p className="text-muted-foreground">{isLoading ? t('message.loading') : t('common.noData')}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                      {activeChartType === 'package' && (
                        <Card className="flex flex-col w-full h-full relative">
                          <OverlayLoader isLoading={isLoading} />
                          <CardHeader className="items-center pb-0">
                            <CardTitle>{t('dialog.spotbugs.packageStatsChart')}</CardTitle>
                            <CardDescription>{t('dialog.spotbugs.packageStatsChartDescription')}</CardDescription>
                          </CardHeader>
                          <CardContent className="absolute inset-0 pt-20">
                            {!isLoading && spotbugsResult.packageStats.length > 0 ? (
                              <ChartContainer
                                config={{
                                  priority1: { label: t('dialog.spotbugs.high'), color: 'var(--color-red-500)' },
                                  priority2: { label: t('dialog.spotbugs.medium'), color: 'var(--color-yellow-500)' },
                                  priority3: { label: t('dialog.spotbugs.low'), color: 'var(--color-blue-500)' },
                                }}
                                className="w-full h-full relative"
                              >
                                <BarChart accessibilityLayer data={packageStatsData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                                  <CartesianGrid vertical={false} />
                                  <XAxis dataKey="packageName" tickLine={false} tickMargin={10} axisLine={false} height={60} interval={0} angle={-45} textAnchor="end" />
                                  <YAxis allowDecimals={false} />
                                  <ChartTooltip
                                    cursor={false}
                                    content={({ active, payload }) => {
                                      /* Tooltip content */
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="rounded-lg border bg-background p-2 shadow-sm max-w-[300px]">
                                            <div className="grid grid-cols-1 gap-2">
                                              <div className="flex flex-row gap-2">
                                                <span className="font-bold text-muted-foreground break-all">{payload[0].payload.fullPackage}</span>
                                              </div>
                                              <div className="flex flex-row gap-2 items-center">
                                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                                <span className="text-[0.70rem] text-muted-foreground">{t('dialog.spotbugs.high')}</span>
                                                <span className="font-bold ml-auto">{payload.find(p => p.dataKey === 'priority1')?.value ?? 0}</span>
                                              </div>
                                              <div className="flex flex-row gap-2 items-center">
                                                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                                <span className="text-[0.70rem] text-muted-foreground">{t('dialog.spotbugs.medium')}</span>
                                                <span className="font-bold ml-auto">{payload.find(p => p.dataKey === 'priority2')?.value ?? 0}</span>
                                              </div>
                                              <div className="flex flex-row gap-2 items-center">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                <span className="text-[0.70rem] text-muted-foreground">{t('dialog.spotbugs.low')}</span>
                                                <span className="font-bold ml-auto">{payload.find(p => p.dataKey === 'priority3')?.value ?? 0}</span>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      }
                                      return null
                                    }}
                                  />
                                  <ChartLegend />
                                  <Bar
                                    dataKey="priority3"
                                    name={t(getPriorityName(3))}
                                    fill="var(--color-blue-500)"
                                    stackId="a"
                                    shape={(props: any) => <CustomBarShape {...props} dataKey="priority3" fill="var(--color-blue-500)" posMap={packagePosMap} />}
                                  />
                                  <Bar
                                    dataKey="priority2"
                                    name={t(getPriorityName(2))}
                                    fill="var(--color-yellow-500)"
                                    stackId="a"
                                    shape={(props: any) => <CustomBarShape {...props} dataKey="priority2" fill="var(--color-yellow-500)" posMap={packagePosMap} />}
                                  />
                                  <Bar
                                    dataKey="priority1"
                                    name={t(getPriorityName(1))}
                                    fill="var(--color-red-500)"
                                    stackId="a"
                                    shape={(props: any) => <CustomBarShape {...props} dataKey="priority1" fill="var(--color-red-500)" posMap={packagePosMap} />}
                                  />
                                </BarChart>
                              </ChartContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full w-full">
                                <p className="text-muted-foreground">{isLoading ? t('message.loading') : t('common.noData')}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
