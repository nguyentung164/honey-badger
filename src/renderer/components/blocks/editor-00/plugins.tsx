import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'

import { ContentEditable } from '@/components/editor/editor-ui/content-editable'

export function Plugins({
  placeholder,
  contentClassName,
  contentEditableId,
}: {
  placeholder: string
  contentClassName?: string
  contentEditableId?: string
}) {
  return (
    <div className="relative">
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <div className="">
              <div className="">
                <ContentEditable
                  id={contentEditableId}
                  placeholder={placeholder}
                  className={contentClassName}
                />
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
    </div>
  )
}
