'use client'
import { AreaChart as AreaChartIcon, BarChart2, BarChart3, BarChartIcon, Filter, LineChart as LineChartIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { formatDateDisplay } from '@/lib/dateUtils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import logger from '@/services/logger'
import { Badge } from '../../ui/badge'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '../../ui/chart'
import { Checkbox } from '../../ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover'
import { OverlayLoader } from '../../ui-elements/OverlayLoader'

interface CommitByDate {
  date: string
  authors: { author: string; count: number }[]
  totalCount: number
  [key: string]: string | number | { author: string; count: number }[]
}

interface CommitByAuthor {
  author: string
  count: number
}

interface AuthorshipData {
  author: string
  percentage: number
  count: number
}

interface SummaryData {
  author: string
  count: number
  percentage: number
}

interface StatisticsData {
  commitsByDate: CommitByDate[]
  commitsByAuthor: CommitByAuthor[]
  authorship: AuthorshipData[]
  summary: SummaryData[]
  totalCommits: number
}

interface StatisticDialogProps {
  data?: any
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  filePath: string
  /** Source folder path (cwd) - folder đang được chọn trong ShowLog. Nếu không truyền sẽ dùng config mặc định (có thể sai khi user đổi folder). */
  sourceFolderPath?: string
  dateRange?: DateRange
  versionControlSystem?: 'svn' | 'git'
}

type CommitByDateChartType = 'bar-multiple' | 'bar-horizontal' | 'bar-stacked' | 'line-multiple' | 'area-multiple'
type CommitByAuthorChartType = 'bar-vertical' | 'bar-horizontal'

export function StatisticDialog({ isOpen, onOpenChange, filePath, sourceFolderPath, dateRange, versionControlSystem = 'svn' }: StatisticDialogProps) {
  const { t } = useTranslation()
  const formatChartDateTick = useCallback(
    (value: string | number) => {
      const s = typeof value === 'number' ? String(value) : value
      if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return String(value)
      return formatDateDisplay(s.slice(0, 10), i18n.language)
    },
    [i18n.language]
  )
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [activeTab, setActiveTab] = useState('commit-by-date')
  const [statisticsData, setStatisticsData] = useState<StatisticsData | null>(null)
  const statisticsPeriod = 'all'
  const [isLoadingStatistics, setIsLoadingStatistics] = useState(false)
  const [commitByDateChartType, setCommitByDateChartType] = useState<CommitByDateChartType>('bar-stacked')
  const [commitByAuthorChartType, setCommitByAuthorChartType] = useState<CommitByAuthorChartType>('bar-vertical')
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [hasInitializedAuthors, setHasInitializedAuthors] = useState(false)
  const loadStatisticsData = useCallback(async () => {
    if (!filePath) return

    try {
      setIsLoadingStatistics(true)
      let options: any = { period: statisticsPeriod }
      if (dateRange?.from) {
        const dateFrom = dateRange.from.toISOString()
        const dateTo = dateRange.to?.toISOString()
        options = { dateFrom }
        if (dateTo) {
          options.dateTo = dateTo
        }
      }
      // Truyền cwd = sourceFolderPath để dùng đúng folder user đã chọn (tránh dùng config cũ khi đổi folder)
      if (sourceFolderPath) {
        options.cwd = sourceFolderPath
      }

      // Call appropriate API based on version control system
      const result = versionControlSystem === 'git' ? await window.api.git.statistics(filePath, options) : await window.api.svn.statistics(filePath, options)

      if (result.status === 'success') {
        logger.info(`${versionControlSystem.toUpperCase()} Statistics data:`, result.data, 'Options:', options)
        setStatisticsData(result.data)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      logger.error('Error loading statistics data:', error)
      toast.error(t('dialog.statisticSvn.errorLoading'))
    } finally {
      setIsLoadingStatistics(false)
    }
  }, [filePath, sourceFolderPath, statisticsPeriod, dateRange, versionControlSystem, t])

  useEffect(() => {
    if (isOpen) {
      loadStatisticsData()
      setHasInitializedAuthors(false)
    } else {
      // Reset when dialog closes
      setSelectedAuthors([])
      setHasInitializedAuthors(false)
    }
  }, [statisticsPeriod, isOpen, loadStatisticsData])

  // Get all unique authors
  const allAuthors = useMemo(() => {
    const authors = new Set<string>()
    if (statisticsData?.commitsByDate) {
      for (const day of statisticsData.commitsByDate) {
        for (const authorData of day.authors) {
          authors.add(authorData.author)
        }
      }
    }
    return Array.from(authors).sort()
  }, [statisticsData?.commitsByDate])

  // Initialize selected authors when data loads (only once per dialog open)
  useEffect(() => {
    if (allAuthors.length > 0 && !hasInitializedAuthors) {
      setSelectedAuthors(allAuthors)
      setHasInitializedAuthors(true)
    }
  }, [allAuthors, hasInitializedAuthors])

  const processedTotalDateData = useMemo(() => {
    return [...(statisticsData?.commitsByDate ?? [])].map(item => ({ date: item.date, count: item.totalCount })).sort((a, b) => a.date.localeCompare(b.date))
  }, [statisticsData?.commitsByDate])

  const processedStackedDateData = useMemo(() => {
    if (!statisticsData?.commitsByDate) return []

    // Filter authors based on selection - use selectedAuthors after initialization
    const authorsToShow = hasInitializedAuthors ? selectedAuthors : allAuthors

    return [...statisticsData.commitsByDate]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => {
        const dayData: { date: string; totalCount: number; [key: string]: number | string } = {
          date: day.date,
          totalCount: 0, // Will recalculate based on filtered authors
        }

        // Initialize all filtered authors with 0
        for (const author of authorsToShow) {
          dayData[author] = 0
        }

        // Fill in actual counts for filtered authors
        let filteredTotal = 0
        for (const authorData of day.authors) {
          if (authorsToShow.includes(authorData.author)) {
            dayData[authorData.author] = authorData.count
            filteredTotal += authorData.count
          }
        }

        dayData.totalCount = filteredTotal
        return dayData
      })
  }, [statisticsData?.commitsByDate, selectedAuthors, allAuthors, hasInitializedAuthors])

  const chartData1 = useMemo(() => {
    // Filter by selected authors - use selectedAuthors after initialization
    const authorsToShow = hasInitializedAuthors ? selectedAuthors : allAuthors
    return (statisticsData?.commitsByAuthor ?? [])
      .filter(item => authorsToShow.includes(item.author))
      .map((item, index) => ({
        author: item.author,
        count: item.count,
        fill: `var(--chart-${index + 1})`,
      }))
  }, [statisticsData, selectedAuthors, allAuthors, hasInitializedAuthors])

  const chartData2 = useMemo(() => {
    // Filter by selected authors - use selectedAuthors after initialization
    const authorsToShow = hasInitializedAuthors ? selectedAuthors : allAuthors
    return (statisticsData?.authorship ?? [])
      .filter(item => authorsToShow.includes(item.author))
      .map((item, index) => ({
        author: item.author,
        count: item.count,
        fill: `var(--chart-${index + 1})`,
      }))
  }, [statisticsData, selectedAuthors, allAuthors, hasInitializedAuthors])

  const chartConfig1 = useMemo(() => {
    const config: Record<string, { label: string; color?: string }> = {
      count: { label: 'Commits' },
    }
    // Filter by selected authors - use selectedAuthors after initialization
    const authorsToShow = hasInitializedAuthors ? selectedAuthors : allAuthors
    chartData1.forEach((item: any, index: number) => {
      if (authorsToShow.includes(item.author)) {
        config[item.author] = {
          label: item.author,
          color: `var(--chart-${index + 1})`,
        }
      }
    })
    return config
  }, [chartData1, selectedAuthors, allAuthors, hasInitializedAuthors])

  const commitByDateChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {}

    // Only include selected authors in config - use selectedAuthors after initialization
    const authorsToShow = hasInitializedAuthors ? selectedAuthors : allAuthors

    authorsToShow.forEach((author, index) => {
      config[author] = {
        label: author,
        color: `var(--chart-${(index % 10) + 1})`,
      }
    })
    return config
  }, [selectedAuthors, allAuthors, t, hasInitializedAuthors])

  const totalCountChartConfig = useMemo(() => {
    return {
      count: { label: t('dialog.statisticSvn.commitCountLabel', 'Commits'), color: 'var(--chart-1)' },
    }
  }, [t])

  function getBarRadius(data: any[], authorKeys: any[]) {
    const posMap: Record<string, { single?: string; top?: string; bottom?: string }> = {}
    for (const row of data) {
      const authorsWithValue = authorKeys.filter(key => row[key] > 0)
      if (authorsWithValue.length === 1) {
        posMap[row.date] = { single: authorsWithValue[0] }
      } else if (authorsWithValue.length > 1) {
        posMap[row.date] = {
          top: authorsWithValue[authorsWithValue.length - 1],
          bottom: authorsWithValue[0],
        }
      }
    }
    return posMap
  }

  const posMap = getBarRadius(processedStackedDateData, Object.keys(commitByDateChartConfig))

  const getRadiusForAuthor = (date: string | number, author: string | undefined) => {
    if (!posMap[date]) return [0, 0, 0, 0]
    if (posMap[date].single === author) return [4, 4, 4, 4]
    if (posMap[date].top === author) return [4, 4, 0, 0]
    if (posMap[date].bottom === author) return [0, 0, 0, 0]
    return [0, 0, 0, 0]
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
  const CustomBarShape = (props: { x: number; y: number; width: number; height: number; payload: any; dataKey: string; fill: string }) => {
    const { x, y, width, height, payload, dataKey, fill } = props
    const date = payload.date
    const radius = getRadiusForAuthor(date, dataKey)
    const d = roundedRect(x, y, width, height, ...(radius as [number, number, number, number]))
    return <path d={d} fill={fill} />
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="table">
        <DialogHeader className="w-[750px]">
          <DialogTitle>{t('dialog.statisticSvn.title')}</DialogTitle>
          <DialogDescription>{t('dialog.statisticSvn.description')}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="commit-by-date">{t('dialog.statisticSvn.tabs.commitByDate')}</TabsTrigger>
            <TabsTrigger value="commit-by-author">{t('dialog.statisticSvn.tabs.commitByAuthor')}</TabsTrigger>
            <TabsTrigger value="authorship">{t('dialog.statisticSvn.tabs.authorship')}</TabsTrigger>
            <TabsTrigger value="summary">{t('dialog.statisticSvn.tabs.summary')}</TabsTrigger>
          </TabsList>

          <TabsContent value="commit-by-date" className="h-[550px]">
            <div className="flex flex-col h-full">
              {(statisticsData?.commitsByDate?.length ?? 0) > 0 ? (
                <Card className="flex flex-col max-w-full sticky h-[550px]">
                  <OverlayLoader isLoading={isLoadingStatistics} />
                  <CardHeader className="flex flex-row items-center justify-between pb-0">
                    <div className="flex flex-col">
                      <CardTitle className="flex items-center gap-2">
                        {t('dialog.statisticSvn.commitByDate.cardTitle')}
                        {hasInitializedAuthors && selectedAuthors.length !== allAuthors.length && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedAuthors.length}/{allAuthors.length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{t('dialog.statisticSvn.commitByDate.cardDescription')}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {/* Author Filter */}
                      <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button size="icon" variant={hasInitializedAuthors && selectedAuthors.length !== allAuthors.length ? 'default' : buttonVariant} title="Filter theo user">
                            <Filter className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="end">
                          <Command>
                            <CommandInput placeholder="Tìm kiếm user..." />
                            <CommandList>
                              <CommandEmpty>Không tìm thấy user</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    if (selectedAuthors.length === allAuthors.length) {
                                      setSelectedAuthors([])
                                    } else {
                                      setSelectedAuthors(allAuthors)
                                    }
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Checkbox checked={selectedAuthors.length === allAuthors.length} className="mr-2" />
                                  <span className="font-medium">Chọn tất cả</span>
                                </CommandItem>
                                {allAuthors.map(author => (
                                  <CommandItem
                                    key={author}
                                    onSelect={() => {
                                      setSelectedAuthors(prev => (prev.includes(author) ? prev.filter(a => a !== author) : [...prev, author]))
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Checkbox checked={selectedAuthors.includes(author)} className="mr-2" />
                                    <span>{author}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'bar-multiple' ? 'default' : buttonVariant}
                        onClick={() => setCommitByDateChartType('bar-multiple')}
                        title={t('dialog.statisticSvn.commitByDate.chartTypes.barMultiple')}
                      >
                        <BarChartIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'bar-horizontal' ? 'default' : buttonVariant}
                        onClick={() => setCommitByDateChartType('bar-horizontal')}
                        title={t('dialog.statisticSvn.commitByDate.chartTypes.barHorizontal')}
                      >
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'bar-stacked' ? 'default' : buttonVariant}
                        onClick={() => setCommitByDateChartType('bar-stacked')}
                        title={t('dialog.statisticSvn.commitByDate.chartTypes.barStacked')}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'line-multiple' ? 'default' : buttonVariant}
                        onClick={() => setCommitByDateChartType('line-multiple')}
                        title={t('dialog.statisticSvn.commitByDate.chartTypes.lineMultiple')}
                      >
                        <LineChartIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'area-multiple' ? 'default' : buttonVariant}
                        onClick={() => setCommitByDateChartType('area-multiple')}
                        title={t('dialog.statisticSvn.commitByDate.chartTypes.areaMultiple')}
                      >
                        <AreaChartIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pb-0 overflow-hidden pt-4">
                    {(() => {
                      const authorKeys = Object.keys(commitByDateChartConfig)
                      if (commitByDateChartType === 'bar-multiple') {
                        return (
                          <ChartContainer config={commitByDateChartConfig} className="w-full mx-auto h-[350px]">
                            <BarChart accessibilityLayer data={processedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={formatChartDateTick} />
                              <YAxis />
                              <ChartTooltip labelFormatter={formatChartDateTick} content={<ChartTooltipContent />} />
                              <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                              {authorKeys.map(author => (
                                <Bar key={author} dataKey={author} fill={commitByDateChartConfig[author]?.color} radius={4} />
                              ))}
                            </BarChart>
                          </ChartContainer>
                        )
                      }

                      if (commitByDateChartType === 'bar-horizontal') {
                        return (
                          <ChartContainer config={totalCountChartConfig} className="w-full mx-auto h-[350px]">
                            <BarChart accessibilityLayer layout="vertical" data={processedTotalDateData} margin={{ top: 25, right: 30, left: 50, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" dataKey="count" />
                              <YAxis
                                dataKey="date"
                                type="category"
                                tickLine={false}
                                axisLine={false}
                                width={80}
                                tickFormatter={formatChartDateTick}
                              />
                              <ChartTooltip labelFormatter={formatChartDateTick} content={<ChartTooltipContent hideLabel />} />
                              <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                              <Bar dataKey="count" fill="var(--chart-1)" radius={8}>
                                <LabelList dataKey="count" position="right" offset={8} className="fill-foreground" fontSize={12} />
                              </Bar>
                            </BarChart>
                          </ChartContainer>
                        )
                      }

                      if (commitByDateChartType === 'bar-stacked') {
                        return (
                          <ChartContainer config={commitByDateChartConfig} className="w-full mx-auto h-[350px]">
                            <BarChart accessibilityLayer data={processedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={formatChartDateTick} />
                              <YAxis />
                              <ChartTooltip labelFormatter={formatChartDateTick} content={<ChartTooltipContent />} />
                              <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                              {authorKeys.map(author => (
                                <Bar
                                  key={author}
                                  dataKey={author}
                                  stackId="a"
                                  fill={commitByDateChartConfig[author]?.color}
                                  shape={(props: any) => <CustomBarShape {...props} dataKey={author} />}
                                />
                              ))}
                            </BarChart>
                          </ChartContainer>
                        )
                      }

                      if (commitByDateChartType === 'line-multiple') {
                        return (
                          <ChartContainer config={commitByDateChartConfig} className="w-full mx-auto h-[350px]">
                            <LineChart accessibilityLayer data={processedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={formatChartDateTick} />
                              <YAxis />
                              <ChartTooltip labelFormatter={formatChartDateTick} content={<ChartTooltipContent />} />
                              <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                              {authorKeys.map(author => (
                                <Line key={author} type="monotone" dataKey={author} stroke={commitByDateChartConfig[author]?.color} activeDot={{ r: 8 }} />
                              ))}
                            </LineChart>
                          </ChartContainer>
                        )
                      }

                      if (commitByDateChartType === 'area-multiple') {
                        return (
                          <ChartContainer config={commitByDateChartConfig} className="w-full mx-auto h-[350px]">
                            <AreaChart accessibilityLayer data={processedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={formatChartDateTick} />
                              <YAxis />
                              <ChartTooltip labelFormatter={formatChartDateTick} content={<ChartTooltipContent />} />
                              <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                              {authorKeys.map(author => (
                                <Area
                                  key={author}
                                  type="monotone"
                                  dataKey={author}
                                  stackId="1"
                                  stroke={commitByDateChartConfig[author]?.color}
                                  fill={commitByDateChartConfig[author]?.color}
                                  fillOpacity={0.4}
                                />
                              ))}
                            </AreaChart>
                          </ChartContainer>
                        )
                      }

                      return <div>{t('dialog.statisticSvn.selectChartType')}</div>
                    })()}
                  </CardContent>
                  <CardFooter className="text-sm text-muted-foreground">{t('dialog.statisticSvn.cardFooter')}</CardFooter>
                </Card>
              ) : (
                <div className="h-full flex items-center justify-center min-h-[550px]">
                  <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="commit-by-author" className="h-[550px]">
            <div className="flex flex-col h-full">
              {(statisticsData?.commitsByAuthor?.length ?? 0) > 0 ? (
                <Card className="flex flex-col max-w-full sticky h-[550px]">
                  <OverlayLoader isLoading={isLoadingStatistics} />
                  <CardHeader className="flex flex-row items-center justify-between pb-0">
                    <div className="flex flex-col">
                      <CardTitle className="flex items-center gap-2">
                        {t('dialog.statisticSvn.commitByAuthor.cardTitle')}
                        {hasInitializedAuthors && selectedAuthors.length !== allAuthors.length && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedAuthors.length}/{allAuthors.length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{t('dialog.statisticSvn.commitByAuthor.cardDescription')}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {/* Author Filter */}
                      <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button size="icon" variant={hasInitializedAuthors && selectedAuthors.length !== allAuthors.length ? 'default' : buttonVariant} title="Filter theo user">
                            <Filter className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="end">
                          <Command>
                            <CommandInput placeholder="Tìm kiếm user..." />
                            <CommandList>
                              <CommandEmpty>Không tìm thấy user</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    if (selectedAuthors.length === allAuthors.length) {
                                      setSelectedAuthors([])
                                    } else {
                                      setSelectedAuthors(allAuthors)
                                    }
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Checkbox checked={selectedAuthors.length === allAuthors.length} className="mr-2" />
                                  <span className="font-medium">Chọn tất cả</span>
                                </CommandItem>
                                {allAuthors.map(author => (
                                  <CommandItem
                                    key={author}
                                    onSelect={() => {
                                      setSelectedAuthors(prev => (prev.includes(author) ? prev.filter(a => a !== author) : [...prev, author]))
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Checkbox checked={selectedAuthors.includes(author)} className="mr-2" />
                                    <span>{author}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="icon"
                        variant={commitByAuthorChartType === 'bar-vertical' ? 'default' : buttonVariant}
                        onClick={() => setCommitByAuthorChartType('bar-vertical')}
                        title={t('dialog.statisticSvn.commitByAuthor.chartTypes.barVertical')}
                      >
                        <BarChartIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByAuthorChartType === 'bar-horizontal' ? 'default' : buttonVariant}
                        onClick={() => setCommitByAuthorChartType('bar-horizontal')}
                        title={t('dialog.statisticSvn.commitByAuthor.chartTypes.barHorizontal')}
                      >
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pb-0 overflow-hidden pt-4">
                    {commitByAuthorChartType === 'bar-vertical' && (
                      <ChartContainer config={chartConfig1} className="w-full mx-auto h-[350px]">
                        <BarChart
                          accessibilityLayer
                          data={chartData1}
                          margin={{
                            top: 25,
                            right: 30,
                            left: 20,
                            bottom: 5,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="author" tickLine={false} tickMargin={10} axisLine={false} />
                          <YAxis />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                          <Bar dataKey="count" fill="var(--color-count)" radius={8}>
                            <LabelList position="top" offset={12} className="fill-foreground" fontSize={12} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                    {commitByAuthorChartType === 'bar-horizontal' && (
                      <ChartContainer config={chartConfig1} className="w-full mx-auto h-[350px]">
                        <BarChart
                          accessibilityLayer
                          layout="vertical"
                          data={chartData1}
                          margin={{
                            top: 25,
                            right: 30,
                            left: 50,
                            bottom: 5,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="author" type="category" tickLine={false} axisLine={false} width={100} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                          <Bar dataKey="count" fill="var(--color-count)" radius={8}>
                            <LabelList position="right" offset={12} className="fill-foreground" fontSize={12} />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                  <CardFooter className="text-sm text-muted-foreground">{t('dialog.statisticSvn.cardFooter')}</CardFooter>
                </Card>
              ) : (
                <div className="h-full flex items-center justify-center min-h-[550px]">
                  <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="authorship" className="h-[550px]">
            <div className="flex flex-col h-full">
              {(chartData2.length ?? 0) > 0 ? (
                <Card className="flex flex-col max-w-full sticky h-[550px]">
                  <OverlayLoader isLoading={isLoadingStatistics} />
                  <CardHeader className="flex flex-row items-center justify-between pb-0">
                    <div className="flex flex-col">
                      <CardTitle className="flex items-center gap-2">
                        {t('dialog.statisticSvn.authorship.cardTitle')}
                        {hasInitializedAuthors && selectedAuthors.length !== allAuthors.length && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedAuthors.length}/{allAuthors.length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{t('dialog.statisticSvn.authorship.cardDescription')}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {/* Author Filter */}
                      <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button size="icon" variant={hasInitializedAuthors && selectedAuthors.length !== allAuthors.length ? 'default' : buttonVariant} title="Filter theo user">
                            <Filter className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="end">
                          <Command>
                            <CommandInput placeholder="Tìm kiếm user..." />
                            <CommandList>
                              <CommandEmpty>Không tìm thấy user</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    if (selectedAuthors.length === allAuthors.length) {
                                      setSelectedAuthors([])
                                    } else {
                                      setSelectedAuthors(allAuthors)
                                    }
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Checkbox checked={selectedAuthors.length === allAuthors.length} className="mr-2" />
                                  <span className="font-medium">Chọn tất cả</span>
                                </CommandItem>
                                {allAuthors.map(author => (
                                  <CommandItem
                                    key={author}
                                    onSelect={() => {
                                      setSelectedAuthors(prev => (prev.includes(author) ? prev.filter(a => a !== author) : [...prev, author]))
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Checkbox checked={selectedAuthors.includes(author)} className="mr-2" />
                                    <span>{author}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pb-0 overflow-hidden">
                    <ChartContainer config={chartConfig1} className="w-full mx-auto h-full">
                      <PieChart accessibilityLayer>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie data={chartData2} dataKey="count" label nameKey="author" />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                  <CardFooter className="text-sm text-muted-foreground">{t('dialog.statisticSvn.cardFooter')}</CardFooter>
                </Card>
              ) : (
                <div className="h-full flex items-center justify-center min-h-[550px]">
                  <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="h-[550px] min-h-[550px]">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  {t('dialog.statisticSvn.summary.title')}
                  {hasInitializedAuthors && selectedAuthors.length !== allAuthors.length && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedAuthors.length}/{allAuthors.length}
                    </Badge>
                  )}
                </h3>
                {/* Author Filter */}
                <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant={hasInitializedAuthors && selectedAuthors.length !== allAuthors.length ? 'default' : buttonVariant} title="Filter theo user">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm user..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy user</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              if (selectedAuthors.length === allAuthors.length) {
                                setSelectedAuthors([])
                              } else {
                                setSelectedAuthors(allAuthors)
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <Checkbox checked={selectedAuthors.length === allAuthors.length} className="mr-2" />
                            <span className="font-medium">Chọn tất cả</span>
                          </CommandItem>
                          {allAuthors.map(author => (
                            <CommandItem
                              key={author}
                              onSelect={() => {
                                setSelectedAuthors(prev => (prev.includes(author) ? prev.filter(a => a !== author) : [...prev, author]))
                              }}
                              className="cursor-pointer"
                            >
                              <Checkbox checked={selectedAuthors.includes(author)} className="mr-2" />
                              <span>{author}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex-1 border rounded-md p-4 overflow-auto sticky">
                <OverlayLoader isLoading={isLoadingStatistics} />
                {(statisticsData?.summary?.length ?? 0) > 0 ? (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">{t('dialog.statisticSvn.summary.author')}</th>
                        <th className="text-right p-2">{t('dialog.statisticSvn.summary.commitCount')}</th>
                        <th className="text-right p-2">{t('dialog.statisticSvn.summary.percentage')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Filter by selected authors - use selectedAuthors after initialization
                        const authorsToShow = hasInitializedAuthors ? selectedAuthors : allAuthors
                        const filteredSummary = (statisticsData?.summary ?? []).filter((item: SummaryData) => authorsToShow.includes(item.author))
                        const filteredTotal = filteredSummary.reduce((sum, item) => sum + item.count, 0)

                        return (
                          <>
                            {filteredSummary.map((item: SummaryData, index: number) => (
                              <tr key={index} className="border-b">
                                <td className="p-2">{item.author}</td>
                                <td className="text-right p-2">{item.count}</td>
                                <td className="text-right p-2">{filteredTotal > 0 ? Math.round((item.count / filteredTotal) * 100) : 0}%</td>
                              </tr>
                            ))}
                            <tr className="font-bold border-t">
                              <td className="p-2">{t('dialog.statisticSvn.summary.total')}</td>
                              <td className="text-right p-2">{filteredTotal}</td>
                              <td className="text-right p-2">100%</td>
                            </tr>
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex items-center justify-center min-h-[550px]">
                    <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
