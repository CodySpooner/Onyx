import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { makeLabel } from '../lib/label.js'
import { softDot } from '../lib/scenery.js'
import { createSim } from '../lib/force.mjs'
import { detectClusters } from '../lib/clusters.mjs'
import { effective } from '../lib/graph-settings.mjs'

// bioluminescent palette — mossy greens, teal, amber (deliberately not the
// sci-fi blues of the other lenses)
const SPORE = ['#7fe0b0', '#a8e063', '#d6e05a', '#ffd166', '#63d4b0', '#8fd46a']
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
// unit sphere reused across rebuilds (truly shared → never disposed)
const CORE_GEO = new THREE.SphereGeometry(1, 12, 12)

// Mycelium — the vault as a living root/fungal web. Notes glow where tendrils
// meet, links grow as filaments, clusters breathe as separate root systems in
// the dark soil. Organic and alive, the anti-geometric graph.
export class MyceliumView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.activeIds = null
    this.hoverId = null
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x070905)
    this.scene.fog = new THREE.FogExp2(0x070905, 0.0034)

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 3000)
    this.camera.position.set(0, 30, 240)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 520

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.8, 0.4, 0.5] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex
    this.scene.add(new THREE.AmbientLight(0x2a3a24, 0.8))
    applyCommonSettings(this, settings)

    this.group = new THREE.Group()
    this.scene.add(this.group)

    // drifting spores
    const SP = 220
    const sp = new Float32Array(SP * 3)
    for (let i = 0; i < SP; i++) {
      sp[i * 3] = (Math.sin(i * 12.9) * 0.5 + Math.sin(i)) * 160
      sp[i * 3 + 1] = ((i % 40) / 40 - 0.5) * 200
      sp[i * 3 + 2] = (Math.cos(i * 7.7) * 0.5 + Math.cos(i)) * 160
    }
    const spg = new THREE.BufferGeometry()
    spg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    this.spores = new THREE.Points(spg, new THREE.PointsMaterial({ size: 1.5, map: softDot(), color: 0xa8e063, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }))
    this.group.add(this.spores)

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
    const eff = effective(this.settings)
    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    this.sim = createSim(ids, graph.links, { repulsion: eff['physics.repulsion'] * 1.1, restLen: 30, maxRadius: 175 })
    this.sim.tick(300)

    for (const n of graph.notes) {
      const sn = this.sim.byId.get(n.id)
      const ci = clusterOf.get(n.id)
      const hex = ci >= 0 ? SPORE[ci % SPORE.length] : '#5a6b4a'
      const col = new THREE.Color(hex)
      const deg = (n.outLinks?.length || 0) + (n.inLinks?.length || 0)
      const size = clamp(0.8 + deg * 0.16, 0.8, 3.4)
      const core = new THREE.Mesh(CORE_GEO, new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.4), emissive: col, emissiveIntensity: 1.2, roughness: 0.5 }))
      core.scale.setScalar(size)
      core.position.set(sn.x, sn.y, sn.z)
      core.userData = { id: n.id, sharedGeo: true }
      this.group.add(core)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: col, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }))
      halo.scale.setScalar(size * 4.5)
      halo.position.copy(core.position)
      this.group.add(halo)
      const rec = { id: n.id, core, halo, sn, size, base: size, phase: Math.sin(sn.x) * 6, active: true, col }
      this.nodes.push(rec)
      this.byId.set(n.id, rec)

      const label = makeLabel(n.title, '#cfe8b8', 0.03)
      this.group.add(label)
      this.labels.push({ sprite: label, id: n.id, rec })
    }

    // filaments: curved tendrils bowed off-axis, one merged additive buffer
    this.linkPairs = []
    for (const l of graph.links) {
      const a = this.byId.get(l.source)
      const b = this.byId.get(l.target)
      if (a && b) this.linkPairs.push([a, b])
    }
    this._segPerLink = 6
    this.filGeo = new THREE.BufferGeometry()
    this.filArr = new Float32Array(this.linkPairs.length * this._segPerLink * 2 * 3)
    this.filGeo.setAttribute('position', new THREE.BufferAttribute(this.filArr, 3))
    this.lines = new THREE.LineSegments(this.filGeo, new THREE.LineBasicMaterial({ color: 0x7fe0a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.group.add(this.lines)

    this.setActive(this.activeIds)
    this._rebuildFilaments()
  }

  _rebuildFilaments() {
    const seg = this._segPerLink
    const tmp = new THREE.Vector3()
    const ctrl = new THREE.Vector3()
    let o = 0
    for (const [a, b] of this.linkPairs) {
      const ax = a.core.position, bx = b.core.position
      // bow the tendril: control point offset perpendicular-ish + downward sag
      ctrl.set((ax.x + bx.x) / 2 + Math.sin(this._t * 0.4 + a.phase) * 6, (ax.y + bx.y) / 2 - 5, (ax.z + bx.z) / 2 + Math.cos(this._t * 0.4 + b.phase) * 6)
      let prev = null
      for (let s = 0; s <= seg; s++) {
        const t = s / seg
        // quadratic bezier
        const mt = 1 - t
        tmp.set(
          mt * mt * ax.x + 2 * mt * t * ctrl.x + t * t * bx.x,
          mt * mt * ax.y + 2 * mt * t * ctrl.y + t * t * bx.y,
          mt * mt * ax.z + 2 * mt * t * ctrl.z + t * t * bx.z
        )
        if (prev) {
          this.filArr[o++] = prev.x; this.filArr[o++] = prev.y; this.filArr[o++] = prev.z
          this.filArr[o++] = tmp.x; this.filArr[o++] = tmp.y; this.filArr[o++] = tmp.z
        }
        prev = prev || new THREE.Vector3()
        prev.copy(tmp)
      }
    }
    this.filGeo.attributes.position.needsUpdate = true
  }

  setActive(idSet) {
    this.activeIds = idSet
    this._applyDim()
  }

  _applyDim() {
    const path = this.pathSet
    for (const n of this.nodes) {
      const on = path ? path.has(n.id) : !this.activeIds || this.activeIds.has(n.id)
      n.active = on
      n.core.material.emissiveIntensity = on ? 1.2 : 0.25
      n.halo.material.opacity = on ? 0.75 : path ? 0.04 : 0.15
    }
  }

  setLinksMode(showAll) {
    if (this.lines) this.lines.visible = showAll !== false
  }

  setLabels(show) {
    this.labelsVisible = show
  }

  focus(id) {
    const rec = this.byId.get(id)
    if (rec) {
      const p = rec.core.position
      this._flight = { from: this.camera.position.clone(), to: new THREE.Vector3(p.x, p.y + 10, p.z + 46), look: p.clone(), t: 0 }
    }
  }

  setPath(ids) {
    this.pathSet = Array.isArray(ids) && ids.length ? new Set(ids) : null
    this._applyDim()
    if (this.pathSet) {
      const pts = ids.map((id) => this.byId.get(id)?.core.position).filter(Boolean)
      if (pts.length) {
        const c = new THREE.Vector3()
        pts.forEach((p) => c.add(p))
        c.multiplyScalar(1 / pts.length)
        let r = 0
        pts.forEach((p) => (r = Math.max(r, p.distanceTo(c))))
        this._flight = { from: this.camera.position.clone(), to: new THREE.Vector3(c.x, c.y + r, c.z + r * 2.2 + 50), look: c.clone(), t: 0 }
      }
    }
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.nodes.map((n) => n.core))[0]
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

    if (this.sim) this.sim.tick(1)
    for (const n of this.nodes) {
      n.core.position.set(n.sn.x, n.sn.y, n.sn.z)
      n.halo.position.copy(n.core.position)
      const pulse = 1 + Math.sin(this._t * 1.4 + n.phase) * 0.12
      const hv = n.id === this.hoverId ? 1.5 : 1
      n.halo.scale.setScalar(n.size * 4.5 * pulse * hv)
      n.core.scale.setScalar(n.size * (n.active ? 1 : 0.6))
    }
    if (this.linkPairs && this.linkPairs.length) this._rebuildFilaments()

    // spores drift up + wrap
    const sp = this.spores.geometry.attributes.position
    for (let i = 0; i < sp.count; i++) {
      let y = sp.getY(i) + dt * (3 + (i % 5))
      if (y > 110) y = -110
      sp.setY(i, y)
    }
    sp.needsUpdate = true
    this.spores.material.opacity = 0.35 + Math.sin(this._t * 0.8) * 0.12

    // labels: only near the camera, or hovered
    for (const l of this.labels) {
      l.sprite.position.set(l.rec.core.position.x, l.rec.core.position.y + l.rec.size + 2, l.rec.core.position.z)
      const d = this.camera.position.distanceTo(l.sprite.position)
      l.sprite.visible = this.labelsVisible === false ? l.id === this.hoverId : d < 150
    }
    if (this.hoverId) {
      const rec = this.byId.get(this.hoverId)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const hh = this.container.clientHeight || 800
        const v = rec.core.position.clone().project(this.camera)
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
    // maps here are the shared softDot() halo + the makeLabel cache — never
    // dispose them or other lenses' sprites/labels go blank
    for (const child of [...this.group.children]) {
      if (child === this.spores) continue // spores persist across graph updates
      this.group.remove(child)
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.linkPairs = []
    this.lines = null
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
    this.spores?.geometry.dispose()
    this.spores?.material.dispose()
    this.controls.dispose()
    this.envTex?.dispose()
    this.cineDispose?.()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) this.container.removeChild(this.renderer.domElement)
  }
}
