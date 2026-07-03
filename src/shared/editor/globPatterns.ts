/**
 * VS Code Search view glob normalization.
 * @see https://code.visualstudio.com/docs/editor/glob-patterns
 */

/** Split comma-separated glob list (VS Code Search uses commas, not semicolons). */
export function parseCommaSeparatedGlobs(input: string): string[] {
  if (!input.trim()) return []
  return input
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

/**
 * Normalize a single pattern for ripgrep `-g` / `-g !` flags.
 * In the Search view, `**` is assumed relative to the workspace root.
 */
export function normalizeSearchGlobPattern(pattern: string): string {
  let p = pattern.trim().replace(/\\/g, '/')
  if (!p) return p
  if (p.startsWith('**/')) return p

  if (p.includes('/')) {
    if (/[*?[{]/.test(p)) return `**/${p}`
    return `**/${p.replace(/\/+$/, '')}/**`
  }

  if (/[*?[{]/.test(p)) return `**/${p}`
  return `**/${p}/**`
}

export function ripgrepGlobArgs(includePattern?: string, excludePattern?: string): string[] {
  const args: string[] = []
  for (const raw of parseCommaSeparatedGlobs(includePattern ?? '')) {
    args.push('-g', normalizeSearchGlobPattern(raw))
  }
  for (const raw of parseCommaSeparatedGlobs(excludePattern ?? '')) {
    args.push('-g', `!${normalizeSearchGlobPattern(raw)}`)
  }
  return args
}
