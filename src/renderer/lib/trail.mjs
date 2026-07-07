// Session trail — where your head has been. Move-to-end semantics so the
// chip strip never shows duplicates; consecutive re-opens collapse.

export function pushTrail(trail, id, ts, max = 30) {
  const t = Array.isArray(trail) ? trail : []
  if (t.length && t[t.length - 1].id === id) return t
  const next = t.filter((e) => e.id !== id)
  next.push({ id, ts })
  return next.length > max ? next.slice(next.length - max) : next
}

export function pruneTrail(trail, liveIds) {
  return (Array.isArray(trail) ? trail : []).filter((e) => liveIds.has(e.id))
}

// Alt+Left target: the entry before the current tail (or null)
export function trailBack(trail) {
  if (!Array.isArray(trail) || trail.length < 2) return null
  return trail[trail.length - 2].id
}
