export const degree = (n) => n.outLinks.length + n.inLinks.length

export function vaultStats(graph) {
  const notes = graph.notes
  const connected = notes.filter((n) => degree(n) > 0).length
  const totalDeg = notes.reduce((s, n) => s + degree(n), 0)
  const hubs = [...notes].sort((a, b) => degree(b) - degree(a))
  return {
    notes: notes.length,
    links: graph.meta.linkCount,
    folders: graph.folders.length,
    orphans: notes.length - connected,
    avgLinks: notes.length ? totalDeg / notes.length : 0,
    connectedPct: notes.length ? Math.round((connected / notes.length) * 100) : 0,
    hubs
  }
}

export const cleanFolder = (name) => String(name).replace(/^\d+\s*[-–]\s*/, '')

const DAY = 86400000
const WEEK = 7 * DAY

// local calendar day key — the one date-bucketing primitive app-wide
export const dayKey = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function velocity(notes, now) {
  const weeks = new Array(12).fill(0)
  for (const n of notes) {
    const age = now - (n.mtime || 0)
    if (age < 0 || age >= 12 * WEEK) continue
    weeks[11 - Math.floor(age / WEEK)]++
  }
  const last6 = weeks.slice(6).reduce((s, x) => s + x, 0)
  const prior6 = weeks.slice(0, 6).reduce((s, x) => s + x, 0)
  const raw = Math.round((100 * (last6 - prior6)) / Math.max(1, prior6))
  const trendPct = Math.max(-999, Math.min(999, raw)) // keep the readout sane when prior weeks are empty
  return { weeks, trendPct }
}

export function coldNotes(notes, now, days = 60) {
  return notes
    .filter((n) => n.mtime && now - n.mtime > days * DAY)
    .map((n) => ({ note: n, ageDays: Math.floor((now - n.mtime) / DAY) }))
    .sort((a, b) => b.ageDays - a.ageDays)
}

export function bridgeStats(links, clusterOf) {
  let count = 0
  const per = new Map()
  for (const l of links) {
    const a = clusterOf.get(l.source)
    const b = clusterOf.get(l.target)
    if (a == null || b == null || a < 0 || b < 0 || a === b) continue
    count++
    per.set(l.source, (per.get(l.source) || 0) + 1)
    per.set(l.target, (per.get(l.target) || 0) + 1)
  }
  const top = [...per.entries()]
    .map(([id, cross]) => ({ id, cross }))
    .sort((x, y) => y.cross - x.cross || (x.id < y.id ? -1 : 1))
    .slice(0, 5)
  return { count, top }
}

// maturity v2 — the ONE knowledge score app-wide (cockpit gauge, dashboard
// hero, Curator "Immaculate"). Five parts; legacy keys kept for consumers.
export function maturity(notes, now) {
  const n = notes.length || 1
  const structure = notes.filter((x) => degree(x) > 0).length / n
  const avgDegree = notes.reduce((s, x) => s + degree(x), 0) / n
  const density = Math.min(1, avgDegree / 6)
  const freshness = notes.filter((x) => x.mtime && now - x.mtime <= 60 * DAY).length / n
  const activeDays30 = new Set(
    notes.filter((x) => x.mtime && now - x.mtime <= 30 * DAY).map((x) => dayKey(x.mtime))
  ).size
  const consistency = Math.min(1, activeDays30 / 12)
  const words = notes.map((x) => x.wordCount || 0).sort((a, b) => a - b)
  const median = words.length ? words[Math.floor((words.length - 1) / 2)] : 0
  const depth = Math.min(1, median / 150)
  const score = Math.round(25 * structure + 20 * density + 20 * freshness + 20 * consistency + 15 * depth)
  return {
    score,
    parts: { structure, density, freshness, consistency, depth },
    connectedRatio: structure,
    freshRatio: freshness,
    densityScore: density
  }
}

export function nextActions({ notes, cold, trendPct, clusterOf, clusterCount, links }) {
  const acts = []
  const orphans = notes.filter((n) => degree(n) === 0).length
  if (orphans > 0) acts.push(`Link or archive ${orphans} orphan note${orphans === 1 ? '' : 's'}`)
  if (cold.length) acts.push(`Revisit "${cold[0].note.title}" — dormant ${cold[0].ageDays}d`)
  // isolated cluster: size ≥3 with zero cross-links
  const crossy = new Set()
  for (const l of links) {
    const a = clusterOf.get(l.source)
    const b = clusterOf.get(l.target)
    if (a != null && b != null && a >= 0 && b >= 0 && a !== b) {
      crossy.add(a)
      crossy.add(b)
    }
  }
  const size = new Map()
  for (const [, c] of clusterOf) if (c >= 0) size.set(c, (size.get(c) || 0) + 1)
  for (let ci = 0; ci < clusterCount; ci++) {
    if ((size.get(ci) || 0) >= 3 && !crossy.has(ci)) {
      acts.push(`Cluster ${ci + 1} (${size.get(ci)} notes) has no bridges — connect it`)
      break
    }
  }
  acts.push(
    trendPct >= 0
      ? `Velocity +${trendPct}% over 6 weeks — keep the streak`
      : `Velocity ${trendPct}% over 6 weeks — capture something today`
  )
  return acts.slice(0, 3)
}
