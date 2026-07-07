import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shelfLayout, archipelagoLayout, districtGrid, SHELF, ATLAS } from '../src/renderer/lib/layouts.mjs'

const mkNotes = (folder, n, prefix = 'n') =>
  Array.from({ length: n }, (_, i) => ({ id: `${folder}/${prefix}${String(i).padStart(2, '0')}.md`, folder, title: `${prefix}${String(i).padStart(2, '0')}` }))

test('shelf: rows exactly ROW_H apart within a lane, lanes cap at MAX_ROWS', () => {
  const folders = [{ id: 'A' }, { id: 'B' }]
  const notes = [...mkNotes('A', 30), ...mkNotes('B', 5)]
  const { pos, columns } = shelfLayout(folders, notes)
  assert.equal(columns.find((c) => c.folderId === 'A').lanes, 2) // 30 notes → 18 + 12
  const a0 = pos.get('A/n00.md')
  const a1 = pos.get('A/n01.md')
  assert.ok(Math.abs(a0.y - a1.y - SHELF.ROW_H) < 1e-9)
  assert.equal(a0.x, a1.x) // same lane
  const a18 = pos.get('A/n18.md') // first note of lane 2
  assert.equal(a18.y, SHELF.TOP_Y)
  assert.notEqual(a18.x, a0.x)
})

test('shelf: no two notes share a position; columns are COL_W apart', () => {
  const folders = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
  const notes = [...mkNotes('A', 18), ...mkNotes('B', 18), ...mkNotes('C', 18)]
  const { pos, columns } = shelfLayout(folders, notes)
  const seen = new Set()
  for (const [, p] of pos) {
    const key = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}`
    assert.ok(!seen.has(key), 'duplicate position')
    seen.add(key)
  }
  assert.equal(Math.abs(columns[1].x - columns[0].x), SHELF.COL_W)
})

test('shelf: alphabetical order means daily logs sort chronologically', () => {
  const folders = [{ id: 'D' }]
  const notes = [
    { id: 'D/2026-07-03.md', folder: 'D', title: '2026-07-03' },
    { id: 'D/2026-01-15.md', folder: 'D', title: '2026-01-15' },
    { id: 'D/2026-03-20.md', folder: 'D', title: '2026-03-20' }
  ]
  const { pos } = shelfLayout(folders, notes)
  assert.ok(pos.get('D/2026-01-15.md').y > pos.get('D/2026-03-20.md').y)
  assert.ok(pos.get('D/2026-03-20.md').y > pos.get('D/2026-07-03.md').y)
})

test('districtGrid: exact count, no two cells closer than plot, center-out order', () => {
  for (const m of [1, 5, 20]) {
    const cells = districtGrid(m, 7)
    assert.equal(cells.length, m)
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        const d = Math.hypot(cells[a].gx - cells[b].gx, cells[a].gz - cells[b].gz)
        assert.ok(d >= 7 - 1e-9, `cells ${d.toFixed(2)} apart < plot`)
      }
    }
  }
  const [first] = districtGrid(9, 7)
  assert.equal(Math.abs(first.gx) + Math.abs(first.gz), 0) // odd grid: exact center first
})

function synthCluster(nClusters, perCluster) {
  const ids = []
  const clusterOf = new Map()
  const degOf = new Map()
  for (let c = 0; c < nClusters; c++) {
    for (let j = 0; j < perCluster; j++) {
      const id = `c${c}n${j}`
      ids.push(id)
      clusterOf.set(id, c)
      degOf.set(id, perCluster - j)
    }
  }
  return { ids, clusterOf, degOf }
}

test('archipelago: intra-island spacing never tighter than 14u', () => {
  const { ids, clusterOf, degOf } = synthCluster(3, 20)
  const { pos } = archipelagoLayout(ids, clusterOf, degOf)
  const byC = [[], [], []]
  for (const id of ids) byC[clusterOf.get(id)].push(pos.get(id))
  for (const members of byC) {
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const d = Math.hypot(members[a].x - members[b].x, members[a].z - members[b].z)
        assert.ok(d >= 14, `intra-island spacing ${d.toFixed(1)} < 14`)
      }
    }
  }
})

test('archipelago: island hulls stay >= GULF*0.9 apart after relaxation', () => {
  const { ids, clusterOf, degOf } = synthCluster(17, 6)
  const { islands } = archipelagoLayout(ids, clusterOf, degOf)
  for (let a = 0; a < islands.length; a++) {
    for (let b = a + 1; b < islands.length; b++) {
      const A = islands[a]
      const B = islands[b]
      const hullGap = Math.hypot(A.cx - B.cx, A.cz - B.cz) - A.R - B.R
      assert.ok(hullGap >= ATLAS.GULF * 0.9, `hull gap ${hullGap.toFixed(1)} < ${ATLAS.GULF * 0.9}`)
    }
  }
})

test('archipelago: orphans ring outside every island; hub is highest-degree member', () => {
  const { ids, clusterOf, degOf } = synthCluster(2, 8)
  ids.push('lonely1', 'lonely2')
  clusterOf.set('lonely1', -1)
  degOf.set('lonely1', 0)
  degOf.set('lonely2', 0) // clusterOf missing entirely — also orphan
  const { pos, islands, orphanR } = archipelagoLayout(ids, clusterOf, degOf)
  for (const o of ['lonely1', 'lonely2']) {
    const p = pos.get(o)
    assert.equal(Math.hypot(p.x, p.z).toFixed(1), orphanR.toFixed(1))
  }
  for (const isl of islands) {
    assert.ok(orphanR > Math.hypot(isl.cx, isl.cz) + isl.R)
    assert.equal(isl.hubId, `c${isl.ci}n0`) // deg sorted desc → n0 is hub
  }
})
