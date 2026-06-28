'use client'

import { Loader2 } from 'lucide-react'
import { ConflictEditor } from '@/components/conflict/ConflictEditor'
import { DiffViewerLoadState } from './DiffViewerLoadState'

function languageFromFilePath(p: string): string {
  const base = p.split(/[/\\]/).pop() ?? p
  const i = base.lastIndexOf('.')
  const ext = i >= 0 ? base.slice(i + 1).toLowerCase() : ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
  }
  return map[ext] ?? 'plaintext'
}

export type DiffViewerConflictPaneProps = {
  filePath: string
  content: string | null
  isLoading: boolean
  loadError: string | null
  isSaving: boolean
  onSave: (content: string) => Promise<void>
  onRetry?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export function DiffViewerConflictPane({
  filePath,
  content,
  isLoading,
  loadError,
  isSaving,
  onSave,
  onRetry,
  onDirtyChange,
}: DiffViewerConflictPaneProps) {
  if (!filePath) {
    return <DiffViewerLoadState variant="empty" />
  }
  if (loadError) {
    return <DiffViewerLoadState variant="error" errorMessage={loadError} onRetry={onRetry} />
  }
  if (isLoading || content === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ConflictEditor
      key={filePath}
      filePath={filePath}
      initialContent={content}
      language={languageFromFilePath(filePath)}
      chrome="embedded"
      onSave={onSave}
      onDirtyChange={onDirtyChange}
      primaryAction="markResolved"
      disablePrimaryWhenConflicted
    />
  )
}
