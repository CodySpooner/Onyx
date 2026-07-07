// Ecosystem town planner: the vault IS the town. Every non-empty folder
// becomes a district with a functional archetype, positioned overlap-free on
// a golden-angle spiral, wired by a plaza-and-ring walkway network with
// precomputed all-pairs routing. Pure and deterministic — zero Math.random,
// zero THREE — so the whole world logic runs under node --test.

const GOLDEN = 2.399963229728653
const DAY = 86400000
const STREET = 12 // minimum clear gap between district footprints

// Ordered: first regex hit wins. \bengine\b (not /engine/) so
// 'Engineering & Ops' falls through to workshop.
export const ARCHETYPES = [
  { id: 'hq', re: /dashboard|home|\bhq\b|headquarters/i },
  { id: 'signal', re: /claude|agent|comms/i },
  { id: 'refinery', re: /data|pipeline|attachment/i },
  { id: 'lab', re: /\bengine\b|model|backtest|projection|research|experiment/i },
  { id: 'trading', re: /result|bet|trade|market/i },
  { id: 'workshop', re: /app|engineering|ops|template|tool/i },
  { id: 'library', re: /resource|spec|diagram|map|doc|reference|excalidraw|command/i }
]

export function archetypeFor(folderName, folderNotes = []) {
  for (const a of ARCHETYPES) {
    if (a.re.test(folderName)) return a.id
  }
  // fall back to the folder's dominant tags
  const freq = new Map()
  for (const n of folderNotes) {
    for (const t of n.tags || []) freq.set(t, (freq.get(t) || 0) + 1)
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0])
  for (const a of ARCHETYPES) {
    if (top.some((t) => a.re.test(t))) return a.id
  }
  return 'hamlet'
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// -> { districts, waypoints, plaza }
export function ecoLayout(folders, notes, now) {
  const byFolder = new Map()
  for (const n of notes) {
    if (!byFolder.has(n.folder)) byFolder.set(n.folder, [])
    byFolder.get(n.folder).push(n)
  }

  const districts = folders
    .filter((f) => (byFolder.get(f.id) || []).length > 0)
    .map((f) => {
      const members = byFolder.get(f.id)
      let hub = members[0]
      let recent7 = 0
      let recent14 = 0
      for (const n of members) {
        const mt = n.mtime || 0
        if (mt > (hub.mtime || 0)) hub = n
        if (mt && now - mt < 7 * DAY) recent7++
        if (mt && now - mt < 14 * DAY) recent14++
      }
      const lit = recent14 / members.length
      return {
        folderId: f.id,
        name: f.name || f.id,
        color: f.color || '#7fd4ff',
        archetype: archetypeFor(f.name || f.id, members),
        count: members.length,
        noteIds: members.map((n) => n.id),
        hubNoteId: hub.id,
        lit,
        litBucket: clamp(Math.floor(lit * 3), 0, 2),
        recentCount: recent7,
        S: clamp(5 + 1.8 * Math.sqrt(members.length), 5, 14),
        cx: 0,
        cz: 0
      }
    })
    .sort((a, b) => b.count - a.count) // big districts inner
    .slice(0, 240) // nextHop is a Uint8Array — 255 is the sentinel, so cap well below

  districts.forEach((d, i) => {
    const r = 34 * Math.sqrt(i + 0.6)
    d.cx = r * Math.cos(i * GOLDEN)
    d.cz = r * Math.sin(i * GOLDEN)
  })

  // pairwise center-push until every street gap is honored (converges fast)
  for (let pass = 0; pass < 200; pass++) {
    let moved = false
    for (let a = 0; a < districts.length; a++) {
      for (let b = a + 1; b < districts.length; b++) {
        const A = districts[a]
        const B = districts[b]
        const dx = B.cx - A.cx
        const dz = B.cz - A.cz
        const d = Math.hypot(dx, dz) || 0.001
        const want = A.S + B.S + STREET
        if (d < want) {
          const push = (want - d) / 2 + 0.01
          const ux = dx / d
          const uz = dz / d
          A.cx -= ux * push
          A.cz -= uz * push
          B.cx += ux * push
          B.cz += uz * push
          moved = true
        }
      }
    }
    if (!moved) break
  }

  // doors face the plaza
  for (const d of districts) {
    const len = Math.hypot(d.cx, d.cz) || 1
    d.door = { x: d.cx - (d.cx / len) * (d.S + 2), z: d.cz - (d.cz / len) * (d.S + 2) }
  }

  const waypoints = buildWaypoints(districts)
  districts.forEach((d, i) => {
    d.doorNode = i + 1
  })
  return { districts, waypoints, plaza: { x: 0, z: 0, node: 0 } }
}

// node 0 = plaza, 1..D = doors; edges = spokes + angular ring
function buildWaypoints(districts) {
  const nodes = [{ x: 0, z: 0 }]
  for (const d of districts) nodes.push({ x: d.door.x, z: d.door.z })
  const n = nodes.length
  const edgeSet = new Set()
  const edges = []
  const addEdge = (a, b) => {
    const k = a < b ? a * 1000 + b : b * 1000 + a
    if (a === b || edgeSet.has(k)) return
    edgeSet.add(k)
    edges.push([a, b])
  }
  for (let i = 1; i < n; i++) addEdge(0, i)
  if (n > 3) {
    const ring = []
    for (let i = 1; i < n; i++) ring.push(i)
    ring.sort((a, b) => Math.atan2(nodes[a].z, nodes[a].x) - Math.atan2(nodes[b].z, nodes[b].x))
    for (let i = 0; i < ring.length; i++) addEdge(ring[i], ring[(i + 1) % ring.length])
  } else if (n === 3) {
    addEdge(1, 2)
  }

  // adjacency with euclidean lengths
  const adj = Array.from({ length: n }, () => [])
  for (const [a, b] of edges) {
    const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z)
    adj[a].push([b, len])
    adj[b].push([a, len])
  }

  // all-pairs Dijkstra -> first-hop table (n <= ~40, O(n^3) is nothing)
  const nextHop = new Uint8Array(n * n).fill(255)
  const dist = new Float64Array(n)
  const prev = new Int16Array(n)
  const done = new Uint8Array(n)
  for (let src = 0; src < n; src++) {
    dist.fill(Infinity)
    prev.fill(-1)
    done.fill(0)
    dist[src] = 0
    for (let it = 0; it < n; it++) {
      let u = -1
      let best = Infinity
      for (let i = 0; i < n; i++) {
        if (!done[i] && dist[i] < best) {
          best = dist[i]
          u = i
        }
      }
      if (u < 0) break
      done[u] = 1
      for (const [v, w] of adj[u]) {
        if (dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w
          prev[v] = u
        }
      }
    }
    nextHop[src * n + src] = src
    for (let dst = 0; dst < n; dst++) {
      if (dst === src || prev[dst] < 0) continue
      let cur = dst
      while (prev[cur] !== src) cur = prev[cur] // walk back to src's neighbor
      nextHop[src * n + dst] = cur
    }
  }
  return { nodes, edges, nextHop, n }
}

// path length by walking the first-hop table; Infinity if unreachable
export function routeLen(a, b, wp) {
  const { nodes, nextHop, n } = wp
  let total = 0
  let cur = a
  for (let hops = 0; hops < n && cur !== b; hops++) {
    const nx = nextHop[cur * n + b]
    if (nx === 255) return Infinity
    total += Math.hypot(nodes[nx].x - nodes[cur].x, nodes[nx].z - nodes[cur].z)
    cur = nx
  }
  return cur === b ? total : Infinity
}

// rebuild iff structure changed; relight lists districts whose litBucket
// alone moved (EcoView re-lights windows without tearing the town down)
export function diffTown(prevDistricts, nextDistricts) {
  if (!prevDistricts) return { rebuild: true, relight: [] }
  const prev = new Map(prevDistricts.map((d) => [d.folderId, d]))
  if (prev.size !== nextDistricts.length) return { rebuild: true, relight: [] }
  const relight = []
  for (const d of nextDistricts) {
    const p = prev.get(d.folderId)
    if (!p) return { rebuild: true, relight: [] }
    if (
      p.archetype !== d.archetype ||
      Math.ceil(Math.sqrt(p.count)) !== Math.ceil(Math.sqrt(d.count)) ||
      Math.hypot(p.cx - d.cx, p.cz - d.cz) > 1
    ) {
      return { rebuild: true, relight: [] }
    }
    if (p.litBucket !== d.litBucket) relight.push(d.folderId)
  }
  return { rebuild: false, relight }
}
