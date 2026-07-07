// Label propagation community detection. Deterministic: nodes iterate in
// sorted-id order, ties break sticky-then-smallest. Votes are weighted by
// 1/degree(neighbor) so hub notes (Home, MOCs) can't flood the whole vault
// into one community — validated on the real vault (1 cluster → 17).
const EPS = 1e-9

export function detectClusters(ids, links) {
  const sorted = [...ids].sort()
  const label = new Map(sorted.map((id, i) => [id, i]))
  const adj = new Map(sorted.map((id) => [id, []]))
  for (const l of links) {
    if (!adj.has(l.source) || !adj.has(l.target) || l.source === l.target) continue
    adj.get(l.source).push(l.target)
    adj.get(l.target).push(l.source)
  }
  const weight = new Map(sorted.map((id) => [id, 1 / Math.max(1, adj.get(id).length)]))

  for (let pass = 0; pass < 30; pass++) {
    let changed = false
    for (const id of sorted) {
      const nbs = adj.get(id)
      if (!nbs.length) continue
      const freq = new Map()
      for (const nb of nbs) {
        const L = label.get(nb)
        freq.set(L, (freq.get(L) || 0) + weight.get(nb))
      }
      let best = -1
      let bestCount = 0
      for (const [L, c] of freq) {
        if (c > bestCount + EPS || (Math.abs(c - bestCount) <= EPS && (best === -1 || L < best))) {
          best = L
          bestCount = c
        }
      }
      const cur = label.get(id)
      // sticky ties: keeping the current label when it's tied-best stops big
      // clusters from leaking across bridge nodes and swallowing small ones
      if (Math.abs((freq.get(cur) || 0) - bestCount) <= EPS) best = cur
      if (best !== cur) {
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
