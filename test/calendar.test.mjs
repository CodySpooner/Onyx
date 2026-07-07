import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthGrid, markDays } from '../src/renderer/lib/calendar.mjs'
import { dailyId } from '../src/renderer/lib/daily.mjs'

test('monthGrid: 6 Monday-start weeks, first/last of month inMonth, neighbors not', () => {
  const g = monthGrid(2026, 6) // July 2026 — the 1st is a Wednesday
  assert.equal(g.label, 'JULY 2026')
  assert.equal(g.weeks.length, 6)
  assert.ok(g.weeks.every((w) => w.length === 7))
  const flat = g.weeks.flat()
  const first = flat.find((c) => c.inMonth)
  assert.equal(first.dateStr, '2026-07-01')
  assert.equal(g.weeks[0][0].dateStr, '2026-06-29') // Monday before the 1st
  assert.equal(flat.filter((c) => c.inMonth).length, 31)
})

test('monthGrid: January and December cross year boundaries correctly', () => {
  const jan = monthGrid(2026, 0)
  assert.ok(jan.weeks.flat().some((c) => c.dateStr.startsWith('2025-12')))
  const dec = monthGrid(2026, 11)
  assert.ok(dec.weeks.flat().some((c) => c.dateStr.startsWith('2027-01')))
})

test('markDays: has=true only for cells whose dailyId exists in the vault', () => {
  const folder = '06 - Daily Logs'
  const g = monthGrid(2026, 6)
  const ids = new Set([dailyId(new Date(2026, 6, 4, 12), folder)])
  const marked = markDays(g.weeks, ids, folder)
  const flat = marked.flat()
  assert.ok(flat.find((c) => c.dateStr === '2026-07-04').has)
  assert.equal(flat.filter((c) => c.has).length, 1)
})
