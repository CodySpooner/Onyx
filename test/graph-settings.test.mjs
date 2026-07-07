import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCHEMA, PRESETS, DEFAULTS, val, validateSettings, effective, needsRebuild, resetSection, paletteFor, folderColorIndex } from '../src/renderer/lib/graph-settings.mjs'

test('schema integrity: unique keys, defs in range, renderable types, liveIn well-formed', () => {
  const keys = new Set()
  for (const r of SCHEMA) {
    assert.ok(!keys.has(r.key), 'dup ' + r.key)
    keys.add(r.key)
    assert.ok(['range', 'bool', 'enum'].includes(r.type))
    if (r.type === 'range') assert.ok(r.def >= r.min && r.def <= r.max, r.key)
    if (r.type === 'enum') assert.ok(r.options.includes(r.def), r.key)
    assert.ok(r.liveIn === '*' || Array.isArray(r.liveIn))
  }
})

test('presets: 5 themes, 12 valid hex clusters each, nebula pairs', () => {
  assert.equal(Object.keys(PRESETS).length, 5)
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.equal(p.clusters.length, 12, id)
    for (const c of [...p.clusters, ...p.nebula, p.link, p.pulse, p.orphan]) {
      assert.match(c, /^#[0-9a-f]{6}$/i, id + ' ' + c)
    }
  }
})

test('validateSettings: clamps, enum whitelist, garbage → defaults', () => {
  const v = validateSettings({ 'look.bloom': 99, 'theme.preset': 'evil', 'motion.spin': 0, 'physics.repulsion': 'NaN' })
  assert.equal(v['look.bloom'], 1.5)
  assert.equal(v['theme.preset'], 'onyx')
  assert.equal(v['motion.spin'], false)
  assert.equal(v['physics.repulsion'], DEFAULTS['physics.repulsion'])
  assert.deepEqual(validateSettings(null), DEFAULTS)
})

test('effective: reduced motion masters speed/spin/spawn/grain/pulses', () => {
  const e = effective({ 'motion.reduced': true, 'motion.speed': 2 })
  assert.equal(e['motion.speed'], 0)
  assert.equal(e['motion.spin'], false)
  assert.equal(e['look.grain'], 0)
})

test('needsRebuild: live-* never rebuilds; lens-live skips; rebuildIn routes to consumers only', () => {
  const a = { ...DEFAULTS }
  assert.equal(needsRebuild(a, { ...a, 'look.bloom': 1 }, 'stacks'), false) // '*'
  assert.equal(needsRebuild(a, { ...a, 'look.nodeSize': 2 }, 'brain'), false) // live in brain
  assert.equal(needsRebuild(a, { ...a, 'look.nodeSize': 2 }, 'nexus'), false) // no other lens consumes it
  assert.equal(needsRebuild(a, { ...a, 'theme.preset': 'ember' }, 'brain'), true) // preset consumer
  assert.equal(needsRebuild(a, { ...a, 'theme.preset': 'ember' }, 'atlas'), true) // preset consumer
  assert.equal(needsRebuild(a, { ...a, 'theme.preset': 'ember' }, 'stacks'), false) // non-consumer skips the rebuild
  assert.equal(needsRebuild(a, { ...a, 'look.gemShape': 'octa' }, 'eco'), false) // brain-only build key
  assert.equal(needsRebuild(a, { ...a, 'physics.repulsion': 2000 }, 'brain'), false) // physics now live
  assert.equal(needsRebuild(null, a, 'brain'), false) // first load never bumps
})

test('resetSection + paletteFor + folderColorIndex determinism', () => {
  const s = validateSettings({ 'look.bloom': 1.2, 'motion.speed': 2 })
  const r = resetSection(s, 'look')
  assert.equal(r['look.bloom'], DEFAULTS['look.bloom'])
  assert.equal(r['motion.speed'], 2) // other sections untouched
  assert.equal(paletteFor({ 'theme.preset': 'ice' }).name, 'Ice')
  assert.equal(folderColorIndex('06 - Daily Logs'), folderColorIndex('06 - Daily Logs'))
  assert.ok(folderColorIndex('(root)') >= 0 && folderColorIndex('(root)') < 12)
})
