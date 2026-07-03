import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { hashAngle } from '../lib/graph.mjs'

// Minimal deterministic 3D constellation: notes placed by folder cluster + hash,
// links as faint lines. No physics — its job is to prove view-switching works.
export class GraphView {
  constructor(container, { onSelect }) {
    this.container = container
    this.onSelect = onSelect
    this.nodes = []
    this.activeIds = null

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.006)
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000)
    this.camera.position.set(0, 0, 92)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this._onClick = (e) => this._click(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('click', this._onClick)
    window.addEventListener('resize', this._onResize)
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
      const p = new THREE.Vector3(
        cx + Math.cos(a) * r,
        (hashAngle('y' + n.id) - Math.PI) * 3,
        cz + Math.sin(a) * r
      )
      pos.set(n.id, p)
      const links = n.outLinks.length + n.inLinks.length
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.5 + links * 0.08, 12, 12),
        new THREE.MeshBasicMaterial({ color: graph.folders[fi]?.color || '#6ea8ff' })
      )
      mesh.position.copy(p)
      mesh.userData = { id: n.id }
      this.scene.add(mesh)
      this.nodes.push({ mesh, id: n.id })
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
      new THREE.LineBasicMaterial({ color: 0x5588cc, transparent: true, opacity: 0.12 })
    )
    this.scene.add(this.lines)
    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const n of this.nodes) {
      const on = !idSet || idSet.has(n.id)
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : 0.1
    }
  }

  setLinksMode() {} // uniform interface; constellation always shows its links

  _click(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh))[0]
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _clear() {
    for (const n of this.nodes) {
      this.scene.remove(n.mesh)
      n.mesh.geometry.dispose()
      n.mesh.material.dispose()
    }
    this.nodes = []
    if (this.lines) {
      this.scene.remove(this.lines)
      this.lines.geometry.dispose()
      this.lines.material.dispose()
      this.lines = null
    }
  }

  _resize() {
    const w = this.container.clientWidth || 1400
    const h = this.container.clientHeight || 800
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    this.scene.rotation.y += 0.0006
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
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
