import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { hashAngle } from '../lib/graph.mjs'
import { makeOrb, addLights, makeStarfield, makeNebula, animateOrbs } from '../lib/scenery.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Deterministic 3D constellation: notes placed by folder cluster + hash.
export class GraphView {
  constructor(container, { onSelect }) {
    this.container = container
    this.onSelect = onSelect
    this.nodes = []
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
    this.camera.position.set(0, 0, 92)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.95, 0.6, 0.1))

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
      const cx = Math.cos(ca) * 34
      const cz = Math.sin(ca) * 34
      const a = hashAngle(n.id)
      const r = 4 + hashAngle('r' + n.id) * 1.6
      const p = new THREE.Vector3(cx + Math.cos(a) * r, (hashAngle('y' + n.id) - Math.PI) * 3, cz + Math.sin(a) * r)
      pos.set(n.id, p)
      const links = n.outLinks.length + n.inLinks.length
      const size = clamp(0.6 + links * 0.09, 0.6, 2.2)
      const orb = makeOrb(graph.folders[fi]?.color || '#6ea8ff', size, n.type, n.id)
      orb.mesh.position.copy(p)
      this.group.add(orb.mesh)
      this.nodes.push({ ...orb, id: n.id, baseSize: size, active: true })
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
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt
    this.group.rotation.y += 0.0006
    animateOrbs(this.nodes, this._t, dt)
    this.controls.update()
    this.composer.render()
  }

  dispose() {
    cancelAnimationFrame(this._raf)
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
