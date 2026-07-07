// App-side persistence: usage counters (skill tree fuel) + daily snapshots
// (dashboard trends). JSON under Electron userData; debounced atomic writes.
import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { upsertDay } from '../renderer/lib/dashboard.mjs'

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9.]{0,39}$/ // trust boundary for counter names
const ACTIVE_ACTIONS = new Set(['noteCreate', 'noteEdit', 'noteRename', 'vaultEdit'])

const file = (n) => path.join(app.getPath('userData'), n)

function load(name, fallback) {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(file(name), 'utf8')) }
  } catch {
    return fallback
  }
}

function atomicWrite(name, data) {
  const p = file(name)
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, p)
}

const dayKey = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let usage = null
let snaps = null
let usageDirty = false
let snapsDirty = false
let flushTimer = null

export function loadUsage() {
  if (!usage) usage = load('onyx-usage.json', { v: 1, firstSeen: Date.now(), counters: {}, days: {}, unlockedAt: {} })
  return usage
}

export function bumpUsage(name, n = 1) {
  const u = loadUsage()
  if (!NAME_RE.test(String(name))) return u
  const inc = Math.max(1, Math.min(100, Math.round(Number(n) || 1)))
  u.counters[name] = (u.counters[name] || 0) + inc
  if (ACTIVE_ACTIONS.has(name)) {
    const k = dayKey(Date.now())
    u.days[k] = (u.days[k] || 0) + 1
  }
  usageDirty = true
  scheduleFlush()
  return u
}

export function markUnlocked(ids) {
  const u = loadUsage()
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id === 'string' && !u.unlockedAt[id]) u.unlockedAt[id] = Date.now()
  }
  usageDirty = true
  scheduleFlush()
  return u
}

export function loadSnapshots() {
  if (!snaps) snaps = load('onyx-snapshots.json', { v: 1, days: [] })
  return snaps
}

export function recordSnapshot(rec) {
  const s = loadSnapshots()
  s.days = upsertDay(s.days, rec)
  snapsDirty = true
  scheduleFlush()
  return s
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flush, 500)
}

export function flush() {
  clearTimeout(flushTimer)
  flushTimer = null
  try {
    if (usageDirty && usage) {
      atomicWrite('onyx-usage.json', usage)
      usageDirty = false
    }
    if (snapsDirty && snaps) {
      atomicWrite('onyx-snapshots.json', snaps)
      snapsDirty = false
    }
  } catch (e) {
    console.error('appdata flush failed:', e)
  }
}
