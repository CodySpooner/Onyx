import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { hashAngle } from '../lib/graph.mjs'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, animateOrbs } from '../lib/scenery.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Deterministic 3D constellation: notes placed by folder cluster + hash.
export class GraphView {
  constructor(container, { onSelect, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.nodes = []
    this.labels = []
    this.labelsVisible = true
    this.activeIds = null
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.005)
    this.scene.add(makeNebula('#231a4d', '#0c1a40'))
    this.scene.add(makeStarfield(1000))
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000)
    this.camera.position.set(0, 0, 150)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

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
    this._onClick = (e) => this._click(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('click', this._onClick)
    window.addEventListener('resize', this._onResize)
    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
  }

  update(graph) {
    this.graph = graph
    this._clear()
    const folderIndex = new Map(graph.folders.map((f, i) => [f.id, i]))
    const pos = new Map()
    graph.notes.forEach((n) => {
      const fi = folderIndex.get(n.folder) || 0
      const ca = (fi / Math.max(1, graph.folders.length)) * Math.PI * 2
      const cx = Math.cos(ca) * 64
      const cz = Math.sin(ca) * 64
      const a = hashAngle(n.id)
      const r = 9 + hashAngle('r' + n.id) * 2.8
      const p = new THREE.Vector3(cx + Math.cos(a) * r, (hashAngle('y' + n.id) - Math.PI) * 7, cz + Math.sin(a) * r)
      pos.set(n.id, p)
      const links = n.outLinks.length + n.inLinks.length
      const size = clamp(0.6 + links * 0.09, 0.6, 2.2)
      const orb = makeOrb(graph.folders[fi]?.color || '#6ea8ff', size, n.type, n.id)
      orb.mesh.position.copy(p)
      this.group.add(orb.mesh)
      this.nodes.push({ ...orb, id: n.id, baseSize: size, active: true })

      const label = makeLabel(n.title, '#eef2ff', 0.032)
      label.position.set(p.x, p.y + size + 1.4, p.z)
      this.group.add(label)
      this.labels.push({ sprite: label, id: n.id })
    })

    // folder place-names at each constellation's center — staggered heights
    // so 13 names on a 64u ring can't collide
    graph.folders.forEach((f, fi) => {
      const ca = (fi / Math.max(1, graph.folders.length)) * Math.PI * 2
      const label = makeLabel(f.name, f.color, 0.042)
      label.position.set(Math.cos(ca) * 64, 26 + (fi % 2) * 11, Math.sin(ca) * 64)
      this.group.add(label)
      this.labels.push({ sprite: label, id: null, fixed: true })
    })
    const pts = []
    for (const l of graph.links) {
      const a = pos.get(l.source)
      const b = pos.get(l.target)
      if (a && b) pts.push(a, b)
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x6699dd, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.lines)
    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const n of this.nodes) {
      const on = !idSet || idSet.has(n.id)
      n.active = on
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : 0.12
      n.mesh.material.emissiveIntensity = on ? 0.9 : 0.3
    }
  }

  setLinksMode() {}

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  _fadeLabels() {
    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (!this.labelsVisible) {
        l.sprite.visible = false
        continue
      }
      l.sprite.getWorldPosition(tmp)
      const d = tmp.distanceTo(cam)
      let o = l.fixed ? 0.95 : Math.min(0.95, 1 - (d - 130) / 150)
      if (l.id && this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      if (o < 0.06) {
        l.sprite.visible = false
        continue
      }
      l.sprite.visible = true
      l.sprite.material.opacity = o
    }
  }

  _click(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh))[0]
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.nodes = []
    this.labels = []
    this.lines = null
  }

  _resize() {
    const w = this.container.clientWidth || 1400
    const h = this.container.clientHeight || 800
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    let dt = Math.min(0.05, this.clock.getDelta())
    if (this.eff) dt *= this.eff['motion.speed']
    this._t += dt
    this.group.rotation.y += 0.0006
    animateOrbs(this.nodes, this._t, dt, !this.eff || this.eff['motion.spin'])
    this._fadeLabels()
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
      this.clock.getDelta() // eat the pause gap so dt doesn't jump
      this._loop()
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    window.removeEventListener('resize', this._onResize)
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
