// Shortest path between two notes over the (undirected) link graph.
// Pure + deterministic: BFS gives the fewest-hops chain, tie-broken by the
// order links appear so two calls always agree. Used by the path-finding lens
// interaction to light up how any two notes connect.

function adjacency(links) {
  const adj = new Map()
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a).push(b)
  }
  for (const l of links) {
    if (l.source === l.target) continue
    add(l.source, l.target)
    add(l.target, l.source)
  }
  return adj
}

// → { ids: [source..target], edges: [[a,b],...] } or null if unreachable
export function shortestPath(links, source, target) {
  if (source === target) return { ids: [source], edges: [] }
  const adj = adjacency(links)
  if (!adj.has(source) || !adj.has(target)) return null
  const prev = new Map([[source, null]])
  const queue = [source]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    if (cur === target) break
    for (const next of adj.get(cur) || []) {
      if (!prev.has(next)) {
        prev.set(next, cur)
        queue.push(next)
      }
    }
  }
  if (!prev.has(target)) return null
  const ids = []
  for (let n = target; n != null; n = prev.get(n)) ids.push(n)
  ids.reverse()
  const edges = []
  for (let i = 0; i < ids.length - 1; i++) edges.push([ids[i], ids[i + 1]])
  return { ids, edges }
}
