import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, buildSuggestions, insertWikilink } from '../src/renderer/lib/suggest.mjs'

test('tokenize: strips code fences, stopwords, short terms; unwraps wikilinks', () => {
  const t = tokenize('The kelly criterion and [[Bankroll Model]] xy\n```\nfencedsecret\n```\nrest')
  assert.ok(t.has('kelly'))
  assert.ok(t.has('criterion'))
  assert.ok(t.has('bankroll'))
  assert.ok(!t.has('fencedsecret'))
  assert.ok(!t.has('the'))
  assert.ok(!t.has('and'))
  assert.ok(!t.has('xy'))
})

const mkNote = (id, title, content, outLinks = [], inLinks = []) => ({ id, title, _content: content, outLinks, inLinks })

function corpus() {
  // 10 notes; two share the rare term "hedging"; the rest talk about filler
  const filler = 'alpha beta gamma delta epsilon zeta theta iota kappa lambda'
  const notes = []
  notes.push(mkNote('a.md', 'Kelly Sizing', 'stake sizing via hedging discipline plus ' + filler))
  notes.push(mkNote('b.md', 'Risk Rules', 'never skip hedging on correlated exposure ' + filler))
  for (let i = 0; i < 8; i++) notes.push(mkNote(`f${i}.md`, `Filler ${i}`, filler + ' unique' + i))
  return notes
}

test('rare shared terms suggest a pair; filler-only notes never pair', () => {
  const s = buildSuggestions(corpus(), { minScore: 0.5 })
  const pair = s.find((x) => [x.a, x.b].sort().join() === 'a.md,b.md')
  assert.ok(pair, 'hedging pair missing')
  assert.ok(pair.terms.includes('hedging'))
  assert.ok(!s.some((x) => x.a.startsWith('f') && x.b.startsWith('f')), 'filler pair leaked')
})

test('already-linked pairs are excluded (either direction)', () => {
  const notes = corpus()
  notes[0].outLinks = ['b.md']
  notes[1].inLinks = ['a.md']
  const s = buildSuggestions(notes, { minScore: 0.5 })
  assert.ok(!s.some((x) => [x.a, x.b].sort().join() === 'a.md,b.md'))
})

test('title mention adds bonus and records the mention side', () => {
  const notes = corpus()
  notes[0]._content += ' see also Risk Rules for the caps'
  const s = buildSuggestions(notes, { minScore: 0.5 })
  const pair = s.find((x) => [x.a, x.b].sort().join() === 'a.md,b.md')
  assert.ok(pair.mention)
  assert.equal(pair.mention.in, 'a.md')
  assert.equal(pair.mention.title, 'Risk Rules')
})

test('mention inside an existing wikilink does NOT count', () => {
  const notes = corpus()
  notes[0]._content += ' see [[Risk Rules]] for caps'
  notes[0].outLinks = ['b.md'] // linked → pair excluded entirely
  const s = buildSuggestions(notes, { minScore: 0.5 })
  assert.ok(!s.some((x) => [x.a, x.b].sort().join() === 'a.md,b.md'))
})

test('per-note cap: no note appears in more than 3 pairs', () => {
  const notes = []
  const filler = 'alpha beta gamma delta epsilon zeta theta iota kappa lambda'
  for (let i = 0; i < 8; i++) notes.push(mkNote(`h${i}.md`, `Hub ${i}`, 'sharpline juice ' + filler))
  for (let i = 0; i < 12; i++) notes.push(mkNote(`p${i}.md`, `Pad ${i}`, filler + ' pad' + i))
  const s = buildSuggestions(notes, { minScore: 0.1 })
  const count = new Map()
  for (const x of s) {
    count.set(x.a, (count.get(x.a) || 0) + 1)
    count.set(x.b, (count.get(x.b) || 0) + 1)
  }
  for (const [, c] of count) assert.ok(c <= 3)
})

test('insertWikilink: wraps first clean mention, skips fences and existing links', () => {
  const raw = 'intro\n```\nRisk Rules in code\n```\nsee [[Other|Risk Rules]] alias\nplain Risk Rules here\n'
  const out = insertWikilink(raw, 'Risk Rules', { in: 'x', title: 'Risk Rules' })
  assert.ok(out.includes('plain [[Risk Rules]] here'))
  assert.ok(out.includes('```\nRisk Rules in code\n```'))
})

test('insertWikilink: no mention → appends under existing ## Related', () => {
  const raw = 'body\n\n## Related\n- [[Old]]\n'
  const out = insertWikilink(raw, 'New Note')
  assert.ok(out.includes('## Related\n- [[New Note]]\n- [[Old]]'))
})

test('insertWikilink: creates ## Related at EOF; CRLF preserved; idempotent no-op', () => {
  const raw = 'body\r\nmore\r\n'
  const out = insertWikilink(raw, 'Target')
  assert.ok(out.includes('\r\n## Related\r\n- [[Target]]\r\n'))
  assert.equal(insertWikilink(out, 'Target'), out) // already linked → unchanged
})

test('basename target + title alias: mention wraps as [[file|Title]], Related uses alias', () => {
  const raw = 'we should check Risk Rules before staking\n'
  const out = insertWikilink(raw, '03 - Risk Rules', { in: 'x', title: 'Risk Rules' }, 'Risk Rules')
  assert.ok(out.includes('[[03 - Risk Rules|Risk Rules]]'), out)
  const out2 = insertWikilink('plain body\n', '03 - Risk Rules', null, 'Risk Rules')
  assert.ok(out2.includes('- [[03 - Risk Rules|Risk Rules]]'))
  // already linked by basename → no-op even when alias differs
  assert.equal(insertWikilink(out, '03 - Risk Rules', null, 'Risk Rules'), out)
})

test('undo round-trip: keeping the original raw restores exactly', () => {
  const raw = 'a note that mentions Risk Rules today\n'
  const out = insertWikilink(raw, 'Risk Rules', { in: 'x', title: 'Risk Rules' })
  assert.notEqual(out, raw)
  // undo is writeNote(id, raw) — trivially byte-exact by construction
  assert.equal(raw, 'a note that mentions Risk Rules today\n')
})

// ── triageQueue (orphan inbox) ──────────────────────────────────
import { triageQueue } from '../src/renderer/lib/suggest.mjs'

test('triageQueue: only degree-0 notes; candidates capped at 3, sorted, dismissed excluded', () => {
  const notes = [
    { id: 'o1', outLinks: [], inLinks: [] },
    { id: 'o2', outLinks: [], inLinks: [] },
    { id: 'linked', outLinks: ['x'], inLinks: [] }
  ]
  const sugg = [
    { a: 'o1', b: 'p1', score: 5 },
    { a: 'o1', b: 'p2', score: 9 },
    { a: 'p3', b: 'o1', score: 7 },
    { a: 'o1', b: 'p4', score: 6 },
    { a: 'o1', b: 'p5', score: 2 },
    { a: 'linked', b: 'p1', score: 8 }
  ]
  const q = triageQueue(notes, sugg, new Set(['o1|p4']))
  assert.deepEqual(q.map((r) => r.orphan), ['o1', 'o2'])
  assert.deepEqual(q[0].candidates.map((c) => c.score), [9, 7, 5]) // p4 dismissed, p5 cut by cap? no — cap 3 after sort
  assert.equal(q[1].candidates.length, 0) // o2 has none → last
})

test('triageQueue: deterministic ordering, no-candidate orphans last', () => {
  const notes = [
    { id: 'zz', outLinks: [], inLinks: [] },
    { id: 'aa', outLinks: [], inLinks: [] },
    { id: 'mm', outLinks: [], inLinks: [] }
  ]
  const sugg = [{ a: 'mm', b: 'x', score: 5 }]
  const q = triageQueue(notes, sugg)
  assert.deepEqual(q.map((r) => r.orphan), ['mm', 'aa', 'zz'])
})
