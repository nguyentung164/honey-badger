'use client'

import { getEditorLanguageDisplayName, getLanguageDisplayName } from '@/lib/monacoLanguage'
import { cn } from '@/lib/utils'
import type { EditorCursorPosition } from '@/pages/editor/lib/editorCommandBridge'

type EditorStatusBarProps = {
  relativePath?: string
  languageId?: string
  cursor?: EditorCursorPosition | null
  insertSpaces: boolean
  tabSize: number
  lspStatus?: string
  className?: string
}

export function EditorStatusBar({
  relativePath,
  languageId,
  cursor,
  insertSpaces,
  tabSize,
  lspStatus,
  className,
}: EditorStatusBarProps) {
  const indentLabel = insertSpaces ? `Spaces: ${tabSize}` : `Tab Size: ${tabSize}`
  const languageLabel = relativePath
    ? getEditorLanguageDisplayName(relativePath)
    : languageId
      ? getLanguageDisplayName(languageId)
      : null

  return (
    <div
      className={cn(
        'flex h-[22px] shrink-0 items-center justify-between gap-3 border-t bg-muted/30 px-2 text-[11px] text-muted-foreground',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {relativePath ? (
          <span className="truncate" title={relativePath}>
            {relativePath}
          </span>
        ) : null}
        {lspStatus ? <span className="shrink-0 text-[10px]">{lspStatus}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 tabular-nums">
        {cursor ? (
          <span>
            Ln {cursor.line}, Col {cursor.column}
          </span>
        ) : null}
        {languageLabel ? <span>{languageLabel}</span> : null}
        <span>{indentLabel}</span>
        <span>UTF-8</span>
      </div>
    </div>
  )
}
