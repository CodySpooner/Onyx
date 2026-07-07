import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { makeLabel } from '../lib/label.js'
import { makeStarfield, makeNebula, softDot, windowTexture } from '../lib/scenery.js'
import { ecoLayout, diffTown } from '../lib/eco.mjs'
import { spawnNpcs, advanceNpc, mulberry32 } from '../lib/econpc.mjs'
import { bus } from '../lib/bus.mjs'

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const DAY = 86400000
const BUCKET_GLOW = [0.25, 0.7, 1.3] // window brightness per litBucket
const NPC_PALETTE = [0x8fb4d8, 0xb89fd8, 0x9fd8b4].map((h) => new THREE.Color(h).multiplyScalar(0.7))
const LIBRARIAN_COLOR = new THREE.Color(0xd8c9a0)
const WANDERER_COLOR = new THREE.Color(0x4a5470)

// sun/sky palette scratch (module-level, zero per-frame alloc)
const C_NOON = new THREE.Color(0xfff2d8)
const C_HORIZON = new THREE.Color(0xff9a5a)
const C_NIGHTSUN = new THREE.Color(0x3a4a8a)
const C_FOG_DAY = new THREE.Color(0x9fb2d0)
const C_FOG_NIGHT = new THREE.Color(0x0a1018)
const _col = new THREE.Color()
const _tmp = new THREE.Vector3()
const clamp01 = (v) => Math.max(0, Math.min(1, v))

let CLOUD_TEX = null
function cloudTexture() {
  if (CLOUD_TEX) return CLOUD_TEX
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  for (const [x, y, r] of [[48, 70, 38], [78, 62, 32], [62, 78, 30]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.85)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  }
  CLOUD_TEX = new THREE.CanvasTexture(c)
  return CLOUD_TEX
}

function tickerTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 32
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#03140a'
  ctx.fillRect(0, 0, 512, 32)
  ctx.font = 'bold 18px Consolas, monospace'
  ctx.fillStyle = '#39ff88'
  ctx.fillText('▲ EDGE +2.4%  ◆ CLV 104.2  ▲ ROI +6.1%  ● UNITS 3.2  ', 4, 22)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

// two-line district label: name + "N notes · M recent"
function makeLabel2(name, sub, colorHex) {
  const pad = 12
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = '600 34px Inter, system-ui, sans-serif'
  const w1 = ctx.measureText(name).width
  ctx.font = '20px Inter, system-ui, sans-serif'
  const w2 = ctx.measureText(sub).width
  c.width = Math.ceil(Math.max(w1, w2)) + pad * 2
  c.height = 72
  const ctx2 = c.getContext('2d')
  ctx2.font = '600 34px Inter, system-ui, sans-serif'
  ctx2.fillStyle = colorHex
  ctx2.textAlign = 'center'
  ctx2.fillText(name, c.width / 2, 32)
  ctx2.font = '20px Inter, system-ui, sans-serif'
  ctx2.fillStyle = '#9fb0d0'
  ctx2.fillText(sub, c.width / 2, 58)
  const tex = new THREE.CanvasTexture(c)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95 }))
  sprite.scale.set(c.width * 0.045, c.height * 0.045, 1)
  sprite.renderOrder = 10
  return sprite
}

// ── building recipes ────────────────────────────────────────────
// Each returns { body: geo[], accent: geo[], blinks: [{x,y,z}], chimneys, topH }
// with part positions LOCAL to the district center; caller translates.
function addPart(list, geo, x, y, z, ry = 0, rz = 0) {
  const g = geo
  if (rz) g.rotateZ(rz)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  list.push(g)
  return g
}

function buildingParts(archetype, S, rng) {
  const body = []
  const accent = []
  const blinks = []
  const chimneys = []
  let topH = 2 * S
  if (archetype === 'hq') {
    addPart(body, new THREE.BoxGeometry(1.4 * S, 4.2 * S, 1.4 * S), 0, 2.1 * S, 0)
    addPart(body, new THREE.BoxGeometry(0.9 * S, 0.7 * S, 0.9 * S), 0, 4.55 * S, 0)
    addPart(accent, new THREE.ConeGeometry(0.12 * S, 1.1 * S, 6), 0, 5.4 * S, 0)
    blinks.push({ x: 0, y: 6 * S, z: 0 })
    topH = 5 * S
  } else if (archetype === 'lab') {
    addPart(body, new THREE.CylinderGeometry(0.95 * S, 1.05 * S, 1.1 * S, 20), 0, 0.55 * S, 0)
    addPart(accent, new THREE.SphereGeometry(0.78 * S, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.1 * S, 0)
    addPart(body, new THREE.BoxGeometry(0.7 * S, 0.5 * S, 0.5 * S), 1.2 * S, 0.25 * S, 0)
    addPart(body, new THREE.BoxGeometry(0.7 * S, 0.5 * S, 0.5 * S), -1.2 * S, 0.25 * S, 0)
    addPart(accent, new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 0.9 * S, 6), 0.5 * S, 2 * S, 0.3 * S)
    blinks.push({ x: 0.5 * S, y: 2.5 * S, z: 0.3 * S })
    topH = 1.95 * S
  } else if (archetype === 'library') {
    addPart(body, new THREE.BoxGeometry(2.2 * S, 0.9 * S, 1.2 * S), 0, 0.45 * S, 0)
    for (let i = 0; i < 5; i++) {
      addPart(accent, new THREE.CylinderGeometry(0.07 * S, 0.07 * S, 0.9 * S, 8), (i - 2) * 0.45 * S, 0.45 * S, 0.68 * S)
    }
    addPart(accent, new THREE.BoxGeometry(2.4 * S, 0.18 * S, 1.4 * S), 0, 0.99 * S, 0)
    addPart(accent, new THREE.CylinderGeometry(0.7 * S, 0.7 * S, 2.4 * S, 3), 0, 1.25 * S, 0, 0, Math.PI / 2)
    topH = 1.8 * S
  } else if (archetype === 'refinery') {
    const hs = [1.6 * S, 1.1 * S, 1.9 * S]
    const tankTop = []
    hs.forEach((h, i) => {
      const a = (i / 3) * Math.PI * 2
      const x = Math.cos(a) * 0.9 * S
      const z = Math.sin(a) * 0.9 * S
      addPart(body, new THREE.CylinderGeometry(0.55 * S, 0.55 * S, h, 14), x, h / 2, z)
      tankTop.push({ x, y: h, z })
    })
    addPart(accent, new THREE.CylinderGeometry(0.07 * S, 0.07 * S, 1.6 * S, 6), 0, hs[0] * 0.85, 0, 0, Math.PI / 2)
    addPart(accent, new THREE.CylinderGeometry(0.07 * S, 0.07 * S, 1.6 * S, 6), 0, hs[2] * 0.8, 0.2 * S, Math.PI / 3, Math.PI / 2)
    addPart(body, new THREE.BoxGeometry(0.8 * S, 0.5 * S, 0.6 * S), 0, 0.25 * S, -1.3 * S)
    blinks.push({ x: tankTop[2].x, y: tankTop[2].y + 0.3 * S, z: tankTop[2].z })
    topH = 2 * S
  } else if (archetype === 'trading') {
    addPart(body, new THREE.BoxGeometry(2.6 * S, 0.9 * S, 1.5 * S), 0, 0.45 * S, 0)
    addPart(accent, new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 1.4 * S, 6), 1.1 * S, 1.6 * S, 0)
    addPart(accent, new THREE.BoxGeometry(0.4 * S, 0.22 * S, 0.02 * S), 1.32 * S, 2.1 * S, 0)
    topH = 1.7 * S
  } else if (archetype === 'workshop') {
    addPart(body, new THREE.BoxGeometry(1.8 * S, 0.8 * S, 1.4 * S), 0, 0.4 * S, 0)
    for (let i = 0; i < 3; i++) {
      addPart(accent, new THREE.CylinderGeometry(0.35 * S, 0.35 * S, 1.3 * S, 3), (i - 1) * 0.58 * S, 0.95 * S, 0, 0, Math.PI / 2)
    }
    addPart(accent, new THREE.CylinderGeometry(0.09 * S, 0.09 * S, 1.2 * S, 6), 0.7 * S, 1.4 * S, -0.4 * S)
    chimneys.push({ x: 0.7 * S, y: 2 * S, z: -0.4 * S })
    topH = 1.8 * S
  } else if (archetype === 'signal') {
    addPart(body, new THREE.CylinderGeometry(0.06 * S, 0.4 * S, 3.6 * S, 8), 0, 1.8 * S, 0)
    for (const y of [1.8, 2.5, 3.2]) {
      addPart(accent, new THREE.BoxGeometry(0.9 * S, 0.06 * S, 0.06 * S), 0, y * S, 0)
    }
    addPart(accent, new THREE.ConeGeometry(0.1 * S, 0.5 * S, 8), 0, 3.85 * S, 0)
    blinks.push({ x: 0, y: 4.1 * S, z: 0 })
    topH = 3.9 * S
  } else {
    // hamlet: cottage row
    for (let i = 0; i < 3; i++) {
      const w = (0.6 + rng() * 0.2) * S
      const x = (rng() - 0.5) * 1.6 * S
      const z = (rng() - 0.5) * 1.6 * S
      addPart(body, new THREE.BoxGeometry(w, 0.5 * S, w), x, 0.25 * S, z)
      addPart(accent, new THREE.ConeGeometry(w * 0.8, 0.4 * S, 4), x, 0.7 * S, z, Math.PI / 4)
    }
    topH = 1.1 * S
  }
  return { body, accent, blinks, chimneys, topH }
}

// stamp a flat color attribute on a geometry
function paintGeo(geo, color) {
  const count = geo.getAttribute('position').count
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r
    arr[i * 3 + 1] = color.g
    arr[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

// Ecosystem — the vault as a living town. Districts are real folders with
// archetype buildings; NPCs run errands driven by real edits, links, SRS
// queue, and orphans; the sky follows the user's actual clock.
export class EcoView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.districts = []
    this.labels = []
    this.colliders = []
    this._npcs = []
    this._dueCount = 0
    this._ambient = true
    this.labelsVisible = true
    this.activeIds = null
    this._t = 0
    this._clockT = 5 // force a Date read on first frame
    this._hours = 12
    this._out = new Float32Array(3)
    this._scratch = new THREE.Object3D()

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0a1018, 0.0016)
    this.scene.add(makeNebula('#1a2a4d', '#0e1c36'))
    this.stars = makeStarfield(900)
    this.scene.add(this.stars)

    this.ambientLight = new THREE.AmbientLight(0xbfd0e8, 0.9)
    this.scene.add(this.ambientLight)
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.0)
    this.sun.position.set(120, 200, 80)
    this.scene.add(this.sun)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 3000)
    this.camera.position.set(0, 210, 420)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = 1.45
    this.controls.maxDistance = 640

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.5, 0.5, 0.5] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex
    applyCommonSettings(this, settings)

    this.group = new THREE.Group()
    this.scene.add(this.group)

    // sun + moon sprites
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffe9b0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))
    this.sunSprite.scale.set(26, 26, 1)
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xbfd0ff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))
    this.moonSprite.scale.set(18, 18, 1)
    this.scene.add(this.sunSprite, this.moonSprite)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this._onMove = (e) => this._hover(e)
    this._onClick = (e) => this._click(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('pointermove', this._onMove)
    this.renderer.domElement.addEventListener('click', this._onClick)
    window.addEventListener('resize', this._onResize)

    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
  }

  update(graph) {
    this.graph = graph
    const { districts, waypoints } = ecoLayout(graph.folders, graph.notes, Date.now())
    const diff = diffTown(this._built ? this.districts : null, districts)
    if (diff.rebuild) {
      this.districts = districts
      this.wp = waypoints
      this._buildTown()
      this._respawnNpcs(false)
    } else {
      // note edits only: refresh stats/lighting, keep town + citizens walking
      const old = new Map(this.districts.map((d) => [d.folderId, d]))
      for (const d of districts) d.topH = old.get(d.folderId)?.topH || d.S * 2
      this.districts = districts
      this.wp = waypoints
      for (const c of this.colliders) {
        const nd = districts.find((x) => x.folderId === c.userData.folderId)
        if (nd) c.userData.district = nd
      }
      this._relight() // counts/recency in the labels change even when litBucket doesn't
      this._respawnNpcs(true)
    }
    this._noteDistrict = new Map()
    for (const d of this.districts) {
      for (const id of d.noteIds) this._noteDistrict.set(id, d)
    }
    this.setActive(this.activeIds)
  }

  // ── town construction ─────────────────────────────────────────
  _buildTown() {
    this._clearTown()
    this._built = true
    const rng = mulberry32(4242)

    // ground: the layout drawn as a map
    this.groundTex = this._groundTexture()
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(330, 48),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.9, metalness: 0 })
    )
    this.ground.rotation.x = -Math.PI / 2
    this.group.add(this.ground)

    // buildings: merge all bodies by litBucket + all accents into one geo
    const bodyByBucket = [[], [], []]
    const accents = []
    const blinkPos = []
    const blinkCol = []
    this._ranges = []
    this._chimneys = []
    this._signal = null
    this._trading = null
    const bucketCursor = [0, 0, 0]
    let accCursor = 0

    for (const d of this.districts) {
      const tint = new THREE.Color(d.color).multiplyScalar(0.55)
      const trim = new THREE.Color(d.color).lerp(new THREE.Color(0xe8eef8), 0.55)
      const parts = buildingParts(d.archetype, d.S, rng)
      d.topH = parts.topH

      let bodyCount = 0
      for (const g of parts.body) {
        g.translate(d.cx, 0, d.cz)
        paintGeo(g, tint)
        bodyByBucket[d.litBucket].push(g)
        bodyCount += g.getAttribute('position').count
      }
      let accCount = 0
      for (const g of parts.accent) {
        g.translate(d.cx, 0, d.cz)
        paintGeo(g, trim)
        accents.push(g)
        accCount += g.getAttribute('position').count
      }
      this._ranges.push({
        folderId: d.folderId,
        bucket: d.litBucket,
        bodyStart: bucketCursor[d.litBucket],
        bodyCount,
        accStart: accCursor,
        accCount,
        blinkStart: blinkPos.length / 3,
        blinkCount: parts.blinks.length
      })
      bucketCursor[d.litBucket] += bodyCount
      accCursor += accCount

      for (const b of parts.blinks) {
        blinkPos.push(d.cx + b.x, b.y, d.cz + b.z)
        const bc = new THREE.Color(d.archetype === 'signal' || d.archetype === 'refinery' ? 0xff5a5a : d.color)
        blinkCol.push(bc.r, bc.g, bc.b)
      }
      for (const ch of parts.chimneys) {
        this._chimneys.push({ x: d.cx + ch.x, y: ch.y, z: d.cz + ch.z })
      }
      if (d.archetype === 'signal' && !this._signal) this._signal = d
      if (d.archetype === 'trading' && !this._trading) this._trading = d

      // collider + always-on label
      const col = new THREE.Mesh(UNIT_BOX, new THREE.MeshBasicMaterial({ visible: false }))
      col.scale.set(2.6 * d.S, parts.topH, 2.6 * d.S)
      col.position.set(d.cx, parts.topH / 2, d.cz)
      col.userData = { folderId: d.folderId, district: d, sharedGeo: true }
      this.group.add(col)
      this.colliders.push(col)

      const label = makeLabel2(d.name, `${d.count} notes · ${d.recentCount} recent`, d.color)
      label.position.set(d.cx, parts.topH + 4, d.cz)
      this.group.add(label)
      this.labels.push({ sprite: label, folderId: d.folderId })
    }

    // 3 body draws (one per lit bucket) + 1 accent draw
    this.bodyMeshes = []
    this.bodyMats = []
    const winTex = windowTexture()
    bodyByBucket.forEach((geos, bucket) => {
      if (!geos.length) {
        this.bodyMeshes.push(null)
        this.bodyMats.push(null)
        return
      }
      const merged = mergeGeometries(geos, false)
      geos.forEach((g) => g.dispose())
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: 0xcfe0ff,
        emissiveMap: winTex,
        emissiveIntensity: BUCKET_GLOW[bucket],
        roughness: 0.5,
        metalness: 0.2
      })
      const mesh = new THREE.Mesh(merged, mat)
      mesh.userData.bucket = bucket
      this.group.add(mesh)
      this.bodyMeshes.push(mesh)
      this.bodyMats.push(mat)
      merged.userData.baseColor = merged.getAttribute('color').array.slice()
    })
    if (accents.length) {
      const merged = mergeGeometries(accents, false)
      accents.forEach((g) => g.dispose())
      merged.userData.baseColor = merged.getAttribute('color').array.slice()
      this.accentMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }))
      this.group.add(this.accentMesh)
    }

    // beacons/hazard blinks: one Points
    if (blinkPos.length) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(blinkPos, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(blinkCol, 3))
      geo.userData.baseColor = new Float32Array(blinkCol)
      this.blinks = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 3.2, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
      )
      this.group.add(this.blinks)
    }

    // trading ticker
    if (this._trading) {
      this.tickerTex = tickerTexture()
      this.ticker = new THREE.Mesh(
        new THREE.BoxGeometry(2.7 * this._trading.S, 0.22 * this._trading.S, 0.05),
        new THREE.MeshBasicMaterial({ map: this.tickerTex })
      )
      const t = this._trading
      const len = Math.hypot(t.cx, t.cz) || 1
      this.ticker.position.set(t.cx - (t.cx / len) * 0.78 * t.S, 0.75 * t.S, t.cz - (t.cz / len) * 0.78 * t.S)
      this.ticker.lookAt(0, 0.75 * t.S, 0)
      this.group.add(this.ticker)
    }

    // agent-comms ring on the signal tower when Claude worked today
    if (this._signal) {
      const active = this.graph.notes.some((n) => n.folder === this._signal.folderId && n.mtime && Date.now() - n.mtime < DAY)
      if (active) {
        this.agentRing = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.05, 6, 32),
          new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
        )
        this.agentRing.rotation.x = -Math.PI / 2
        this.agentRing.position.set(this._signal.cx, 0.6, this._signal.cz)
        this.group.add(this.agentRing)
      }
    }

    // NPC instanced mesh
    this.npcMesh = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
      40
    )
    this.npcMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.npcMesh.count = 0
    this.group.add(this.npcMesh)

    this._buildAmbient()
  }

  _groundTexture() {
    const s = 1024
    const c = document.createElement('canvas')
    c.width = c.height = s
    const ctx = c.getContext('2d')
    const px = (v) => (v / 660 + 0.5) * s
    ctx.fillStyle = '#0d1a12'
    ctx.fillRect(0, 0, s, s)
    // mowed rings
    ctx.strokeStyle = 'rgba(160,200,160,0.05)'
    ctx.lineWidth = 10
    for (let r = 60; r < s / 2; r += 60) {
      ctx.beginPath()
      ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    // dirt paths along real waypoint edges
    if (this.wp) {
      ctx.strokeStyle = '#3a3226'
      ctx.lineWidth = 7
      ctx.lineCap = 'round'
      for (const [a, b] of this.wp.edges) {
        ctx.beginPath()
        ctx.moveTo(px(this.wp.nodes[a].x), px(this.wp.nodes[a].z))
        ctx.lineTo(px(this.wp.nodes[b].x), px(this.wp.nodes[b].z))
        ctx.stroke()
      }
    }
    // plaza stone
    ctx.fillStyle = '#2e3440'
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, (14 / 660) * s, 0, Math.PI * 2)
    ctx.fill()
    // district pads tinted by folder color
    for (const d of this.districts) {
      ctx.fillStyle = d.color
      ctx.globalAlpha = 0.12
      ctx.beginPath()
      ctx.arc(px(d.cx), px(d.cz), ((d.S * 1.9) / 660) * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    return new THREE.CanvasTexture(c)
  }

  _buildAmbient() {
    const rng = mulberry32(777)
    // clouds
    {
      const n = 10
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (rng() - 0.5) * 520
        pos[i * 3 + 1] = 90 + rng() * 30
        pos[i * 3 + 2] = (rng() - 0.5) * 420
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      this.clouds = new THREE.Points(geo, new THREE.PointsMaterial({ size: 90, map: cloudTexture(), transparent: true, opacity: 0.4, depthWrite: false, sizeAttenuation: true }))
      this.group.add(this.clouds)
    }
    // birds (positions written per frame)
    {
      const n = 12
      this._birds = []
      for (let i = 0; i < n; i++) {
        this._birds.push({ cx: (rng() - 0.5) * 200, cz: (rng() - 0.5) * 200, r: 60 + rng() * 80, y: 40 + rng() * 30, speed: 0.2 + rng() * 0.25, phase: rng() * Math.PI * 2 })
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      this.birds = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, map: softDot(), color: 0x2a3040, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true }))
      this.group.add(this.birds)
    }
    // fireflies in 3 glades
    {
      const n = 40
      this._flies = []
      for (let i = 0; i < n; i++) {
        const g = i % 3
        const ga = g * 2.1 + 0.7
        this._flies.push({ gx: Math.cos(ga) * 55, gz: Math.sin(ga) * 55, phase: rng() * Math.PI * 2, f: 0.5 + rng() })
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      this.flies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, map: softDot(), color: 0xd8ff9a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }))
      this.group.add(this.flies)
    }
    // chimney smoke
    if (this._chimneys.length) {
      const n = Math.min(12, this._chimneys.length * 3)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      this.smoke = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, map: softDot(), color: 0x8a8f9a, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }))
      this.group.add(this.smoke)
    }
  }

  _relight() {
    // recency shifted a lit bucket: refresh labels + window glow membership is
    // quantized into the merged geos, so just retint labels and glow floors.
    // ponytail: full geometry re-bucketing needs a rebuild; litBucket drift of
    // one district reads fine via label refresh + blink color until then.
    for (const l of this.labels) {
      const d = this.districts.find((x) => x.folderId === l.folderId)
      if (!d) continue
      const old = l.sprite
      const fresh = makeLabel2(d.name, `${d.count} notes · ${d.recentCount} recent`, d.color)
      fresh.position.copy(old.position)
      this.group.add(fresh)
      this.group.remove(old)
      old.material.map?.dispose()
      old.material.dispose()
      l.sprite = fresh
    }
  }

  _respawnNpcs(keepCitizens) {
    if (!this.graph || !this.wp) return
    const fresh = spawnNpcs(this.districts, this.wp, this.graph.notes, this.graph.links.map((l) => ({ source: l.source, target: l.target })), this._dueCount, Date.now())
    if (keepCitizens && this._npcs.length) {
      const citizens = this._npcs.filter((n) => n.role === 'citizen')
      this._npcs = [...fresh.filter((n) => n.role !== 'citizen'), ...citizens].slice(0, 40)
    } else {
      this._npcs = fresh
    }
    // the hovered NPC may have just been replaced — don't strand its tooltip
    if (this.errandNpc && !this._npcs.includes(this.errandNpc)) this._dropErrand()
    if (!this.npcMesh) return
    this.npcMesh.count = this._npcs.length
    this._npcs.forEach((npc, i) => {
      let color
      if (npc.role === 'courier') {
        const dd = this.districts.find((d) => d.folderId === npc.destFolder)
        color = dd ? new THREE.Color(dd.color) : NPC_PALETTE[0]
      } else if (npc.role === 'librarian') color = LIBRARIAN_COLOR
      else if (npc.role === 'wanderer') color = WANDERER_COLOR
      else color = NPC_PALETTE[npc.palette]
      this.npcMesh.setColorAt(i, color)
    })
    if (this.npcMesh.instanceColor) this.npcMesh.instanceColor.needsUpdate = true
  }

  // ── interaction ───────────────────────────────────────────────
  setActive(idSet) {
    this.activeIds = idSet
    if (!this._built) return
    const dim = 0.22
    const activeOf = new Map()
    for (const d of this.districts) {
      activeOf.set(d.folderId, !idSet || d.noteIds.some((id) => idSet.has(id)))
    }
    for (const r of this._ranges) {
      const on = activeOf.get(r.folderId) !== false
      const mesh = this.bodyMeshes?.[r.bucket]
      if (mesh) this._tintRange(mesh.geometry, r.bodyStart, r.bodyCount, on ? 1 : dim)
      if (this.accentMesh) this._tintRange(this.accentMesh.geometry, r.accStart, r.accCount, on ? 1 : dim)
      if (this.blinks) this._tintRange(this.blinks.geometry, r.blinkStart, r.blinkCount, on ? 1 : 0.2)
    }
    for (const l of this.labels) {
      l.sprite.material.opacity = activeOf.get(l.folderId) !== false ? 0.95 : 0.25
    }
  }

  _tintRange(geo, start, count, k) {
    const attr = geo.getAttribute('color')
    const base = geo.userData.baseColor
    if (!attr || !base) return
    for (let i = start * 3; i < (start + count) * 3; i++) attr.array[i] = base[i] * k
    attr.needsUpdate = true
  }

  setLinksMode(showAll) {
    this._ambient = showAll !== false
  }

  setLabels(show) {
    this.labelsVisible = show !== false
    if (!this.labelsVisible && this.errandSprite) this._dropErrand()
  }

  setDue(n) {
    this._dueCount = n || 0
    if (this._built) this._respawnNpcs(true)
  }

  focus(id) {
    const d = this._noteDistrict?.get(id)
    if (d) this._flyToDistrict(d)
  }

  _flyToDistrict(d) {
    // hover above the district looking down its doorstep — street level puts
    // the camera inside neighboring facades
    const len = Math.hypot(d.cx, d.cz) || 1
    const ox = (d.cx / len) * (d.S * 4 + 26)
    const oz = (d.cz / len) * (d.S * 4 + 26)
    this._flight = {
      from: this.camera.position.clone(),
      to: new THREE.Vector3(d.cx + ox, (d.topH || d.S * 2) * 1.6 + 26, d.cz + oz),
      look: new THREE.Vector3(d.cx, (d.topH || d.S * 2) * 0.4, d.cz),
      t: 0
    }
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const list = this.npcMesh ? [this.npcMesh, ...this.colliders] : this.colliders
    return this.raycaster.intersectObjects(list, false)[0]
  }

  _hover(e) {
    if (!this._built) return
    const hit = this._pick(e)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    if (hit && hit.object === this.npcMesh && hit.instanceId < this._npcs.length) {
      const npc = this._npcs[hit.instanceId]
      if (this._hoverNpc !== npc) {
        this._hoverNpc = npc
        this._hoverFolder = null
        this.onHover(null)
        this._showErrand(npc)
      }
      return
    }
    if (this._hoverNpc) {
      this._hoverNpc = null
      this._dropErrand()
    }
    const folderId = hit ? hit.object.userData.folderId : null
    if (folderId !== this._hoverFolder) {
      this._hoverFolder = folderId
      if (!folderId) this.onHover(null)
    }
  }

  _showErrand(npc) {
    this._dropErrand()
    if (!this.labelsVisible) return
    const s = makeLabel(npc.errand.text, '#ffd9a0', 0.045)
    s.position.set(npc.x, 3.4, npc.z)
    this.group.add(s)
    this.errandSprite = s
    this.errandNpc = npc
  }

  _dropErrand() {
    if (!this.errandSprite) return
    this.group.remove(this.errandSprite)
    this.errandSprite.material.map?.dispose()
    this.errandSprite.material.dispose()
    this.errandSprite = null
    this.errandNpc = null
  }

  _click(e) {
    if (!this._built) return
    const hit = this._pick(e)
    if (!hit) return
    if (hit.object === this.npcMesh) {
      if (hit.instanceId < this._npcs.length) {
        const npc = this._npcs[hit.instanceId]
        if (npc.errand.noteId) this.onSelect(npc.errand.noteId)
      }
      return
    }
    const d = hit.object.userData.district
    if (!d) return
    // single click filters the brain to this district; double opens hub note
    if (this._clickTimer && this._clickFolder === d.folderId) {
      clearTimeout(this._clickTimer)
      this._clickTimer = null
      if (d.hubNoteId) this.onSelect(d.hubNoteId)
      return
    }
    clearTimeout(this._clickTimer)
    this._clickFolder = d.folderId
    this._clickTimer = setTimeout(() => {
      this._clickTimer = null
      bus.emit('eco:filter', d.folderId)
      this._flyToDistrict(d)
    }, 240)
  }

  // ── frame loop ────────────────────────────────────────────────
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const rdt = Math.min(0.05, this.clock.getDelta())
    const dt = this.eff ? rdt * this.eff['motion.speed'] : rdt
    this._t += dt

    this._dayNight(rdt)

    // NPCs
    if (this.npcMesh && this._npcs.length) {
      const sc = this._scratch
      for (let i = 0; i < this._npcs.length; i++) {
        const npc = this._npcs[i]
        const hideCitizen = !this._ambient && npc.role === 'citizen'
        const st = advanceNpc(npc, dt, this.wp, npc._rng, this._out)
        sc.position.set(this._out[0], 0.95, this._out[1])
        sc.rotation.set(npc.role === 'courier' ? 0.12 : 0, this._out[2], 0)
        const bob = st === 'walk' ? 1 + Math.sin(this._t * 10 + npc.seed) * 0.05 : 1
        sc.scale.set(1, hideCitizen ? 0.0001 : bob, 1)
        sc.updateMatrix()
        this.npcMesh.setMatrixAt(i, sc.matrix)
      }
      this.npcMesh.instanceMatrix.needsUpdate = true
      if (this.errandSprite && this.errandNpc) {
        this.errandSprite.position.set(this.errandNpc.x, 3.4, this.errandNpc.z)
      }
    }

    // ambient life
    if (this.clouds) {
      const pos = this.clouds.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + dt * (1.5 + (i % 3) * 0.8)
        if (x > 280) x = -280
        pos.setX(i, x)
      }
      pos.needsUpdate = true
      this.clouds.material.opacity = 0.15 + 0.5 * this._dayness
    }
    if (this.birds) {
      const pos = this.birds.geometry.getAttribute('position')
      this._birds.forEach((b, i) => {
        const a = this._t * b.speed + b.phase
        pos.setXYZ(i, b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 2.3) * 4, b.cz + Math.sin(a) * b.r)
      })
      pos.needsUpdate = true
      this.birds.material.opacity = this._dayness * 0.8
    }
    if (this.flies) {
      const pos = this.flies.geometry.getAttribute('position')
      this._flies.forEach((f, i) => {
        const a = this._t * f.f + f.phase
        pos.setXYZ(i, f.gx + Math.sin(a) * 3 + Math.cos(a * 0.7) * 2, 1.5 + Math.sin(a * 1.3), f.gz + Math.cos(a) * 3)
      })
      pos.needsUpdate = true
      this.flies.material.opacity = Math.max(0, this._night - 0.4) * 1.6
    }
    if (this.smoke) {
      this.smoke.visible = this._ambient
      if (this._ambient) {
        const pos = this.smoke.geometry.getAttribute('position')
        for (let i = 0; i < pos.count; i++) {
          const ch = this._chimneys[Math.floor(i / 3)]
          const k = i % 3
          const h = (this._t * 1.2 + k * 2.7) % 8
          pos.setXYZ(i, ch.x + Math.sin(this._t + k) * 0.6, ch.y + h, ch.z)
        }
        pos.needsUpdate = true
      }
    }
    if (this.ticker) this.tickerTex.offset.x -= dt * 0.05
    if (this.agentRing) {
      this.agentRing.visible = this._ambient
      const k = (this._t % 6) / 6
      this.agentRing.scale.setScalar(1 + k * 7)
      this.agentRing.material.opacity = 0.5 * (1 - k)
    }
    if (this.blinks) {
      this.blinks.material.opacity = 0.55 + Math.sin(this._t * 2.4) * 0.35
    }

    // hovered district: project hover card + label bump
    for (const l of this.labels) {
      const bump = l.folderId === this._hoverFolder ? 1.15 : 1
      if (l._bump !== bump) {
        l._bump = bump
        const m = l.sprite.material.map
        if (m) l.sprite.scale.set(m.image.width * 0.045 * bump, m.image.height * 0.045 * bump, 1)
      }
    }
    if (this._hoverFolder) {
      const d = this.districts.find((x) => x.folderId === this._hoverFolder)
      if (d && d.hubNoteId) {
        const w = this.container.clientWidth || 1400
        const h = this.container.clientHeight || 800
        _tmp.set(d.cx, d.topH || 10, d.cz).project(this.camera)
        this.onHover({ id: d.hubNoteId, x: (_tmp.x * 0.5 + 0.5) * w, y: (-_tmp.y * 0.5 + 0.5) * h, pinned: false })
      }
    }

    if (this._flight) {
      this._flight.t = Math.min(1, this._flight.t + 0.02)
      const k = this._flight.t * (2 - this._flight.t)
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) this._flight = null
    }

    this.controls.update()
    if (this.grade) this.grade.uniforms.time.value = this._t
    this.composer.render()
  }

  _dayNight(rdt) {
    this._clockT += rdt
    if (this._clockT >= 5) {
      this._clockT = 0
      const d = new Date()
      this._hours = d.getHours() + d.getMinutes() / 60
    } else {
      this._hours += rdt / 3600
    }
    const el = Math.sin(((this._hours - 6) / 12) * Math.PI)
    const dayness = clamp01(el * 1.6)
    const night = 1 - dayness
    this._dayness = dayness
    this._night = night

    const az = ((this._hours - 6) / 12) * Math.PI
    const sy = Math.max(0.05, el)
    this.sun.position.set(Math.cos(az) * 300, sy * 300, Math.sin(az) * 120 + 60)
    if (el > 0.35) _col.copy(C_HORIZON).lerp(C_NOON, (el - 0.35) / 0.65)
    else if (el > 0) _col.copy(C_NIGHTSUN).lerp(C_HORIZON, el / 0.35)
    else _col.copy(C_NIGHTSUN)
    this.sun.color.copy(_col)
    this.sun.intensity = 0.15 + 1.05 * dayness
    this.ambientLight.intensity = 0.5 + 0.6 * dayness
    this.scene.fog.color.copy(C_FOG_NIGHT).lerp(C_FOG_DAY, dayness)

    this.sunSprite.position.copy(this.sun.position).multiplyScalar(1.2)
    this.sunSprite.material.opacity = 0.25 + dayness * 0.75
    this.moonSprite.position.copy(this.sun.position).multiplyScalar(-1.2).setY(Math.max(40, -this.sun.position.y * 1.2))
    this.moonSprite.material.opacity = night

    for (const layer of this.stars.children) {
      layer.material.opacity = night * 0.9
    }
    if (this.bodyMats) {
      this.bodyMats.forEach((m, b) => {
        if (m) m.emissiveIntensity = BUCKET_GLOW[b] * (0.06 + 0.94 * night)
      })
    }
  }

  // ── teardown ──────────────────────────────────────────────────
  _clearTown() {
    this._dropErrand()
    // softDot/cloud/window textures are module-cached and shared app-wide —
    // disposing them here would blank every other lens's sprites
    const sharedTex = new Set([softDot(), cloudTexture(), windowTexture()])
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child.isInstancedMesh) child.dispose()
      const map = child.material?.map
      if (map && !sharedTex.has(map)) map.dispose()
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    if (this.groundTex) {
      this.groundTex.dispose()
      this.groundTex = null
    }
    if (this.tickerTex) {
      this.tickerTex.dispose()
      this.tickerTex = null
    }
    this.labels = []
    this.colliders = []
    this.bodyMeshes = null
    this.bodyMats = null
    this.accentMesh = null
    this.blinks = null
    this.ticker = null
    this.agentRing = null
    this.npcMesh = null
    this.clouds = null
    this.birds = null
    this.flies = null
    this.smoke = null
    this._chimneys = []
    this._hoverFolder = null
    this._hoverNpc = null
    this._built = false
  }

  _clear() {
    this._clearTown()
  }

  _resize() {
    const w = this.container.clientWidth || 1400
    const h = this.container.clientHeight || 800
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  setSettings(s) {
    this.settings = s
    applyCommonSettings(this, s)
  }

  setPaused(p) {
    this.paused = !!p
    if (this.paused) {
      cancelAnimationFrame(this._raf)
      this._raf = null
    } else if (!this._raf) {
      this.clock.getDelta()
      this._clockT = 5 // re-read the wall clock now — hours drifted during the pause
      this._loop()
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    clearTimeout(this._clickTimer)
    this.renderer.domElement.removeEventListener('pointermove', this._onMove)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    window.removeEventListener('resize', this._onResize)
    this._clearTown()
    this.sunSprite.material.dispose()
    this.moonSprite.material.dispose()
    this.controls.dispose()
    this.envTex?.dispose()
    this.cineDispose?.()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
