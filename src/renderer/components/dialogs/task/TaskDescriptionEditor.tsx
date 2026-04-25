'use client'

import { useEffect, useMemo } from 'react'

import { Editor } from '@/components/blocks/editor-x/editor'
import { cn } from '@/lib/utils'
import {
  isSerializedStateEmpty,
  parseStoredDescription,
} from '@/lib/taskDescriptionEditorState'

export function TaskDescriptionEditor({
  valueRef,
  initialValue,
  disabled,
  className,
  placeholder,
  id,
}: {
  valueRef: React.MutableRefObject<string>
  initialValue: string
  disabled?: boolean
  className?: string
  placeholder?: string
  id?: string
}) {
  const initialSerialized = useMemo(
    () => parseStoredDescription(initialValue),
    [initialValue],
  )

  useEffect(() => {
    const s = parseStoredDescription(initialValue)
    valueRef.current = isSerializedStateEmpty(s) ? '' : JSON.stringify(s)
  }, [initialValue, valueRef])

  return (
    <Editor
      editorSerializedState={initialSerialized}
      editable={!disabled}
      compact
      autoFocus={false}
      className={cn('flex min-h-[14rem] w-full flex-1 flex-col shadow-sm', className)}
      placeholder={placeholder ?? ''}
      contentEditableId={id}
      onSerializedChange={state => {
        valueRef.current = isSerializedStateEmpty(state) ? '' : JSON.stringify(state)
      }}
    />
  )
}
