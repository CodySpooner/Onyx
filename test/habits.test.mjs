import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHabitLines, dailyDateFromId, habitGrid } from '../src/renderer/lib/habits.mjs'

test('parses checkbox habit variants; rejects near-misses; skips fences', () => {
  const raw = [
    '- [x] #habit Gym',
    '* [ ] #habit Read 10 pages',
    '- [X] mid #habit line',
    '- [x] #habits not this',
    '- [x] no tag here',
    'plain #habit no checkbox',
    '```',
    '- [x] #habit fenced',
    '```'
  ].join('\n')
  const entries = parseHabitLines(raw, '2026-07-07')
  assert.deepEqual(entries.map((e) => [e.name, e.done]), [
    ['Gym', true],
    ['Read 10 pages', false],
    ['mid line', true]
  ])
})

test('dailyDateFromId: valid extraction, invalid dates rejected', () => {
  assert.equal(dailyDateFromId('06 - Daily Logs/2026-07-07.md'), '2026-07-07')
  assert.equal(dailyDateFromId('Daily 2026-07-07 Mon.md'), '2026-07-07')
  assert.equal(dailyDateFromId('06 - Daily Logs/2026-13-40.md'), null)
  assert.equal(dailyDateFromId('notes.md'), null)
})

test('grid: done/missed/none trichotomy, pct excludes none days, OR-merge', () => {
  const entries = [
    { date: '2026-07-07', name: 'Gym', key: 'gym', done: true },
    { date: '2026-07-07', name: 'Gym', key: 'gym', done: false }, // duplicate: done wins
    { date: '2026-07-06', name: 'Gym', key: 'gym', done: false },
    { date: '2026-07-06', name: 'Read', key: 'read', done: true }
    // 2026-07-05: no daily note at all → none
  ]
  const [gym] = habitGrid(entries, '2026-07-07').filter((h) => h.name === 'Gym')
  const last3 = gym.cells.slice(-3).map((c) => c.state)
  assert.deepEqual(last3, ['none', 'missed', 'done'])
  assert.equal(gym.pct, 50) // 1 done / (1 done + 1 missed); none day excluded
})

test('streak anchors at today, or yesterday when today has no entry yet', () => {
  const mk = (date, done) => ({ date, name: 'Gym', key: 'gym', done })
  const today = habitGrid([mk('2026-07-07', true), mk('2026-07-06', true)], '2026-07-07')[0]
  assert.equal(today.streak, 2)
  const yesterdayOnly = habitGrid([mk('2026-07-06', true), mk('2026-07-05', true)], '2026-07-07')[0]
  assert.equal(yesterdayOnly.streak, 2) // today missing ≠ broken (yet)
})
