import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyScore, fuzzyFilter } from '../src/renderer/lib/fuzzy.mjs'

test("'dn' ranks 'Daily Note' over 'modern'", () => {
  const a = fuzzyScore('dn', 'Daily Note')
  const b = fuzzyScore('dn', 'modern')
  assert.ok(a && b)
  assert.ok(a.score > b.score, `${a.score} > ${b.score}`)
})

test('prefix beats boundary beats scattered', () => {
  const prefix = fuzzyScore('day', 'daybook')
  const boundary = fuzzyScore('day', 'my day off')
  const scattered = fuzzyScore('day', 'dry away')
  assert.ok(prefix.score > boundary.score)
  assert.ok(boundary.score > scattered.score)
})

test('non-subsequence returns null', () => {
  assert.equal(fuzzyScore('xyz', 'Daily Note'), null)
})

test('indices point at matched chars', () => {
  const r = fuzzyScore('dn', 'Daily Note')
  assert.deepEqual(r.indices.map((i) => 'Daily Note'[i].toLowerCase()), ['d', 'n'])
})

test('empty query passes items through in order', () => {
  const items = ['a', 'b', 'c']
  const out = fuzzyFilter('', items, (x) => x, 2)
  assert.deepEqual(out.map((o) => o.item), ['a', 'b'])
  assert.equal(out[0].score, 0)
})

test('fuzzyFilter sorts by score desc and respects limit', () => {
  const items = ['modern', 'Daily Note', 'dn exact']
  const out = fuzzyFilter('dn', items, (x) => x, 2)
  assert.equal(out.length, 2)
  assert.equal(out[0].item, 'dn exact')
  assert.equal(out[1].item, 'Daily Note')
})
