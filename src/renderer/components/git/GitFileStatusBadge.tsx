import { cn } from '@/lib/utils'

const GIT_FILE_STATUSES = ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'] as const

export type GitFileStatusCode = (typeof GIT_FILE_STATUSES)[number]

export function normalizeGitFileStatus(status?: string): GitFileStatusCode | null {
  if (!status) return null
  const normalized = status.toLowerCase()
  return GIT_FILE_STATUSES.includes(normalized as GitFileStatusCode) ? (normalized as GitFileStatusCode) : null
}

const STATUS_LETTER: Record<GitFileStatusCode, string> = {
  modified: 'M',
  added: 'A',
  staged: 'S',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: 'C',
}

const STATUS_BG: Record<GitFileStatusCode, string> = {
  modified: 'bg-blue-500 text-white',
  added: 'bg-green-500 text-white',
  staged: 'bg-green-500 text-white',
  deleted: 'bg-red-500 text-white',
  renamed: 'bg-purple-500 text-white',
  untracked: 'bg-green-500 text-white',
  conflicted: 'bg-red-500 text-white',
}

/** VS Code SCM-style letter colors (trailing column) — matches explorer gitDecoration tokens. */
const STATUS_TRAILING: Record<GitFileStatusCode, string> = {
  modified: 'text-[var(--hb-git-modified)]',
  added: 'text-[var(--hb-git-added)]',
  staged: 'text-[var(--hb-git-staged)]',
  deleted: 'text-[var(--hb-git-deleted)]',
  renamed: 'text-[var(--hb-git-renamed)]',
  untracked: 'text-[var(--hb-git-untracked)]',
  conflicted: 'text-[var(--hb-git-conflicted)]',
}

interface GitFileStatusBadgeProps {
  status?: string
  size?: 'sm' | 'md'
  /** `badge` = boxed chip; `trailing` = letter at row end (SCM tree). */
  variant?: 'badge' | 'trailing'
  className?: string
}

export function GitFileStatusBadge({ status, size = 'sm', variant = 'badge', className }: GitFileStatusBadgeProps) {
  const code = normalizeGitFileStatus(status)
  if (!code) return null

  if (variant === 'trailing') {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center font-semibold tabular-nums',
          size === 'sm' ? 'min-w-3 text-[11px]' : 'min-w-3.5 text-xs',
          STATUS_TRAILING[code],
          className
        )}
        aria-hidden
      >
        {STATUS_LETTER[code]}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm font-bold',
        size === 'sm' ? 'size-3.5 text-[8px]' : 'size-4 text-[10px]',
        STATUS_BG[code],
        className
      )}
      aria-hidden
    >
      {STATUS_LETTER[code]}
    </span>
  )
}
