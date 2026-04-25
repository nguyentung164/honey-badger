import type { StatusResult } from 'simple-git'
import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

/** XY porcelain: nhánh đang unmerged (Git không gộp được vào mảng conflicted của parser đầy đủ mọi trường hợp). */
function isUnmergedPorcelain(index: string, workingDir: string): boolean {
  const ix = (index || ' ').trim()
  const wd = (workingDir || ' ').trim()
  if (ix === 'U' || wd === 'U') return true
  if (ix === 'A' && wd === 'A') return true
  if (ix === 'D' && wd === 'D') return true
  return false
}

function conflictedPathsFromSummary(statusResult: StatusResult): string[] {
  const set = new Set<string>(statusResult.conflicted || [])
  for (const f of statusResult.files || []) {
    if (isUnmergedPorcelain(f.index, f.working_dir)) set.add(f.path)
  }
  return [...set]
}

/** Danh sách file unmerged theo Git (ổn định hơn chỉ dựa mảng conflicted của simple-git). */
async function unmergedPathsFromDiffFilter(git: Awaited<ReturnType<typeof getGitInstance>>): Promise<string[]> {
  if (!git) return []
  const set = new Set<string>()
  const run = async (args: string[]) => {
    try {
      const out = await git.raw(args)
      for (const line of out.split(/\r?\n/)) {
        const p = line.trim()
        if (p) set.add(p)
      }
    } catch {
      // bỏ qua nếu lệnh git lỗi (repo lạ, v.v.)
    }
  }
  await run(['diff', '--name-only', '--diff-filter=U'])
  await run(['diff', '--cached', '--name-only', '--diff-filter=U'])
  return [...set]
}

export async function mergeConflictedPathsForStatus(
  git: NonNullable<Awaited<ReturnType<typeof getGitInstance>>>,
  statusResult: StatusResult
): Promise<string[]> {
  const fromSummary = conflictedPathsFromSummary(statusResult)
  const fromDiff = await unmergedPathsFromDiffFilter(git)
  return [...new Set([...fromSummary, ...fromDiff])]
}

interface GitStatusResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    files: {
      path: string
      index: string
      working_dir: string
    }[]
    not_added: string[]
    conflicted: string[]
    created: string[]
    deleted: string[]
    modified: string[]
    renamed: string[]
    staged: string[]
    ahead: number
    behind: number
    current: string
    tracking: string
  }
}

export async function status(cwd?: string): Promise<GitStatusResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching git status')

    const statusResult = await git.status()

    l.info('Git status fetched successfully')
    l.debug('Status result:', statusResult)

    const conflicted = await mergeConflictedPathsForStatus(git, statusResult)

    return {
      status: 'success',
      data: {
        files: statusResult.files || [],
        not_added: statusResult.not_added || [],
        conflicted,
        created: statusResult.created || [],
        deleted: statusResult.deleted || [],
        modified: statusResult.modified || [],
        renamed: statusResult.renamed?.map(r => r.to) || [],
        staged: statusResult.staged || [],
        ahead: statusResult.ahead || 0,
        behind: statusResult.behind || 0,
        current: statusResult.current || '',
        tracking: statusResult.tracking || '',
      },
    }
  } catch (error) {
    l.error('Error fetching git status:', error)
    return {
      status: 'error',
      message: `Error fetching git status: ${formatGitError(error)}`,
    }
  }
}
