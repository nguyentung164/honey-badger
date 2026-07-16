'use client'

import { Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { createEmbeddedGitConflictPayload } from '@/lib/diffViewer/openDiffViewer'
import { fetchGitConflictSession } from '@/pages/diffviewer/diffViewerConflictPayload'
import type { DiffViewerLoadPayload } from '@/pages/diffviewer/diffViewerPayload'
import { GitConflictDiffView } from '@/pages/diffviewer/GitConflictDiffView'

interface GitConflictDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd?: string
  onResolved?: () => void
  onAbort?: () => void
}

export function GitConflictDiffDialog({ open, onOpenChange, cwd, onResolved, onAbort }: GitConflictDiffDialogProps) {
  const { t } = useTranslation()
  const [payload, setPayload] = useState<DiffViewerLoadPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)

  const loadPayload = useCallback(async () => {
    setLoading(true)
    try {
      const session = await fetchGitConflictSession(cwd)
      if (session.conflictedPaths.length === 0) {
        setPayload(null)
        return
      }
      setPayload(
        createEmbeddedGitConflictPayload({
          cwd,
          filePath: session.conflictedPaths[0],
          conflictedFiles: session.conflictedPaths,
          conflictType: session.conflictType,
        })
      )
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    if (!open) {
      setPayload(null)
      return
    }
    void loadPayload()
  }, [open, loadPayload])

  useEffect(() => {
    if (!open) return
    const refresh = () => void loadPayload()
    window.addEventListener('git-branch-changed', refresh)
    window.api.on('git-conflict-resolved', refresh)
    return () => {
      window.removeEventListener('git-branch-changed', refresh)
      window.api.removeListener('git-conflict-resolved', refresh)
    }
  }, [open, loadPayload])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[95vh]! w-[95vw]! max-w-[95vw]! flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
        onPointerDownOutside={e => e.preventDefault()}
        aria-describedby={undefined}
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/30 py-1.5 pl-3 pr-1 min-h-9">
          <span className="shrink-0 text-sm font-medium">{t('git.conflict.title')}</span>
          <div ref={setToolbarHost} className="flex min-w-0 flex-1 items-center overflow-hidden" />
          <DialogClose
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground -mr-px flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-80 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden [&_svg]:size-3.5"
            aria-label={t('common.close')}
          >
            <X className="shrink-0" />
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payload ? (
            <GitConflictDiffView
              embedded
              embeddedPayload={payload}
              embeddedToolbarHost={toolbarHost}
              onContinueSuccess={onResolved}
              onAbortSuccess={onAbort}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4">{t('conflictResolver.noConflicts')}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
