'use client'

import { Loader2, Save, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  buildResolvedFromHunkChoices,
  extractGitConflictHunks,
  hasConflictMarkers,
} from '@/lib/conflictMarkers'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'

interface ConflictQuickResolveProps {
  filePath: string
  initialContent: string
  onSave: (content: string) => Promise<void>
  onCancel: () => void
}

export function ConflictQuickResolve({ filePath, initialContent, onSave, onCancel }: ConflictQuickResolveProps) {
  const { t } = useTranslation()
  const hunks = useMemo(() => extractGitConflictHunks(initialContent), [initialContent])
  const [choices, setChoices] = useState<('ours' | 'theirs')[]>(() => hunks.map(() => 'ours'))
  const [plainText, setPlainText] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)

  const setAll = useCallback((side: 'ours' | 'theirs') => {
    setChoices(hunks.map(() => side))
  }, [hunks])

  const setHunk = useCallback((index: number, side: 'ours' | 'theirs') => {
    setChoices(prev => {
      const next = [...prev]
      next[index] = side
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      if (hunks.length > 0) {
        const built = buildResolvedFromHunkChoices(initialContent, choices)
        if (!built.ok || hasConflictMarkers(built.result)) {
          toast.error(t('git.conflict.resolveError'))
          return
        }
        await onSave(built.result)
      } else {
        if (hasConflictMarkers(plainText)) {
          toast.error(t('conflictEditor.unresolvedMarkersWarning'))
          return
        }
        await onSave(plainText)
      }
    } catch {
      toast.error(t('git.conflict.resolveError'))
    } finally {
      setIsSaving(false)
    }
  }, [hunks.length, initialContent, choices, plainText, onSave, t])

  return (
    <div className="flex flex-col max-h-[min(70vh,520px)] rounded-lg border bg-destructive/5 border-destructive/30 overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-2 border-b shrink-0">
        <span className="text-sm font-medium truncate flex-1 min-w-0" title={filePath}>
          {filePath}
        </span>
        <div className="flex gap-2 shrink-0">
          {hunks.length > 0 && (
            <div className="hidden sm:flex gap-1 mr-1">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAll('ours')}>
                {t('conflictEditor.allOurs')}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAll('theirs')}>
                {t('conflictEditor.allTheirs')}
              </Button>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            <X className="h-3 w-3 mr-1" />
            {t('common.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {t('common.save')}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {hunks.length === 0 ? (
          <div className="p-3 flex flex-col gap-2 min-h-0 flex-1">
            <p className="text-xs text-muted-foreground">{t('conflictEditor.noMarkersHint')}</p>
            <textarea
              value={plainText}
              onChange={e => setPlainText(e.target.value)}
              className="min-h-[240px] flex-1 w-full rounded-md border bg-background font-mono text-xs p-2 resize-y"
              spellCheck={false}
            />
          </div>
        ) : (
          <ScrollArea className="h-[min(60vh,420px)]">
            <div className="p-3 space-y-4">
              {hunks.map((h, idx) => (
                <div key={`${idx}-${h.start}`} className="rounded-md border bg-background/80 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-semibold">
                      {t('conflictEditor.hunkLabel', { index: idx + 1, total: hunks.length })}
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={choices[idx] === 'ours' ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setHunk(idx, 'ours')}
                      >
                        {t('git.conflict.ours')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={choices[idx] === 'theirs' ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setHunk(idx, 'theirs')}
                      >
                        {t('git.conflict.theirs')}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className={cn('rounded border p-2 max-h-36 overflow-auto', choices[idx] === 'ours' && 'ring-2 ring-primary')}>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">{t('git.conflict.ours')}</div>
                      <pre className="whitespace-pre-wrap break-all font-mono">{h.ours || '—'}</pre>
                    </div>
                    <div className={cn('rounded border p-2 max-h-36 overflow-auto', choices[idx] === 'theirs' && 'ring-2 ring-primary')}>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">{t('git.conflict.theirs')}</div>
                      <pre className="whitespace-pre-wrap break-all font-mono">{h.theirs || '—'}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
