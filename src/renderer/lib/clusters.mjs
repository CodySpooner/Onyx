// Label propagation community detection. Deterministic: nodes iterate in
// sorted-id order, ties break to the smallest label. Good enough for
// hundreds-to-thousands of notes; no dependencies.
export function detectClusters(ids, links) {
  const sorted = [...ids].sort()
  const label = new Map(sorted.map((id, i) => [id, i]))
  const adj = new Map(sorted.map((id) => [id, []]))
  for (const l of links) {
    if (!adj.has(l.source) || !adj.has(l.target) || l.source === l.target) continue
    adj.get(l.source).push(l.target)
    adj.get(l.target).push(l.source)
  }

  for (let pass = 0; pass < 20; pass++) {
    let changed = false
    for (const id of sorted) {
      const nbs = adj.get(id)
      if (!nbs.length) continue
      const freq = new Map()
      for (const nb of nbs) {
        const L = label.get(nb)
        freq.set(L, (freq.get(L) || 0) + 1)
      }
      let best = label.get(id)
      let bestCount = -1
      for (const [L, c] of freq) {
        if (c > bestCount || (c === bestCount && L < best)) {
          best = L
          bestCount = c
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best)
        changed = true
      }
    }
    if (!changed) break
  }

  // group by final label
  const groups = new Map()
  for (const id of sorted) {
    const L = label.get(id)
    if (!groups.has(L)) groups.set(L, [])
    groups.get(L).push(id)
  }
  // communities ≥2, ordered by size desc then smallest member id
  const communities = [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1))

  const clusterOf = new Map(sorted.map((id) => [id, -1]))
  const sizes = new Map()
  communities.forEach((members, ci) => {
    sizes.set(ci, members.length)
    for (const id of members) clusterOf.set(id, ci)
  })
  return { clusterOf, clusterCount: communities.length, sizes }
}
