import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activityGrid, mtimeCdf, growthSeries, deltas, wordStats,
  clusterBreakdown, topTags, relAge, upsertDay
} from '../src/renderer/lib/dashboard.mjs'
import { detectClusters } from '../src/renderer/lib/clusters.mjs'

const DAY = 86400000
const NOW = Date.parse('2026-07-07T12:00:00')
const note = (id, ageDays, extra = {}) => ({
  id, title: id, tags: [], outLinks: [], inLinks: [], wordCount: 0, mtime: NOW - ageDays * DAY, ...extra
})

test('activityGrid: whole weeks, Sunday start, same-day notes stack', () => {
  const g = activityGrid([note('a', 1), note('b', 1), note('c', 3)], NOW)
  assert.equal(g.cells.length % 7, 0)
  assert.ok(g.cells.length <= 371)
  assert.equal(new Date(g.cells[0].date + 'T12:00:00').getDay(), 0)
  const busy = g.cells.find((c) => c.count === 2)
  assert.ok(busy, 'two notes on one day stack')
  assert.equal(busy.lvl, 2)
  assert.equal(g.max, 2)
  const cols = g.monthLabels.map((m) => m.col)
  for (let i = 1; i < cols.length; i++) assert.ok(cols[i] > cols[i - 1])
})

test('mtimeCdf is monotonic and ends at n', () => {
  const notes = [note('a', 300), note('b', 100), note('c', 5), note('d', 0)]
  const s = mtimeCdf(notes, NOW)
  for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1])
  assert.equal(s[s.length - 1], 4)
})

test('growthSeries prefers snapshots at ≥7 days', () => {
  const snaps = Array.from({ length: 8 }, (_, i) => ({ date: `2026-07-0${i + 1}`, notes: 100 + i }))
  assert.equal(growthSeries(snaps, [], NOW).source, 'snapshots')
  assert.equal(growthSeries(snaps.slice(0, 3), [note('a', 1)], NOW).source, 'mtime')
})

test('deltas: baseline is latest record older than the window; null while collecting', () => {
  const snaps = [
    { date: '2026-06-01', notes: 90, links: 400, words: 40000 },
    { date: '2026-06-29', notes: 95, links: 450, words: 45000 },
    { date: '2026-07-06', notes: 100, links: 500, words: 50000 }
  ]
  const d = deltas(snaps, { notes: 103, links: 533, words: 52000 }, NOW)
  assert.deepEqual(d.d7, { notes: 8, links: 83, words: 7000 }) // vs 06-29
  assert.deepEqual(d.d30, { notes: 13, links: 133, words: 12000 }) // vs 06-01
  assert.equal(deltas([], { notes: 1, links: 1, words: 1 }, NOW).d7, null)
})

test('wordStats totals and deterministic biggest ties', () => {
  const w = wordStats([note('b', 1, { wordCount: 10 }), note('a', 1, { wordCount: 10 }), note('c', 1, { wordCount: 30 })])
  assert.equal(w.total, 50)
  assert.deepEqual(w.biggest.map((n) => n.id), ['c', 'a', 'b'])
})

test('clusterBreakdown labels clusters by their hub', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const links = [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' },
    { source: 'd', target: 'e' }, { source: 'e', target: 'f' }, { source: 'f', target: 'd' }
  ]
  const notes = ids.map((id) => ({
    id, title: id.toUpperCase(),
    outLinks: links.filter((l) => l.source === id).map((l) => l.target),
    inLinks: links.filter((l) => l.target === id).map((l) => l.source)
  }))
  const clusters = detectClusters(ids, links)
  const br = clusterBreakdown(notes, clusters)
  assert.equal(br.length, 2)
  assert.equal(br[0].size, 3)
  assert.ok(br[0].label === br[0].label.toUpperCase(), 'hub title used as label')
})

test('topTags sorts by count desc then tag asc', () => {
  const notes = [note('a', 1, { tags: ['x', 'y'] }), note('b', 1, { tags: ['y'] }), note('c', 1, { tags: ['w'] })]
  assert.deepEqual(topTags(notes).map((t) => t.tag), ['y', 'w', 'x'])
})

test('relAge tiers', () => {
  assert.equal(relAge(NOW - 5 * 60000, NOW), '5m')
  assert.equal(relAge(NOW - 3 * 3600000, NOW), '3h')
  assert.equal(relAge(NOW - 4 * DAY, NOW), '4d')
  assert.match(relAge(NOW - 90 * DAY, NOW), /^[A-Z][a-z]{2} \d+$/)
})

test('upsertDay replaces same date, sorts, caps', () => {
  let days = [{ date: '2026-07-05', notes: 1 }]
  days = upsertDay(days, { date: '2026-07-07', notes: 3 })
  days = upsertDay(days, { date: '2026-07-06', notes: 2 })
  days = upsertDay(days, { date: '2026-07-07', notes: 4 })
  assert.deepEqual(days.map((d) => [d.date, d.notes]), [
    ['2026-07-05', 1], ['2026-07-06', 2], ['2026-07-07', 4]
  ])
  const many = Array.from({ length: 405 }, (_, i) => ({ date: String(10000 + i), notes: i }))
  assert.equal(upsertDay(many.slice(0, 404), many[404]).length, 400)
})
