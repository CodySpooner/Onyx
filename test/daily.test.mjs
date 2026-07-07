import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyId, isDailyId, adjacentDailyId, dailyTemplate, appendCapture } from '../src/renderer/lib/daily.mjs'

const FOLDER = '06 - Daily Logs'

test('dailyId zero-pads and prefixes folder', () => {
  assert.equal(dailyId(new Date(2026, 6, 7), FOLDER), '06 - Daily Logs/2026-07-07.md')
  assert.equal(dailyId(new Date(2026, 0, 3), '(root)'), '2026-01-03.md')
})

test('isDailyId matches only dated notes in the folder', () => {
  assert.ok(isDailyId('06 - Daily Logs/2026-07-07.md', FOLDER))
  assert.ok(!isDailyId('06 - Daily Logs/notes.md', FOLDER))
  assert.ok(!isDailyId('Other/2026-07-07.md', FOLDER))
})

test('adjacentDailyId crosses month and year boundaries', () => {
  assert.equal(adjacentDailyId('06 - Daily Logs/2026-07-31.md', 1, FOLDER), '06 - Daily Logs/2026-08-01.md')
  assert.equal(adjacentDailyId('06 - Daily Logs/2026-01-01.md', -1, FOLDER), '06 - Daily Logs/2025-12-31.md')
  assert.equal(adjacentDailyId('06 - Daily Logs/plain.md', 1, FOLDER), null)
})

test('dailyTemplate carries type: daily and the three sections', () => {
  const t = dailyTemplate(new Date(2026, 6, 7))
  assert.match(t, /type: daily/)
  assert.match(t, /## Log/)
  assert.match(t, /## Tasks/)
  assert.match(t, /## Notes/)
})

const NOW = new Date(2026, 6, 7, 14, 5)

test('appendCapture inserts after existing bullets in ## Log', () => {
  const raw = '---\ntitle: x\n---\n\n## Log\n\n- 09:00 — first\n\n## Tasks\n'
  const out = appendCapture(raw, 'second thought', NOW)
  const lines = out.split('\n')
  const i = lines.indexOf('- 09:00 — first')
  assert.equal(lines[i + 1], '- 14:05 — second thought')
  assert.ok(out.indexOf('## Tasks') > out.indexOf('second thought'))
})

test('appendCapture into empty Log section lands before next heading', () => {
  const raw = '## Log\n\n## Tasks\n'
  const out = appendCapture(raw, 'hello', NOW)
  const lines = out.split('\n')
  assert.equal(lines[1], '- 14:05 — hello')
})

test('appendCapture without heading appends at EOF', () => {
  const out = appendCapture('just text\n', 'tail', NOW)
  assert.ok(out.endsWith('- 14:05 — tail\n'))
})

test('appendCapture preserves CRLF flavor', () => {
  const raw = '## Log\r\n\r\n- 08:00 — a\r\n\r\n## Tasks\r\n'
  const out = appendCapture(raw, 'b', NOW)
  assert.ok(out.includes('- 14:05 — b\r\n'))
  assert.ok(!/[^\r]\n/.test(out.replace(/\r\n/g, '')), 'no stray bare LF introduced')
})
