import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer } from '../lib/cinema.js'
import { hashAngle } from '../lib/graph.mjs'
import { createSim } from '../lib/force.mjs'
import { detectClusters, CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, LinkPulses } from '../lib/scenery.js'

const ORPHAN_COLOR = '#4a5470'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class BrainView {
  constructor(container, { onSelect, onHover }) {
    this.container = container
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.nodes = [] // { mesh, id, simNode, baseSize, spinX, spinY, pulse, phase, active, cluster }
    this.byId = new Map()
    this.labels = []
    this.labelsVisible = true
    this.activeIds = null
    this.showAllLinks = true
    this.hoverId = null
    this.pinned = false
    this._t = 0
    this._clickTimer = null

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x07070d, 0.0011)
    this.scene.add(makeNebula('#1c1442', '#0a1a3c'))
    this.scene.add(makeStarfield())
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 3000)
    this.camera.position.set(18, 24, 300)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 700

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.65, 0.5, 0.3] })
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

    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    this.sim = createSim(ids, graph.links)
    this.sim.tick(300) // warm up before first paint

    graph.notes.forEach((note) => {
      const simNode = this.sim.byId.get(note.id)
      const ci = clusterOf.get(note.id)
      const colorHex = ci >= 0 ? CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length] : ORPHAN_COLOR
      const deg = note.outLinks.length + note.inLinks.length
      const size = clamp(0.55 + deg * 0.11, 0.55, 2.4)
      const orb = makeOrb(colorHex, size, note.type, note.id)
      orb.mesh.position.set(simNode.x, simNode.y, simNode.z)
      this.group.add(orb.mesh)
      const rec = { ...orb, id: note.id, simNode, baseSize: size, phase: hashAngle(note.id), active: true, cluster: ci }
      this.nodes.push(rec)
      this.byId.set(note.id, rec)

      const label = makeLabel(note.title, '#eef2ff', 0.032)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id, rec })
    })

    // link segments — one shared live buffer drives lines AND pulses
    this.linkPairs = []
    for (const l of graph.links) {
      const a = this.byId.get(l.source)
      const b = this.byId.get(l.target)
      if (a && b) this.linkPairs.push([a, b])
    }
    this.segArray = new Float32Array(this.linkPairs.length * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.segArray, 3))
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x86b8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.lines)
    this.pulses = new LinkPulses(this.group, this.segArray, 0xbfe0ff, 90)

    // hover highlight overlay (incident links only)
    this.hlGeo = new THREE.BufferGeometry()
    this.hlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.hlLines = new THREE.LineSegments(
      this.hlGeo,
      new THREE.LineBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.hlLines)

    this.setActive(this.activeIds)
    this.setLinksMode(this.showAllLinks)
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

  setLinksMode(showAll) {
    this.showAllLinks = showAll !== false
    if (this.lines) this.lines.visible = this.showAllLinks
  }

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  // public: fly the camera to a note (command palette "fly to thought")
  focus(id) {
    const rec = this.byId.get(id)
    if (rec) this._flyTo(rec.mesh.position)
  }

  _setHover(id) {
    if (id === this.hoverId) return
    this.hoverId = id
    this._rebuildHighlight()
    if (!id && !this.pinned) this.onHover(null)
  }

  _rebuildHighlight() {
    const id = this.hoverId
    const segs = []
    if (id) {
      for (const [a, b] of this.linkPairs) {
        if (a.id === id || b.id === id) {
          segs.push(
            a.mesh.position.x, a.mesh.position.y, a.mesh.position.z,
            b.mesh.position.x, b.mesh.position.y, b.mesh.position.z
          )
        }
      }
    }
    this.hlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3))
    this.hlGeo.attributes.position.needsUpdate = true
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
      const rec = this.byId.get(id)
      if (rec) this._flyTo(rec.mesh.position)
    }, 240)
  }

  _dblclick(e) {
    clearTimeout(this._clickTimer)
    const hit = this._pick(e)
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _flyTo(target) {
    this._flight = {
      from: this.camera.position.clone(),
      to: target.clone().add(new THREE.Vector3(0, 8, 34)),
      look: target.clone(),
      t: 0
    }
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt

    if (this.sim) this.sim.tick(2)

    // copy sim → meshes with hash-phased micro-drift (display only)
    for (const n of this.nodes) {
      const p = n.simNode
      n.mesh.position.set(
        p.x + Math.sin(this._t * 0.7 + n.phase) * 0.35,
        p.y + Math.sin(this._t * 0.9 + n.phase * 2) * 0.35,
        p.z + Math.cos(this._t * 0.8 + n.phase) * 0.35
      )
      n.mesh.rotation.x += n.spinX
      n.mesh.rotation.y += n.spinY
      const pulse = 1 + Math.sin(this._t * 1.5 + n.pulse) * 0.07
      n.mesh.scale.setScalar(n.baseSize * pulse * (n.active ? 1 : 0.55))
    }

    // live link buffer (lines + pulses share it)
    if (this.segArray) {
      let i = 0
      for (const [a, b] of this.linkPairs) {
        this.segArray[i++] = a.mesh.position.x
        this.segArray[i++] = a.mesh.position.y
        this.segArray[i++] = a.mesh.position.z
        this.segArray[i++] = b.mesh.position.x
        this.segArray[i++] = b.mesh.position.y
        this.segArray[i++] = b.mesh.position.z
      }
      if (this.lines) this.lines.geometry.attributes.position.needsUpdate = true
    }
    if (this.hoverId) this._rebuildHighlight()
    if (this.pulses) this.pulses.update(dt)

    // labels: follow neurons, distance fade
    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (!this.labelsVisible) {
        l.sprite.visible = false
        continue
      }
      l.sprite.position.set(l.rec.mesh.position.x, l.rec.mesh.position.y + l.rec.baseSize + 1.3, l.rec.mesh.position.z)
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      let o = Math.min(0.95, 1 - (d - 230) / 230)
      if (this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      if (o < 0.06) {
        l.sprite.visible = false // culled, not ghosted — kills 100-label overdraw
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

    // hover card position stream
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
    this.linkPairs = []
    this.lines = null
    this.hlLines = null
    this.segArray = null
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
