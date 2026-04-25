import type { MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { LexicalEditor } from 'lexical'

const MAX_QUERY_LENGTH = 75

/**
 * Khớp lệnh / ở cuối text trước con trỏ (giống Notion): không bắt buộc có khoảng trắng trước /.
 * Tránh kích hoạt trên `//` và ngay sau `http:` / `https:`.
 */
export function matchSlashCommandTrigger(
  text: string,
  _editor: LexicalEditor,
): MenuTextMatch | null {
  let slash = -1
  for (let j = text.length - 1; j >= 0; j--) {
    if (text[j] !== '/') continue
    if (j > 0 && text[j - 1] === '/') continue
    slash = j
    break
  }
  if (slash < 0) return null

  const after = text.slice(slash + 1)
  if (after.length > MAX_QUERY_LENGTH) return null
  if (/\s/.test(after)) return null

  const before = text.slice(0, slash)
  if (/https?:$/i.test(before)) return null

  return {
    leadOffset: slash,
    matchingString: after,
    replaceableString: text.slice(slash),
  }
}
