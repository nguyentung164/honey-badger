import sharp from 'sharp'

export const DENSITY = 144
export const ALPHA_THRESHOLD = 2

export function parseViewBox(svgText) {
  const match = svgText.match(/\bviewBox="([^"]+)"/)
  if (match) {
    const [x, y, w, h] = match[1].split(/\s+/).map(Number)
    return { x, y, w, h }
  }
  const w = Number(svgText.match(/\bwidth="([^"]+)"/)?.[1] ?? 0)
  const h = Number(svgText.match(/\bheight="([^"]+)"/)?.[1] ?? 0)
  return { x: 0, y: 0, w, h }
}

export function formatNum(n) {
  return Number(n.toFixed(2))
}

export function applyCrop(svgText, box) {
  const { x, y, w, h } = box
  const vb = `${formatNum(x)} ${formatNum(y)} ${formatNum(w)} ${formatNum(h)}`
  const wAttr = Math.round(w)
  const hAttr = Math.round(h)

  let out = svgText
  if (/\bviewBox=/.test(out)) {
    out = out.replace(/\bviewBox="[^"]*"/, `viewBox="${vb}"`)
  } else {
    out = out.replace(/<svg/, `<svg viewBox="${vb}"`)
  }
  if (/\bwidth=/.test(out)) {
    out = out.replace(/\bwidth="[^"]*"/, `width="${wAttr}"`)
  }
  if (/\bheight=/.test(out)) {
    out = out.replace(/\bheight="[^"]*"/, `height="${hAttr}"`)
  }
  return out
}

function isUnchanged(before, after) {
  return (
    formatNum(before.x) === formatNum(after.x) &&
    formatNum(before.y) === formatNum(after.y) &&
    formatNum(before.w) === formatNum(after.w) &&
    formatNum(before.h) === formatNum(after.h)
  )
}

/** Crop SVG string to tight alpha bounds; keeps vector paths. */
export async function cropSvgText(svgText, { padding = 0 } = {}) {
  const viewBox = parseViewBox(svgText)
  if (!viewBox.w || !viewBox.h) {
    throw new Error('missing viewBox / dimensions')
  }

  const svgBuf = Buffer.from(svgText)
  const meta = await sharp(svgBuf, { density: DENSITY }).metadata()
  const scaleX = meta.width / viewBox.w
  const scaleY = meta.height / viewBox.h

  const { data, info } = await sharp(svgBuf, { density: DENSITY })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3]
      if (a > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) throw new Error('no visible pixels')

  const padX = Math.round(padding * scaleX)
  const padY = Math.round(padding * scaleY)
  minX = Math.max(0, minX - padX)
  minY = Math.max(0, minY - padY)
  maxX = Math.min(info.width - 1, maxX + padX)
  maxY = Math.min(info.height - 1, maxY + padY)

  const after = {
    x: viewBox.x + minX / scaleX,
    y: viewBox.y + minY / scaleY,
    w: (maxX - minX + 1) / scaleX,
    h: (maxY - minY + 1) / scaleY,
  }

  return {
    before: viewBox,
    after,
    cropped: applyCrop(svgText, after),
    unchanged: isUnchanged(viewBox, after),
  }
}
