# Onyx: Living Brain — Phase 1 Design Spec

- **Project:** Onyx — https://github.com/CodySpooner/Onyx
- **Date:** 2026-07-07
- **Status:** Approved direction; spec for user review
- **Author:** Cody + Claude
- **Slice:** Phase 1 of the "AI Second Brain" rework. Later phases: semantic
  search (slice 2, no API key), Knowledge Engine / AI enrichment (slice 3,
  needs Claude API key), chat sidebar (slice 4), agents/skill-tree/dashboards
  (slice 5+).

## Vision context (the rework)

Onyx pivots from "vault visualizer" to **AI Second Brain**: the knowledge
graph is the home experience, organization emerges from link structure rather
than folders, and (in later phases) Claude enriches and rewires the network.
Reference look: neural constellation graphs + the "OMEGA cockpit" screenshots
(full-bleed brain with floating glass instrument panels — themselves an
Electron app).

**Decisions locked with the user:**
1. **Evolve the existing app** (Electron + Vite + React + Three.js). No
   Tauri/Next.js rewrite — the reference look is achievable (and was built)
   on this stack, and we keep the working editor, 4 views, auto-updater, CI.
2. **Local-first now.** User has no Anthropic API key yet. Phase 1 uses zero
   API calls; the design reserves explicit slots (hover-card summary, ghost
   links, cockpit insights) where AI lands later without rework.
3. **Brain becomes the default view.** Existing views (Solar, Core, Globe,
   Constellation) remain in the switcher.

## Phase 1 scope — what ships

1. **BrainView** — a fifth `SpaceView`, the new default and homepage:
   - **Force-directed layout**: notes are neurons positioned by a physics
     sim; linked notes pull together, so clusters ("lobes") emerge from link
     structure. Orphans drift to the periphery.
   - **Alive by construction**: perpetual low-amplitude drift; the graph
     never freezes into a static diagram.
   - **Synapse firing**: light pulses travel along actual link segments —
     continuous random firing across the graph, plus a burst on the hovered
     neuron's links.
   - **Hover** → floating glass preview card. **Click** → focus (camera
     eases toward neuron, incident synapses brighten). **Double-click** →
     open the note reader.
   - Neurons reuse the gem-orb system (shape by `type`, size by degree).
     **Color = cluster** (deterministic palette per community) — in the
     brain, structure beats taxonomy; folder identity stays on the hover
     card and in the legacy views.
   - Labels: existing distance-faded sprites; `labels` toggle respected.
     `links` toggle = all-synapses vs hover-only, as elsewhere.
2. **Cluster engine** — label-propagation community detection over the link
   graph (pure function, no deps). Outputs cluster id per note + cluster
   count (clusters = communities with ≥2 members; singletons report as
   orphans, not clusters).
3. **Cockpit** — OMEGA-style floating glass panels, all computed locally:
   - **Velocity**: 12-week sparkline of notes-touched-per-week (from file
     `mtime`; a note counts in its latest-edit week). Trend % = last 6 weeks
     vs prior 6 weeks, signed.
   - **Cold notes**: untouched > 60 days, oldest first, with age in days.
   - **Clusters**: "98 notes · N clusters".
   - **Bridges**: count of links whose endpoints are in different clusters;
     list of top bridge notes (most cross-cluster links).
   - **Maturity gauge** (0–100): `40 × connectedRatio + 30 × freshRatio +
     30 × min(1, avgDegree/6)`, where connectedRatio = non-orphans/total,
     freshRatio = notes touched ≤60d / total. Shown with sub-bars.
   - **Top hubs** and **orphans** — carried over, restyled.
   - **Next actions**: max 3 rule-based nudges (orphans exist → "link or
     archive N orphans"; oldest cold note → "revisit X — dormant Nd";
     isolated cluster (no bridges) → "bridge cluster X"; velocity trend
     message).
4. **Design-language pass (whole app)**:
   - Tokens: bg `#09090B`, cards `#111216`, borders `rgba(255,255,255,.06)`,
     tiny letter-spaced type, subtle glow accents (CSS variables).
   - Layout: canvas goes **full-bleed**; sidebar/tabs/toolbar/reader become
     **floating glass panels** (backdrop-blur, soft shadow) layered over it.
     All existing views render inside the same shell.
5. **Data model**: indexer adds `mtime` (epoch ms from `fs.stat`) to each
   note. Falls back to frontmatter `updated` (parsed) or scan time if stat
   fails. `VaultGraph` is otherwise unchanged.

## Architecture

```
src/renderer/
  views/BrainView.js       ← the new view (Three.js; consumes sim + clusters)
  lib/force.js             ← pure-JS force sim, no THREE imports   [tested]
  lib/clusters.js          ← label propagation                     [tested]
  lib/stats.js             ← + velocity, cold, bridges, maturity   [tested]
  components/Cockpit.jsx   ← panel column (velocity, cold, bridges,
                             maturity, next actions; reuses Gauge)
  components/HoverCard.jsx ← projected glass preview card
src/main/vault-indexer.mjs ← + mtime via fs.stat                   [tested]
src/renderer/App.jsx       ← default view 'brain'; full-bleed layout
src/renderer/index.css     ← :root tokens + .glass; panel restyle
```

### Force sim (`lib/force.js`)

Custom ~80-line O(n²) simulation — chosen over d3-force-3d because at this
scale (≈100 notes; fine to ~2–3k) pairwise is trivially 60fps, zero deps, and
owning the integrator makes "perpetually alive" motion a one-liner instead of
fighting a library's alpha-decay-to-static behavior.
<!-- ponytail: O(n²) ceiling ~2–3k notes; upgrade path = d3-force-3d (Barnes-Hut) behind the same createSim API -->

- Nodes `{id, x,y,z, vx,vy,vz}`; deterministic initial scatter from
  `hashAngle(id)` (stable across launches).
- Per tick: pairwise repulsion `k/d²` (capped), spring force on links toward
  a rest length, weak centering toward origin, velocity damping ≈0.85,
  positions clamped to a max radius (orphans ring the edge naturally).
- `createSim(nodes, links, opts) → { tick(n), nodes }`. View warms up with
  ~300 synchronous ticks before first paint (no visible churn), then runs
  ~2 ticks/frame. Render-side micro-drift (hash-phased sinusoids) is applied
  to display positions only, never sim state.

### Firing (synapses)

The view maintains one flat `Float32Array` of link segment endpoints,
refreshed each frame from sim positions (same pattern SolarSystemView uses).
That same array is the `LinkPulses` source, so pulses automatically track
moving endpoints. Hover adds a temporary pulse burst on the hovered neuron's
incident links and raises line opacity for those segments.

### Hover card (`HoverCard.jsx`)

React overlay (not a sprite), positioned by projecting the neuron's world
position to screen space each frame while hovered. Content: title, folder,
cluster, ⇄ link counts, age ("edited 3d ago"), first ~200 chars of the body
(via existing `readNote` IPC, cached per session in a Map), and a dimmed
"✦ AI summary — arrives with the Knowledge Engine" slot (phase 3 lands
there). Click pins the card; Esc/click-elsewhere unpins.

## Error handling

| Case | Behavior |
|---|---|
| 0–1 notes / 0 links | Sim no-ops gracefully; orphan ring for linkless vaults; existing empty state unchanged |
| Missing/failed `fs.stat` | `mtime` falls back to frontmatter `updated`, else scan time; velocity/cold degrade gracefully |
| Hover excerpt read fails | Card shows metadata only |
| Huge vault (>2–3k notes) | Known O(n²) ceiling, documented; not a phase-1 target |

## Testing

- `force.js`: after 500 ticks — all coordinates finite, bounded by max
  radius; linked pairs end closer than unlinked ones on a toy graph.
- `clusters.js`: two disjoint triangles → 2 clusters; bridge note joins its
  denser side; singletons excluded from cluster count.
- `stats.js`: velocity bucketing, cold-note threshold, bridge counting,
  maturity formula on fixture data.
- `vault-indexer`: `mtime` present and numeric.
- BrainView + cockpit + glass pass: screenshot-verified (ONYX_SHOT harness).

## Non-goals (phase 1)

Semantic search & embeddings (slice 2 — local, still no key), any Claude API
call, enrichment cache, ghost links (slice 3), chat (slice 4), skill tree /
agents / imports / automations (slice 5+), editor changes (TipTap deferred),
TypeScript migration.

## Roadmap after this slice

1. **Slice 2 — Semantic search (no key):** local embeddings
   (transformers.js MiniLM), cosine search, "fly to thought" search UX.
2. **Slice 3 — Knowledge Engine (key required):** settings panel + key
   storage, per-note enrichment (summary/topics/entities/importance) cached
   local-first, **ghost synapses** (AI-suggested links; accepting writes a
   real `[[wikilink]]` into the markdown), hover-card summary slot fills in.
3. **Slice 4 — Claude chat sidebar** with graph-aware context.
4. **Slice 5+ — RPG layer:** skill tree, agents, dashboards, automations,
   imports.
