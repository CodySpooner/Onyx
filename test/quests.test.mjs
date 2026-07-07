import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeState, rollover, tickQuests, reroll, questValue, pickQuests, DAILY_POOL } from '../src/renderer/lib/quests.mjs'

const NOW = new Date(2026, 6, 7, 15).getTime() // Tue Jul 7 2026, local
const NEXT_DAY = new Date(2026, 6, 8, 15).getTime()
const NEXT_WEEK = new Date(2026, 6, 14, 15).getTime()
const usage = (counters = {}, days = {}) => ({ counters, days })

test('pickQuests deterministic: same seed same picks, different seed differs', () => {
  const a = pickQuests(DAILY_POOL, 3, '2026-07-07').map((q) => q.id)
  const b = pickQuests(DAILY_POOL, 3, '2026-07-07').map((q) => q.id)
  const c = pickQuests(DAILY_POOL, 3, '2026-07-08').map((q) => q.id)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
})

test('base captured at generation: pre-earned counters never count', () => {
  const s = makeState(usage({ taskComplete: 40 }), NOW)
  const q = { id: 'tasks-3', metrics: ['taskComplete'], target: 3, base: 40 }
  assert.equal(questValue(q, usage({ taskComplete: 40 }), s.weekStart), 0)
  assert.equal(questValue(q, usage({ taskComplete: 42 }), s.weekStart), 2)
})

test('tickQuests: one-way latch, bonusXp appended exactly once, idempotent', () => {
  let s = makeState(usage({}), NOW)
  const target = s.daily[0]
  const counters = Object.fromEntries((target.metrics || []).map((m) => [m, target.target]))
  const r1 = tickQuests(s, usage(counters), NOW)
  const gained = r1.state.bonusXp
  assert.ok(r1.completed.length >= 1)
  assert.ok(gained >= 25)
  const r2 = tickQuests(r1.state, usage(counters), NOW)
  assert.equal(r2.state.bonusXp, gained) // no double-award
  assert.equal(r2.completed.length, 0)
})

test('rollover: new day regenerates daily, preserves bonusXp and weekly; new week regenerates weekly', () => {
  let s = makeState(usage({}), NOW)
  s = { ...s, bonusXp: 125 }
  const d = rollover(s, usage({}), NEXT_DAY)
  assert.ok(d.changed)
  assert.equal(d.state.bonusXp, 125)
  assert.equal(d.state.weekStart, s.weekStart) // same week
  assert.notEqual(d.state.day, s.day)
  const w = rollover(s, usage({}), NEXT_WEEK)
  assert.notEqual(w.state.weekStart, s.weekStart)
})

test('reroll: once per day, un-done only, fresh base, weekly untouchable', () => {
  const u = usage({ noteEdit: 10 })
  let s = makeState(u, NOW)
  const victim = s.daily[0]
  const r1 = reroll(s, u, victim.id, NOW)
  assert.ok(r1.changed)
  assert.equal(r1.state.rerolledOn, s.day)
  assert.ok(!r1.state.daily.some((q) => q.id === victim.id))
  const replacement = r1.state.daily.find((q) => !s.daily.some((o) => o.id === q.id))
  if (replacement.metrics?.includes('noteEdit')) assert.equal(replacement.base, 10) // fresh base
  const r2 = reroll(r1.state, u, r1.state.daily[1].id, NOW)
  assert.equal(r2.changed, false) // reroll spent
})

test('activeDays weekly counts only active days since weekStart', () => {
  const s = makeState(usage({}, {}), NOW)
  const q = { id: 'active-5', kind: 'activeDays', target: 5, base: 0 }
  const days = { '2026-07-06': 3, '2026-07-07': 1, '2026-07-01': 9 } // Jul 1 is last week
  assert.equal(questValue(q, usage({}, days), s.weekStart), 2)
})

test('project-log quest completes on projectLogEdit delta with base capture', () => {
  const q = { id: 'project-log-1', metrics: ['projectLogEdit'], target: 1, base: 5 }
  assert.equal(questValue(q, usage({ projectLogEdit: 5 }), '2026-07-06'), 0)
  assert.equal(questValue(q, usage({ projectLogEdit: 6 }), '2026-07-06'), 1)
})
