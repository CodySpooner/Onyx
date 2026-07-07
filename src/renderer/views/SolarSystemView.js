import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer } from '../lib/cinema.js'
import { hashAngle } from '../lib/graph.mjs'
import { makeLabel } from '../lib/label.js'
import { makeGlowShafts } from '../lib/scenery.js'
import { makeOrb, addLights, makeStarfield, makeNebula } from '../lib/scenery.js'

const FOLDER_RING = 120
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class SolarSystemView {
  constructor(container, { onSelect, onHover }) {
    this.container = container
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.planets = []
    this.suns = new Map()
    this.shaftGroups = []
    this.shaftGroups = []
    this.labels = []
    this.labelsVisible = true
    this.activeIds = null
    this.hovered = null
    this.showAllLinks = true
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.002)
    this.scene.add(makeNebula('#1e2456', '#0a1c44'))
    this.scene.add(makeStarfield())
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 3000)
    this.camera.position.set(0, 110, 230)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 600

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.65, 0.5, 0.3] })
    this.composer = cine.composer
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex

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

  update(graph) {
    this.graph = graph
    this._clearScene()
    const folders = graph.folders

    folders.forEach((f, i) => {
      const ang = (i / folders.length) * Math.PI * 2
      const pos = new THREE.Vector3(Math.cos(ang) * FOLDER_RING, 0, Math.sin(ang) * FOLDER_RING)
      const color = new THREE.Color(f.color)
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(3.0, 24, 24), new THREE.MeshBasicMaterial({ color }))
      mesh.position.copy(pos)
      mesh.userData = { sunFolder: f.id }
      this.scene.add(mesh)
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(5.4, 20, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      halo.position.copy(pos)
      this.scene.add(halo)
      const shafts = makeGlowShafts(f.color, 30, 2.5, 0.1)
      shafts.position.set(pos.x, pos.y - 15, pos.z)
      shafts.userData.spin = i % 2 === 0 ? 0.14 : -0.11
      this.scene.add(shafts)
      this.shaftGroups.push(shafts)
      this.suns.set(f.id, { mesh, halo, shafts, pos, color })

      const sunLabel = makeLabel(f.name, f.color, 0.07)
      sunLabel.position.set(pos.x, pos.y + 8.5, pos.z)
      this.scene.add(sunLabel)
      this.labels.push({ sprite: sunLabel, id: null, fixed: true })
    })

    const perFolder = new Map()
    graph.notes.forEach((note) => {
      const sun = this.suns.get(note.folder)
      if (!sun) return
      const k = perFolder.get(note.folder) || 0
      perFolder.set(note.folder, k + 1)
      // concentric rings of 5: pitch 3.4 > max planet diameter → no intersections
      const ring = Math.floor(k / 5)
      const orbitR = 6 + ring * 3.4 + (k % 5) * 0.3
      const links = note.outLinks.length + note.inLinks.length
      const size = clamp(0.5 + links * 0.12, 0.5, 2.3)
      const orb = makeOrb(sun.color, size, note.type, note.id)
      this.scene.add(orb.mesh)
      const rec = {
        ...orb,
        note,
        sun,
        orbitR,
        speed: Math.max(0.06, 0.22 - ring * 0.03),
        phase: hashAngle(note.id),
        baseColor: sun.color.clone(),
        baseSize: size,
        active: true
      }
      this.planets.push(rec)

      const label = makeLabel(note.title, '#eef2ff', 0.032)
      this.scene.add(label)
      this.labels.push({ sprite: label, id: note.id, rec })
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
      new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.lines.visible = this.showAllLinks
    this.linkGroup.add(this.lines)

    // incident-only hover highlight (BrainView pattern)
    this.hlGeo = new THREE.BufferGeometry()
    this.hlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.hlLines = new THREE.LineSegments(
      this.hlGeo,
      new THREE.LineBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.linkGroup.add(this.hlLines)
  }

  _rebuildHighlight() {
    if (!this.hlGeo) return
    const id = this.hovered
    const segs = []
    if (id) {
      for (const [a, b] of this.linkPairs) {
        if (a.note.id === id || b.note.id === id) {
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

  setActive(idSet) {
    this.activeIds = idSet
    for (const p of this.planets) {
      const on = !idSet || idSet.has(p.note.id)
      p.active = on
      p.mesh.material.transparent = !on
      p.mesh.material.opacity = on ? 1 : 0.14
      p.mesh.material.emissiveIntensity = on ? 0.9 : 0.3
    }
  }

  setLinksMode(showAll) {
    this.showAllLinks = showAll !== false
    if (this.lines) this.lines.visible = this.showAllLinks
  }

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  _positions() {
    const t = this._t
    for (const p of this.planets) {
      const a = p.phase + t * p.speed
      p.mesh.position.set(
        p.sun.pos.x + Math.cos(a) * p.orbitR,
        p.sun.pos.y + Math.sin(a * 0.6) * 1.5,
        p.sun.pos.z + Math.sin(a) * p.orbitR
      )
      p.mesh.rotation.x += p.spinX
      p.mesh.rotation.y += p.spinY
      const pulse = 1 + Math.sin(t * 1.5 + p.pulse) * 0.07
      p.mesh.scale.setScalar(p.baseSize * pulse * (p.active ? 1 : 0.55))
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
    const id = hit ? hit.object.userData.id : null
    if (id !== this.hovered) {
      this.hovered = id
      this._rebuildHighlight()
      if (!id) this.onHover(null)
    }
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
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt
    this._positions()
    this._updateLinks()
    if (this._flight) {
      this._flight.t = Math.min(1, this._flight.t + 0.02)
      const k = this._flight.t * (2 - this._flight.t)
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) this._flight = null
    }
    for (const g of this.shaftGroups) g.rotation.y += dt * g.userData.spin
    const pulse = 1 + Math.sin(this._t * 2) * 0.04
    for (const [, s] of this.suns) s.mesh.scale.setScalar(pulse)
    if (this.hovered) this._rebuildHighlight() // orbits move every frame

    // labels: suns fixed, planet labels follow their orbits; distance fade
    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (!this.labelsVisible) {
        l.sprite.visible = false
        continue
      }
      if (l.rec) l.sprite.position.set(l.rec.mesh.position.x, l.rec.mesh.position.y + l.rec.baseSize + 1.4, l.rec.mesh.position.z)
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      let o = l.fixed ? 0.95 : Math.min(0.95, 1 - (d - 160) / 160)
      if (l.id && this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      if (o < 0.06) {
        l.sprite.visible = false
        continue
      }
      l.sprite.visible = true
      l.sprite.material.opacity = o
    }

    // hover card stream (projected coords, like BrainView)
    if (this.hovered) {
      const rec = this.planets.find((p) => p.note.id === this.hovered)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const h = this.container.clientHeight || 800
        tmp.copy(rec.mesh.position).project(this.camera)
        this.onHover({ id: this.hovered, x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, pinned: false })
      }
    }

    this.controls.update()
    if (this.grade) this.grade.uniforms.time.value = this._t
    this.composer.render()
  }

  _clearScene() {
    for (const l of this.labels) {
      this.scene.remove(l.sprite)
      l.sprite.material.dispose() // texture is cached in label.js, keep it
    }
    this.labels = []
    for (const p of this.planets) {
      this.scene.remove(p.mesh)
      if (!p.mesh.userData?.sharedGeo) p.mesh.geometry.dispose()
      p.mesh.material.dispose()
    }
    for (const [, s] of this.suns) {
      this.scene.remove(s.mesh)
      this.scene.remove(s.halo)
      if (s.shafts) {
        this.scene.remove(s.shafts)
        s.shafts.children[0]?.material.dispose()
        for (const c of s.shafts.children) c.geometry.dispose()
      }
      s.mesh.geometry.dispose()
      s.mesh.material.dispose()
      s.halo.geometry.dispose()
      s.halo.material.dispose()
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
    if (this.hlLines) {
      this.linkGroup.remove(this.hlLines)
      this.hlLines.geometry.dispose()
      this.hlLines.material.dispose()
      this.hlLines = null
      this.hlGeo = null
    }
    this.hovered = null
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
    window.removeEventListener('resize', this._onResize)
    this._clearScene()
    this.controls.dispose()
    this.envTex?.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
