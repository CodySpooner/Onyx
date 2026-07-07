// CORTEX skill engine — every unlock is a real predicate over vault + usage
// data. XP recomputes from stats each call: replayable, drift-proof.
import { detectClusters } from './clusters.mjs'
import { vaultStats, velocity, maturity, bridgeStats, dayKey } from './stats.mjs'

export const BRANCH_COLORS = {
  MEMORY: '#6ea8ff',
  ARCHITECT: '#c77dff',
  CARTOGRAPHER: '#4cc9f0',
  RITUALIST: '#ffd166',
  CURATOR: '#7bffb0',
  EXPLORER: '#ff9f1c',
  INTELLIGENCE: '#f72585'
}

const S = (branch, tier, name, flavor, parts) => ({
  id: `${branch.toLowerCase()}-${tier}`,
  branch,
  tier,
  name,
  flavor,
  parts
})
const P = (label, metric, gte) => ({ label, metric, gte })

export const SKILLS = [
  // MEMORY · volume
  S('MEMORY', 1, 'First Light', 'Every brain begins as a single spark.', [P('notes', 'notes', 10)]),
  S('MEMORY', 2, 'Engram', 'Memories that outlive the moment.', [P('notes', 'notes', 50)]),
  S('MEMORY', 3, 'Lexicon', "Twenty-five thousand words is no longer a notebook. It's a mind.", [P('words', 'totalWords', 25000)]),
  S('MEMORY', 4, 'Long-Term Potentiation', 'Repetition carves the channel deeper.', [P('notes', 'notes', 150)]),
  S('MEMORY', 5, 'Total Recall', 'Nothing captured is ever lost.', [P('notes', 'notes', 400), P('words', 'totalWords', 100000)]),
  // ARCHITECT · links
  S('ARCHITECT', 1, 'Synapse', 'The first connection is the hardest.', [P('links', 'links', 25)]),
  S('ARCHITECT', 2, 'Synaptogenesis', 'Neurons that fire together wire together.', [P('links', 'links', 100)]),
  S('ARCHITECT', 3, 'Synaptogenesis II', 'Growth is measured in connections, not neurons.', [P('links', 'links', 250)]),
  S('ARCHITECT', 4, 'Dense Wiring', 'Density is comprehension.', [P('avg links', 'avgLinks', 6)]),
  S('ARCHITECT', 5, 'Small World', 'Any thought, six hops from any other.', [P('links', 'links', 500), P('connected %', 'connectedPct', 90)]),
  // CARTOGRAPHER · clusters/bridges
  S('CARTOGRAPHER', 1, 'Terra Cognita', 'The first regions appear on the map.', [P('clusters', 'clusterCount', 3)]),
  S('CARTOGRAPHER', 2, 'Archipelago', 'Islands of thought, each with its own weather.', [P('clusters', 'clusterCount', 8)]),
  S('CARTOGRAPHER', 3, 'Bridge Builder', 'An idea living in two worlds is worth two ideas.', [P('bridges', 'bridges', 10)]),
  S('CARTOGRAPHER', 4, 'Trade Routes', 'Knowledge flows where bridges stand.', [P('bridges', 'bridges', 25)]),
  S('CARTOGRAPHER', 5, 'Pangea', 'Many territories. One continent.', [P('clusters', 'clusterCount', 12), P('bridges', 'bridges', 50)]),
  // RITUALIST · consistency (usage.days only — honest day-one start)
  S('RITUALIST', 1, 'Kindling', "Show up. That's the entire trick.", [P('active days', 'activeDays', 3)]),
  S('RITUALIST', 2, 'Ember', 'Three days makes a habit possible.', [P('best streak', 'bestStreak', 3)]),
  S('RITUALIST', 3, 'Weekly Rite', 'The week is the atom of practice.', [P('active weeks', 'weeksActive', 4)]),
  S('RITUALIST', 4, 'Circadian', "Seven days straight. Now it's biology.", [P('best streak', 'bestStreak', 7)]),
  S('RITUALIST', 5, 'Monastic', 'The practice practices you.', [P('best streak', 'bestStreak', 21), P('active days', 'activeDays', 60)]),
  // CURATOR · hygiene
  S('CURATOR', 1, 'Groundskeeper', 'No thought left stranded.', [P('connected %', 'connectedPct', 85), P('notes', 'notes', 20)]),
  S('CURATOR', 2, 'Taxonomist', 'A name is a handle you can pull later.', [P('tagged %', 'taggedPct', 50)]),
  S('CURATOR', 3, 'Necromancer', 'Wake the sleeping notes.', [P('cold revisits', 'counters.coldRevisit', 10)]),
  S('CURATOR', 4, 'Zero Orphans', 'Every neuron wired in.', [P('connected %', 'connectedPct', 100), P('notes', 'notes', 30)]),
  S('CURATOR', 5, 'Immaculate', "The gauge doesn't lie.", [P('maturity', 'maturityScore', 85)]),
  // EXPLORER · feature usage
  S('EXPLORER', 1, 'Wayfinder', 'Same mind, four angles.', [P('views used', 'distinctViews', 3)]),
  S('EXPLORER', 2, 'Deep Search', 'Ask the vault, not your memory.', [P('searches', 'counters.search', 25)]),
  S('EXPLORER', 3, 'Neuronaut', 'Get close to the tissue.', [P('pins', 'counters.hoverPin', 15)]),
  S('EXPLORER', 4, 'Shaper', 'The vault is written from the inside now.', [P('created', 'counters.noteCreate', 10), P('edited', 'counters.noteEdit', 25)]),
  S('EXPLORER', 5, 'Omnivore', 'Every instrument, mastered.', [P('min view visits', 'minViewVisits', 3), P('searches', 'counters.search', 50)]),
  // INTELLIGENCE · locked until the Knowledge Engine (API key)
  S('INTELLIGENCE', 1, 'Awakening', 'The engine opens its eyes.', [P('enrichments', 'counters.aiEnrich', 1)]),
  S('INTELLIGENCE', 2, 'Ghost Synapses', "Accept the links you didn't see.", [P('ghosts accepted', 'counters.ghostAccept', 5)]),
  S('INTELLIGENCE', 3, 'Oracle', 'Question the brain; it answers.', [P('chats', 'counters.aiChat', 25)]),
  S('INTELLIGENCE', 4, 'Symbiosis', 'Two minds, one vault.', [P('enrichments', 'counters.aiEnrich', 100)])
]

export const LEVEL_TITLES = [
  'SPARK', 'NOTETAKER', 'SCRIBE', 'CHRONICLER', 'ARCHIVIST', 'SYNTHESIST',
  'NAVIGATOR', 'ENGINEER', 'SAGE', 'POLYMATH', 'LUMINARY', 'ORACLE', 'SECOND BRAIN'
]

export const xpForLevel = (n) => 100 * (n - 1) ** 2
export const levelFromXp = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1

// GitHub-style streaks over usage.days; noon anchors make date math DST-safe
export function streaksFromDays(days = {}, now = Date.now()) {
  const active = (d) => (days[dayKey(d.getTime())] || 0) > 0
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const activeToday = active(today)
  const cursor = new Date(today)
  if (!activeToday) cursor.setDate(cursor.getDate() - 1)
  let current = 0
  while (active(cursor)) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }
  const keys = Object.keys(days).filter((k) => days[k] > 0).sort()
  let best = 0
  let run = 0
  let prev = null
  for (const k of keys) {
    if (prev) {
      const d = new Date(prev + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      run = dayKey(d.getTime()) === k ? run + 1 : 1
    } else {
      run = 1
    }
    if (run > best) best = run
    prev = k
  }
  return { current, best: Math.max(best, current), activeToday, activeDays: keys.length }
}

const CANON_VIEWS = ['view.brain', 'view.solar', 'view.core', 'view.globe', 'view.constellation']

export function buildSkillStats(graph, usage, now, aiEnabled = false) {
  const notes = graph.notes
  const vs = vaultStats(graph)
  const { clusterOf, clusterCount } = detectClusters(notes.map((n) => n.id), graph.links)
  const counters = usage?.counters || {}
  const st = streaksFromDays(usage?.days || {}, now)
  const visits = CANON_VIEWS.map((v) => counters[v] || 0)
  return {
    notes: notes.length,
    links: graph.meta.linkCount,
    orphans: vs.orphans,
    avgLinks: vs.avgLinks,
    connectedPct: vs.connectedPct,
    clusterCount,
    bridges: bridgeStats(graph.links, clusterOf).count,
    maturityScore: maturity(notes, now).score,
    totalWords: notes.reduce((s, n) => s + (n.wordCount || 0), 0),
    taggedPct: notes.length ? Math.round((100 * notes.filter((n) => (n.tags || []).length).length) / notes.length) : 0,
    weeksActive: velocity(notes, now).weeks.filter((w) => w > 0).length,
    activeDays: st.activeDays,
    currentStreak: st.current,
    bestStreak: st.best,
    distinctViews: visits.filter((v) => v > 0).length,
    minViewVisits: Math.min(...visits),
    aiEnabled,
    counters
  }
}

export function evaluateSkills(stats) {
  const resolve = (m) => (m.startsWith('counters.') ? stats.counters?.[m.slice(9)] || 0 : stats[m] || 0)
  const skills = SKILLS.map((def) => {
    const parts = def.parts.map((p) => {
      const value = resolve(p.metric)
      return { label: p.label, value, target: p.gte, done: value >= p.gte, progress: Math.min(1, value / p.gte) }
    })
    return {
      ...def,
      color: BRANCH_COLORS[def.branch],
      parts,
      predicateMet: parts.every((p) => p.done),
      progress: Math.min(...parts.map((p) => p.progress))
    }
  })

  const byBranch = new Map()
  for (const s of skills) {
    if (!byBranch.has(s.branch)) byBranch.set(s.branch, [])
    byBranch.get(s.branch).push(s)
  }
  for (const [branch, list] of byBranch) {
    list.sort((a, b) => a.tier - b.tier)
    const dormant = branch === 'INTELLIGENCE' && !stats.aiEnabled
    let prevUnlocked = true
    for (const s of list) {
      s.unlocked = !dormant && s.predicateMet && (s.tier === 1 || prevUnlocked)
      s.state = dormant ? 'dormant' : s.unlocked ? 'unlocked' : s.tier === 1 || prevUnlocked ? 'unlockable' : 'locked'
      prevUnlocked = s.unlocked
    }
  }

  const unlockedCount = skills.filter((s) => s.unlocked).length
  const c = stats.counters || {}
  const xp =
    10 * (stats.notes || 0) +
    2 * (stats.links || 0) +
    25 * (stats.clusterCount || 0) +
    15 * Math.min(stats.bridges || 0, 50) +
    Math.floor((stats.totalWords || 0) / 100) +
    5 * (stats.activeDays || 0) +
    20 * (stats.bestStreak || 0) +
    2 * Math.min(c.search || 0, 200) +
    5 * (c.noteCreate || 0) +
    50 * unlockedCount
  const level = levelFromXp(xp)
  const span = xpForLevel(level + 1) - xpForLevel(level)
  const levelPct = span > 0 ? (xp - xpForLevel(level)) / span : 0
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]
  return { skills, unlockedCount, totalCount: skills.length, xp, level, levelPct, title }
}
