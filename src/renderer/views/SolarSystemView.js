import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { hashAngle } from '../lib/graph.mjs'

const FOLDER_RING = 74 // radius of the ring the suns sit on
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class SolarSystemView {
  constructor(container, { onSelect }) {
    this.container = container
    this.onSelect = onSelect
    this.planets = [] // { mesh, note, sun, orbitR, speed, phase, baseColor, size }
    this.suns = new Map() // folderId → { mesh, pos, color }
    this.activeIds = null
    this.hovered = null
    this.showAllLinks = true

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.0022)

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 3000)
    this.camera.position.set(0, 82, 168)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 600

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.15)
    this.composer.addPass(this.bloom)

    this.scene.add(this._starfield())
    this.linkGroup = new THREE.Group()
    this.scene.add(this.linkGroup)

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
    const n = 1800
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 380 + (i % 400)
      const a = hashAngle(`star${i}`)
      const b = hashAngle(`b${i}`)
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = (Math.sin(b) - 0.5) * 320
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0x8899cc, size: 1.1, transparent: true, opacity: 0.7 })
    )
  }

  update(graph) {
    this.graph = graph
    this._clearScene()
    const folders = graph.folders

    folders.forEach((f, i) => {
      const ang = (i / folders.length) * Math.PI * 2
      const pos = new THREE.Vector3(Math.cos(ang) * FOLDER_RING, 0, Math.sin(ang) * FOLDER_RING)
      const color = new THREE.Color(f.color)
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(3.0, 24, 24),
        new THREE.MeshBasicMaterial({ color })
      )
      mesh.position.copy(pos)
      mesh.userData = { sunFolder: f.id }
      this.scene.add(mesh)
      this.suns.set(f.id, { mesh, pos, color })
    })

    const perFolder = new Map()
    graph.notes.forEach((note) => {
      const sun = this.suns.get(note.folder)
      if (!sun) return
      const k = perFolder.get(note.folder) || 0
      perFolder.set(note.folder, k + 1)
      const orbitR = 4 + (k % 4) * 1.7 + k / 20
      const links = note.outLinks.length + note.inLinks.length
      const size = clamp(0.4 + links * 0.12, 0.4, 2.2)
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 16, 16),
        new THREE.MeshBasicMaterial({ color: sun.color })
      )
      mesh.userData = { id: note.id }
      this.scene.add(mesh)
      this.planets.push({
        mesh,
        note,
        sun,
        orbitR,
        speed: 0.15 + (k % 5) * 0.03,
        phase: hashAngle(note.id),
        baseColor: sun.color.clone(),
        size
      })
    })

    this._buildLinks()
    this.setActive(this.activeIds)
  }

  _buildLinks() {
    const posOf = new Map(this.planets.map((p) => [p.note.id, p]))
    this.linkPairs = []
    const coords = []
    for (const l of this.graph.links) {
      const a = posOf.get(l.source)
      const b = posOf.get(l.target)
      if (!a || !b) continue
      this.linkPairs.push([a, b])
      coords.push(0, 0, 0, 0, 0, 0)
    }
    this.linkGeo = new THREE.BufferGeometry()
    this.linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3))
    this.lines = new THREE.LineSegments(
      this.linkGeo,
      new THREE.LineBasicMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    this.linkGroup.add(this.lines)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const p of this.planets) {
      const on = !idSet || idSet.has(p.note.id)
      p.mesh.material.color.copy(p.baseColor)
      p.mesh.material.transparent = !on
      p.mesh.material.opacity = on ? 1 : 0.12
      p.mesh.scale.setScalar(on ? 1 : 0.6)
    }
  }

  setLinksMode(showAll) {
    this.showAllLinks = showAll !== false
    if (this.lines) this.lines.visible = true
  }

  _positions() {
    const t = this.clock.getElapsedTime()
    for (const p of this.planets) {
      const a = p.phase + t * p.speed
      p.mesh.position.set(
        p.sun.pos.x + Math.cos(a) * p.orbitR,
        p.sun.pos.y + Math.sin(a * 0.6) * 1.5,
        p.sun.pos.z + Math.sin(a) * p.orbitR
      )
    }
  }

  _updateLinks() {
    if (!this.linkGeo) return
    const arr = this.linkGeo.attributes.position.array
    let i = 0
    for (const [a, b] of this.linkPairs) {
      arr[i++] = a.mesh.position.x
      arr[i++] = a.mesh.position.y
      arr[i++] = a.mesh.position.z
      arr[i++] = b.mesh.position.x
      arr[i++] = b.mesh.position.y
      arr[i++] = b.mesh.position.z
    }
    this.linkGeo.attributes.position.needsUpdate = true
  }

  _pick(e, objects) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(objects)[0]
  }

  _hover(e) {
    const hit = this._pick(e, this.planets.map((p) => p.mesh))
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    this.hovered = hit ? hit.object.userData.id : null
  }

  _click(e) {
    const planet = this._pick(e, this.planets.map((p) => p.mesh))
    if (planet) {
      this.onSelect(planet.object.userData.id)
      return
    }
    const sun = this._pick(e, [...this.suns.values()].map((s) => s.mesh))
    if (sun) this._flyTo(sun.object.position)
  }

  _flyTo(target) {
    this._flight = {
      from: this.camera.position.clone(),
      to: target.clone().add(new THREE.Vector3(0, 14, 26)),
      look: target.clone(),
      t: 0
    }
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    this._positions()
    this._updateLinks()
    if (this._flight) {
      this._flight.t = Math.min(1, this._flight.t + 0.02)
      const k = this._flight.t * (2 - this._flight.t) // ease-out
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) this._flight = null
    }
    const pulse = 1 + Math.sin(this.clock.elapsedTime * 2) * 0.04
    for (const [, s] of this.suns) s.mesh.scale.setScalar(pulse)
    if (this.lines) {
      const base = this.showAllLinks ? 0.14 : 0.0
      this.lines.material.opacity = this.hovered ? Math.max(base, 0.3) : base
    }
    this.controls.update()
    this.composer.render()
  }

  _clearScene() {
    for (const p of this.planets) {
      this.scene.remove(p.mesh)
      p.mesh.geometry.dispose()
      p.mesh.material.dispose()
    }
    for (const [, s] of this.suns) {
      this.scene.remove(s.mesh)
      s.mesh.geometry.dispose()
      s.mesh.material.dispose()
    }
    this.planets = []
    this.suns = new Map()
    if (this.lines) {
      this.linkGroup.remove(this.lines)
      this.lines.geometry.dispose()
      this.lines.material.dispose()
      this.lines = null
      this.linkGeo = null
    }
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
    this._clearScene()
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
