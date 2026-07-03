import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { hashAngle } from '../lib/graph.mjs'
import { makeLabel } from '../lib/label.js'

// "Second brain" globe: notes on nested spherical shells around a bright core,
// radial lines to the core, wikilink chords, an equator + great-circle rings.
const R = 48
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class GlobeView {
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
    this.scene.fog = new THREE.FogExp2(0x05040a, 0.0016)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 3000)
    this.camera.position.set(0, 26, 158)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 600

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 1.05, 0.6, 0.08)
    this.composer.addPass(this.bloom)

    this.scene.add(this._starfield())
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
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9a8ad0, size: 1.0, transparent: true, opacity: 0.65 }))
  }

  _ring(radius, rotX, rotZ, color, opacity) {
    const pts = []
    for (let a = 0; a <= 96; a++) {
      const ang = (a / 96) * Math.PI * 2
      pts.push(Math.cos(ang) * radius, 0, Math.sin(ang) * radius)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
    line.rotation.x = rotX
    line.rotation.z = rotZ
    return line
  }

  update(graph) {
    this.graph = graph
    this._clear()

    // pink-white core
    this.core = new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffe6f2 }))
    this.group.add(this.core)
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(7, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xff7bd0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(halo)

    // rings: equator + two tilted great circles
    this.group.add(this._ring(R + 3, 0, 0, 0x3a4676, 0.5))
    this.group.add(this._ring(R + 3, Math.PI / 2.4, 0, 0x2c2350, 0.35))
    this.group.add(this._ring(R + 3, Math.PI / 2.4, Math.PI / 2, 0x2c2350, 0.35))

    // nodes on a fibonacci sphere with slight per-node shell variation
    const N = graph.notes.length
    const pos = new Map()
    const radial = []
    graph.notes.forEach((note, i) => {
      const y = 1 - (i / Math.max(1, N - 1)) * 2
      const rad = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = GOLDEN * i
      const shell = R * (0.82 + hashAngle('s' + note.id) * (0.18 / (Math.PI * 2)))
      const p = new THREE.Vector3(Math.cos(theta) * rad, y, Math.sin(theta) * rad).multiplyScalar(shell)
      pos.set(note.id, p)
      const folder = graph.folders.find((f) => f.id === note.folder)
      const color = new THREE.Color(folder?.color || '#c9a2ff')
      const links = note.outLinks.length + note.inLinks.length
      const size = clamp(0.5 + links * 0.11, 0.5, 2.2)
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 14), new THREE.MeshBasicMaterial({ color }))
      mesh.position.copy(p)
      mesh.userData = { id: note.id }
      this.group.add(mesh)
      this.nodes.push({ mesh, id: note.id, baseColor: color.clone() })
      const label = makeLabel(note.title, '#eef2ff', 0.045)
      label.position.set(p.x, p.y + size + 1.3, p.z)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id })
      radial.push(0, 0, 0, p.x, p.y, p.z)
    })

    // radial lines core -> node (structural, always shown)
    const radialGeo = new THREE.BufferGeometry()
    radialGeo.setAttribute('position', new THREE.Float32BufferAttribute(radial, 3))
    this.group.add(
      new THREE.LineSegments(
        radialGeo,
        new THREE.LineBasicMaterial({ color: 0xff9ad8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })
      )
    )

    // wikilink chords (toggled by the links checkbox)
    const chord = []
    for (const l of graph.links) {
      const a = pos.get(l.source)
      const b = pos.get(l.target)
      if (a && b) chord.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    const chordGeo = new THREE.BufferGeometry()
    chordGeo.setAttribute('position', new THREE.Float32BufferAttribute(chord, 3))
    this.links = new THREE.LineSegments(
      chordGeo,
      new THREE.LineBasicMaterial({ color: 0x7fbfff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.links.visible = this.showLinks
    this.group.add(this.links)

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

  setLinksMode(showAll) {
    this.showLinks = showAll !== false
    if (this.links) this.links.visible = this.showLinks
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
    this.group.rotation.y += 0.0011
    const pulse = 1 + Math.sin(this.clock.getElapsedTime() * 1.8) * 0.06
    if (this.core) this.core.scale.setScalar(pulse)
    this._fadeLabels(112, 210)
    this.controls.update()
    this.composer.render()
  }

  _clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.geometry?.dispose()
      child.material?.dispose()
    }
    this.nodes = []
    this.labels = []
    this.core = null
    this.links = null
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
