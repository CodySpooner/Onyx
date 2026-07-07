// Project workspaces: a scope is a VIEW over the vault, never a move.
// Auto workspaces derive from Claude Projects logs (the bridge contract);
// manual workspaces are folder/tag picks. scopeGraph returns a clean-slate
// subgraph every mode can consume unchanged (same shape as the real graph).
import { CLUSTER_PALETTE } from './clusters.mjs'
import { PROJECT_FOLDER } from './projects.mjs'
import { hashAngle } from './graph.mjs'

// stable color for a workspace name — survives list reordering
export function pickColor(name) {
  return CLUSTER_PALETTE[Math.floor((hashAngle(String(name)) / (Math.PI * 2)) * CLUSTER_PALETTE.length) % CLUSTER_PALETTE.length]
}

const CLOSURE_CAP = 200

// → [{ id, name, color, auto: true, noteIds: [..] }]
export function deriveAutoWorkspaces(graph) {
  const logs = graph.notes.filter(
    (n) => n.projectLog && n.folder === PROJECT_FOLDER && !n.path.split('/').pop().startsWith('_')
  )
  return logs.map((log, i) => {
    // membership = the log + its 1-hop wikilink closure (in AND out), capped
    const ids = new Set([log.id])
    for (const other of [...(log.outLinks || []), ...(log.inLinks || [])]) {
      if (ids.size >= CLOSURE_CAP) break
      ids.add(other)
    }
    return {
      id: 'auto:' + log.id,
      name: log.title,
      color: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
      auto: true,
      noteIds: [...ids]
    }
  })
}

export function noteInWorkspace(ws, note) {
  if (!ws) return true
  if (ws.auto) return ws._set ? ws._set.has(note.id) : ws.noteIds.includes(note.id)
  // manual membership is the UNION: folders ∪ tags ∪ hand-picked noteIds
  const inFolder = ws.folders?.length ? ws.folders.includes(note.folder) : false
  const inTags = ws.tags?.length ? (note.tags || []).some((t) => ws.tags.includes(t)) : false
  const inIds = ws.noteIds?.length ? ws.noteIds.includes(note.id) : false
  return inFolder || inTags || inIds
}

// the full selectable list: auto (from project logs) first, then manual
export function buildWorkspaces(graph, manual = []) {
  return [...deriveAutoWorkspaces(graph), ...manual]
}

// the new slate: same graph shape, scoped membership; links need both ends
export function scopeGraph(graph, ws) {
  if (!ws) return graph
  const w = ws.auto ? { ...ws, _set: new Set(ws.noteIds) } : ws
  const notes = graph.notes.filter((n) => noteInWorkspace(w, n))
  const keep = new Set(notes.map((n) => n.id))
  const links = graph.links.filter((l) => keep.has(l.source) && keep.has(l.target))
  const folderIds = new Set(notes.map((n) => n.folder))
  // per-note link lists must not leak outside the scope (stats/health read them)
  const scopedNotes = notes.map((n) => ({
    ...n,
    outLinks: (n.outLinks || []).filter((id) => keep.has(id)),
    inLinks: (n.inLinks || []).filter((id) => keep.has(id))
  }))
  return {
    ...graph,
    notes: scopedNotes,
    links,
    folders: graph.folders.filter((f) => folderIds.has(f.id)),
    cards: (graph.cards || []).filter((c) => keep.has(c.noteId)),
    suggestions: (graph.suggestions || []).filter((s) => keep.has(s.a) && keep.has(s.b)),
    unresolved: (graph.unresolved || []).filter((u) => keep.has(u.in)),
    habitEntries: graph.habitEntries || [],
    meta: {
      ...graph.meta,
      noteCount: scopedNotes.length,
      linkCount: links.length,
      unresolvedLinkCount: (graph.unresolved || []).filter((u) => keep.has(u.in)).length,
      scope: ws.name // StatusBar scope segment reads this
    }
  }
}

// sanitize persisted { activeId, manual: [...] } against the live vault
export function validateWorkspaceUi(stored, autoWorkspaces) {
  const out = { activeId: null, manual: [] }
  if (!stored || typeof stored !== 'object') return out
  if (Array.isArray(stored.manual)) {
    out.manual = stored.manual
      .filter((w) => w && typeof w.name === 'string' && w.name.trim())
      .slice(0, 20)
      .map((w, i) => ({
        id: typeof w.id === 'string' ? w.id : 'ws-' + i,
        name: w.name.trim().slice(0, 40),
        color: typeof w.color === 'string' ? w.color : CLUSTER_PALETTE[(i + 5) % CLUSTER_PALETTE.length],
        folders: Array.isArray(w.folders) ? w.folders.filter((x) => typeof x === 'string') : [],
        tags: Array.isArray(w.tags) ? w.tags.filter((x) => typeof x === 'string') : []
      }))
  }
  const ids = new Set([...autoWorkspaces.map((w) => w.id), ...out.manual.map((w) => w.id)])
  if (typeof stored.activeId === 'string' && ids.has(stored.activeId)) out.activeId = stored.activeId
  return out
}
