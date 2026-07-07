// NPC population + kinematics for the Ecosystem lens. The town lives on real
// data: recent edits spawn couriers between linked districts, due flashcards
// animate a librarian, orphans wander the edge, citizens fill to a population
// scaled by vault size. Pure math, zero allocation per tick, deterministic
// via injectable mulberry32.

const H72 = 72 * 3600000

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function makeNpc(role, homeNode, dest, wp, speed, errand, palette, seed) {
  const { nodes, nextHop, n } = wp
  return {
    role,
    node: homeNode,
    pathNext: nextHop[homeNode * n + dest],
    dest,
    x: nodes[homeNode].x,
    z: nodes[homeNode].z,
    heading: 0,
    speed,
    state: 'walk',
    pauseT: 0,
    palette,
    seed,
    errand,
    homeNode,
    far: dest,
    loop: role === 'courier' || role === 'librarian'
  }
}

// -> npc[] (deterministic for a fixed seed)
export function spawnNpcs(districts, waypoints, notes, links, dueCount, now, opts = {}) {
  const npcs = []
  const n = waypoints.n
  if (n < 2 || !districts.length) return npcs
  const rng = mulberry32(opts.seed ?? 1337)
  const folderDoor = new Map(districts.map((d) => [d.folderId, d.doorNode]))
  const folderName = new Map(districts.map((d) => [d.folderId, d.name]))
  const noteById = new Map(notes.map((nt) => [nt.id, nt]))

  // 1) couriers: fresh notes with a cross-district link, most recent first
  const fresh = notes
    .filter((nt) => nt.mtime && now - nt.mtime < H72 && folderDoor.has(nt.folder))
    .sort((a, b) => b.mtime - a.mtime)
  for (const nt of fresh) {
    if (npcs.length >= 12) break
    const other = [...(nt.outLinks || []), ...(nt.inLinks || [])]
      .map((id) => noteById.get(id))
      .find((o) => o && o.folder !== nt.folder && folderDoor.has(o.folder))
    if (!other) continue
    const src = folderDoor.get(nt.folder)
    const dst = folderDoor.get(other.folder)
    if (src === dst) continue
    const c = makeNpc('courier', src, dst, waypoints, 7 + rng() * 2, { text: `delivering: ${nt.title} → ${folderName.get(other.folder)}`, noteId: nt.id }, npcs.length % 3, npcs.length + 1)
    c.destFolder = other.folder
    npcs.push(c)
  }

  // 2) librarian: paces the library door when reviews are due
  if (dueCount > 0) {
    const lib = districts.find((d) => d.archetype === 'library')
    if (lib) {
      const home = lib.doorNode
      const neighbor = home < n - 1 ? home + 1 : home - 1
      npcs.push(makeNpc('librarian', home, neighbor, waypoints, 3, { text: `reviewing ${dueCount} cards`, noteId: null }, 0, 777))
    }
  }

  // 3) wanderers: orphan notes drift the outer ring
  const orphans = notes.filter((nt) => !(nt.inLinks || []).length && !(nt.outLinks || []).length && folderDoor.has(nt.folder))
  const wCount = Math.min(3, Math.ceil(orphans.length / 10))
  for (let i = 0; i < wCount; i++) {
    const o = orphans[i]
    const home = 1 + Math.floor(rng() * (n - 1))
    const w = makeNpc('wanderer', home, home, waypoints, 2, { text: `lost: ${o.title}`, noteId: o.id }, i % 3, 9000 + i)
    w.state = 'pause'
    w.pauseT = 4 + rng() * 4
    npcs.push(w)
  }

  // 4) citizens fill to population
  const POP = clamp(15 + Math.floor(notes.length / 5), 15, 40)
  let guard = 0
  while (npcs.length < POP && guard++ < 200) {
    const home = 1 + Math.floor(rng() * (n - 1))
    let dest = 1 + Math.floor(rng() * (n - 1))
    if (dest === home) dest = home === 1 ? Math.min(n - 1, 2) : 1
    if (dest === home) break // n === 2 degenerate: home is the only door
    npcs.push(makeNpc('citizen', home, dest, waypoints, 3.5 + rng() * 2, { text: 'strolling', noteId: null }, npcs.length % 3, 100 + npcs.length))
  }
  for (const npc of npcs) npc._rng = mulberry32(npc.seed)
  return npcs
}

function pickDest(npc, wp, rng) {
  const n = wp.n
  if (npc.loop) {
    // couriers/librarian shuttle home <-> far forever
    npc.dest = npc.node === npc.far ? npc.homeNode : npc.far
  } else if (npc.role === 'wanderer') {
    // shuffle between the two ring nodes adjacent by index
    const cands = [npc.node > 1 ? npc.node - 1 : n - 1, npc.node < n - 1 ? npc.node + 1 : 1]
    npc.dest = cands[Math.floor(rng() * 2)] || npc.node
  } else {
    let d = 1 + Math.floor(rng() * (n - 1))
    if (d === npc.node) d = d === 1 ? Math.min(n - 1, 2) : 1
    npc.dest = d
  }
  const nx = wp.nextHop[npc.node * n + npc.dest]
  if (nx === 255 || npc.dest === npc.node) {
    npc.state = 'pause'
    npc.pauseT = 1 + rng() * 2
    return
  }
  npc.pathNext = nx
  npc.state = 'walk'
}

// zero-allocation tick: writes out[0]=x, out[1]=z, out[2]=heading
export function advanceNpc(npc, dt, wp, rng, out) {
  const { nodes, nextHop, n } = wp
  if (npc.state === 'pause') {
    npc.pauseT -= dt
    if (npc.pauseT <= 0) pickDest(npc, wp, rng)
  } else {
    const target = nodes[npc.pathNext]
    if (!target) {
      npc.state = 'pause'
      npc.pauseT = 1
    } else {
      const dx = target.x - npc.x
      const dz = target.z - npc.z
      const d = Math.hypot(dx, dz)
      if (d < 0.4) {
        npc.node = npc.pathNext
        if (npc.node === npc.dest) {
          npc.state = 'pause'
          npc.pauseT = npc.role === 'wanderer' ? 4 + rng() * 4 : 1 + rng() * 3
        } else {
          const nx = nextHop[npc.node * n + npc.dest]
          if (nx === 255) {
            npc.state = 'pause'
            npc.pauseT = 1
          } else {
            npc.pathNext = nx
          }
        }
      } else {
        const step = Math.min(npc.speed * dt, d) // never overshoot the waypoint
        npc.x += (dx / d) * step
        npc.z += (dz / d) * step
        const want = Math.atan2(dx, dz)
        let diff = want - npc.heading
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        npc.heading += diff * Math.min(1, dt * 6)
      }
    }
  }
  out[0] = npc.x
  out[1] = npc.z
  out[2] = npc.heading
  return npc.state
}
