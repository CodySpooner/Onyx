import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setFrontmatterKey } from '../src/renderer/lib/frontmatter.mjs'

test('replaces an existing key line only — everything else byte-identical', () => {
  const raw = '---\ntitle: X\nread: false\nurl: https://a.b\n---\nbody stays\n'
  const out = setFrontmatterKey(raw, 'read', true)
  assert.equal(out, '---\ntitle: X\nread: true\nurl: https://a.b\n---\nbody stays\n')
})

test('adds the key to an existing block before the closing ---', () => {
  const raw = '---\ntitle: X\n---\nbody\n'
  const out = setFrontmatterKey(raw, 'read', true)
  assert.equal(out, '---\ntitle: X\nread: true\n---\nbody\n')
})

test('creates a block when none exists', () => {
  const out = setFrontmatterKey('just body\n', 'read', true)
  assert.equal(out, '---\nread: true\n---\njust body\n')
})

test('CRLF files preserved byte-for-byte outside the changed line', () => {
  const raw = '---\r\ntitle: X\r\nread: false\r\n---\r\nbody\r\nmore\r\n'
  const out = setFrontmatterKey(raw, 'read', true)
  assert.equal(out, '---\r\ntitle: X\r\nread: true\r\n---\r\nbody\r\nmore\r\n')
})

test('round-trip read: false; odd spacing "read :" matched', () => {
  const raw = '---\nread : true\n---\nb\n'
  const out = setFrontmatterKey(raw, 'read', false)
  assert.equal(out, '---\nread: false\n---\nb\n')
})

test('BOM-prefixed note: edits the existing block, keeps BOM, no second block', () => {
  const raw = '\ufeff---\ntitle: T\nurl: https://x.com\n---\nbody\n'
  const out = setFrontmatterKey(raw, 'read', true)
  assert.equal(out, '\ufeff---\ntitle: T\nurl: https://x.com\nread: true\n---\nbody\n')
})

test('BOM-prefixed note without frontmatter: BOM stays ahead of the new block', () => {
  const out = setFrontmatterKey('\ufeffjust body\n', 'read', true)
  assert.equal(out, '\ufeff---\nread: true\n---\njust body\n')
})

test('throws on newline values and non-scalars', () => {
  assert.throws(() => setFrontmatterKey('x', 'k', 'a\nb'))
  assert.throws(() => setFrontmatterKey('x', 'k', { evil: 1 }))
})
