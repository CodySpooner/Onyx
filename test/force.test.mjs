import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSim } from '../src/renderer/lib/force.mjs'

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

test('positions stay finite and bounded after 600 ticks', () => {
  const ids = ['A', 'B', 'C', 'D', 'E']
  const sim = createSim(ids, [{ source: 'A', target: 'B' }, { source: 'C', target: 'D' }])
  sim.tick(600)
  for (const n of sim.nodes) {
    for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(n[k]), `${n.id}.${k} finite`)
    assert.ok(Math.hypot(n.x, n.y, n.z) <= 90.0001, `${n.id} within maxRadius`)
  }
})

test('linked nodes settle closer than unlinked ones', () => {
  const sim = createSim(['A', 'B', 'C', 'D', 'E'], [{ source: 'A', target: 'B' }, { source: 'C', target: 'D' }])
  sim.tick(600)
  const A = sim.byId.get('A')
  const B = sim.byId.get('B')
  const C = sim.byId.get('C')
  assert.ok(dist(A, B) < dist(A, C), `linked ${dist(A, B).toFixed(1)} < unlinked ${dist(A, C).toFixed(1)}`)
})

test('deterministic: same input → identical layout', () => {
  const ids = ['A', 'B', 'C']
  const links = [{ source: 'A', target: 'B' }]
  const s1 = createSim(ids, links)
  s1.tick(300)
  const s2 = createSim(ids, links)
  s2.tick(300)
  for (let i = 0; i < ids.length; i++) {
    assert.equal(s1.nodes[i].x, s2.nodes[i].x)
    assert.equal(s1.nodes[i].y, s2.nodes[i].y)
  }
})
