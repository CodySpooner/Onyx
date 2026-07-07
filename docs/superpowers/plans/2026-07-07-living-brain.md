# Living Brain (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Onyx's homepage into a living neural brain — force-directed graph where clusters emerge from links, synapses fire, hover shows a glass preview card — wrapped in an OMEGA-style floating-glass cockpit with locally-computed analytics.

**Architecture:** Evolve the existing Electron + Vite + React + Three.js app. Three new pure logic modules (`force.mjs` sim, `clusters.mjs` label propagation, extended `stats.mjs`) feed a new `BrainView` (fifth `SpaceView`, becomes default) and a `Cockpit` panel column. A CSS token + layout pass makes the canvas full-bleed with floating glass panels. Zero new npm dependencies.

**Tech Stack:** Existing only — Electron, electron-vite, React, Three.js, node:test.

## Global Constraints

- **No new npm dependencies** in this phase.
- Package is CJS (no `"type": "module"`), so **testable renderer modules use `.mjs`** (pattern: `graph.mjs`). This plan renames `stats.js → stats.mjs`.
- **Design tokens (exact):** bg `#09090B`, cards `#111216`, borders `rgba(255,255,255,.06)`, glass `rgba(17,18,22,.72)` + `backdrop-filter: blur(14px)`.
- **Deterministic layout:** no `Math.random()` in layout/motion — seed everything from `hashAngle(id)`. Two runs on the same vault must produce identical initial layouts.
- Force sim is **O(n²) by design** — mark with a `ponytail:` ceiling comment naming d3-force-3d as the upgrade path.
- View interface (unchanged): `constructor(container, { onSelect, onHover })`, `update(graph)`, `setActive(idSet|null)`, `setLinksMode(bool)`, `setLabels(bool)`, `dispose()`. `onHover` is new and optional — legacy views simply never call it.
- Cockpit formulas verbatim from spec: maturity = `40×connectedRatio + 30×freshRatio + 30×min(1, avgDegree/6)`; velocity trend = last-6-weeks vs prior-6-weeks; cold = untouched >60 days; clusters counted only when ≥2 members.
- Visual verification via the ONYX_SHOT harness (`bash shot.sh <name> <delay> [inject.js]` in the scratchpad; remember `env -u ELECTRON_RUN_AS_NODE` is baked into it).
- Work on branch `feat/living-brain`.

---

## File Structure

```
src/main/vault-indexer.mjs        MODIFY  + mtime (epoch ms) per note
src/renderer/lib/force.mjs        CREATE  pure force sim                 [tested]
src/renderer/lib/clusters.mjs     CREATE  label propagation              [tested]
src/renderer/lib/stats.js         RENAME→ src/renderer/lib/stats.mjs, extended [tested]
src/renderer/views/BrainView.js   CREATE  the brain (default view)
src/renderer/components/HoverCard.jsx  CREATE  glass preview card
src/renderer/components/Cockpit.jsx    CREATE  velocity/cold/bridges/maturity/actions
src/renderer/views/SpaceCanvas.jsx     MODIFY  register 'brain', thread onHover
src/renderer/views/ViewSwitcher.jsx    MODIFY  add 🧠 Brain entry
src/renderer/App.jsx                   MODIFY  full-bleed layout, default 'brain', hover state, cockpit
src/renderer/components/HudSidebar.jsx MODIFY  import path (stats.mjs)
src/renderer/index.css                 MODIFY  tokens + .glass + floating layout + card/cockpit styles
test/indexer.test.mjs                  MODIFY  + mtime test
test/force.test.mjs                    CREATE
test/clusters.test.mjs                 CREATE
test/stats.test.mjs                    CREATE
README.md                              MODIFY  brain + cockpit blurb
```

---

## Task 1: Branch + indexer `mtime`

**Files:**
- Modify: `src/main/vault-indexer.mjs` (note construction inside `scanVault`)
- Test: `test/indexer.test.mjs`

**Interfaces:**
- Produces: every note in `VaultGraph.notes` gains `mtime: number` (epoch ms; `fs.stat().mtimeMs` → fallback `Date.parse(frontmatter updated)` → fallback scan time). Consumed by Tasks 3, 7, 8.

- [ ] **Step 1: Create the branch**

```bash
cd "c:/Users/Xody2/OneDrive/Desktop/Note App"
git checkout -b feat/living-brain
```

- [ ] **Step 2: Write the failing test** — append to `test/indexer.test.mjs`:

```js
test('every note carries a numeric mtime (epoch ms)', async () => {
  const g = await scanVault(VAULT)
  for (const n of g.notes) {
    assert.equal(typeof n.mtime, 'number')
    assert.ok(n.mtime > 946684800000, `mtime looks like epoch ms: ${n.mtime}`) // > year 2000
  }
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `typeof n.mtime` is `'undefined'`.

- [ ] **Step 4: Implement** — in `src/main/vault-indexer.mjs`, inside the `for (const abs of files)` loop, after `const raw = await fs.readFile(abs, 'utf8')` add:

```js
    let mtime
    try {
      mtime = Math.round((await fs.stat(abs)).mtimeMs)
    } catch {
      mtime = null
    }
```

and in the `notes.push({ ... })` object, after the `updated:` line add:

```js
      mtime: mtime ?? (Number.isFinite(Date.parse(data.updated)) ? Date.parse(data.updated) : Date.now()),
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add src/main/vault-indexer.mjs test/indexer.test.mjs
git commit -m "feat: notes carry mtime (stat → frontmatter updated → now)"
```

---

## Task 2: `clusters.mjs` — label-propagation communities (TDD)

**Files:**
- Create: `src/renderer/lib/clusters.mjs`
- Test: `test/clusters.test.mjs`

**Interfaces:**
- Produces: `detectClusters(ids: string[], links: {source,target}[]) → { clusterOf: Map<string, number>, clusterCount: number, sizes: Map<number, number> }`. Communities with ≥2 members get dense ids `0..k-1` ordered by size desc (ties by smallest member id); **singletons get `-1`** and are excluded from `clusterCount`/`sizes`. Deterministic (sorted iteration, min-label tie-break).

- [ ] **Step 1: Write failing tests** — `test/clusters.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectClusters } from '../src/renderer/lib/clusters.mjs'

test('two disjoint triangles → 2 clusters', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const links = [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' },
    { source: 'd', target: 'e' }, { source: 'e', target: 'f' }, { source: 'f', target: 'd' }
  ]
  const r = detectClusters(ids, links)
  assert.equal(r.clusterCount, 2)
  assert.equal(r.clusterOf.get('a'), r.clusterOf.get('b'))
  assert.equal(r.clusterOf.get('a'), r.clusterOf.get('c'))
  assert.notEqual(r.clusterOf.get('a'), r.clusterOf.get('d'))
})

test('singletons are orphans (-1), not clusters', () => {
  const r = detectClusters(['a', 'b', 'c'], [{ source: 'a', target: 'b' }])
  assert.equal(r.clusterCount, 1)
  assert.equal(r.clusterOf.get('c'), -1)
})

test('bridge node joins its denser side', () => {
  const ids = ['a', 'b', 'c', 'd', 'p', 'q', 'x']
  const links = [
    { source: 'a', target: 'b' }, { source: 'a', target: 'c' }, { source: 'a', target: 'd' },
    { source: 'b', target: 'c' }, { source: 'b', target: 'd' }, { source: 'c', target: 'd' },
    { source: 'p', target: 'q' },
    { source: 'x', target: 'a' }, { source: 'x', target: 'b' }, { source: 'x', target: 'p' }
  ]
  const r = detectClusters(ids, links)
  assert.equal(r.clusterOf.get('x'), r.clusterOf.get('a'))
  assert.equal(r.clusterCount, 2)
})

test('deterministic across runs', () => {
  const ids = ['n1', 'n2', 'n3', 'n4']
  const links = [{ source: 'n1', target: 'n2' }, { source: 'n3', target: 'n4' }]
  const a = detectClusters(ids, links)
  const b = detectClusters(ids, links)
  assert.deepEqual([...a.clusterOf.entries()], [...b.clusterOf.entries()])
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../clusters.mjs'`.

- [ ] **Step 3: Implement** — `src/renderer/lib/clusters.mjs`:

```js
// Label propagation community detection. Deterministic: nodes iterate in
// sorted-id order, ties break to the smallest label. Good enough for
// hundreds-to-thousands of notes; no dependencies.
export function detectClusters(ids, links) {
  const sorted = [...ids].sort()
  const label = new Map(sorted.map((id, i) => [id, i]))
  const adj = new Map(sorted.map((id) => [id, []]))
  for (const l of links) {
    if (!adj.has(l.source) || !adj.has(l.target) || l.source === l.target) continue
    adj.get(l.source).push(l.target)
    adj.get(l.target).push(l.source)
  }

  for (let pass = 0; pass < 20; pass++) {
    let changed = false
    for (const id of sorted) {
      const nbs = adj.get(id)
      if (!nbs.length) continue
      const freq = new Map()
      for (const nb of nbs) {
        const L = label.get(nb)
        freq.set(L, (freq.get(L) || 0) + 1)
      }
      let best = label.get(id)
      let bestCount = -1
      for (const [L, c] of freq) {
        if (c > bestCount || (c === bestCount && L < best)) {
          best = L
          bestCount = c
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best)
        changed = true
      }
    }
    if (!changed) break
  }

  // group by final label
  const groups = new Map()
  for (const id of sorted) {
    const L = label.get(id)
    if (!groups.has(L)) groups.set(L, [])
    groups.get(L).push(id)
  }
  // communities ≥2, ordered by size desc then smallest member id
  const communities = [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1))

  const clusterOf = new Map(sorted.map((id) => [id, -1]))
  const sizes = new Map()
  communities.forEach((members, ci) => {
    sizes.set(ci, members.length)
    for (const id of members) clusterOf.set(id, ci)
  })
  return { clusterOf, clusterCount: communities.length, sizes }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS — all clusters tests green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/clusters.mjs test/clusters.test.mjs
git commit -m "feat: label-propagation cluster detection (deterministic, dep-free)"
```

---

## Task 3: `stats.mjs` — rename + velocity/cold/bridges/maturity/actions (TDD)

**Files:**
- Rename: `src/renderer/lib/stats.js` → `src/renderer/lib/stats.mjs` (git mv), then extend
- Modify: `src/renderer/components/HudSidebar.jsx` (import `'../lib/stats.mjs'`), `src/renderer/App.jsx` (import `'./lib/stats.mjs'`)
- Test: `test/stats.test.mjs`

**Interfaces:**
- Consumes: `note.mtime` (Task 1), `clusterOf` (Task 2).
- Produces (all pure; `now` injected):
  - `velocity(notes, now) → { weeks: number[12], trendPct: number }` — weeks oldest→newest, 7-day buckets ending at `now`; a note counts once, in the bucket of its `mtime`; `trendPct = round(100 × (last6 − prior6) / max(1, prior6))`.
  - `coldNotes(notes, now, days = 60) → [{ note, ageDays }]` oldest first.
  - `bridgeStats(links, clusterOf) → { count, top: [{ id, cross }] }` — links whose endpoints have different clusterOf values, **both ≥ 0**; `top` = note ids by cross-link count desc, max 5.
  - `maturity(notes, now) → { score, connectedRatio, freshRatio, densityScore }` — exact spec formula; `avgDegree = mean(outLinks.length + inLinks.length)`; fresh = `mtime` within 60d; score rounded 0–100.
  - `nextActions({ notes, cold, trendPct, clusterOf, clusterCount, links }) → string[]` (max 3), rules in order: orphans → `` `Link or archive ${n} orphan note${n===1?'':'s'}` ``; oldest cold → `` `Revisit "${title}" — dormant ${ageDays}d` ``; an isolated cluster (size ≥3, zero cross-links) → `` `Cluster ${ci + 1} (${size} notes) has no bridges — connect it` ``; velocity → `` trendPct >= 0 ? `Velocity +${trendPct}% over 6 weeks — keep the streak` : `Velocity ${trendPct}% over 6 weeks — capture something today` ``.

- [ ] **Step 1: Rename module and fix imports**

```bash
git mv src/renderer/lib/stats.js src/renderer/lib/stats.mjs
```

In `src/renderer/components/HudSidebar.jsx` change `from '../lib/stats.js'` → `from '../lib/stats.mjs'`.
In `src/renderer/App.jsx` change `from './lib/stats.js'` → `from './lib/stats.mjs'`.

Run: `npm run build` — Expected: clean build (proves imports resolve).

- [ ] **Step 2: Write failing tests** — `test/stats.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { velocity, coldNotes, bridgeStats, maturity, nextActions } from '../src/renderer/lib/stats.mjs'

const DAY = 86400000
const NOW = Date.parse('2026-07-07T12:00:00Z')
const note = (id, ageDays, out = [], inn = []) => ({
  id, title: id, folder: 'f', outLinks: out, inLinks: inn, mtime: NOW - ageDays * DAY
})

test('velocity buckets 12 weeks and computes trend', () => {
  const notes = [note('a', 1), note('b', 8), note('c', 100)]
  const v = velocity(notes, NOW)
  assert.equal(v.weeks.length, 12)
  assert.equal(v.weeks[11], 1) // a: this week
  assert.equal(v.weeks[10], 1) // b: last week
  assert.equal(v.weeks.reduce((s, x) => s + x, 0), 2) // c outside window
  assert.equal(v.trendPct, 200) // last6=2, prior6=0 → (2-0)/max(1,0)=2 → 200%
})

test('coldNotes finds >60d, oldest first', () => {
  const notes = [note('fresh', 3), note('old', 90), note('older', 200)]
  const cold = coldNotes(notes, NOW)
  assert.deepEqual(cold.map((c) => c.note.id), ['older', 'old'])
  assert.equal(cold[0].ageDays, 200)
})

test('bridgeStats counts only cross-cluster links between real clusters', () => {
  const clusterOf = new Map([['a', 0], ['b', 0], ['c', 1], ['d', -1]])
  const links = [
    { source: 'a', target: 'b' }, // same cluster
    { source: 'a', target: 'c' }, // bridge
    { source: 'b', target: 'c' }, // bridge
    { source: 'a', target: 'd' }  // involves orphan → not a bridge
  ]
  const b = bridgeStats(links, clusterOf)
  assert.equal(b.count, 2)
  assert.deepEqual(b.top[0], { id: 'c', cross: 2 })
})

test('maturity applies the spec formula', () => {
  // 4 notes: degrees 1,2,1,0 → avg 1 → density 1/6; connected 3/4; all fresh
  const notes = [
    note('A', 1, ['B'], []),
    note('B', 1, ['C'], ['A']),
    note('C', 1, [], ['B']),
    note('D', 1, [], [])
  ]
  const m = maturity(notes, NOW)
  assert.equal(m.score, 65) // 40*0.75 + 30*1 + 30*(1/6) = 65
  assert.equal(m.connectedRatio, 0.75)
})

test('nextActions caps at 3 and orders orphans → cold → isolated → velocity', () => {
  const notes = [note('A', 1, ['B'], []), note('B', 1, [], ['A']), note('Lonely', 1)]
  const acts = nextActions({
    notes,
    cold: [{ note: note('Dusty', 90), ageDays: 90 }],
    trendPct: 50,
    clusterOf: new Map([['A', 0], ['B', 0], ['Lonely', -1]]),
    clusterCount: 1,
    links: [{ source: 'A', target: 'B' }]
  })
  assert.equal(acts.length, 3)
  assert.match(acts[0], /1 orphan note/)
  assert.match(acts[1], /Dusty.*90d/)
  assert.match(acts[2], /no bridges/) // cluster 0 (size 2)? size<3 → skipped… so velocity
})
```

Note: in the last test cluster 0 has size 2 (<3) so the isolated-cluster rule is skipped and slot 3 is the velocity message — assert `assert.match(acts[2], /Velocity \+50%/)` instead of `/no bridges/`. Use the velocity assertion (the `/no bridges/` line above is wrong; write the velocity one).

- [ ] **Step 3: Run to verify fail**

Run: `npm test`
Expected: FAIL — named exports missing from stats.mjs.

- [ ] **Step 4: Implement** — append to `src/renderer/lib/stats.mjs`:

```js
const DAY = 86400000
const WEEK = 7 * DAY

export function velocity(notes, now) {
  const weeks = new Array(12).fill(0)
  for (const n of notes) {
    const age = now - (n.mtime || 0)
    if (age < 0 || age >= 12 * WEEK) continue
    weeks[11 - Math.floor(age / WEEK)]++
  }
  const last6 = weeks.slice(6).reduce((s, x) => s + x, 0)
  const prior6 = weeks.slice(0, 6).reduce((s, x) => s + x, 0)
  const trendPct = Math.round((100 * (last6 - prior6)) / Math.max(1, prior6))
  return { weeks, trendPct }
}

export function coldNotes(notes, now, days = 60) {
  return notes
    .filter((n) => n.mtime && now - n.mtime > days * DAY)
    .map((n) => ({ note: n, ageDays: Math.floor((now - n.mtime) / DAY) }))
    .sort((a, b) => b.ageDays - a.ageDays)
}

export function bridgeStats(links, clusterOf) {
  let count = 0
  const per = new Map()
  for (const l of links) {
    const a = clusterOf.get(l.source)
    const b = clusterOf.get(l.target)
    if (a == null || b == null || a < 0 || b < 0 || a === b) continue
    count++
    per.set(l.source, (per.get(l.source) || 0) + 1)
    per.set(l.target, (per.get(l.target) || 0) + 1)
  }
  const top = [...per.entries()]
    .map(([id, cross]) => ({ id, cross }))
    .sort((x, y) => y.cross - x.cross || (x.id < y.id ? -1 : 1))
    .slice(0, 5)
  return { count, top }
}

export function maturity(notes, now) {
  const n = notes.length || 1
  const connected = notes.filter((x) => degree(x) > 0).length
  const fresh = notes.filter((x) => x.mtime && now - x.mtime <= 60 * DAY).length
  const avgDegree = notes.reduce((s, x) => s + degree(x), 0) / n
  const connectedRatio = connected / n
  const freshRatio = fresh / n
  const densityScore = Math.min(1, avgDegree / 6)
  const score = Math.round(40 * connectedRatio + 30 * freshRatio + 30 * densityScore)
  return { score, connectedRatio, freshRatio, densityScore }
}

export function nextActions({ notes, cold, trendPct, clusterOf, clusterCount, links }) {
  const acts = []
  const orphans = notes.filter((n) => degree(n) === 0).length
  if (orphans > 0) acts.push(`Link or archive ${orphans} orphan note${orphans === 1 ? '' : 's'}`)
  if (cold.length) acts.push(`Revisit "${cold[0].note.title}" — dormant ${cold[0].ageDays}d`)
  // isolated cluster: size ≥3 with zero cross-links
  const crossy = new Set()
  for (const l of links) {
    const a = clusterOf.get(l.source)
    const b = clusterOf.get(l.target)
    if (a != null && b != null && a >= 0 && b >= 0 && a !== b) {
      crossy.add(a)
      crossy.add(b)
    }
  }
  const size = new Map()
  for (const [, c] of clusterOf) if (c >= 0) size.set(c, (size.get(c) || 0) + 1)
  for (let ci = 0; ci < clusterCount; ci++) {
    if ((size.get(ci) || 0) >= 3 && !crossy.has(ci)) {
      acts.push(`Cluster ${ci + 1} (${size.get(ci)} notes) has no bridges — connect it`)
      break
    }
  }
  acts.push(
    trendPct >= 0
      ? `Velocity +${trendPct}% over 6 weeks — keep the streak`
      : `Velocity ${trendPct}% over 6 weeks — capture something today`
  )
  return acts.slice(0, 3)
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test`
Expected: PASS — all stats tests green.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/lib src/renderer/components/HudSidebar.jsx src/renderer/App.jsx test/stats.test.mjs
git commit -m "feat: cockpit stats — velocity, cold notes, bridges, maturity, next actions (tested)"
```

---

## Task 4: `force.mjs` — the simulation (TDD)

**Files:**
- Create: `src/renderer/lib/force.mjs`
- Test: `test/force.test.mjs`

**Interfaces:**
- Consumes: `hashAngle` from `./graph.mjs`.
- Produces: `createSim(ids: string[], links: {source,target}[], opts?) → { nodes: {id,x,y,z,vx,vy,vz}[], byId: Map<string, node>, tick(n = 1): void }`. Deterministic init; positions always finite and within `opts.maxRadius` (default 90).

- [ ] **Step 1: Write failing tests** — `test/force.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSim } from '../src/renderer/lib/force.mjs'

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

test('positions stay finite and bounded after 600 ticks', () => {
  const ids = ['A', 'B', 'C', 'D', 'E']
  const sim = createSim(ids, [{ source: 'A', target: 'B' }, { source: 'C', target: 'D' }])
  sim.tick(600)
  for (const n of sim.nodes) {
    for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(n[k]), `${n.id}.${k} finite`)
    assert.ok(Math.hypot(n.x, n.y, n.z) <= 90.0001, `${n.id} within maxRadius`)
  }
})

test('linked nodes settle closer than unlinked ones', () => {
  const sim = createSim(['A', 'B', 'C', 'D', 'E'], [{ source: 'A', target: 'B' }, { source: 'C', target: 'D' }])
  sim.tick(600)
  const A = sim.byId.get('A'), B = sim.byId.get('B'), C = sim.byId.get('C')
  assert.ok(dist(A, B) < dist(A, C), `linked ${dist(A, B).toFixed(1)} < unlinked ${dist(A, C).toFixed(1)}`)
})

test('deterministic: same input → identical layout', () => {
  const ids = ['A', 'B', 'C']
  const links = [{ source: 'A', target: 'B' }]
  const s1 = createSim(ids, links); s1.tick(300)
  const s2 = createSim(ids, links); s2.tick(300)
  for (let i = 0; i < ids.length; i++) {
    assert.equal(s1.nodes[i].x, s2.nodes[i].x)
    assert.equal(s1.nodes[i].y, s2.nodes[i].y)
  }
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../force.mjs'`.

- [ ] **Step 3: Implement** — `src/renderer/lib/force.mjs`:

```js
import { hashAngle } from './graph.mjs'

// ponytail: O(n²) pairwise repulsion — trivially 60fps to ~2–3k notes.
// If a vault ever gets huge, swap the internals for d3-force-3d (Barnes-Hut)
// behind this same createSim API.
export function createSim(ids, links, opts = {}) {
  const o = {
    repulsion: 260,
    forceCap: 2.5,
    cutoff2: 3600, // stop repelling beyond 60 units
    spring: 0.015,
    restLen: 14,
    center: 0.0035,
    yFlatten: 1.6, // stronger vertical centering → gently oblate brain
    damping: 0.85,
    maxRadius: 90,
    ...opts
  }
  const nodes = ids.map((id) => {
    const a = hashAngle(id)
    const b = hashAngle('y' + id)
    const r = 18 + (hashAngle('r' + id) / (Math.PI * 2)) * 14
    return { id, x: Math.cos(a) * r, y: (b - Math.PI) * 5, z: Math.sin(a) * r, vx: 0, vy: 0, vz: 0 }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const L = []
  for (const l of links) {
    const a = byId.get(l.source)
    const b = byId.get(l.target)
    if (a && b && a !== b) L.push([a, b])
  }

  function tickOnce() {
    const n = nodes.length
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
        const d2 = dx * dx + dy * dy + dz * dz + 0.01
        if (d2 > o.cutoff2) continue
        const f = Math.min(o.forceCap, o.repulsion / d2)
        const d = Math.sqrt(d2)
        dx /= d; dy /= d; dz /= d
        a.vx += dx * f; a.vy += dy * f; a.vz += dz * f
        b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f
      }
    }
    for (const [a, b] of L) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6
      const f = o.spring * (d - o.restLen)
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; a.vz += (dz / d) * f
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; b.vz -= (dz / d) * f
    }
    for (const p of nodes) {
      p.vx -= p.x * o.center
      p.vy -= p.y * o.center * o.yFlatten
      p.vz -= p.z * o.center
      p.vx *= o.damping; p.vy *= o.damping; p.vz *= o.damping
      p.x += p.vx; p.y += p.vy; p.z += p.vz
      const r = Math.hypot(p.x, p.y, p.z)
      if (r > o.maxRadius) {
        const s = o.maxRadius / r
        p.x *= s; p.y *= s; p.z *= s
      }
    }
  }

  return { nodes, byId, tick(k = 1) { for (let i = 0; i < k; i++) tickOnce() } }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS. If the "linked closer" test is marginal, raise `restLen` gap by lowering `restLen` to 12 — do NOT loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/force.mjs test/force.test.mjs
git commit -m "feat: deterministic O(n^2) force sim for the brain layout (tested)"
```

---

## Task 5: Design tokens + full-bleed glass layout

**Files:**
- Modify: `src/renderer/index.css` (top: tokens; new `.glass`; layout section), `src/renderer/App.jsx` (layout restructure only — view default stays `'solar'` until Task 6)

**Interfaces:**
- Produces: `.glass` utility class; `.stage` absolute full-bleed canvas host; floating `.hud-body` with `pointer-events: none` (children re-enable). All later tasks style against the tokens.

- [ ] **Step 1: Add tokens + glass at the TOP of `src/renderer/index.css`** (replace the existing `body { ... }` block):

```css
:root {
  --bg: #09090B;
  --card: #111216;
  --border: rgba(255, 255, 255, 0.06);
  --glass: rgba(17, 18, 22, 0.72);
  --text: #e8eaf2;
  --text-dim: #8b93ad;
  --text-faint: #565f7d;
  --accent: #6ea8ff;
  --glow: rgba(110, 168, 255, 0.35);
}
body {
  background: var(--bg);
  color: var(--text);
  font: 13px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}
.glass {
  background: var(--glass);
  backdrop-filter: blur(14px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 2: Restructure `App.jsx` layout** — replace the main `return (...)` block's wrapper structure with (only structure changes; keep all existing props/handlers exactly as they are):

```jsx
  return (
    <div className="app hud">
      <div className="stage">
        <SpaceCanvas
          view={view}
          graph={graph}
          activeIds={filtering ? activeIds : null}
          onSelect={setSelected}
          showAllLinks={showAllLinks}
          showLabels={showLabels}
          resetNonce={resetNonce}
        />
      </div>
      <header className="topbar">
        <span className="brand">◑ Onyx</span>
        <span className="stats">
          {graph.meta.noteCount} notes · {graph.meta.linkCount} links
        </span>
        <div className="spacer" />
        <ViewSwitcher view={view} onChange={setView} />
        <button onClick={() => window.onyx.pickVault().then(setGraph)}>Change vault</button>
      </header>
      <FolderTabs graph={graph} filter={filter} onChange={setFilter} />
      <div className="hud-body">
        <HudSidebar
          graph={graph}
          stats={stats}
          filter={filter}
          onFilter={setFilter}
          featured={featured}
          onSelect={setSelected}
          onCreate={handleCreate}
        />
        <div className="hud-spacer" />
        <HudToolbar
          showAllLinks={showAllLinks}
          onLinks={toggleLinks}
          showLabels={showLabels}
          onLabels={toggleLabels}
          onReset={() => setResetNonce((n) => n + 1)}
        />
      </div>
      {selected && (
        <NoteReader id={selected} graph={graph} onSelect={setSelected} onClose={() => setSelected(null)} />
      )}
      <UpdateToast />
    </div>
  )
```

- [ ] **Step 3: Layout CSS** — in `index.css`, replace the `.app`/`.hud-body`/`.hud-left`/`.hud-right`/`.foldertabs`/`.topbar` rules with:

```css
.app.hud { position: relative; height: 100%; }
.stage { position: absolute; inset: 0; }
.stage .canvas { position: absolute; inset: 0; }

.topbar { position: relative; z-index: 3; display: flex; align-items: center; gap: 14px; padding: 10px 16px; background: transparent; border: none; }
.foldertabs { position: relative; z-index: 3; display: flex; gap: 4px; align-items: center; padding: 2px 12px 6px; overflow-x: auto; white-space: nowrap; background: transparent; border: none; }

.hud-body { position: absolute; top: 92px; bottom: 12px; left: 12px; right: 12px; display: flex; gap: 12px; pointer-events: none; z-index: 2; }
.hud-spacer { flex: 1; }
.hud-left { pointer-events: auto; width: 254px; flex: none; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; }
.hud-right { pointer-events: auto; width: 50px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 0; align-self: flex-start; }
```

and add the `glass` class to both panels in JSX: in `HudSidebar.jsx` root `<aside className="hud-left glass">`, in `HudToolbar.jsx` root `<aside className="hud-right glass">`. Remove the old `background:`/`border-right`/`border-left` declarations from `.hud-left`/`.hud-right` if still present anywhere.

- [ ] **Step 4: Verify by screenshot**

Run: `cd <scratchpad> && bash shot.sh glasspass 3200`
Expected: Solar view **full-bleed edge to edge** behind a floating glass sidebar (blurred graph visible through it), floating toolbar, transparent top bars. No layout gaps; canvas visible in the strip below panels.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.css src/renderer/App.jsx src/renderer/components/HudSidebar.jsx src/renderer/components/HudToolbar.jsx
git commit -m "feat: design tokens + full-bleed canvas with floating glass panels"
```

---

## Task 6: BrainView — force layout, firing synapses, default view

**Files:**
- Create: `src/renderer/views/BrainView.js`
- Modify: `src/renderer/views/SpaceCanvas.jsx` (register + thread `onHover`), `src/renderer/views/ViewSwitcher.jsx` (add entry first), `src/renderer/App.jsx` (default `'brain'`)

**Interfaces:**
- Consumes: `createSim` (Task 4), `detectClusters` (Task 2), scenery (`makeOrb`, `addLights`, `makeStarfield`, `makeNebula`, `LinkPulses`), `makeLabel`, `hashAngle`.
- Produces: view id `'brain'`; constructor `new BrainView(container, { onSelect, onHover })`. `onHover(payload | null)` where payload = `{ id, x, y, pinned }` (screen px, fired every frame while hovered/pinned). Click = focus + pin; double-click = `onSelect(id)`; click empty space = unpin. Standard `update/setActive/setLinksMode/setLabels/dispose`.

- [ ] **Step 1: Create `src/renderer/views/BrainView.js`**

```js
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { hashAngle } from '../lib/graph.mjs'
import { createSim } from '../lib/force.mjs'
import { detectClusters } from '../lib/clusters.mjs'
import { makeLabel } from '../lib/label.js'
import { makeOrb, addLights, makeStarfield, makeNebula, LinkPulses } from '../lib/scenery.js'

const CLUSTER_PALETTE = [
  '#7fd4ff', '#c77dff', '#7bffb0', '#ffd166', '#ff7b9c', '#4cc9f0',
  '#bdb2ff', '#80ed99', '#ff9f1c', '#f72585', '#9bf6ff', '#fdffb6'
]
const ORPHAN_COLOR = '#4a5470'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export class BrainView {
  constructor(container, { onSelect, onHover }) {
    this.container = container
    this.onSelect = onSelect
    this.onHover = onHover || (() => {})
    this.nodes = [] // { mesh, id, simNode, baseSize, spinX, spinY, pulse, phase, active }
    this.byId = new Map()
    this.labels = []
    this.labelsVisible = true
    this.activeIds = null
    this.showAllLinks = true
    this.hoverId = null
    this.pinned = false
    this._t = 0
    this._clickTimer = null

    const w = container.clientWidth || 1400
    const h = container.clientHeight || 800

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x07070d, 0.0018)
    this.scene.add(makeNebula('#1c1442', '#0a1a3c'))
    this.scene.add(makeStarfield())
    addLights(this.scene)

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 3000)
    this.camera.position.set(0, 14, 150)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxDistance = 500

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 1.0, 0.6, 0.08))

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this._onMove = (e) => this._hover(e)
    this._onClick = (e) => this._click(e)
    this._onDbl = (e) => this._dblclick(e)
    this._onResize = () => this._resize()
    this.renderer.domElement.addEventListener('pointermove', this._onMove)
    this.renderer.domElement.addEventListener('click', this._onClick)
    this.renderer.domElement.addEventListener('dblclick', this._onDbl)
    window.addEventListener('resize', this._onResize)

    this.clock = new THREE.Clock()
    this._raf = null
    this._loop()
  }

  update(graph) {
    this.graph = graph
    this._clear()

    const ids = graph.notes.map((n) => n.id)
    const { clusterOf } = detectClusters(ids, graph.links)
    this.sim = createSim(ids, graph.links)
    this.sim.tick(300) // warm up before first paint

    graph.notes.forEach((note) => {
      const simNode = this.sim.byId.get(note.id)
      const ci = clusterOf.get(note.id)
      const colorHex = ci >= 0 ? CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length] : ORPHAN_COLOR
      const deg = note.outLinks.length + note.inLinks.length
      const size = clamp(0.55 + deg * 0.11, 0.55, 2.4)
      const orb = makeOrb(colorHex, size, note.type, note.id)
      orb.mesh.position.set(simNode.x, simNode.y, simNode.z)
      this.group.add(orb.mesh)
      const rec = { ...orb, id: note.id, simNode, baseSize: size, phase: hashAngle(note.id), active: true, cluster: ci }
      this.nodes.push(rec)
      this.byId.set(note.id, rec)

      const label = makeLabel(note.title, '#eef2ff', 0.045)
      this.group.add(label)
      this.labels.push({ sprite: label, id: note.id, rec })
    })

    // link segments — one shared live buffer drives lines AND pulses
    this.linkPairs = []
    for (const l of graph.links) {
      const a = this.byId.get(l.source)
      const b = this.byId.get(l.target)
      if (a && b) this.linkPairs.push([a, b])
    }
    this.segArray = new Float32Array(this.linkPairs.length * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.segArray, 3))
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x86b8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.lines)
    this.pulses = new LinkPulses(this.group, this.segArray, 0xbfe0ff, 90)

    // hover highlight overlay (incident links only)
    this.hlGeo = new THREE.BufferGeometry()
    this.hlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.hlLines = new THREE.LineSegments(
      this.hlGeo,
      new THREE.LineBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.group.add(this.hlLines)

    this.setActive(this.activeIds)
    this.setLinksMode(this.showAllLinks)
  }

  setActive(idSet) {
    this.activeIds = idSet
    for (const n of this.nodes) {
      const on = !idSet || idSet.has(n.id)
      n.active = on
      n.mesh.material.transparent = !on
      n.mesh.material.opacity = on ? 1 : 0.12
      n.mesh.material.emissiveIntensity = on ? 0.9 : 0.25
    }
  }

  setLinksMode(showAll) {
    this.showAllLinks = showAll !== false
    if (this.lines) this.lines.visible = this.showAllLinks
  }

  setLabels(show) {
    this.labelsVisible = show !== false
  }

  _setHover(id) {
    if (id === this.hoverId) return
    this.hoverId = id
    this._rebuildHighlight()
    if (!id && !this.pinned) this.onHover(null)
  }

  _rebuildHighlight() {
    const id = this.hoverId
    const segs = []
    if (id) {
      for (const [a, b] of this.linkPairs) {
        if (a.id === id || b.id === id) {
          segs.push(a.mesh.position.x, a.mesh.position.y, a.mesh.position.z, b.mesh.position.x, b.mesh.position.y, b.mesh.position.z)
        }
      }
    }
    this.hlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3))
    this.hlGeo.attributes.position.needsUpdate = true
  }

  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh))[0]
  }

  _hover(e) {
    const hit = this._pick(e)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    if (!this.pinned) this._setHover(hit ? hit.object.userData.id : null)
  }

  _click(e) {
    const hit = this._pick(e)
    clearTimeout(this._clickTimer)
    if (!hit) {
      this.pinned = false
      this._setHover(null)
      this.onHover(null)
      return
    }
    const id = hit.object.userData.id
    this._clickTimer = setTimeout(() => {
      this.pinned = true
      this._setHover(id)
      const rec = this.byId.get(id)
      if (rec) this._flyTo(rec.mesh.position)
    }, 240)
  }

  _dblclick(e) {
    clearTimeout(this._clickTimer)
    const hit = this._pick(e)
    if (hit) this.onSelect(hit.object.userData.id)
  }

  _flyTo(target) {
    this._flight = {
      from: this.camera.position.clone(),
      to: target.clone().add(new THREE.Vector3(0, 8, 34)),
      look: target.clone(),
      t: 0
    }
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const dt = Math.min(0.05, this.clock.getDelta())
    this._t += dt

    if (this.sim) this.sim.tick(2)

    // copy sim → meshes with hash-phased micro-drift (display only)
    for (const n of this.nodes) {
      const p = n.simNode
      n.mesh.position.set(
        p.x + Math.sin(this._t * 0.7 + n.phase) * 0.35,
        p.y + Math.sin(this._t * 0.9 + n.phase * 2) * 0.35,
        p.z + Math.cos(this._t * 0.8 + n.phase) * 0.35
      )
      n.mesh.rotation.x += n.spinX
      n.mesh.rotation.y += n.spinY
      const pulse = 1 + Math.sin(this._t * 1.5 + n.pulse) * 0.07
      n.mesh.scale.setScalar(n.baseSize * pulse * (n.active ? 1 : 0.55))
    }

    // live link buffer (lines + pulses share it)
    let i = 0
    for (const [a, b] of this.linkPairs) {
      this.segArray[i++] = a.mesh.position.x
      this.segArray[i++] = a.mesh.position.y
      this.segArray[i++] = a.mesh.position.z
      this.segArray[i++] = b.mesh.position.x
      this.segArray[i++] = b.mesh.position.y
      this.segArray[i++] = b.mesh.position.z
    }
    if (this.lines) this.lines.geometry.attributes.position.needsUpdate = true
    if (this.hoverId) this._rebuildHighlight()
    if (this.pulses) this.pulses.update(dt)

    // labels: distance fade
    const cam = this.camera.position
    const tmp = new THREE.Vector3()
    for (const l of this.labels) {
      if (!this.labelsVisible) { l.sprite.visible = false; continue }
      l.sprite.visible = true
      l.sprite.position.set(l.rec.mesh.position.x, l.rec.mesh.position.y + l.rec.baseSize + 1.3, l.rec.mesh.position.z)
      const d = tmp.copy(l.sprite.position).distanceTo(cam)
      let o = 1 - (d - 100) / 110
      o = Math.max(0.03, Math.min(0.95, o))
      if (this.activeIds && !this.activeIds.has(l.id)) o *= 0.12
      l.sprite.material.opacity = o
    }

    if (this._flight) {
      this._flight.t = Math.min(1, this._flight.t + 0.02)
      const k = this._flight.t * (2 - this._flight.t)
      this.camera.position.lerpVectors(this._flight.from, this._flight.to, k)
      this.controls.target.lerp(this._flight.look, k)
      if (this._flight.t >= 1) this._flight = null
    }

    // hover card position stream
    if (this.hoverId) {
      const rec = this.byId.get(this.hoverId)
      if (rec) {
        const w = this.container.clientWidth || 1400
        const h = this.container.clientHeight || 800
        tmp.copy(rec.mesh.position).project(this.camera)
        this.onHover({ id: this.hoverId, x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, pinned: this.pinned })
      }
    }

    this.controls.update()
    this.composer.render()
  }

  _clear() {
    if (this.pulses) { this.pulses.dispose(); this.pulses = null }
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.material?.dispose()
      if (!child.userData?.sharedGeo) child.geometry?.dispose()
    }
    this.nodes = []
    this.byId = new Map()
    this.labels = []
    this.linkPairs = []
    this.lines = null
    this.hlLines = null
    this.hoverId = null
    this.pinned = false
  }

  _resize() {
    const w = this.container.clientWidth || 1400
    const h = this.container.clientHeight || 800
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    this.renderer.domElement.removeEventListener('pointermove', this._onMove)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    this.renderer.domElement.removeEventListener('dblclick', this._onDbl)
    window.removeEventListener('resize', this._onResize)
    clearTimeout(this._clickTimer)
    this._clear()
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
```

- [ ] **Step 2: Register the view.** `SpaceCanvas.jsx`:

```jsx
import { BrainView } from './BrainView.js'
// ...
const VIEWS = { brain: BrainView, solar: SolarSystemView, constellation: GraphView, core: CoreView, globe: GlobeView }
```

Add `onHover` prop and thread it: `export function SpaceCanvas({ view, graph, activeIds, onSelect, onHover, showAllLinks = true, showLabels = false, resetNonce = 0 })`, and in the mount effect: `inst.current = new View(ref.current, { onSelect, onHover })`. Change the mount fallback `VIEWS[view] || SolarSystemView` → `VIEWS[view] || BrainView`.

`ViewSwitcher.jsx` — add as FIRST entry:

```js
  { id: 'brain', label: '🧠 Brain' },
```

`App.jsx` — `useState('solar')` → `useState('brain')`.

- [ ] **Step 3: Verify by screenshot** (default view is now the brain)

Run: `cd <scratchpad> && bash shot.sh brain1 4200`
Expected: full-bleed force-directed brain — visible distinct cluster-colored lobes (not folder rings), gem-shaped neurons, faint synapse web, bright pulse dots traveling links, glass panels floating over it. Check console output for errors before viewing.

- [ ] **Step 4: Run tests** (`npm test`) — Expected: all pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/BrainView.js src/renderer/views/SpaceCanvas.jsx src/renderer/views/ViewSwitcher.jsx src/renderer/App.jsx
git commit -m "feat: BrainView — force-directed neural homepage with firing synapses (new default)"
```

---

## Task 7: HoverCard — glass preview with reserved AI slot

**Files:**
- Create: `src/renderer/components/HoverCard.jsx`
- Modify: `src/renderer/App.jsx` (hover state + render + debug hook), `src/renderer/index.css` (card styles)

**Interfaces:**
- Consumes: `onHover` payload from Task 6; `window.onyx.readNote`; `detectClusters` NOT needed (cluster shown as "Lobe N" comes via graph recompute — instead, keep it simple: card shows folder, links, age, excerpt).
- Produces: `<HoverCard hover={ {id,x,y,pinned} | null } graph={graph} />`; `window.__onyxDebug.hover(id)` test hook (positions card at 620,320).

- [ ] **Step 1: Create `src/renderer/components/HoverCard.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { cleanFolder } from '../lib/stats.mjs'

const excerptCache = new Map()

function toExcerpt(raw) {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`\[\]!|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function HoverCard({ hover, graph }) {
  const [excerpt, setExcerpt] = useState('')
  const note = hover ? graph.notes.find((n) => n.id === hover.id) : null

  useEffect(() => {
    if (!note) return
    if (excerptCache.has(note.id)) {
      setExcerpt(excerptCache.get(note.id))
      return
    }
    setExcerpt('')
    let dead = false
    window.onyx.readNote(note.id).then((raw) => {
      if (dead || raw == null) return
      const ex = toExcerpt(raw)
      excerptCache.set(note.id, ex)
      setExcerpt(ex)
    })
    return () => { dead = true }
  }, [note?.id])

  if (!hover || !note) return null
  const age = note.mtime ? Math.max(0, Math.floor((Date.now() - note.mtime) / 86400000)) : null

  return (
    <div
      className={`hovercard glass ${hover.pinned ? 'pinned' : ''}`}
      style={{ left: Math.min(hover.x + 18, window.innerWidth - 320), top: Math.min(hover.y + 14, window.innerHeight - 240) }}
    >
      <div className="hc-title">{note.title}</div>
      <div className="hc-meta">
        <span>{cleanFolder(note.folder)}</span>
        {note.type && <span>{note.type}</span>}
        <span>→ {note.outLinks.length}</span>
        <span>← {note.inLinks.length}</span>
        {age != null && <span>{age === 0 ? 'today' : `${age}d ago`}</span>}
      </div>
      {excerpt && <div className="hc-excerpt">{excerpt}…</div>}
      <div className="hc-ai">✦ AI summary — arrives with the Knowledge Engine</div>
      {hover.pinned && <div className="hc-hint">double-click to open · click space to release</div>}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `App.jsx`**

Add state + debug + import:

```jsx
import { HoverCard } from './components/HoverCard.jsx'
// in App():
const [hover, setHover] = useState(null)
// extend the existing debug hook object:
window.__onyxDebug = { select: setSelected, setFilter, setView, setShowAllLinks, setShowLabels,
  hover: (id) => setHover({ id, x: 620, y: 320, pinned: true }) }
```

Pass to canvas: `<SpaceCanvas ... onHover={setHover} />` and render after `<UpdateToast />`… place BEFORE the reader so the reader stays on top: add `<HoverCard hover={hover} graph={graph} />` just before `{selected && (...)}`.

- [ ] **Step 3: Card CSS** — append to `index.css`:

```css
.hovercard { position: absolute; width: 300px; padding: 13px 15px; z-index: 5; pointer-events: none; }
.hovercard.pinned { pointer-events: auto; }
.hc-title { color: var(--text); font-size: 13px; font-weight: 650; letter-spacing: 0.01em; }
.hc-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; font-size: 10px; color: var(--text-dim); letter-spacing: 0.06em; }
.hc-excerpt { margin-top: 8px; font-size: 11px; line-height: 1.55; color: var(--text-dim); }
.hc-ai { margin-top: 9px; font-size: 10px; color: var(--text-faint); border-top: 1px solid var(--border); padding-top: 8px; letter-spacing: 0.04em; }
.hc-hint { margin-top: 6px; font-size: 9px; color: var(--text-faint); letter-spacing: 0.08em; }
```

- [ ] **Step 4: Verify by screenshot** — probe file `probe-hovercard.js` in scratchpad:

```js
window.onyx.getGraph().then((g) => {
  const hub = g.notes.slice().sort((a, b) => (b.outLinks.length + b.inLinks.length) - (a.outLinks.length + a.inLinks.length))[0]
  window.__onyxDebug.hover(hub.id)
  return true
})
```

Run: `bash shot.sh braincard 3600 <scratchpad>/probe-hovercard.js`
Expected: glass card floating over the brain with title, meta row, excerpt text, and the dimmed "✦ AI summary" slot.

- [ ] **Step 5: Run `npm test`, then commit**

```bash
git add src/renderer/components/HoverCard.jsx src/renderer/App.jsx src/renderer/index.css
git commit -m "feat: glass hover card with excerpt + reserved AI-summary slot"
```

---

## Task 8: Cockpit — the OMEGA instrument panels

**Files:**
- Create: `src/renderer/components/Cockpit.jsx`
- Modify: `src/renderer/App.jsx` (compute cockpit data, render between spacer and toolbar), `src/renderer/index.css` (cockpit styles)

**Interfaces:**
- Consumes: `velocity/coldNotes/bridgeStats/maturity/nextActions` (Task 3), `detectClusters` (Task 2), `Gauge` (existing).
- Produces: `<Cockpit graph={graph} onSelect={fn} />` — self-contained: computes everything from the graph prop (`useMemo`), no new App-level state.

- [ ] **Step 1: Create `src/renderer/components/Cockpit.jsx`**

```jsx
import { useMemo } from 'react'
import { Gauge } from './Gauge.jsx'
import { detectClusters } from '../lib/clusters.mjs'
import { velocity, coldNotes, bridgeStats, maturity, nextActions } from '../lib/stats.mjs'

function Spark({ weeks }) {
  const max = Math.max(1, ...weeks)
  const pts = weeks.map((v, i) => `${(i / (weeks.length - 1)) * 100},${34 - (v / max) * 30}`).join(' ')
  return (
    <svg viewBox="0 0 100 36" className="spark" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  )
}

export function Cockpit({ graph, onSelect }) {
  const d = useMemo(() => {
    const now = Date.now()
    const { clusterOf, clusterCount } = detectClusters(graph.notes.map((n) => n.id), graph.links)
    const vel = velocity(graph.notes, now)
    const cold = coldNotes(graph.notes, now)
    const br = bridgeStats(graph.links, clusterOf)
    const mat = maturity(graph.notes, now)
    const acts = nextActions({ notes: graph.notes, cold, trendPct: vel.trendPct, clusterOf, clusterCount, links: graph.links })
    return { clusterCount, vel, cold, br, mat, acts }
  }, [graph])

  const titleOf = (id) => graph.notes.find((n) => n.id === id)?.title || id

  return (
    <aside className="cockpit">
      <div className="glass cpanel">
        <div className="sec-h">MATURITY</div>
        <div className="cp-row">
          <Gauge value={d.mat.score} label="SCORE" />
          <div className="cp-sub">
            <div>{graph.meta.noteCount} notes · {d.clusterCount} clusters</div>
            <div className="bar"><i style={{ width: `${d.mat.connectedRatio * 100}%` }} /></div>
            <div className="bar"><i style={{ width: `${d.mat.freshRatio * 100}%` }} /></div>
            <div className="bar"><i style={{ width: `${d.mat.densityScore * 100}%` }} /></div>
            <div className="cp-legend">linked · fresh · dense</div>
          </div>
        </div>
      </div>

      <div className="glass cpanel">
        <div className="sec-h">VELOCITY · 12 WK</div>
        <Spark weeks={d.vel.weeks} />
        <div className={`cp-trend ${d.vel.trendPct >= 0 ? 'up' : 'down'}`}>
          {d.vel.trendPct >= 0 ? '+' : ''}{d.vel.trendPct}%
        </div>
      </div>

      {d.cold.length > 0 && (
        <div className="glass cpanel">
          <div className="sec-h">COLD NOTES ›60D</div>
          {d.cold.slice(0, 5).map((c) => (
            <button key={c.note.id} className="cp-item" onClick={() => onSelect(c.note.id)}>
              <span className="cp-t">{c.note.title}</span>
              <span className="cp-v">{c.ageDays}d</span>
            </button>
          ))}
        </div>
      )}

      <div className="glass cpanel">
        <div className="sec-h">BRIDGES · {d.br.count}</div>
        {d.br.top.slice(0, 3).map((t) => (
          <button key={t.id} className="cp-item" onClick={() => onSelect(t.id)}>
            <span className="cp-t">{titleOf(t.id)}</span>
            <span className="cp-v">{t.cross}⇄</span>
          </button>
        ))}
      </div>

      <div className="glass cpanel">
        <div className="sec-h">NEXT ACTIONS</div>
        {d.acts.map((a, i) => (
          <div key={i} className="cp-act">▸ {a}</div>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Wire into `App.jsx`** — import `Cockpit`, and in the `.hud-body` replace `<div className="hud-spacer" />` neighbors so the order is: `<HudSidebar …/>` `<div className="hud-spacer" />` `<Cockpit graph={graph} onSelect={setSelected} />` `<HudToolbar …/>`.

- [ ] **Step 3: Cockpit CSS** — append to `index.css`:

```css
.cockpit { pointer-events: auto; width: 240px; flex: none; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.cpanel { padding: 12px 13px; }
.cp-row { display: flex; gap: 12px; align-items: center; }
.cp-sub { flex: 1; display: flex; flex-direction: column; gap: 5px; font-size: 10px; color: var(--text-dim); }
.bar { height: 3px; background: rgba(255,255,255,.07); border-radius: 2px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); border-radius: 2px; box-shadow: 0 0 6px var(--glow); }
.cp-legend { font-size: 8px; letter-spacing: .14em; color: var(--text-faint); }
.spark { width: 100%; height: 36px; margin-top: 4px; filter: drop-shadow(0 0 4px var(--glow)); }
.cp-trend { font-size: 15px; font-weight: 650; margin-top: 2px; }
.cp-trend.up { color: #7bffb0; }
.cp-trend.down { color: #ff9a9a; }
.cp-item { display: flex; justify-content: space-between; gap: 8px; width: 100%; background: transparent; border: none; padding: 3px 2px; cursor: pointer; text-align: left; }
.cp-item:hover .cp-t { color: var(--text); }
.cp-t { color: var(--text-dim); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-v { color: var(--text-faint); font-size: 10px; flex: none; }
.cp-act { font-size: 10.5px; color: var(--text-dim); line-height: 1.5; padding: 2px 0; }
```

- [ ] **Step 4: Verify by screenshot**

Run: `bash shot.sh cockpit 4200`
Expected: right-side floating glass column — maturity gauge + 3 sub-bars, velocity sparkline with signed %, cold notes list with ages, bridges with ⇄ counts, ▸ next actions. Left sidebar and toolbar intact. Brain behind everything.

- [ ] **Step 5: Run `npm test`, then commit**

```bash
git add src/renderer/components/Cockpit.jsx src/renderer/App.jsx src/renderer/index.css
git commit -m "feat: OMEGA cockpit — maturity, velocity, cold notes, bridges, next actions"
```

---

## Task 9: README + full verification sweep

**Files:**
- Modify: `README.md` (views list + brain blurb)

- [ ] **Step 1: Update README** — replace the `## Views` section with:

```markdown
## Views

- **🧠 Brain** (default) — your vault as a living neural network: force-directed
  layout where clusters emerge from links, synapses fire along connections,
  hover previews any thought, and a floating cockpit tracks velocity, cold
  notes, bridges, and vault maturity.
- **☀ Solar System** — folders as suns, notes orbiting, links glowing.
- **◉ Core of Everything** — core star with teardrop rings + radial fan.
- **⊕ Second Brain** — spherical shells around a glowing core.
- **✦ Constellation** — folder-clustered node cloud.
```

- [ ] **Step 2: Full sweep**

Run: `npm test` → Expected: all suites pass.
Run: `bash shot.sh final-brain 4200` → brain default, cockpit, glass — the OMEGA look.
Run: `bash shot.sh final-solar 3200` with probe `window.__onyxDebug.setView('solar')` → legacy views still work in the new shell.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for the Living Brain homepage + cockpit"
```

---

## Self-Review

**Spec coverage:** brain-as-home + force layout (T4/T6) ✓ · alive motion/micro-drift (T6) ✓ · synapse firing incl. hover burst via highlight overlay (T6) ✓ · hover card w/ excerpt + AI slot + pin + double-click open (T6/T7) ✓ · cluster colors from communities, orphans dim (T2/T6) ✓ · cockpit: velocity/cold/clusters/bridges/maturity/hubs-orphans(existing sidebar)/next-actions (T3/T8) ✓ · tokens + full-bleed glass (T5) ✓ · mtime (T1) ✓ · default view brain, legacy views intact (T6/T9) ✓ · links/labels toggles honored (T6) ✓ · error cases: 0-link vault (sim runs, orphan colors), stat-fail fallback (T1), excerpt fail → metadata-only card (T7) ✓.

**Placeholders:** none — all steps carry full code. The one intentional correction is called out inline (stats test: velocity assertion replaces the wrong `/no bridges/` line).

**Type consistency:** `detectClusters(ids, links) → {clusterOf, clusterCount, sizes}` used identically in T6/T8 · `createSim(ids, links) → {nodes, byId, tick}` matches T4/T6 · stats signatures in T3 match T8's calls · `onHover({id,x,y,pinned}|null)` matches T6 producer / T7 consumer · view interface unchanged for legacy views (they ignore `onHover`).
