import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, TAG_VOCAB, searchCatalog, markInstalled, vaultTopTags, fitScore, mergeLive } from '../src/renderer/lib/skill-catalog.mjs'

test('catalog integrity: unique ids, valid tags, install text present', () => {
  const ids = new Set()
  for (const e of CATALOG) {
    assert.ok(!ids.has(e.id), 'dup id ' + e.id)
    ids.add(e.id)
    assert.ok(e.description.length <= 200)
    assert.ok(e.install)
    for (const t of e.tags) assert.ok(TAG_VOCAB.includes(t), `${e.id} bad tag ${t}`)
  }
})

test('searchCatalog matches name/description/tags, empty q = all', () => {
  assert.equal(searchCatalog(CATALOG, '').length, CATALOG.length)
  assert.ok(searchCatalog(CATALOG, 'superpowers').some((e) => e.id === 'superpowers'))
  assert.ok(searchCatalog(CATALOG, 'obsidian').length >= 1)
})

test('markInstalled cross-references arsenal by name and plugin', () => {
  const arsenal = [
    { name: 'brainstorming', plugin: 'superpowers' },
    { name: 'onyx-bridge', plugin: null }
  ]
  const marked = markInstalled(CATALOG, arsenal)
  assert.ok(marked.find((e) => e.id === 'superpowers').installed)
  assert.ok(marked.find((e) => e.id === 'onyx-bridge').installed)
  assert.ok(!marked.find((e) => e.id === 'claude-flow').installed)
})

test('vaultTopTags + fitScore with alias expansion (bets → betting)', () => {
  const notes = [
    { tags: ['bets', 'model'] }, { tags: ['bets'] }, { tags: ['app'] }
  ]
  const top = vaultTopTags(notes)
  assert.equal(top[0], 'bets')
  const entry = { tags: ['betting', 'research'] }
  assert.ok(fitScore(entry, top) >= 2) // bets→betting, model→research
})

test('mergeLive appends unknown repos only, tags filtered to vocab', () => {
  const live = [
    { full_name: 'obra/superpowers', name: 'superpowers', html_url: 'x', stargazers_count: 999, topics: ['claude-code-plugin'] }, // known → skipped
    { full_name: 'new/thing', name: 'thing', html_url: 'https://github.com/new/thing', description: 'd', stargazers_count: 42, topics: ['claude-code-plugin', 'weirdtag', 'testing'] }
  ]
  const merged = mergeLive(CATALOG, live)
  assert.equal(merged.length, CATALOG.length + 1)
  const added = merged.find((e) => e.repo === 'new/thing')
  assert.deepEqual(added.tags, ['testing'])
  assert.equal(added.kind, 'plugin')
  assert.equal(added.stars, 42)
})
