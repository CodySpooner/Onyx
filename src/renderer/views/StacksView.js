import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer } from '../lib/cinema.js'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, LinkPulses, animateOrbs } from '../lib/scenery.js'
import { shelfLayout, SHELF } from '../lib/layouts.mjs'

// Stacks — the library hall. Every folder a glass column, every note a
// labeled row readable at rest. Zero occlusion by construction: the layout
// is a 2D grid bent into a shallow arc. Ambient links are OFF; hovering a
// note makes its references leap across the hall as golden arcs.
export class StacksView {
  constructor(container, { onSelect, onHover }) {
    this.container = container
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.activeIds = null
    this.hoverId = null
    this.pinned = false
    this._t = 0
    this._clickTimer = null

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.0016)
    this.scene.add(makeNebula('#101b3a', '#131040'))
    this.scene.add(makeStarfield(600))
    addLights(this.scene)

    const grid = new THREE.GridHelper(1200, 60, 0x24304f, 0x141b30)
    grid.position.y = -6
    this.scene.add(grid)

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 3000)
    this.camera.position.set(0, 8, 330)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    // hall camera: pan + dolly, no orbiting into spaghetti
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.enablePan = true
    this.controls.minPolarAngle = Math.PI / 2.15
    this.controls.maxPolarAngle = Math.PI / 2.15
    this.controls.minAzimuthAngle = -0.35
    this.controls.maxAzimuthAngle = 0.35
    this.controls.minDistance = 120
    this.controls.maxDistance = 620

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.5, 0.4, 0.3] })
    this.composer = cine.composer
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this._onMove = (e) => this._hover(e)
    this._onClick = (e) => this._click(e)
    this._onDbl = (e) => this._dblclick(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('pointermove', this._onMove)
    this.renderer.domElement.addEventListener('click', this._onClick)
    this.renderer.domElement.addEventListener('dblclick', this._onDbl)
    window.addEventListener('resize', this._onResize)

    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
  }

  update(graph) {
    this.graph = graph
    this._clear()
    const { pos, columns } = shelfLayout(graph.folders, graph.notes)
    const folderById = new Map(graph.folders.map((f) => [f.id, f]))

    graph.notes.forEach((note) => {
      const p = pos.get(note.id)
      if (!p) return
      const orb = makeOrb(folderById.get(note.folder)?.color || '#6ea8ff', 0.9, note.type, note.id)
      orb.mesh.position.set(p.x, p.y, p.z)
      this.group.add(orb.mesh)
      const rec = { ...orb, id: note.id, baseSize: 0.9, active: true }
      this.nodes.push(rec)
      this.byId.set(note.id, rec)

      const label = makeLabel(note.title, '#e8eeff', 0.05)
      label.center.set(0, 0.5) // left-anchor: rows read like a list
      label.position.set(p.x + 1.6, p.y, p.z + 0.01)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id })
    })

    // glass slabs + folder headers per column
    for (const col of columns) {
      const f = folderById.get(col.folderId)
      const rows = Math.min(col.count, SHELF.MAX_ROWS)
      const height = rows * SHELF.ROW_H + 6
      const slabW = SHELF.COL_W - 10 + (col.lanes - 1) * SHELF.LANE_W
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slabW, height, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.05, depthWrite: false })
      )
      slab.position.set(col.x, SHELF.TOP_Y - ((rows - 1) * SHELF.ROW_H) / 2, col.z - 1.4)
      this.group.add(slab)

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(slab.geometry),
        new THREE.LineBasicMaterial({ color: new THREE.Color(f?.color || '#4a5aa0'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      edges.position.copy(slab.position)
      this.group.add(edges)

      const header = makeLabel(f?.name || col.folderId, f?.color || '#dfe7ff', 0.07)
      header.position.set(col.x, SHELF.TOP_Y + 8, col.z)
      this.group.add(header)
      this.labels.push({ sprite: header, id: null, fixed: true })
    }

    // hover arc scaffolding (rebuilt on hover change; ambient hall stays clean)
    this.linkIndex = new Map() // id → [otherId]
    for (const l of graph.links) {
      if (!this.linkIndex.has(l.source)) this.linkIndex.set(l.source, [])
      if (!this.linkIndex.has(l.target)) this.linkIndex.set(l.target, [])
      this.linkIndex.get(l.source).push(l.target)
      this.linkIndex.get(l.target).push(l.source)
    }
    this.arcGeo = new THREE.BufferGeometry()
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.arcs = new THREE.LineSegments(
      this.arcGeo,
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.arcs)

    this.setActive(this.activeIds)
  }

  _rebuildArcs() {
    if (!this.arcGeo) return
    if (this.arcPulses) {
      this.group.remove(this.arcPulses.points)
      this.arcPulses.dispose()
      this.arcPulses = null
    }
    const id = this.hoverId
    const segs = []
    if (id) {
      const from = this.byId.get(id)
      for (const other of this.linkIndex.get(id) || []) {
        const to = this.byId.get(other)
        if (!from || !to) continue
        const a = from.mesh.position
        const b = to.mesh.position
        const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + 6, Math.max(a.z, b.z) + 25)
        const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone())
        const pts = curve.getPoints(12)
        for (let i = 0; i < pts.length - 1; i++) {
          segs.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z)
        }
      }
    }
    const arr = new Float32Array(segs)
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    this.arcGeo.attributes.position.needsUpdate = true
    if (segs.length) this.arcPulses = new LinkPulses(this.group, arr, 0xffe3a3, 8)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const n of this.nodes) {
      const on = !idSet || idSet.has(n.id)
      n.active = on
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : 0.12
      n.mesh.material.emissiveIntensity = on ? 0.9 : 0.25
    }
  }

  setLinksMode() {
    // ambient links are intentionally absent — the hall stays readable
  }

  setLabels() {
    // labels ARE this view; the global toggle doesn't blank the library
  }

  focus(id) {
    const rec = this.byId.get(id)
    if (rec) {
      const t = rec.mesh.position
      this._flight = {
        from: this.camera.position.clone(),
        to: new THREE.Vector3(t.x, t.y, t.z + 130),
        look: new THREE.Vector3(t.x, t.y, t.z),
        t: 0
      }
    }
  }

  _setHover(id) {
    if (id === this.hoverId) return
    this.hoverId = id
    this._rebuildArcs()
    if (!id && !this.pinned) this.onHover(null)
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh))[0]
  }

  _hover(e) {
    const hit = this._pick(e)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    if (!this.pinned) this._setHover(hit ? hit.object.userData.id : null)
  }

  _click(e) {
    const hit = this._pick(e)
    clearTimeout(this._clickTimer)
    if (!hit) {
      this.pinned = false
      this._setHover(null)
      this.onHover(null)
      return
    }
    const id = hit.object.userData.id
    this._clickTimer = setTimeout(() => {
      this.pinned = true
      this._setHover(id)
    }, 240)
  }

  _dblclick(e) {
    clearTimeout(this._clickTimer)
    const hit = this._pick(e)
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt
    animateOrbs(this.nodes, this._t, dt)
    if (this.arcPulses) this.arcPulses.update(dt)

    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      let o = l.fixed ? 0.95 : Math.min(0.95, 1 - (d - 320) / 300)
      if (l.id && this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      if (o < 0.06) {
        l.sprite.visible = false
        continue
      }
      l.sprite.visible = true
      l.sprite.material.opacity = o
    }

    if (this._flight) {
      this._flight.t = Math.min(1, this._flight.t + 0.02)
      const k = this._flight.t * (2 - this._flight.t)
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) this._flight = null
    }

    if (this.hoverId) {
      const rec = this.byId.get(this.hoverId)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const h = this.container.clientHeight || 800
        tmp.copy(rec.mesh.position).project(this.camera)
        this.onHover({ id: this.hoverId, x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, pinned: this.pinned })
      }
    }

    this.controls.update()
    if (this.grade) this.grade.uniforms.time.value = this._t
    this.composer.render()
  }

  _clear() {
    if (this.arcPulses) {
      this.arcPulses.dispose()
      this.arcPulses = null
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.arcs = null
    this.arcGeo = null
    this.hoverId = null
    this.pinned = false
  }

  _resize() {
    const w = this.container.clientWidth || 1400
    const h = this.container.clientHeight || 800
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  setPaused(p) {
    this.paused = !!p
    if (this.paused) {
      cancelAnimationFrame(this._raf)
      this._raf = null
    } else if (!this._raf) {
      this.clock.getDelta() // eat the pause gap so dt doesn't jump
      this._loop()
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    this.renderer.domElement.removeEventListener('pointermove', this._onMove)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    this.renderer.domElement.removeEventListener('dblclick', this._onDbl)
    window.removeEventListener('resize', this._onResize)
    clearTimeout(this._clickTimer)
    this._clear()
    this.controls.dispose()
    this.envTex?.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
