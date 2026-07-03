import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { hashAngle } from '../lib/graph.mjs'
import { makeLabel } from '../lib/label.js'

// "Core of Everything": a bright core at the top pole, notes on concentric
// teardrop rings below it, radial lines fanning down from the core.
const TOP = 60 // core height
const HEIGHT = 108 // vertical extent from core to vortex
const MAX_R = 54 // widest ring radius (at the teardrop's middle)
const RING_TS = [0.1, 0.2, 0.31, 0.43, 0.56, 0.7, 0.85] // latitude of each ring (0=core,1=vortex)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class CoreView {
  constructor(container, { onSelect }) {
    this.container = container
    this.onSelect = onSelect
    this.nodes = []
    this.labels = []
    this.labelsVisible = true
    this.activeIds = null
    this.showLinks = true

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x04050a, 0.0016)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 3000)
    this.camera.position.set(0, 34, 176)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 6, 0)
    this.controls.maxDistance = 600

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 1.0, 0.55, 0.1)
    this.composer.addPass(this.bloom)

    this.scene.add(this._starfield())
    this.group = new THREE.Group() // everything that slowly rotates
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

  _starfield() {
    const g = new THREE.BufferGeometry()
    const n = 1600
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 420 + (i % 380)
      const a = hashAngle(`star${i}`)
      const b = hashAngle(`b${i}`)
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = (Math.sin(b) - 0.5) * 340
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a9ad0, size: 1.0, transparent: true, opacity: 0.65 }))
  }

  update(graph) {
    this.graph = graph
    this._clear()

    // core star at the top pole
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    this.core.position.set(0, TOP, 0)
    this.group.add(this.core)
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(6.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    halo.position.copy(this.core.position)
    this.group.add(halo)
    this._extra = [halo]

    // distribute notes across rings, weighted by ring circumference
    const weights = RING_TS.map((t) => Math.sin(Math.PI * t))
    const wSum = weights.reduce((a, b) => a + b, 0)
    const N = graph.notes.length
    const counts = weights.map((w) => Math.max(1, Math.round((N * w) / wSum)))
    // reconcile rounding so counts sum to N
    let diff = N - counts.reduce((a, b) => a + b, 0)
    for (let r = 0; diff !== 0; r = (r + 1) % counts.length) {
      counts[r] += diff > 0 ? 1 : -1
      diff += diff > 0 ? -1 : 1
    }

    const fanPts = []
    const corePos = new THREE.Vector3(0, TOP, 0)
    let idx = 0
    RING_TS.forEach((t, ri) => {
      const radius = MAX_R * Math.sin(Math.PI * t)
      const ringY = TOP - t * HEIGHT
      // faint ring outline
      const ringGeo = new THREE.BufferGeometry()
      const rp = []
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2
        rp.push(Math.cos(ang) * radius, ringY, Math.sin(ang) * radius)
      }
      ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3))
      this.group.add(new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x2a3660, transparent: true, opacity: 0.5 })))

      const k = counts[ri]
      for (let j = 0; j < k && idx < N; j++, idx++) {
        const note = graph.notes[idx]
        const folder = graph.folders.find((f) => f.id === note.folder)
        const color = new THREE.Color(folder?.color || '#8fa2d9')
        const ang = (j / k) * Math.PI * 2 + hashAngle(note.id) * 0.06
        const pos = new THREE.Vector3(Math.cos(ang) * radius, ringY, Math.sin(ang) * radius)
        const links = note.outLinks.length + note.inLinks.length
        const size = clamp(0.55 + links * 0.11, 0.55, 2.3)
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 14), new THREE.MeshBasicMaterial({ color }))
        mesh.position.copy(pos)
        mesh.userData = { id: note.id }
        this.group.add(mesh)
        this.nodes.push({ mesh, id: note.id, baseColor: color.clone() })
        const label = makeLabel(note.title, '#e6ecff', 0.05)
        label.position.set(pos.x, pos.y + size + 1.6, pos.z)
        this.group.add(label)
        this.labels.push({ sprite: label, id: note.id })
        fanPts.push(corePos.x, corePos.y, corePos.z, pos.x, pos.y, pos.z)
      }
    })

    // radial fan lines from the core down to every node
    const fanGeo = new THREE.BufferGeometry()
    fanGeo.setAttribute('position', new THREE.Float32BufferAttribute(fanPts, 3))
    this.fan = new THREE.LineSegments(
      fanGeo,
      new THREE.LineBasicMaterial({ color: 0xbcd2ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.fan)

    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const n of this.nodes) {
      const on = !idSet || idSet.has(n.id)
      n.mesh.material.color.copy(n.baseColor)
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : 0.12
      n.mesh.scale.setScalar(on ? 1 : 0.6)
    }
  }

  setLinksMode() {
    // the radial fan is structural to this view — always shown
  }

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  _fadeLabels(near, far) {
    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (!this.labelsVisible) {
        l.sprite.visible = false
        continue
      }
      l.sprite.visible = true
      l.sprite.getWorldPosition(tmp)
      const d = tmp.distanceTo(cam)
      let o = 1 - (d - near) / (far - near)
      o = Math.max(0.03, Math.min(0.95, o))
      if (this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      l.sprite.material.opacity = o
    }
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
  }

  _click(e) {
    const hit = this._pick(e)
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    this.group.rotation.y += 0.0012
    const pulse = 1 + Math.sin(this.clock.getElapsedTime() * 1.6) * 0.05
    if (this.core) this.core.scale.setScalar(pulse)
    this._fadeLabels(150, 236)
    this.controls.update()
    this.composer.render()
  }

  _clear() {
    for (const n of this.nodes) {
      this.group.remove(n.mesh)
      n.mesh.geometry.dispose()
      n.mesh.material.dispose()
    }
    this.nodes = []
    this.labels = []
    // remove all non-node children (rings, fan, core, halo)
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.geometry?.dispose()
      child.material?.dispose()
    }
    this.core = null
    this.fan = null
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
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
