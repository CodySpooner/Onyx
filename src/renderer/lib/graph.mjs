export function matchFilter(note, f) {
  if (f.q) {
    const q = f.q.toLowerCase()
    const hay = `${note.title} ${(note.tags || []).join(' ')} ${note.type || ''}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (f.folders?.length && !f.folders.includes(note.folder)) return false
  if (f.types?.length && !f.types.includes(note.type)) return false
  if (f.statuses?.length && !f.statuses.includes(note.status)) return false
  if (f.tags?.length && !f.tags.some((t) => (note.tags || []).includes(t))) return false
  return true
}

// stable 0..2π angle from a string id (FNV-1a) — used for deterministic layout
export function hashAngle(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967295) * Math.PI * 2
}
