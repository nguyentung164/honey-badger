/**
 * Crop rank badge SVGs to tight bounding box (batch, keeps vector).
 *
 *   pnpm crop:rank-badges
 *   pnpm crop:rank-badges -- --padding 2
 *   pnpm crop:rank-badges -- --dry-run
 */
import fs from 'node:fs'
import path from 'node:path'
import { cropSvgText } from './lib/crop-rank-badge-svg.mjs'

const ROOT = path.resolve('src/renderer/assets/ranks')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const padding = Number(args[args.indexOf('--padding') + 1] ?? 0)

function collectSvgs(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectSvgs(full))
    else if (entry.name.endsWith('.svg')) files.push(full)
  }
  return files
}

const files = collectSvgs(ROOT)
if (files.length === 0) {
  console.error('No SVG files under', ROOT)
  process.exit(1)
}

let changed = 0
for (const file of files) {
  const rel = path.relative(process.cwd(), file)
  try {
    const svgText = fs.readFileSync(file, 'utf8')
    const { before, after, cropped, unchanged } = await cropSvgText(svgText, { padding })

    if (unchanged) {
      console.log('skip', rel, '(already tight)')
      continue
    }

    console.log(
      'crop',
      rel,
      `${Math.round(before.w)}×${Math.round(before.h)} → ${Math.round(after.w)}×${Math.round(after.h)}`,
    )

    if (!dryRun) fs.writeFileSync(file, cropped, 'utf8')
    changed++
  } catch (err) {
    console.error('fail', rel, err.message)
  }
}

console.log(
  dryRun
    ? `Would crop ${changed}/${files.length} SVG(s).`
    : `Cropped ${changed}/${files.length} SVG(s).`,
)
