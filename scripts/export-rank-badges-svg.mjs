/**
 * Export rank badge SVGs from Figma Cover showcase (4 rows × 9 = 36).
 * Auto-crops each SVG to tight bounds after download.
 *
 *   pnpm export:rank-badges       → row 1 only (Frame 1 → ranks/full/*.svg)
 *   pnpm export:rank-badges:all   → Frame 1, 2, 4, 5 under Cover_1
 *   pnpm export:rank-badges -- --no-crop  → skip crop step
 *
 * Figma: Cover page → Cover_1 → Frame 1 | Frame 2 | Frame 4 | Frame 5
 * Each frame has 9 instances (Badge_01…09 or Badge Frame), left = newbie … right = mythic.
 */
import fs from 'node:fs'
import path from 'node:path'
import { cropSvgText } from './lib/crop-rank-badge-svg.mjs'

const FILE_KEY = '9xKYITyESUvzHyP2qCanzo'
const COVER_1_ID = '508:8272'
const ROOT_OUT = path.resolve('src/renderer/assets/ranks')

const RANK_CODES = [
  'newbie',
  'contributor',
  'developer',
  'regular',
  'pro',
  'expert',
  'master',
  'legend',
  'mythic',
]

/** Cover_1 → Frame 1, 2, 4, 5 (instance node ids, Badge_01=left … Badge_09=right) */
const COVER_ROWS = {
  'Frame 1': {
    label: 'full',
    dir: 'full',
    nodes: {
      newbie: '508:3253',
      contributor: '508:3252',
      developer: '508:3251',
      regular: '508:3250',
      pro: '508:3249',
      expert: '508:3248',
      master: '508:3247',
      legend: '508:3246',
      mythic: '508:3245',
    },
  },
  'Frame 2': {
    label: 'simple',
    dir: 'simple',
    nodes: {
      newbie: '508:3740',
      contributor: '508:3739',
      developer: '508:3738',
      regular: '508:3737',
      pro: '508:3736',
      expert: '508:3735',
      master: '508:3734',
      legend: '508:3733',
      mythic: '508:3732',
    },
  },
  'Frame 4': {
    label: 'medal',
    dir: 'medal',
    nodes: {
      newbie: '508:7151',
      contributor: '508:7152',
      developer: '508:7153',
      regular: '508:7154',
      pro: '508:7155',
      expert: '508:7156',
      master: '508:7157',
      legend: '508:7158',
      mythic: '508:7159',
    },
  },
  'Frame 5': {
    label: 'avatar-ring',
    dir: 'avatar-ring',
    nodes: {
      newbie: '508:7744',
      contributor: '508:7745',
      developer: '508:7746',
      regular: '508:7747',
      pro: '508:7748',
      expert: '508:7749',
      master: '508:7750',
      legend: '508:7751',
      mythic: '508:7752',
    },
  },
}

const ROW_FRAME_ORDER = ['Frame 1', 'Frame 2', 'Frame 4', 'Frame 5']

function loadEnvFile(filename) {
  const file = path.resolve(filename)
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const exportAll = process.argv.includes('--all')
const skipCrop = process.argv.includes('--no-crop')
const token = process.env.FIGMA_ACCESS_TOKEN ?? process.env.FIGMA_TOKEN

if (!token) {
  console.error('Missing FIGMA_ACCESS_TOKEN in .env — see .env.example')
  process.exit(1)
}

/** Discover instances under Cover_1 → Frame 1/2/4/5 sorted left→right */
async function discoverCoverRows() {
  const res = await fetch(
    `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(COVER_1_ID)}&depth=3`,
    { headers: { 'X-Figma-Token': token } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.err ?? JSON.stringify(json))

  const cover1 = json.nodes[COVER_1_ID]?.document
  const rows = []

  for (const frameName of ROW_FRAME_ORDER) {
    const frame = cover1?.children?.find(c => c.name === frameName && c.type === 'FRAME')
    if (!frame) continue

    const instances = (frame.children ?? [])
      .filter(c => c.type === 'INSTANCE')
      .sort((a, b) => {
        const ax = a.absoluteBoundingBox?.x ?? a.relativeTransform?.[0]?.[2] ?? 0
        const bx = b.absoluteBoundingBox?.x ?? b.relativeTransform?.[0]?.[2] ?? 0
        return ax - bx
      })

    if (instances.length < 9) continue

    const nodes = {}
    for (let i = 0; i < 9; i++) nodes[RANK_CODES[i]] = instances[i].id

    const fallback = COVER_ROWS[frameName]
    rows.push({
      frameName,
      label: fallback?.label ?? frameName,
      dir: fallback?.dir ?? frameName.toLowerCase().replace(/\s+/g, '-'),
      nodes,
    })
  }

  return rows
}

let rows
try {
  rows = await discoverCoverRows()
  if (rows.length === 0) throw new Error('no rows found')
  console.log('Cover_1 rows:', rows.map(r => `${r.frameName} → ${r.dir}/`).join(', '))
} catch (e) {
  console.warn('Cover discovery failed, using static ids:', e.message)
  rows = ROW_FRAME_ORDER.map(name => ({
    frameName: name,
    ...COVER_ROWS[name],
  })).filter(r => r.nodes)
}

if (!exportAll) {
  rows = rows.filter(r => r.frameName === 'Frame 1')
  if (rows.length === 0) {
    rows = [{ frameName: 'Frame 1', label: 'full', dir: 'full', nodes: COVER_ROWS['Frame 1'].nodes }]
  }
}

const jobs = []
for (const { frameName, label, dir, nodes } of rows) {
  const baseDir = path.join(ROOT_OUT, dir)
  for (const [rank, nodeId] of Object.entries(nodes)) {
    jobs.push({
      frameName,
      label,
      rank,
      nodeId,
      file: path.join(baseDir, `${rank}.svg`),
      outDir: baseDir,
    })
  }
}

fs.mkdirSync(ROOT_OUT, { recursive: true })
for (const job of jobs) fs.mkdirSync(job.outDir, { recursive: true })

const CHUNK = 40
let exported = 0

for (let i = 0; i < jobs.length; i += CHUNK) {
  const chunk = jobs.slice(i, i + CHUNK)
  const ids = chunk.map(j => j.nodeId).join(',')
  const metaRes = await fetch(`https://api.figma.com/v1/images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=svg`, {
    headers: { 'X-Figma-Token': token },
  })
  const meta = await metaRes.json()
  if (!metaRes.ok || meta.err) {
    console.error('Figma API error:', meta.err ?? meta)
    process.exit(1)
  }

  for (const job of chunk) {
    const url = meta.images?.[job.nodeId]
    if (!url) {
      console.error(`No export URL: ${job.frameName}/${job.rank} (${job.nodeId})`)
      process.exit(1)
    }
    const svgRes = await fetch(url)
    if (!svgRes.ok) {
      console.error(`Download failed: ${job.frameName}/${job.rank}`, svgRes.status)
      process.exit(1)
    }
    let svg = await svgRes.text()
    const rel = path.relative(ROOT_OUT, job.file).replace(/\\/g, '/')

    if (!skipCrop) {
      try {
        const { cropped, before, after, unchanged } = await cropSvgText(svg)
        if (!unchanged) {
          svg = cropped
          console.log(
            `[${job.frameName}]`,
            rel,
            `crop ${Math.round(before.w)}×${Math.round(before.h)} → ${Math.round(after.w)}×${Math.round(after.h)}`,
          )
        } else {
          console.log(`[${job.frameName}]`, rel, '(crop: already tight)')
        }
      } catch (err) {
        console.warn(`[${job.frameName}]`, rel, `crop skipped: ${err.message}`)
      }
    } else {
      console.log(`[${job.frameName}]`, rel, `(${(svg.length / 1024).toFixed(1)} KB)`)
    }

    fs.writeFileSync(job.file, svg, 'utf8')
    exported++
  }
}

console.log(
  `\nDone — ${exported} SVG(s) from Cover_1 → ${ROOT_OUT}${skipCrop ? ' (no crop)' : ' (cropped)'}`,
)
if (!exportAll) {
  console.log('Tip: pnpm export:rank-badges:all  → Frame 1 + 2 + 4 + 5 (36 SVGs)')
}
