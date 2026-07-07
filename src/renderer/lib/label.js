import * as THREE from 'three'

// Cheap camera-facing text labels for nodes, drawn as canvas-textured sprites.
// Cached by text+color so re-renders don't re-rasterize.
const cache = new Map()
const FONT = 56

function texture(text, hex) {
  const key = text + hex
  let tex = cache.get(key)
  if (tex) return tex
  const canvas = document.createElement('canvas')
  let ctx = canvas.getContext('2d')
  ctx.font = `600 ${FONT}px -apple-system, "Segoe UI", sans-serif`
  const pad = 14
  const w = Math.min(1000, Math.ceil(ctx.measureText(text).width) + pad * 2)
  const h = FONT + pad * 2
  canvas.width = w
  canvas.height = h
  ctx = canvas.getContext('2d')
  ctx.font = `600 ${FONT}px -apple-system, "Segoe UI", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.95)'
  ctx.shadowBlur = 7
  ctx.fillStyle = hex
  ctx.fillText(text, pad, h / 2)
  tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.anisotropy = 4
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

// FONT rose 40→56 for crispness; callers pass ~0.71x their old scale to keep world size
export function makeLabel(text, hex = '#dfe7ff', scale = 0.036) {
  const t = text.length > 34 ? text.slice(0, 33) + '…' : text
  const tex = texture(t, hex)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 })
  )
  sprite.scale.set(tex.image.width * scale, tex.image.height * scale, 1)
  sprite.renderOrder = 10
  return sprite
}
