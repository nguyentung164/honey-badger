import l from 'electron-log'
import { listPullRequestFileNames } from './git-hosting'

export type PrFileOverlapRequestItem = {
  owner: string
  repo: string
  number: number
}

export type PrFileOverlapPrResult = {
  owner: string
  repo: string
  number: number
  fileCount: number
  error?: string
}

export type PrFileOverlapCluster = {
  owner: string
  repo: string
  prNumbers: number[]
  /** File paths touched by at least two PRs in this cluster. */
  overlappingFiles: string[]
}

export type PrFileOverlapResult = {
  prResults: PrFileOverlapPrResult[]
  clusters: PrFileOverlapCluster[]
  analyzedCount: number
  failedCount: number
}

const CONCURRENCY = 4

function dedupeKey(owner: string, repo: string, number: number): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}#${number}`
}

function find(parent: Map<number, number>, x: number): number {
  let p = parent.get(x)
  if (p === undefined) {
    parent.set(x, x)
    return x
  }
  if (p !== x) {
    p = find(parent, p)
    parent.set(x, p)
  }
  return p
}

function union(parent: Map<number, number>, a: number, b: number): void {
  const ra = find(parent, a)
  const rb = find(parent, b)
  if (ra !== rb) parent.set(ra, rb)
}

/**
 * Tải danh sách file từng PR (tên file), giới hạn song song, rồi gom cụm theo giao file trong cùng repo.
 */
export async function analyzePrFileOverlap(items: PrFileOverlapRequestItem[]): Promise<PrFileOverlapResult> {
  const seen = new Map<string, PrFileOverlapRequestItem>()
  for (const it of items) {
    const o = (it.owner || '').trim()
    const r = (it.repo || '').trim()
    const n = it.number
    if (!o || !r || !Number.isFinite(n) || n <= 0) continue
    const k = dedupeKey(o, r, n)
    if (!seen.has(k)) seen.set(k, { owner: o, repo: r, number: n })
  }
  const list = [...seen.values()]
  if (list.length === 0) {
    return { prResults: [], clusters: [], analyzedCount: 0, failedCount: 0 }
  }

  const prResults: PrFileOverlapPrResult[] = []
  const fileSets = new Map<string, Map<number, Set<string>>>()

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async ({ owner, repo, number }) => {
        try {
          const names = await listPullRequestFileNames(owner, repo, number)
          prResults.push({ owner, repo, number, fileCount: names.length })
          const rk = `${owner}/${repo}`
          let byNumber = fileSets.get(rk)
          if (!byNumber) {
            byNumber = new Map()
            fileSets.set(rk, byNumber)
          }
          byNumber.set(number, new Set(names))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          l.warn(`analyzePrFileOverlap: ${owner}/${repo}#${number}:`, msg)
          prResults.push({ owner, repo, number, fileCount: 0, error: msg })
        }
      })
    )
  }

  const failedCount = prResults.filter(p => p.error).length
  const clusters: PrFileOverlapCluster[] = []

  for (const [repoKey, byPr] of fileSets) {
    if (byPr.size < 2) continue
    const numbers = [...byPr.keys()]
    const parent = new Map<number, number>()

    const addUnionForFile = (file: string) => {
      const holders: number[] = []
      for (const num of numbers) {
        if (byPr.get(num)?.has(file)) holders.push(num)
      }
      if (holders.length < 2) return
      const h0 = holders[0]
      if (h0 === undefined) return
      for (let i = 1; i < holders.length; i++) {
        const hi = holders[i]
        if (hi === undefined) continue
        union(parent, h0, hi)
      }
    }

    const allFiles = new Set<string>()
    for (const set of byPr.values()) for (const f of set) allFiles.add(f)
    for (const f of allFiles) addUnionForFile(f)

    const byRoot = new Map<number, number[]>()
    for (const num of numbers) {
      const root = find(parent, num)
      let gr = byRoot.get(root)
      if (!gr) {
        gr = []
        byRoot.set(root, gr)
      }
      gr.push(num)
    }

    const [owner, repo] = repoKey.split('/')
    if (!owner || !repo) continue

    for (const prNums of byRoot.values()) {
      if (prNums.length < 2) continue
      const s = new Set(prNums)
      const overlappingFiles: string[] = []
      for (const f of allFiles) {
        let c = 0
        for (const num of s) {
          if (byPr.get(num)?.has(f)) c++
        }
        if (c >= 2) overlappingFiles.push(f)
      }
      overlappingFiles.sort((a, b) => a.localeCompare(b))
      prNums.sort((a, b) => a - b)
      clusters.push({
        owner,
        repo,
        prNumbers: prNums,
        overlappingFiles,
      })
    }
  }

  clusters.sort((a, b) => {
    const c = a.owner.localeCompare(b.owner) || a.repo.localeCompare(b.repo)
    if (c !== 0) return c
    return (a.prNumbers[0] ?? 0) - (b.prNumbers[0] ?? 0)
  })

  prResults.sort((a, b) => a.owner.localeCompare(b.owner) || a.repo.localeCompare(b.repo) || a.number - b.number)

  return {
    prResults,
    clusters,
    analyzedCount: prResults.filter(p => !p.error).length,
    failedCount,
  }
}
