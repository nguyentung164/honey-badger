import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import l from 'electron-log'
import { getGitInstance } from './utils'

export type PrLocalMergeConflictPathResult = {
  /** Từ git merge-tree: có xung đột; paths có thể rỗng (conflict cấp cao, không từng file). */
  hasConflict: boolean
  /** Đường dẫn tương đối từ gốc kho, đã bỏ trùng, sắp xếp. */
  paths: string[]
  /** merge-tree báo sạch trong khi GitHub báo dirty — cần fetch, hoặc khác tính toán. */
  localSaysClean: boolean
}

function runGit(
  cwd: string,
  args: string[],
  maxOut = 12 * 1024 * 1024
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.setEncoding('utf-8')
    p.stderr.setEncoding('utf-8')
    p.stdout.on('data', d => {
      if (out.length < maxOut) out += d
    })
    p.stderr.on('data', d => {
      if (err.length < 64 * 1024) err += d
    })
    p.on('error', reject)
    p.on('close', code => {
      resolve({ code: typeof code === 'number' ? code : 1, out, err })
    })
  })
}

/** Tách tên tệp từ dòng "mode oid stage path" (merge-tree không --name-only). */
function parseConflictingPathsFromMergeTree(stdout: string): string[] {
  const out = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (/^CONFLICT\b/i.test(line) || line.startsWith('Auto-merging ')) continue
    const m = /^[0-7]+\s+[0-9a-f]{7,64}\s+([1-3])\s+(.+)$/.exec(line)
    if (!m) continue
    const raw = m[2]
    if (raw.startsWith('"') && raw.endsWith('"')) {
      out.add(raw.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)))
    } else {
      out.add(raw)
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

/**
 * Mô phỏng gộp head (PR) vào base như trên server (merge-tree), không sửa working tree.
 * Cần fetch gần đúng: origin/&lt;base&gt;, và headSha hoặc refs/pull/&lt;n&gt;/head.
 */
export async function getLocalPrMergeConflicts(
  localPath: string,
  prNumber: number,
  baseRef: string,
  headSha: string
): Promise<PrLocalMergeConflictPathResult> {
  const base = (baseRef || '').trim()
  const head = (headSha || '').trim()
  const cwd = localPath.trim()
  if (!cwd || !base || !/^[0-9a-f]{7,40}$/i.test(head)) {
    return { hasConflict: false, paths: [], localSaysClean: false }
  }

  if (!existsSync(cwd)) {
    throw new Error(
      '\u0110\u01b0\u1eddng d\u1eabn kho c\u1ee5c b\u1ed9 kh\u00f4ng t\u1ed3n t\u1ea1i tr\u00ean m\u00e1y. S\u1eeda c\u1ed9t \u00ab\u0111\u01b0\u1eddng d\u1eabn local / local path\u00bb c\u1ee7a kho (tab Repos) tr\u1ecfi v\u1ec1 th\u01b0 m\u1ee5c b\u1ea1n th\u1ef1c s\u1ef1 d\u00f9ng l\u1ec7nh \u00abgit clone\u00bb.'
    )
  }
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(cwd)
  } catch {
    throw new Error('Kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c \u0111\u01b0\u1eddng d\u1eabn kho c\u1ee5c b\u1ed9 (quy\u1ec1n truy c\u1eadp / \u1ed5 b\u1ecb l\u1ed7i).')
  }
  if (!stat.isDirectory()) {
    throw new Error(
      '\u0110\u01b0\u1eddng d\u1eabn c\u1ee5c b\u1ed9 l\u00e0 m\u1ed9t t\u1ec7p, kh\u00f4ng ph\u1ea3i th\u01b0 m\u1ee5c. C\u1ea7n th\u01b0 m\u1ee5c g\u1ed1c b\u1ea3n sao c\u1ee7a kho, kh\u00f4ng ph\u1ea3i t\u1ec7p .code-workspace hay t\u1ec7p t\u1ea1m tr\u1ecf v\u1ec1 repo.'
    )
  }

  const hasDotGitEntry = existsSync(join(cwd, '.git'))
  const git = await getGitInstance(cwd)
  if (!git) {
    throw new Error(
      hasDotGitEntry
        ? 'C\u00f3 th\u01b0 m\u1ee5c .git nh\u01b0ng Git/SimpleGit kh\u00f4ng m\u1edf \u0111\u01b0\u1ee3c kho t\u1ea1i \u0111\u1ea5y. Th\u1eed \u1edf terminal: cd t\u1edbi th\u01b0 m\u1ee5c n\u00e0y v\u00e0 ch\u1ea1y \u00abgit status\u00bb, ho\u1eb7c ki\u1ec3m tra th\u1ee9 c\u1ea5p quy\u1ec1n.'
        : 'Th\u01b0 m\u1ee5c c\u1ea5u h\u00ecnh kh\u00f4ng n\u1eb1m trong working tree Git. Tr\u1ecfi t\u1edbi th\u01b0 m\u1ee5c g\u1ed1c b\u1ea3n sao c\u00f9ng remote v\u1edbi kho n\u00e0y (th\u01b0 m\u1ee5c b\u1ea1n m\u1edf khi l\u00e0m d\u1ef1 \u00e1n, th\u01b0\u1eddng c\u00f3 c\u1ea3 th\u01b0 m\u1ee5c .git b\u00ean trong).'
    )
  }

  let headCommit = head
  try {
    await git.raw(['cat-file', '-e', `${head}^{commit}`])
  } catch {
    const helperRef = `refs/remote-helpers-svnapp/pr-${prNumber}`
    try {
      l.info(`pr merge-conflict: fetch origin pull/${prNumber}/head in ${cwd}`)
      await git.raw(['fetch', 'origin', `+refs/pull/${prNumber}/head:${helperRef}`])
      headCommit = (await git.raw(['rev-parse', '-q', '--verify', helperRef])).trim()
    } catch (fe) {
      l.warn('pr merge-conflict: fetch pull head failed', fe)
      throw new Error('Ch\u01b0a c\u00f3 commit head PR tr\u00ean kho. L\u1ed7i fetch c\u1ea3ng pull. Ch\u1ea1y git fetch v\u00e0 th\u1eed l\u1ea1i (fork PR: c\u1ea7n origin l\u00e0 kho c\u1ee7a b\u1ea1n, GitHub t\u1ea1o refs/pull/**).')
    }
  }
  if (!/^[0-9a-f]{7,40}$/i.test(headCommit)) {
    throw new Error('SHA head PR kh\u00f4ng h\u1ee3p l\u1ec7 sau khi resolve.')
  }

  const baseTip = (await git.raw(['rev-parse', `refs/remotes/origin/${base}`])).trim()
  if (!/^[0-9a-f]{7,40}$/i.test(baseTip)) {
    throw new Error(`Kh\u00f4ng t\u00ecm th\u1ea5y \u00absorigin/${base}\u00bb. Fetch origin t\u1ea1i r\u1ed3i th\u1eed l\u1ea1i.`)
  }

  let mergeBase: string
  try {
    mergeBase = (await git.raw(['merge-base', baseTip, headCommit])).trim()
  } catch {
    throw new Error('git merge-base th\u1ea5t b\u1ea1i \u2014 \u0111\u1ed3ng b\u1ed9 th\u00eam fetch tr\u00ean kho c\u1ee5c b\u1ed9.')
  }
  if (!/^[0-9a-f]{7,40}$/i.test(mergeBase)) {
    throw new Error('merge-base kh\u00f4ng h\u1ee3p l\u1ec7.')
  }

  const r = await runGit(cwd, ['merge-tree', mergeBase, baseTip, headCommit])
  if (r.code !== 0 && r.code !== 1) {
    const m = (r.err || r.out).toLowerCase()
    if (m.includes('usage:') || m.includes('unknown option') || m.includes('merge-tree') || m.includes('ambiguous argument')) {
      l.warn('pr merge-tree failed (git too old?)', r.err, r.out)
      throw new Error('C\u1ea7n Git 2.40+ (merge-tree) \u0111\u1ec3 li\u1ec7t k\u00ea xung \u0111\u1ed9t. C\u1eadp nh\u1eadt Git ho\u1eb7c m\u1edf trang PR tr\u00ean github.com.')
    }
    throw new Error((r.err || r.out || 'merge-tree l\u1ed7i').trim().slice(0, 500))
  }

  if (r.code === 0) {
    // M\u1ed9t d\u00f2ng = tree \u00bb xung b\u1ea1ch s\u1ea1ch
    return { hasConflict: false, paths: [], localSaysClean: true }
  }

  if (r.code === 1) {
    const paths = parseConflictingPathsFromMergeTree(r.out)
    return { hasConflict: true, paths, localSaysClean: false }
  }

  const msg = (r.err || r.out).trim() || 'merge-tree l\u1ed7i'
  l.warn('merge-tree exit', r.code, msg)
  throw new Error(msg)
}
