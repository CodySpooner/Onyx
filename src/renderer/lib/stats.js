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
