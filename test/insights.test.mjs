import { test } from 'node:test'
import assert from 'node:assert/strict'
import { folderWordTrend, linkMatrix, tagMomentum, duplicateTitles } from '../src/renderer/lib/insights.mjs'

const DAY = 86400000
const NOW = 1800000000000

test('folderWordTrend: bucket placement, window exclusion, OTHER rollup', () => {
  const notes = [
    { folder: 'A', mtime: NOW - DAY, wordCount: 100 }, // last bucket
    { folder: 'A', mtime: NOW - 27 * 7 * DAY, wordCount: 999 }, // outside 26w
    ...'BCDEFGH'.split('').map((f, i) => ({ folder: f, mtime: NOW - DAY, wordCount: 10 - i }))
  ]
  const { folders, weeks } = folderWordTrend(notes, NOW)
  assert.equal(weeks, 26)
  const a = folders.find((f) => f.folder === 'A')
  assert.equal(a.series[25], 100)
  assert.equal(a.total, 100) // 999 excluded
  const other = folders.find((f) => f.folder === 'OTHER')
  assert.ok(other) // 8 folders → 6 + OTHER
  assert.equal(folders.length, 7)
  const droppedSum = 10 - 5 + (10 - 6) // G(4) + H(3)? ranked by total desc: B10 C9 D8 E7 F6 + A100 top6 → dropped G4,H3
  assert.equal(other.total, droppedSum)
})

test('folderWordTrend: empty input → no folders', () => {
  assert.deepEqual(folderWordTrend([], NOW).folders, [])
})

test('linkMatrix: cross and self links; deterministic folder order', () => {
  const notes = [
    { id: 'a1', folder: 'A' }, { id: 'a2', folder: 'A' }, { id: 'b1', folder: 'B' }
  ]
  const links = [
    { source: 'a1', target: 'b1' },
    { source: 'a1', target: 'a2' },
    { source: 'b1', target: 'a1' }
  ]
  const { folders, matrix, max } = linkMatrix(notes, links)
  assert.deepEqual(folders, ['A', 'B'])
  assert.equal(matrix[0][1], 1) // A→B
  assert.equal(matrix[0][0], 1) // A→A internal
  assert.equal(matrix[1][0], 1) // B→A
  assert.equal(max, 1)
})

test('tagMomentum: alive tags outrank numerous-but-stale ones', () => {
  const notes = [
    { tags: ['old'], mtime: NOW - 90 * DAY },
    { tags: ['old'], mtime: NOW - 91 * DAY },
    { tags: ['old'], mtime: NOW - 92 * DAY },
    { tags: ['hot'], mtime: NOW - DAY }
  ]
  const m = tagMomentum(notes, NOW)
  assert.equal(m[0].tag, 'hot')
  assert.equal(m[0].recent, 1)
  const old = m.find((t) => t.tag === 'old')
  assert.equal(old.recent, 0)
  assert.equal(old.total, 3)
})

test('duplicateTitles: case-insensitive groups, uniques dropped', () => {
  const notes = [
    { id: '1', title: 'Ideas' }, { id: '2', title: 'ideas ' }, { id: '3', title: 'Unique' }
  ]
  const groups = duplicateTitles(notes)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].length, 2)
})
