import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { makeLabel } from '../lib/label.js'
import { softDot } from '../lib/scenery.js'
import { detectClusters, CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { paletteFor } from '../lib/graph-settings.mjs'

const GOLDEN = 2.399963
const R0 = 16 // first station radius (the plaza stays open)
const STEP = 11 // spacing between stations along a line

// Transit Map — the vault as a subway diagram. Each cluster is a colored line
// fanning out from a central interchange; notes are stations along it; notes
// that link across clusters become interchange stations. Flat, top-down,
// built to be read and navigated like a real metro map.
export class TransitView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.stations = []
    this.byId = new Map()
    this.labels = []
    this.activeIds = null
    this.hoverId = null
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a0d14)
    this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.0016)

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 4000)
    this.camera.position.set(0, 340, 120)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = 1.05 // stays map-like, never fully side-on
    this.controls.minDistance = 60
    this.controls.maxDistance = 700

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.35, 0.7, 0.6] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))
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
    const theme = paletteFor(this.settings)
    const lineColors = theme.clusters

    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    const byId = new Map(graph.notes.map((n) => [n.id, n]))
    const deg = (n) => (n.outLinks?.length || 0) + (n.inLinks?.length || 0)

    // group notes into lines by cluster (orphans → their own "local" line)
    const lines = new Map()
    for (const n of graph.notes) {
      const c = clusterOf.get(n.id)
      const key = c == null || c < 0 ? 'orphans' : c
      if (!lines.has(key)) lines.set(key, [])
      lines.get(key).push(n)
    }
    const lineKeys = [...lines.keys()].sort((a, b) => (lines.get(b).length - lines.get(a).length))

    // lay each line out along its own ray, hub-first (interchange near center)
    const pos = new Map()
    const lineMeta = []
    let maxLen = 1
    lineKeys.forEach((key, li) => {
      const members = lines.get(key).slice().sort((a, b) => deg(b) - deg(a))
      maxLen = Math.max(maxLen, members.length)
      const ang = li * GOLDEN
      const dirx = Math.cos(ang)
      const dirz = Math.sin(ang)
      const color = new THREE.Color(key === 'orphans' ? theme.orphan : lineColors[li % lineColors.length])
      const pts = []
      members.forEach((n, si) => {
        const r = R0 + si * STEP
        // gentle tangential wave so parallel lines read distinctly
        const wob = Math.sin(si * 0.9) * 3.2
        const x = dirx * r - dirz * wob
        const z = dirz * r + dirx * wob
        pos.set(n.id, { x, y: 0, z })
        pts.push(new THREE.Vector3(x, 0, z))
      })
      lineMeta.push({ key, members, color, pts })
    })

    // draw each line as a rounded colored ribbon (tube) through its stations
    for (const lm of lineMeta) {
      if (lm.pts.length < 2) continue
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), ...lm.pts], false, 'catmullrom', 0.4)
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(16, lm.pts.length * 6), 2.6, 8, false),
        new THREE.MeshBasicMaterial({ color: lm.color })
      )
      this.group.add(tube)
    }

    // central interchange plaza
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(R0 * 0.7, 40),
      new THREE.MeshBasicMaterial({ color: 0x161c28 })
    )
    plaza.rotation.x = -Math.PI / 2
    plaza.position.y = -0.2
    this.group.add(plaza)

    // frame the whole fan (one long line can reach far); slight tilt for depth
    const extent = R0 + maxLen * STEP + 40
    this._extent = extent
    this.camera.position.set(0, extent * 1.15, extent * 0.5)
    this.controls.target.set(0, 0, 0)
    this.controls.maxDistance = extent * 3

    // stations: a note that links outside its own line is an interchange
    const stationGeo = new THREE.CircleGeometry(3.4, 20)
    const interGeo = new THREE.CircleGeometry(5.4, 24)
    for (const lm of lineMeta) {
      for (const n of lm.members) {
        const p = pos.get(n.id)
        const links = [...(n.outLinks || []), ...(n.inLinks || [])]
        const isInter = links.some((oid) => {
          const o = byId.get(oid)
          return o && clusterOf.get(oid) !== clusterOf.get(n.id)
        })
        const mat = new THREE.MeshBasicMaterial({ color: isInter ? 0xffffff : lm.color.getHex() })
        const disc = new THREE.Mesh(isInter ? interGeo : stationGeo, mat)
        disc.rotation.x = -Math.PI / 2
        disc.position.set(p.x, 0.6, p.z)
        disc.userData = { id: n.id, sharedGeo: true }
        this.group.add(disc)
        // colored ring around interchange discs so the line still reads
        if (isInter) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 5.2, 24), new THREE.MeshBasicMaterial({ color: lm.color, side: THREE.DoubleSide }))
          ring.rotation.x = -Math.PI / 2
          ring.position.set(p.x, 0.55, p.z)
          ring.userData = { sharedGeo: false }
          this.group.add(ring)
        }
        const rec = { id: n.id, disc, base: isInter ? 3.8 : 2.4, active: true, x: p.x, z: p.z, inter: isInter }
        this.stations.push(rec)
        this.byId.set(n.id, rec)

        const label = makeLabel(n.title, isInter ? '#ffffff' : '#c7d2e8', 0.03)
        label.position.set(p.x, 3.2, p.z + 4)
        this.group.add(label)
        this.labels.push({ sprite: label, id: n.id })
      }
    }

    // cross-line connectors: thin grey links between interchange stations
    const seen = new Set()
    const segs = []
    for (const l of graph.links) {
      const a = pos.get(l.source)
      const b = pos.get(l.target)
      if (!a || !b) continue
      if (clusterOf.get(l.source) === clusterOf.get(l.target)) continue // same line already drawn
      const k = l.source < l.target ? l.source + l.target : l.target + l.source
      if (seen.has(k)) continue
      seen.add(k)
      segs.push(a.x, 1.2, a.z, b.x, 1.2, b.z)
    }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    this.connectors = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x5a6b8c, transparent: true, opacity: 0.35 }))
    this.group.add(this.connectors)

    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const s of this.stations) {
      const on = !idSet || idSet.has(s.id)
      s.active = on
      s.disc.material.opacity = on ? 1 : 0.2
      s.disc.material.transparent = !on
    }
  }

  setLinksMode(showAll) {
    if (this.connectors) this.connectors.visible = showAll !== false
  }

  setLabels(show) {
    this.labelsVisible = show
  }

  focus(id) {
    const rec = this.byId.get(id)
    if (rec) {
      this._flight = { from: this.camera.position.clone(), to: new THREE.Vector3(rec.x, 120, rec.z + 80), look: new THREE.Vector3(rec.x, 0, rec.z), t: 0 }
    }
  }

  setPath(ids) {
    this.pathSet = Array.isArray(ids) && ids.length ? new Set(ids) : null
    this.setActive(this.activeIds)
    if (this.pathSet) {
      // dim everything off-path, keep path bright
      for (const s of this.stations) {
        const on = this.pathSet.has(s.id)
        s.disc.material.opacity = on ? 1 : 0.08
        s.disc.material.transparent = !on
      }
    }
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.stations.map((s) => s.disc))[0]
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

    // hovered station pulses + streams its hover card
    for (const s of this.stations) {
      const k = s.id === this.hoverId ? 1.35 + Math.sin(this._t * 6) * 0.12 : 1
      s.disc.scale.setScalar(k)
    }
    const lblMax = (this._extent || 260) * 1.4
    for (const l of this.labels) {
      const d = this.camera.position.distanceTo(l.sprite.position)
      l.sprite.visible = this.labelsVisible === false ? l.id === this.hoverId : d < lblMax
    }
    if (this.hoverId) {
      const rec = this.byId.get(this.hoverId)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const hh = this.container.clientHeight || 800
        const v = new THREE.Vector3(rec.x, 2, rec.z).project(this.camera)
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
    this.update(this.graph) // palette lives at build time here
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
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.material?.map?.dispose?.()
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.stations = []
    this.byId = new Map()
    this.labels = []
    this.connectors = null
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
