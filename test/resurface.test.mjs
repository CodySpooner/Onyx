import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resurfacePick } from '../src/renderer/lib/resurface.mjs'

const DAY = 86400000
const NOW = new Date(2026, 6, 7, 12).getTime()
const note = (id, mtime) => ({ id, title: id, mtime })

test('same date → identical pick; different dates may rotate', () => {
  const notes = [note('a', NOW - 100 * DAY), note('b', NOW - 200 * DAY), note('c', NOW - 300 * DAY)]
  const p1 = resurfacePick(notes, '2026-07-07', NOW)
  const p2 = resurfacePick(notes, '2026-07-07', NOW)
  assert.equal(p1.note.id, p2.note.id)
})

test('anniversary beats cold; requires an EARLIER year', () => {
  const anniversary = note('anniv', new Date(2025, 6, 7).getTime())
  const coldNote = note('cold', NOW - 90 * DAY)
  const p = resurfacePick([anniversary, coldNote], '2026-07-07', NOW)
  assert.equal(p.note.id, 'anniv')
  assert.equal(p.reason, 'anniversary')
  assert.equal(p.years, 1)
  // a note edited TODAY is not its own anniversary
  const today = note('today', NOW)
  const p2 = resurfacePick([today, coldNote], '2026-07-07', NOW)
  assert.equal(p2.reason, 'cold')
  assert.equal(p2.days, 90)
})

test('fallback to oldest rotation when nothing is cold', () => {
  const fresh = [note('x', NOW - DAY), note('y', NOW - 2 * DAY)]
  const p = resurfacePick(fresh, '2026-07-07', NOW)
  assert.equal(p.reason, 'old')
})

test('0 notes → null; 1 note → that note', () => {
  assert.equal(resurfacePick([], '2026-07-07', NOW), null)
  assert.equal(resurfacePick([note('only', NOW - 500 * DAY)], '2026-07-07', NOW).note.id, 'only')
})
