import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanVault } from '../src/main/vault-indexer.mjs'

const VAULT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture-vault')

test('indexes every .md file as a note', async () => {
  const g = await scanVault(VAULT)
  assert.equal(g.notes.length, 4)
})

test('resolves wikilinks by basename, including [[Target|alias]]', async () => {
  const g = await scanVault(VAULT)
  const alpha = g.notes.find((n) => n.id.endsWith('alpha.md'))
  assert.ok(alpha.outLinks.some((id) => id.endsWith('beta.md')), 'alpha → beta')
  assert.ok(alpha.outLinks.some((id) => id.endsWith('Gamma Note.md')), 'alpha → Gamma Note (aliased)')
})

test('records inbound links symmetrically', async () => {
  const g = await scanVault(VAULT)
  const beta = g.notes.find((n) => n.id.endsWith('beta.md'))
  assert.ok(beta.inLinks.some((id) => id.endsWith('alpha.md')))
})

test('counts unresolved wikilinks without creating edges', async () => {
  const g = await scanVault(VAULT)
  assert.ok(g.meta.unresolvedLinkCount >= 1, '[[Nonexistent]] is unresolved')
  assert.ok(!g.links.some((l) => l.target.includes('Nonexistent')))
})

test('best-effort: malformed frontmatter still yields a note', async () => {
  const g = await scanVault(VAULT)
  const bad = g.notes.find((n) => n.id.endsWith('bad.md'))
  assert.ok(bad, 'bad.md still indexed')
  assert.equal(bad.title, 'bad', 'falls back to basename title')
})

test('assigns folder ids from the top-level directory', async () => {
  const g = await scanVault(VAULT)
  const gamma = g.notes.find((n) => n.id.endsWith('Gamma Note.md'))
  assert.equal(gamma.folder, 'folder1')
})
