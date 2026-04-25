'use client'

import {
  type InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import type { EditorState, SerializedEditorState } from 'lexical'

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

export function Editor({
  editorState,
  editorSerializedState,
  onChange,
  onSerializedChange,
  editable = true,
  className,
  placeholder = 'Start typing ...',
  contentClassName,
  contentEditableId,
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
}) {
  return (
    <div className={cn('bg-background overflow-hidden rounded-lg border shadow', className)}>
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
          <Plugins
            placeholder={placeholder}
            contentClassName={contentClassName}
            contentEditableId={contentEditableId}
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
