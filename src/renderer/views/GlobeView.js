import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { hashAngle } from '../lib/graph.mjs'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, LinkPulses, animateOrbs, makeGlowShafts } from '../lib/scenery.js'

const R = 62
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class GlobeView {
  constructor(container, { onSelect, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.nodes = []
    this.labels = []
    this.labelsVisible = true
    this.activeIds = null
    this.showLinks = true
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05040a, 0.0015)
    this.scene.add(makeNebula('#3a1f5e', '#0e2148'))
    this.scene.add(makeStarfield())
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 3000)
    this.camera.position.set(0, 32, 205)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 600

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
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('pointermove', this._onMove)
    this.renderer.domElement.addEventListener('click', this._onClick)
    window.addEventListener('resize', this._onResize)

    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
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

    // bright pink core with layered halos
    this.core = new THREE.Mesh(new THREE.SphereGeometry(3.8, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff0f8 }))
    this.group.add(this.core)
    this.shafts = makeGlowShafts('#ff7bd0', 40, 3, 0.1)
    this.shafts.position.set(0, -20, 0)
    this.group.add(this.shafts)
    for (const [r, c, o] of [[6.5, 0xff7bd0, 0.22], [11, 0xa25bff, 0.1]]) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 24),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      this.group.add(halo)
    }

    this.group.add(this._ring(R + 3, 0, 0, 0x4a5690, 0.55))
    this.group.add(this._ring(R + 3, Math.PI / 2.4, 0, 0x3a2f66, 0.4))
    this.group.add(this._ring(R + 3, Math.PI / 2.4, Math.PI / 2, 0x3a2f66, 0.4))

    const N = graph.notes.length
    const pos = new Map()
    const radial = []
    graph.notes.forEach((note, i) => {
      const y = 1 - (i / Math.max(1, N - 1)) * 2
      const rad = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = GOLDEN * i
      const shell = R * (0.82 + (hashAngle('s' + note.id) / (Math.PI * 2)) * 0.18)
      const p = new THREE.Vector3(Math.cos(theta) * rad, y, Math.sin(theta) * rad).multiplyScalar(shell)
      pos.set(note.id, p)
      const folder = graph.folders.find((f) => f.id === note.folder)
      const links = note.outLinks.length + note.inLinks.length
      const size = clamp(0.6 + links * 0.12, 0.6, 2.5)
      const orb = makeOrb(folder?.color || '#c9a2ff', size, note.type, note.id)
      orb.mesh.position.copy(p)
      this.group.add(orb.mesh)
      this.nodes.push({ ...orb, id: note.id, baseColor: new THREE.Color(folder?.color || '#c9a2ff'), baseSize: size, active: true })
      radial.push(0, 0, 0, p.x, p.y, p.z)

      const label = makeLabel(note.title, '#eef2ff', 0.032)
      label.position.set(p.x, p.y + size + 1.4, p.z)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id })
    })

    // faint radial lines + energy pulses flowing outward from the core
    const radialGeo = new THREE.BufferGeometry()
    radialGeo.setAttribute('position', new THREE.Float32BufferAttribute(radial, 3))
    this.group.add(
      new THREE.LineSegments(
        radialGeo,
        new THREE.LineBasicMaterial({ color: 0xff9ad8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
      )
    )
    this.pulses = new LinkPulses(this.group, radial, 0xffb0e6, 120)

    // wikilink chords (toggled)
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
      new THREE.LineBasicMaterial({ color: 0x7fbfff, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.links.visible = this.showLinks
    this.group.add(this.links)

    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const n of this.nodes) {
      const on = !idSet || idSet.has(n.id)
      n.active = on
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : 0.14
      n.mesh.material.emissiveIntensity = on ? 0.9 : 0.3
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
      l.sprite.getWorldPosition(tmp)
      // far-hemisphere cull: labels behind the globe just add noise
      if (tmp.dot(cam) / (tmp.length() * cam.length() || 1) < -0.15) {
        l.sprite.visible = false
        continue
      }
      const d = tmp.distanceTo(cam)
      let o = Math.min(0.95, 1 - (d - near) / (far - near))
      if (this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      if (o < 0.06) {
        l.sprite.visible = false
        continue
      }
      l.sprite.visible = true
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
    let dt = Math.min(0.05, this.clock.getDelta())
    if (this.eff) dt *= this.eff['motion.speed']
    this._t += dt
    this.group.rotation.y += 0.0011
    animateOrbs(this.nodes, this._t, dt)
    if (this.pulses) this.pulses.update(dt)
    if (this.shafts) this.shafts.rotation.y -= dt * 0.12
    const pulse = 1 + Math.sin(this._t * 1.8) * 0.06
    if (this.core) this.core.scale.setScalar(pulse)
    this._fadeLabels(140, 260)
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
      if (child.isGroup) {
        for (const sub of child.children) {
          sub.material?.dispose()
          if (!sub.userData?.sharedGeo) sub.geometry?.dispose()
        }
      } else {
        child.material?.dispose()
        if (!child.userData?.sharedGeo) child.geometry?.dispose()
      }
    }
    this.nodes = []
    this.labels = []
    this.core = null
    this.links = null
    this.shafts = null
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
