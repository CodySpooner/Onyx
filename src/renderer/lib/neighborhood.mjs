// Reader minimap: the 1-hop neighborhood of a note, laid out on arcs.
// Inbound left, outbound right, mutual on top. Deterministic, no iteration.

export function neighborhood(graph, id) {
  const note = graph.notes.find((n) => n.id === id)
  if (!note) return { center: id, inbound: [], outbound: [], mutual: [] }
  const inSet = new Set(note.inLinks)
  const outSet = new Set(note.outLinks)
  const mutual = [...inSet].filter((x) => outSet.has(x))
  const mSet = new Set(mutual)
  return {
    center: id,
    inbound: [...inSet].filter((x) => !mSet.has(x)),
    outbound: [...outSet].filter((x) => !mSet.has(x)),
    mutual
  }
}

const CAP = 14

function placeArc(ids, arcStart, arcSpan, cx, cy, r, side, out) {
  ids.forEach((id, i) => {
    const a = arcStart + ((i + 1) * arcSpan) / (ids.length + 1)
    out.push({ id, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, side })
  })
}

// → { nodes: [{id,x,y,side}], center: {x,y}, more: {in,out,mutual} }
export function radialLayout(nb, w, h, degOf = new Map(), pad = 24) {
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) / 2 - pad
  const byDeg = (a, b) => (degOf.get(b) || 0) - (degOf.get(a) || 0)
  const top = (list) => list.slice().sort(byDeg).slice(0, CAP)

  const inbound = top(nb.inbound)
  const outbound = top(nb.outbound)
  const mutual = top(nb.mutual)

  const nodes = []
  // screen angles: y grows downward, so "top arc" is negative-y = angles around -PI/2
  placeArc(inbound, Math.PI / 2, Math.PI, cx, cy, r, 'in', nodes) // left semicircle
  placeArc(outbound, -Math.PI / 2, Math.PI, cx, cy, r, 'out', nodes) // right semicircle
  placeArc(mutual, -Math.PI * 0.75, Math.PI / 2, cx, cy, r * 0.72, 'mutual', nodes)

  return {
    nodes,
    center: { x: cx, y: cy },
    more: {
      in: Math.max(0, nb.inbound.length - CAP),
      out: Math.max(0, nb.outbound.length - CAP),
      mutual: Math.max(0, nb.mutual.length - CAP)
    }
  }
}
