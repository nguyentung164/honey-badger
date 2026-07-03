export type SearchReplaceOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildSearchRegExp(query: string, options: SearchReplaceOptions): RegExp {
  if (!query) throw new Error('empty query')
  let source = options.regex ? query : escapeRegExp(query)
  if (options.wholeWord) source = `\\b${source}\\b`
  const flags = options.caseSensitive ? 'g' : 'gi'
  return new RegExp(source, flags)
}

/** VS Code-style `$1`, `$$`, `$&` replacement expansion for regex mode. */
export function expandReplacement(template: string, match: RegExpExecArray): string {
  return template.replace(/\$([$&`']|\d{1,2})/g, (_, token: string) => {
    if (token === '$') return '$'
    if (token === '&') return match[0]
    if (token === '`') return match.input.slice(0, match.index)
    if (token === "'") return match.input.slice(match.index + match[0].length)
    const index = Number(token)
    return match[index] ?? ''
  })
}

export function applySearchReplace(
  content: string,
  query: string,
  replacement: string,
  options: SearchReplaceOptions
): { content: string; count: number } {
  const regex = buildSearchRegExp(query, options)
  let count = 0
  const next = content.replace(regex, (...args) => {
    count++
    if (options.regex) {
      return expandReplacement(replacement, args as unknown as RegExpExecArray)
    }
    return replacement
  })
  return { content: next, count }
}
