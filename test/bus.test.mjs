import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bus } from '../src/renderer/lib/bus.mjs'

test('on/emit delivers, unsubscribe stops delivery', () => {
  const seen = []
  const off = bus.on('x', (d) => seen.push(d))
  bus.emit('x', 1)
  bus.emit('x', 2)
  off()
  bus.emit('x', 3)
  assert.deepEqual(seen, [1, 2])
})

test('multiple listeners all fire; unknown event is a no-op', () => {
  let a = 0
  let b = 0
  const offA = bus.on('y', () => a++)
  const offB = bus.on('y', () => b++)
  bus.emit('y')
  bus.emit('nothing-listens')
  assert.equal(a, 1)
  assert.equal(b, 1)
  offA()
  offB()
})
