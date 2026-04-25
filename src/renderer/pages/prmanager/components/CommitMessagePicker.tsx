'use client'

import { Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Commit = { sha: string; message: string; author?: string | null; date?: string | null }

type Props = {
  owner: string
  repo: string
  prNumber?: number
  head?: string
  onPick?: (title: string, body: string) => void
  variant?: 'inline' | 'picker'
  className?: string
}

export function CommitMessagePicker({ owner, repo, prNumber, head, onPick, variant = 'picker', className }: Props) {
  const { t } = useTranslation()
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      if (prNumber) {
        const res = await window.api.pr.prGetCommits({ owner, repo, number: prNumber })
        if (res.status === 'success' && res.data) {
          setCommits(res.data as Commit[])
          const head = (res.data as Commit[])[0]
          if (head) setSelectedSha(head.sha)
        }
      } else if (head) {
        const res = await window.api.pr.branchLastCommitMessage({ owner, repo, branch: head })
        if (res.status === 'success' && res.data) {
          const msg = res.data as string
          const c: Commit = { sha: 'HEAD', message: msg }
          setCommits([c])
          setSelectedSha('HEAD')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (owner && repo && (prNumber || head)) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, prNumber, head])

  const handlePick = (c: Commit) => {
    setSelectedSha(c.sha)
    const lines = c.message.split('\n')
    const title = lines[0] ?? c.message
    const body = lines.slice(1).join('\n').trim()
    onPick?.(title, body)
  }

  return (
    <div className={cn('w-full min-w-0 max-w-full space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {prNumber
            ? t('prManager.commitMessagePicker.commitsInPr', { count: commits.length, prNumber })
            : t('prManager.commitMessagePicker.latestOnBranch')}
        </span>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-6 gap-1 text-xs">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t('prManager.commitMessagePicker.reload')}
        </Button>
      </div>
      <div
        className={cn(
          'min-h-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-md border [-webkit-overflow-scrolling:touch]',
          variant === 'picker' ? 'h-[200px] max-h-[200px]' : 'max-h-[160px]'
        )}
      >
        <div className="w-full min-w-0 divide-y">
          {commits.length === 0 && !loading && (
            <div className="p-3 text-xs text-muted-foreground">{t('prManager.commitMessagePicker.noCommits')}</div>
          )}
          {commits.map(c => {
            const isSelected = selectedSha === c.sha
            return (
              <div
                key={c.sha}
                className={cn(
                  'flex w-full min-w-0 max-w-full items-start gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/60',
                  isSelected && 'bg-primary/10'
                )}
              >
                <button
                  type="button"
                  onClick={() => handlePick(c)}
                  className={cn(
                    'flex min-w-0 flex-1 cursor-pointer items-start gap-2 border-0 bg-transparent p-0 text-left text-inherit shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center',
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 max-w-full flex-1 overflow-hidden text-left">
                    <div className="line-clamp-2 break-words font-medium [overflow-wrap:anywhere] [word-break:break-word]">
                      {c.message.split('\n')[0]}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <span className="shrink-0">{c.sha.substring(0, 7)}</span>
                      {c.author && (
                        <span className="min-w-0 truncate">
                          {'\u2022'} {c.author}
                        </span>
                      )}
                      {c.date && (
                        <span className="shrink-0">
                          {'\u2022'} {new Date(c.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(c.message).catch(() => {})
                  }}
                  className="shrink-0 border-0 bg-transparent p-0.5 text-muted-foreground shadow-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title={t('common.copy')}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
