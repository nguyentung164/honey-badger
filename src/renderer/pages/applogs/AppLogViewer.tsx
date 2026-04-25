'use client'

import {
  ArrowDownToLine,
  Copy,
  FileText,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  Square,
  WrapText,
  X,
} from 'lucide-react'
import { IPC } from 'main/constants'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { cn } from '@/lib/utils'

const LOG_LINE_REGEX = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\] › \[([^\]]*)\] › \[(\w+)\] › (.*)/s
const LAZY_LOAD_BATCH = 150
const LAZY_LOAD_THRESHOLD = 80

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'VERBOSE' | 'SILLY'

interface ParsedLogLine {
  raw: string
  timestamp?: string
  caller?: string
  level?: LogLevel
  message?: string
}

function parseLogLine(line: string): ParsedLogLine {
  const match = line.match(LOG_LINE_REGEX)
  if (match) {
    return {
      raw: line,
      timestamp: match[1],
      caller: match[2],
      level: match[3].toUpperCase() as LogLevel,
      message: match[4],
    }
  }
  return { raw: line }
}

function getLevelClass(level?: LogLevel): string {
  if (!level) return ''
  switch (level) {
    case 'ERROR':
      return 'text-destructive bg-destructive/10'
    case 'WARN':
      return 'text-amber-600 dark:text-amber-400'
    case 'INFO':
    case 'DEBUG':
    case 'VERBOSE':
    case 'SILLY':
    default:
      return ''
  }
}

function LogContent({
  lines,
  searchText,
  levelFilter,
  lineWrap,
  autoScroll,
  onCopyLine,
}: {
  lines: string[]
  searchText: string
  levelFilter: string
  lineWrap: boolean
  autoScroll: boolean
  onCopyLine: (line: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  const newestFirstLines = useMemo(() => [...lines].reverse(), [lines])

  const filteredLines = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    return newestFirstLines.filter((line) => {
      const parsed = parseLogLine(line)
      if (levelFilter !== 'all' && parsed.level) {
        if (parsed.level.toUpperCase() !== levelFilter) return false
      }
      if (search && !line.toLowerCase().includes(search)) return false
      return true
    })
  }, [newestFirstLines, searchText, levelFilter])

  const searchRegex = useMemo(() => {
    const search = searchText.trim()
    return search ? new RegExp(`(${escapeRegExp(search)})`, 'gi') : null
  }, [searchText])

  const [visibleCount, setVisibleCount] = useState(LAZY_LOAD_BATCH)
  const isLoadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)
  const filteredLengthRef = useRef(0)
  hasMoreRef.current = visibleCount < filteredLines.length
  filteredLengthRef.current = filteredLines.length

  const loadMore = useCallback(() => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return
    isLoadingMoreRef.current = true
    setVisibleCount((prev) => Math.min(prev + LAZY_LOAD_BATCH, filteredLengthRef.current))
    setTimeout(() => {
      isLoadingMoreRef.current = false
    }, 150)
  }, [])

  const prevVisibleCountRef = useRef(visibleCount)
  useEffect(() => {
    if (visibleCount > prevVisibleCountRef.current && scrollRef.current) {
      const el = scrollRef.current
      if (el.scrollTop <= LAZY_LOAD_THRESHOLD) {
        requestAnimationFrame(() => {
          if (loadMoreRef.current) {
            el.scrollTop = loadMoreRef.current.offsetHeight + 20
          }
        })
      }
      prevVisibleCountRef.current = visibleCount
    } else {
      prevVisibleCountRef.current = visibleCount
    }
  }, [visibleCount])

  const displayedLines = useMemo(
    () => filteredLines.slice(0, visibleCount),
    [filteredLines, visibleCount]
  )

  const hasMore = visibleCount < filteredLines.length

  useEffect(() => {
    setVisibleCount(LAZY_LOAD_BATCH)
  }, [filteredLines.length])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - scrollRef.current.clientHeight
    }
  }, [filteredLines.length, autoScroll])

  const checkAndLoadMore = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMoreRef.current) return
    if (el.scrollTop <= LAZY_LOAD_THRESHOLD) loadMore()
  }, [loadMore])

  useEffect(() => {
    const root = scrollRef.current
    const el = loadMoreRef.current
    if (!root || !el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { root, rootMargin: `${LAZY_LOAD_THRESHOLD}px`, threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [filteredLines.length, hasMore, visibleCount, loadMore])

  const handleScroll = useCallback(() => {
    requestAnimationFrame(checkAndLoadMore)
  }, [checkAndLoadMore])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let scrollEndTimer: ReturnType<typeof setTimeout>
    const onScrollEnd = () => requestAnimationFrame(checkAndLoadMore)
    const onScroll = () => {
      clearTimeout(scrollEndTimer)
      scrollEndTimer = setTimeout(onScrollEnd, 100)
    }
    el.addEventListener('scrollend', onScrollEnd)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scrollend', onScrollEnd)
      el.removeEventListener('scroll', onScroll)
      clearTimeout(scrollEndTimer)
    }
  }, [checkAndLoadMore])

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">{t('appLogs.noLogs')}</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full min-h-0 overflow-y-auto overflow-x-auto font-mono text-xs bg-muted/30 rounded-lg border p-3"
    >
      {hasMore && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-4 text-muted-foreground text-xs shrink-0"
        >
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {t('appLogs.loadingMore')}
        </div>
      )}
      <div className="flex flex-col-reverse gap-0.5 min-w-max w-full">
        {displayedLines.map((line, idx) => {
          const parsed = parseLogLine(line)
          const highlightParts =
            searchRegex && line.toLowerCase().includes(searchText.trim().toLowerCase())
              ? line.split(searchRegex)
              : [line]

          return (
            <ContextMenu key={idx}>
              <ContextMenuTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onCopyLine(line)}
                  onKeyDown={(e) => e.key === 'Enter' && onCopyLine(line)}
                  className={cn(
                    'flex py-0.5 px-1 -mx-1 rounded hover:bg-primary/20 dark:hover:bg-primary/25 cursor-pointer group min-w-max transition-colors',
                    getLevelClass(parsed.level)
                  )}
                >
                  <span
                    className={cn(
                      'break-all',
                      lineWrap ? 'flex-1 whitespace-pre-wrap' : 'whitespace-nowrap min-w-max'
                    )}
                  >
                    {highlightParts.map((part, i) =>
                      searchRegex && part.toLowerCase() === searchText.trim().toLowerCase() ? (
                        <mark key={i} className="bg-yellow-400/50 dark:bg-yellow-600/50 rounded">
                          {part}
                        </mark>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => onCopyLine(line)}>
                  <Copy className="h-4 w-4" />
                  {t('appLogs.copyLine')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
    </div>
  )
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function AppLogViewer() {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ path: string; lines: string[] }>>([])
  const [searchText, setSearchText] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [lineWrap, setLineWrap] = useState(false)

  const allLogLines = useMemo(
    () => logs.flatMap(l => l.lines),
    [logs]
  )

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.api.appLogs.read()
      setLogs(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(t('appLogs.loadError', { 0: msg }))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.api.electron.send(IPC.WINDOW.ACTION, action)
  }

  const handleCopyAll = useCallback(() => {
    const text = allLogLines.join('\n')
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('appLogs.copySuccess')),
      () => toast.error(t('appLogs.copyError'))
    )
  }, [allLogLines, t])

  const handleCopyLine = useCallback(
    (line: string) => {
      navigator.clipboard.writeText(line).then(
        () => toast.success(t('appLogs.copySuccess')),
        () => toast.error(t('appLogs.copyError'))
      )
    },
    [t]
  )

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Toolbar */}
      <div
        className="flex h-9 items-center justify-between text-sm select-none shrink-0"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        <div className="flex items-center h-full">
          <div className="w-15 h-6 flex justify-center pt-1.5 pl-1">
            <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
          </div>
          <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex items-center gap-1 pt-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    disabled={isLoading}
                    onClick={loadLogs}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('appLogs.refresh')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="font-medium text-xs">{t('appLogs.title')}</div>
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button type="button" onClick={() => handleWindow('minimize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={20} strokeWidth={1} absoluteStrokeWidth />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
        <div className="flex items-center justify-between gap-4 mb-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('appLogs.search')}
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue placeholder={t('appLogs.filterLevel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('appLogs.filterAll')}</SelectItem>
                  <SelectItem value="INFO">INFO</SelectItem>
                  <SelectItem value="WARN">WARN</SelectItem>
                  <SelectItem value="ERROR">ERROR</SelectItem>
                  <SelectItem value="DEBUG">DEBUG</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={buttonVariant} size="sm" className="h-8" onClick={handleCopyAll}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('appLogs.copy')}</TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5">
                        <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                        <Switch checked={autoScroll} onCheckedChange={setAutoScroll} className="scale-75" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{t('appLogs.scrollToBottom')}</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5">
                        <WrapText className="h-4 w-4 text-muted-foreground" />
                        <Switch checked={lineWrap} onCheckedChange={setLineWrap} className="scale-75" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{t('appLogs.lineWrap')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant={buttonVariant} onClick={loadLogs}>
                {t('appLogs.retry')}
              </Button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden">
              <LogContent
                lines={allLogLines}
                searchText={searchText}
                levelFilter={levelFilter}
                lineWrap={lineWrap}
                autoScroll={autoScroll}
                onCopyLine={handleCopyLine}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
