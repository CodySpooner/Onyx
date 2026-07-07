import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer } from '../lib/cinema.js'
import { makeLabel } from '../lib/label.js'
import { addLights, makeStarfield, makeNebula, softDot } from '../lib/scenery.js'
import { districtGrid } from '../lib/layouts.mjs'

const GOLDEN = 2.399963
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)

// module-cached textures (like softDot)
let WINDOWS = null
function windowTexture() {
  if (WINDOWS) return WINDOWS
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 64, 256)
  ctx.fillStyle = '#cfe0ff'
  let seed = 12345
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let y = 6; y < 250; y += 9) {
    for (let x = 6; x < 58; x += 9) {
      if (rnd() > 0.45) ctx.fillRect(x, y, 3, 3)
    }
  }
  WINDOWS = new THREE.CanvasTexture(c)
  WINDOWS.magFilter = THREE.NearestFilter
  WINDOWS.wrapS = WINDOWS.wrapT = THREE.RepeatWrapping
  return WINDOWS
}

let SHAFT = null
function shaftTexture() {
  if (SHAFT) return SHAFT
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 128, 0, 0)
  g.addColorStop(0, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 128)
  SHAFT = new THREE.CanvasTexture(c)
  return SHAFT
}

function holoFloorTexture(districtAngles) {
  const s = 1024
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, s, s)
  ctx.strokeStyle = '#1c2a55'
  ctx.lineWidth = 1
  const step = (21 / 240) * (s / 2)
  for (let r = step; r <= s / 2; r += step) {
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const a of districtAngles) {
    ctx.beginPath()
    ctx.moveTo(s / 2, s / 2)
    ctx.lineTo(s / 2 + Math.cos(a) * (s / 2), s / 2 + Math.sin(a) * (s / 2))
    ctx.stroke()
  }
  return new THREE.CanvasTexture(c)
}

// ArchiveCity — the vault as a neon archive-city at night. Folder districts
// on a holo-deck, every note a glowing monolith whose height is its degree.
// Tall towers are hub notes; read the skyline like a bar chart of your brain.
export class ArchiveCityView {
  constructor(container, { onSelect, onHover }) {
    this.container = container
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.towers = []
    this.byId = new Map()
    this.labels = []
    this.beacons = []
    this.activeIds = null
    this.hoverId = null
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x04050a, 0.0035)
    this.scene.add(makeNebula('#101736', '#081226'))
    this.scene.add(makeStarfield(1200))
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 3000)
    this.camera.position.set(0, 150, 285)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = 1.45 // drone stays above the deck
    this.controls.maxDistance = 520

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.75, 0.5, 0.28] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex

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

    const folders = graph.folders
    const angles = folders.map((_, i) => i * GOLDEN)

    // holo-deck ground
    this.floorTex = holoFloorTexture(angles)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(240, 64),
      new THREE.MeshStandardMaterial({
        color: 0x05060c,
        roughness: 0.35,
        metalness: 0.85,
        emissive: 0x8fb4ff,
        emissiveMap: this.floorTex,
        emissiveIntensity: 0.25
      })
    )
    ground.rotation.x = -Math.PI / 2
    this.group.add(ground)

    const byFolder = new Map(folders.map((f) => [f.id, []]))
    for (const n of graph.notes) {
      if (!byFolder.has(n.folder)) byFolder.set(n.folder, [])
      byFolder.get(n.folder).push(n)
    }

    this.reflections = new THREE.Group()
    this.group.add(this.reflections)
    const winTex = windowTexture()

    folders.forEach((f, i) => {
      const members = (byFolder.get(f.id) || []).slice().sort((a, b) => (b.outLinks.length + b.inLinks.length) - (a.outLinks.length + a.inLinks.length))
      if (!members.length) return
      const Rd = 42 * Math.sqrt(i + 0.6)
      const th = angles[i]
      const cx = Math.cos(th) * Rd
      const cz = Math.sin(th) * Rd
      const rot = th + Math.PI / 2 // streets radiate from the city center
      const cells = districtGrid(members.length, 7.0)
      const color = new THREE.Color(f.color)

      members.forEach((note, k) => {
        const deg = note.outLinks.length + note.inLinks.length
        const H = Math.min(20, 4 + 2.4 * Math.sqrt(deg))
        const cell = cells[k]
        const x = cx + cell.gx * Math.cos(rot) - cell.gz * Math.sin(rot)
        const z = cz + cell.gx * Math.sin(rot) + cell.gz * Math.cos(rot)

        const mat = new THREE.MeshStandardMaterial({
          color: color.clone().multiplyScalar(0.35),
          emissive: color,
          emissiveIntensity: 0.9,
          emissiveMap: winTex,
          roughness: 0.4,
          metalness: 0.3
        })
        const mesh = new THREE.Mesh(UNIT_BOX, mat)
        mesh.scale.set(2.2, H, 2.2)
        mesh.position.set(x, H / 2, z)
        mesh.userData = { id: note.id, sharedGeo: true }
        this.group.add(mesh)

        const crown = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: softDot(), color: color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
        )
        crown.scale.set(3.2, 3.2, 1)
        crown.position.set(x, H + 0.6, z)
        this.group.add(crown)

        // wet-street mirror: inverted ghost clone
        const refl = new THREE.Mesh(
          UNIT_BOX,
          new THREE.MeshStandardMaterial({
            color: color.clone().multiplyScalar(0.35),
            emissive: color,
            emissiveIntensity: 0.35,
            emissiveMap: winTex,
            transparent: true,
            opacity: 0.14,
            depthWrite: false
          })
        )
        refl.scale.set(2.2, H, 2.2)
        refl.position.set(x, -H / 2, z)
        refl.userData = { sharedGeo: true }
        this.reflections.add(refl)

        const rec = { mesh, crown, refl, id: note.id, baseY: H / 2, H, lift: 0, active: true }
        this.towers.push(rec)
        this.byId.set(note.id, rec)

        const label = makeLabel(note.title, '#eef2ff', 0.032)
        label.position.set(x, H + 2.4, z)
        this.group.add(label)
        this.labels.push({ sprite: label, id: note.id })
      })

      // district beacon: crossed light shafts + always-on place name
      const shaftMat = new THREE.MeshBasicMaterial({
        map: shaftTexture(),
        color: color,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
      const shaftGroup = new THREE.Group()
      for (const r of [0, Math.PI / 2]) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 34), shaftMat)
        plane.rotation.y = rot + r
        plane.position.set(cx, 17, cz)
        plane.userData = { district: f.id, cx, cz }
        shaftGroup.add(plane)
      }
      this.group.add(shaftGroup)
      this.beacons.push({ group: shaftGroup, mat: shaftMat, phase: i * 1.7, cx, cz })

      const name = makeLabel(f.name, f.color, 0.07)
      name.position.set(cx, 30, cz)
      this.group.add(name)
      this.labels.push({ sprite: name, id: null, fixed: true })
    })

    // optional skyline links (tower top to tower top) — subtle even when on
    const segs = []
    for (const l of graph.links) {
      const a = this.byId.get(l.source)
      const b = this.byId.get(l.target)
      if (!a || !b) continue
      segs.push(a.mesh.position.x, a.H + 1, a.mesh.position.z, b.mesh.position.x, b.H + 1, b.mesh.position.z)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x86b8ff, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.lines.visible = this.showAllLinks !== false
    this.group.add(this.lines)

    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const t of this.towers) {
      const on = !idSet || idSet.has(t.id)
      t.active = on
      t.mesh.material.transparent = !on
      t.mesh.material.opacity = on ? 1 : 0.15
      t.mesh.material.emissiveIntensity = on ? 0.9 : 0.2
      t.crown.visible = on
      t.refl.visible = on
    }
  }

  setLinksMode(showAll) {
    this.showAllLinks = showAll !== false
    if (this.lines) this.lines.visible = this.showAllLinks
  }

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  focus(id) {
    const rec = this.byId.get(id)
    if (rec) {
      const p = rec.mesh.position
      this._flight = {
        from: this.camera.position.clone(),
        to: new THREE.Vector3(p.x, rec.H + 26, p.z + 40),
        look: new THREE.Vector3(p.x, rec.H / 2, p.z),
        t: 0
      }
    }
  }

  _pick(e, objects) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(objects)[0]
  }

  _hover(e) {
    const hit = this._pick(e, this.towers.map((t) => t.mesh))
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    const id = hit ? hit.object.userData.id : null
    if (id !== this.hoverId) {
      this.hoverId = id
      if (!id) this.onHover(null)
    }
  }

  _click(e) {
    const hit = this._pick(e, this.towers.map((t) => t.mesh))
    if (hit) {
      this.onSelect(hit.object.userData.id)
      return
    }
    const beacon = this._pick(e, this.beacons.flatMap((b) => b.group.children))
    if (beacon) {
      const { cx, cz } = beacon.object.userData
      this._flight = {
        from: this.camera.position.clone(),
        to: new THREE.Vector3(cx, 26, cz + 40),
        look: new THREE.Vector3(cx, 6, cz),
        t: 0
      }
    }
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt

    // hover lift + crown breathe; beacons pulse
    for (const t of this.towers) {
      const target = t.id === this.hoverId ? 0.8 : 0
      t.lift += (target - t.lift) * Math.min(1, dt * 10)
      t.mesh.position.y = t.baseY + t.lift
      t.mesh.material.emissiveIntensity = t.active ? (t.id === this.hoverId ? 1.8 : 0.9) : 0.2
      t.crown.position.y = t.H + 0.6 + t.lift
    }
    for (const b of this.beacons) {
      b.mat.opacity = 0.1 + Math.sin(this._t * 0.8 + b.phase) * 0.04
    }

    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (l.fixed) {
        // district place-names are the map — truly always-on, even with the
        // global labels toggle off (which is the default config)
        l.sprite.visible = true
        l.sprite.material.opacity = 0.95
        continue
      }
      if (this.labelsVisible === false) {
        l.sprite.visible = false
        continue
      }
      // skyline stays clean: note names only when the drone drops close
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      const o = Math.min(0.95, 1 - (d - 46) / 34)
      if (o < 0.06) {
        l.sprite.visible = false
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

    if (this.hoverId) {
      const rec = this.byId.get(this.hoverId)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const h = this.container.clientHeight || 800
        tmp.copy(rec.mesh.position).setY(rec.H).project(this.camera)
        this.onHover({ id: this.hoverId, x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, pinned: false })
      }
    }

    this.controls.update()
    if (this.grade) this.grade.uniforms.time.value = this._t
    this.composer.render()
  }

  _clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child.isGroup) {
        for (const sub of [...child.children]) {
          sub.material?.dispose()
          if (!sub.userData?.sharedGeo) sub.geometry?.dispose()
        }
      } else {
        child.material?.dispose()
        if (!child.userData?.sharedGeo) child.geometry?.dispose()
      }
    }
    if (this.floorTex) {
      this.floorTex.dispose()
      this.floorTex = null
    }
    this.towers = []
    this.byId = new Map()
    this.labels = []
    this.beacons = []
    this.reflections = null
    this.lines = null
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
