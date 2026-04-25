import { readFile } from 'node:fs/promises'
import path from 'node:path'
import l from 'electron-log'
import { resolvePathRelativeToBase } from '../utils/utils'
import { formatGitError, getGitInstance } from './utils'

interface GitMergeResponse {
  status: 'success' | 'error' | 'conflict'
  message?: string
  data?: any
}

export async function merge(branchName: string, strategy?: string, cwd?: string): Promise<GitMergeResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Merging branch: ${branchName}`)

    const mergeOptions = strategy ? ['--strategy', strategy, branchName] : [branchName]
    const mergeResult = await git.merge(mergeOptions)

    l.info('Merge completed successfully')

    return {
      status: 'success',
      message: 'Merge completed successfully',
      data: mergeResult,
    }
  } catch (error) {
    l.error('Error during merge:', error)

    // Check if it's a merge conflict
    if (error instanceof Error && error.message.includes('CONFLICT')) {
      return {
        status: 'conflict',
        message: `Merge conflict detected: ${formatGitError(error)}`,
      }
    }

    return {
      status: 'error',
      message: `Error during merge: ${formatGitError(error)}`,
    }
  }
}

export async function abortMerge(cwd?: string): Promise<GitMergeResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Aborting merge')

    await git.merge(['--abort'])

    l.info('Merge aborted successfully')

    return {
      status: 'success',
      message: 'Merge aborted successfully',
    }
  } catch (error) {
    l.error('Error aborting merge:', error)
    return {
      status: 'error',
      message: `Error aborting merge: ${formatGitError(error)}`,
    }
  }
}

function parseLsFilesUnmergedPath(line: string): string | undefined {
  const cleaned = line.replace(/\r$/, '').trim()
  if (!cleaned) return undefined
  const tab = cleaned.indexOf('\t')
  if (tab !== -1) {
    let p = cleaned.slice(tab + 1).trim()
    if (p.startsWith('"') && p.endsWith('"')) {
      try {
        p = JSON.parse(p) as string
      } catch {
        p = p.slice(1, -1)
      }
    }
    return p.replace(/\\/g, '/')
  }
  const parts = cleaned.split(/\s+/)
  if (parts.length >= 4) {
    return parts.slice(3).join(' ').replace(/\\/g, '/')
  }
  return undefined
}

/**
 * Đường dẫn trong porcelain/status đôi khi không trùng byte-for-byte với path index / working tree (case, v.v.).
 * Lấy đúng path từ `git ls-files -u` để join đĩa và cho `git show :STAGE:path`.
 */
async function resolveUnmergedPathFromIndex(git: NonNullable<Awaited<ReturnType<typeof getGitInstance>>>, requested: string): Promise<string | undefined> {
  const want = requested.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
  const wantBase = path.posix.basename(want).toLowerCase()

  const collectPaths = (text: string): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const line of text.split('\n')) {
      const p = parseLsFilesUnmergedPath(line)
      if (!p) continue
      const norm = p.replace(/\\/g, '/')
      if (seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
    return out
  }

  try {
    const relPosix = requested.replace(/\\/g, '/').replace(/^\/+/, '')
    const targeted = (await git.raw(['ls-files', '-u', '--', relPosix])).trim()
    if (targeted) {
      const p = parseLsFilesUnmergedPath(targeted.split('\n')[0])
      if (p) return p.replace(/\\/g, '/')
    }
  } catch {
    /* fall through */
  }

  try {
    const allText = (await git.raw(['ls-files', '-u'])).trim()
    if (!allText) return undefined
    const paths = collectPaths(allText)
    const exact = paths.find(p => p.toLowerCase() === want)
    if (exact) return exact
    const byBase = paths.filter(p => path.posix.basename(p).toLowerCase() === wantBase)
    if (byBase.length === 1) return byBase[0]
  } catch {
    return undefined
  }
  return undefined
}

function parseLsFilesUnmergedRecord(line: string): { mode: string; object: string; stage: string; filePath: string } | undefined {
  const cleaned = line.replace(/\r$/, '').trim()
  if (!cleaned) return undefined
  const tab = cleaned.indexOf('\t')
  if (tab === -1) return undefined
  let filePath = cleaned.slice(tab + 1).trim()
  if (filePath.startsWith('"') && filePath.endsWith('"')) {
    try {
      filePath = JSON.parse(filePath) as string
    } catch {
      filePath = filePath.slice(1, -1)
    }
  }
  const headParts = cleaned.slice(0, tab).trim().split(/\s+/)
  if (headParts.length < 3) return undefined
  const [mode, object, stage] = headParts
  return { mode, object, stage, filePath: filePath.replace(/\\/g, '/') }
}

/** Đọc blob unmerged bằng hash (ổn định hơn `git show :2:path` khi file không có trên đĩa). */
async function readUnmergedBlobViaCatFile(
  git: NonNullable<Awaited<ReturnType<typeof getGitInstance>>>,
  indexPathPosix: string,
): Promise<string | undefined> {
  const want = indexPathPosix.replace(/\\/g, '/').replace(/^\/+/, '')
  let lines: string[] = []
  try {
    const targeted = (await git.raw(['ls-files', '-u', '--', want])).trim()
    if (targeted) lines = targeted.split('\n').filter(Boolean)
  } catch {
    lines = []
  }
  if (lines.length === 0) {
    try {
      const all = (await git.raw(['ls-files', '-u'])).trim()
      if (all) {
        const wl = want.toLowerCase()
        lines = all.split('\n').filter(Boolean).filter(raw => {
          const e = parseLsFilesUnmergedRecord(raw)
          if (!e) return false
          const p = e.filePath.replace(/^\/+/, '').toLowerCase()
          return p === wl
        })
      }
    } catch {
      return undefined
    }
  }

  const byStage = new Map<string, string>()
  for (const line of lines) {
    const e = parseLsFilesUnmergedRecord(line)
    if (!e) continue
    const p = e.filePath.replace(/^\/+/, '')
    if (p !== want && p.toLowerCase() !== want.toLowerCase()) continue
    byStage.set(e.stage, e.object)
  }

  for (const st of ['2', '3', '1']) {
    const hash = byStage.get(st)
    if (!hash) continue
    try {
      const blob = await git.raw(['cat-file', '-p', hash])
      if (typeof blob === 'string') {
        l.info(`readConflictWorkingContent: loaded via cat-file stage ${st} (${hash.slice(0, 7)})`)
        return blob
      }
    } catch (err) {
      l.warn(`cat-file -p ${hash} failed:`, err)
    }
  }
  return undefined
}

/**
 * Đọc nội dung file conflict để sửa tay: ưu tiên working tree (có marker),
 * nếu ENOENT thì đọc blob index unmerged (cat-file) rồi mới thử git show.
 */
export async function readConflictWorkingContent(
  filePath: string,
  cwd?: string
): Promise<{ status: 'success'; data: string } | { status: 'error'; message: string }> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const top = (await git.revparse(['--show-toplevel'])).trim()
    const relativePath = resolvePathRelativeToBase(top, filePath).replace(/\\/g, '/').replace(/^\/+/, '')
    const indexPath = (await resolveUnmergedPathFromIndex(git, relativePath)) ?? relativePath
    const fullPath = path.normalize(path.join(top, ...indexPath.split('/').filter(Boolean)))

    l.info(`readConflictWorkingContent: top=${top} rel=${relativePath} indexPath=${indexPath} full=${fullPath}`)

    try {
      const content = await readFile(fullPath, 'utf-8')
      return { status: 'success', data: content }
    } catch (fsErr: unknown) {
      const code = fsErr && typeof fsErr === 'object' && 'code' in fsErr ? (fsErr as NodeJS.ErrnoException).code : undefined
      if (code === 'ENOENT') {
        l.debug(`Conflict file not on disk (will use index blob): ${fullPath}`)
      } else {
        l.warn(`Working tree read failed for conflict file, trying index blobs: ${indexPath}`, fsErr)
      }
    }

    const fromCat = await readUnmergedBlobViaCatFile(git, indexPath)
    if (fromCat !== undefined) {
      return { status: 'success', data: fromCat }
    }

    const normalizeShow = (raw: string | Buffer): string => (Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw)

    for (const stage of ['2', '3', '1'] as const) {
      try {
        const spec = `:${stage}:${indexPath}`
        const raw = await git.show([spec])
        return { status: 'success', data: normalizeShow(raw as string | Buffer) }
      } catch {
        /* try next */
      }
    }

    try {
      const raw = await git.show([`:${indexPath}`])
      return { status: 'success', data: normalizeShow(raw as string | Buffer) }
    } catch {
      /* fall through */
    }

    return {
      status: 'error',
      message: `File not found on disk or in index: ${filePath}`,
    }
  } catch (error) {
    l.error('readConflictWorkingContent:', error)
    return {
      status: 'error',
      message: `Error reading conflict file: ${formatGitError(error)}`,
    }
  }
}

export async function resolveConflict(filePath: string, resolution: 'ours' | 'theirs' | 'both', cwd?: string): Promise<GitMergeResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Resolving conflict in file: ${filePath} with resolution: ${resolution}`)

    switch (resolution) {
      case 'ours':
        await git.checkout(['--ours', filePath])
        break
      case 'theirs':
        await git.checkout(['--theirs', filePath])
        break
      case 'both':
        // For 'both', we need to manually edit the file, so we just add it
        break
    }

    await git.add(filePath)

    l.info('Conflict resolved successfully')

    return {
      status: 'success',
      message: 'Conflict resolved successfully',
    }
  } catch (error) {
    l.error('Error resolving conflict:', error)
    return {
      status: 'error',
      message: `Error resolving conflict: ${formatGitError(error)}`,
    }
  }
}

export async function getMergeStatus(cwd?: string): Promise<GitMergeResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Checking merge status')

    const statusResult = await git.status()

    const isInMerge = statusResult.conflicted.length > 0 || statusResult.current?.includes('MERGING') || false

    l.info(`Merge status: ${isInMerge ? 'in progress' : 'not in merge'}`)

    return {
      status: 'success',
      data: {
        isInMerge,
        conflictedFiles: statusResult.conflicted,
        currentBranch: statusResult.current,
      },
    }
  } catch (error) {
    l.error('Error checking merge status:', error)
    return {
      status: 'error',
      message: `Error checking merge status: ${formatGitError(error)}`,
    }
  }
}
