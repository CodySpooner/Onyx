import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeNotes, filterNotes, sortNotes, tagCounts, folderCounts, makeExcerpt, countWords, validateNotesUi } from '../src/renderer/lib/notesmode.mjs'

const N = (id, over = {}) => ({ id, title: id, folder: 'A', tags: [], mtime: 0, ctime: 0, wordCount: 0, ...over })
const notes = [
  N('a', { folder: 'A', mtime: 3, tags: ['x'] }),
  N('b', { folder: 'B', mtime: 2, tags: ['x', 'y'] }),
  N('c', { folder: '06 - Daily Logs', mtime: 1 })
]

test('scopeNotes: every kind', () => {
  assert.equal(scopeNotes(notes, { kind: 'all' }).length, 3)
  assert.deepEqual(scopeNotes(notes, { kind: 'recent' }).map((n) => n.id), ['a', 'b', 'c'])
  assert.deepEqual(scopeNotes(notes, { kind: 'daily' }, { dailyFolder: '06 - Daily Logs' }).map((n) => n.id), ['c'])
  assert.deepEqual(scopeNotes(notes, { kind: 'folder', value: 'B' }).map((n) => n.id), ['b'])
  assert.deepEqual(scopeNotes(notes, { kind: 'tag', value: 'y' }).map((n) => n.id), ['b'])
})

test('scopeNotes pinned: pin order preserved, dead pins dropped', () => {
  const out = scopeNotes(notes, { kind: 'pinned' }, { pins: ['c', 'ghost', 'a'] })
  assert.deepEqual(out.map((n) => n.id), ['c', 'a'])
})

test('filterNotes matches brain-sidebar semantics (title+tags+type)', () => {
  assert.deepEqual(filterNotes(notes, 'y').map((n) => n.id), ['b'])
  assert.equal(filterNotes(notes, '').length, 3)
})

test('sortNotes: copies, never mutates; title locale; dir flips; bad key falls back', () => {
  const input = [N('b', { wordCount: 5 }), N('a', { wordCount: 9 })]
  const out = sortNotes(input, 'wordCount', 'desc')
  assert.deepEqual(out.map((n) => n.id), ['a', 'b'])
  assert.deepEqual(input.map((n) => n.id), ['b', 'a']) // untouched
  assert.deepEqual(sortNotes(input, 'title').map((n) => n.id), ['a', 'b'])
  assert.deepEqual(sortNotes(input, 'wordCount', 'asc').map((n) => n.id), ['b', 'a'])
  assert.deepEqual(sortNotes(input, 'evil').map((n) => n.id), sortNotes(input, 'mtime').map((n) => n.id))
})

test('tagCounts full list sorted; folderCounts map', () => {
  assert.deepEqual(tagCounts(notes), [{ tag: 'x', count: 2 }, { tag: 'y', count: 1 }])
  assert.equal(folderCounts(notes).get('A'), 1)
})

test('makeExcerpt: skips headings/hr/frontmatter-ish, strips wikilinks+md, caps 140', () => {
  assert.equal(makeExcerpt('# Title\n---\nkey: value\n\nThe **real** [[Other|first]] line `x`.'), 'The real first line x.')
  assert.equal(makeExcerpt('see [[Target Note]] today'), 'see Target Note today')
  assert.equal(makeExcerpt('# only a heading\n'), '')
  assert.equal(makeExcerpt(''), '')
  const long = 'w'.repeat(200)
  assert.equal(makeExcerpt(long).length, 140)
})

test('countWords matches indexer rule', () => {
  assert.equal(countWords('  one\ntwo   three '), 3)
})

test('validateNotesUi: garbage → defaults; live folder/tag pass; dead ones reset', () => {
  const live = { folders: [{ id: 'B' }], tags: ['x'] }
  assert.deepEqual(validateNotesUi(null, live).scope, { kind: 'all' })
  assert.deepEqual(validateNotesUi({ scope: { kind: 'folder', value: 'B' } }, live).scope, { kind: 'folder', value: 'B' })
  assert.deepEqual(validateNotesUi({ scope: { kind: 'folder', value: 'GONE' } }, live).scope, { kind: 'all' })
  assert.deepEqual(validateNotesUi({ scope: { kind: 'tag', value: 'x' } }, live).scope, { kind: 'tag', value: 'x' })
  assert.deepEqual(validateNotesUi({ sort: { key: 'evil', dir: 'up' } }, live).sort, { key: 'mtime', dir: 'desc' })
  assert.deepEqual(validateNotesUi({ sort: { key: 'title', dir: 'asc' } }, live).sort, { key: 'title', dir: 'asc' })
})
