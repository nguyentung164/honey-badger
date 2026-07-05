export function normalizeSettingsSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

export function matchesSettingsSearch(query: string, ...haystacks: (string | undefined | null)[]): boolean {
  const normalized = normalizeSettingsSearchText(query)
  if (!normalized) return true
  const terms = normalized.split(/\s+/).filter(Boolean)
  const blob = haystacks
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()
  return terms.every(term => blob.includes(term))
}
