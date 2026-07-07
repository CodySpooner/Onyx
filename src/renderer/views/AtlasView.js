import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { detectClusters, CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, LinkPulses, animateOrbs, softDot } from '../lib/scenery.js'
import { archipelagoLayout } from '../lib/layouts.mjs'
import { paletteFor } from '../lib/graph-settings.mjs'

const ORPHAN_COLOR = '#4a5470'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Atlas — Google Maps for the vault. 17 cluster islands in a dark ocean,
// wide gulfs between them, idea-pulses ferrying along elevated arcs.
// Pan the map, read every place-name at rest.
export class AtlasView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.discs = []
    this.activeIds = null
    this.hoverId = null
    this.pinned = false
    this._t = 0
    this._clickTimer = null

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.0005)
    const nebula = makeNebula('#0d2038', '#161042')
    nebula.scale.setScalar(2.5) // the map sprawls past the stock 600u backdrop
    this.scene.add(nebula)
    this.scene.add(makeStarfield(900))
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 6000)
    this.camera.position.set(0, 760, 520)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.enablePan = true
    this.controls.maxPolarAngle = Math.PI / 2.4 // stays a map, never goes under the sea
    this.controls.maxDistance = 1800

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.65, 0.5, 0.3] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex
    applyCommonSettings(this, settings)

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

    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    const noteById = new Map(graph.notes.map((n) => [n.id, n]))
    const degOf = new Map(graph.notes.map((n) => [n.id, n.outLinks.length + n.inLinks.length]))
    const { pos, islands } = archipelagoLayout(ids, clusterOf, degOf)
    this.islands = islands

    // bioluminescent island discs
    for (const isl of islands) {
      const color = paletteFor(this.settings).clusters[isl.ci % 12]
      const disc = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color(color), transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending })
      )
      disc.material.opacity = 0.16
      disc.position.set(isl.cx, 0.5, isl.cz)
      disc.scale.set(isl.R * 2.4, isl.R * 2.4, 1)
      disc.userData = { islandCi: isl.ci }
      this.group.add(disc)
      this.discs.push({ sprite: disc, isl })

      // place-name: the island's hub note names the territory
      const hub = noteById.get(isl.hubId)
      const name = makeLabel(hub ? hub.title : `cluster ${isl.ci}`, color, 0.13)
      name.position.set(isl.cx, 16, isl.cz)
      this.group.add(name)
      this.labels.push({ sprite: name, id: null, fixed: true })
    }

    graph.notes.forEach((note) => {
      const p = pos.get(note.id)
      if (!p) return
      const ci = clusterOf.get(note.id)
      const colorHex = ci >= 0 ? paletteFor(this.settings).clusters[ci % 12] : ORPHAN_COLOR
      const deg = degOf.get(note.id)
      const size = clamp(0.55 + deg * 0.11, 0.55, 2.4)
      const orb = makeOrb(colorHex, size, note.type, note.id)
      orb.mesh.position.set(p.x, p.y, p.z)
      this.group.add(orb.mesh)
      const rec = { ...orb, id: note.id, baseSize: size, active: true, cluster: ci }
      this.nodes.push(rec)
      this.byId.set(note.id, rec)

      const label = makeLabel(note.title, '#eef2ff', 0.032)
      label.position.set(p.x, p.y + size + 1.6, p.z)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id })
    })

    // links: intra-island stay flat and faint; inter-island fly as arcs
    const flat = []
    const arcSegs = []
    for (const l of graph.links) {
      const a = this.byId.get(l.source)
      const b = this.byId.get(l.target)
      if (!a || !b) continue
      const pa = a.mesh.position
      const pb = b.mesh.position
      if (a.cluster === b.cluster) {
        flat.push(pa.x, 0.3, pa.z, pb.x, 0.3, pb.z)
      } else {
        const dist = Math.hypot(pb.x - pa.x, pb.z - pa.z)
        const mid = new THREE.Vector3((pa.x + pb.x) / 2, 12 + 0.05 * dist, (pa.z + pb.z) / 2)
        const curve = new THREE.QuadraticBezierCurve3(pa.clone(), mid, pb.clone())
        const pts = curve.getPoints(12)
        for (let i = 0; i < pts.length - 1; i++) {
          arcSegs.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z)
        }
      }
    }
    const flatGeo = new THREE.BufferGeometry()
    flatGeo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3))
    this.flatLines = new THREE.LineSegments(
      flatGeo,
      new THREE.LineBasicMaterial({ color: 0x86b8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.flatLines)

    this.arcArray = new Float32Array(arcSegs)
    const arcGeo = new THREE.BufferGeometry()
    arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcArray, 3))
    this.arcLines = new THREE.LineSegments(
      arcGeo,
      new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.arcLines)
    this.pulses = new LinkPulses(this.group, this.arcArray, 0xbfe0ff, 60)

    this.setActive(this.activeIds)
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
    // islands dim when none of their notes match
    for (const d of this.discs) {
      const anyOn = !idSet || this.nodes.some((n) => n.cluster === d.isl.ci && idSet.has(n.id))
      d.sprite.material.opacity = anyOn ? 0.1 : 0.03
    }
  }

  setLinksMode(showAll) {
    if (this.flatLines) this.flatLines.visible = showAll !== false
    if (this.arcLines) this.arcLines.visible = showAll !== false
  }

  setLabels() {
    // place-names and note names are the map — always on
  }

  focus(id) {
    const rec = this.byId.get(id)
    if (rec) this._flyToPoint(rec.mesh.position, 120)
  }

  _flyToPoint(target, height) {
    this._flight = {
      from: this.camera.position.clone(),
      to: new THREE.Vector3(target.x, height, target.z + height * 0.45),
      look: new THREE.Vector3(target.x, 0, target.z),
      t: 0
    }
  }

  _setHover(id) {
    if (id === this.hoverId) return
    this.hoverId = id
    if (!id && !this.pinned) this.onHover(null)
  }

  _pick(e, objects) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(objects)[0]
  }

  _hover(e) {
    const hit = this._pick(e, this.nodes.map((n) => n.mesh))
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    if (!this.pinned) this._setHover(hit ? hit.object.userData.id : null)
  }

  _click(e) {
    const hit = this._pick(e, this.nodes.map((n) => n.mesh))
    clearTimeout(this._clickTimer)
    if (hit) {
      const id = hit.object.userData.id
      this._clickTimer = setTimeout(() => {
        this.pinned = true
        this._setHover(id)
      }, 240)
      return
    }
    this.pinned = false
    this._setHover(null)
    this.onHover(null)
    const disc = this._pick(e, this.discs.map((d) => d.sprite))
    if (disc) {
      const isl = this.discs.find((d) => d.sprite === disc.object)?.isl
      if (isl) this._flyToPoint(new THREE.Vector3(isl.cx, 0, isl.cz), Math.max(160, isl.R * 2.6))
    }
  }

  _dblclick(e) {
    clearTimeout(this._clickTimer)
    const hit = this._pick(e, this.nodes.map((n) => n.mesh))
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    let dt = Math.min(0.05, this.clock.getDelta())
    if (this.eff) dt *= this.eff['motion.speed']
    this._t += dt
    animateOrbs(this.nodes, this._t, dt)
    if (this.pulses) this.pulses.update(dt)

    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      let o = l.fixed ? 0.95 : Math.min(0.95, 1 - (d - 500) / 450)
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
    if (this.pulses) {
      this.pulses.dispose()
      this.pulses = null
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.discs = []
    this.flatLines = null
    this.arcLines = null
    this.arcArray = null
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
    this.cineDispose?.()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
