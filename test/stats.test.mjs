import { test } from 'node:test'
import assert from 'node:assert/strict'
import { velocity, coldNotes, bridgeStats, maturity, nextActions } from '../src/renderer/lib/stats.mjs'

const DAY = 86400000
const NOW = Date.parse('2026-07-07T12:00:00Z')
const note = (id, ageDays, out = [], inn = []) => ({
  id, title: id, folder: 'f', outLinks: out, inLinks: inn, mtime: NOW - ageDays * DAY
})

test('velocity buckets 12 weeks and computes trend', () => {
  const notes = [note('a', 1), note('b', 8), note('c', 100)]
  const v = velocity(notes, NOW)
  assert.equal(v.weeks.length, 12)
  assert.equal(v.weeks[11], 1) // a: this week
  assert.equal(v.weeks[10], 1) // b: last week
  assert.equal(v.weeks.reduce((s, x) => s + x, 0), 2) // c outside window
  assert.equal(v.trendPct, 200) // last6=2, prior6=0 → 2/max(1,0) → 200%
})

test('coldNotes finds >60d, oldest first', () => {
  const notes = [note('fresh', 3), note('old', 90), note('older', 200)]
  const cold = coldNotes(notes, NOW)
  assert.deepEqual(cold.map((c) => c.note.id), ['older', 'old'])
  assert.equal(cold[0].ageDays, 200)
})

test('bridgeStats counts only cross-cluster links between real clusters', () => {
  const clusterOf = new Map([['a', 0], ['b', 0], ['c', 1], ['d', -1]])
  const links = [
    { source: 'a', target: 'b' }, // same cluster
    { source: 'a', target: 'c' }, // bridge
    { source: 'b', target: 'c' }, // bridge
    { source: 'a', target: 'd' }  // involves orphan → not a bridge
  ]
  const b = bridgeStats(links, clusterOf)
  assert.equal(b.count, 2)
  assert.deepEqual(b.top[0], { id: 'c', cross: 2 })
})

test('maturity applies the spec formula', () => {
  // 4 notes: degrees 1,2,1,0 → avg 1 → density 1/6; connected 3/4; all fresh
  const notes = [
    note('A', 1, ['B'], []),
    note('B', 1, ['C'], ['A']),
    note('C', 1, [], ['B']),
    note('D', 1, [], [])
  ]
  const m = maturity(notes, NOW)
  assert.equal(m.score, 65) // 40*0.75 + 30*1 + 30*(1/6) = 65
  assert.equal(m.connectedRatio, 0.75)
})

test('nextActions caps at 3: orphans → cold → velocity (small cluster skips isolation rule)', () => {
  const notes = [note('A', 1, ['B'], []), note('B', 1, [], ['A']), note('Lonely', 1)]
  const acts = nextActions({
    notes,
    cold: [{ note: note('Dusty', 90), ageDays: 90 }],
    trendPct: 50,
    clusterOf: new Map([['A', 0], ['B', 0], ['Lonely', -1]]),
    clusterCount: 1,
    links: [{ source: 'A', target: 'B' }]
  })
  assert.equal(acts.length, 3)
  assert.match(acts[0], /1 orphan note/)
  assert.match(acts[1], /Dusty.*90d/)
  assert.match(acts[2], /Velocity \+50%/)
})

test('nextActions flags an isolated cluster of 3+', () => {
  const notes = [
    note('A', 1, ['B', 'C'], []), note('B', 1, ['C'], ['A']), note('C', 1, [], ['A', 'B'])
  ]
  const acts = nextActions({
    notes,
    cold: [],
    trendPct: -10,
    clusterOf: new Map([['A', 0], ['B', 0], ['C', 0]]),
    clusterCount: 1,
    links: [{ source: 'A', target: 'B' }, { source: 'A', target: 'C' }, { source: 'B', target: 'C' }]
  })
  assert.match(acts[0], /Cluster 1 \(3 notes\) has no bridges/)
  assert.match(acts[1], /Velocity -10%/)
})
