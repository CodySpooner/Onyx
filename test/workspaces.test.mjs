import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAutoWorkspaces, scopeGraph, noteInWorkspace, validateWorkspaceUi } from '../src/renderer/lib/workspaces.mjs'

const G = () => ({
  notes: [
    { id: 'Claude Projects/Onyx.md', path: 'Claude Projects/Onyx.md', title: 'Onyx', folder: 'Claude Projects', projectLog: {}, outLinks: ['a.md'], inLinks: ['b.md'], tags: [] },
    { id: 'Claude Projects/_AGENT.md', path: 'Claude Projects/_AGENT.md', title: '_AGENT', folder: 'Claude Projects', projectLog: {}, outLinks: [], inLinks: [], tags: [] },
    { id: 'a.md', path: 'a.md', title: 'A', folder: 'F1', outLinks: ['b.md'], inLinks: ['Claude Projects/Onyx.md'], tags: ['x'] },
    { id: 'b.md', path: 'b.md', title: 'B', folder: 'F2', outLinks: ['Claude Projects/Onyx.md'], inLinks: ['a.md'], tags: [] },
    { id: 'c.md', path: 'c.md', title: 'C', folder: 'F2', outLinks: [], inLinks: [], tags: ['x'] }
  ],
  links: [
    { source: 'Claude Projects/Onyx.md', target: 'a.md' },
    { source: 'a.md', target: 'b.md' },
    { source: 'b.md', target: 'Claude Projects/Onyx.md' }
  ],
  folders: [{ id: 'Claude Projects' }, { id: 'F1' }, { id: 'F2' }],
  cards: [{ noteId: 'a.md' }, { noteId: 'c.md' }],
  suggestions: [{ a: 'a.md', b: 'c.md' }, { a: 'a.md', b: 'b.md' }],
  unresolved: [{ in: 'c.md', target: 'X' }],
  habitEntries: [],
  meta: { noteCount: 5, linkCount: 3, unresolvedLinkCount: 1 }
})

test('deriveAutoWorkspaces: one per log, digest excluded, 1-hop closure', () => {
  const ws = deriveAutoWorkspaces(G())
  assert.equal(ws.length, 1)
  assert.equal(ws[0].name, 'Onyx')
  assert.deepEqual([...ws[0].noteIds].sort(), ['Claude Projects/Onyx.md', 'a.md', 'b.md'])
})

test('scopeGraph: clean slate — notes, links, cards, suggestions, per-note link lists all scoped', () => {
  const ws = deriveAutoWorkspaces(G())[0]
  const s = scopeGraph(G(), ws)
  assert.equal(s.notes.length, 3)
  assert.equal(s.links.length, 3) // all three among members
  assert.equal(s.meta.noteCount, 3)
  assert.deepEqual(s.cards.map((c) => c.noteId), ['a.md'])
  assert.deepEqual(s.suggestions, [{ a: 'a.md', b: 'b.md' }]) // c.md pair dropped
  assert.equal(s.unresolved.length, 0)
  // c.md gone; per-note lists contain no outsiders
  for (const n of s.notes) {
    for (const id of [...n.outLinks, ...n.inLinks]) assert.ok(s.notes.some((x) => x.id === id))
  }
})

test('manual workspace: folder OR tag membership', () => {
  const ws = { id: 'm1', name: 'M', folders: ['F2'], tags: ['x'] }
  const g = G()
  assert.ok(noteInWorkspace(ws, g.notes[2])) // a.md via tag x
  assert.ok(noteInWorkspace(ws, g.notes[3])) // b.md via folder F2
  assert.ok(!noteInWorkspace(ws, g.notes[0])) // log: neither
})

test('null workspace = whole vault untouched', () => {
  const g = G()
  assert.equal(scopeGraph(g, null), g)
})

test('validateWorkspaceUi: dead active id resets; manual sanitized + capped', () => {
  const auto = deriveAutoWorkspaces(G())
  const ok = validateWorkspaceUi({ activeId: auto[0].id, manual: [{ name: ' Bets ', folders: ['F1'], tags: 7 }] }, auto)
  assert.equal(ok.activeId, auto[0].id)
  assert.equal(ok.manual[0].name, 'Bets')
  assert.deepEqual(ok.manual[0].tags, [])
  const dead = validateWorkspaceUi({ activeId: 'auto:GONE.md', manual: [] }, auto)
  assert.equal(dead.activeId, null)
})

test('W1 gap-close: manual union includes noteIds; buildWorkspaces; pickColor stable', async () => {
  const { buildWorkspaces, pickColor } = await import('../src/renderer/lib/workspaces.mjs')
  const g = G()
  const manual = [{ id: 'm1', name: 'M', folders: [], tags: [], noteIds: ['c.md'] }]
  assert.ok(noteInWorkspace(manual[0], g.notes[4])) // c.md via hand-picked id
  const all = buildWorkspaces(g, manual)
  assert.equal(all.length, 2)
  assert.ok(all[0].auto && all[1].id === 'm1')
  assert.equal(pickColor('Onyx'), pickColor('Onyx'))
  const s = scopeGraph(g, all[0])
  assert.equal(s.meta.scope, 'Onyx')
  assert.equal(s.habitEntries.length, 0) // identity pass-through, no throw
  // empty manual workspace scopes to zero notes without throwing
  const empty = scopeGraph(g, { id: 'e', name: 'E', folders: [], tags: [], noteIds: [] })
  assert.equal(empty.notes.length, 0)
})
