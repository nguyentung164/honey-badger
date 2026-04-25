import type { SerializedEditorState } from 'lexical'

function isLexicalSerializedState(value: unknown): value is SerializedEditorState {
  if (typeof value !== 'object' || value === null || !('root' in value)) return false
  const root = (value as { root: unknown }).root
  if (typeof root !== 'object' || root === null || !('type' in root)) return false
  return (root as { type: string }).type === 'root'
}

/** Một đoạn trống — khớp convention Lexical / shadcn-editor. */
export function createEmptyEditorState(): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  } as unknown as SerializedEditorState
}

function plainTextToEditorState(text: string): SerializedEditorState {
  if (!text) return createEmptyEditorState()
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  } as unknown as SerializedEditorState
}

/** Parse nội dung DB: JSON Lexical hợp lệ, hoặc plain text legacy. */
export function parseStoredDescription(raw: string): SerializedEditorState {
  const trimmed = raw.trim()
  if (!trimmed) return createEmptyEditorState()
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (isLexicalSerializedState(parsed)) return parsed
  } catch {
    /* legacy plain text */
  }
  return plainTextToEditorState(raw)
}

type SerializedNode = {
  type?: string
  text?: string
  children?: SerializedNode[]
}

function collectPlainTextFromNode(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as SerializedNode
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  const children = n.children
  if (!Array.isArray(children)) return ''
  const inner = children.map(collectPlainTextFromNode).join('')
  const blockTypes = new Set([
    'paragraph',
    'heading',
    'quote',
    'list',
    'listitem',
    'code',
    'table',
    'tablecell',
    'tablerow',
  ])
  if (blockTypes.has(n.type ?? '')) {
    return inner ? `${inner}\n` : '\n'
  }
  return inner
}

/** Dùng cho preview bảng / kiểm tra rỗng — không mount Lexical. */
export function storedDescriptionToPlainText(raw: string): string {
  if (!raw.trim()) return ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isLexicalSerializedState(parsed)) {
      const text = collectPlainTextFromNode(parsed.root).replace(/\n+$/g, '').trim()
      return text
    }
  } catch {
    return raw
  }
  return raw
}

export function isSerializedStateEmpty(state: SerializedEditorState): boolean {
  const text = collectPlainTextFromNode(state.root).replace(/\n+$/g, '').trim()
  return text.length === 0
}
