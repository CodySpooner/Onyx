// Greedy in-order subsequence fuzzy matcher for the command palette.
// ponytail: greedy, not fzf-DP; same signature if ranking ever feels off.
const BOUNDARY = new Set([' ', '/', '-', '_', '.', '(', '[', '#'])

export function fuzzyScore(query, text) {
  if (!query) return { score: 0, indices: [] }
  const q = String(query).toLowerCase()
  const t = String(text).toLowerCase()
  const indices = []
  let score = 0
  let prev = -2
  let from = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], from)
    if (idx === -1) return null
    let s = 1
    if (idx === 0 || BOUNDARY.has(text[idx - 1])) s += 8
    if (idx === prev + 1) s += 6
    if (text[idx] === query[qi]) s += 2
    const gap = idx - (prev + 1)
    if (gap > 0) s -= 0.3 * gap
    score += s
    indices.push(idx)
    prev = idx
    from = idx + 1
  }
  if (indices[0] === 0) score += 4
  score -= 0.05 * text.length
  return { score, indices }
}

export function fuzzyFilter(query, items, getText, limit = 40) {
  if (!query) return items.slice(0, limit).map((item) => ({ item, score: 0, indices: [] }))
  const out = []
  for (const item of items) {
    const r = fuzzyScore(query, getText(item))
    if (r) out.push({ item, score: r.score, indices: r.indices })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}
