import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SHEET = path.resolve('src/renderer/assets/ranks/_spritesheet.png')
const OUT_DIR = path.resolve('src/renderer/assets/ranks/full')
const THRESHOLD = 28
const TARGET = 256

const ranks = [
  ['newbie', 48, 48],
  ['contributor', 152, 48],
  ['developer', 256, 48],
  ['regular', 360, 48],
  ['pro', 464, 48],
  ['expert', 100, 152],
  ['master', 204, 152],
  ['legend', 308, 152],
  ['mythic', 412, 152],
]

for (const [name, left, top] of ranks) {
  let { data, info } = await sharp(SHEET)
    .extract({ left, top, width: 72, height: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r <= THRESHOLD && g <= THRESHOLD && b <= THRESHOLD) data[i + 3] = 0
  }

  await sharp(data, { raw: info })
    .trim()
    .resize(TARGET, TARGET, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.6, m1: 0.7, m2: 0.25 })
    .png({ compressionLevel: 6, effort: 7 })
    .toFile(path.join(OUT_DIR, `${name}.png`))

  console.log('built', name)
}

if (fs.existsSync(SHEET)) fs.unlinkSync(SHEET)
