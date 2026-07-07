import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startSession, pause, resume, remaining, advance, fmt } from '../src/renderer/lib/pomodoro.mjs'

const CFG = { work: 25, break: 5 }
const T0 = 1_000_000
const MIN = 60000

test('remaining at t0 is 25:00; after 10 min is 15:00', () => {
  const s = startSession(T0)
  assert.equal(fmt(remaining(s, T0, CFG)), '25:00')
  assert.equal(fmt(remaining(s, T0 + 10 * MIN, CFG)), '15:00')
})

test('pause gap does not consume time', () => {
  let s = startSession(T0)
  s = pause(s, T0 + 5 * MIN)
  // 12 minutes pass while paused
  s = resume(s, T0 + 17 * MIN)
  assert.equal(fmt(remaining(s, T0 + 17 * MIN, CFG)), '20:00') // only 5 min consumed
  assert.equal(fmt(remaining(s, T0 + 22 * MIN, CFG)), '15:00')
})

test('double pause / double resume are no-ops', () => {
  let s = startSession(T0)
  s = pause(s, T0 + MIN)
  const again = pause(s, T0 + 2 * MIN)
  assert.equal(again.pausedAt, s.pausedAt)
  s = resume(s, T0 + 3 * MIN)
  assert.equal(resume(s, T0 + 4 * MIN), s)
})

test('advance flips work→break→work; completion flagged only leaving work', () => {
  const s = startSession(T0)
  const a = advance(s, T0 + 25 * MIN)
  assert.equal(a.completedWork, true)
  assert.equal(a.session.phase, 'break')
  const b = advance(a.session, T0 + 30 * MIN)
  assert.equal(b.completedWork, false)
  assert.equal(b.session.phase, 'work')
})

test('custom durations respected', () => {
  const s = startSession(T0, 'break')
  assert.equal(fmt(remaining(s, T0, { work: 50, break: 10 })), '10:00')
})
