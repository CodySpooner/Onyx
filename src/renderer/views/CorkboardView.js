import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeEnv, makeComposer, applyCommonSettings } from '../lib/cinema.js'
import { detectClusters } from '../lib/clusters.mjs'
import { cleanFolder } from '../lib/stats.mjs'

const CARD_W = 9
const CARD_H = 5.6
const GAP = 2.4
const BLOCK_GAP = 8
const MAX_ROW = 150 // board wraps to a new shelf past this width
// fixed geometry reused across every rebuild (truly shared → never disposed)
const CARD_GEO = new THREE.PlaneGeometry(CARD_W, CARD_H)
const BOARD_GEO = new THREE.PlaneGeometry(2000, 2000)

let CORK = null
function corkTexture() {
  if (CORK) return CORK
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#b98a4e'
  ctx.fillRect(0, 0, s, s)
  let seed = 8
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 9000; i++) {
    const g = 40 + rnd() * 90
    ctx.fillStyle = `rgba(${90 + g},${60 + g * 0.7},${28 + g * 0.4},${0.12 + rnd() * 0.18})`
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  CORK = new THREE.CanvasTexture(c)
  CORK.wrapS = CORK.wrapT = THREE.RepeatWrapping
  return CORK
}

// an index-card texture: cream stock, folder-color header band, inked title
function cardTexture(note, folderColor) {
  const W = 360
  const H = 224
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f3ead6'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = folderColor
  ctx.fillRect(0, 0, W, 12)
  ctx.strokeStyle = 'rgba(120,90,60,0.25)'
  ctx.lineWidth = 1
  for (let y = 70; y < H - 12; y += 30) {
    ctx.beginPath()
    ctx.moveTo(16, y)
    ctx.lineTo(W - 16, y)
    ctx.stroke()
  }
  ctx.fillStyle = '#2a2018'
  ctx.font = '600 26px Inter, Georgia, serif'
  const words = String(note.title || 'Untitled').split(/\s+/)
  let line = ''
  let y = 52
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd
    if (ctx.measureText(test).width > W - 32 && line) {
      ctx.fillText(line, 16, y)
      line = wd
      y += 32
      if (y > 150) break
    } else line = test
  }
  if (y <= 150) ctx.fillText(line, 16, y)
  ctx.fillStyle = '#8a6a48'
  ctx.font = '15px Inter, sans-serif'
  ctx.fillText(cleanFolder(note.folder || ''), 16, H - 20)
  const deg = (note.outLinks?.length || 0) + (note.inLinks?.length || 0)
  ctx.textAlign = 'right'
  ctx.fillText(deg + ' link' + (deg === 1 ? '' : 's'), W - 16, H - 20)
  const tex = new THREE.CanvasTexture(c)
  return tex
}

// Corkboard — the vault as a detective's case board. Every note is a pinned
// index card you can actually read; links are red string; folders cluster into
// regions. Face-on, pan/zoom, warm and tactile.
export class CorkboardView {
  constructor(container, { onSelect, onHover, settings = null }) {
    this.container = container
    this.settings = settings
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.cards = []
    this.byId = new Map()
    this.activeIds = null
    this.hoverId = null
    this._t = 0

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x2b2016)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 4000)
    this.camera.position.set(0, 0, 160)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableRotate = false // stays face-on to the wall
    this.controls.enableDamping = true
    this.controls.screenSpacePanning = true
    this.controls.minDistance = 30
    this.controls.maxDistance = 320
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.18, 0.8, 0.85] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex
    this.scene.add(new THREE.AmbientLight(0xfff2dd, 1.1))
    const key = new THREE.DirectionalLight(0xfff0d8, 0.6)
    key.position.set(-40, 60, 120)
    this.scene.add(key)
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

  update(graph) {
    this.graph = graph
    this._clear()

    // cork backdrop
    const board = new THREE.Mesh(
      BOARD_GEO,
      new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 0.95 })
    )
    corkTexture().repeat.set(30, 30)
    board.position.z = -3
    board.userData = { sharedGeo: true }
    this.group.add(board)

    // group notes by folder → board regions
    const folders = new Map()
    for (const n of graph.notes) {
      const f = n.folder || '(root)'
      if (!folders.has(f)) folders.set(f, [])
      folders.get(f).push(n)
    }
    const folderColor = new Map(graph.folders.map((f) => [f.id, f.color || '#c77dff']))

    const pos = new Map()
    let cx = 0
    let rowMaxH = 0
    let rowTop = 0
    const blocks = [...folders.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [fid, notes] of blocks) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(notes.length)))
      const rows = Math.ceil(notes.length / cols)
      const blockW = cols * (CARD_W + GAP)
      const blockH = rows * (CARD_H + GAP) + 6
      if (cx + blockW > MAX_ROW && cx > 0) {
        cx = 0
        rowTop -= rowMaxH + BLOCK_GAP
        rowMaxH = 0
      }
      notes.forEach((n, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        pos.set(n.id, {
          x: cx + col * (CARD_W + GAP),
          y: rowTop - 6 - row * (CARD_H + GAP),
          folderColor: folderColor.get(fid) || '#c77dff'
        })
      })
      rowMaxH = Math.max(rowMaxH, blockH)
      cx += blockW + BLOCK_GAP
    }

    // center the whole board
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of pos.values()) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    const ox = (minX + maxX) / 2
    const oy = (minY + maxY) / 2
    for (const p of pos.values()) { p.x -= ox; p.y -= oy }
    this._boardW = maxX - minX + CARD_W
    this._boardH = maxY - minY + CARD_H

    // pushpin sprite (shared)
    const pinMat = new THREE.SpriteMaterial({ color: 0xd0342c, transparent: true, opacity: 0.95 })

    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h }
    for (const n of graph.notes) {
      const p = pos.get(n.id)
      const tex = cardTexture(n, p.folderColor)
      const card = new THREE.Mesh(
        CARD_GEO,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
      )
      const tilt = ((hash(n.id) % 100) / 100 - 0.5) * 0.14 // slight pinned-askew
      card.rotation.z = tilt
      card.position.set(p.x, p.y, 0)
      card.userData = { id: n.id, sharedGeo: true } // CARD_GEO is module-shared
      this.group.add(card)
      const pin = new THREE.Sprite(pinMat)
      pin.scale.set(1.4, 1.4, 1)
      pin.position.set(p.x, p.y + CARD_H / 2 - 0.6, 0.4)
      this.group.add(pin)
      this.cards.push({ id: n.id, card, tex, base: 0, x: p.x, y: p.y, active: true })
      this.byId.set(n.id, { x: p.x, y: p.y })
    }

    // red string between linked cards, gently sagging
    const clusters = detectClusters(graph.notes.map((n) => n.id), graph.links)
    this._stringGroup = new THREE.Group()
    this.group.add(this._stringGroup)
    for (const l of graph.links) {
      const a = pos.get(l.source)
      const b = pos.get(l.target)
      if (!a || !b) continue
      const mid = new THREE.Vector3((a.x + b.x) / 2, Math.min(a.y, b.y) - 2.5 - Math.hypot(a.x - b.x, a.y - b.y) * 0.04, 1)
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, a.y + CARD_H / 2 - 0.6, 0.6), mid, new THREE.Vector3(b.x, b.y + CARD_H / 2 - 0.6, 0.6))
      const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(16))
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0.4 }))
      line.userData = { a: l.source, b: l.target }
      this._stringGroup.add(line)
    }
    void clusters

    // frame the whole board
    this.camera.position.set(0, 0, Math.max(90, this._boardW * 0.62))
    this.controls.target.set(0, 0, 0)
    this.setActive(this.activeIds)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const c of this.cards) {
      const on = !idSet || idSet.has(c.id)
      c.active = on
      c.card.material.opacity = on ? 1 : 0.25
      c.card.material.transparent = !on
    }
  }

  setLinksMode(showAll) {
    if (this._stringGroup) this._stringGroup.visible = showAll !== false
  }

  setLabels() { /* titles are always on the cards */ }

  focus(id) {
    const p = this.byId.get(id)
    if (p) this._flight = { from: this.camera.position.clone(), to: new THREE.Vector3(p.x, p.y, 42), look: new THREE.Vector3(p.x, p.y, 0), t: 0 }
  }

  setPath(ids) {
    this.pathSet = Array.isArray(ids) && ids.length ? new Set(ids) : null
    this.setActive(this.activeIds)
    if (this.pathSet) {
      for (const c of this.cards) {
        const on = this.pathSet.has(c.id)
        c.card.material.opacity = on ? 1 : 0.12
        c.card.material.transparent = !on
      }
    }
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.cards.map((c) => c.card))[0]
  }

  _hover(e) {
    const hit = this._pick(e)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'
    const id = hit ? hit.object.userData.id : null
    if (id !== this.hoverId) {
      this.hoverId = id
      // highlight this card's strings
      if (this._stringGroup) {
        for (const s of this._stringGroup.children) {
          const inc = id && (s.userData.a === id || s.userData.b === id)
          s.material.opacity = id ? (inc ? 0.95 : 0.12) : 0.4
          s.material.color.setHex(inc ? 0xff5540 : 0xc0392b)
        }
      }
      if (!id) this.onHover(null)
    }
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
    for (const c of this.cards) {
      const lift = c.id === this.hoverId ? 3.2 : 0
      c.card.position.z += (lift - c.card.position.z) * Math.min(1, dt * 12)
    }
    if (this.hoverId) {
      const p = this.byId.get(this.hoverId)
      if (p) {
        const w = this.container.clientWidth || 1400
        const hh = this.container.clientHeight || 800
        const v = new THREE.Vector3(p.x, p.y + CARD_H / 2, 3).project(this.camera)
        this.onHover({ id: this.hoverId, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * hh, pinned: false })
      }
    }
    if (this._flight) {
      this._flight.t = Math.min(1, this._flight.t + 0.02)
      const k = this._flight.t * (2 - this._flight.t)
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) this._flight = null
    }
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
      this.clock.getDelta()
      this._loop()
    }
  }

  _clear() {
    for (const c of this.cards) c.tex?.dispose()
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child.isGroup) {
        for (const sub of [...child.children]) { sub.material?.dispose(); sub.geometry?.dispose() }
      }
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.cards = []
    this.byId = new Map()
    this._stringGroup = null
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
    if (this.renderer.domElement.parentNode === this.container) this.container.removeChild(this.renderer.domElement)
  }
}
