import * as THREE from 'three'

// ── shared textures ─────────────────────────────────────────────
let DOT = null
export function softDot() {
  if (DOT) return DOT
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  DOT = new THREE.CanvasTexture(c)
  return DOT
}

// ── orbs: varied gem shapes, shaded, per-orb spin/pulse ──────────
const hashInt = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const GEO = {}
function unitGeometry(kind) {
  if (GEO[kind]) return GEO[kind]
  let g
  if (kind === 'ico') g = new THREE.IcosahedronGeometry(1, 1)
  else if (kind === 'octa') g = new THREE.OctahedronGeometry(1, 0)
  else if (kind === 'dodeca') g = new THREE.DodecahedronGeometry(1, 0)
  else if (kind === 'tetra') g = new THREE.TetrahedronGeometry(1.15, 0)
  else g = new THREE.SphereGeometry(1, 22, 22)
  GEO[kind] = g
  return g
}

const SHAPES = ['sphere', 'ico', 'octa', 'dodeca', 'tetra']
function shapeFor(type) {
  if (!type) return 'sphere'
  return SHAPES[hashInt(String(type)) % SHAPES.length]
}

// returns { mesh, spinX, spinY, pulse }
export function makeOrb(colorHex, size, type, id) {
  const kind = shapeFor(type)
  const color = new THREE.Color(colorHex)
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.45),
    emissiveIntensity: 0.9,
    roughness: 0.32,
    metalness: 0.16,
    flatShading: kind !== 'sphere'
  })
  const mesh = new THREE.Mesh(unitGeometry(kind), mat)
  mesh.scale.setScalar(size)
  mesh.userData = { id, sharedGeo: true }
  const seed = hashInt(id || String(Math.random()))
  return {
    mesh,
    spinX: ((seed & 7) / 7 - 0.5) * 0.02,
    spinY: (((seed >> 3) & 7) / 7 + 0.2) * 0.015,
    pulse: (seed % 628) / 100
  }
}

// ── lighting so the shaded orbs read as 3D ───────────────────────
export function addLights(scene) {
  const amb = new THREE.AmbientLight(0x33406a, 1.1)
  const key = new THREE.PointLight(0xffffff, 900, 0, 1.6)
  key.position.set(70, 90, 120)
  const rim = new THREE.PointLight(0x6f7cff, 500, 0, 1.6)
  rim.position.set(-90, -50, -70)
  scene.add(amb, key, rim)
  return [amb, key, rim]
}

// ── layered starfield with soft round twinkling stars ────────────
export function makeStarfield(count = 1400) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 380 + (i % 460)
    const a = (hashInt('sx' + i) / 4294967295) * Math.PI * 2
    const b = (hashInt('sy' + i) / 4294967295 - 0.5) * 2
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = b * 320
    pos[i * 3 + 2] = Math.sin(a) * r
    const t = 0.5 + (hashInt('sc' + i) / 4294967295) * 0.5
    const tint = i % 5 === 0 ? [t, t * 0.8, 1] : i % 7 === 0 ? [1, t * 0.85, t * 0.9] : [t, t, t]
    col[i * 3] = tint[0]
    col[i * 3 + 1] = tint[1]
    col[i * 3 + 2] = tint[2]
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const mat = new THREE.PointsMaterial({
    size: 2.2,
    map: softDot(),
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  })
  return new THREE.Points(geo, mat)
}

// ── nebula backdrop: big inward sphere with soft colored clouds ──
export function makeNebula(hexA = '#2a1a4d', hexB = '#0a1836') {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#05060c'
  ctx.fillRect(0, 0, s, s)
  const blobs = [
    [s * 0.3, s * 0.4, hexA, 0.44],
    [s * 0.7, s * 0.65, hexB, 0.42],
    [s * 0.55, s * 0.22, hexB, 0.32],
    [s * 0.18, s * 0.75, hexA, 0.34],
    [s * 0.82, s * 0.32, hexA, 0.3],
    [s * 0.46, s * 0.58, hexB, 0.26]
  ]
  const hex2 = (a) => Math.round(a * 255).toString(16).padStart(2, '0')
  for (const [x, y, col, alpha] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.4)
    g.addColorStop(0, col + hex2(alpha))
    g.addColorStop(1, col + '00')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  }
  const tex = new THREE.CanvasTexture(c)
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 32),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false })
  )
  return mesh
}

// ── energy pulses traveling along link segments ─────────────────
export class LinkPulses {
  // segments: Float32Array-like flat list [ax,ay,az,bx,by,bz, ...]
  constructor(group, segments, colorHex, count = 70) {
    this.segs = segments
    this.nSeg = segments.length / 6
    this.count = this.nSeg > 0 ? Math.min(count, this.nSeg) : 0
    this.assign = []
    for (let i = 0; i < this.count; i++) {
      this.assign.push({ seg: Math.floor((i / this.count) * this.nSeg), t: (i / this.count) % 1, speed: 0.35 + (i % 6) * 0.08 })
    }
    const pos = new Float32Array(Math.max(1, this.count) * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.geo = geo
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: new THREE.Color(colorHex),
        size: 3.2,
        map: softDot(),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      })
    )
    if (this.count > 0) group.add(this.points)
  }

  update(dt) {
    if (this.count === 0) return
    const arr = this.geo.attributes.position.array
    for (let i = 0; i < this.count; i++) {
      const a = this.assign[i]
      a.t += a.speed * dt
      while (a.t > 1) {
        a.t -= 1
        a.seg = (a.seg + 13) % this.nSeg
      }
      const o = a.seg * 6
      const s = this.segs
      arr[i * 3] = s[o] + (s[o + 3] - s[o]) * a.t
      arr[i * 3 + 1] = s[o + 1] + (s[o + 4] - s[o + 1]) * a.t
      arr[i * 3 + 2] = s[o + 2] + (s[o + 5] - s[o + 2]) * a.t
    }
    this.geo.attributes.position.needsUpdate = true
  }

  dispose() {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}

// animate a list of orb records: { mesh, spinX, spinY, pulse, baseSize, active }
export function animateOrbs(nodes, t, dt) {
  for (const o of nodes) {
    o.mesh.rotation.x += o.spinX
    o.mesh.rotation.y += o.spinY
    const pulse = 1 + Math.sin(t * 1.5 + o.pulse) * 0.07
    const dim = o.active === false ? 0.55 : 1
    o.mesh.scale.setScalar(o.baseSize * pulse * dim)
  }
}
