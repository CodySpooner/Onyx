import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neighborhood, radialLayout } from '../src/renderer/lib/neighborhood.mjs'

const mkGraph = () => ({
  notes: [
    { id: 'c', inLinks: ['i1', 'i2', 'm1'], outLinks: ['o1', 'm1'] },
    { id: 'i1' }, { id: 'i2' }, { id: 'o1' }, { id: 'm1' }
  ]
})

test('mutual links classified once, removed from in/out', () => {
  const nb = neighborhood(mkGraph(), 'c')
  assert.deepEqual(nb.mutual, ['m1'])
  assert.deepEqual(nb.inbound.sort(), ['i1', 'i2'])
  assert.deepEqual(nb.outbound, ['o1'])
})

test('layout: all coordinates inside bounds for 1, 5, 14, 30 neighbors', () => {
  for (const n of [1, 5, 14, 30]) {
    const nb = { center: 'c', inbound: Array.from({ length: n }, (_, i) => 'in' + i), outbound: [], mutual: [] }
    const { nodes } = radialLayout(nb, 220, 200)
    for (const p of nodes) {
      assert.ok(p.x >= 0 && p.x <= 220 && p.y >= 0 && p.y <= 200, `${p.x},${p.y} out of bounds at n=${n}`)
    }
  }
})

test('layout: sides match direction; inbound left of center, outbound right', () => {
  const nb = { center: 'c', inbound: ['a', 'b'], outbound: ['x', 'y'], mutual: [] }
  const { nodes, center } = radialLayout(nb, 220, 200)
  for (const p of nodes.filter((p) => p.side === 'in')) assert.ok(p.x < center.x)
  for (const p of nodes.filter((p) => p.side === 'out')) assert.ok(p.x > center.x)
})

test('layout: even spacing — no two same-side nodes overlap', () => {
  const nb = { center: 'c', inbound: Array.from({ length: 14 }, (_, i) => 'in' + i), outbound: [], mutual: [] }
  const { nodes } = radialLayout(nb, 220, 200)
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
      assert.ok(d >= 10, `nodes ${d.toFixed(1)}px apart`)
    }
  }
})

test('overflow: keeps highest-degree CAP, reports +N more', () => {
  const inbound = Array.from({ length: 30 }, (_, i) => 'in' + i)
  const degOf = new Map(inbound.map((id, i) => [id, i])) // in29 has highest degree
  const nb = { center: 'c', inbound, outbound: [], mutual: [] }
  const { nodes, more } = radialLayout(nb, 220, 200, degOf)
  assert.equal(nodes.length, 14)
  assert.equal(more.in, 16)
  assert.ok(nodes.some((p) => p.id === 'in29'))
  assert.ok(!nodes.some((p) => p.id === 'in0'))
})
