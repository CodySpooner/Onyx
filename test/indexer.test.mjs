import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import { scanVault, writeNoteRaw, readNoteRaw, createNote, deleteNote, renameNote } from '../src/main/vault-indexer.mjs'

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

test('writeNoteRaw round-trips content and refuses path traversal', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'onyx-'))
  try {
    await writeNoteRaw(dir, 'note.md', '# Hi\nedited')
    assert.equal(await readNoteRaw(dir, 'note.md'), '# Hi\nedited')
    await assert.rejects(() => writeNoteRaw(dir, '../escape.md', 'x'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('createNote / renameNote / deleteNote round-trip; deleteNote refuses to escape', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'onyx-'))
  try {
    const id = await createNote(dir, '(root)', 'My New Note')
    assert.equal(id, 'My New Note.md')
    assert.equal(await createNote(dir, '(root)', 'My New Note'), 'My New Note 2.md') // dedupes
    const renamed = await renameNote(dir, id, 'Renamed')
    assert.equal(renamed, 'Renamed.md')
    await deleteNote(dir, renamed)
    await assert.rejects(() => readNoteRaw(dir, 'Renamed.md'))
    await assert.rejects(() => deleteNote(dir, '../escape.md'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
