'use client'

import {
  type InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import type { EditorState, SerializedEditorState } from 'lexical'
import { useLayoutEffect } from 'react'

import { editorTheme } from '@/components/editor/themes/editor-theme'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { nodes } from './nodes'
import { Plugins } from './plugins'

const editorConfig: InitialConfigType = {
  namespace: 'Editor',
  theme: editorTheme,
  nodes,
  onError: (error: Error) => {
    console.error(error)
  },
}

/** LexicalComposer chỉ đọc `editable` lúc init; đồng bộ khi prop đổi (vd. Edit task chờ canEditTask). */
function EditableSyncPlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext()
  useLayoutEffect(() => {
    editor.setEditable(editable)
  }, [editor, editable])
  return null
}

export function Editor({
  editorState,
  editorSerializedState,
  onChange,
  onSerializedChange,
  editable = true,
  className,
  placeholder,
  contentClassName,
  contentEditableId,
  compact = false,
  autoFocus = false,
}: {
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  onChange?: (editorState: EditorState) => void
  onSerializedChange?: (editorSerializedState: SerializedEditorState) => void
  editable?: boolean
  className?: string
  placeholder?: string
  contentClassName?: string
  contentEditableId?: string
  /** Ẩn footer actions + giới hạn chiều cao (dùng trong dialog task). */
  compact?: boolean
  /** Bật trong trang full-page; tắt trong dialog để tránh tranh focus. */
  autoFocus?: boolean
}) {
  return (
    <div className={cn('bg-background flex min-h-0 flex-col overflow-hidden rounded-lg border shadow', className)}>
      <LexicalComposer
        initialConfig={{
          ...editorConfig,
          editable,
          ...(editorState ? { editorState } : {}),
          ...(editorSerializedState
            ? { editorState: JSON.stringify(editorSerializedState) }
            : {}),
        }}
      >
        <TooltipProvider>
          <EditableSyncPlugin editable={editable} />
          <Plugins
            placeholder={placeholder}
            contentClassName={contentClassName}
            contentEditableId={contentEditableId}
            compact={compact}
            autoFocus={autoFocus}
            editable={editable}
          />
          <OnChangePlugin
            ignoreSelectionChange={true}
            onChange={editorState => {
              onChange?.(editorState)
              onSerializedChange?.(editorState.toJSON())
            }}
          />
        </TooltipProvider>
      </LexicalComposer>
    </div>
  )
}
