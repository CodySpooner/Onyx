import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchFilter, hashAngle } from '../src/renderer/lib/graph.mjs'

const note = { title: 'Algorithm Overview', folder: '02', type: 'concept', status: 'active', tags: ['core'] }

test('empty filter matches everything', () => {
  assert.equal(matchFilter(note, { q: '', folders: [], types: [], statuses: [], tags: [] }), true)
})

test('text query matches title case-insensitively', () => {
  assert.equal(matchFilter(note, { q: 'algo', folders: [], types: [], statuses: [], tags: [] }), true)
  assert.equal(matchFilter(note, { q: 'zzz', folders: [], types: [], statuses: [], tags: [] }), false)
})

test('folder filter excludes non-members', () => {
  assert.equal(matchFilter(note, { q: '', folders: ['03'], types: [], statuses: [], tags: [] }), false)
})

test('tag filter matches on any shared tag', () => {
  assert.equal(matchFilter(note, { q: '', folders: [], types: [], statuses: [], tags: ['core'] }), true)
})

test('hashAngle is deterministic and in range', () => {
  const a = hashAngle('some-id')
  assert.equal(a, hashAngle('some-id'))
  assert.ok(a >= 0 && a < Math.PI * 2)
})
