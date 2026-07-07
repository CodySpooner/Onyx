import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractLinkContext } from '../src/renderer/lib/backlinks.mjs'

const T = new Set(['foo'])

test('finds the line containing [[Foo]], including alias and heading forms', () => {
  const raw = 'intro\nsee [[Foo]] here\nand [[Foo|the foo]] too\nplus [[Foo#Section]] deep'
  const snips = extractLinkContext(raw, T)
  assert.equal(snips.length, 2) // capped at 2
  assert.match(snips[0].text, /see \[\[Foo\]\] here/)
})

test('case-insensitive target match; matches by title too', () => {
  const snips = extractLinkContext('links [[fOo]] casually', T)
  assert.equal(snips.length, 1)
  const byTitle = extractLinkContext('mentions [[My Note]] here', new Set(['my note']))
  assert.equal(byTitle.length, 1)
})

test('does NOT match [[Foobar]] (exact target, not substring)', () => {
  assert.equal(extractLinkContext('nope [[Foobar]] nope', T).length, 0)
})

test('skips frontmatter and fenced code', () => {
  const raw = '---\nrelated: "[[Foo]]"\n---\n```\n[[Foo]] in code\n```\nreal [[Foo]] line'
  const snips = extractLinkContext(raw, T)
  assert.equal(snips.length, 1)
  assert.match(snips[0].text, /^real/)
})

test('long lines are trimmed around the link with ellipses', () => {
  const raw = 'x'.repeat(200) + ' [[Foo]] ' + 'y'.repeat(200)
  const snips = extractLinkContext(raw, T)
  assert.equal(snips.length, 1)
  assert.ok(snips[0].text.length <= 145)
})
