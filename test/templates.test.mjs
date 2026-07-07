import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findTemplateFolder, applyTemplate } from '../src/renderer/lib/templates.mjs'

const F = (ids) => ids.map((id) => ({ id }))

test('findTemplateFolder matches name variants, null when absent', () => {
  assert.equal(findTemplateFolder(F(['01 - Project', '08 - Templates'])), '08 - Templates')
  assert.equal(findTemplateFolder(F(['templates'])), 'templates')
  assert.equal(findTemplateFolder(F(['My Template Files'])), 'My Template Files')
  assert.equal(findTemplateFolder(F(['Notes', 'Stuff'])), null)
  assert.equal(findTemplateFolder(F(['a-template', 'z-template'])), 'a-template') // first wins
})

test('applyTemplate substitutes all tokens, any case/spacing', () => {
  const now = new Date(2026, 6, 7, 9, 5)
  const out = applyTemplate('# {{title}} on {{ DATE }} at {{Time}} — {{title}}', { title: 'X', now })
  assert.equal(out, '# X on 2026-07-07 at 09:05 — X')
})

test('unknown tokens pass through; empty raw → empty out', () => {
  assert.equal(applyTemplate('keep {{unknown}}', { now: new Date() }), 'keep {{unknown}}')
  assert.equal(applyTemplate('', { now: new Date() }), '')
})
