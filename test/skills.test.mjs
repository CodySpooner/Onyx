import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SKILLS, LEVEL_TITLES, xpForLevel, levelFromXp,
  streaksFromDays, buildSkillStats, evaluateSkills
} from '../src/renderer/lib/skills.mjs'

const DAY = 86400000
const NOW = Date.parse('2026-07-07T12:00:00')

const BASE_STATS = {
  notes: 0, links: 0, orphans: 0, avgLinks: 0, connectedPct: 0, clusterCount: 0,
  bridges: 0, maturityScore: 0, totalWords: 0, taggedPct: 0, weeksActive: 0,
  activeDays: 0, currentStreak: 0, bestStreak: 0, distinctViews: 0, minViewVisits: 0,
  aiEnabled: false, counters: {}
}

test('34 skills across 7 branches; unique ids', () => {
  assert.equal(SKILLS.length, 34)
  assert.equal(new Set(SKILLS.map((s) => s.id)).size, 34)
  assert.equal(new Set(SKILLS.map((s) => s.branch)).size, 7)
})

test('empty stats → 0 unlocked, level 1, all progress finite in [0,1]', () => {
  const r = evaluateSkills(BASE_STATS)
  assert.equal(r.unlockedCount, 0)
  assert.equal(r.level, 1)
  assert.equal(r.title, 'SPARK')
  for (const s of r.skills) {
    assert.ok(Number.isFinite(s.progress) && s.progress >= 0 && s.progress <= 1, s.id)
  }
})

test('architect-3 progress 212/250, unlocks at 250 with prereqs met', () => {
  const at212 = evaluateSkills({ ...BASE_STATS, links: 212 })
  const a3 = at212.skills.find((s) => s.id === 'architect-3')
  assert.ok(Math.abs(a3.progress - 0.848) < 0.001)
  assert.equal(a3.unlocked, false)
  const at250 = evaluateSkills({ ...BASE_STATS, links: 250 })
  assert.equal(at250.skills.find((s) => s.id === 'architect-3').unlocked, true)
})

test('tier gating: predicate met but previous tier locked → locked, progress still 1', () => {
  // memory-2 needs 50 notes; give 50 notes but... memory-1 needs 10, so use a
  // branch where a later predicate passes while an earlier fails: ritualist —
  // weeksActive 4 (tier3 met) with bestStreak 0 (tier2 unmet)
  const r = evaluateSkills({ ...BASE_STATS, activeDays: 3, weeksActive: 10 })
  const t1 = r.skills.find((s) => s.id === 'ritualist-1')
  const t2 = r.skills.find((s) => s.id === 'ritualist-2')
  const t3 = r.skills.find((s) => s.id === 'ritualist-3')
  assert.equal(t1.unlocked, true)
  assert.equal(t2.unlocked, false)
  assert.equal(t3.unlocked, false)
  assert.equal(t3.state, 'locked')
  assert.equal(t3.progress, 1)
})

test('AND-skills use min-of-parts progress', () => {
  const r = evaluateSkills({ ...BASE_STATS, notes: 400, totalWords: 50000 })
  const tr = r.skills.find((s) => s.id === 'memory-5')
  assert.equal(tr.progress, 0.5) // words half done, notes full
  assert.equal(tr.predicateMet, false)
})

test('INTELLIGENCE dormant iff !aiEnabled', () => {
  const off = evaluateSkills({ ...BASE_STATS, counters: { aiEnrich: 5 } })
  assert.ok(off.skills.filter((s) => s.branch === 'INTELLIGENCE').every((s) => s.state === 'dormant'))
  const on = evaluateSkills({ ...BASE_STATS, aiEnabled: true, counters: { aiEnrich: 5 } })
  assert.equal(on.skills.find((s) => s.id === 'intelligence-1').unlocked, true)
})

test('streaksFromDays: 3 consecutive → current 3 = best; gap splits best', () => {
  const d = (n) => {
    const t = new Date(NOW)
    t.setDate(t.getDate() - n)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }
  const s = streaksFromDays({ [d(0)]: 1, [d(1)]: 2, [d(2)]: 1 }, NOW)
  assert.equal(s.current, 3)
  assert.equal(s.best, 3)
  assert.equal(s.activeToday, true)
  const gap = streaksFromDays({ [d(0)]: 1, [d(2)]: 1, [d(3)]: 1, [d(4)]: 1 }, NOW)
  assert.equal(gap.current, 1)
  assert.equal(gap.best, 3)
})

test('streak alive-but-at-risk: yesterday active, today not', () => {
  const d = (n) => {
    const t = new Date(NOW)
    t.setDate(t.getDate() - n)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }
  const s = streaksFromDays({ [d(1)]: 1, [d(2)]: 1 }, NOW)
  assert.equal(s.current, 2)
  assert.equal(s.activeToday, false)
})

test('XP is monotonic in notes; level curve round-trips', () => {
  const lo = evaluateSkills({ ...BASE_STATS, notes: 10 })
  const hi = evaluateSkills({ ...BASE_STATS, notes: 11 })
  assert.ok(hi.xp > lo.xp)
  for (let n = 1; n <= 20; n++) assert.equal(levelFromXp(xpForLevel(n)), n)
  assert.equal(LEVEL_TITLES.length, 13)
})

test('buildSkillStats on two triangles + bridge + orphan fixture', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'x', 'o']
  const links = [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' },
    { source: 'd', target: 'e' }, { source: 'e', target: 'f' }, { source: 'f', target: 'd' },
    { source: 'x', target: 'a' }, { source: 'x', target: 'd' }
  ]
  const notes = ids.map((id) => ({
    id, title: id, tags: id === 'a' ? ['t'] : [], wordCount: 100,
    mtime: NOW - 1 * DAY,
    outLinks: links.filter((l) => l.source === id).map((l) => l.target),
    inLinks: links.filter((l) => l.target === id).map((l) => l.source)
  }))
  const graph = { notes, links, folders: [], meta: { linkCount: links.length } }
  const usage = { counters: { 'view.brain': 5, 'view.solar': 2, search: 3 }, days: {} }
  const st = buildSkillStats(graph, usage, NOW)
  assert.equal(st.notes, 8)
  assert.equal(st.links, 8)
  assert.equal(st.orphans, 1)
  assert.equal(st.clusterCount, 2)
  assert.ok(st.bridges >= 1, 'x bridges the triangles')
  assert.equal(st.totalWords, 800)
  assert.equal(st.distinctViews, 2)
  assert.equal(st.minViewVisits, 0)
  assert.equal(st.taggedPct, 13) // 1/8 → 12.5 → 13
})
