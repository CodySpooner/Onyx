import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ecoLayout } from '../src/renderer/lib/eco.mjs'
import { spawnNpcs, advanceNpc, mulberry32 } from '../src/renderer/lib/econpc.mjs'

const NOW = 1780000000000
const DAY = 86400000

function town(folderCount, notesPer, linkPairs = [], freshIds = []) {
  const folders = []
  const notes = []
  for (let i = 0; i < folderCount; i++) {
    const id = 'f' + i
    folders.push({ id, name: 'Folder ' + i })
    for (let k = 0; k < notesPer; k++) {
      const nid = `${id}-n${k}`
      notes.push({
        id: nid,
        title: `Note ${i}.${k}`,
        folder: id,
        tags: [],
        mtime: freshIds.includes(nid) ? NOW - 3600000 : NOW - 30 * DAY,
        inLinks: [],
        outLinks: []
      })
    }
  }
  const byId = new Map(notes.map((n) => [n.id, n]))
  for (const [a, b] of linkPairs) {
    byId.get(a).outLinks.push(b)
    byId.get(b).inLinks.push(a)
  }
  const { districts, waypoints } = ecoLayout(folders, notes, NOW)
  return { districts, waypoints, notes, links: linkPairs.map(([s, t]) => ({ source: s, target: t })) }
}

test('population bounds: 15 / 36 / 40 for 0-ish, 105, 1000 notes', () => {
  const t1 = town(3, 2) // 6 notes -> 15+1=16
  assert.equal(spawnNpcs(t1.districts, t1.waypoints, t1.notes, [], 0, NOW).length, 16)
  const t2 = town(5, 21) // 105 notes -> 15+21=36
  assert.equal(spawnNpcs(t2.districts, t2.waypoints, t2.notes, [], 0, NOW).length, 36)
  const t3 = town(10, 100) // 1000 notes -> clamp 40
  assert.equal(spawnNpcs(t3.districts, t3.waypoints, t3.notes, [], 0, NOW).length, 40)
})

test('couriers spawn only for fresh cross-district links and carry the title', () => {
  // fresh note with a cross-district link
  const t = town(4, 5, [['f0-n0', 'f2-n1']], ['f0-n0'])
  const npcs = spawnNpcs(t.districts, t.waypoints, t.notes, t.links, 0, NOW)
  const couriers = npcs.filter((n) => n.role === 'courier')
  assert.equal(couriers.length, 1)
  assert.match(couriers[0].errand.text, /delivering: Note 0\.0/)
  assert.equal(couriers[0].errand.noteId, 'f0-n0')

  // stale vault: same link, nothing fresh -> zero couriers
  const s = town(4, 5, [['f0-n0', 'f2-n1']])
  assert.equal(spawnNpcs(s.districts, s.waypoints, s.notes, s.links, 0, NOW).filter((n) => n.role === 'courier').length, 0)

  // fresh but same-district link -> zero couriers
  const m = town(4, 5, [['f0-n0', 'f0-n1']], ['f0-n0'])
  assert.equal(spawnNpcs(m.districts, m.waypoints, m.notes, m.links, 0, NOW).filter((n) => n.role === 'courier').length, 0)
})

test('librarian present iff dueCount>0 and a library district exists', () => {
  const t = town(3, 4)
  t.districts[1].archetype = 'library'
  assert.equal(spawnNpcs(t.districts, t.waypoints, t.notes, [], 5, NOW).filter((n) => n.role === 'librarian').length, 1)
  assert.equal(spawnNpcs(t.districts, t.waypoints, t.notes, [], 0, NOW).filter((n) => n.role === 'librarian').length, 0)
  const noLib = town(3, 4) // synthetic 'Folder N' names -> all hamlet
  assert.equal(spawnNpcs(noLib.districts, noLib.waypoints, noLib.notes, [], 5, NOW).filter((n) => n.role === 'librarian').length, 0)
})

test('wanderers appear for orphans, capped at 3, carrying the orphan title', () => {
  const t = town(3, 4, [['f0-n0', 'f1-n0']]) // linked notes are not orphans
  const npcs = spawnNpcs(t.districts, t.waypoints, t.notes, t.links, 0, NOW)
  const w = npcs.filter((n) => n.role === 'wanderer')
  assert.equal(w.length, Math.min(3, Math.ceil(10 / 10))) // 10 orphans -> 1
  assert.match(w[0].errand.text, /^lost: /)
  assert.ok(w[0].errand.noteId)
  const big = town(8, 10) // 80 orphans -> cap 3
  assert.equal(spawnNpcs(big.districts, big.waypoints, big.notes, [], 0, NOW).filter((n) => n.role === 'wanderer').length, 3)
})

test('60 simulated seconds: every citizen reaches a destination, no NaN ever', () => {
  const t = town(6, 8)
  const npcs = spawnNpcs(t.districts, t.waypoints, t.notes, [], 3, NOW)
  const out = new Float32Array(3)
  const paused = new Set()
  for (let tick = 0; tick < 3600; tick++) {
    for (const npc of npcs) {
      const st = advanceNpc(npc, 1 / 60, t.waypoints, npc._rng, out)
      if (st === 'pause') paused.add(npc.seed)
      assert.ok(Number.isFinite(out[0]) && Number.isFinite(out[1]) && Number.isFinite(out[2]), 'NaN leak')
    }
  }
  for (const npc of npcs.filter((n) => n.role === 'citizen')) {
    assert.ok(paused.has(npc.seed), 'citizen never arrived')
  }
})

test('determinism: fixed seed -> identical trajectories', () => {
  const t = town(5, 6)
  const run = () => {
    const npcs = spawnNpcs(t.districts, t.waypoints, t.notes, [], 0, NOW, { seed: 42 })
    const out = new Float32Array(3)
    const trace = []
    for (let tick = 0; tick < 600; tick++) {
      for (const npc of npcs) advanceNpc(npc, 1 / 60, t.waypoints, npc._rng, out)
      if (tick % 100 === 0) trace.push(npcs.map((n) => [n.x.toFixed(6), n.z.toFixed(6)]))
    }
    return JSON.stringify(trace)
  }
  assert.equal(run(), run())
})

test('255-sentinel graph: npc re-pauses and never throws or NaNs', () => {
  const t = town(4, 4)
  const wp = { ...t.waypoints, nextHop: new Uint8Array(t.waypoints.n * t.waypoints.n).fill(255) }
  const npcs = spawnNpcs(t.districts, t.waypoints, t.notes, [], 0, NOW)
  const out = new Float32Array(3)
  for (let tick = 0; tick < 600; tick++) {
    for (const npc of npcs) {
      advanceNpc(npc, 1 / 60, wp, npc._rng, out)
      assert.ok(Number.isFinite(out[0]) && Number.isFinite(out[2]))
    }
  }
})

test('mulberry32: deterministic, uniform-ish in [0,1)', () => {
  const r1 = mulberry32(7)
  const r2 = mulberry32(7)
  for (let i = 0; i < 100; i++) {
    const v = r1()
    assert.equal(v, r2())
    assert.ok(v >= 0 && v < 1)
  }
})
