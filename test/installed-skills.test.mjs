import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cmpVersion, blurb, groupSkills, displayName, arsenalLayout, ARC_RADII } from '../src/renderer/lib/installed-skills.mjs'

test('cmpVersion: numeric segments beat lexical; 6.1.1 > 6.0.3; 10.0 > 9.9', () => {
  assert.ok(cmpVersion('6.1.1', '6.0.3') > 0)
  assert.ok(cmpVersion('10.0', '9.9') > 0)
  assert.ok(cmpVersion('1.2', '1.2.1') < 0)
  assert.equal(cmpVersion('2.0.0', '2.0.0'), 0)
  assert.ok(cmpVersion('beta', 'alpha') > 0) // non-semver falls back to locale
})

test('blurb: first para, boilerplate stripped, 160 cap', () => {
  assert.equal(blurb('Short one.\n\nSecond para ignored.'), 'Short one.')
  assert.equal(blurb('Does things. Use when: whenever.'), 'Does things.')
  const long = 'x'.repeat(200)
  assert.equal(blurb(long).length, 160)
  assert.ok(blurb(long).endsWith('…'))
  assert.equal(blurb(null), '')
})

const mk = (name, source = 'user', plugin = null) => ({ id: source + ':' + name, name, source, plugin })

test('groupSkills: prefix rule collapses hordes, plugins group by plugin, singletons fold to TOOLKIT', () => {
  const skills = [
    ...Array.from({ length: 5 }, (_, i) => mk('firecrawl-tool' + i)),
    mk('betting'), mk('kalshi'), mk('graphify'),
    mk('brainstorming', 'plugin', 'superpowers'),
    mk('writing-plans', 'plugin', 'superpowers'),
    mk('wiki', 'plugin', 'claude-obsidian'),
    mk('canvas', 'plugin', 'claude-obsidian'),
    mk('solo-skill', 'plugin', 'lonely-plugin') // 1 member → TOOLKIT
  ]
  const g = groupSkills(skills)
  assert.ok(g.filter((s) => s.group === 'FIRECRAWL').length === 5)
  assert.equal(g.find((s) => s.name === 'brainstorming').group, 'SUPERPOWERS')
  assert.equal(g.find((s) => s.name === 'wiki').group, 'OBSIDIAN')
  assert.equal(g.find((s) => s.name === 'solo-skill').group, 'TOOLKIT')
  assert.equal(g.find((s) => s.name === 'betting').group, 'TOOLKIT')
})

test('displayName: strips group prefix inside prefix-groups only', () => {
  assert.equal(displayName({ name: 'firecrawl-deep-research', group: 'FIRECRAWL' }), 'deep-research')
  assert.equal(displayName({ name: 'betting', group: 'TOOLKIT' }), 'betting')
})

test('arsenalLayout: radii on known arcs, balanced fill, sectors sum to 360', () => {
  const groups = new Map([
    ['BIG', Array.from({ length: 20 }, (_, i) => mk('big-' + i))],
    ['SMALL', Array.from({ length: 4 }, (_, i) => mk('small-' + i))]
  ])
  const { placed, sectors } = arsenalLayout(groups)
  assert.equal(placed.length, 24)
  for (const p of placed) {
    const r = Math.hypot(p.x, p.y)
    assert.ok(ARC_RADII.some((a) => Math.abs(a - r) < 0.001), `radius ${r} off-arc`)
  }
  // 20 → 3 arcs balanced 7/7/6, never a stuffed inner ring
  const bigByArc = [0, 1, 2].map((a) => placed.filter((p) => p.skill.name.startsWith('big') && p.arc === a).length)
  assert.deepEqual(bigByArc, [7, 7, 6])
  const span = sectors.reduce((a, s) => a + s.span, 0)
  assert.ok(Math.abs(span - 360) < 0.001)
  // BIG's sqrt-weighted sector is wider but not 5x wider
  assert.ok(sectors[0].span / sectors[1].span < 3)
})
