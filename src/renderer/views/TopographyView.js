import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { makeLabel } from '../lib/label.js'
import { softDot } from '../lib/scenery.js'
import { createSim } from '../lib/force.mjs'
import { detectClusters, CLUSTER_PALETTE } from '../lib/clusters.mjs'

const N = 128 // terrain grid resolution
const SPAN = 320 // world size of the terrain plane
const HEIGHT = 60 // max elevation
const CONTOUR = 6 // elevation units between contour lines
// beacon cone reused across rebuilds (truly shared → never disposed)
const MARK_GEO = new THREE.ConeGeometry(1.5, 5, 6)

const _cA = new THREE.Color()
const _cB = new THREE.Color()
// water → grass → olive → rock → snow
const RAMP = [
  [0.0, 0x123024], [0.12, 0x1f4a33], [0.32, 0x3f6b3a], [0.55, 0x7d7a44], [0.75, 0x8a6a49], [0.9, 0xa8977f], [1.0, 0xeef2f6]
]
function elevColor(t, out) {
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const k = (t - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0] || 1)
      _cA.setHex(RAMP[i - 1][1])
      _cB.setHex(RAMP[i][1])
      return out.copy(_cA).lerp(_cB, k)
    }
  }
  return out.setHex(RAMP[RAMP.length - 1][1])
}

// Topography — the vault as a relief map. Dense clusters swell into mountains,
// orphans lie on the plains, contour lines band the elevation. Fly over it;
// height = how connected a region is.
export class TopographyView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.markers = []
    this.byId = new Map()
    this.labels = []
    this.activeIds = null
    this.hoverId = null
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0b1017)
    this.scene.fog = new THREE.FogExp2(0x0b1017, 0.0022)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 4000)
    this.camera.position.set(0, 190, 250)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = 1.35
    this.controls.maxDistance = 640

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.3, 0.75, 0.7] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex
    this.scene.add(new THREE.HemisphereLight(0xbcd0e8, 0x20301f, 1.0))
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.15)
    this.sun.position.set(-160, 220, 120)
    this.scene.add(this.sun)
    applyCommonSettings(this, settings)

    this.group = new THREE.Group()
    this.scene.add(this.group)

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
    this._clear()
    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    const sim = createSim(ids, graph.links, { repulsion: 1200, restLen: 26, maxRadius: 130 })
    sim.tick(320)

    // scale sim positions into the terrain footprint
    let ex = 0
    for (const n of graph.notes) {
      const s = sim.byId.get(n.id)
      ex = Math.max(ex, Math.abs(s.x), Math.abs(s.z))
    }
    const scale = (SPAN * 0.42) / (ex || 1)
    const deg = (n) => (n.outLinks?.length || 0) + (n.inLinks?.length || 0)

    // heightmap: each note stamps a Gaussian hill scaled by its degree
    const H = new Float32Array(N * N)
    const sigma = N * 0.05
    const s2 = 2 * sigma * sigma
    const rad = Math.ceil(sigma * 3)
    const notePos = []
    for (const n of graph.notes) {
      const s = sim.byId.get(n.id)
      const wx = s.x * scale
      const wz = s.z * scale
      notePos.push({ n, wx, wz })
      const gi = Math.round(((wx + SPAN / 2) / SPAN) * (N - 1))
      const gj = Math.round(((wz + SPAN / 2) / SPAN) * (N - 1))
      const amp = 0.35 + Math.sqrt(deg(n)) * 0.5
      for (let dj = -rad; dj <= rad; dj++) {
        for (let di = -rad; di <= rad; di++) {
          const i = gi + di
          const j = gj + dj
          if (i < 0 || i >= N || j < 0 || j >= N) continue
          H[j * N + i] += amp * Math.exp(-(di * di + dj * dj) / s2)
        }
      }
    }
    let hmax = 0
    for (let k = 0; k < H.length; k++) hmax = Math.max(hmax, H[k])
    hmax = hmax || 1

    // build the terrain mesh (y = elevation) with contour-banded vertex colors
    const verts = new Float32Array(N * N * 3)
    const cols = new Float32Array(N * N * 3)
    const col = new THREE.Color()
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const t = H[idx] / hmax
        const x = (i / (N - 1) - 0.5) * SPAN
        const z = (j / (N - 1) - 0.5) * SPAN
        const y = t * HEIGHT
        verts[idx * 3] = x
        verts[idx * 3 + 1] = y
        verts[idx * 3 + 2] = z
        elevColor(t, col)
        // contour banding: darken vertices near a contour elevation
        const band = (y % CONTOUR) / CONTOUR
        if (band < 0.12 && t > 0.06) col.multiplyScalar(0.62)
        cols[idx * 3] = col.r
        cols[idx * 3 + 1] = col.g
        cols[idx * 3 + 2] = col.b
      }
    }
    const idxArr = []
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i
        const b = j * N + i + 1
        const c = (j + 1) * N + i
        const d = (j + 1) * N + i + 1
        idxArr.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    geo.setIndex(idxArr)
    geo.computeVertexNormals()
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, flatShading: false }))
    this.group.add(this.terrain)

    // sample terrain height at a world x,z (bilinear) so markers sit on it
    const sample = (wx, wz) => {
      const fi = ((wx + SPAN / 2) / SPAN) * (N - 1)
      const fj = ((wz + SPAN / 2) / SPAN) * (N - 1)
      const i = Math.max(0, Math.min(N - 2, Math.floor(fi)))
      const j = Math.max(0, Math.min(N - 2, Math.floor(fj)))
      const u = fi - i
      const v = fj - j
      const h00 = H[j * N + i], h10 = H[j * N + i + 1], h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1]
      return ((h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v) / hmax * HEIGHT
    }

    // note markers: little glowing beacons planted on the surface
    for (const { n, wx, wz } of notePos) {
      const y = sample(wx, wz)
      const ci = clusterOf.get(n.id)
      const hex = ci >= 0 ? CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length] : 0x8fa0b8
      const c = new THREE.Color(hex)
      const mk = new THREE.Mesh(MARK_GEO, new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), emissive: c, emissiveIntensity: 0.9 }))
      mk.position.set(wx, y + 2.5, wz)
      mk.userData = { id: n.id, sharedGeo: true }
      this.group.add(mk)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: c, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }))
      glow.scale.setScalar(6)
      glow.position.set(wx, y + 5, wz)
      this.group.add(glow)
      this.markers.push({ id: n.id, mk, glow, x: wx, y, z: wz, active: true, deg: deg(n) })
      this.byId.set(n.id, { x: wx, y, z: wz })

      if (deg(n) >= 6) {
        const label = makeLabel(n.title, '#eaf0f6', 0.032)
        label.position.set(wx, y + 12, wz)
        this.group.add(label)
        this.labels.push({ sprite: label, id: n.id })
      }
    }

    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const m of this.markers) {
      const on = !idSet || idSet.has(m.id)
      m.active = on
      m.mk.material.emissiveIntensity = on ? 0.9 : 0.2
      m.glow.material.opacity = on ? 0.7 : (this.pathSet ? 0.04 : 0.15)
    }
  }

  setLinksMode() { /* terrain has no link layer */ }

  setLabels(show) {
    this.labelsVisible = show
  }

  focus(id) {
    const p = this.byId.get(id)
    if (p) this._flight = { from: this.camera.position.clone(), to: new THREE.Vector3(p.x, p.y + 60, p.z + 80), look: new THREE.Vector3(p.x, p.y, p.z), t: 0 }
  }

  setPath(ids) {
    this.pathSet = Array.isArray(ids) && ids.length ? new Set(ids) : null
    this.setActive(this.activeIds)
    if (this.pathSet) {
      for (const m of this.markers) {
        const on = this.pathSet.has(m.id)
        m.mk.material.emissiveIntensity = on ? 1.4 : 0.12
        m.glow.material.opacity = on ? 0.9 : 0.03
      }
    }
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.markers.map((m) => m.mk))[0]
  }

  _hover(e) {
    const hit = this._pick(e)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    const id = hit ? hit.object.userData.id : null
    if (id !== this.hoverId) {
      this.hoverId = id
      if (!id) this.onHover(null)
    }
  }

  _click(e) {
    const hit = this._pick(e)
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    let dt = Math.min(0.05, this.clock.getDelta())
    if (this.eff) dt *= this.eff['motion.speed']
    this._t += dt
    for (const m of this.markers) {
      const k = m.id === this.hoverId ? 1.6 + Math.sin(this._t * 6) * 0.15 : 1
      m.glow.scale.setScalar(6 * k)
    }
    for (const l of this.labels) {
      const d = this.camera.position.distanceTo(l.sprite.position)
      l.sprite.visible = this.labelsVisible === false ? l.id === this.hoverId : d < 340
    }
    if (this.hoverId) {
      const p = this.byId.get(this.hoverId)
      if (p) {
        const w = this.container.clientWidth || 1400
        const hh = this.container.clientHeight || 800
        const v = new THREE.Vector3(p.x, p.y + 6, p.z).project(this.camera)
        this.onHover({ id: this.hoverId, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * hh, pinned: false })
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
      this._loop()
    }
  }

  _clear() {
    // maps are the shared softDot() glow + makeLabel cache — never dispose them
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.terrain = null
    this.markers = []
    this.byId = new Map()
    this.labels = []
    this.hoverId = null
  }

  _resize() {
    const w = this.container.clientWidth || 1400
    const h = this.container.clientHeight || 800
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    this.renderer.domElement.removeEventListener('pointermove', this._onMove)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    window.removeEventListener('resize', this._onResize)
    this._clear()
    this.controls.dispose()
    this.envTex?.dispose()
    this.cineDispose?.()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) this.container.removeChild(this.renderer.domElement)
  }
}
