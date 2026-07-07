import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProjectLog, lastDoneDate, isStale, collectProjects, buildAgentDigest, canOverwriteDigest, DIGEST_MARKER } from '../src/renderer/lib/projects.mjs'

const SAMPLE = `---
title: Onyx
type: project-log
---

# Onyx

## Status
The app.
Second line.

## Done (append-only)
- 2026-07-01 — shipped v1
- 2026-07-05 — shipped v2
  with a wrapped continuation
- undated cleanup

## Next
- build v3
- review

## Decisions log
- 2026-07-02 — stay on Electron — momentum
`

test('parseProjectLog: tolerant headings, dated bullets, continuations, status join', () => {
  const log = parseProjectLog(SAMPLE)
  assert.equal(log.status, 'The app. Second line.')
  assert.equal(log.done.length, 3)
  assert.deepEqual(log.done[0], { date: '2026-07-01', text: 'shipped v1' })
  assert.ok(log.done[1].text.includes('wrapped continuation'))
  assert.deepEqual(log.done[2], { date: null, text: 'undated cleanup' })
  assert.deepEqual(log.next, ['build v3', 'review'])
  assert.equal(log.decisions.length, 1)
})

test('parseProjectLog never throws; empty/garbage yields empty shape', () => {
  for (const junk of ['', null, '# nothing here', '## Weird\n- x']) {
    const log = parseProjectLog(junk)
    assert.deepEqual(Object.keys(log).sort(), ['decisions', 'done', 'next', 'status'])
  }
})

test('lastDoneDate + isStale (dated beats mtime; fallback to mtime)', () => {
  const log = parseProjectLog(SAMPLE)
  assert.equal(lastDoneDate(log), '2026-07-05')
  const now = new Date(2026, 6, 7, 12).getTime()
  assert.equal(isStale(log, 0, now, 7), false) // 2 days old
  assert.equal(isStale(log, 0, now, 1), true) // 1-day window → stale
  const empty = parseProjectLog('## Done\n- undated only')
  assert.equal(isStale(empty, now - 10 * 86400000, now, 7), true) // mtime fallback
})

test('collectProjects: projectLog notes only, underscore digest excluded, mtime sort', () => {
  const notes = [
    { path: 'Claude Projects/B.md', projectLog: {}, mtime: 2 },
    { path: 'Claude Projects/_AGENT.md', projectLog: {}, mtime: 9 },
    { path: 'Claude Projects/A.md', projectLog: {}, mtime: 5 },
    { path: 'Other/x.md', mtime: 9 }
  ]
  assert.deepEqual(collectProjects(notes).map((n) => n.path.split('/').pop()), ['A.md', 'B.md'])
})

test('buildAgentDigest: deterministic, carries marker, projects + contract', () => {
  const graph = {
    meta: { noteCount: 2, linkCount: 1 },
    notes: [
      { id: 'Claude Projects/Onyx.md', path: 'Claude Projects/Onyx.md', title: 'Onyx', mtime: 1751900000000, wordCount: 100, tags: ['project'], inLinks: [], outLinks: ['x'], projectLog: parseProjectLog(SAMPLE) },
      { id: 'a.md', path: 'a.md', title: 'A', mtime: 0, wordCount: 50, tags: ['project'], inLinks: [], outLinks: [] }
    ]
  }
  const now = new Date(2026, 6, 7, 9, 30).getTime()
  const md = buildAgentDigest({ graph, now, version: '0.9.0' })
  const md2 = buildAgentDigest({ graph, now, version: '0.9.0' })
  assert.equal(md, md2)
  assert.ok(md.includes(DIGEST_MARKER))
  assert.ok(md.includes('## Active Projects (1)'))
  assert.ok(md.includes('Next:'))
  assert.ok(md.includes('read ## Done before redoing anything'))
})

test('canOverwriteDigest: only Onyx-authored or missing files', () => {
  assert.equal(canOverwriteDigest(null), true)
  assert.equal(canOverwriteDigest(DIGEST_MARKER + ' -->'), true)
  assert.equal(canOverwriteDigest('# my hand-written file'), false)
})
