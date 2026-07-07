import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archetypeFor, ecoLayout, routeLen, diffTown } from '../src/renderer/lib/eco.mjs'

const NOW = 1780000000000
const DAY = 86400000

function synth(folderCount, notesPer = 6) {
  const folders = []
  const notes = []
  for (let i = 0; i < folderCount; i++) {
    const id = 'f' + i
    folders.push({ id, name: 'Folder ' + i, color: '#7fd4ff' })
    for (let k = 0; k < notesPer; k++) {
      notes.push({ id: `${id}-n${k}`, title: `Note ${i}.${k}`, folder: id, tags: [], mtime: NOW - (k + 1) * 3 * DAY })
    }
  }
  return { folders, notes }
}

test('archetypeFor: exact mapping for the real vault folder names', () => {
  const cases = {
    '00 - Dashboard': 'hq',
    'Claude Projects': 'signal',
    '03 - Data Pipeline': 'refinery',
    '02 - Projection Engine': 'lab',
    '04 - Backtesting': 'lab',
    '05 - Features & Models': 'lab',
    '14 - Results': 'trading',
    '09 - Apps & Features': 'workshop',
    '11 - Engineering & Ops': 'workshop',
    '08 - Templates': 'workshop',
    '07 - Resources': 'library',
    '13 - Specs': 'library',
    '12 - Diagrams & Maps': 'library',
    Excalidraw: 'library',
    'Useful Commands': 'library',
    '06 - Daily Logs': 'hamlet',
    '(root)': 'hamlet',
    zzz: 'hamlet'
  }
  for (const [name, want] of Object.entries(cases)) {
    assert.equal(archetypeFor(name, []), want, name)
  }
  // tag fallback: nameless folder whose notes are tagged #research -> lab
  assert.equal(archetypeFor('misc', [{ tags: ['research'] }, { tags: ['research'] }]), 'lab')
})

test('layout: no-overlap invariant + doors near centers for 1/2/14/40 folders', () => {
  for (const fc of [1, 2, 14, 40]) {
    const { folders, notes } = synth(fc)
    const { districts } = ecoLayout(folders, notes, NOW)
    assert.equal(districts.length, fc)
    for (let a = 0; a < districts.length; a++) {
      const A = districts[a]
      assert.ok(Math.hypot(A.door.x - A.cx, A.door.z - A.cz) <= A.S + 3, 'door near center')
      for (let b = a + 1; b < districts.length; b++) {
        const B = districts[b]
        const d = Math.hypot(A.cx - B.cx, A.cz - B.cz)
        assert.ok(d >= A.S + B.S + 12 - 1e-6, `overlap ${fc}: ${d} < ${A.S + B.S + 12}`)
      }
    }
  }
  // empty folders dropped; empty vault -> plaza only
  const e = ecoLayout([{ id: 'x', name: 'X' }], [], NOW)
  assert.equal(e.districts.length, 0)
  assert.equal(e.waypoints.n, 1)
})

test('routing: nextHop reaches every pair, no 255 on connected graphs', () => {
  for (const fc of [1, 2, 14]) {
    const { folders, notes } = synth(fc)
    const { waypoints } = ecoLayout(folders, notes, NOW)
    const { nextHop, n } = waypoints
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        let cur = a
        let hops = 0
        while (cur !== b && hops <= n) {
          const nx = nextHop[cur * n + b]
          assert.notEqual(nx, 255, `unreachable ${a}->${b}`)
          cur = nx
          hops++
        }
        assert.equal(cur, b)
        assert.ok(Number.isFinite(routeLen(a, b, waypoints)))
      }
    }
  }
})

test('determinism: two identical calls deep-equal', () => {
  const { folders, notes } = synth(9)
  assert.deepEqual(ecoLayout(folders, notes, NOW), ecoLayout(folders, notes, NOW))
})

test('district stats: lit/litBucket/recentCount/hubNoteId from real mtimes', () => {
  const folders = [{ id: 'a', name: 'Alpha' }]
  const notes = [
    { id: 'n1', title: 'old', folder: 'a', tags: [], mtime: NOW - 100 * DAY },
    { id: 'n2', title: 'fresh', folder: 'a', tags: [], mtime: NOW - 1 * DAY },
    { id: 'n3', title: 'null-mtime', folder: 'a', tags: [], mtime: null },
    { id: 'n4', title: 'week', folder: 'a', tags: [], mtime: NOW - 10 * DAY }
  ]
  const [d] = ecoLayout(folders, notes, NOW).districts
  assert.equal(d.lit, 0.5) // n2 + n4 within 14d, of 4
  assert.equal(d.litBucket, 1)
  assert.equal(d.recentCount, 1) // only n2 within 7d
  assert.equal(d.hubNoteId, 'n2') // most recent mtime
})

test('diffTown: mtime-only change relights, structural change rebuilds', () => {
  const { folders, notes } = synth(5, 8)
  const base = ecoLayout(folders, notes, NOW).districts

  // no change at all
  assert.deepEqual(diffTown(base, ecoLayout(folders, notes, NOW).districts), { rebuild: false, relight: [] })

  // touch every f0 note to now -> litBucket 2, same geometry
  const touched = notes.map((n) => (n.folder === 'f0' ? { ...n, mtime: NOW } : n))
  const d2 = ecoLayout(folders, touched, NOW).districts
  assert.deepEqual(diffTown(base, d2), { rebuild: false, relight: ['f0'] })

  // added folder -> rebuild
  const more = synth(6, 8)
  assert.equal(diffTown(base, ecoLayout(more.folders, more.notes, NOW).districts).rebuild, true)

  // count bucket jump (8 -> 20 notes in f0) -> rebuild
  const grown = notes.concat(Array.from({ length: 12 }, (_, k) => ({ id: 'g' + k, title: 'g' + k, folder: 'f0', tags: [], mtime: NOW - DAY })))
  assert.equal(diffTown(base, ecoLayout(folders, grown, NOW).districts).rebuild, true)

  // first paint always rebuilds
  assert.equal(diffTown(null, base).rebuild, true)
})
