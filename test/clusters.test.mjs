import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectClusters } from '../src/renderer/lib/clusters.mjs'

test('two disjoint triangles → 2 clusters', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const links = [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' },
    { source: 'd', target: 'e' }, { source: 'e', target: 'f' }, { source: 'f', target: 'd' }
  ]
  const r = detectClusters(ids, links)
  assert.equal(r.clusterCount, 2)
  assert.equal(r.clusterOf.get('a'), r.clusterOf.get('b'))
  assert.equal(r.clusterOf.get('a'), r.clusterOf.get('c'))
  assert.notEqual(r.clusterOf.get('a'), r.clusterOf.get('d'))
})

test('singletons are orphans (-1), not clusters', () => {
  const r = detectClusters(['a', 'b', 'c'], [{ source: 'a', target: 'b' }])
  assert.equal(r.clusterCount, 1)
  assert.equal(r.clusterOf.get('c'), -1)
})

test('bridge node joins its denser side', () => {
  const ids = ['a', 'b', 'c', 'd', 'p', 'q', 'x']
  const links = [
    { source: 'a', target: 'b' }, { source: 'a', target: 'c' }, { source: 'a', target: 'd' },
    { source: 'b', target: 'c' }, { source: 'b', target: 'd' }, { source: 'c', target: 'd' },
    { source: 'p', target: 'q' },
    { source: 'x', target: 'a' }, { source: 'x', target: 'b' }, { source: 'x', target: 'p' }
  ]
  const r = detectClusters(ids, links)
  assert.equal(r.clusterOf.get('x'), r.clusterOf.get('a'))
  assert.equal(r.clusterCount, 2)
})

test('a hub linking two triangles does not flood them into one cluster', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'hub']
  const links = [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' },
    { source: 'd', target: 'e' }, { source: 'e', target: 'f' }, { source: 'f', target: 'd' },
    { source: 'hub', target: 'a' }, { source: 'hub', target: 'd' }
  ]
  const r = detectClusters(ids, links)
  assert.equal(r.clusterCount, 2)
  assert.notEqual(r.clusterOf.get('a'), r.clusterOf.get('d'))
})

test('deterministic across runs', () => {
  const ids = ['n1', 'n2', 'n3', 'n4']
  const links = [{ source: 'n1', target: 'n2' }, { source: 'n3', target: 'n4' }]
  const a = detectClusters(ids, links)
  const b = detectClusters(ids, links)
  assert.deepEqual([...a.clusterOf.entries()], [...b.clusterOf.entries()])
})
