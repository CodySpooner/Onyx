import { hashAngle } from './graph.mjs'

// ponytail: O(n²) pairwise repulsion — trivially 60fps to ~2–3k notes.
// If a vault ever gets huge, swap the internals for d3-force-3d (Barnes-Hut)
// behind this same createSim API.
export function createSim(ids, links, opts = {}) {
  const o = {
    repulsion: 900,
    forceCap: 2.5,
    cutoff2: 13000, // stop repelling beyond ~114 units
    spring: 0.015,
    restLen: 27,
    center: 0.0016,
    yFlatten: 1.6, // stronger vertical centering → gently oblate brain
    damping: 0.85,
    maxRadius: 165,
    ...opts
  }
  const nodes = ids.map((id) => {
    const a = hashAngle(id)
    const b = hashAngle('y' + id)
    const r = 34 + (hashAngle('r' + id) / (Math.PI * 2)) * 26
    return { id, x: Math.cos(a) * r, y: (b - Math.PI) * 5, z: Math.sin(a) * r, vx: 0, vy: 0, vz: 0 }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const L = []
  for (const l of links) {
    const a = byId.get(l.source)
    const b = byId.get(l.target)
    if (a && b && a !== b) L.push([a, b])
  }

  function tickOnce() {
    const n = nodes.length
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dz = a.z - b.z
        const d2 = dx * dx + dy * dy + dz * dz + 0.01
        if (d2 > o.cutoff2) continue
        const f = Math.min(o.forceCap, o.repulsion / d2)
        const d = Math.sqrt(d2)
        dx /= d
        dy /= d
        dz /= d
        a.vx += dx * f
        a.vy += dy * f
        a.vz += dz * f
        b.vx -= dx * f
        b.vy -= dy * f
        b.vz -= dz * f
      }
    }
    for (const [a, b] of L) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dz = b.z - a.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6
      const f = o.spring * (d - o.restLen)
      a.vx += (dx / d) * f
      a.vy += (dy / d) * f
      a.vz += (dz / d) * f
      b.vx -= (dx / d) * f
      b.vy -= (dy / d) * f
      b.vz -= (dz / d) * f
    }
    for (const p of nodes) {
      p.vx -= p.x * o.center
      p.vy -= p.y * o.center * o.yFlatten
      p.vz -= p.z * o.center
      p.vx *= o.damping
      p.vy *= o.damping
      p.vz *= o.damping
      p.x += p.vx
      p.y += p.vy
      p.z += p.vz
      const r = Math.hypot(p.x, p.y, p.z)
      if (r > o.maxRadius) {
        const s = o.maxRadius / r
        p.x *= s
        p.y *= s
        p.z *= s
      }
    }
  }

  return {
    nodes,
    byId,
    o, // live-tunable params — the customize studio writes these directly
    tick(k = 1) {
      for (let i = 0; i < k; i++) tickOnce()
    }
  }
}
