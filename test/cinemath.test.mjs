import { test } from 'node:test'
import assert from 'node:assert/strict'
import { easeInOutCubic, easeOutBack, clamp01 } from '../src/renderer/lib/cinemath.mjs'

test('endpoints are exact', () => {
  assert.equal(easeInOutCubic(0), 0)
  assert.equal(easeInOutCubic(1), 1)
  assert.ok(Math.abs(easeOutBack(0)) < 1e-9)
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9)
})

test('easeOutBack overshoots past 1 in the back window, then settles', () => {
  let peak = 0
  for (let t = 0; t <= 1.0001; t += 0.01) peak = Math.max(peak, easeOutBack(t))
  assert.ok(peak > 1.05 && peak < 1.15, `peak ${peak}`)
})

test('easeInOutCubic stays inside [0,1] and is monotonic', () => {
  let prev = -1
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const v = easeInOutCubic(Math.min(1, t))
    assert.ok(v >= 0 && v <= 1)
    assert.ok(v >= prev)
    prev = v
  }
})

test('clamp01', () => {
  assert.equal(clamp01(-2), 0)
  assert.equal(clamp01(0.5), 0.5)
  assert.equal(clamp01(9), 1)
})
