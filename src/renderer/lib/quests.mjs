// Daily/weekly quests over REAL usage counters. Anti-cheese by construction:
// 1) per-quest base captured at generation/reroll — only deltas count
// 2) counters increment only in the main process (usage:bump)
// 3) deterministic day-seeded selection — restarting never rerolls
// 4) one manual reroll per local day, un-done quests only, fresh base
// 5) done/doneAt/bonusXp are one-way latches; re-ticking is idempotent
// 6) the activeDays weekly reads usage.days, fed only by real vault actions
import { fnv1a32 } from './hash.mjs'
import { dayKey } from './stats.mjs'

export const DAILY_POOL = [
  { id: 'capture-2', label: 'Capture 2 thoughts', metrics: ['noteCreate', 'captureSave'], target: 2, xp: 25 },
  { id: 'tasks-3', label: 'Complete 3 tasks', metrics: ['taskComplete'], target: 3, xp: 25 },
  { id: 'daily-note', label: 'Open today’s daily note', metrics: ['dailyOpen'], target: 1, xp: 25 },
  { id: 'search-5', label: 'Search the vault 5 times', metrics: ['search'], target: 5, xp: 25 },
  { id: 'review-5', label: 'Review 5 flashcards', metrics: ['reviewsDone'], target: 5, xp: 25 },
  { id: 'orphan-1', label: 'Rescue an orphan note', metrics: ['orphanLinked'], target: 1, xp: 25 },
  { id: 'links-2', label: 'Accept 2 link suggestions', metrics: ['linkAccept'], target: 2, xp: 25 },
  { id: 'pomodoro-1', label: 'Finish a pomodoro', metrics: ['pomodorosCompleted'], target: 1, xp: 25 },
  { id: 'edit-3', label: 'Edit 3 notes', metrics: ['noteEdit'], target: 3, xp: 25 }
]

export const WEEKLY_POOL = [
  { id: 'notes-5', label: 'Create 5 notes', metrics: ['noteCreate'], target: 5, xp: 100 },
  { id: 'tasks-15', label: 'Complete 15 tasks', metrics: ['taskComplete'], target: 15, xp: 100 },
  { id: 'review-20', label: 'Review 20 flashcards', metrics: ['reviewsDone'], target: 20, xp: 100 },
  { id: 'orphans-3', label: 'Rescue 3 orphans', metrics: ['orphanLinked'], target: 3, xp: 100 },
  { id: 'pomodoro-3', label: 'Finish 3 pomodoros', metrics: ['pomodorosCompleted'], target: 3, xp: 100 },
  { id: 'active-5', label: 'Be active 5 days this week', kind: 'activeDays', target: 5, xp: 100 }
]

export function weekStartKey(now) {
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday, noon-anchored
  return dayKey(d.getTime())
}

export function pickQuests(pool, n, seedStr) {
  return [...pool].sort((a, b) => fnv1a32(seedStr + a.id) - fnv1a32(seedStr + b.id)).slice(0, n)
}

const counterSum = (usage, metrics) => (metrics || []).reduce((s, m) => s + (usage?.counters?.[m] || 0), 0)
const activeDaysSince = (usage, weekStart) =>
  Object.entries(usage?.days || {}).filter(([k, v]) => k >= weekStart && v > 0).length

function instantiate(q, usage, weekStart) {
  const base = q.kind === 'activeDays' ? activeDaysSince(usage, weekStart) : counterSum(usage, q.metrics)
  return { ...q, base, done: false, doneAt: null }
}

export function makeState(usage, now) {
  const day = dayKey(now)
  const weekStart = weekStartKey(now)
  return {
    v: 1,
    day,
    weekStart,
    daily: pickQuests(DAILY_POOL, 3, day).map((q) => instantiate(q, usage, weekStart)),
    weekly: pickQuests(WEEKLY_POOL, 2, weekStart).map((q) => instantiate(q, usage, weekStart)),
    rerolledOn: null,
    bonusXp: 0
  }
}

export function rollover(state, usage, now) {
  if (!state || typeof state !== 'object' || state.v !== 1) return { state: makeState(usage, now), changed: true }
  let s = state
  let changed = false
  const day = dayKey(now)
  const weekStart = weekStartKey(now)
  if (s.weekStart !== weekStart) {
    s = { ...s, weekStart, weekly: pickQuests(WEEKLY_POOL, 2, weekStart).map((q) => instantiate(q, usage, weekStart)) }
    changed = true
  }
  if (s.day !== day) {
    s = { ...s, day, daily: pickQuests(DAILY_POOL, 3, day).map((q) => instantiate(q, usage, s.weekStart)), rerolledOn: null }
    changed = true
  }
  return { state: s, changed }
}

export function questValue(q, usage, weekStart) {
  const now = q.kind === 'activeDays' ? activeDaysSince(usage, weekStart) : counterSum(usage, q.metrics)
  return Math.max(0, now - (q.base || 0))
}

export function tickQuests(state, usage, now) {
  const r = rollover(state, usage, now)
  let s = r.state
  let changed = r.changed
  const completed = []
  const tick = (list) =>
    list.map((q) => {
      if (q.done || questValue(q, usage, s.weekStart) < q.target) return q
      changed = true
      completed.push(q)
      return { ...q, done: true, doneAt: now }
    })
  const daily = tick(s.daily)
  const weekly = tick(s.weekly)
  if (completed.length) {
    s = { ...s, daily, weekly, bonusXp: (s.bonusXp || 0) + completed.reduce((a, q) => a + q.xp, 0) }
  } else if (changed) {
    s = { ...s, daily, weekly }
  }
  return { state: s, completed, changed }
}

export function reroll(state, usage, questId, now) {
  if (!state || state.rerolledOn === state.day) return { state, changed: false }
  const at = state.daily.findIndex((q) => q.id === questId && !q.done)
  if (at === -1) return { state, changed: false }
  const inUse = new Set(state.daily.map((q) => q.id))
  const next = pickQuests(DAILY_POOL, DAILY_POOL.length, state.day + ':reroll').find((q) => !inUse.has(q.id))
  if (!next) return { state, changed: false }
  const daily = [...state.daily]
  daily[at] = instantiate(next, usage, state.weekStart) // fresh base — pre-earned progress never counts
  return { state: { ...state, daily, rerolledOn: state.day }, changed: true }
}
