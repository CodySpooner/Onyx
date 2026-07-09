import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { hashAngle } from '../lib/graph.mjs'
import { createSim } from '../lib/force.mjs'
import { detectClusters, CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, LinkPulses, softDot } from '../lib/scenery.js'
import { easeInOutCubic, easeOutBack, clamp01 } from '../lib/cinemath.mjs'
import { paletteFor, val, folderColorIndex, effective } from '../lib/graph-settings.mjs'

const ORPHAN_COLOR = '#4a5470'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class BrainView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
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
    const themeN = paletteFor(settings).nebula
    this.scene.add(makeNebula(themeN[0], themeN[1]))
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
    this._onDown = (e) => this._grabStart(e)
    this._onUp = (e) => this._grabEnd(e)
    this._grab = null // { rec, plane, last, vel, moved, startX, startY }
    this._onDbl = (e) => this._dblclick(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('pointermove', this._onMove)
    this.renderer.domElement.addEventListener('pointerdown', this._onDown)
    this.renderer.domElement.addEventListener('pointerup', this._onUp)
    this.renderer.domElement.addEventListener('pointercancel', this._onUp)
    this.renderer.domElement.addEventListener('click', this._onClick)
    this.renderer.domElement.addEventListener('dblclick', this._onDbl)
    window.addEventListener('resize', this._onResize)

    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
  }

  update(graph) {
    this.graph = graph
    const prevIds = new Set(this.byId.keys()) // stagger only NEW notes — saves must not replay the show
    let newCount = 0
    this._clear()
    // node records are about to be rebuilt — drop any path refs to old orbs
    this.pathIds = null
    this.pathSet = null
    this.pathPairs = []

    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    const eff0 = effective(this.settings)
    this.sim = createSim(ids, graph.links, {
      repulsion: eff0['physics.repulsion'],
      restLen: eff0['physics.linkLength'],
      maxRadius: eff0['physics.spread'],
      center: eff0['physics.gravity']
    })
    this.sim.tick(300) // warm up before first paint

    const theme = paletteFor(this.settings)
    const byFolder = val(this.settings, 'theme.folderColors')
    const gemShape = val(this.settings, 'look.gemShape')
    const spawnOn = eff0['motion.spawn']
    graph.notes.forEach((note) => {
      const simNode = this.sim.byId.get(note.id)
      const ci = clusterOf.get(note.id)
      const colorHex = byFolder
        ? theme.clusters[folderColorIndex(note.folder)]
        : ci >= 0
          ? theme.clusters[ci % theme.clusters.length]
          : theme.orphan
      const deg = note.outLinks.length + note.inLinks.length
      const size = clamp(0.55 + deg * 0.11, 0.55, 2.4)
      const orb = makeOrb(colorHex, size, note.type, note.id, gemShape)
      orb.mesh.position.set(simNode.x, simNode.y, simNode.z)
      this.group.add(orb.mesh)
      const rec = { ...orb, id: note.id, simNode, baseSize: size, phase: hashAngle(note.id), active: true, cluster: ci, bornAt: !spawnOn || prevIds.has(note.id) ? this._t - 0.6 : this._t + newCount++ * 0.015 }
      this.nodes.push(rec)
      this.byId.set(note.id, rec)

      const label = makeLabel(note.title, '#eef2ff', 0.032)
      label.userData.baseW = label.scale.x
      label.userData.baseH = label.scale.y
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
    this.pulses = new LinkPulses(this.group, this.segArray, paletteFor(this.settings).pulse, Math.round(90 * effective(this.settings)['motion.pulses']))

    // hover highlight overlay (incident links only)
    // path-finding overlay: the shortest chain between two notes, gold + bright
    this.pathGeo = new THREE.BufferGeometry()
    this.pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.pathLines = new THREE.LineSegments(
      this.pathGeo,
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.pathLines.visible = false
    this.group.add(this.pathLines)

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
    this._applyDim()
  }

  // dim rule: a live path wins (only its notes lit); else the active filter
  _applyDim() {
    const path = this.pathSet
    for (const n of this.nodes) {
      const on = path ? path.has(n.id) : !this.activeIds || this.activeIds.has(n.id)
      n.active = on
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : path ? 0.05 : 0.12
      n.mesh.material.emissiveIntensity = on ? 0.9 : 0.25
    }
  }

  // public: highlight the shortest chain between two notes (path lens)
  setPath(ids) {
    this.pathIds = Array.isArray(ids) && ids.length ? ids : null
    this.pathSet = this.pathIds ? new Set(this.pathIds) : null
    this.pathPairs = []
    if (this.pathIds) {
      for (let i = 0; i < this.pathIds.length - 1; i++) {
        const a = this.byId.get(this.pathIds[i])
        const b = this.byId.get(this.pathIds[i + 1])
        if (a && b) this.pathPairs.push([a, b])
      }
      this._frameNodes(this.pathIds)
    }
    if (this.pathLines) this.pathLines.visible = !!this.pathPairs.length
    this._applyDim()
  }

  // ease the camera to frame a set of nodes (fit their bounding sphere)
  _frameNodes(ids) {
    const pts = ids.map((id) => this.byId.get(id)?.mesh.position).filter(Boolean)
    if (!pts.length) return
    const c = new THREE.Vector3()
    for (const p of pts) c.add(p)
    c.multiplyScalar(1 / pts.length)
    let r = 0
    for (const p of pts) r = Math.max(r, p.distanceTo(c))
    const dist = Math.max(60, r * 2.4 + 40)
    this._flight = {
      from: this.camera.position.clone(),
      to: new THREE.Vector3(c.x, c.y + dist * 0.3, c.z + dist),
      look: c.clone(),
      t: 0
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

  // ── physics play mode: grab an orb and throw it ──
  _grabStart(e) {
    if (e.button !== 0) return
    const hit = this._pick(e)
    if (!hit) return
    const rec = this.byId.get(hit.object.userData.id)
    if (!rec) return
    const normal = this.camera.getWorldDirection(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, rec.mesh.position.clone())
    this.controls.enabled = false // no camera lurch during the 0-6px candidate phase
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId) // releases outside the canvas still reach us
    } catch { /* pointer capture unsupported → window-edge release stays best-effort */ }
    this._grab = {
      rec,
      plane,
      last: rec.mesh.position.clone(),
      vel: new THREE.Vector3(),
      moved: false,
      startX: e.clientX,
      startY: e.clientY
    }
  }

  _grabMove(e) {
    const g = this._grab
    if (!g) return false
    if (!g.moved) {
      // 6px promotion threshold: below it, click/dblclick behave as before
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 6) return false
      g.moved = true
      g.rec.mesh.material.emissiveIntensity = 1.8
      this.renderer.domElement.style.cursor = 'grabbing'
    }
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const target = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(g.plane, target)) {
      const instVel = target.clone().sub(g.last).multiplyScalar(6) // smoothed toward per-tick scale
      g.vel.lerp(instVel, 0.35)
      g.last.copy(target)
      const n = g.rec.simNode
      n.x = target.x
      n.y = target.y
      n.z = target.z
      n.vx = 0
      n.vy = 0
      n.vz = 0
    }
    return true
  }

  _grabEnd(e) {
    const g = this._grab
    this._grab = null
    if (!g) return
    this.controls.enabled = true // re-enable even for a plain click-grab
    try {
      if (e?.pointerId != null) this.renderer.domElement.releasePointerCapture(e.pointerId)
    } catch { /* already released */ }
    if (!g.moved) return
    g.rec.mesh.material.emissiveIntensity = 0.9
    this.renderer.domElement.style.cursor = 'default'
    // throw: hand the smoothed velocity to the sim, clamped to 8 units/tick
    const v = g.vel.clone()
    const len = v.length()
    if (len > 8) v.multiplyScalar(8 / len)
    const n = g.rec.simNode
    n.vx = v.x
    n.vy = v.y
    n.vz = v.z
    this._justThrew = true // swallow the click that follows pointerup
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh))[0]
  }

  _hover(e) {
    if (this._grabMove(e)) return
    const hit = this._pick(e)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    if (!this.pinned) this._setHover(hit ? hit.object.userData.id : null)
  }

  _click(e) {
    if (this._justThrew) {
      this._justThrew = false
      return
    }
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
    const rdt = Math.min(0.05, this.clock.getDelta()) // real time — FX that must finish
    let dt = rdt
    if (this.eff) dt *= this.eff['motion.speed']
    this._t += dt

    if (this.sim) this.sim.tick(2)
    if (this._grab?.moved) {
      const g = this._grab
      const n = g.rec.simNode
      n.x = g.last.x
      n.y = g.last.y
      n.z = g.last.z
      n.vx = 0
      n.vy = 0
      n.vz = 0
    }

    // copy sim → meshes with hash-phased micro-drift (display only)
    for (const n of this.nodes) {
      const p = n.simNode
      n.mesh.position.set(
        p.x + Math.sin(this._t * 0.7 + n.phase) * 0.35,
        p.y + Math.sin(this._t * 0.9 + n.phase * 2) * 0.35,
        p.z + Math.cos(this._t * 0.8 + n.phase) * 0.35
      )
      if (!this.eff || this.eff['motion.spin']) {
        n.mesh.rotation.x += n.spinX
        n.mesh.rotation.y += n.spinY
      }
      const pulse = 1 + Math.sin(this._t * 1.5 + n.pulse) * 0.07
      // staggered cascade-pop on (re)build — easeOutBack overshoot sells it.
      // speed 0 freezes _t, which would leave every orb at scale 0 forever —
      // treat the cascade as done so the graph stays visible
      n.spawnK = this.eff && this.eff['motion.speed'] === 0 ? 1 : clamp01((this._t - (n.bornAt ?? 0)) / 0.6)
      const spawn = easeOutBack(n.spawnK)
      n.mesh.scale.setScalar(Math.max(0.001, n.baseSize * (this.eff ? this.eff['look.nodeSize'] : 1) * pulse * (n.active ? 1 : 0.55) * spawn))
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
    // path overlay follows the moving nodes; gentle pulse so it reads as active
    if (this.pathPairs && this.pathPairs.length && this.pathGeo) {
      const seg = []
      for (const [a, b] of this.pathPairs) {
        seg.push(a.mesh.position.x, a.mesh.position.y, a.mesh.position.z, b.mesh.position.x, b.mesh.position.y, b.mesh.position.z)
      }
      this.pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3))
      this.pathGeo.attributes.position.needsUpdate = true
      this.pathLines.material.opacity = 0.7 + Math.sin(this._t * 3) * 0.25
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
      const ls = this.eff ? this.eff['look.labelSize'] : 1
      if (l.sprite.userData.ls !== ls) {
        l.sprite.userData.ls = ls
        l.sprite.scale.set(l.sprite.userData.baseW * ls, l.sprite.userData.baseH * ls, 1)
      }
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      const reach = this.eff ? this.eff['look.labelFade'] : 1
      let o = Math.min(0.95, 1 - (d - 230 * reach) / (230 * reach))
      if (l.rec.spawnK != null) o *= l.rec.spawnK // labels fade in with their orbs
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
      const k = easeInOutCubic(this._flight.t)
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) {
        // arrival ring flash at the destination
        const ring = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: softDot(), color: 0xbfe0ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
        )
        ring.position.copy(this._flight.look)
        ring.scale.setScalar(2)
        this.group.add(ring)
        this._ringFx = { sprite: ring, t: 0 }
        this._flight = null
      }
    }
    if (this._ringFx) {
      this._ringFx.t += rdt * 2 // real time — must finish even at speed 0
      const rk = Math.min(1, this._ringFx.t)
      this._ringFx.sprite.scale.setScalar(2 + rk * 9)
      this._ringFx.sprite.material.opacity = 0.7 * (1 - rk)
      if (rk >= 1) {
        this.group.remove(this._ringFx.sprite)
        this._ringFx.sprite.material.dispose()
        this._ringFx = null
      }
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

  setSettings(s) {
    this.settings = s
    applyCommonSettings(this, s)
    if (this.sim) {
      // physics sliders steer the running sim — no rebuild
      const e = this.eff
      this.sim.o.repulsion = e['physics.repulsion']
      this.sim.o.restLen = e['physics.linkLength']
      this.sim.o.maxRadius = e['physics.spread']
      this.sim.o.center = e['physics.gravity']
    }
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
    this.renderer.domElement.removeEventListener('pointerdown', this._onDown)
    this.renderer.domElement.removeEventListener('pointerup', this._onUp)
    this.renderer.domElement.removeEventListener('pointercancel', this._onUp)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    this.renderer.domElement.removeEventListener('dblclick', this._onDbl)
    window.removeEventListener('resize', this._onResize)
    clearTimeout(this._clickTimer)
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
