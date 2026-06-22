const BLAME_COMMIT_COLORS = [
  '#2563eb',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#0d9488',
  '#c026d3',
  '#1d4ed8',
  '#047857',
  '#b91c1c',
  '#6d28d9',
  '#0e7490',
  '#be185d',
  '#4d7c0f',
  '#c2410c',
  '#0f766e',
  '#a21caf',
  '#1e40af',
  '#065f46',
  '#991b1b',
  '#5b21b6',
  '#155e75',
  '#9f1239',
  '#3f6212',
  '#9a3412',
  '#115e59',
  '#86198f',
] as const

export const BLAME_UNCOMMITTED_COLOR = '#ea580c'

export function getCommitColor(commit: string, index: number): string {
  if (commit === '0000000000000000000000000000000000000000') return BLAME_UNCOMMITTED_COLOR
  return BLAME_COMMIT_COLORS[index % BLAME_COMMIT_COLORS.length]
}

export function shortCommitHash(commit: string): string {
  if (!commit) return ''
  if (commit === '0000000000000000000000000000000000000000') return 'local'
  return commit.slice(0, 7)
}
