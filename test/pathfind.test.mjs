import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shortestPath } from '../src/renderer/lib/pathfind.mjs'

const L = (pairs) => pairs.map(([source, target]) => ({ source, target }))

test('direct + multi-hop shortest path', () => {
  const links = L([['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']])
  // a-d is a direct edge → 2 nodes, not the a-b-c-d chain
  assert.deepEqual(shortestPath(links, 'a', 'd').ids, ['a', 'd'])
  assert.deepEqual(shortestPath(links, 'a', 'c').ids, ['a', 'b', 'c'])
})

test('undirected: follows links either direction', () => {
  const links = L([['a', 'b'], ['c', 'b']]) // b reached from both sides
  assert.deepEqual(shortestPath(links, 'a', 'c').ids, ['a', 'b', 'c'])
})

test('same node → trivial path, no edges', () => {
  assert.deepEqual(shortestPath(L([['a', 'b']]), 'a', 'a'), { ids: ['a'], edges: [] })
})

test('unreachable / unknown nodes → null', () => {
  const links = L([['a', 'b'], ['c', 'd']]) // two disconnected components
  assert.equal(shortestPath(links, 'a', 'd'), null)
  assert.equal(shortestPath(links, 'a', 'zzz'), null)
})

test('edges mirror the id chain', () => {
  const r = shortestPath(L([['a', 'b'], ['b', 'c']]), 'a', 'c')
  assert.deepEqual(r.edges, [['a', 'b'], ['b', 'c']])
})

test('self-loops ignored, no infinite loop', () => {
  const links = L([['a', 'a'], ['a', 'b']])
  assert.deepEqual(shortestPath(links, 'a', 'b').ids, ['a', 'b'])
})

test('determinism: identical calls agree', () => {
  const links = L([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']])
  assert.deepEqual(shortestPath(links, 'a', 'd'), shortestPath(links, 'a', 'd'))
})
