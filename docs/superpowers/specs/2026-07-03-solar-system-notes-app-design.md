# Onyx — Solar System Notes (v1 Design Spec)

- **Project:** Onyx — https://github.com/CodySpooner/Onyx
- **Date:** 2026-07-03
- **Status:** Draft for approval
- **Author:** Cody + Claude
- **Slice:** v1 (viewer-first). Full Obsidian replacement is the long-term destination; this is slice 1 of several.

## Goal

A desktop app that reads an existing Obsidian vault off disk and renders it as a
**galaxy of solar systems** — each folder a glowing sun, each note a planet
orbiting it, each wikilink a glowing arc. The user explores the vault visually,
clicks a planet to read the note, and searches/filters to make relevant planets
light up. The point is a visualization that is dramatically more beautiful and
better-organized than Obsidian's built-in graph view.

Editing stays in Obsidian for v1. This app is the read-only "map layer."

## Non-goals (explicitly deferred to later slices)

- Editing / saving notes, live preview (slice 2)
- Plugins, themes, full settings UI
- More than one polished view style (v1 ships the Solar System polished + one
  minimal alternate to prove the switcher; galaxy-spiral / timeline / tag-cluster
  views are later)
- Multi-vault management

## Context: the target vault

Detected default vault: `Xody Bets Website Vault` (esports betting projection
engine project).

- 98 markdown notes
- 14 Johnny-Decimal folders (`00 - Dashboard` … `14 - Results`)
- 694 wikilinks (`[[...]]`)
- Frontmatter present: `title`, `type`, `status`, `tags[]`, `updated`

This is rich enough that folders → clusters, link-count → size, and type/status →
secondary encoding all carry real signal. The design assumes vaults of this rough
scale (low hundreds of notes); larger-vault performance is a noted ceiling, not a
v1 target.

## Architecture

Standard Electron split. The **only** process that touches disk is main.

```
┌─ MAIN (Node) ──────────────┐   IPC     ┌─ RENDERER (React + Vite) ──────┐
│ vault-indexer:             │ ────────► │ ViewSwitcher                   │
│  scan .md → parse          │ VaultGraph │  → SolarSystemView (Three.js)  │
│  frontmatter + wikilinks   │           │  → GraphView (minimal alt)     │
│  → resolve → VaultGraph    │ ◄──────── │ NoteReader · SearchFilter      │
│  chokidar watch (debounced)│  updates  │                                │
└────────────────────────────┘           └────────────────────────────────┘
     owns disk access                          never touches disk
        │
        └─ preload.js: contextBridge exposes a tiny typed IPC surface
           (getGraph, onGraphUpdate, readNote, pickVault, getConfig)
```

Security posture: `nodeIntegration: false`, `contextIsolation: true`. Renderer
gets data only through the preload bridge — it cannot read arbitrary files.

## Data model — the one contract

Everything the renderer draws comes from a single object. Views, reader, and
search all consume it; none of them know about the filesystem.

```jsonc
VaultGraph {
  folders: [
    { id, name, path, color }          // 14 suns; color assigned deterministically per folder
  ],
  notes: [
    { id,                              // stable id = vault-relative path
      path, title, folder,             // folder = owning folder id
      type, status, tags[], updated,   // from frontmatter (best-effort)
      wordCount,
      outLinks[], inLinks[] }          // resolved note ids
  ],
  links: [
    { source, target }                 // resolved wikilinks, note id → note id
  ],
  meta: { vaultPath, noteCount, linkCount, unresolvedLinkCount }
}
```

Rules:
- **id** = vault-relative path (stable across renames-in-place, unique).
- **Wikilink resolution:** `[[Name]]` and `[[Name|alias]]` resolve by matching the
  target note's basename (Obsidian's default). Unresolved links are counted in
  `meta.unresolvedLinkCount` but produce no edge and no ghost node in v1.
- **Best-effort frontmatter:** malformed YAML → note still included, missing
  fields default (`type: null`, `status: null`, `tags: []`).

## Modules & responsibilities

Each has one job and a clear interface.

| Module | Process | Does | Depends on |
|---|---|---|---|
| `vault-indexer.js` | main | scan → parse → resolve → `VaultGraph`; watch & re-emit | fs, chokidar, gray-matter |
| `preload.js` | preload | expose typed IPC surface | electron |
| `ViewSwitcher.jsx` | renderer | mount exactly one active view; pass it the graph + selection callbacks | views |
| `SolarSystemView.js` | renderer | Three.js scene; graph → suns/planets/arcs/effects; hover+click → `onSelectNote` | three, postprocessing |
| `GraphView.js` | renderer | minimal prettified force-graph (switcher proof) | a force layout lib |
| `NoteReader.jsx` | renderer | render selected note's markdown + frontmatter; wikilinks clickable → select | markdown-it |
| `SearchFilter.jsx` | renderer | query + tag/type/folder chips → emits active filter set | — |
| `config.js` | main | persist vault path + encoding toggles (userData json) | fs |

**View interface** (what makes new views cheap):
```
interface SpaceView {
  mount(container, graph, opts)   // opts: { onSelectNote, filter, showAllLinks }
  update(graph)                   // live re-index arrived
  setFilter(filterState)          // dim non-matches, glow matches
  dispose()
}
```

## Solar System view (the flagship)

**Mapping**
- Folder → **sun**: glowing sphere + point light + bloom. Position: 14 suns laid
  out on a loose spiral / ring in the galaxy plane (deterministic, stable).
- Note → **planet** orbiting its folder-sun. Orbit radius & angle derived
  deterministically from the note's index within the folder (stable between
  reloads — planets don't teleport on re-index). Gentle continuous orbital motion.
- **Size** = link-count (in+out), clamped to a sane min/max.
- **Color** = folder (each system reads as one coherent world). Status used as a
  secondary emissive tint / ring accent.

**Wikilinks (default: all-on)**
- All 694 links render at once as curved arcs with **additive blending + low
  opacity**, so density reads as glow rather than spaghetti.
- Hovering or selecting a planet **brightens** its incident arcs and dims the rest.
- A **"calm links" toggle** drops to hover/selection-only for a quieter view.

**Effects**
- Starfield backdrop + subtle nebula (gradient skybox or shader).
- UnrealBloom postprocessing for sun/arc glow.
- Pulsing suns, faint orbit trails, hover-glow on planets.
- **Fly-to camera:** click a sun → tweened camera move into that system; click
  empty space / "back" → tween out to galaxy overview. OrbitControls otherwise.

**Interactions**
- Hover planet → tooltip (title, folder, link-count).
- Click planet → `onSelectNote(id)` → NoteReader opens.
- Click sun → fly into system.

## View switcher + alternate view

`ViewSwitcher` renders a small dropdown/segmented control and mounts one
`SpaceView` at a time, disposing the previous. v1 ships:
1. **Solar System** — the polished flagship above.
2. **Constellation** — a minimal prettified force-directed graph (glowing nodes
   on dark space) over the same `VaultGraph`. Deliberately simple; its only job in
   v1 is to prove switching works and that the view interface is real. Later
   slices add galaxy-spiral, timeline-by-`updated`, and tag-cluster views behind
   the same interface.

## Note reader

- Opens as a side panel when a planet is selected.
- Renders the note's markdown (markdown-it). Frontmatter shown as a header chip
  row (type · status · tags · updated).
- `[[wikilinks]]` in the body render as clickable links that call
  `onSelectNote(target)` → fly-to that planet + swap reader content.
- Read-only in v1. Raw file content fetched on demand via `readNote(id)` IPC (not
  preloaded into the graph, to keep the graph light).

## Search / filter

- Text box: substring match on title (and optionally body — v1: title + tags +
  type for speed).
- Chips: filter by folder, type, status, tag.
- Effect: matching planets glow/scale-up; non-matching dim toward transparent.
  Active filter is pushed to the current view via `setFilter`.

## Config / vault picker

- On first run (or if the saved path is gone): show an empty state with a "Choose
  your vault folder" button → Electron `dialog.showOpenDialog`.
- Default suggested path = the detected `Xody Bets Website Vault`.
- Persist `{ vaultPath, sizeBy, colorBy, showAllLinks }` in userData json.

## Error handling

| Situation | Behavior |
|---|---|
| Vault path missing/empty | Friendly empty state + "Choose folder" |
| Malformed frontmatter | Best-effort parse; note still shows with defaults |
| Unresolved wikilink | No edge drawn; counted in `meta.unresolvedLinkCount` |
| File added/edited/deleted in Obsidian | chokidar (debounced ~300ms) → re-index → `update(graph)`; scene diffs in place, no full reload, no planet teleport |
| Note read fails (deleted mid-session) | Reader shows a soft "note no longer exists" state |

## Performance & ceilings

- 98 planets + 14 suns + 694 arcs is trivial for Three.js; no instancing strictly
  required, but planets/arcs use shared geometry/material where easy.
- **Ceiling (ponytail):** naive full re-index on every change and per-frame arc
  updates are fine at this scale. If a future vault hits several thousand notes,
  upgrade paths are: incremental re-index (diff changed files only) and instanced
  meshes / GPU line batching. Not built in v1.

## Testing

- **`vault-indexer`** is the only logic-heavy unit → one test against a small
  fixture vault asserting: correct node count, wikilink resolution (including
  `[[a|alias]]`), unresolved-link counting, and best-effort parse of a malformed
  frontmatter file. Runnable via `node --test` (no framework).
- **3D / rendering** verified by running the Electron app and screenshotting
  (manual, via the run/verify flow).

## File structure

```
Note App/
  package.json
  vite.config.js
  electron/
    main.js            # BrowserWindow + IPC wiring + owns indexer & config
    preload.js         # contextBridge IPC surface
    vault-indexer.js   # scan + parse + resolve → VaultGraph (+ watch)   [tested]
    config.js          # persist vault path + encoding toggles
  src/
    main.jsx
    App.jsx            # layout: canvas + reader panel + search + switcher
    views/
      ViewSwitcher.jsx
      SolarSystemView.js
      GraphView.js
    components/
      NoteReader.jsx
      SearchFilter.jsx
    lib/
      graph.js         # shared VaultGraph helpers / view interface types
  test/
    fixture-vault/     # tiny vault for indexer test
    indexer.test.mjs
```

## Slice roadmap

- **v1 (this spec):** read vault → Solar System view (all-links glow, fly-to,
  effects) + minimal Constellation alternate → click planet to read (rendered
  markdown, clickable wikilinks) → search/filter → vault picker. Read-only.
- **Slice 2:** editing & saving (markdown editor), then live preview.
- **Slice 3+:** more view styles, settings UI, themes, multi-vault.

## Open questions

None blocking. Encoding defaults (size=link-count, color=folder, show-all-links
on) are chosen and exposed as toggles, so they're cheap to change after seeing it
live.
