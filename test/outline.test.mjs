import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractOutline, stripFrontmatter } from '../src/renderer/lib/outline.mjs'

test('extractOutline: levels, ordinal indexing, markdown stripped', () => {
  const raw = '---\ntitle: X\n---\n# One\ntext\n## **Two** [[Link|alias]]\n### `code`\n'
  const o = extractOutline(raw)
  assert.deepEqual(o.map((h) => [h.level, h.text, h.ord]), [
    [1, 'One', 0],
    [2, 'Two alias', 1],
    [3, 'code', 2]
  ])
})

test('extractOutline: fenced pseudo-headings skipped, ords stay aligned', () => {
  const raw = '# Real\n```\n# not a heading\n```\n## Also real\n'
  const o = extractOutline(raw)
  assert.deepEqual(o.map((h) => [h.text, h.ord]), [['Real', 0], ['Also real', 1]])
})

test('stripFrontmatter: CRLF flavor, absent frontmatter untouched', () => {
  assert.equal(stripFrontmatter('---\r\na: 1\r\n---\r\nbody'), 'body')
  assert.equal(stripFrontmatter('no fm'), 'no fm')
})

test('extractOutline: no headings → empty; setext ignored by design', () => {
  assert.deepEqual(extractOutline('plain\n===\ntext'), [])
})
