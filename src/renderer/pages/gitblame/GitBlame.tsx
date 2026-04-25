'use client'
import { FileCode } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { GitBlameToolbar } from './GitBlameToolbar'

interface BlameLine {
  line: number
  commit: string
  author: string
  date: string
  content: string
}

interface CommitInfo {
  commit: string
  author: string
  date: string
  shortCommit: string
  color: string
}

// Generate a color based on commit hash - optimized for both light and dark mode
const getCommitColor = (_commit: string, index: number): string => {
  const colors = [
    '#2563eb', // blue-600
    '#059669', // emerald-600
    '#dc2626', // red-600
    '#7c3aed', // violet-600
    '#0891b2', // cyan-600
    '#db2777', // pink-600
    '#65a30d', // lime-600
    '#ea580c', // orange-600
    '#0d9488', // teal-600
    '#c026d3', // fuchsia-600
    '#1d4ed8', // blue-700
    '#047857', // emerald-700
    '#b91c1c', // red-700
    '#6d28d9', // violet-700
    '#0e7490', // cyan-700
    '#be185d', // pink-700
    '#4d7c0f', // lime-700
    '#c2410c', // orange-700
    '#0f766e', // teal-700
    '#a21caf', // fuchsia-700
    '#1e40af', // blue-800
    '#065f46', // emerald-800
    '#991b1b', // red-800
    '#5b21b6', // violet-800
    '#155e75', // cyan-800
    '#9f1239', // pink-800
    '#3f6212', // lime-800
    '#9a3412', // orange-800
    '#115e59', // teal-800
    '#86198f', // fuchsia-800
  ]
  return colors[index % colors.length]
}

export function GitBlame() {
  const [searchParams] = useSearchParams()
  const filePath = searchParams.get('filePath') || ''
  const [blameData, setBlameData] = useState<BlameLine[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)

  // Get unique commits and assign colors
  const commitInfoMap = useMemo(() => {
    const uniqueCommits = new Map<string, CommitInfo>()
    blameData.forEach(line => {
      if (!uniqueCommits.has(line.commit)) {
        const isUncommitted = line.commit === '0000000000000000000000000000000000000000'
        uniqueCommits.set(line.commit, {
          commit: line.commit,
          author: line.author,
          date: line.date,
          shortCommit: isUncommitted ? 'Chưa commit' : line.commit.substring(0, 7),
          // Use orange-600 for uncommitted - better contrast in both light/dark mode
          color: isUncommitted ? '#ea580c' : getCommitColor(line.commit, uniqueCommits.size),
        })
      }
    })
    return uniqueCommits
  }, [blameData])

  const loadBlameData = useCallback(async () => {
    if (!filePath) {
      toast.error('Không tìm thấy đường dẫn file')
      return
    }

    try {
      setLoading(true)
      const result = await window.api.git.blame(filePath)

      if (result.status === 'success' && result.data?.lines) {
        setBlameData(result.data.lines)
        logger.info(`Loaded blame data for ${filePath}:`, result.data.lines.length, 'lines')
      } else {
        toast.error(result.message || 'Không thể tải dữ liệu Git Blame')
      }
    } catch (error) {
      logger.error('Error loading blame data:', error)
      toast.error('Lỗi khi tải dữ liệu Git Blame')
    } finally {
      setLoading(false)
    }
  }, [filePath])

  useEffect(() => {
    loadBlameData()
  }, [loadBlameData])

  const handleLineClick = (lineNumber: number) => {
    setSelectedLine(lineNumber)
  }

  const handleCommitClick = (commit: string) => {
    // You can open commit details here
    logger.info('Commit clicked:', commit)
    toast.info(`Commit: ${commit.substring(0, 7)}`)
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col bg-background">
        <GitBlameToolbar filePath={filePath} onRefresh={loadBlameData} />
        <div className="flex-1 flex items-center justify-center">
          <GlowLoader className="w-10 h-10" />
        </div>
      </div>
    )
  }

  if (!blameData.length) {
    return (
      <div className="h-screen w-full flex flex-col bg-background">
        <GitBlameToolbar filePath={filePath} onRefresh={loadBlameData} />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <FileCode className="h-16 w-16 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Không có dữ liệu Git Blame</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      <GitBlameToolbar filePath={filePath} onRefresh={loadBlameData} />

      <div className="flex-1 overflow-auto">
        <div className="font-mono text-[12px] leading-none">
          {blameData.map((line, index) => {
            const commitInfo = commitInfoMap.get(line.commit)
            const isSelected = selectedLine === line.line
            const isFirstOfCommit = index === 0 || blameData[index - 1]?.commit !== line.commit
            const isLastOfCommit = index === blameData.length - 1 || blameData[index + 1]?.commit !== line.commit
            const isUncommitted = line.commit === '0000000000000000000000000000000000000000'

            // Format date as dd/mm/yyyy hh:mm:ss
            const dateObj = new Date(line.date)
            const shortDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}:${dateObj.getSeconds().toString().padStart(2, '0')}`

            // Convert hex to rgba with low opacity
            const hexToRgba = (hex: string, alpha: number) => {
              const r = parseInt(hex.slice(1, 3), 16)
              const g = parseInt(hex.slice(3, 5), 16)
              const b = parseInt(hex.slice(5, 7), 16)
              return `rgba(${r}, ${g}, ${b}, ${alpha})`
            }

            const bgColor = commitInfo?.color ? hexToRgba(commitInfo.color, 0.08) : 'transparent'
            const _bgColorHover = commitInfo?.color ? hexToRgba(commitInfo.color, 0.15) : 'transparent'
            const bgColorSelected = 'rgba(37, 99, 235, 0.2)' // blue-600 with 20% opacity
            const _bgColorSelectedHover = 'rgba(37, 99, 235, 0.3)' // blue-600 with 30% opacity

            return (
              <div key={index}>
                <button
                  type="button"
                  className={cn(
                    'flex items-center transition-colors border-l-2 w-full border-0 border-l-2 text-left h-6',
                    isFirstOfCommit && 'border-t border-border/20',
                    isLastOfCommit && 'border-b border-border/20'
                  )}
                  style={{
                    borderLeftColor: isSelected ? '#2563eb' : commitInfo?.color || 'transparent',
                    borderLeftWidth: isSelected ? '3px' : '2px',
                    backgroundColor: isSelected ? bgColorSelected : bgColor,
                  }}
                  onClick={() => handleLineClick(line.line)}
                >
                  {/* Blame info column - Luôn hiển thị đầy đủ cho mỗi dòng */}
                  <button
                    className={cn(
                      'flex-shrink-0 w-[460px] px-1.5 h-full border-r border-border/50',
                      'flex items-center gap-1.5 cursor-pointer transition-all',
                      'hover:bg-accent/20'
                    )}
                    onClick={e => {
                      e.stopPropagation()
                      if (!isUncommitted) {
                        handleCommitClick(line.commit)
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        if (!isUncommitted) {
                          handleCommitClick(line.commit)
                        }
                      }
                    }}
                  >
                    {/* Visual indicator */}
                    <div className={cn('w-1 h-1 rounded-full flex-shrink-0 transition-all')} style={{ backgroundColor: commitInfo?.color }} />

                    {/* Commit hash */}
                    <span className="font-semibold flex-shrink-0 w-[90px] text-[11px]" style={{ color: commitInfo?.color }}>
                      {commitInfo?.shortCommit}
                    </span>

                    {/* Author - luôn hiển thị */}
                    <span
                      className={cn(
                        'truncate min-w-0 flex-1 text-[11px] transition-colors',
                        isSelected ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-muted-foreground'
                      )}
                    >
                      {line.author}
                    </span>

                    {/* Date - dd/mm/yyyy hh:mm:ss */}
                    <span
                      className={cn(
                        'text-[11px] flex-shrink-0 w-[130px] text-right font-mono transition-colors',
                        isSelected ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-muted-foreground/70'
                      )}
                    >
                      {shortDate}
                    </span>
                  </button>

                  {/* Line number column */}
                  <span
                    className={cn(
                      'w-12 px-1 h-full flex items-center justify-end flex-shrink-0 select-none border-r border-border/30 text-[11px] transition-colors',
                      isSelected ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-muted-foreground/50'
                    )}
                  >
                    {line.line}
                  </span>

                  {/* Code content column */}
                  <span
                    className={cn(
                      'flex-1 px-2 h-full flex items-center whitespace-pre overflow-x-auto transition-colors',
                      isSelected && 'text-blue-600 dark:text-blue-400 font-semibold'
                    )}
                  >
                    {line.content}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary bar */}
      <div className="border-t border-border px-4 py-2 bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{blameData.length} dòng</span>
            <span>{commitInfoMap.size} commits khác nhau</span>
            {selectedLine && <span className="text-primary">Đã chọn dòng {selectedLine}</span>}
          </div>
          <div className="flex items-center gap-2">
            <FileCode className="h-3 w-3" />
            <span className="truncate max-w-md">{filePath}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
