import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffLines, diffStats } from '../src/renderer/lib/diff.mjs'

test('identical → all same', () => {
  const { ops, big } = diffLines('a\nb\nc', 'a\nb\nc')
  assert.equal(big, false)
  assert.ok(ops.every((o) => o.type === 'same'))
})

test('insert and delete detected minimally', () => {
  const ins = diffLines('a\nc', 'a\nb\nc').ops
  assert.deepEqual(ins.map((o) => o.type), ['same', 'add', 'same'])
  const del = diffLines('a\nb\nc', 'a\nc').ops
  assert.deepEqual(del.map((o) => o.type), ['same', 'del', 'same'])
})

test('rewrite = del+add pairs; stats count both sides', () => {
  const { ops } = diffLines('old line\nkeep', 'new line\nkeep')
  assert.deepEqual(diffStats(ops), { add: 1, del: 1 })
})

test('empty sides', () => {
  assert.equal(diffLines('', '').ops.length, 1) // one empty "same" line
  assert.ok(diffLines('', 'x\ny').ops.filter((o) => o.type === 'add').length >= 2)
})

test('CRLF vs LF compare equal per line', () => {
  const { ops } = diffLines('a\r\nb\r\n', 'a\nb\n')
  assert.ok(ops.every((o) => o.type === 'same'))
})

test('big-input guard trips instead of hanging', () => {
  const big = ('x\n'.repeat(3000)) // 3000 lines
  const r = diffLines(big, big.replace(/x/g, 'y'), 1e6) // 9M cells > 1M guard
  assert.equal(r.big, true)
})
