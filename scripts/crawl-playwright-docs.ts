/**
 * Crawl trang tài liệu Playwright: https://playwright.dev/docs/* và https://playwright.dev/mcp/*
 *
 * Chạy: pnpm tsx scripts/crawl-playwright-docs.ts
 *
 * Tuỳ chọn (biến môi trường):
 *   PW_DOCS_MODE=fetch|playwright   — fetch (mặc định) hoặc playwright (+ cài browser)
 *   PW_DOCS_OUT=...                 — thư mục ghi (mặc định: ./out/playwright-docs-crawl).
 *                                       Trang ghi vào docs/*.md hoặc mcp/*.md (tách folder).
 *   PW_DOCS_BASE=https://playwright.dev
 *   PW_DOCS_PREFIXES=docs,mcp       — chỉ theo link dưới các prefix này (/docs/, /mcp/)
 *   PW_DOCS_SEEDS=url1,url2         — URL khởi đầu (phân tách bằng dấu phẩy). Mặc định: .../docs/intro
 *   PW_DOCS_RESUME=1                — đọc manifest.json trong OUT, coi các URL đã có là seen;
 *                                       mặc định seed khi resume: .../mcp/introduction (ghi đè bằng PW_DOCS_SEEDS)
 *   PW_DOCS_DELAY_MS=150
 *   PW_DOCS_MAX=0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const OUT_DIR = process.env.PW_DOCS_OUT ?? join(ROOT, 'out', 'playwright-docs-crawl')
const BASE = (process.env.PW_DOCS_BASE ?? 'https://playwright.dev').replace(/\/$/, '')
const DELAY_MS = Number(process.env.PW_DOCS_DELAY_MS ?? '150')
const MAX_PAGES = Number(process.env.PW_DOCS_MAX ?? '0')
const MODE = (process.env.PW_DOCS_MODE ?? 'fetch').toLowerCase()
const RESUME = process.env.PW_DOCS_RESUME === '1' || process.env.PW_DOCS_RESUME === 'true'

const PREFIXES = (process.env.PW_DOCS_PREFIXES ?? 'docs,mcp')
  .split(',')
  .map((s) => s.trim().replace(/^\//, ''))
  .filter(Boolean)

const UA =
  'HoneyBadger-PwDocsCrawler/1.0 (+https://playwright.dev; local documentation mirror)'

function pathAllowedPrefix(pathname: string): string | null {
  const path = pathname.replace(/\/$/, '') || '/'
  for (const p of PREFIXES) {
    const root = `/${p}`
    if (path === root || path.startsWith(`${root}/`)) return p
  }
  return null
}

function normalizeDocUrl(href: string): string | null {
  try {
    const u = new URL(href, BASE)
    if (u.origin !== new URL(BASE).origin) return null
    const prefix = pathAllowedPrefix(u.pathname)
    if (!prefix) return null
    u.hash = ''
    u.search = ''
    let path = u.pathname.replace(/\/$/, '')
    if (path === '/docs') path = '/docs/intro'
    if (path === '/mcp' || path === '/mcp/') path = '/mcp/introduction'
    u.pathname = path
    return u.toString()
  } catch {
    return null
  }
}

/** Slug file (không gồm thư mục docs/ vs mcp/ — phân biệt bằng outSubdirForUrl). */
function slugFromUrl(url: string): string {
  const u = new URL(url)
  const p = u.pathname.replace(/\/$/, '')
  if (p.startsWith('/docs/')) {
    const rest = p.slice('/docs/'.length).replace(/\//g, '__')
    return rest || 'index'
  }
  if (p.startsWith('/mcp/')) {
    const rest = p.slice('/mcp/'.length).replace(/\//g, '__')
    return rest || 'index'
  }
  return 'page'
}

function outSubdirForUrl(url: string): 'docs' | 'mcp' {
  try {
    const p = new URL(url).pathname
    if (p.startsWith('/mcp')) return 'mcp'
  } catch {
    /* fallthrough */
  }
  return 'docs'
}

function decodeMinimalEntities(s: string): string {
  return s
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function stripHtmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
  const blocks = noScript
    .replace(/<\/(p|div|h[1-6]|li|tr|br)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  const plain = blocks.replace(/<[^>]+>/g, ' ')
  return decodeMinimalEntities(plain)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function extractHrefsFromHtml(html: string): string[] {
  const found = new Set<string>()
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m: RegExpExecArray | null = re.exec(html)
  while (m !== null) {
    const raw = m[1] ?? m[2] ?? m[3]
    if (raw) {
      const n = normalizeDocUrl(raw)
      if (n) found.add(n)
    }
    m = re.exec(html)
  }
  return [...found]
}

type PageResult = { title: string; body: string; outLinks: string[] }

async function loadDocWithFetch(url: string): Promise<PageResult | null> {
  const res = await fetch(url, {
    headers: { Accept: 'text/html', 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) return null
  const html = await res.text()
  const titleM = html.match(/<title[^>]*>([^<]*)</i)
  const title = titleM ? decodeMinimalEntities(titleM[1].trim()) : url
  const artM = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const inner = artM ? artM[1] : html
  const body = stripHtmlToText(inner)
  const outLinks = extractHrefsFromHtml(html)
  return { title, body, outLinks }
}

async function extractMainText(page: Page): Promise<string> {
  const article = page.locator('article').first()
  if ((await article.count()) > 0) {
    return (await article.innerText()).trim()
  }
  const main = page.locator('[role="main"]').first()
  if ((await main.count()) > 0) {
    return (await main.innerText()).trim()
  }
  const md = page.locator('.markdown').first()
  if ((await md.count()) > 0) {
    return (await md.innerText()).trim()
  }
  return (await page.locator('body').innerText()).trim()
}

async function loadDocWithPlaywrightPage(page: Page, url: string): Promise<PageResult | null> {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page
    .locator('article, [role="main"], .markdown')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {})
  if (!res?.ok()) return null
  const title = (await page.title()) || url
  const body = await extractMainText(page)
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') || ''))
  const outLinks = [...new Set(hrefs.map((h) => normalizeDocUrl(h)).filter((x): x is string => Boolean(x)))]
  return { title, body, outLinks }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

type ManifestEntry = { url: string; title: string; file: string; fetchedAt: string }

function loadSeenFromManifest(outDir: string): Set<string> {
  const path = join(outDir, 'manifest.json')
  if (!existsSync(path)) return new Set()
  try {
    const raw = readFileSync(path, 'utf-8')
    const list = JSON.parse(raw) as ManifestEntry[]
    if (!Array.isArray(list)) return new Set()
    return new Set(list.map((e) => e.url).filter(Boolean))
  } catch {
    return new Set()
  }
}

function parseSeedUrls(): string[] {
  const fromEnv = process.env.PW_DOCS_SEEDS?.trim()
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (RESUME) {
    return [`${BASE}/mcp/introduction`]
  }
  return [`${BASE}/docs/intro`]
}

async function main() {
  if (MODE !== 'fetch' && MODE !== 'playwright') {
    throw new Error(`PW_DOCS_MODE không hợp lệ: ${MODE} (chỉ fetch hoặc playwright)`)
  }

  mkdirSync(join(OUT_DIR, 'docs'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'mcp'), { recursive: true })

  const seedStrings = parseSeedUrls()
  const seeds: string[] = []
  for (const s of seedStrings) {
    let n = normalizeDocUrl(s)
    if (!n) {
      try {
        n = normalizeDocUrl(new URL(s, BASE).href)
      } catch {
        n = null
      }
    }
    if (n) seeds.push(n)
  }
  if (seeds.length === 0) {
    throw new Error(`Không có seed hợp lệ. Kiểm tra PW_DOCS_SEEDS / PREFIXES: ${seedStrings.join(', ')}`)
  }

  const seen = RESUME ? loadSeenFromManifest(OUT_DIR) : new Set<string>()
  if (RESUME && seen.size === 0) {
    console.warn('PW_DOCS_RESUME=1 nhưng không đọc được manifest.json (hoặc rỗng). Crawl như lần đầu.\n')
  }

  const queue: string[] = []
  const inQueue = new Set<string>()
  for (const s of seeds) {
    if (!inQueue.has(s)) {
      inQueue.add(s)
      queue.push(s)
    }
  }

  const manifest: ManifestEntry[] = []
  if (RESUME && existsSync(join(OUT_DIR, 'manifest.json'))) {
    try {
      const prev = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf-8')) as ManifestEntry[]
      if (Array.isArray(prev)) manifest.push(...prev)
    } catch {
      /* bỏ qua */
    }
  }

  const manifestUrls = new Set(manifest.map((m) => m.url))

  console.log(
    `Mode: ${MODE} | PREFIXES: ${PREFIXES.join(', ')} | RESUME: ${RESUME} | seeds: ${seeds.join(' ; ')} → ${OUT_DIR}\n`,
  )

  let fetchedThisRun = 0
  const runLoop = async (loadOne: (url: string) => Promise<PageResult | null>) => {
    while (queue.length > 0) {
      if (MAX_PAGES > 0 && fetchedThisRun >= MAX_PAGES) break

      const url = queue.shift()
      if (url === undefined) break
      inQueue.delete(url)
      if (seen.has(url)) continue
      seen.add(url)

      let data: PageResult | null
      try {
        data = await loadOne(url)
      } catch (e) {
        console.warn(`[error] ${url}`, e)
        continue
      }

      if (!data) {
        console.warn(`[skip] ${url}`)
        continue
      }

      const slug = slugFromUrl(url)
      const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, '_')
      const fileName = `${safeSlug}.md`
      const relPath = join(outSubdirForUrl(url), fileName)
      const md = `# ${data.title}\n\n**URL:** ${url}\n\n---\n\n${data.body}\n`
      writeFileSync(join(OUT_DIR, relPath), md, 'utf-8')

      const entry: ManifestEntry = {
        url,
        title: data.title,
        file: relPath,
        fetchedAt: new Date().toISOString(),
      }
      if (!manifestUrls.has(url)) {
        manifest.push(entry)
        manifestUrls.add(url)
      } else {
        const idx = manifest.findIndex((m) => m.url === url)
        if (idx >= 0) manifest[idx] = entry
      }
      fetchedThisRun += 1
      console.log(`[${manifest.length}] ${url}`)

      for (const next of data.outLinks) {
        if (!seen.has(next) && !inQueue.has(next)) {
          inQueue.add(next)
          queue.push(next)
        }
      }

      if (DELAY_MS > 0) await sleep(DELAY_MS)
    }
  }

  if (MODE === 'fetch') {
    await runLoop(loadDocWithFetch)
  } else {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ userAgent: UA })
    const page = await context.newPage()
    try {
      await runLoop((u) => loadDocWithPlaywrightPage(page, u))
    } finally {
      await page.close()
      await context.close()
      await browser.close()
    }
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`\nDone. ${manifest.length} entries in manifest → ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
