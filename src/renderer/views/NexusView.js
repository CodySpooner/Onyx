import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeEnv, makeComposer } from '../lib/cinema.js'
import { hashAngle } from '../lib/graph.mjs'
import { createSim } from '../lib/force.mjs'
import { detectClusters, CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { makeLabel } from '../lib/label.js'
import { addLights, makeStarfield, makeNebula, makeGlowShafts, softDot, unitGeometry, SHAPES, shapeFor } from '../lib/scenery.js'
import { buildCurveTable, advanceMote } from '../lib/flow.mjs'

const ORPHAN_COLOR = '#4a5470'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const SAMPLES = 24

// NEXUS CORE — the living neural nebula. A chromatic plasma heart, orbital
// rings and a shard halo, the whole vault as instanced gems on a galactic
// disc, and 1200 thought-motes flowing along link curves into the core.
// Despite being the richest lens it draws in ~15 calls — everything heavy
// is instanced or a single Points buffer.
export class NexusView {
  constructor(container, { onSelect, onHover }) {
    this.container = container
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.recs = [] // { id, kind, instanceIdx, pos, seed, size, active }
    this.byMesh = new Map() // InstancedMesh → recs array (index-aligned)
    this.labels = []
    this.labelsVisible = true
    this.showAllLinks = true
    this.activeIds = null
    this.hoverId = null
    this.pinned = false
    this._t = 0
    this._clickTimer = null
    this._scratch = new THREE.Object3D()

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x05040c, 0.0012)
    this.scene.add(makeNebula('#2a0a4d', '#0a2a4c'))
    this.scene.add(makeStarfield(1200))
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 3000)
    this.camera.position.set(0, 70, 210)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 620

    const cine = makeComposer(this.renderer, this.scene, this.camera, { w, h, bloom: [0.55, 0.5, 0.4] })
    this.composer = cine.composer
    this.cineDispose = cine.dispose
    this.grade = cine.grade
    this.envTex = makeEnv(this.renderer)
    this.scene.environment = this.envTex

    this.group = new THREE.Group()
    this.scene.add(this.group)

    // ── the heart: noise-displaced fresnel plasma ──
    this.coreMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float time;
        varying vec3 vN;
        varying vec3 vV;
        varying float vNoise;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float vnoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n = mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
          return n;
        }
        void main() {
          float n = vnoise(position * 0.45 + time * 0.25) * 0.7 + vnoise(position * 1.1 - time * 0.18) * 0.3;
          vNoise = n;
          vec3 p = position + normal * n * 1.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalMatrix * normal;
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying float vNoise;
        void main() {
          vec3 N = normalize(vN);
          vec3 V = normalize(vV);
          float fres = pow(1.0 - max(0.0, dot(N, V)), 2.5);
          vec3 base = mix(vec3(0.23, 0.10, 0.56), vec3(0.35, 0.94, 1.0), vNoise);
          vec3 col = base * 0.85 + fres * vec3(1.1);
          gl_FragColor = vec4(col, 1.0);
        }`
    })
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 4), this.coreMat)
    this.group.add(this.core)

    this.rings = []
    for (const [tilt, dir] of [[0.42, 1], [-0.42, -1]]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(9.5, 0.07, 8, 90),
        new THREE.MeshBasicMaterial({ color: 0x7f9dff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      ring.rotation.x = Math.PI / 2 + tilt
      ring.userData.dir = dir
      this.group.add(ring)
      this.rings.push(ring)
    }

    // shard halo: 48 instanced octahedra on phased tilted ellipses
    this.shardMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fb8ff,
      emissive: 0x3a4fd0,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.2,
      clearcoat: 1,
      envMapIntensity: 1.4,
      flatShading: true
    })
    this.shards = new THREE.InstancedMesh(unitGeometry('octa'), this.shardMat, 48)
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.shards)

    this.shaftA = makeGlowShafts('#59f0ff', 60, 4, 0.1)
    this.shaftA.position.y = -30
    this.group.add(this.shaftA)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this._onMove = (e) => this._hover(e)
    this._onClick = (e) => this._click(e)
    this._onDbl = (e) => this._dblclick(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('pointermove', this._onMove)
    this.renderer.domElement.addEventListener('click', this._onClick)
    this.renderer.domElement.addEventListener('dblclick', this._onDbl)
    window.addEventListener('resize', this._onResize)

    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
  }

  update(graph) {
    this.graph = graph
    this._clearGraph()

    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    const sim = createSim(ids, graph.links)
    sim.tick(300)
    // flatten to a galactic disc and normalize radius to ~130
    let maxR = 1
    for (const n of sim.nodes) maxR = Math.max(maxR, Math.hypot(n.x, n.y * 0.35, n.z))
    const scale = 130 / maxR

    // bucket notes by gem kind → one InstancedMesh per kind
    const buckets = new Map(SHAPES.map((k) => [k, []]))
    graph.notes.forEach((note) => {
      const sn = sim.byId.get(note.id)
      const pos = new THREE.Vector3(sn.x * scale, sn.y * 0.35 * scale, sn.z * scale)
      // keep the heart clear
      const r = Math.hypot(pos.x, pos.z)
      if (r < 22) {
        const f = 22 / Math.max(r, 0.001)
        pos.x *= f
        pos.z *= f
      }
      const ci = clusterOf.get(note.id)
      const deg = note.outLinks.length + note.inLinks.length
      buckets.get(shapeFor(note.type)).push({
        id: note.id,
        pos,
        seed: hashAngle(note.id),
        size: clamp(0.55 + deg * 0.11, 0.55, 2.4),
        color: new THREE.Color(ci >= 0 ? CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length] : ORPHAN_COLOR),
        active: true
      })

      const label = makeLabel(note.title, '#eef2ff', 0.032)
      label.position.set(pos.x, pos.y + 3, pos.z)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id, pos })
    })

    this.instMeshes = []
    for (const [kind, recs] of buckets) {
      if (!recs.length) continue
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x000000, // instanceColor can't tint emissive — white glow washed the clusters
        emissiveIntensity: 0,
        roughness: 0.22,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.25,
        flatShading: kind !== 'sphere'
      })
      const mesh = new THREE.InstancedMesh(unitGeometry(kind), mat, recs.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      recs.forEach((r, i) => {
        r.instanceIdx = i
        mesh.setColorAt(i, r.color)
      })
      mesh.instanceColor.needsUpdate = true
      mesh.userData.sharedGeo = true
      this.group.add(mesh)
      this.byMesh.set(mesh, recs)
      this.instMeshes.push(mesh)
      this.recs.push(...recs)
    }
    this.recById = new Map(this.recs.map((r) => [r.id, r]))

    // link-flow curve table (built once) + mote swarm
    const posOf = this.recById
    const triples = []
    for (const l of graph.links) {
      const a = posOf.get(l.source)
      const b = posOf.get(l.target)
      if (!a || !b) continue
      const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5).lerp(new THREE.Vector3(0, 0, 0), 0.35)
      mid.y += 4 + a.pos.distanceTo(b.pos) * 0.08
      triples.push(a.pos.x, a.pos.y, a.pos.z, mid.x, mid.y, mid.z, b.pos.x, b.pos.y, b.pos.z)
    }
    this.nSeg = triples.length / 9
    this.table = buildCurveTable(triples, SAMPLES)
    const nMotes = Math.min(650, this.nSeg * 3)
    this.motes = []
    const mPos = new Float32Array(Math.max(1, nMotes) * 3)
    const mCol = new Float32Array(Math.max(1, nMotes) * 3)
    const white = new THREE.Color(0xffffff)
    for (let i = 0; i < nMotes; i++) {
      const seg = i % this.nSeg
      this.motes.push({ seg, t: (i * 0.37) % 1, speed: 0.10 + (i % 7) * 0.02 })
      const l = graph.links[seg]
      const src = posOf.get(l?.source)
      const c = (src ? src.color.clone() : new THREE.Color(0x88aaff)).lerp(white, 0.35)
      mCol[i * 3] = c.r
      mCol[i * 3 + 1] = c.g
      mCol[i * 3 + 2] = c.b
    }
    const mGeo = new THREE.BufferGeometry()
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3))
    mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3))
    this.moteGeo = mGeo
    this.motePoints = new THREE.Points(
      mGeo,
      new THREE.PointsMaterial({ vertexColors: true, size: 2.1, map: softDot(), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
    )
    if (nMotes > 0) this.group.add(this.motePoints)

    this.setActive(this.activeIds)
    this.setLinksMode(this.showAllLinks)
  }

  setActive(idSet) {
    this.activeIds = idSet
    const dim = new THREE.Color()
    for (const [mesh, recs] of this.byMesh) {
      for (const r of recs) {
        r.active = !idSet || idSet.has(r.id)
        dim.copy(r.color)
        if (!r.active) dim.multiplyScalar(0.15)
        mesh.setColorAt(r.instanceIdx, dim)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  setLinksMode(showAll) {
    this.showAllLinks = showAll !== false
    if (this.motePoints) this.motePoints.visible = this.showAllLinks
  }

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  focus(id) {
    const rec = this.recById?.get(id)
    if (rec) {
      this._flight = {
        from: this.camera.position.clone(),
        to: rec.pos.clone().add(new THREE.Vector3(0, 10, 38)),
        look: rec.pos.clone(),
        t: 0
      }
    }
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.instMeshes || [])[0]
    if (!hit || hit.instanceId == null) return null
    const recs = this.byMesh.get(hit.object)
    return recs ? recs[hit.instanceId] : null
  }

  _setHover(id) {
    if (id === this.hoverId) return
    this.hoverId = id
    if (!id && !this.pinned) this.onHover(null)
  }

  _hover(e) {
    const rec = this._pick(e)
    this.renderer.domElement.style.cursor = rec ? 'pointer' : 'default'
    if (!this.pinned) this._setHover(rec ? rec.id : null)
  }

  _click(e) {
    const rec = this._pick(e)
    clearTimeout(this._clickTimer)
    if (!rec) {
      this.pinned = false
      this._setHover(null)
      this.onHover(null)
      return
    }
    this._clickTimer = setTimeout(() => {
      this.pinned = true
      this._setHover(rec.id)
      this.focus(rec.id)
    }, 240)
  }

  _dblclick(e) {
    clearTimeout(this._clickTimer)
    const rec = this._pick(e)
    if (rec) this.onSelect(rec.id)
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt
    const t = this._t

    this.coreMat.uniforms.time.value = t
    const beat = 1 + Math.sin(t * 1.4) * 0.05
    this.core.scale.setScalar(beat)
    for (const ring of this.rings) ring.rotation.z += dt * 0.1 * ring.userData.dir
    this.shaftA.rotation.y += dt * 0.1

    // shard halo orbits
    for (let i = 0; i < 48; i++) {
      const ph = i * 0.618 * Math.PI * 2
      const rr = 11 + (i % 5)
      const a = t * (0.15 + (i % 3) * 0.05) + ph
      this._scratch.position.set(Math.cos(a) * rr, Math.sin(a * 0.7 + ph) * 3.5, Math.sin(a) * rr)
      this._scratch.rotation.set(a, ph, a * 0.5)
      this._scratch.scale.setScalar(0.25 + (i % 4) * 0.08)
      this._scratch.updateMatrix()
      this.shards.setMatrixAt(i, this._scratch.matrix)
    }
    this.shards.instanceMatrix.needsUpdate = true

    // instanced gems: spin + pulse in place
    for (const [mesh, recs] of this.byMesh) {
      for (const r of recs) {
        const pulse = 1 + Math.sin(t * 1.5 + r.seed) * 0.07
        this._scratch.position.copy(r.pos)
        this._scratch.rotation.set(t * 0.2 + r.seed, t * 0.15 + r.seed * 2, 0)
        this._scratch.scale.setScalar(r.size * pulse * (r.active ? 1 : 0.55))
        this._scratch.updateMatrix()
        mesh.setMatrixAt(r.instanceIdx, this._scratch.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    // motes flow along the curve table
    if (this.motes?.length && this.nSeg > 0) {
      const arr = this.moteGeo.attributes.position.array
      const out = [0, 0, 0]
      for (let i = 0; i < this.motes.length; i++) {
        advanceMote(this.motes[i], dt, this.nSeg, SAMPLES, this.table, out)
        arr[i * 3] = out[0]
        arr[i * 3 + 1] = out[1]
        arr[i * 3 + 2] = out[2]
      }
      this.moteGeo.attributes.position.needsUpdate = true
    }

    // labels
    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (!this.labelsVisible) {
        l.sprite.visible = false
        continue
      }
      const d = tmp.copy(l.pos).distanceTo(cam)
      let o = Math.min(0.95, 1 - (d - 170) / 190)
      if (this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
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
      const rec = this.recById.get(this.hoverId)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const h = this.container.clientHeight || 800
        tmp.copy(rec.pos).project(this.camera)
        this.onHover({ id: this.hoverId, x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, pinned: this.pinned })
      }
    }

    if (this.grade) this.grade.uniforms.time.value = this._t
    this.controls.update()
    this.composer.render()
  }

  _clearGraph() {
    for (const mesh of this.instMeshes || []) {
      this.group.remove(mesh)
      mesh.material.dispose() // geometry is shared (unitGeometry cache)
    }
    for (const l of this.labels) {
      this.group.remove(l.sprite)
      l.sprite.material.dispose()
    }
    if (this.motePoints) {
      this.group.remove(this.motePoints)
      this.motePoints.geometry.dispose()
      this.motePoints.material.dispose()
      this.motePoints = null
    }
    this.instMeshes = []
    this.byMesh = new Map()
    this.recs = []
    this.labels = []
    this.motes = []
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
    this.renderer.domElement.removeEventListener('dblclick', this._onDbl)
    window.removeEventListener('resize', this._onResize)
    clearTimeout(this._clickTimer)
    this._clearGraph()
    this.core.geometry.dispose()
    this.coreMat.dispose()
    for (const ring of this.rings) {
      ring.geometry.dispose()
      ring.material.dispose()
    }
    this.shards.dispose()
    this.shardMat.dispose()
    this.shaftA.children[0]?.material.dispose()
    for (const c of this.shaftA.children) c.geometry.dispose()
    this.envTex?.dispose()
    this.cineDispose?.()
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
