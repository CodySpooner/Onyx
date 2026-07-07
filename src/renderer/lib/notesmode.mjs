// Pure logic for the NOTES mode list machinery: scoping, filtering, sorting,
// excerpts, and persisted-UI validation. UI stays thin; this is all tested.
import { matchFilter } from './graph.mjs'

// scope: {kind:'all'|'recent'|'daily'|'pinned'|'folder'|'tag', value?}
export function scopeNotes(notes, scope, { pins = [], dailyFolder = '' } = {}) {
  const k = scope?.kind || 'all'
  if (k === 'recent') return [...notes].sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 30)
  if (k === 'daily') return notes.filter((n) => n.folder === dailyFolder)
  if (k === 'pinned') {
    const byId = new Map(notes.map((n) => [n.id, n]))
    return pins.map((id) => byId.get(id)).filter(Boolean) // pin order, dead pins dropped
  }
  if (k === 'folder') return notes.filter((n) => n.folder === scope.value)
  if (k === 'tag') return notes.filter((n) => (n.tags || []).includes(scope.value))
  return notes
}

// identical search semantics to the brain sidebar
export function filterNotes(notes, q) {
  if (!q) return notes
  const f = { q, folders: [], types: [], statuses: [], tags: [] }
  return notes.filter((n) => matchFilter(n, f))
}

export const SORT_KEYS = ['mtime', 'ctime', 'title', 'wordCount']

export function sortNotes(notes, key = 'mtime', dir = 'desc') {
  const k = SORT_KEYS.includes(key) ? key : 'mtime'
  const out = [...notes]
  if (k === 'title') out.sort((a, b) => String(a.title).localeCompare(String(b.title)))
  else out.sort((a, b) => (b[k] || 0) - (a[k] || 0))
  if (dir === 'asc') out.reverse()
  return out
}

// full tag list for the rail (topTags in dashboard.mjs caps for its panel)
export function tagCounts(notes) {
  const m = new Map()
  for (const n of notes) {
    for (const t of n.tags || []) m.set(t, (m.get(t) || 0) + 1)
  }
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function folderCounts(notes) {
  const m = new Map()
  for (const n of notes) m.set(n.folder, (m.get(n.folder) || 0) + 1)
  return m
}

// list-row snippet: first content line that says something. Regex-cheap —
// this runs on the indexer's hot scan path for every note on every reindex.
export function makeExcerpt(content) {
  for (const line of String(content).split(/\r?\n/)) {
    const t = line.trim()
    if (!t || /^#{1,6}\s/.test(t) || /^(-{3,}|\*{3,}|_{3,})$/.test(t) || /^[a-zA-Z-]+:\s/.test(t)) continue
    if (t.startsWith('<') || t.startsWith('```')) continue // raw HTML callouts / fences say nothing
    const clean = t
      .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/!?\[\[([^\]]+)\]\]/g, '$1')
      .replace(/[*_`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (clean) return clean.length > 140 ? clean.slice(0, 139) + '…' : clean
  }
  return ''
}

// same counting rule as the indexer's wordCount
export function countWords(s) {
  return String(s).split(/\s+/).filter(Boolean).length
}

// sanitize the persisted 'notes-ui' blob against a live vault
export function validateNotesUi(stored, { folders = [], tags = [] } = {}) {
  const ui = { scope: { kind: 'all' }, sort: { key: 'mtime', dir: 'desc' }, collapsed: [] }
  if (!stored || typeof stored !== 'object') return ui
  const s = stored.scope
  if (s && typeof s === 'object') {
    if (['all', 'recent', 'daily', 'pinned'].includes(s.kind)) ui.scope = { kind: s.kind }
    else if (s.kind === 'folder' && folders.some((f) => f.id === s.value)) ui.scope = { kind: 'folder', value: s.value }
    else if (s.kind === 'tag' && tags.includes(s.value)) ui.scope = { kind: 'tag', value: s.value }
  }
  if (stored.sort && SORT_KEYS.includes(stored.sort.key)) {
    ui.sort = { key: stored.sort.key, dir: stored.sort.dir === 'asc' ? 'asc' : 'desc' }
  }
  if (Array.isArray(stored.collapsed)) ui.collapsed = stored.collapsed.filter((x) => typeof x === 'string').slice(0, 20)
  return ui
}
