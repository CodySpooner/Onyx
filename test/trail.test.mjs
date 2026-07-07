import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pushTrail, pruneTrail, trailBack } from '../src/renderer/lib/trail.mjs'

test('consecutive dedupe: reopening the same note is a no-op', () => {
  let t = pushTrail([], 'a', 1)
  t = pushTrail(t, 'a', 2)
  assert.deepEqual(t.map((e) => e.id), ['a'])
})

test('move-to-end on revisit — no duplicate chips', () => {
  let t = pushTrail([], 'a', 1)
  t = pushTrail(t, 'b', 2)
  t = pushTrail(t, 'c', 3)
  t = pushTrail(t, 'a', 4)
  assert.deepEqual(t.map((e) => e.id), ['b', 'c', 'a'])
})

test('max trim drops the oldest entries', () => {
  let t = []
  for (let i = 0; i < 35; i++) t = pushTrail(t, 'n' + i, i)
  assert.equal(t.length, 30)
  assert.equal(t[0].id, 'n5')
  assert.equal(t[29].id, 'n34')
})

test('pruneTrail drops dead ids, keeps order', () => {
  const t = [{ id: 'a', ts: 1 }, { id: 'dead', ts: 2 }, { id: 'b', ts: 3 }]
  assert.deepEqual(pruneTrail(t, new Set(['a', 'b'])).map((e) => e.id), ['a', 'b'])
})

test('trailBack: second-to-last entry, null when too short', () => {
  assert.equal(trailBack([]), null)
  assert.equal(trailBack([{ id: 'a' }]), null)
  assert.equal(trailBack([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), 'b')
})
