import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCurveTable, advanceMote } from '../src/renderer/lib/flow.mjs'

const near = (a, b, eps = 0.15) => Math.abs(a - b) < eps

test('curve table passes through A, M(≈mid), B', () => {
  const t = buildCurveTable([0, 0, 0, 5, 10, 0, 10, 0, 0], 25)
  assert.ok(near(t[0], 0) && near(t[1], 0)) // starts at A
  const mid = 12 * 3
  assert.ok(near(t[mid], 5, 0.6) && near(t[mid + 1], 10, 0.6)) // through M
  const end = 24 * 3
  assert.ok(near(t[end], 10) && near(t[end + 1], 0)) // ends at B
})

test('mote advances, wraps to another segment, position stays finite', () => {
  const table = buildCurveTable([0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0, 0, -1, 2, 0, -2, 0, 0], 24)
  const m = { seg: 0, t: 0.95, speed: 0.5 }
  const out = [0, 0, 0]
  advanceMote(m, 0.5, 2, 24, table, out)
  assert.ok(m.t <= 1 && m.t >= 0)
  assert.equal(m.seg, 1) // wrapped (0+7)%2
  assert.ok(out.every(Number.isFinite))
})

test('core gravity: motes near origin advance faster than far ones', () => {
  // one curve hugging the origin, one far away
  const nearTable = buildCurveTable([1, 0, 0, 0, 1, 0, -1, 0, 0], 24)
  const farTable = buildCurveTable([100, 0, 0, 105, 5, 0, 110, 0, 0], 24)
  const a = { seg: 0, t: 0.4, speed: 0.1 }
  const b = { seg: 0, t: 0.4, speed: 0.1 }
  const out = [0, 0, 0]
  const boostNear = advanceMote(a, 0.1, 1, 24, nearTable, out)
  const boostFar = advanceMote(b, 0.1, 1, 24, farTable, out)
  assert.ok(boostNear > boostFar)
  assert.ok(a.t > b.t)
})
