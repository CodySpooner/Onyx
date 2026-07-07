import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCards, cardHash, grade, dueCards, prune, newState } from '../src/renderer/lib/srs.mjs'

const DAY = 86400000
const NOW = 1_000_000_000

test('parse: gated by note tag; line-level #flashcard works in untagged notes', () => {
  const tagged = parseCards('n.md', 'What is X::The answer', ['flashcard'])
  assert.equal(tagged.length, 1)
  assert.equal(tagged[0].question, 'What is X')
  const untagged = parseCards('n.md', 'What is X::The answer', [])
  assert.equal(untagged.length, 0)
  const lineLevel = parseCards('n.md', 'What is X::The answer #flashcard', [])
  assert.equal(lineLevel.length, 1)
  assert.equal(lineLevel[0].answer, 'The answer')
})

test('parse: ::: rejected, fences skipped, list prefix stripped, both sides required', () => {
  const raw = ['- Q1::A1', 'CSS::: not a card', '```', 'Fake::Card', '```', 'NoAnswer::', '::NoQuestion'].join('\n')
  const cards = parseCards('n.md', raw, ['flashcard'])
  assert.equal(cards.length, 1)
  assert.equal(cards[0].question, 'Q1')
})

test('hash: stable across answer edits and reordering; changes with question', () => {
  const h1 = cardHash('n.md', 'What  is   X?')
  const h2 = cardHash('n.md', 'what is x')
  assert.equal(h1, h2) // whitespace/case/punctuation-insensitive
  assert.notEqual(cardHash('n.md', 'What is Y'), h1)
  assert.notEqual(cardHash('other.md', 'What is X'), h1)
})

test('grade table: again floors ease and lapses; good ladder 1→3→round(i×e); easy caps ease', () => {
  let s = grade(newState(), 2, NOW) // first good
  assert.equal(s.interval, 1)
  s = grade(s, 2, NOW) // second good
  assert.equal(s.interval, 3)
  s = grade(s, 2, NOW) // third: round(3 × 2.5) = 8
  assert.equal(s.interval, 8)
  const lapsed = grade(s, 1, NOW)
  assert.equal(lapsed.reps, 0)
  assert.equal(lapsed.lapses, 1)
  assert.equal(lapsed.ease, 2.3)
  assert.equal(lapsed.due, NOW + 10 * 60000)
  let floor = { ...newState(), ease: 1.35 }
  assert.equal(grade(floor, 1, NOW).ease, 1.3)
  let cap = { ...newState(), ease: 2.95 }
  assert.equal(grade(cap, 3, NOW).ease, 3.0)
  const easyFirst = grade(newState(), 3, NOW)
  assert.equal(easyFirst.interval, 3)
})

test('dueCards: new first, then oldest-due; future-due excluded', () => {
  const cards = [{ hash: 'a' }, { hash: 'b' }, { hash: 'c' }, { hash: 'd' }]
  const states = {
    b: { ...newState(), due: NOW - 2 * DAY },
    c: { ...newState(), due: NOW - 5 * DAY },
    d: { ...newState(), due: NOW + DAY }
  }
  assert.deepEqual(dueCards(cards, states, NOW).map((c) => c.hash), ['a', 'c', 'b'])
})

test('prune drops only >60d-unseen states', () => {
  const states = {
    fresh: { ...newState(), lastSeen: NOW - DAY },
    stale: { ...newState(), lastSeen: NOW - 61 * DAY }
  }
  const out = prune(states, NOW)
  assert.ok(out.fresh)
  assert.ok(!out.stale)
})
