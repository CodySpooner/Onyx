import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchNote, applyReplace } from '../src/renderer/lib/findreplace.mjs'

test('wholeWord: "bet" never matches inside "better"', () => {
  const raw = 'a bet is better than no bet\n'
  assert.equal(searchNote(raw, 'bet', { wholeWord: true }).length, 2)
  assert.equal(searchNote(raw, 'bet', { wholeWord: false }).length, 3)
})

test('case sensitivity toggle', () => {
  const raw = 'Kelly kelly KELLY'
  assert.equal(searchNote(raw, 'kelly', {}).length, 3)
  assert.equal(searchNote(raw, 'kelly', { caseSensitive: true }).length, 1)
})

test('search/apply count parity; CRLF and line numbers preserved', () => {
  const raw = 'one\r\ntwo bet\r\nbet three\r\n'
  const found = searchNote(raw, 'bet', {})
  assert.equal(found.length, 2)
  assert.deepEqual(found.map((f) => f.line), [1, 2])
  const { next, count } = applyReplace(raw, 'bet', 'wager', {})
  assert.equal(count, 2)
  assert.equal(next, 'one\r\ntwo wager\r\nwager three\r\n')
})

test('replacement is literal: $ and backslash never expand', () => {
  const { next } = applyReplace('price X here', 'X', '$100\\unit', {})
  assert.equal(next, 'price $100\\unit here')
})

test('greedy-left non-overlap: "aa" in "aaaa" replaces twice, not three times', () => {
  const { next, count } = applyReplace('aaaa', 'aa', 'b', {})
  assert.equal(count, 2)
  assert.equal(next, 'bb')
})

test('empty term matches nothing', () => {
  assert.equal(searchNote('anything', '', {}).length, 0)
  assert.equal(applyReplace('anything', '', 'x', {}).count, 0)
})
