# Onyx v0.4.0 — "CORTEX" Design Document
### Merged, judge-reconciled design: HUD revamp · Dashboard · Skill Tree · Tools · Architecture

All paths relative to `C:\Users\Xody2\OneDrive\Desktop\Note App`. Grounded against shipped v0.3.2. Zero new npm dependencies. All vault writes go through the existing `insideVault` guard plus exactly ONE new vault-write IPC (`vault:ensureNote`, create-only, `wx` flag).

---

## 1. Vision

Onyx becomes a full local-first second brain: a three-mode instrument (living Brain graph, analytics Dashboard, CORTEX skill tree) wrapped in Iron-Man-grade HUD chrome with Apple/Linear restraint. Every metric, unlock, and trend is computed honestly from the user's real vault and real behavior — no fake numbers, no cloud, and AI-dependent abilities appear only as a visibly locked INTELLIGENCE branch awaiting the Knowledge Engine. Daily-driver tools (command palette, daily notes, quick capture, pins, tasks) make it the place work actually happens, and a snapshot store makes the app measurably smarter every day it runs.

---

## 2. Mode architecture

### 2.1 Two axes, one seam

- **`mode`** ∈ `'brain' | 'dashboard' | 'skills'` — NEW App.jsx state. Session-only, always starts `'brain'` (**not** persisted to config: the boot dissolve is designed to reveal the live brain; reopening into a dimmed frozen canvas reads broken).
- **`view`** ∈ `'brain' | 'solar' | 'core' | 'globe' | 'constellation'` — EXISTING; it is the 3D **lens** within brain mode only. ViewSwitcher renders only when `mode === 'brain'`, restyled compact with a `.u-label` prefix `LENS` (keep the native `<select>`).

Entry points (there are exactly three, all TopBar mode tabs): BRAIN / DASHBOARD / SKILLS. Dashboard's ViewSwitcher entry and canvasView remap are deleted; SkillTree's standalone `showSkills` overlay + `.lvl-badge` widget are deleted (level display folds into the SKILLS tab, §4.3). Esc never exits a mode.

### 2.2 Canvas lifecycle: mounted, paused, dimmed

`SpaceCanvas` stays mounted across modes (BrainView remount costs a full THREE scene rebuild + ~300 warmup sim ticks). Non-brain modes **pause** it — dim-only would leave `sim.tick(2)` + bloom burning GPU under the panels.

**`setPaused(p)`** — new ~6-line method on BrainView **and all 4 legacy views** (identical `_raf`/`_loop`/`clock` pattern):

```js
setPaused(p) {
  this.paused = p
  if (p) { cancelAnimationFrame(this._raf); this._raf = null }
  else if (!this._raf) { this.clock.getDelta(); this._loop() } // eat the pause gap
}
```

`SpaceCanvas.jsx` gains a `paused` prop: `useEffect(() => { inst.current?.setPaused?.(paused) }, [paused])`, also applied in the mount effect so a view created while paused starts frozen.

**Dim** (single recipe, index.css): `.stage { transition: filter .45s ease } .stage.dimmed { filter: brightness(.32) saturate(.55) blur(1px) }`. Each full-screen mode adds one scrim div — the mode's **single** `backdrop-filter` surface (§3.8 blur budget).

### 2.3 State architecture

Flat `useState` in App.jsx — no context, no reducer. Final slots:

| slot | status |
|---|---|
| `graph`, `selected`, `filter`, `view`, `showAllLinks`, `showLabels`, `resetNonce` | existing |
| `mode` | NEW, `'brain'` default |
| `overlay` | NEW `null \| 'palette' \| 'capture'` — one slot so "which modal owns Esc" is structurally unambiguous |
| `usage` | NEW — fetched via `getUsage()` on mount, **replaced by the return value** of every `bumpUsage`/`markUnlocked` call (no polling) |
| `pins` | NEW — from `getConfig()`, written back whole via `setConfig({ pins })` |
| `booting` | NEW boolean for BootSequence |

**`hover` LEAVES App.jsx.** New `lib/bus.mjs` (~10-line emitter):

```js
const m = new Map()
export const bus = {
  on(ev, fn) { (m.get(ev) ?? m.set(ev, new Set()).get(ev)).add(fn); return () => m.get(ev)?.delete(fn) },
  emit(ev, data) { m.get(ev)?.forEach((fn) => fn(data)) }
}
```

- `SpaceCanvas onHover` → `bus.emit('hover', h)`. New `HoverLayer.jsx` owns `hover` state (subscribed via `bus.on('hover', setHover)`) and renders the existing `HoverCard`. App never re-renders on pointermove again (currently a confirmed 60fps whole-tree re-render while pinned). HoverLayer is **brain-mode-only**.
- Toasts: `bus.emit('toast', { msg, kind })` → new `Toasts.jsx` leaf with its own queue. Skill-unlock toasts ride this. One stack, **bottom-right above the status bar** (UpdateToast position family). UpdateToast itself is untouched apart from its bottom offset (§3.5).
- `window.__onyxDebug.hover` is rerouted through `bus.emit('hover', …)` — existing ONYX_SHOT scripts run unchanged. `__onyxDebug` also gains `setMode`.

**Hoists** (compute once, consume everywhere):
- `const stats = useMemo(() => vaultStats(graph), [graph])`
- `const clusters = useMemo(() => detectClusters(graph.notes.map(n => n.id), graph.links), [graph])` — consumers: Cockpit (drops its internal call), StatusBar, BootSequence, DashboardMode.
- `const evaluated = useMemo(() => evaluateSkills(buildSkillStats(graph, usage, Date.now())), [graph, usage])` — consumers: SKILLS tab badge, SkillsMode, unlock-diff effect.

### 2.4 App.jsx routing shape (the ONE structural edit — milestone 2, never touched in parallel)

```jsx
if (!graph) return <BootSequence graph={null} … />   // KEEP an early return: the render body
                                                     // dereferences graph.notes/activeIds/stats
return (
  <div className="app hud">
    <div className={`stage ${mode !== 'brain' ? 'dimmed' : ''}`}>
      <SpaceCanvas view={view} paused={mode !== 'brain'} focus={flyTo}
        onHover={(h) => bus.emit('hover', h)} …existing />
    </div>
    <TopBar mode={mode} onMode={setMode} view={view} onView={setView}
      onSearch={() => setOverlay('palette')} skillTab={{ level, levelPct, title }} />
    {mode === 'brain' && <><FolderTabs …/><div className="hud-body">…HudSidebar/Cockpit/HudToolbar…</div><HoverLayer graph={graph} /></>}
    {mode === 'dashboard' && <DashboardMode graph={graph} clusters={clusters} usage={usage} onSelect={setSelected} onFilter={f => { setFilter(f); setMode('brain') }} />}
    {mode === 'skills' && <SkillsMode evaluated={evaluated} />}
    {overlay === 'palette' && <CommandPalette graph={graph} actions={actions} onSelectNote={openNote} onClose={() => setOverlay(null)} />}
    {overlay === 'capture' && <QuickCapture onCapture={handleCapture} onClose={() => setOverlay(null)} />}
    {selected && <NoteReader …existing + pinned/onTogglePin/dailyFolder/onOpenDaily/onRenamed />}
    <StatusBar graph={graph} clusterCount={clusters.clusterCount} onPickVault={…} />
    <Toasts />
    <div className="scanlines" aria-hidden />
    <UpdateToast />
    {booting && <BootSequence graph={graph} clusterCount={clusters.clusterCount} vaultPath={cfg.vaultPath} onDone={() => setBooting(false)} />}
  </div>
)
```

`NoteReader`, palette, capture, Toasts, StatusBar, scanlines persist across modes (a dashboard cold-note row click must open the reader in dashboard mode).

### 2.5 Keyboard contract (single `keydown` listener in App.jsx; handler reads a ref refreshed each render)

| Key | Action |
|---|---|
| `Ctrl+K` | toggle command palette — **in every mode, from day one** (never "focus sidebar search") |
| `Ctrl+D` | open today's daily note |
| `Ctrl+Shift+N` | quick capture |
| `Ctrl+1 / 2 / 3` | mode brain / dashboard / skills |
| `Esc` | ladder: capture → palette → reader → pinned hover. Never exits a mode. |
| in palette | `↑/↓` wrap, `Tab`=down, `Enter` run |
| in capture | `Enter` append + close, `Esc` cancel |

Palette/QuickCapture call `e.stopPropagation()` on their own keydown so internal Esc/Enter wins while focused. Sidebar search input placeholder renamed **`FILTER…`** to disambiguate from the palette.

### 2.6 Z ladder (frozen)

stage 0 · mode content 2 · reader 4 · hovercard 5 · statusbar 10 · palette+capture 30 · toast stack 40 · scanlines 90 · boot 100.

---

## 3. HUD revamp

### 3.1 Design tokens (`:root` additions, index.css — extend, never replace)

```css
--font-mono: "Cascadia Code", ui-monospace, SFMono-Regular, Consolas, monospace;
--ok:   #7bffb0;
--warn: #ffd166;   /* matches RITUALIST branch gold; supersedes HUD draft's #ffd27b and Architecture's --good/--bad names */
--err:  #ff9a9a;
--brk:  rgba(110, 168, 255, 0.22);
--hairline: rgba(255, 255, 255, 0.05);
--ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
```

`--font-mono` is the **only** mono token — no inline mono stacks anywhere (`.dnum`, `.lvl` chrome, kbd all use it). `.glass` gains `box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 48px rgba(0,0,0,0.5)`.

All index.css additions are **append-only banner sections** (`/* ── chrome ── */`, `/* ── dashboard ── */`, `/* ── skills ── */`, `/* ── tools ── */`) — each milestone appends its own block, never edits another's.

### 3.2 Chrome kit — ONE owner (used verbatim by every subsystem; all bespoke variants deleted)

**CSS utilities** (index.css):
- `.u-label` — `font: 500 9px/1.2 var(--font-mono); letter-spacing: .22em; text-transform: uppercase; color: var(--text-faint)`. `.sec-h` restyled to these values so every existing panel header updates for free.
- `.brk` — corner brackets via ONE `::before` painting 8 no-repeat linear-gradients (4 L-corners, inset 5px, `var(--brk)`), leaving `::after` free for consumers. Hover/`.brk-hot` brightens to `rgba(110,168,255,.45)` (note: gradients snap, not fade — accepted). This replaces Dashboard's `.dpanel::before/::after` squares and SkillTree's `.st-frame`.
- `.rule-ticks` — 6px hairline tick ruler (minor tick every 6px / major every 30px via two stacked repeating gradients) under panel headers.
- `.sdot` — 6px pulsing status dot, `breathe 3.2s` keyframe (the single shared breathe keyframe).
- `.rule-progress` — 1px progress rule, accent fill + glow, `transition: width .6s var(--ease-out)`.
- `.panel-in` — entrance `panelIn .24s var(--ease-out)`, stagger via `style={{'--i': idx}}` × 30ms. Replaces Dashboard's `dup`.
- `.num` — `font-family: var(--font-mono); font-variant-numeric: tabular-nums`.
- `[data-tip]` — Dashboard's pure-CSS tooltip promoted **app-wide** (`:hover::after` bubble, `content: attr(data-tip)`, max-width 240px). SkillTree's rich hover card is the only sanctioned exception.
- `.kbd` — mono 9px bordered key chip.

**`src/renderer/components/chrome.jsx`** (~45 lines): `useCountUp(value, dur=600)` (rAF tween, `easeOutCubic` from lib/hud.mjs, snaps under `prefers-reduced-motion`), `Num` (`<span className="num">` with count-up), `Kbd`.

**`src/renderer/lib/hud.mjs`** (pure, tested): `easeOutCubic(t)`, `shortPath(p, max=42)` (middle-ellipsis), `emaFps(prev, deltaMs, alpha=.1)`, `fpsTier(fps)` (`ok≥50 / warn≥30 / err`), `bootLines({path, notes, links, clusters})` → 6 timed POST lines.

**Scanlines** — exactly ONE global layer: `<div className="scanlines" aria-hidden />` mounted once in App (z 90). Static (no animation): SVG-grain data URI + `repeating-linear-gradient(0deg, rgba(255,255,255,.012) 0 1px, transparent 1px 3px)` + edge vignette. Dashboard's per-panel `.scanfx` and SkillTree's backdrop scanlines are **deleted**. Screenshot-verify no moire over WebGL at 1x/1.5x DPI; tune the 3px period if needed.

### 3.3 Boot sequence — `src/renderer/components/BootSequence.jsx`

Replaces the `.empty` "loading vault…" branch — **but App keeps an early return for `graph === null`** rendering BootSequence alone (the main render body dereferences `graph.notes`). Once graph lands, the full app paints underneath the overlay until dissolve.

Timeline (~1.6s, CSS animation-delay driven; component tracks two booleans):
- **0–350ms** — `ONYX` wordmark types in (`typeIn .35s steps(4)`, 46px `--font-mono`, ls .35em, caret border) + one 2px scan sweep.
- **350–1050ms** — POST readout lines from `bootLines(...)`: VAULT (shortPath) / NOTES / LINKS / CLUSTERS / `SYNAPTIC MESH ..... OK` / `RENDER PIPELINE ... OK`. 10px mono, steps(1) pop-in, `OK` in `var(--ok)`, numbers via `<Num>` (400ms count-up).
- **1050–1400ms** — 140px `.rule-progress` fills.
- **Gate** — dissolve only when `elapsed ≥ 1400ms` AND `graph !== null`. Late graph: hold at 92%, `.sdot` pulses beside `INDEXING VAULT…`; on arrival, numbers snap in and dissolve proceeds.
- **Dissolve** — `.boot-out`: opacity→0, `blur(6px)`, `scale(1.02)` over 200ms; `onTransitionEnd → onDone()`.
- Empty vault (`notes.length === 0`): dissolve immediately to the existing "Choose vault folder" state.
- `prefers-reduced-motion`: plain 400ms fade.
- Layout: full-screen `var(--bg)`, grid-centered block wrapped in `.brk` (alpha .35). ONYX_SHOT default 3500ms delay > boot total — no harness change.

### 3.4 Top bar — `src/renderer/components/TopBar.jsx` (replaces inline `<header>`)

Left → right:
1. **Brand** `◑ ONYX` (existing `.brand`). **No version label** (StatusBar owns version). The old `{N} notes · {M} links` span is deleted (StatusBar owns ambient counts).
2. **Mode tabs** (centered): `.mtab` — mono 11px, ls .2em; active gets 2px accent underline with the shared `breathe` glow + inset corner brackets. The underline does not slide; content swaps with `.panel-in` stagger.
   - **The SKILLS tab carries the level**: label renders `SKILLS · LV {level}` with a 1px `.rule-progress` XP underline (`width: levelPct%`) always visible, plus the standard accent underline when active. This IS the skill-tree door — no separate badge widget.
3. Spacer.
4. **`⌕ SEARCH <Kbd>Ctrl K</Kbd>`** ghost-input button, 200px → `setOverlay('palette')`. Direct wiring, no interim.
5. **LENS select** — the demoted ViewSwitcher, brain mode only (§2.1).
6. "Change vault" button deleted (lives in StatusBar).

### 3.5 Status bar — `src/renderer/components/StatusBar.jsx`

Fixed bottom strip, 26px, z 10, `rgba(9,9,11,.75)` + `blur(8px)` + hairline top border, mono 10px ls .1em. **`.hud-body` bottom 12px → 38px; `.update-toast` bottom 20px → 46px.**

Segments (`.sb-seg` with hairline left borders):
1. `.sdot` + `SYS NOMINAL` (flips to `--warn` + `INDEXING` for 800ms on each `onGraphUpdate`).
2. **Vault path button** — `shortPath(vaultPath, 42)`, click → `pickVault` (absorbs the removed top-bar button; `vaultPath` already in `getConfig()`).
3. `<Num {notes}/> N · <Num {links}/> L · <Num {clusters}/> C` — counts animate on watcher pushes.
4. Spacer.
5. **FPS** — StatusBar-owned `useFps` hook: one rAF loop, `emaFps`, writes `ref.current.textContent` + tier class **directly on the DOM node at 2Hz** (no setState per frame), pauses on `document.hidden`. (Architecture's `window.__onyxFps` sampled from BrainView's loop is rejected — that loop is paused in dashboard/skills, freezing the readout exactly when the new screens show.)
6. **Version/update** — `v{version}` from `app:version` IPC; when update `ready`: `v0.3.2 → v0.4.0 READY` in accent, click → `installUpdate()`. Own `onUpdate` listener (channel supports multiple); UpdateToast keeps download progress. 'Later' on the toast does NOT clear this chip (intended).
7. **Clock** — `HH:MM:SS`, 1s interval, 24h, tabular.

### 3.6 Sidebar restructure — `src/renderer/components/Section.jsx` + HudSidebar changes

`Section({ id, title, right, children })`: collapse state in `localStorage('onyx.sec.'+id)` (renderer-only UI state, no IPC); header = `▾/▸` + `.u-label` + right slot, `.rule-ticks` under; body via modern grid collapse (`grid-template-rows: 1fr↔0fr`, .24s); 2px accent left-tick on headers.

HudSidebar becomes: pinned zone (brand + `.sdot`, **`FILTER…`** input, `＋ New note`, `◐ Today` button) then Sections: **PINNED** (pins rows, hidden when empty) · **VITALS** (right: `<Num notes/>`; Gauge + vgrid with `<Num>`) · **FEATURED NODE** · **FILTERS** (right: active-filter count in `--warn`) · **TOP HUBS** · **TASKS** (`TasksPanel limit={8}`, read-only, hidden when zero). Sidebar root gets `.brk`.

**Cockpit** (light): `.cpanel` gets `brk panel-in` + stagger; `.rule-ticks` under headers; `<Num>` values; accepts hoisted `clusters` prop; **MATURITY panel drops its "{N} notes ·" sub-line** (StatusBar owns ambient counts — de-dup rule).

### 3.7 Motion rules (binding)

| Class | Duration | Easing | Budget |
|---|---|---|---|
| Micro (hover/focus) | 120ms | --ease-out | color, opacity, border |
| State (collapse, tab swap, panel-in) | 240ms | --ease-out | opacity, transform, grid-rows |
| Readout (count-up, progress) | 600ms | easeOutCubic | text, width |
| Ambient (breathe) | 3.2–4s | ease-in-out | opacity + box-shadow only |
| Cinematic (boot, stage dim) | 200–450ms | --ease-out | opacity, filter, transform |

**Ambient budget: 3 global chrome animators** (statusbar `.sdot`, sidebar brand `.sdot`, active mode-tab underline) **+ one centerpiece per mode** (brain sim / skill constellation / dashboard gauge-breathe). Text glow only on the dashboard hero gauge value — not every numeral. Never animate layout except boot type-in and section grid-rows. `prefers-reduced-motion` block kills ambients + snaps count-ups.

### 3.8 Blur budget (binding)

One `backdrop-filter` surface per mode: the mode scrim (Dashboard/Skills) or the existing glass HUD (brain). Interior Dashboard/Skills panels are **flat `var(--card)` + `var(--border)` + the `.glass` top-edge highlight inset shadow — NOT full `.glass`**. Since the canvas beneath is frozen, the scrim composites once.

---

## 4. Dashboard (mode `'dashboard'`)

### 4.1 One score: `maturity()` v2 (the knowledgeScore merge)

Dashboard's 5-part `knowledgeScore` **merges into `stats.mjs maturity(notes, now)`** — one 0–100 score, one name ("MATURITY"), read by the Cockpit gauge, the Dashboard hero, and Curator "Immaculate". Same export name/signature; return gains `parts`:

- `structure` = connected/n (degree > 0)
- `density` = min(1, avgDegree/6)
- `freshness` = |{mtime ≥ now−60d}| / n
- `consistency` = min(1, activeDays30/12) — distinct `dayKey(mtime)` in last 30d
- `depth` = min(1, medianWordCount/150)
- `score = round(25·structure + 20·density + 20·freshness + 20·consistency + 15·depth)`, n guarded `|| 1`

`dayKey(ms)` (local `YYYY-MM-DD`) lives in **stats.mjs** and is imported by dashboard.mjs. Recalibrate the Cockpit gauge copy + Curator threshold (≥85) against the real vault during milestone 5.

### 4.2 Snapshot store (in `src/main/appdata.js`, §7)

File `userData/onyx-snapshots.json`, **schema locked before milestone 1** (history cannot be backfilled):

```json
{ "v": 1, "days": [ { "date": "2026-07-07", "notes": 103, "links": 214, "words": 48210, "orphans": 9 } ] }
```

Resolution of the three competing schemas: keep every field computable **inline in main with zero renderer-lib imports** — `notes`/`links` from `cachedGraph.meta`, `words = Σ wordCount`, `orphans = notes.filter(n => !n.inLinks.length && !n.outLinks.length).length`. `clusters` (needs `detectClusters` in the main bundle) and `maturity`/`tasksOpen` (need stats.mjs in main) are dropped — no shipped panel reads them from snapshots.

`recordSnapshot(row)`: upsert-by-date (relaunches/reindexes keep today current), sort asc, cap `slice(-400)`. Call site: inside `reindex()` in `src/main/index.js` after successful `scanVault`, wrapped `try {} catch {}` — covers launch AND every debounced vault-watch reindex, no timers. **Ships in milestone 1** so history accumulates while the rest is built.

### 4.3 `src/renderer/lib/dashboard.mjs` (pure, tested)

1. `activityGrid(notes, now)` → `{ cells, weeks, max, monthLabels }` — 53×7, end = start of today, start = −364d snapped to Sunday; count map by `dayKey(mtime)` (each note counts once, on its last-touch day — labeled honestly). Fixed level thresholds: 0/1/2/3–4/≥5 → lvl 0–4.
2. `mtimeCdf(notes, now, points=52)` — weekly monotonic cumulative count; day-one growth fallback.
3. `growthSeries(snapshotDays, notes, now)` → `{ series, source: 'snapshots'|'mtime' }` — snapshots when `length ≥ 7`, else mtimeCdf. Labels: "BRAIN GROWTH · daily snapshots" / "· by last-touch (snapshot history building…)".
4. `deltas(snapshotDays, current, now)` — baseline = latest record `date ≤ dayKey(now − d·DAY)`; returns `{ d7, d30 }` of `{ notes, links, words }` diffs or null → UI `collecting · day N/7`.
5. `wordStats(notes)` → `{ total, avg, biggest: top 5, tie → id asc }`.
6. `clusterBreakdown(notes, links, clusters)` — takes the **hoisted** clusters result (no second detectClusters run); per cluster `{ ci, size, label: hub title (max degree, tie → smallest id), hubId }`, size desc.
7. `topTags(notes, n=24)` → `[{ tag, count }]` desc then asc. (Percentile size tiers CUT — one chip size + faint `×count` suffix.)
8. `recentNotes(notes, n=8)` + `relAge(ms, now)` (`Nm/Nh/Nd`/date).
9. `linkHealth(graph, clusterOf)` → `{ linksPerNote, connectedPct, orphans, unresolved: meta.unresolvedLinkCount, bridges: bridgeStats(...).count }`.

**Deleted from the original spec:** `knowledgeScore` (merged into maturity, §4.1), `streaks()` (mtime streaks shrink retroactively when old notes are re-edited — Dashboard STREAK reads `streaksFromDays(usage.days)` from skills.mjs, §5.4; the heatmap stays mtime-based with its "by last-touch" label).

**`CLUSTER_PALETTE`** (12 colors) moves from BrainView.js:12 to a named export in `clusters.mjs`; BrainView imports it; all consumers index `% CLUSTER_PALETTE.length`. Brain neurons and dashboard bars share one palette.

### 4.4 Layout & panels — `src/renderer/modes/DashboardMode.jsx` (+ `Heatmap.jsx`)

Absolute overlay z 2, `overflow-y: auto`, scrim `rgba(9,9,11,.62)` + `backdrop-filter: blur(6px)` (the mode's ONE blur surface). `.dash-grid`: 12-col grid, gap 12, max-width 1380, padding `96px 24px 48px`. One `useMemo(..., [graph])`. Panels = `.dpanel` (flat card + `.brk` + `.panel-in` stagger). Small components (`StatTile`, `DeltaChip`, `LineChart`, `BarRow`) inline; only Heatmap is its own file. Big values render via `<Num>` (`.dnum` = 26px `--font-mono` tabular; `.dnum.xl` 40px; glow on the hero gauge value only). Fetch: `getSnapshots()` in an effect keyed `[graph]`.

**Row 1:** **MATURITY** (span 4) — Gauge with new `size` prop (touches r/cx/cy/viewBox/width/height — small real change, budgeted) at 110, + 5 `.bar` sub-bars STRUCTURE/DENSITY/FRESHNESS/CONSISTENCY/DEPTH with `[data-tip]` formulas. **STREAK** (span 3) — giant current-streak from `streaksFromDays(usage.days, now)`, `BEST {best}`, 30-dot strip from `usage.days`, amber "capture today to keep it" when at risk. **TRENDS** (span 5) — NOTES/LINKS/WORDS tiles with 7d + 30d `DeltaChip`s (`--ok`/`--err` tokens), null → `collecting · day N/7`.

**Row 2:** **ACTIVITY · 52 WEEKS** (span 12) — `Heatmap.jsx`: 53×7 CSS grid, 11px cells, `grid-auto-flow: column`, `overflow-x: auto`; levels `rgba(255,255,255,.04)` → accent .22/.42/.68/1 (+glow at 4); month labels; M/W/F rows; `data-tip="3 notes · Jul 4"`; legend `LESS ▢▢▢▢▢ MORE`. Deterministic, no per-cell animation.

**Row 3:** **BRAIN GROWTH** (span 8) — SVG LineChart (`viewBox 0 0 100 40`, `preserveAspectRatio="none"`, polyline + gradient area fill .16→0, 4 tick lines, endpoint dot; current value as HTML mono label, not SVG text); source sub-caption; first/last date microlabels. **CORPUS** (span 4) — total words + avg/note, BIGGEST NOTES top 5 (click → `onSelect`).

**Row 4:** **CLUSTERS · {n}** (span 6) — BarRow per cluster (max 12 + "+N more"): palette swatch, hub label, count, width = size/max; click → `onSelect(hubId)`; header tooltip explains label propagation. **TOP TAGS** (span 6) — single-size chips + `×count`; click → `onFilter({ ...EMPTY, tags: [tag] })` which sets mode back to brain, filtered.

**Row 5:** **RECENTLY TOUCHED** (span 4) — 8 rows + relAge. **NEEDS ATTENTION** (span 4) — `ORPHANS {n}` + top 5 `coldNotes` w/ `{age}d`. **TASKS · {n} OPEN** (span 4) — mounts Tools' `TasksPanel limit={20}` **read-only** (row click opens source note; §6.4). *(LINK HEALTH's 4 micro-tiles fold into NEEDS ATTENTION's footer as a 2×2 micro-grid — same data, one panel fewer, making room for TASKS.)*

Responsive: `@media (max-width:1100px)` → everything span 12 except hero pairs span 6.

---

## 5. Skill tree — "CORTEX" (mode `'skills'`)

### 5.1 Usage store (in `src/main/appdata.js`, §7)

File `userData/onyx-usage.json`:

```json
{ "v": 1, "firstSeen": 1751866000000,
  "counters": { "noteCreate": 4, "search": 25, "view.brain": 30, "vaultEdit": 88 },
  "days": { "2026-07-06": 3, "2026-07-07": 5 },
  "unlockedAt": { "memory-1": 1751866400000 } }
```

**Materialized `currentStreak`/`bestStreak` and 400-day pruning are CUT** — streaks are computed in the pure lib from `usage.days` (a few hundred keys/year, trivial scan), never pruned. One streak source feeds both RITUALIST and the Dashboard STREAK panel.

- `bumpUsage(name, n=1)` — validates `name` against `/^[a-zA-Z][a-zA-Z0-9.]{0,39}$/`, clamps n to 1..100 (trust boundary). Increments `counters[name]`; if `name ∈ ACTIVE_ACTIONS = ['noteCreate','noteEdit','noteRename','vaultEdit']` also increments `days[today]`. **Returns the updated usage object** (App replaces its `usage` state — no polling; this powers live tab badge + unlock diffing). Fire-and-forget `track.mjs` is cut.
- `markUnlocked(ids)` — sets `unlockedAt[id] = Date.now()` for new ids; returns updated usage.
- Writes debounced 500ms (dirty flag), flushed on `app.on('before-quit')`. Crash loses ≤500ms of bumps — accepted.
- **Main-process bump:** one line inside the existing chokidar debounce callback: `bumpUsage('vaultEdit')` — Obsidian edits count toward streaks (the honesty keystone). Onyx-originated writes double-increment `days[today]` via the watcher; harmless (streaks test `> 0`; heatmap reads mtimes, not days).

### 5.2 Canonical counter namespace (FROZEN — camelCase, adopted verbatim by all subsystems)

| counter | bump point (exact) |
|---|---|
| `noteCreate` | `App.handleCreate` after truthy id |
| `noteEdit` | NoteReader save after `writeNote` true |
| `noteRename` / `noteDelete` | NoteReader after success |
| `noteOpen` | App `openNote` wrapper — only when id changes, non-null |
| `search` | sidebar FILTER input, 1000ms debounce after q → non-empty |
| `view.brain` `view.solar` `view.core` `view.globe` `view.constellation` | App `setView` wrapper |
| `hoverPin` | **inside `BrainView._click`'s 240ms setTimeout (fires once per pin)** — NEVER in the hover stream (BrainView emits `{pinned:true}` every frame while pinned) |
| `coldRevisit` | Cockpit cold-note button onClick |
| `bridgeInspect` | Cockpit bridge button onClick |
| `skillsOpen` | `setMode('skills')` |
| `paletteRun` | palette Enter | 
| `captureSave` | QuickCapture submit |
| `dailyOpen` | `openDaily` |
| `pinAdd` | `togglePin` on add |
| `vaultEdit` | main process, chokidar callback |
| `taskComplete`, `aiEnrich`, `ghostAccept`, `aiChat` | **reserved** — bumped by deferred task-toggle and Slice-3 AI features; schema needs no change |

### 5.3 `src/renderer/lib/skills.mjs` (pure, tested)

Imports `detectClusters`, `vaultStats`, `velocity`, `maturity`, `bridgeStats` from existing libs, `hashAngle` from graph.mjs.

**`streaksFromDays(days, now)`** → `{ current, best, activeToday, activeDays }` — pure scan of `usage.days` keys: `activeToday = days[dayKey(now)] > 0`; `current` counts consecutive days back from today (or yesterday if today inactive — GitHub "alive but at risk" semantics); `best` = longest run (dayKey-successor comparison, DST-safe). Exported; consumed by RITUALIST stats AND DashboardMode's STREAK panel.

**`buildSkillStats(graph, usage, now, aiEnabled=false)`** → flat object: `notes, links, orphans, avgLinks, connectedPct, clusterCount, bridges, maturityScore` (the merged v2 score), `totalWords, taggedPct, weeksActive` (velocity weeks > 0), `activeDays, currentStreak, bestStreak` (from streaksFromDays), `distinctViews, minViewVisits` (over the 5 canonical views), `aiEnabled, counters`.

**Skill shape** (fully data-driven): `{ id, branch, tier, name, flavor, parts: [{ label, metric, gte }] }` — `metric` resolves as `stats[metric]` or `stats.counters[x]` when prefixed `counters.`. All comparators `gte`. Per-part progress `min(1, value/gte)`; skill progress = **min** over parts; `predicateMet` = every part.

### 5.4 THE SKILLS — 7 branches, 34 skills

**MEMORY** · volume · #6ea8ff
| T | name | flavor | predicate |
|---|---|---|---|
| 1 | First Light | "Every brain begins as a single spark." | notes ≥ 10 |
| 2 | Engram | "Memories that outlive the moment." | notes ≥ 50 |
| 3 | Lexicon | "Twenty-five thousand words is no longer a notebook. It's a mind." | totalWords ≥ 25 000 |
| 4 | Long-Term Potentiation | "Repetition carves the channel deeper." | notes ≥ 150 |
| 5 | Total Recall | "Nothing captured is ever lost." | notes ≥ 400 AND totalWords ≥ 100 000 |

**ARCHITECT** · links/structure · #c77dff
| 1 | Synapse | "The first connection is the hardest." | links ≥ 25 |
| 2 | Synaptogenesis | "Neurons that fire together wire together." | links ≥ 100 |
| 3 | Synaptogenesis II | "Growth is measured in connections, not neurons." | links ≥ 250 |
| 4 | Dense Wiring | "Density is comprehension." | avgLinks ≥ 6 |
| 5 | Small World | "Any thought, six hops from any other." | links ≥ 500 AND connectedPct ≥ 90 |

**CARTOGRAPHER** · clusters/bridges · #4cc9f0
| 1 | Terra Cognita | "The first regions appear on the map." | clusterCount ≥ 3 |
| 2 | Archipelago | "Islands of thought, each with its own weather." | clusterCount ≥ 8 |
| 3 | Bridge Builder | "An idea living in two worlds is worth two ideas." | bridges ≥ 10 |
| 4 | Trade Routes | "Knowledge flows where bridges stand." | bridges ≥ 25 |
| 5 | Pangea | "Many territories. One continent." | clusterCount ≥ 12 AND bridges ≥ 50 |

**RITUALIST** · consistency · #ffd166 (all from usage.days — day-one streak honestly starts at 1, no mtime backfill; weeksActive is mtime-based so real past Obsidian activity earns Weekly Rite retroactively)
| 1 | Kindling | "Show up. That's the entire trick." | activeDays ≥ 3 |
| 2 | Ember | "Three days makes a habit possible." | bestStreak ≥ 3 |
| 3 | Weekly Rite | "The week is the atom of practice." | weeksActive ≥ 4 |
| 4 | Circadian | "Seven days straight. Now it's biology." | bestStreak ≥ 7 |
| 5 | Monastic | "The practice practices you." | bestStreak ≥ 21 AND activeDays ≥ 60 |

**CURATOR** · hygiene · #7bffb0
| 1 | Groundskeeper | "No thought left stranded." | connectedPct ≥ 85 AND notes ≥ 20 |
| 2 | Taxonomist | "A name is a handle you can pull later." | taggedPct ≥ 50 |
| 3 | Necromancer | "Wake the sleeping notes." | counters.coldRevisit ≥ 10 |
| 4 | Zero Orphans | "Every neuron wired in." | connectedPct ≥ 100 AND notes ≥ 30 |
| 5 | Immaculate | "The gauge doesn't lie." | maturityScore ≥ 85 |

**EXPLORER** · feature usage · #ff9f1c
| 1 | Wayfinder | "Same mind, four angles." | distinctViews ≥ 3 |
| 2 | Deep Search | "Ask the vault, not your memory." | counters.search ≥ 25 |
| 3 | Neuronaut | "Get close to the tissue." | counters.hoverPin ≥ 15 |
| 4 | Shaper | "The vault is written from the inside now." | counters.noteCreate ≥ 10 AND counters.noteEdit ≥ 25 |
| 5 | Omnivore | "Every instrument, mastered." | minViewVisits ≥ 3 AND counters.search ≥ 50 |

**INTELLIGENCE** · LOCKED branch · #f72585, rendered dormant (#565f7d, dashed strokes, lock glyph) until `aiEnabled` (`!!config.apiKey`, always false today). Header: `INTELLIGENCE ── LOCKED · REQUIRES KNOWLEDGE ENGINE`. Hover-card gate copy: **"Requires Knowledge Engine (Claude API key)"** — no roadmap language.
| 1 | Awakening | "The engine opens its eyes." | counters.aiEnrich ≥ 1 |
| 2 | Ghost Synapses | "Accept the links you didn't see." | counters.ghostAccept ≥ 5 |
| 3 | Oracle | "Question the brain; it answers." | counters.aiChat ≥ 25 |
| 4 | Symbiosis | "Two minds, one vault." | counters.aiEnrich ≥ 100 |

**States:** `unlocked = predicateMet && (tier === 1 || previous tier unlocked)`. State ∈ `locked` / `unlockable` (prereq met, predicate not) / `unlocked` / `dormant` (whole INTELLIGENCE branch when `!aiEnabled`). Progress always reported 0–1, even locked ("212 / 250 links").

**Calibration gate (milestone 5):** tier 3–5 thresholds verified against the real ~103-note vault before ship — all live in one SKILLS array.

### 5.5 XP & level

```
xp = 10·notes + 2·links + 25·clusterCount + 15·min(bridges, 50)
   + floor(totalWords/100) + 5·activeDays + 20·bestStreak
   + 2·min(counters.search||0, 200) + 5·(counters.noteCreate||0) + 50·unlockedCount

levelFromXp(xp) = floor(sqrt(xp/100)) + 1     // L2=100, L3=400, L5=1600, L10=8100
xpForLevel(n)   = 100·(n−1)²
levelPct        = (xp − xpForLevel(level)) / (xpForLevel(level+1) − xpForLevel(level))
LEVEL_TITLES = ['SPARK','NOTETAKER','SCRIBE','CHRONICLER','ARCHIVIST','SYNTHESIST',
                'NAVIGATOR','ENGINEER','SAGE','POLYMATH','LUMINARY','ORACLE','SECOND BRAIN']
```

(Titles 7/8 renamed from CARTOGRAPHER/ARCHITECT — they collided with branch names.) XP is recomputed from stats every time — replayable, drift-proof, no event log. Sanity: real vault ≈ 3.0–3.8k XP → level 6–7 day one.

`evaluateSkills(stats)` returns `{ skills: [{...def, unlocked, state, progress, parts:[{label,value,target,done}]}], unlockedCount, totalCount, xp, level, levelPct, title, xpBreakdown }`. This signature is canonical (Architecture's `evalSkills` sketch conforms to it).

### 5.6 Visual — `src/renderer/modes/SkillsMode.jsx`

Full-screen mode content (z 2, **not** an overlay — no ✕, no Esc-close). Backdrop: `rgba(5,6,10,.82)` + `blur(10px)` scrim (the mode's ONE blur surface) + faint center vignette. **No bespoke scanlines** (global layer covers it). Header strip: `CORTEX · SKILL TREE` `.u-label`, XP bar with tick overlay + mono readout `3 412 / 4 900 XP · LV 6 SYNTHESIST · 12/34 UNLOCKED`, framed with shared `.brk`.

**Constellation SVG** — `viewBox="-620 -540 1240 1080"` (geometry fix: the old `-600 -450 1200 900` clipped the −90° INTELLIGENCE spoke and radius-480 labels), no pan/zoom. Deterministic:

```
branchAngle(i) = -90° + i·(360/7)      // INTELLIGENCE at index 0 (top)
angle(skill)   = branchAngle + (hashAngle(skill.id)/2π − .5)·12.6°
radius(skill)  = 95 + (tier−1)·82      // max 423
branch labels  at r = 470 along each spoke
```

- **Core:** r=26 circle at origin — level number (18px mono) + `LV` caption + 24-tick ring (`stroke-dasharray="1 3"`, `stSpin 60s linear`; `transform-box: fill-box; transform-origin: center`).
- **Edges:** quadratic Béziers parent→child. Locked: `rgba(110,168,255,.10)`. Unlocked: branch color .5 + drop-shadow.
- **Edge particles:** **ONE** SVG SMIL `animateMotion` circle per unlocked edge (3s, `begin` offset by `hashAngle`) — trailing twin cut (34 worst-case, not 68). Fallback if SMIL regresses: CSS `offset-path`.
- **Nodes:** locked r=7 card-fill faint stroke · unlockable + halo r=12 `stPulse 2.4s` · unlocked r=9 branch radialGradient + halo glow + mini tick-ring (`stSpin 45s`) · dormant dashed `3 3` #565f7d + lock glyph.
- **Labels:** name 9px ls .08em under node; branch names at r=470 in branch color.
- **Hover card** `.skillcard` (the sanctioned rich exception to `[data-tip]`): name, `BRANCH · TIER III`, italic flavor, per-part `.bar` + mono `212 / 250`, ✓ in branch color; dormant adds the Knowledge Engine line. Cursor-follow, viewport-clamped.

**Unlock moment** (App-level diff effect: `unlocked && !usage.unlockedAt[id]`): (1) expanding ring `stUnlock 700ms` on the node; (2) toast via `bus.emit('toast', ...)` into the shared bottom-right Toasts stack: `◆ SKILL UNLOCKED — Bridge Builder · +50 XP`, 4s; >3 simultaneous (first-run backfill) collapse to `◆ 10 SKILLS UNLOCKED · +500 XP`; (3) `markUnlocked(ids)` fires exactly once per skill. Works even when Skills mode is closed.

Keyframes appended to index.css: `stPulse`, `stSpin`, `stUnlock`. Debug: `__onyxDebug.setMode('skills')` covers screenshots.

---

## 6. Tools

### 6.1 Command palette — `src/renderer/components/CommandPalette.jsx` (Ctrl+K)

**`src/renderer/lib/fuzzy.mjs`** (~45 lines, tested): `fuzzyScore(query, text)` → `{ score, indices } | null` — greedy in-order subsequence; per char: base +1, +8 word-boundary (`" /-_.([#"` or index 0), +6 consecutive, +2 exact case, −0.3×gap; final +4 first-match-at-0, −0.05×length tie-break. `fuzzyFilter(query, items, getText, limit=40)`; empty query → first `limit` at score 0 in caller order. *(ponytail: greedy, not fzf-DP; same signature if ranking ever feels off.)*

**Palette:** props `{ open→via overlay slot, onClose, graph, actions, onSelectNote }`. Note haystack = `` `${title} ${cleanFolder(folder)} ${tags.join(' ')}` ``. Empty query: ACTIONS section + RECENT (mtime desc, 8). With query: top 4 actions + top 12 notes, matched chars in `<mark>` (accent, no bg). Keyboard per §2.5; input autoFocus + onBlur refocus. Veil `rgba(5,6,10,.55)` **z 30** (no blur), `.palette.glass` 560px, top 16vh, list max 48vh. `Kbd` from chrome.jsx (Tools' ad-hoc kbd CSS deleted).

**Actions (exact list):** New note · Open today's daily note (Ctrl+D) · Quick capture (Ctrl+Shift+N) · Pin/Unpin: {title} (when selected) · View: Brain/Solar/Core/Globe/Constellation · Mode: Dashboard / Skills · Toggle synapses / Toggle labels · Clear filters (when filtering) · Reset camera · Change vault…  *(Collection actions cut with collections.)*

**Note select → camera flight:** `onSelectNote(id)` → App: `setSelected(id)` + `setFlyTo({ id, nonce: n+1 })` + close + `bumpUsage('noteOpen')`. BrainView gains the 3-line public method:

```js
focus(id) { const rec = this.byId.get(id); if (rec) this._flyTo(rec.mesh.position) }
```

SpaceCanvas gains prop `focus` (`{id, nonce}`), `useEffect(() => inst.current?.focus?.(focus.id), [focus])` — legacy views no-op via optional chaining.

### 6.2 Daily notes — `src/renderer/lib/daily.mjs` (Ctrl+D)

```js
dailyId(date, folder)          // '06 - Daily Logs/2026-07-07.md' — LOCAL date, zero-padded
isDailyId(id, folder)          // folder regex-escaped + /\d{4}-\d{2}-\d{2}\.md$/
adjacentDailyId(id, delta, folder)  // Date arithmetic, crosses month/year
dailyTemplate(date)            // frontmatter title + `type: daily` (feeds existing type chips) + ## Log / ## Tasks / ## Notes
appendCapture(raw, text, now)  // §6.3
```

**Config default (verified against the real vault): `dailyFolder: '06 - Daily Logs'`** — the vault already contains `06 - Daily Logs/2026-06-29.md` etc., exactly matching `dailyId`'s format. JSON-editable, no settings UI. Existing dailies lack `## Log`; `appendCapture`'s EOF fallback carries them.

**`vault:ensureNote(rel, content)`** — the ONLY new vault-write IPC: `fs.writeFile(abs, content, { flag: 'wx' })`, catch EEXIST → `{ created: false }`; guards `insideVault` + `rel.endsWith('.md')` + `mkdir recursive`. Lives in vault-indexer.mjs.

**openDaily flow (App):** `ensureNote(dailyId(date, cfg.dailyFolder), dailyTemplate(date))` → if created, `setGraph(await getGraph())` → `setSelected(id)` + flyTo + `bumpUsage('dailyOpen')`. (Architecture's createNote variant rejected — collision-suffixes to `2026-07-07 2.md` on stale graph.) Entry points: palette, Ctrl+D, sidebar `◐ Today` button. **NoteReader daily nav:** when `isDailyId(id, dailyFolder)`, `‹ ›` buttons run the same ensure+select for `adjacentDailyId` (past days ensure-create → browsable history; future allowed, matches Obsidian).

### 6.3 Quick capture — `src/renderer/components/QuickCapture.jsx` (Ctrl+Shift+N)

Target: **today's daily note under `## Log`** (not an Inbox — per-capture files are orphans the cockpit would immediately nag). `appendCapture(raw, text, now)`: detect EOL (`\r\n` preserved), bullet `- HH:MM — text`, insert after last non-empty line inside the `## Log` section (section = heading → next `## ` or EOF); no heading → append at EOF with preceding newline. Flow: `ensureNote` → `readNote` → `writeNote(id, appendCapture(...))` → `bumpUsage('captureSave')`; watcher reindexes in ~300ms, no manual refresh. UI: centered glass 440px at 30vh, one borderless input, footer hint `↵ append to 06 - Daily Logs/2026-07-07 · esc cancel`, Enter → fire + ✓ flash 400ms + close. z 30.

### 6.4 Tasks — READ-ONLY this slice

**`src/renderer/lib/tasks.mjs`** ships `parseTasks(raw, noteId)` only: `TASK_RE = /^(\s*)[-*] \[( |x|X)\] (.+)$/` over `raw.split(/\r?\n/)` → `[{ noteId, line, text, done, raw }]` — parsed on **FULL raw including frontmatter** so line numbers match disk (future-proofing the deferred toggle). Plus `openTasks(notes)` — flatten, filter `!done`, sort by source-note mtime desc.

**Indexer:** in `scanVault` where `raw` is in hand: `note.tasks = parseTasks(raw, rel)` (not stripped with `_content`). No `words` field — `wordCount` already exists (vault-indexer.mjs:76). *(Cross-tree import of tasks.mjs from main is fine — electron-vite bundles pure ESM; precedent stands. Don't preemptively create src/shared.)*

**`TasksPanel.jsx`** `{ graph, onSelect, limit }`: header `TASKS · {n} OPEN` (`.u-label`), hidden when zero; rows = ellipsized text + faint source title; **row click → `onSelect(noteId)`** (opens the note — no checkbox this slice). Mounted in HudSidebar (`limit={8}`) and DashboardMode (`limit={20}`).

**`toggleTask` write-back is DEFERRED** (§10) — the content-guarded `toggleTask(raw, line, expectedLine)` algorithm (exact-match relocation, refuse-on-ambiguity, re-read-at-click, CRLF-preserving) is locked as THE design for next slice; `taskComplete` counter reserved. Architecture's unguarded index-only `toggleTask(md, line)` is permanently rejected (vault-corruption path).

### 6.5 Pins

- Storage: `pins: []` in **config.js DEFAULTS** (existing `config:get/set`, zero new IPC). App state `pins`; `togglePin(id)` flips membership, persists whole array, bumps `pinAdd` on add.
- Reader button: `⊙`/`◉` (`.on` accent) in `reader-actions` before ✎.
- Sidebar: **PINNED** Section at top of note lists, `.hubrow` styling, hidden when empty.
- Palette: `Pin/Unpin: {title}` when a note is selected.
- Stale ids: render-time `pins.filter(id => noteById.has(id))`; persisted list pruned only on next user toggle (no auto-writes).
- Rename survival: NoteReader prop `onRenamed(oldId, newId)` → App swaps id in `pins` and `selected` (~4 lines).

### 6.6 Collections — CUT this slice (§10).

---

## 7. Data & IPC additions (complete inventory)

### 7.1 userData files

| file | owner | content |
|---|---|---|
| `onyx-config.json` | existing `config.js` | + `pins: []`, `dailyFolder: '06 - Daily Logs'` in DEFAULTS |
| `onyx-usage.json` | NEW `appdata.js` | `{ v, firstSeen, counters, days, unlockedAt }` (§5.1) |
| `onyx-snapshots.json` | NEW `appdata.js` | `{ v:1, days: [{ date, notes, links, words, orphans }] }` (§4.2) |

**`src/main/appdata.js`** — ONE module (usage.js + snapshots.js merged), config.js style: `loadUsage`, `bumpUsage` (returns usage), `markUnlocked` (returns usage), debounced 500ms flush + `before-quit`; `loadSnapshots`, `recordSnapshot` (upsert-by-date, sort, cap 400, exported pure helper `upsertDay(days, rec, cap)` for tests).

### 7.2 IPC channels — SIX new, exactly one writes to the vault

| channel | handler | preload |
|---|---|---|
| `app:version` | `() => app.getVersion()` | `getVersion()` |
| `usage:get` | `loadUsage()` | `getUsage()` |
| `usage:bump` | `(name, n) => bumpUsage(name, n)` → updated usage | `bumpUsage(name, n)` |
| `usage:markUnlocked` | `(ids) => markUnlocked(ids)` → updated usage | `markUnlocked(ids)` |
| `snapshots:get` | `loadSnapshots().days` | `getSnapshots()` |
| `vault:ensureNote` | create-only `wx` write, insideVault + `.md` guards | `ensureNote(rel, content)` |

`src/main/index.js` also gains: `recordSnapshot` call inside `reindex()` (inline row assembly from `cachedGraph` — **no renderer-lib imports into main**), `bumpUsage('vaultEdit')` in the chokidar debounce, `app.on('before-quit', flush)`.

---

## 8. Complete file map & build order

### NEW files (21)

| file | role |
|---|---|
| `src/main/appdata.js` | usage + snapshots persistence |
| `src/renderer/lib/hud.mjs` | easeOutCubic, shortPath, emaFps, fpsTier, bootLines |
| `src/renderer/lib/bus.mjs` | 10-line emitter |
| `src/renderer/lib/fuzzy.mjs` | palette scorer |
| `src/renderer/lib/daily.mjs` | dailyId/template/appendCapture/adjacent |
| `src/renderer/lib/tasks.mjs` | parseTasks/openTasks (parse-only this slice) |
| `src/renderer/lib/dashboard.mjs` | activityGrid, growthSeries, deltas, etc. |
| `src/renderer/lib/skills.mjs` | SKILLS, buildSkillStats, evaluateSkills, streaksFromDays, XP |
| `src/renderer/components/chrome.jsx` | Num, useCountUp, Kbd |
| `src/renderer/components/BootSequence.jsx` | boot = loading screen |
| `src/renderer/components/StatusBar.jsx` | + local useFps hook |
| `src/renderer/components/TopBar.jsx` | brand, mode tabs (SKILLS·LV), search, LENS |
| `src/renderer/components/Section.jsx` | collapsible sidebar sections |
| `src/renderer/components/HoverLayer.jsx` | bus-fed hover → HoverCard |
| `src/renderer/components/Toasts.jsx` | bus-fed toast queue (bottom-right) |
| `src/renderer/components/CommandPalette.jsx` | Ctrl+K |
| `src/renderer/components/QuickCapture.jsx` | Ctrl+Shift+N |
| `src/renderer/components/TasksPanel.jsx` | read-only task list (sidebar + dashboard) |
| `src/renderer/components/Heatmap.jsx` | 52-week activity grid |
| `src/renderer/modes/DashboardMode.jsx` | dashboard grid (+ inline StatTile/DeltaChip/LineChart/BarRow) |
| `src/renderer/modes/SkillsMode.jsx` | CORTEX constellation + hover card |

Tests: `test/hud.test.mjs`, `test/bus.test.mjs`, `test/fuzzy.test.mjs`, `test/daily.test.mjs`, `test/tasks.test.mjs`, `test/dashboard.test.mjs`, `test/skills.test.mjs` (+ extend `test/indexer.test.mjs`, `test/graph.test.mjs`/stats tests).

### MODIFIED files

| file | change | milestone |
|---|---|---|
| `src/main/config.js` | +`pins`, +`dailyFolder` DEFAULTS | 1 |
| `src/main/vault-indexer.mjs` | `note.tasks`; `ensureNote` export | 1 |
| `src/main/index.js` | 6 IPC handlers, snapshot-on-reindex, vaultEdit bump, before-quit flush | 1 |
| `src/preload/index.js` | 6 methods | 1 |
| `src/renderer/lib/stats.mjs` | maturity() v2 (5 parts), `dayKey` export | 1 |
| `src/renderer/lib/clusters.mjs` | `CLUSTER_PALETTE` named export | 1 |
| `src/renderer/views/BrainView.js` | import palette; `setPaused`; `focus(id)`; `hoverPin` bump in `_click` timeout | 2/4 |
| `src/renderer/views/{SolarSystem,Graph,Core,Globe}View.js` | `setPaused` (~6 lines each) | 2 |
| `src/renderer/views/SpaceCanvas.jsx` | `paused` + `focus` props | 2/4 |
| `src/renderer/views/ViewSwitcher.jsx` | compact LENS restyle | 2 |
| `src/renderer/App.jsx` | **THE one structural edit** (§2.4) in milestone 2; later milestones add one import + one JSX line each | 2 |
| `src/renderer/index.css` | append-only banner sections: tokens/chrome (2), dashboard (3), skills (3), tools (4) | 2–4 |
| `src/renderer/components/HudSidebar.jsx` | Sections, FILTER… rename, Today btn, PINNED, TasksPanel, Num, search bump | 4/5 |
| `src/renderer/components/Cockpit.jsx` | clusters prop, brk/panel-in, drop notes sub-line, coldRevisit/bridgeInspect bumps | 4/5 |
| `src/renderer/components/HudToolbar.jsx` | restyle to chrome kit | 5 |
| `src/renderer/components/NoteReader.jsx` | pin button, daily nav, onRenamed, noteEdit/Rename/Delete bumps | 4 |
| `src/renderer/components/Gauge.jsx` | `size` prop (r/cx/cy/viewBox/width/height) | 3 |
| `package.json` | 0.4.0 | 5 |

### Build order (5 milestones, sequential on App.jsx/index.css hotspots)

1. **Foundation** — appdata.js, all 6 IPC + preload, config DEFAULTS, indexer `tasks` + `ensureNote`, all 8 pure libs, maturity v2, CLUSTER_PALETTE export, all tests. Zero visible UI change; `npm test` green; **snapshots + vaultEdit counters start accumulating immediately**. Silently releasable as 0.3.3.
2. **Chrome** — the ONE App.jsx structural edit (mode/overlay/hotkeys/bus/HoverLayer/hoists/boot mount), TopBar, StatusBar, Toasts, Section, chrome.jsx, BootSequence, scanlines, `setPaused` + `.stage.dimmed`, token/chrome CSS. Dashboard/Skills render `.glass` placeholders.
3. **Modes** — DashboardMode + Heatmap + Gauge size prop; SkillsMode + unlock-diff effect. One import + one JSX line each in App.
4. **Tools** — CommandPalette + flyTo/focus, QuickCapture, openDaily + reader daily nav, pins (reader/sidebar/palette), TasksPanel mounts, counter bump points wired.
5. **Polish + ship** — Cockpit/Sidebar/Toolbar restyle to final chrome, skill-threshold calibration against the real vault, metric de-dup audit, ONYX_SHOT verification of all 3 modes + boot + palette + capture at 1x/1.5x DPI, release **v0.4.0**.

---

## 9. Testing plan (`node --test`, existing `npm test`)

- **hud.test.mjs** — shortPath no-op/ellipsis; emaFps → 60 at 16.7ms; fpsTier boundaries 50/30; bootLines 6 monotonic lines.
- **bus.test.mjs** — on/emit/unsubscribe.
- **fuzzy.test.mjs** — `'dn'` ranks "Daily Note" over "modern"; prefix > boundary > scattered; non-subsequence null; indices correct; empty-query passthrough.
- **daily.test.mjs** — padding; adjacent across month/year; template has `type: daily`; isDailyId rejects non-dates; appendCapture: after existing bullets / empty section / missing heading / **CRLF byte-preservation outside the inserted line**.
- **tasks.test.mjs** — line indices with frontmatter present; `* [ ]`/`- [X]`/nested variants; openTasks sort + filter.
- **dashboard.test.mjs** — activityGrid: same-day counts, `cells.length % 7 === 0`, first dow 0, ≤371 cells, monthLabels strictly increasing; mtimeCdf monotonic ending at n; deltas vs synthetic 10-day snapshots + null when empty; clusterBreakdown two-triangle fixture; topTags/biggest tie determinism; `upsertDay` replace-same-date/sort/cap-400.
- **skills.test.mjs** — buildSkillStats on fixture (2 triangles + bridge + orphan) exact values; empty → 0 unlocked, level 1, progress ∈ [0,1] finite; links=212 → arch-3 ≈ .848 not unlocked, 250 → unlocked; tier gating (predicate met, prereq not → locked, progress 1); AND-skills min-of-parts; **streaksFromDays**: 3 consecutive days → current 3 = best, gap splits best, yesterday-active-today-not → current alive + activeToday false; XP monotonicity; `levelFromXp(xpForLevel(n)) === n` for 1..20; INTELLIGENCE dormant iff `!aiEnabled`.
- **stats (extend)** — maturity v2: all-orphan stale fixture < 25, fully-linked fresh ≥ 85, parts ∈ [0,1], empty → 0 no NaN.
- **indexer.test.mjs (extend)** — notes carry `tasks` with on-disk line numbers; ensureNote creates once / `created:false` second call / throws outside vault.
- **Screenshot harness** — ONYX_SHOT: default delay (post-boot brain), `ONYX_SHOT_DELAY=800` (mid-boot), `__onyxDebug.setMode('dashboard')` and `('skills')` shots; `__onyxDebug.hover` verified through the bus reroute; scanline moire check at 1x/1.5x.

---

## 10. Explicit deferrals

| deferred | why | when |
|---|---|---|
| **Task toggle write-back** (`toggleTask(raw, line, expectedLine)` content-guarded: exact-match relocation, refuse-on-ambiguity/duplicates, re-read-at-click, optimistic pending set, `.stale` flash) | Only surgical line-edit into real vault notes; checkbox-sized wow vs the whole conflict machinery. The spec is locked as-is for next slice; `taskComplete` counter reserved. | next slice |
| **Collections** (saved filter views: config schema, save-inline input, `sameFilter` normalization, palette actions) | Marginal at 103 notes over folder/type/tag chips; fiddliest cross-component UI in the slice. Tools §5 spec preserved. | when vault outgrows chips |
| **INTELLIGENCE branch functionality** (Knowledge Engine, aiEnrich/ghostAccept/aiChat) | No API key exists; branch ships visibly dormant. | Slice 3 |
| SMIL trailing-twin particles; skill-tree wheel-zoom | perf headroom / >5 tiers | if profiling allows / needed |
| Percentile tag tiers, quantile heatmap buckets, DP (fzf-style) fuzzy scorer | imperceptible at this vault size | if ranking/sizing feels off |
| Mode persistence in config | boot dissolve must reveal the live brain | never, probably |
| `vault:getTasks` split IPC; src/shared/ tree | tasks-on-graph fine to ~10k tasks; cross-tree .mjs imports bundle fine | if payload/bundling ever bites |
| Snapshot fields `clusters`/`maturity` | would drag renderer libs into main; nothing renders them | if a trend panel needs them (accept the history gap) |

Known honest limitations (labeled in UI, not fixed): heatmap/growth undercount the past (mtime = last touch only; snapshots fix trends going forward); OneDrive sync can bulk-rewrite mtimes (spikes a heatmap day — labeling only); usage.days double-increments when an Onyx edit fires the watcher (treated as activity weight, not exact counts).

---

## 11. Version + milestones

**v0.4.0** (minor, additive, no breaking changes). Milestones = the 5 build-order phases (§8), each independently shippable and screenshot-verifiable. Milestone 1 is releasable alone as a silent **0.3.3** if the schedule slips — and shipping it early is strictly good: snapshot history and vaultEdit streaks start accumulating the day it lands.
