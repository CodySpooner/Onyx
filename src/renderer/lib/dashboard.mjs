// Dashboard analytics — all pure, all computable from VaultGraph + mtimes +
// the daily snapshot store. Honest labeling: mtime = last-touch only.
import { dayKey, degree, bridgeStats } from './stats.mjs'

const DAY = 86400000

// 52-week GitHub-style activity grid. Each note counts once, on its
// last-touch day. Columns are weeks (Sun-start); ≤371 cells.
export function activityGrid(notes, now) {
  const end = new Date(now)
  end.setHours(12, 0, 0, 0)
  while (end.getDay() !== 6) end.setDate(end.getDate() + 1) // pad to Saturday: today never trimmed
  const start = new Date(now)
  start.setHours(12, 0, 0, 0)
  start.setDate(start.getDate() - 364)
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1)

  const counts = new Map()
  for (const n of notes) {
    if (!n.mtime) continue
    const k = dayKey(n.mtime)
    counts.set(k, (counts.get(k) || 0) + 1)
  }

  const cells = []
  const monthLabels = []
  let lastMonth = -1
  const cur = new Date(start)
  while (cur.getTime() <= end.getTime()) {
    const k = dayKey(cur.getTime())
    const c = counts.get(k) || 0
    const lvl = c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c <= 4 ? 3 : 4
    if (cur.getDay() === 0 && cur.getMonth() !== lastMonth) {
      monthLabels.push({ col: Math.floor(cells.length / 7), label: cur.toLocaleString('en', { month: 'short' }).toUpperCase() })
      lastMonth = cur.getMonth()
    }
    cells.push({ date: k, count: c, lvl })
    cur.setDate(cur.getDate() + 1)
  }
  while (cells.length > 371) {
    cells.splice(0, 7) // drop oldest week, never the newest
    for (const m of monthLabels) m.col -= 1
  }
  const labels = monthLabels.filter((m) => m.col >= 0)
  return { cells, weeks: cells.length / 7, max: Math.max(0, ...counts.values()), monthLabels: labels }
}

// weekly cumulative note count by mtime — monotonic, ends at notes.length
export function mtimeCdf(notes, now, points = 52) {
  const sorted = notes.map((n) => n.mtime || 0).sort((a, b) => a - b)
  const span = 364 * DAY
  const out = []
  for (let i = 0; i < points; i++) {
    const t = now - span + ((i + 1) / points) * span
    let c = 0
    for (const m of sorted) {
      if (m <= t) c++
      else break
    }
    out.push(c)
  }
  if (out.length) out[out.length - 1] = notes.length
  return out
}

export function growthSeries(snapshotDays, notes, now) {
  if ((snapshotDays?.length || 0) >= 7) {
    return { series: snapshotDays.map((d) => d.notes), source: 'snapshots' }
  }
  return { series: mtimeCdf(notes, now), source: 'mtime' }
}

// deltas vs the latest snapshot at least d days old; null while collecting
export function deltas(snapshotDays, current, now) {
  const win = (d) => {
    const cutoff = dayKey(now - d * DAY)
    let base = null
    for (const rec of snapshotDays || []) {
      if (rec.date <= cutoff) base = rec
      else break
    }
    if (!base) return null
    return {
      notes: current.notes - base.notes,
      links: current.links - base.links,
      words: current.words - base.words
    }
  }
  return { d7: win(7), d30: win(30) }
}

export function wordStats(notes) {
  const total = notes.reduce((s, n) => s + (n.wordCount || 0), 0)
  const biggest = [...notes]
    .sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0) || (a.id < b.id ? -1 : 1))
    .slice(0, 5)
  return { total, avg: notes.length ? Math.round(total / notes.length) : 0, biggest }
}

// per-cluster size + hub label; takes the HOISTED detectClusters result
export function clusterBreakdown(notes, clusters) {
  const { clusterOf, clusterCount } = clusters
  const members = new Map()
  for (const n of notes) {
    const ci = clusterOf.get(n.id)
    if (ci == null || ci < 0) continue
    if (!members.has(ci)) members.set(ci, [])
    members.get(ci).push(n)
  }
  const out = []
  for (let ci = 0; ci < clusterCount; ci++) {
    const ms = members.get(ci) || []
    if (!ms.length) continue
    const hub = ms.reduce((best, n) =>
      degree(n) > degree(best) || (degree(n) === degree(best) && n.id < best.id) ? n : best
    )
    out.push({ ci, size: ms.length, label: hub.title, hubId: hub.id })
  }
  return out.sort((a, b) => b.size - a.size)
}

export function topTags(notes, n = 24) {
  const counts = new Map()
  for (const note of notes) for (const t of note.tags || []) counts.set(t, (counts.get(t) || 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
    .slice(0, n)
}

export function recentNotes(notes, n = 8) {
  return [...notes].sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, n)
}

export function relAge(ms, now) {
  const diff = Math.max(0, now - ms)
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < DAY) return `${Math.floor(diff / 3600000)}h`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d`
  const d = new Date(ms)
  return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`
}

export function linkHealth(graph, clusterOf) {
  const n = graph.notes.length || 1
  const connected = graph.notes.filter((x) => degree(x) > 0).length
  return {
    linksPerNote: Math.round((graph.meta.linkCount / n) * 10) / 10,
    connectedPct: Math.round((connected / n) * 100),
    orphans: n - connected,
    unresolved: graph.meta.unresolvedLinkCount,
    bridges: bridgeStats(graph.links, clusterOf).count
  }
}

// snapshot upsert (pure; consumed by src/main/appdata.js and tests)
export function upsertDay(days, rec, cap = 400) {
  const next = [...days]
  const i = next.findIndex((d) => d.date === rec.date)
  if (i >= 0) next[i] = rec
  else next.push(rec)
  next.sort((a, b) => (a.date < b.date ? -1 : 1))
  return next.slice(-cap)
}
