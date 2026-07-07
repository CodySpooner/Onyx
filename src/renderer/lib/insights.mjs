// Deep-dive analytics for the dashboard ANALYTICS/HEALTH pages. Pure, tested.
// All time semantics are honest last-touch (mtime) — labeled as such in UI.

const DAY = 86400000
const WEEK = 7 * DAY

// 26-week words-touched-per-week series per folder, top N + OTHER rollup.
// → { folders: [{folder, series, total}], weeks }
export function folderWordTrend(notes, now, weeks = 26, topN = 6) {
  const byFolder = new Map()
  for (const n of notes) {
    if (!n.mtime) continue
    const wk = Math.floor((now - n.mtime) / WEEK)
    if (wk < 0 || wk >= weeks) continue
    if (!byFolder.has(n.folder)) byFolder.set(n.folder, new Array(weeks).fill(0))
    byFolder.get(n.folder)[weeks - 1 - wk] += n.wordCount || 0
  }
  const ranked = [...byFolder.entries()]
    .map(([folder, series]) => ({ folder, series, total: series.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.folder.localeCompare(b.folder))
  const top = ranked.slice(0, topN)
  const rest = ranked.slice(topN)
  if (rest.length) {
    const other = new Array(weeks).fill(0)
    for (const r of rest) r.series.forEach((v, i) => (other[i] += v))
    top.push({ folder: 'OTHER', series: other, total: other.reduce((a, b) => a + b, 0) })
  }
  return { folders: top, weeks }
}

// folder×folder wikilink counts. → { folders, matrix, max }
export function linkMatrix(notes, links) {
  const folderOf = new Map(notes.map((n) => [n.id, n.folder]))
  const folders = [...new Set(notes.map((n) => n.folder))].sort()
  const idx = new Map(folders.map((f, i) => [f, i]))
  const matrix = folders.map(() => new Array(folders.length).fill(0))
  let max = 0
  for (const l of links) {
    const a = idx.get(folderOf.get(l.source))
    const b = idx.get(folderOf.get(l.target))
    if (a == null || b == null) continue
    matrix[a][b]++
    if (matrix[a][b] > max) max = matrix[a][b]
  }
  return { folders, matrix, max }
}

// which tags are ALIVE vs merely numerous. → [{tag, recent, total}]
export function tagMomentum(notes, now, days = 30, n = 12) {
  const cutoff = now - days * DAY
  const m = new Map()
  for (const note of notes) {
    for (const tag of note.tags || []) {
      if (!m.has(tag)) m.set(tag, { tag, recent: 0, total: 0 })
      const t = m.get(tag)
      t.total++
      if ((note.mtime || 0) >= cutoff) t.recent++
    }
  }
  return [...m.values()]
    .sort((a, b) => b.recent - a.recent || b.total - a.total || a.tag.localeCompare(b.tag))
    .slice(0, n)
}

// titles that collide case-insensitively — the wikilink-resolution hazard.
// → [[note, note, ...], ...] groups sorted by size desc
export function duplicateTitles(notes) {
  const g = new Map()
  for (const n of notes) {
    const key = String(n.title).trim().toLowerCase()
    if (!g.has(key)) g.set(key, [])
    g.get(key).push(n)
  }
  return [...g.values()].filter((v) => v.length > 1).sort((a, b) => b.length - a.length)
}
