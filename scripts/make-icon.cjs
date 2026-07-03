// Turn pictures/icon.png (the app icon on a white canvas) into a clean,
// transparent-cornered build/icon.ico (+ build/icon.png).
// Run: node scripts/make-icon.cjs [sourcePng]
const { Jimp } = require('jimp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')
const fs = require('node:fs')
const path = require('node:path')

const SRC = process.argv[2] || path.join(__dirname, '..', 'pictures', 'icon.png')
const OUT_DIR = path.join(__dirname, '..', 'build')

const brightness = (d, i) => (d[i] + d[i + 1] + d[i + 2]) / 3

;(async () => {
  const img = await Jimp.read(SRC)
  let { width, height, data } = img.bitmap

  // 1) bounding box of the icon (clearly non-white; ignores faint drop shadow)
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] > 10 && brightness(data, i) < 210) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const side = Math.max(bw, bh)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  let sx = Math.round(cx - side / 2)
  let sy = Math.round(cy - side / 2)
  sx = Math.max(0, Math.min(sx, width - side))
  sy = Math.max(0, Math.min(sy, height - side))
  img.crop({ x: sx, y: sy, w: side, h: side })
  console.log(`bbox ${bw}x${bh} -> square crop ${side} at (${sx},${sy})`)

  // 2) rounded-corner alpha mask (squircle ~22.5%), removes the white corners
  const S = img.bitmap.width
  const d = img.bitmap.data
  const r = Math.round(S * 0.225)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      let dx = 0, dy = 0
      if (x < r) dx = r - x
      else if (x >= S - r) dx = x - (S - 1 - r)
      if (y < r) dy = r - y
      else if (y >= S - r) dy = y - (S - 1 - r)
      if (dx > 0 && dy > 0) {
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > r) d[i + 3] = 0
        else if (dist > r - 1.5) d[i + 3] = Math.round(d[i + 3] * (r - dist) / 1.5)
      }
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 3) build/icon.png (512, for electron-builder / general use)
  const png512 = img.clone().resize({ w: 512, h: 512 })
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), await png512.getBuffer('image/png'))

  // 4) build/icon.ico (multi-resolution)
  const sizes = [256, 128, 64, 48, 32, 16]
  const buffers = []
  for (const s of sizes) {
    buffers.push(await img.clone().resize({ w: s, h: s }).getBuffer('image/png'))
  }
  const ico = await pngToIco(buffers)
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)
  console.log(`wrote build/icon.ico (${ico.length} bytes) + build/icon.png`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
