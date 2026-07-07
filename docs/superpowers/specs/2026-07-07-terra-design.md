# TERRA Design — ECOSYSTEM world, customization studio, project workspaces

Date: 2026-07-07 · 4-agent design workflow (ecosystem @xhigh, customize @xhigh, workspaces, judge @xhigh). Ships as v0.10.0.

## User brief (verbatim)
> "select through projects… each project should be a new slate" + "eco system tab… npcs and other assets moving around in their own little world with buildings resembling parts of the vault… go all the way" + "user customization for graphs… completely customizable… go all the way" + bigger HUD text + skills pan + fullscreen notes (quick wins, already landed)

## Build order (18 slices, judge-reconciled)
### 1.

W1 Workspaces lib gap-close (pure, tests first): extend the ALREADY-LANDED src/renderer/lib/workspaces.mjs (deriveAutoWorkspaces/noteInWorkspace/scopeGraph/validateWorkspaceUi exist, tests green) with manual-workspace membership union (folders ∪ tags ∪ noteIds), buildWorkspaces(graph, manual), and deterministic pickColor via hashAngle+CLUSTER_PALETTE; extend test/workspaces.test.mjs (cap, dead-id drop, cards/habitEntries identity-pass-through, empty-workspace no-throw). GATE: node --test green (212+).

### 2.

W2 App scope plumbing + indicators: App.jsx wsManual/workspaceId/wsModal state, storeGet('workspaces')/('workspace-ui') boot (names pass verified NAME_RE), ONE scoped=useMemo([graph, activeWs]) identity-when-null, propagation table exactly as proposed (scoped → SpaceCanvas/FolderTabs/HudSidebar/Cockpit/HoverLayer/NotesMode/DashboardMode/CommandPalette/FindReplace/suggestions/triage/stats; FULL graph → NoteReader both mounts, trail, srs/cards, quests/skills XP, the two bottom graph&&graph.notes.length shell guards); StatusBar scope segment reads scoped.meta.scope; deleted-log validation → null + toast. GATE: manual — pick Claude-Projects workspace shrinks brain/notes/dashboard/palette; ALL VAULT restores scoped===graph; suite green.

### 3.

W3 WorkspacePill.jsx + WorkspaceModal + TopBar prop + palette 'Workspace: <name>' actions + ~40 lines CSS. Pill glow when scoped; modal = name/12-swatch/folder+tag checklists via existing folderCounts/tagCounts. GATE: manual — pick/edit/delete/new round-trip, Escape+backdrop close, Ctrl+K lists workspace actions.

### 4.

C1 graph-settings.mjs (pure, tests first): SCHEMA (theme/look/motion/physics rows, liveIn table), 5 PRESETS, DEFAULTS, validateSettings, effective, needsRebuild, resetSection, paletteFor — PRE-REGISTER 'eco' in the known-lens list (10 lenses) so E-slices need zero schema churn; test/graph-settings.test.mjs 9 test groups incl. SCHEMA+preset integrity and needsRebuild matrix. GATE: node --test green.

### 5.

C2 Settings plumbing: App.jsx gset state (null until load), storeGet('graph-custom') validate-on-load, updateGset with 400ms-debounced storeSet + needsRebuild→resetNonce bump, settingsRef mirror updated BEFORE the [view, resetNonce] mount effect; SpaceCanvas settings prop → constructor opts + setSettings?.(settings) effect (verified optional-method pattern). GATE: manual — persist across relaunch, corrupt store boots defaults, bloom drag no remount, preset swap one remount; suite green.

### 6.

C3 Live-apply engine: cinema.js makeComposer returns bloom handle + export applyLook (verified current return lacks bloom); force.mjs exposes opts (+ new force.test.mjs live-retune case incl. one min/max-corner clamp tick); scenery.js makeOrb optional 5th shape arg + makeNebula userData.nebula tag; BrainView full setSettings reference impl (paletteFor reads, sim.opts mutation, this.eff loop reads, label baseScale). GATE: node --test green + manual slider sweep on brain lens at 60fps.

### 7.

C4 CustomizeDrawer.jsx (schema-driven rows) + HudToolbar 'tune' TBtn + ~60 lines styles.css; rebuild-hint '↻' glyph, per-section reset, physics section gated to brain lens. GATE: schema-integrity test enforces renderable types; manual — every slider/preset/reset works, ↻ rows remount, plain rows don't.

### 8.

C5 All-lens coverage: cinema.applyCommonSettings helper; mechanical setSettings + dt*=eff.speed + paletteFor/pulse-count constructor reads across the 8 remaining views — NexusView first (validates instanced path), then Graph/Solar, then Atlas/Stacks/City/Core/Globe. NOTE ArchiveCityView is touched again by E4. GATE: needsRebuild matrix tests + manual 9-lens sweep (bloom+speed live, preset remounts recolored).

### 9.

C6 Theme depth: folderColorIndex in graph-settings.mjs (pure, tested: deterministic under shuffle, %12 wrap, '(root)') + build-path wiring for theme.folderColors and look.gemShape in views. GATE: node --test green + manual folder-color/gem-override remount check.

### 10.

E1 lib/eco.mjs town planner (pure, tests first): archetype regex table vs all 16 real folder names, golden-angle + archipelago relaxation layout, doors/waypoints/Dijkstra nextHop Uint8Array with 255 sentinel, litBucket, diffTown rebuild/relight split. GATE: node --test — exact real-vault archetype mapping, no-overlap invariant 1/2/14/40 folders, nextHop total reachability, determinism deep-equal, diffTown mtime-only→relight.

### 11.

E2 lib/econpc.mjs NPC population + kinematics (pure, tests first): spawnNpcs (couriers<72h cross-district cap 12, librarian iff dueCount>0, wanderers from orphans, citizens fill to clamp(15+n/5,15,40)), advanceNpc zero-alloc with 255-sentinel re-route. GATE: node --test — population bounds 0/105/1000, courier iff cross-district recent link, 10k ticks NaN-free, fixed-seed determinism, 60s sim all citizens pause.

### 12.

E3 Eco lens registration + app bridge: SpaceCanvas VIEWS.eco + dueCount prop effect (verified 'due' at App.jsx:475), ViewSwitcher '⌂ Ecosystem', App palette action + ONE bus.on('eco:filter') effect returning the verified unsubscriber, setFilter({...EMPTY_FILTER, folders:[folderId]}) — ids come from SCOPED graph.folders so workspaces compose correctly. GATE: manual — palette mounts lens, Ctrl+2/Ctrl+1 RAF stop/resume, suite green.

### 13.

E4 EcoView world renderer: ArchiveCityView lifecycle clone, windowTexture moved from ArchiveCityView.js:16 into scenery.js export (net-negative diff), ground canvas map from ecoLayout, 8 archetype recipes merged by litBucket into 3+1 geometries + one Points blinks, invisible colliders, two-line labels, diffTown-driven relight-vs-rebuild, mergeGeometries from three/examples (zero new deps) — AND setSettings via applyCommonSettings FROM BIRTH ('eco' already in C1 schema; no dead sliders on the 10th lens). GATE: manual + __onyxDebug — 14+ distinct silhouettes, renderer.info.render.calls ≤ 40, note edit relights without camera reset, double lens-switch geometry count returns to baseline.

### 14.

E5 EcoView NPC layer: one InstancedMesh(Capsule, 40) DynamicDrawUsage + instanceColor role palette, spawnNpcs on update/relight with citizen continuity on rebuild:false, walk-bob, hover errand sprite (single reusable slot, hover-rate dispose), click opens errand.noteId, setDue respawns librarian slot only. GATE: manual — real courier carries real title between correct districts, graded cards despawn librarian, zero GC sawtooth idle.

### 15.

E6 EcoView interaction: shared raycast (colliders + NPC mesh), hover → onHover(hubNoteId) via existing HoverLayer, single-click → bus 'eco:filter' + door flight, 240ms dbl-click debounce → onSelect(hubNoteId), focus(id) → district flight, setActive rewrites merged color attribute in-place via recorded vertex ranges, setLinksMode gates ambient/citizens only. GATE: manual + __onyxDebug.setFilter — building click lights matching FolderTabs chip, empty-filter restores colors, dbl-click HQ opens hub note, Alt+Left intact.

### 16.

E7 EcoView day/night: 5s-accumulator local clock, sun arc + color/intensity lerps, night-scaled window emissive per litBucket, starfield/nebula/fog lerps, sun+moon sprites — zero per-frame allocation, this._night single source. GATE: manual — system clock 13:00 vs 23:00 renders day/night correctly, no 5s hitch.

### 17.

E8 EcoView ambient life: clouds/birds/fireflies/smoke Points + ticker crawl + agent ring, all gated by ambient toggle where spec'd. GATE: manual — day birds/no fireflies, night inverse, synapses-off stops ambient while couriers persist, total draw calls ≤ 40 in a NIGHT devtools frame capture (worst case: fireflies+lit windows+user bloom 1.5) on the integrated GPU.

### 18.

R1 Release integration gate: full suite green (212 + ~5 new test files), three-feature cross pass — active workspace + non-default preset + eco lens simultaneously (scoped town renders 1-2 districts, eco:filter round-trips through scoped folders, settings live-apply on eco), renderer.info.memory baseline after cycling all 10 lenses twice, then version bump to 0.9.0.

## Cuts
- Workspaces frontmatter 'workspace:' passthrough (proposal slice 4, priority 'could') — 1-hop wikilink closure + manual workspaces express the same thing; add when a real project log wants a whole folder and hand-linking annoys.
- Rewriting the already-landed workspaces.mjs to the proposal's exact API (buildWorkspaces/workspaceMembers as spec'd) — the shipped lib is tested and green; W1 extends it in place instead.
- Arrow-key navigation in the WorkspacePill dropdown — CommandPalette 'Workspace: <name>' actions are the keyboard path.
- Per-note hand-picking UI in WorkspaceModal — noteIds field carried in the data model but not edited; one palette action away when asked.
- 2-hop workspace membership closure — YAGNI at 105 notes.
- Per-lens nebula hue offsets in all-lens customization — uniform preset nebula across lenses.
- Per-type gem-shape mapping matrix UI — single global override + 'auto' covers the expressed want.
- Day/night config knob, geolocation, astronomical sunrise — fixed 6/18 local-time model.
- Custom slider components — native range inputs styled once in styles.css.
- EcoView relight-time litBucket geometry remerge — relight updates labels/lit state/data-driven NPCs only; geometry rebuild reserved for diffTown rebuild:true (quantized-bucket ceiling accepted for correctness and 60fps).
- Persisted drawer collapsed-section state — session-local useState only.

## Risks
- App.jsx is the three-way collision hotspot: workspaces adds scoped-graph state/memo/propagation (W2), customization adds gset state + drawer mount + updateGset (C2/C4), ecosystem adds bus bridge + dueCount prop + palette action (E3). Land strictly in slice order, one slice per commit, rebase between — a bad merge here breaks all three features at once.
- SpaceCanvas.jsx double-touch (C2 settings prop/effect + settingsRef; E3 VIEWS.eco + dueCount effect): both must preserve the [view, resetNonce] remount contract, and settingsRef must be updated BEFORE the remount effect or freshly-mounted lenses (including EcoView) read stale settings.
- scenery.js double-touch (C3 makeOrb 5th arg + makeNebula userData tag; E4 windowTexture import/export move) — shared kit consumed by all 10 lenses; a regression here is app-wide, so both edits need the full lens sweep in their gates.
- ArchiveCityView.js double-touch (C5 setSettings retrofit; E4 windowTexture extraction) — E4 must rebase onto C5's edited file, not the pre-customization version.
- graph-settings.mjs <-> EcoView coupling: the SCHEMA integrity test asserts every liveIn view id is in the known-lens list — 'eco' must be pre-registered in C1 (as ordered) or E4 breaks the suite; conversely EcoView must ship setSettings from birth or eco is the one lens with dead sliders, violating the 'do not halfway do it' brief.
- Workspaces x Ecosystem data flow: scoped graph feeds EcoView.update, so an active workspace can produce a 1-2 district town — eco.mjs no-ring/single-spoke edge cases (E1 tests) are load-bearing for a headline feature combo, not corner polish; eco:filter must only emit folder ids present in the SCOPED graph.folders.
- Double-remount window: a workspace switch (new graph identity) and a rebuild-class setting change (resetNonce) can remount a view twice in quick succession — dispose must be idempotent under this (existing contract says yes); the R1 gate checks renderer.info.memory after the combined pass.
- resetNonce remount replays camera reset + spawn cascade on every preset click; motion.spawn=false must genuinely suppress the cascade (bornAt forced) or preset browsing feels broken — acceptance criterion in C2/C3, not a nice-to-have.
- force.mjs live opts mutation: damping absorbs normal transients, but clamp-range corners (repulsion 2600 + spread 90) mid-flight need the new force test's corner-config tick to prove NaN-free settling before the slider ships.
- OneDrive vault on Windows: store.js atomic temp+renameSync can transiently fail while OneDrive holds the target file — a lost 400ms-debounced settings write is acceptable, but confirm storeSet's failure path returns false rather than throwing into main (verify during C2).
- Integrated-GPU worst case is stacked, not per-feature: eco night scene (fireflies + 3 lit-window buckets) + user bloom at 1.5 + 40 NPCs + per-frame settings multipliers — paper budget holds (~32 draw calls), but E8's gate requires a real devtools frame capture at night with bloom maxed, not the daytime happy path.
- Baseline drift: the brief says 135 tests but the repo is at 212 green (workspaces lib already landed) — all gates must be phrased 'suite green', never a fixed count, and W1 must diff against the shipped lib's API (deriveAutoWorkspaces/noteInWorkspace/scopeGraph/validateWorkspaceUi), not the proposal's.

## Workspaces proposals

### workspaces.mjs — pure workspace model + scopeGraph [must, ~220L]

**Value:** The data spine of 'each project a new slate': derives one workspace per Claude-Projects log automatically, supports user-defined manual workspaces, and produces a filtered graph object shaped exactly like the indexer's output so every existing graph-consuming component scopes for free.

**Design:** NEW FILE src/renderer/lib/workspaces.mjs (pure, no imports beyond clusters.mjs + graph.mjs). DATA MODEL: Workspace = { id, kind:'auto'|'manual', name, color, sourceId?(auto: project-log noteId), folders:[folderId], tags:[tag], noteIds:[noteId] }. Auto workspaces carry empty folders/tags and computed noteIds; manual carry user picks. --- API: (1) `pickColor(id)` = `CLUSTER_PALETTE[Math.floor(hashAngle(id) / (Math.PI*2) * CLUSTER_PALETTE.length)]` — reuses hashAngle FNV from graph.mjs + CLUSTER_PALETTE from clusters.mjs, deterministic across sessions, zero new hash code. (2) `deriveAutoWorkspaces(graph, { cap = 300 } = {})` → Workspace[]: filter notes with the exact collectProjects predicate (n.projectLog && !basename.startsWith('_')) — do NOT import projects.mjs collectProjects because it sorts by mtime; sort here by title for stable dropdown order. For each log note L: members = [L.id, ...L.outLinks, ...L.inLinks] deduped via Set, sliced to cap (cap protects against a hub-like log; 300 » the 105-note vault, it's a guard not a tuning knob). id = 'auto:'+L.id, name = L.title, color = pickColor(id), noteIds = [...set]. Membership rule doubles as the UX contract: wikilink a note into (or from) the project log to add it to that workspace. (3) `workspaceMembers(graph, ws)` → Set<noteId>: auto → new Set(ws.noteIds ∩ live ids); manual → union of {n.id : n.folder ∈ ws.folders} ∪ {n.id : n.tags ∩ ws.tags ≠ ∅} ∪ (ws.noteIds ∩ live ids). Always intersected with live note ids so stale stored ids never leak. (4) `scopeGraph(graph, ws)` → { ...graph, notes: members only, links: links.filter(both source AND target ∈ members), folders: graph.folders.filter(f => some member note has n.folder===f.id) (original folder objects kept — colors stay stable), suggestions: (graph.suggestions||[]).filter(s => members.has(s.a) && members.has(s.b)), unresolved: graph.unresolved.filter(u => members.has(u.in)), meta: { ...graph.meta, noteCount, linkCount, unresolvedLinkCount recomputed, scope: { id: ws.id, name: ws.name, color: ws.color } } }. cards and habitEntries pass through UNCHANGED — SRS reviews are time-critical and habits are personal, hiding either behind a project scope loses data-integrity-adjacent signal (comment in code says exactly this). Not memoized inside the lib — App's useMemo([graph, activeWs]) IS the memo; pure fn stays trivially testable. (5) `buildWorkspaces(graph, manual = [])` → [...deriveAutoWorkspaces(graph), ...manual.filter(w => w && typeof w.id==='string' && w.name).map(w => ({ kind:'manual', folders:[], tags:[], noteIds:[], color: pickColor(w.id), ...w }))] — auto first, manual after; a manual ws whose folders/tags all died still lists (renders as empty scope, user edits or deletes it). (6) `validateWorkspaceUi(stored, workspaces)` → { activeId: workspaces.some(w=>w.id===stored?.activeId) ? stored.activeId : null } — the deleted-project-log case: auto ws vanishes from buildWorkspaces, validate returns null, App falls back to ALL VAULT (mirrors validateNotesUi pattern in notesmode.mjs). --- ALGORITHM COMPLEXITY: everything O(notes+links) per call, runs once per (graph, activeWs) change via useMemo — zero per-frame cost, integrated-GPU budget untouched. --- SKIPPED (say-so lines): frontmatter 'workspace:' key on logs — needs indexer passthrough of arbitrary frontmatter; 1-hop link closure + manual workspaces cover membership today; add a `data.workspace` passthrough in vault-indexer.mjs only if users ask for folder-level auto membership. 2-hop closure — YAGNI at 105 notes. --- TESTS test/workspaces.test.mjs (node --test, fixture graph built inline like graph.test.mjs): [a] deriveAutoWorkspaces finds logs, skips _AGENT.md, name=title, members = log + out + in links deduped; [b] cap slices; [c] deterministic color for same id across calls; [d] manual membership = folder ∪ tag ∪ noteIds, dead noteIds dropped; [e] scopeGraph drops links with one endpoint outside, keeps both-in; folders filtered to inhabited; suggestions/unresolved filtered; cards/habitEntries identity-equal (===) to input; meta counts recomputed + meta.scope set; [f] empty workspace → notes:[], links:[], meta.noteCount 0 (no throw); [g] validateWorkspaceUi: live id kept, dead id → null, garbage input → null; [h] buildWorkspaces tolerates null/garbage manual entries.

**Files:** src/renderer/lib/workspaces.mjs, test/workspaces.test.mjs

**Tests:** node --test test/workspaces.test.mjs — all 8 test groups green; existing 135 tests untouched and green.

### Workspace pill switcher + manual-workspace editor modal [must, ~210L]

**Value:** The 'select through projects' surface: one pill in the TopBar shows the active workspace (color + name), a dropdown lists auto project workspaces and manual ones, '+ New workspace' opens a minimal editor. Selecting a workspace is the single gesture that swaps the whole app onto a new slate.

**Design:** NEW FILE src/renderer/components/WorkspacePill.jsx — two components, house chrome kit only. (1) `WorkspacePill({ workspaces, active, onPick, onNew, onEdit, onDelete })`: rendered in TopBar between the spacer and the SEARCH button (spec: left of search). Closed state: <button className='wspill'> with a 6px color dot (background: active?.color || 'transparent'; border when null) + label (active?.name?.toUpperCase() || 'ALL VAULT') + '▾'. When active, pill gets class 'on' and inline boxShadow `0 0 10px ${active.color}55` — the glow that answers 'why are notes missing'. Open state (local useState, closes on pick / Escape / click-outside via a fixed full-screen backdrop div — same overlay pattern as CommandPalette but inline-anchored): absolutely-positioned panel under the pill listing: row 'ALL VAULT' (check glyph when active==null); divider 'PROJECTS' → auto workspaces each as [colordot, name, note-count from ws.noteIds.length]; divider 'CUSTOM' (only if any) → manual workspaces with the same row PLUS two hover-revealed glyph buttons: ✎ → onEdit(ws), × → onDelete(ws.id) with window.confirm (matches the app's existing confirm idiom); footer row '+ NEW WORKSPACE' → onNew(). Count for manual rows: computed by the parent via workspaceMembers and passed pre-counted in a `counts` map prop — pill stays dumb. Keyboard: Escape closes; no arrow-nav in v1 (skipped: palette already gives keyboard access — see actions below). (2) `WorkspaceModal({ graph, initial, onSave, onClose })` — the manual editor, same overlay chrome as QuickCapture: name <input> (required, trimmed), color swatch row = 12 CLUSTER_PALETTE buttons (selected ring), two scrollable checklist columns: FOLDERS = graph.folders (checkbox per folder id, count via folderCounts from notesmode.mjs) and TAGS = tagCounts(graph.notes) (checkbox per tag, count shown) — both existing helpers, no new logic. Save → onSave({ id: initial?.id || 'ws-'+Date.now().toString(36), kind:'manual', name, color, folders, tags, noteIds: initial?.noteIds || [] }). noteIds is carried but NOT edited in the modal — skipped: per-note hand-picking; the field exists so a later 'add note to workspace' palette action costs one line, add when someone asks. Empty selection allowed (empty workspace is legal; app's empty states already handle 0 notes). (3) CommandPalette actions added in App: 'Workspace: ALL VAULT' + one 'Workspace: <name>' action per workspace (hint 'scope') + 'New workspace…' — this is the keyboard path and makes the pill's lack of arrow-nav a non-issue. (4) CSS in index.css: .wspill, .wspill.on, .ws-drop, .ws-row, .ws-dot, .ws-modal-cols (~40 lines, reuses existing .u-label/.tip-below/overlay tokens). TopBar diff: add `workspacePill` prop rendered as-is (TopBar stays presentational; all state lives in App) — 3 lines.

**Files:** src/renderer/components/WorkspacePill.jsx, src/renderer/components/TopBar.jsx, src/renderer/index.css

**Tests:** Manual + __onyxDebug: open dropdown, pick an auto project workspace → pill shows its color+name and glows; edit/delete round-trips a manual workspace; '+ New workspace' with 1 folder + 1 tag checked saves and appears in the list; Escape and backdrop click close both surfaces; Ctrl+K palette lists 'Workspace: <name>' actions.

### App scope plumbing — scopedGraph everywhere + persistence + statusbar indicator [must, ~75L]

**Value:** The actual new slate: when a workspace is active, brain lenses, NOTES mode, all 5 DASHBOARD pages, palette search, find&replace, suggestions and triage all compute over the subgraph — notes from other projects simply do not exist anywhere on screen, with two always-visible indicators so it never reads as data loss.

**Design:** App.jsx diff (~55 lines), zero changes inside any view/mode component — they already take graph as a prop. STATE: `const [wsManual, setWsManual] = useState([])`, `const [workspaceId, setWorkspaceId] = useState(null)`, `const [wsModal, setWsModal] = useState(null)` (null | {initial}). BOOT (in the existing storeGet effect): `storeGet('workspaces').then(w => setWsManual(Array.isArray(w?.list) ? w.list : []))`; `storeGet('workspace-ui').then(u => setWorkspaceUiRaw(u))` — raw held until graph arrives. DERIVE: `const workspaces = useMemo(() => graph ? buildWorkspaces(graph, wsManual) : [], [graph, wsManual])`; validation effect on [workspaces]: if workspaceId (or the raw boot value, applied once) fails validateWorkspaceUi → setWorkspaceId(null) + toast '◆ workspace gone — back to ALL VAULT' (covers deleted project log mid-session AND stale store at boot). `const activeWs = workspaces.find(w => w.id === workspaceId) || null`; `const scoped = useMemo(() => activeWs ? scopeGraph(graph, activeWs) : graph, [graph, activeWs])` — the ONE memo; when null it is identity (===graph), so ALL VAULT has literally zero new work per render. ACTIONS: `pickWorkspace(id)` = setWorkspaceId(id) + storeSet('workspace-ui', { activeId: id }) — no dirty guard needed (reader overlay is untouched; mode does not change); `saveWorkspace(ws)` = setWsManual(upsert by id) + storeSet('workspaces', { list: next }) + pickWorkspace(ws.id); `deleteWorkspace(id)` = filter + storeSet + (workspaceId===id → pickWorkspace(null)). PROPAGATION — replace `graph` with `scoped` at exactly these App.jsx sites: stats useMemo, clusters useMemo, activeIds/filtering/featured block, SpaceCanvas graph prop, FolderTabs, HudSidebar, Cockpit, HoverLayer, NotesMode graph prop, DashboardMode graph prop, CommandPalette graph prop (palette note search scoped), FindReplaceModal graph prop (scoped = fewer accidental cross-project replacements; escape below), suggestions useMemo source becomes `scoped.suggestions` (already endpoint-filtered by scopeGraph), openTriage uses scoped.notes, templateFolder/templates from scoped. DECISION (per spec prompt): suggestions/triage are SCOPED; the vault-wide escape is the pill itself — one click to ALL VAULT, zero extra UI. KEEP FULL graph at: NoteReader graph prop in BOTH mounts and readerProps (backlinks/links must resolve vault-wide — trail can open an out-of-scope note and the reader must not lie), handleRenamed, trail pruning effect, resume-toast effect, srs stamping (graph.cards — scopeGraph passes cards through anyway), quests/skills pipeline: graphSkillStats stays on FULL graph (XP is a vault-wide game; scoping it would yo-yo levels when switching projects — comment says so). due/dueCards from graph.cards (unscoped by construction). EDGE CASES: selected note outside scope → reader overlay stays open (it is vault-wide chrome), brain canvas simply has no node for it — same code path as a note deleted mid-session, already survived by every view; flyTo to a missing id is a no-op in views. Empty workspace → scoped.notes=[] but graph.notes.length>0 so the app shell does NOT fall into the 'No notes found' branch (that branch checks `graph`, unchanged — verify the two graph&&graph.notes.length guards at the bottom of App.jsx keep using FULL graph). Workspace notes in 2+ workspaces: fine, scopes are views not moves. INDICATORS: (1) pill glow (feature 2); (2) StatusBar: new prop `scope={scoped.meta.scope || null}`, rendered as a segment right after the N·L·C counts: `<span className='sb-seg' style={{color: scope.color}}>◈ SCOPE: {scope.name}</span>` when non-null (~6 lines in StatusBar.jsx) — N·L·C themselves already show scoped counts since they read graph?.meta of the scoped prop... NOTE: StatusBar currently receives full graph for the INDEXING flash; pass `scoped` instead — meta counts then reflect the slate (desired) and the indexing flash still fires because scoped is a new object per reindex. PERF BUDGET: scopeGraph O(n+m) once per switch/reindex (~105 notes → sub-ms); SpaceCanvas sees a new graph object and rebuilds the view exactly like a reindex does today — existing dispose paths cover it; no per-frame work added. MOUNT: WorkspacePill wired into TopBar via the new prop; WorkspaceModal rendered when wsModal!=null.

**Files:** src/renderer/App.jsx, src/renderer/components/StatusBar.jsx, src/renderer/components/TopBar.jsx

**Tests:** With the real vault: pick a Claude-Projects workspace → brain shows only the log + its linked notes, NOTES list shrinks, DASHBOARD overview/analytics/health counts drop to the subgraph, statusbar reads '◈ SCOPE: <name>' with scoped N·L·C, Ctrl+K search only finds scoped notes; switch to ALL VAULT → identity graph restored (verify scoped===graph via __onyxDebug); delete the project log file on disk → reindex fires toast and pill returns to ALL VAULT; 135+new tests green.

### Frontmatter 'workspace:' passthrough for declared folders/tags on project logs [could, ~25L]

**Value:** Lets a project log declare `workspace: { folders: [...], tags: [...] }` in frontmatter so auto workspaces can pull whole folders without hand-linking every note.

**Design:** vault-indexer.mjs: add `...(data.workspace ? { wsDecl: data.workspace } : {})` to the note object (one line, next to the projectLog spread). workspaces.mjs deriveAutoWorkspaces: if L.wsDecl, merge normalized wsDecl.folders/wsDecl.tags into the workspace's folders/tags arrays (strings only, capped 20 each) and workspaceMembers already unions folder/tag membership for any ws — the auto/manual member logic converges into one path. Test: fixture note with wsDecl → members include folder notes. SKIPPED in v1 because 1-hop wikilink closure + manual workspaces already express the same thing; add when a real log wants a whole folder and hand-linking annoys.

**Files:** src/main/vault-indexer.mjs, src/renderer/lib/workspaces.mjs, test/workspaces.test.mjs

**Tests:** Fixture-vault log with `workspace: {folders: ['02 - Research']}` frontmatter → deriveAutoWorkspaces members include every note in that folder; node --test green.


## Customization proposals

### graph-settings.mjs — typed settings schema, presets, validation (pure, tested) [must, ~340L]

**Value:** Single source of truth for every customization knob: what exists, its range, its default, which lenses can apply it live vs needing a rebuild. Everything downstream (drawer UI, App plumbing, views) is generated from this table, so adding a knob later is one schema row.

**Design:** NEW FILE src/renderer/lib/graph-settings.mjs (pure ESM, zero imports — node --test friendly).

DATA MODEL — export const SCHEMA = [ { key, section, label, type, min, max, step, def, options?, liveIn } ] where liveIn is '*' (live in every lens), array of view ids (live there, rebuild elsewhere), or [] (always rebuild). Exact rows:

THEME section:
- theme.preset | enum | options ['onyx','ember','ice','synthwave','mono'] | def 'onyx' | liveIn []
- theme.folderColors | bool | def false | liveIn []  (color by folder index instead of cluster)
- theme.nebulaDim | range 0.2–1.5 step 0.05 | def 1 | liveIn '*'  (multiplies nebula MeshBasicMaterial.color scalar — dims/brightens backdrop live)

LOOK section:
- look.bloom | range 0–1.5 step 0.05 | def 0.65 | liveIn '*' (UnrealBloomPass.strength)
- look.bloomThreshold | range 0–1 step 0.05 | def 0.3 | liveIn '*' (pass.threshold)
- look.exposure | range 0.5–1.4 step 0.05 | def 0.85 | liveIn '*' (renderer.toneMappingExposure)
- look.grain | range 0–0.05 step 0.002 | def 0.012 | liveIn '*' (grade.uniforms.grain)
- look.vignette | range 0–0.6 step 0.02 | def 0.28 | liveIn '*' (grade.uniforms.vig)
- look.chroma | range 0–0.003 step 0.0001 | def 0.0009 | liveIn '*' (grade.uniforms.chroma)
- look.nodeSize | range 0.5–2 step 0.05 | def 1 | liveIn ['brain'] (multiplies baseSize in the per-frame scale line; instanced/static lenses rebuild)
- look.linkOpacity | range 0–0.5 step 0.02 | def 0.1 | liveIn '*' (lines LineBasicMaterial.opacity where the view has this.lines)
- look.labelSize | range 0.5–2 step 0.05 | def 1 | liveIn ['brain'] (multiply sprite base scale; label records keep baseScaleX/Y at build)
- look.labelFade | range 0.4–2 step 0.1 | def 1 | liveIn ['brain'] (multiplies the 230-unit fade distance in the label loop)
- look.gemShape | enum | options ['auto','sphere','ico','octa','dodeca','tetra'] | def 'auto' | liveIn [] (passed to makeOrb as shape override; 'auto' = current shapeFor(type))

MOTION section:
- motion.speed | range 0–2 step 0.1 | def 1 | liveIn '*' (views scale dt: dt *= eff.speed — pulses, drift, plasma time, spin all follow)
- motion.pulses | range 0–2 step 0.25 | def 1 | liveIn [] (multiplies LinkPulses count arg at build — buffer sized at construction)
- motion.spin | bool | def true | liveIn ['brain'] (gate the rotation increments)
- motion.spawn | bool | def true | liveIn [] (false → bornAt forced to _t-1 so spawnK=1, no cascade replay)
- motion.reduced | bool | def false | liveIn '*' (master switch, see effective())

PHYSICS section (brain lens only — createSim opts):
- physics.repulsion | range 200–2600 step 50 | def 900 | liveIn ['brain'] (sim.opts.repulsion)
- physics.linkLength | range 10–70 step 1 | def 27 | liveIn ['brain'] (sim.opts.restLen)
- physics.spread | range 90–260 step 5 | def 165 | liveIn ['brain'] (sim.opts.maxRadius)
- physics.gravity | range 0.0005–0.005 step 0.0001 | def 0.0016 | liveIn ['brain'] (sim.opts.center)

PRESETS — export const PRESETS = { id: { name, clusters[12], nebula[2], link, pulse, orphan } }:
- onyx: clusters = current CLUSTER_PALETTE ['#7fd4ff','#c77dff','#7bffb0','#ffd166','#ff7b9c','#4cc9f0','#bdb2ff','#80ed99','#ff9f1c','#f72585','#9bf6ff','#fdffb6'], nebula ['#1c1442','#0a1a3c'], link '#86b8ff', pulse '#bfe0ff', orphan '#4a5470'
- ember: clusters ['#ffb35e','#ff7b45','#ff4f4f','#ffd166','#ff9f1c','#e85d75','#ffc971','#ff6b35','#f4a259','#d1495b','#ff8c61','#ffe3b3'], nebula ['#3a1414','#241028'], link '#ff9f6e', pulse '#ffd9b0', orphan '#5c4a42'
- ice: clusters ['#9bf6ff','#7fd4ff','#4cc9f0','#bde0fe','#a2d2ff','#8ecae6','#73d2de','#caf0f8','#90e0ef','#48bfe3','#b8f2ff','#dff6ff'], nebula ['#0a2038','#101a4a'], link '#9fd8ff', pulse '#e0f7ff', orphan '#3e4a5c'
- synthwave: clusters ['#ff2fd6','#00f0ff','#c77dff','#ff6ec7','#7b2fff','#00ffc8','#ff9de2','#4d5bff','#ff477e','#39ddff','#b967ff','#05ffa1'], nebula ['#2b0a4d','#3d0a3d'], link '#ff6ec7', pulse '#9dfcff', orphan '#4a3a5e'
- mono: clusters ['#e8ecf5','#aeb6c8','#7d8698','#5a6272','#cfd6e4','#98a1b3','#6e7789','#c2c9d8','#868fa1','#dfe4ee','#a4adbf','#737c8e'], nebula ['#14161f','#0c0e16'], link '#aab4c8', pulse '#ffffff', orphan '#3a3f4a'

FUNCTIONS:
- DEFAULTS = Object.fromEntries(SCHEMA.map(s=>[s.key,s.def])) (exported frozen)
- validateSettings(raw) → full settings object: start from DEFAULTS; for each SCHEMA row, if raw has the key: range → Number(), non-finite → def, clamp [min,max]; bool → !!; enum → options.includes(v) ? v : def. Unknown raw keys dropped. Never throws. null/undefined/non-object raw → {...DEFAULTS}.
- effective(s) → derived copy for render loops: if motion.reduced → speed=0.15 (not 0: frozen pulses look broken), spin=false, pulses treated as 0 by views, spawn=false. Pure; views call once per setSettings, not per frame.
- needsRebuild(prev, next, viewId) → SCHEMA.some(row => prev[row.key]!==next[row.key] && row.liveIn!=='*' && !row.liveIn.includes(viewId))
- resetSection(s, section) → {...s, ...defaults of that section}
- paletteFor(s) → PRESETS[s['theme.preset']] || PRESETS.onyx (views call this instead of importing CLUSTER_PALETTE directly for orb/nebula/link/pulse colors)

EDGE CASES: store file corrupt/half-written → storeGet returns junk → validateSettings coerces to defaults, app never crashes on load. Preset id removed in a future version → enum coercion falls back to 'onyx'.

PERF: schema scan is ~25 rows; validate/needsRebuild are O(25) — nothing hot.

**Files:** C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/graph-settings.mjs, C:/Users/Xody2/OneDrive/Desktop/Note App/test/graph-settings.test.mjs

**Tests:** test/graph-settings.test.mjs (node --test): (1) validateSettings clamps out-of-range numbers to min/max, (2) drops unknown keys, (3) fills missing keys with defaults and never throws on null/garbage/string input, (4) validate(DEFAULTS) deep-equals DEFAULTS (idempotent), (5) SCHEMA integrity — every def within [min,max], keys unique, every liveIn view id in the known 9-lens list, (6) preset integrity — all 5 presets have exactly 12 cluster hexes + 2 nebula + link/pulse/orphan, all matching /^#[0-9a-f]{6}$/i, (7) needsRebuild false for look.bloom change in 'brain', true for motion.pulses change anywhere, true for look.nodeSize change in 'atlas' but false in 'brain', (8) effective() with reduced=true forces spin false and speed 0.15, (9) resetSection('physics') restores only physics.* keys.

### Settings plumbing — App state, store 'graph-custom' persistence, SpaceCanvas settings prop + rebuild routing [must, ~55L]

**Value:** One state object, one persisted store, one delivery path into all 9 lenses. Reuses the exact resetNonce remount mechanism SpaceCanvas already has, so rebuild-class settings need zero new view code to take effect.

**Design:** APP STATE (App.jsx): const [gset, setGset] = useState(null) — null until load, so views never see half-state. Boot effect (join the existing storeGet batch at line ~93): window.onyx.storeGet?.('graph-custom').then(s => setGset(validateSettings(s))). Name 'graph-custom' passes store.js NAME_RE — no main-process changes needed at all; generic store:get/set already exists in preload.

UPDATE PATH: const updateGset = (patch) => { const next = validateSettings({ ...gset, ...patch }); if (needsRebuild(gset, next, view)) setResetNonce(n => n + 1); setGset(next); gsetSaveTimer: clearTimeout + setTimeout(() => window.onyx.storeSet?.('graph-custom', next), 400) } — debounce via a useRef timer because range-input drags fire per pixel; storeSet is atomic temp+rename so a mid-drag app kill loses at most 400ms of tweaks. resetGset(section?) = updateGset(section ? resetSection(gset, section) : { ...DEFAULTS }).

DELIVERY: SpaceCanvas gains prop settings. (a) Pass into constructor options: new View(ref.current, { onSelect, onHover, settings: settingsRef.current }) — views read build-time values (palette, pulse count, gem shape, folder colors) synchronously at mount, including after a rebuild bump. Keep a useRef mirror updated before the [view, resetNonce] effect so the remount always sees the latest object. (b) New effect: useEffect(() => { inst.current?.setSettings?.(settings) }, [settings]) — exact same optional-method pattern as setLabels?./setPaused?.. Views without setSettings are safely inert for live keys (needsRebuild governs whether they got remounted instead).

WIRING IN App.jsx render: <SpaceCanvas ... settings={gset} />. Also pass gset + updateGset + view into the drawer (feature 4). Gate: if gset is null, pass undefined — views fall back to DEFAULTS internally (every read is s?.['key'] ?? DEFAULTS['key'] via a small getter views get from graph-settings.mjs: val(s, key)).

EDGE CASES: settings change while mode !== 'brain' (canvas paused) — setSettings still lands, uniforms mutate, next rendered frame is correct; rebuild bump while paused just remounts once, acceptable. Vault switch/graph update does not touch gset (settings are vault-independent by design — global look preferences). resetNonce bump also resets camera (existing behavior) — acceptable and arguably correct for palette swaps; documented in drawer with the cascade-replay being a feature (spawn animation re-runs unless motion.spawn=false).

PERF: gset object is ~25 keys; identity changes once per input event; the only per-frame consumer is the view's cached this.eff (effective(settings) computed once in setSettings, never in the loop).

**Files:** C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/App.jsx, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/SpaceCanvas.jsx

**Tests:** Covered by graph-settings tests for validate-on-load and needsRebuild routing (pure). Manual: tweak bloom, kill app, relaunch — value persisted; corrupt onyx-store-graph-custom.json by hand — app boots on defaults; change preset — canvas remounts once (resetNonce), change bloom — no remount.

### Live-apply engine — cinema.applyLook, force.mjs opts exposure, BrainView full setSettings (flagship lens) [must, ~130L]

**Value:** Sliders feel like a lighting desk: bloom, grain, exposure, physics all morph in real time at 60fps with zero allocation. BrainView is the reference implementation every other lens copies.

**Design:** cinema.js (2 edits): (1) makeComposer return gains the bloom pass handle: capture const bloomPass = new UnrealBloomPass(...) and return { composer, grade, bloom: bloomPass, dispose } — non-breaking, existing destructurers ignore it. (2) NEW export applyLook(cine, renderer, s): bloom.strength=s['look.bloom']; bloom.threshold=s['look.bloomThreshold']; grade.uniforms.grain.value=s['look.grain']; grade.uniforms.vig.value=s['look.vignette']; grade.uniforms.chroma.value=s['look.chroma']; renderer.toneMappingExposure=s['look.exposure']. ~12 lines, called by every lens's setSettings.

force.mjs (1 line): return { nodes, byId, opts: o, tick } — exposes the already-closure-captured opts object so mutating sim.opts.repulsion retunes the live simulation mid-tick with a smooth morph (no re-seed, no position jump; damping absorbs the transient). Existing tests untouched; add one assertion that opts is live (mutate repulsion, tick, positions spread).

scenery.js (2 edits): (1) makeOrb(colorHex, size, type, id, shapeKind) — optional 5th arg overrides shapeFor(type) when provided ('auto'/undefined → current behavior). (2) makeNebula returns mesh with userData.nebula = true so setSettings can find it generically for theme.nebulaDim (material.color.setScalar(v) — MeshBasicMaterial color multiplies the canvas map, an instant backdrop dimmer).

BrainView reference implementation:
- constructor: accept opts.settings; this.settings = validateSettings(opts.settings); this.eff = effective(this.settings). Replace hardcoded reads: makeNebula(...paletteFor(s).nebula); cluster color = paletteFor(s).clusters[ci % 12] (or folder-index palette when theme.folderColors — feature 6); orphan = paletteFor(s).orphan; lines color = palette.link, opacity = s['look.linkOpacity']; LinkPulses(group, seg, palette.pulse, Math.round(90 * s['motion.pulses'] * (eff.reduced?0:1))); makeOrb(..., s['look.gemShape']==='auto'?note.type-shape:override); createSim(ids, links, { repulsion: s['physics.repulsion'], restLen: s['physics.linkLength'], maxRadius: s['physics.spread'], center: s['physics.gravity'] }); bornAt uses s['motion.spawn']===false ? this._t-1 : existing stagger. Label records store baseScaleX/baseScaleY at build.
- setSettings(s): this.settings = validateSettings(s); this.eff = effective(s); applyLook({grade:this.grade,bloom:this.bloom},this.renderer,s) (stash this.bloom from makeComposer); if this.sim: Object.assign(this.sim.opts, {repulsion,restLen,maxRadius,center from s}); this.lines.material.opacity = s['look.linkOpacity']; nebula lookup via scene.children.find(c=>c.userData.nebula).material.color.setScalar(s['theme.nebulaDim']); labels: sprite.scale.set(baseScaleX*s['look.labelSize'], baseScaleY*s['look.labelSize'],1). All O(nodes)=105 — sub-millisecond.
- _loop edits (read this.eff, no allocations): dt *= this.eff.speed after the clamp (sim.tick count unchanged — physics speed is its own axis; only drift/pulse/plasma/label time scales); spin lines gated by this.eff.spin; scale line becomes n.baseSize * s['look.nodeSize'] * pulse * dim * spawn; label fade distance 230 → 230 * s['look.labelFade'].

APPLY-PATH TABLE (authoritative): live-uniform (bloom, threshold, grain, vignette, chroma, exposure, nebulaDim, linkOpacity) → applyLook/material mutation; live-loop (speed, spin, nodeSize, labelSize, labelFade) → this.eff read per frame; live-sim (repulsion, linkLength, spread, gravity) → sim.opts mutation; rebuild (preset, folderColors, gemShape, pulses, spawn) → resetNonce remount, where constructor reads build-time values.

EDGE CASES: setSettings before first update(graph) — guard every handle with if (this.lines) etc., pattern already used throughout. motion.speed=0 → dt=0, sim still ticks (positions settle) but drift/pulses freeze — intended 'freeze frame'. Dispose path unchanged — no new GPU resources are created by setSettings (mutation only), so the existing _clear/dispose contract holds.

PERF BUDGET: setSettings worst case touches 105 materials + 105 sprites + 6 uniforms ≈ 0.2ms; per-frame cost is 4 extra multiplies per node — noise at 105 nodes on integrated GPU.

**Files:** C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/cinema.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/force.mjs, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/scenery.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/BrainView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/test/force.test.mjs

**Tests:** test/force.test.mjs new case: createSim exposes opts; mutating opts.repulsion then ticking produces larger average pairwise distance than the un-mutated control (live retune proof). graph-settings tests cover clamps feeding these paths. Manual: drag bloom slider — glow changes same frame; drag repulsion — brain breathes apart smoothly without re-seeding.

### CustomizeDrawer.jsx — right-side glass studio panel + HudToolbar toggle [must, ~260L]

**Value:** The visible product: a lighting-desk drawer where the user recolors and retunes their second brain live, with preset swatch ramps, per-section reset, and only-relevant knobs for the active lens.

**Design:** NEW components/CustomizeDrawer.jsx. Rendered inside the mode==='brain' block in App.jsx, sibling of HudToolbar. Open state: const [customize, setCustomize] = useState(false) in App.

TOGGLE: HudToolbar gains one TBtn — icon 'tune' (three horizontal sliders SVG path: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4M4 12h13M20 12h0'-style, same 1.6 stroke house style), props tune/onTune, on-state while drawer open. Placed between labels and reset.

LAYOUT (fixed right drawer, class 'cust-drawer glass', width 296px, top ~64px bottom ~40px to clear TopBar/StatusBar, overflow-y auto, slides in with the house transition):
- Header: 'CUSTOMIZE' + active lens badge (view name) + global reset ↺ + close ✕.
- SECTION: THEME — 5 preset rows: each a button with preset name + 12-swatch ramp strip (12 x 14px divs from PRESETS[id].clusters) + nebula pair dots; active preset gets the .on treatment. Below: 'Folder colors' checkbox row (theme.folderColors), 'Backdrop' slider (theme.nebulaDim).
- SECTION: LOOK — sliders in schema order: Bloom, Threshold, Exposure, Grain, Vignette, Fringe, Node size, Link opacity, Label size, Label fade; 'Gem shape' as a 6-chip enum row (auto/sphere/ico/octa/dodeca/tetra).
- SECTION: MOTION — Speed slider, Pulses slider, Spin toggle, Spawn animation toggle, divider, 'Reduce motion' master toggle (when on, Speed/Pulses/Spin rows render dimmed/disabled to show the override).
- SECTION: PHYSICS — Repulsion, Link length, Spread, Gravity sliders; the whole section only renders when SCHEMA rows' liveIn/appliesTo hit the active view (i.e. view==='brain'); other lenses show one muted line: 'physics — brain lens only'.
- Every section header has its own ↺ calling resetGset(section).

RENDERING IS SCHEMA-DRIVEN: drawer maps SCHEMA rows by section; a row renders <label>{label}<span class='val'>{fmt(v)}</span></label><input type='range' min max step value onChange={e=>updateGset({[key]: +e.target.value})}/> for range, checkbox for bool, chip row for enum. Native range inputs (no custom slider lib — rung 4), styled once in styles.css (accent-color from house palette, thin track). fmt(): 2-sig-figs, gravity shown x1000.

REBUILD HINT: rows whose change will remount (needsRebuild single-key probe against current view) show a tiny '↻' glyph after the label so remount-on-change never surprises.

STATE FLOW: drawer is fully controlled — reads gset, writes via updateGset(patch) (from feature 2). No local state except collapsed-section booleans (useState, not persisted — YAGNI). Esc handling: drawer is NOT overlay-level (keyboard contract untouched); close via ✕/toolbar toggle only.

CSS (~60 lines in existing styles.css): .cust-drawer positioning/scroll, .cust-row grid (label 1fr / control), .cust-swatches flex strip, .cust-chip, range styling, .cust-section-h with reset affordance. Reuses .glass, .tbtn, existing type scale.

EDGE CASES: gset===null (store not loaded yet) → drawer renders nothing (guard). Drawer + Cockpit overlap: drawer sits above HudToolbar z-order; hud-body right side already reserves that gutter. Window narrow: drawer max-width 40vw.

PERF: pure controlled inputs; each drag event is one updateGset → one setSettings mutation; React re-renders just the drawer + memo-safe SpaceCanvas (its mount effect keys on [view, resetNonce] only).

**Files:** C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/CustomizeDrawer.jsx, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/HudToolbar.jsx, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/App.jsx, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/styles.css

**Tests:** Schema-driven rendering means drawer completeness is enforced by the SCHEMA integrity test (every row has section/label/type the drawer can render — assert known type set). Manual: open drawer via toolbar, drag every slider, click every preset, reset per-section and global, confirm '↻' rows remount and plain rows don't.

### All-lens coverage — setSettings across the remaining 8 views via one shared helper [should, ~120L]

**Value:** Customization applies to every lens, not just Brain: the universal knobs (bloom/grain/exposure/speed/link opacity/backdrop/palette-on-rebuild) work identically in Nexus, Atlas, Solar, Constellation, Core, Globe, Stacks, City.

**Design:** NEW export in cinema.js (kept there — it already owns the composer contract): applyCommonSettings(view, s) — one function each view calls from a ~6-line setSettings: (1) view.settings=validateSettings(s); view.eff=effective(s); (2) applyLook({grade:view.grade, bloom:view.bloom}, view.renderer, s) — all 9 views already stash this.grade and can stash bloom from the widened makeComposer return; (3) if (view.lines) view.lines.material.opacity = s['look.linkOpacity']; (4) nebula dim via view.scene.children.find(c=>c.userData.nebula) — makeNebula tags itself (feature 3); (5) return view.eff.

PER-VIEW EDITS (mechanical, ~10 lines each):
- Add setSettings(s) { applyCommonSettings(this, s) } and this.bloom = cine.bloom.
- Constructor: accept opts.settings; palette reads switch from CLUSTER_PALETTE / hardcoded nebula pairs to paletteFor(this.settings) — each view keeps its OWN nebula hue character by deriving: nebula args = preset.nebula (uniform across lenses is acceptable and simpler; per-lens hue offsets rejected as over-engineering).
- Loop: dt *= this.eff?.speed ?? 1 right after their existing dt clamp (every view computes dt the same way); views using LinkPulses pass Math.round(baseCount * s['motion.pulses']) and preset.pulse color at build.
- NexusView additionally: instanceColor buffers already exist — palette applies at rebuild (liveIn stays ['brain'] for nodeSize/labels; needsRebuild routes everything heavy through remount, which SpaceCanvas already does). Its 1200 flow-motes read preset.pulse at build.
- Everything NOT covered live in these 8 lenses (nodeSize, labelSize/Fade, gemShape, folderColors, preset) is already handled: needsRebuild(prev,next,viewId) returns true for those keys in those views → resetNonce remount → constructor reads new settings. Zero silent dead sliders: every knob either mutates live or remounts, per the liveIn table.

ROLLOUT ORDER: NexusView first (richest, validates instanced path), then GraphView/SolarSystemView (they share LinkPulses+lines patterns), then Atlas/Stacks/City/Core/Globe.

EDGE CASES: a view with no this.lines (City) — guard already in helper. Views that tick a sim only during warmup — physics stays brain-only per schema, so no contradiction. Dispose unchanged: helper mutates existing resources only.

PERF: identical budget to BrainView's path; per-view setSettings is O(1) apart from the guarded finds.

**Files:** C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/cinema.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/NexusView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/GraphView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/SolarSystemView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/AtlasView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/StacksView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/ArchiveCityView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/CoreView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/GlobeView.js

**Tests:** needsRebuild matrix in graph-settings tests already encodes the per-lens contract (nodeSize live in brain, rebuild in atlas, etc.). Manual sweep: for each of the 9 lenses, drag bloom + speed (must change live), switch preset (must remount recolored), toggle links opacity where lines exist.

### Theme depth — folder-color mode + gem shape override wired through build path [should, ~45L]

**Value:** The two rebuild-class theme knobs that make it feel personal: color the cosmos by vault folder (matches FolderTabs mental model) and force a single gem cut across all notes.

**Design:** FOLDER COLORS (theme.folderColors=true): pure helper in graph-settings.mjs — folderColorIndex(folders) returns Map(folder → index) from the sorted unique folder list (stable across sessions because folder names sort deterministically; 14 folders on the real vault wrap the 12-color ramp via % 12). In each view's build path the color pick becomes: const ci = s['theme.folderColors'] ? folderIdx.get(note.folder) : clusterOf.get(note.id); colorHex = ci>=0 ? palette.clusters[ci%12] : palette.orphan. Note.folder already exists on graph notes (FolderTabs/scopeNotes use it). Cluster detection still runs (Cockpit/legend need it) — only the paint changes.

GEM SHAPE (look.gemShape): already threaded in feature 3's makeOrb 5th arg; build sites pass s['look.gemShape']==='auto' ? undefined : s['look.gemShape']. unitGeometry cache already handles all 5 kinds; instanced views (Nexus) pass the kind to their unitGeometry(kind) instancing setup — one geometry swap at build. No per-type mapping UI (rejected: 5 shapes x N types matrix for marginal value — the single override plus 'auto' hash covers the expressed want).

Both knobs are liveIn [] — the existing needsRebuild → resetNonce remount handles application with zero extra plumbing; constructors simply read them.

EDGE CASES: note with folder '(root)' → folderIdx contains it like any other name. Folder renamed in vault → next graph update reindexes; colors shift only if sort order changed (documented, acceptable). folderColorIndex tested pure.

PERF: rebuild-only; no frame cost.

**Files:** C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/graph-settings.mjs, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/scenery.js, C:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/BrainView.js, C:/Users/Xody2/OneDrive/Desktop/Note App/test/graph-settings.test.mjs

**Tests:** graph-settings.test.mjs: folderColorIndex is deterministic for shuffled input order, wraps >12 folders correctly ((idx%12) in-range), '(root)' included; gemShape enum coercion (invalid value → 'auto') covered by validateSettings tests.


## Ecosystem proposals

### eco lens registration + app bridge [must, ~25L]

**Value:** Makes the Ecosystem a first-class 10th lens with zero new machinery: canvas pause outside brain mode, dirty-guarded mode switches, usage counter, palette entry, and a 3-line bus bridge so clicking a building filters the brain like FolderTabs does.

**Design:** WHY LENS NOT MODE: SpaceCanvas already forwards paused={mode!=='brain'} to setPaused (SpaceCanvas.jsx:50-52), changeMode dirty-guards for free (App.jsx:335), changeView('eco') auto-bumps 'view.eco' usage (App.jsx:318). A 5th mode would need new Ctrl+5 wiring, pause plumbing, and a store. WIRING: (1) SpaceCanvas.jsx — import EcoView, add `eco: EcoView` to VIEWS map; add optional prop `dueCount` with `useEffect(()=>{inst.current?.setDue?.(dueCount)},[dueCount])` so the librarian NPC reflects the real SRS queue App already computes (`due` at App.jsx:475). (2) ViewSwitcher.jsx — add `{ id: 'eco', label: '⌂ Ecosystem' }` (monochrome glyph per house discipline). (3) App.jsx — palette action `{ label: 'View: Ecosystem', hint: 'lens', run: () => { changeMode('brain'); changeView('eco') } }`; pass `dueCount={due.length}` to SpaceCanvas; add ONE bus subscription: `useEffect(() => bus.on('eco:filter', (folderId) => setFilter({ ...EMPTY_FILTER, folders: [folderId] })), [])` — bus.on returns the unsubscriber (bus.mjs), so the effect cleanup is the return value itself. This reuses the exact filter shape FolderTabs sets, so activeIds flows back into EcoView.setActive with no new contract. STATE FLOW: click building -> bus 'eco:filter' -> App setFilter -> activeIds recompute -> SpaceCanvas setActive -> EcoView dims other districts. No persistence needed (lens is stateless like all 9 others). EDGE CASES: bus listener registered once (empty dep array); filter emitted only with a valid folder id from graph.folders.

**Files:** src/renderer/views/SpaceCanvas.jsx, src/renderer/views/ViewSwitcher.jsx, src/renderer/App.jsx

**Tests:** Manual: palette 'View: Ecosystem' mounts the lens; Ctrl+2 then Ctrl+1 confirms RAF stops/resumes (setPaused logs); clicking a building highlights the matching FolderTabs chip and dims other districts.

### lib/eco.mjs — town planner: archetype mapping, district layout, waypoint graph (pure, node --test) [must, ~360L]

**Value:** The vault IS the town: every real folder becomes a district with a functional archetype derived from its name/tags, positioned overlap-free, wired by a walkable path network with precomputed routing. Pure and deterministic so 100% of the world logic is testable without THREE.

**Design:** DATA IN: graph.folders [{id,name,color}], graph.notes [{id,title,folder,tags,mtime,inLinks,outLinks}], now. ARCHETYPE TABLE (ordered, first regex hit wins; tested against the real vault): [ {id:'hq', re:/dashboard|home|\bhq\b|headquarters/i}, {id:'signal', re:/claude|agent|comms/i}, {id:'refinery', re:/data|pipeline|attachment/i}, {id:'lab', re:/engine|model|backtest|projection|research|experiment/i}, {id:'trading', re:/result|bet|trade|market/i}, {id:'workshop', re:/app|engineering|ops|template|tool/i}, {id:'library', re:/resource|spec|diagram|map|doc|reference|excalidraw|command/i} ] — real mapping: '00 - Dashboard'->hq, 'Claude Projects'->signal, '03 - Data Pipeline'->refinery, '02 - Projection Engine'/'04 - Backtesting'/'05 - Features & Models'->lab, '14 - Results'->trading, '09 - Apps & Features'/'11 - Engineering & Ops'/'08 - Templates'->workshop, '07 - Resources'/'13 - Specs'/'12 - Diagrams & Maps'/'Excalidraw'/'Useful Commands'->library. `archetypeFor(folderName, folderNotes)`: name regex first; miss -> run same regexes over the folder's top-5 tags (frequency count); miss -> 'hamlet' fallback (graceful, never throws). '06 - Daily Logs' and '(root)' land in hamlet = cottage row, which reads correctly. `ecoLayout(folders, notes, now, opts={})` -> { districts, waypoints, plaza }. LAYOUT ALGORITHM: drop empty folders; sort by count desc (big districts inner); district i gets angle=i*GOLDEN (2.399963), radius Rd=34*sqrt(i+0.6) (ArchiveCityView.js:176 pattern); footprint S=clamp(5+1.8*sqrt(count),5,14); THEN 12 passes of pairwise center-push relaxation copied from archipelagoLayout (layouts.mjs:95-115) with want=Sa+Sb+12 (street gap). Per district: lit = share of notes with now-mtime < 14d (0..1, also quantized litBucket = floor(lit*3) clamped 0..2), recentCount (7d), door = center - normalize(center)*(S+2) (faces plaza), hubNoteId = most-recent-mtime note id. WAYPOINTS: node 0 = plaza (0,0); node 1..D = doors; edges = D spokes (plaza<->door_i) + ring (door_i <-> its two angular neighbors by atan2 sort). ROUTING: Dijkstra from every node over euclidean edge lengths (D<=20, trivial) -> nextHop Uint8Array(n*n), nextHop[a*n+b] = first node on shortest a->b path, 255 = unreachable sentinel. `routeLen(a,b,wp)` helper walks the table (for tests + drawing dirt paths on the ground texture). DIFF STORY: `diffTown(prevDistricts, nextDistricts)` -> {rebuild:boolean, relight:string[]} — rebuild true iff folder-id set, archetype, ceil(sqrt(count)) bucket, or relaxed position (>1 unit drift) changed; relight lists districts whose litBucket alone moved. EcoView uses this so a mere note edit re-lights windows and respawns couriers without tearing the town down. DETERMINISM: zero Math.random; hamlet scatter and any jitter use hashAngle/hashInt (graph.mjs:15). EDGE CASES: 0 folders -> empty districts + plaza-only graph; 1 district -> spoke only, no ring; duplicate folder positions post-relax impossible by invariant test; notes with null mtime count as not-recent.

**Files:** src/renderer/lib/eco.mjs, test/eco.test.mjs

**Tests:** node --test test/eco.test.mjs: archetypeFor returns the exact mapping above for all 16 real folder names + 'zzz'->hamlet; layout no-overlap invariant (center dist >= Sa+Sb+12) for 1/2/14/40 synthetic folders; every door within S+3 of its center; nextHop reaches every pair in <= n hops with no 255 for connected graphs; two identical calls deep-equal (determinism); diffTown: mtime-only change -> {rebuild:false, relight:[folder]}, added folder -> rebuild:true.

### lib/econpc.mjs — NPC population + kinematics (pure, node --test) [must, ~260L]

**Value:** The town lives on REAL data: recent edits spawn couriers carrying actual note titles between linked districts, due flashcards animate a pacing librarian, orphan notes wander lost at the edge, and baseline citizens scale with vault size. All simulation is pure math, zero-allocation per tick, fully tested.

**Design:** DATA MODEL: npc = { role:'citizen'|'courier'|'librarian'|'wanderer', node:int (last waypoint), pathNext:int, dest:int, x,z,heading:float, speed:float, state:'walk'|'pause', pauseT:float, palette:0|1|2, seed:int, errand:{text:string, noteId:string|null}, homeNode:int, loop:boolean }. PRNG: mulberry32(seed) local (deterministic, injectable). `spawnNpcs(districts, waypoints, notes, links, dueCount, now, opts={})` -> npc[]: (1) COURIERS — notes with now-mtime < 72h, take first out/in link whose other end lives in a DIFFERENT district; npc from door(srcFolder) to door(dstFolder), speed 7-9, loop:true (shuttles forever), errand text `delivering: ${note.title} -> ${dstDistrict.name}`, errand.noteId = note.id; cap 12 most-recent-first. (2) LIBRARIAN — if dueCount>0 and a library-archetype district exists: 1 npc pacing library door <-> its ring neighbors, speed 3, errand `reviewing ${dueCount} cards`. (3) WANDERERS — orphans (no in+out links): min(3, ceil(orphans/10)) npcs pinned to the outermost ring nodes, speed 2, long pauses (4-8s), errand `lost: ${orphan.title}`, noteId set. (4) CITIZENS — fill to POP = clamp(15 + floor(notes.length/5), 15, 40) (105 notes -> 36 total); random home door + rng dest, speed 3.5-5.5, errand `strolling`. palette = index%3. `advanceNpc(npc, dt, wp, rng, out)` — ZERO allocation, writes out[0]=x,out[1]=z,out[2]=heading, returns npc.state: state 'pause': pauseT-=dt, at <=0 pick next dest (couriers/librarian toggle home<->dest via loop flag; citizens rng node != current; wanderers rng among 2 nearest ring nodes) and set pathNext=nextHop[node*n+dest]. state 'walk': dx=nodes[pathNext].x-x etc., d=hypot; if d < 0.4: node=pathNext; if node===dest -> state 'pause', pauseT=1+rng()*3; else pathNext=nextHop[node*n+dest]; else x+=dx/d*speed*dt (same for z), targetHeading=atan2(dx,dz), heading lerped shortest-arc by min(1, dt*6) (smooth turns). EDGE CASES: nextHop 255 sentinel -> immediate re-pause + new dest (never NaN, never stuck); single-node graph -> perpetual pause; dt clamped 0.05 by caller (house pattern, ArchiveCityView.js:359); links referencing missing notes skipped (same guard as NexusView.js:235-236). PERF: 40 npcs x ~12 flops = negligible; no arrays created per tick.

**Files:** src/renderer/lib/econpc.mjs, test/econpc.test.mjs

**Tests:** node --test test/econpc.test.mjs: population bounds 15/36/40 for 0/105/1000 notes; courier spawns ONLY when a <72h note links cross-district (and carries its title); zero couriers on a stale vault; librarian present iff dueCount>0; simulated 60s at dt=1/60 -> every citizen reaches >=1 dest (state hits 'pause'); 10k random ticks produce zero NaN/Infinity; fixed seed -> identical trajectories (determinism); 255-sentinel graph -> npc re-routes without throwing.

### EcoView — procedural town renderer (ground, 8 building archetypes, merged-by-material geometry) [must, ~400L]

**Value:** The visible world: a park-island ground plane with dirt paths tracing the real waypoint network, and one DISTINCT silhouette per district — HQ beacon tower, domed lab, columned library, tank-and-pipe refinery, ticker-band trading floor, sawtooth workshop, antenna signal tower, cottage hamlet — sized by note count, windows lit by edit recency. Whole town renders in ~6 draw calls.

**Design:** FILE: views/EcoView.js, class EcoView, EXACT lifecycle contract cloned from ArchiveCityView (constructor(container,{onSelect,onHover}), update, setActive, setLinksMode, setLabels, setDue, focus, setPaused, dispose, _resize, _clear) including the cine dispose pattern (makeComposer/makeEnv, ArchiveCityView.js:116-121) and the setPaused clock-eat (:457-466). SHARED KIT: move `windowTexture()` from ArchiveCityView.js:16-36 into scenery.js as an export and import it from both (net-negative diff, module-cached like softDot). SCENE: FogExp2(0x0a1018, 0.0028); makeNebula('#1a2a4d','#0e1c36') (material.color lerped by day cycle item); makeStarfield(900) with both layer materials' opacity driven by night factor; addLights + one THREE.DirectionalLight sun. Camera 52deg fov at (0,120,260), OrbitControls maxPolarAngle 1.45, maxDistance 480. GROUND: CircleGeometry(260,48) + MeshStandardMaterial with 1024px canvas map rebuilt in update(): grass base #0d1a12, plaza stone disc at center, dirt paths stroked along every waypoint edge (world->uv: u=x/520+0.5), one stone pad circle under each district tinted folder.color at 12% alpha, mowed concentric rings at low alpha — the ecoLayout output literally draws the map. Disposed in _clear (holoFloorTexture pattern, ArchiveCityView.js:435-438). BUILDINGS — GEOMETRY RECIPES (S = district footprint from ecoLayout; parts are THREE primitives with matrix baked via applyMatrix4, every part gets a 'color' Float32 attribute = folder tint (body) or roof/trim tone (accent) so ONE white vertexColors material serves all): hq: Box(1.4S,4.2S,1.4S)@y2.1S body; Box(0.9S,0.7S,0.9S)@y4.55S body; Cone(0.12S,1.1S,6)@y5.4S accent; beacon point @y6S. lab: Cylinder(0.95S,1.05S,1.1S,20)@y0.55S body; half-Sphere dome (SphereGeometry(0.78S,20,12,0,2PI,0,PI/2))@y1.1S accent; 2x Box(0.7S,0.5S,0.5S) wings @±1.2S body; Cylinder(0.03S,0.03S,0.9S,6) antenna accent. library: Box(2.2S,0.9S,1.2S)@y0.45S body; 5x Cylinder(0.07S,0.07S,0.9S,8) columns across front z=+0.68S spaced 0.45S accent; Box(2.4S,0.18S,1.4S) architrave @y0.99S accent; gable = Cylinder(0.7S,0.7S,2.4S,3) prism rotated Z 90deg @y1.2S accent. refinery: 3x Cylinder(0.55S,0.55S,h∈[1.6S,1.1S,1.9S],14) tanks on 0.9S triangle body; 2x Cylinder(0.07S,0.07S,0.9S,6) horizontal pipes bridging tank tops accent; Box(0.8S,0.5S,0.6S) control room body; hazard blink point on tallest tank. trading: Box(2.6S,0.9S,1.5S)@y0.45S body; SEPARATE ticker mesh Box(2.7S,0.22S,0.05S) on front @y0.75S with own MeshBasicMaterial canvas strip (green digits, texture.offset.x -= dt*0.05, RepeatWrapping); Cylinder(0.03S,0.03S,1.4S) flagpole + tiny Box flag accent. workshop: Box(1.8S,0.8S,1.4S) body; 3 sawtooth prisms (Cylinder r0.35S, 3 radial segs, rotated) along roof accent; Cylinder(0.09S,0.09S,1.2S) chimney accent; smoke Points above (ambient item). signal: Cylinder(0.06S,0.4S,3.6S,8) tapered mast body; 3x Box(0.9S,0.06S,0.06S) cross-arms at y1.8/2.5/3.2S accent; Cone(0.1S,0.5S,8) tip accent; red blink point @top; 'agent comms' ring = TorusGeometry(1,0.05,6,32) mesh at base scaling 1->8 with opacity fade over 6s loop, active iff any Claude Projects note (projects.mjs PROJECT_FOLDER) has mtime today. hamlet: 3x Box(hash-varied 0.6-0.8S, 0.5S) + Cone(0.55S,0.4S,4) pyramid roofs accent, scattered ±0.8S via hashInt. MERGING: import mergeGeometries from 'three/examples/jsm/utils/BufferGeometryUtils.js' (ships inside the existing three dep — zero new npm deps). ALL body parts across ALL districts merge into 3 geometries by litBucket (0/1/2); shared bodyMat = MeshStandardMaterial({vertexColors:true, emissive:0xcfe0ff, emissiveMap:windowTexture(), emissiveIntensity:bucketBase[0.25,0.7,1.3]*nightFactor+0.06, roughness:0.5, metalness:0.2}) — 3 draw calls. All accents merge into 1 geometry, accentMat MeshStandardMaterial({vertexColors:true, roughness:0.6}) — 1 draw call. During merge record per-district vertex ranges [{folderId, bucket, start, count}] for setActive dimming (interaction item). All blink/beacon lights = ONE THREE.Points (softDot, additive) with per-vertex color, global opacity pulse — 1 draw. PICKING: one invisible collider per district (shared UNIT_BOX scaled (2.6S,topH,2.6S), MeshBasicMaterial{visible:false} — raycaster hits explicit lists regardless of visibility), userData {folderId, hubNoteId, cx, cz, topH}. LABELS: local makeLabel2(name, `${count} notes · ${recentCount} recent`, folderColor) — two-line canvas sprite (name 34px, sub 20px #9fb0d0) at y=topH+3, always visible (district names are the map, ArchiveCityView.js:377-381 precedent). UPDATE(graph) DIFF: run ecoLayout; diffTown vs this.districts -> if rebuild:false and relight only: swap bodyMat bucket membership is NOT attempted (ponytail: quantized rebuild ceiling) — relight rebuilds ONLY label sprites + updates this.districts lit + respawns data-driven NPCs, keeping town geometry and citizen NPCs walking; rebuild:true -> _clearTown() + full rebuild (105 notes: <10ms). PERF BUDGET (draw calls): nebula 1 + stars 2 + ground 1 + bodies 3 + accents 1 + blinks 1 + ticker 1 + agent ring 1 + labels 14 + colliders 0 = 25 for the static world; zero per-frame allocations (scratch Object3D, module tmp Vector3). DISPOSE: _clearTown disposes 4 merged geos, ground map, ticker texture, label textures, torus; dispose() = ArchiveCity dispose sequence (controls, envTex, cineDispose, renderer, DOM removal).

**Files:** src/renderer/views/EcoView.js, src/renderer/lib/scenery.js, src/renderer/views/ArchiveCityView.js

**Tests:** Manual + __onyxDebug: setView('eco') renders 14+ distinct silhouettes matching folder archetypes; renderer.info.render.calls <= 40 in devtools; editing a note in the vault relights its district without camera reset; switching lenses twice leaks nothing (renderer.info.memory.geometries returns to baseline).

### EcoView — living NPCs (instanced walkers driven by econpc) [must, ~130L]

**Value:** 15-40 little agents visibly walking the path network between the buildings of your actual vault — couriers rushing recent edits between linked districts, a librarian pacing when reviews are due, lost wanderers for orphan notes. One draw call, one InstancedMesh.

**Design:** MESH: one THREE.InstancedMesh(CapsuleGeometry(0.45,0.9,4,8), MeshStandardMaterial({roughness:0.6, metalness:0.05}), 40) with instanceMatrix DynamicDrawUsage (NexusView.js:136 pattern) + instanceColor: citizens get 3 palette variants (CLUSTER_PALETTE[0..2] multiplied 0.7), couriers get their DESTINATION district's folder color (readable errand direction), librarian warm parchment 0xd8c9a0, wanderers dim ORPHAN_COLOR 0x4a5470. count set to npcs.length; unused instances scaled to 0. SPAWN: on update(graph) (and on relight) call spawnNpcs(districts, waypoints, graph.notes, graph.links, this._dueCount||0, Date.now()) — setDue(n) stores count and respawns ONLY the librarian slot. NPC CONTINUITY: if diffTown says rebuild:false, citizens keep their live positions (npc array retained, only data-driven roles respawned); rebuild:true respawns all (waypoint indices invalid). FRAME LOOP (inside existing _loop, dt clamped 0.05): for each npc advanceNpc(npc, dt, wp, npc._rng, out3) -> scratch.position.set(out[0], 0.95, out[2]... y fixed 0.95); scratch.rotation.y = out[2] heading; walk-bob scale.y = 1+sin(t*10+seed)*0.05 while state==='walk', 1.0 paused; couriers lean 0.12rad forward; setMatrixAt(i); one instanceMatrix.needsUpdate per frame. Cost: 40 matrix composes = negligible on integrated GPU. HOVER: npcMesh included in the raycast list; hit.instanceId -> npcs[i]; show errand label: ONE reusable sprite slot — makeLabel(npc.errand.text, '#ffd9a0', 0.045) positioned at (x, 2.6, z), previous sprite material+texture disposed on change (hover-rate, not frame-rate — no leak, no per-frame churn); cursor 'pointer'. CLICK: npc with errand.noteId -> onSelect(noteId) opens the actual note being 'delivered'/'lost' (double-click debounce NOT needed — single click, NPCs never need fly-to). setLabels(false) hides the errand sprite only (district labels are the map and stay). EDGE CASES: npcs.length===0 (empty vault) -> mesh.count=0, loop skips; hover during respawn guarded by instanceId < npcs.length check; paused lens freezes walkers mid-stride (clock-eat prevents teleport on resume). PERF: +1 draw call (instanced), +1 sprite when hovering; advanceNpc writes into a single preallocated Float32Array(3).

**Files:** src/renderer/views/EcoView.js

**Tests:** Manual: with a note edited today that links cross-folder, a courier in the destination district's color shuttles between the two buildings and hover reads 'delivering: <real title> -> <district>'; grade all due cards -> librarian despawns on next setDue; DevTools performance tab shows zero GC sawtooth while idle on the lens.

### EcoView — interaction: hover cards, click-to-filter, fly-to, setActive dimming [must, ~110L]

**Value:** The lens is an instrument, not a diorama: hover a building to read its district, click to filter the whole brain to that folder (existing FolderTabs contract), double-click to open its hub note, and incoming filters/focus dim and fly exactly like every other lens.

**Design:** HOVER BUILDING: raycast collider list (single intersectObjects call shared with the NPC mesh — nearest hit wins); building hit -> onHover({id: userData.hubNoteId, x, y, pinned:false}) projected from (cx, topH, cz) exactly like ArchiveCityView._loop:407-414, so the existing HoverLayer/HoverCard renders the district's most-recent note with folder context free of charge; plus label sprite scale 1.15 and a +0.4 emissive boost on the district's beacon point (per-vertex color bump, no material change). CLICK BUILDING: bus.emit('eco:filter', folderId) (App bridge from wiring item) AND camera flight to (door.x, 4+2.2S, door.z + 3S) looking at (cx, S, cz) using the house _flight quadratic-ease pattern (ArchiveCityView.js:399-405). DOUBLE-CLICK building: onSelect(hubNoteId) — uses the 240ms click-timer debounce from NexusView.js:329-349 so single-click filter and dbl-click open coexist. FOCUS(id): App's flyTo prop already calls inst.focus(id) (SpaceCanvas.jsx:54-56) — find the district whose folder contains note id, flight to its door; unknown id no-ops. SETACTIVE(idSet): per district compute active = !idSet || any of its note ids in idSet (precompute district->noteIds at update); DIMMING WITHOUT EXTRA DRAWS: during merge we recorded per-district vertex ranges per bucket — setActive rewrites the merged 'color' attribute in-place: inactive ranges = baseColor*0.22, active = baseColor; one needsUpdate per affected bucket geometry. Labels of inactive districts drop to opacity 0.25; blink points of inactive districts color *0.2. NPCs unaffected (life goes on — deliberate). setLinksMode(showAll): toggles the ambient-motion layer (agent ring, smoke, courier visibility stays — couriers ARE links made flesh, so showAll=false hides citizen walkers only, keeping data-driven NPCs; matches 'synapses' semantics of showing/hiding connection noise). EDGE CASES: filter that empties every district -> all dim, no crash; hubNoteId of a just-deleted note -> onSelect flows through App's existing null-safe reader path; _clickTimer cleared in dispose (NexusView.js:494).

**Files:** src/renderer/views/EcoView.js

**Tests:** Manual + __onyxDebug.setFilter: clicking Research Facility filters brain to '02 - Projection Engine' (FolderTabs chip lights, sidebar count drops); setFilter back to empty restores full vertex colors; dbl-click HQ opens the dashboard hub note in the reader; Alt+Left back-stack still works after dbl-click opens.

### EcoView — day/night cycle tied to real local time [must, ~85L]

**Value:** The world breathes on the user's actual clock: golden-hour sun arcs, windows igniting at dusk with brightness driven by real edit recency, stars fading in — the vault looks different at 9am and 11pm because it IS 9am or 11pm.

**Design:** CLOCK: hours = local time as float (getHours()+getMinutes()/60); recomputed every 5 simulated seconds via accumulator (this._clockT += dt; at 5 re-read Date) — avoids a Date allocation per frame; between reads hours advances by dt/3600 so the lerp is continuous. SUN MODEL: elevation el = sin(((hours-6)/12)*PI) (sunrise 6, noon peak, sunset 18); dayness = clamp(el*1.6, 0, 1); night = 1-dayness. DRIVES (all lerps on prealloc'd Color scratch, zero alloc): DirectionalLight position on arc radius 300 (azimuth = ((hours-6)/12)*PI mapped east->west, clamped above horizon 0.05), color lerp noon 0xfff2d8 -> horizon 0xff9a5a -> night 0x3a4a8a, intensity 0.15+1.05*dayness; AmbientLight intensity 0.5+0.6*dayness; nebula material.color lerp day 0x93a8c8 -> night 0x30406a; both starfield layer material opacities = night*0.9; fog color lerp 0x9fb2d0 -> 0x0a1018. WINDOWS: bodyMat[bucket].emissiveIntensity = bucketBase[0.25,0.7,1.3] * (0.06 + 0.94*night) — recency litness times nightfall, the exact brief ('window lit-ness from recency', 'emissive up at night'). SUN+MOON sprites: two additive softDot sprites (scale 26 / 18) at sun position and its antipode; moon tinted 0xbfd0ff, opacity night. Fireflies/birds gating handled in ambient item via the same night scalar (single source of truth: this._night set once per frame). EDGE CASES: system clock change mid-session picked up within 5s; polar nothing — pure local time, no geolocation (ponytail: fixed 6/18 solstice-free model; astronomical sunrise if anyone ever cares). No persistence, no config knob (YAGNI — add a config override only if the user asks to freeze golden hour). PERF: ~12 lerps + 2 sprite position sets per frame; zero allocations.

**Files:** src/renderer/views/EcoView.js

**Tests:** Manual: change Windows clock to 13:00 -> bright park, faint windows; 23:00 -> dark sky, stars visible, windows of recently-edited districts blazing, stale districts dark; no frame hitch every 5s (accumulator, not setInterval).

### EcoView — ambient life layer: clouds, birds, fireflies, chimney smoke, ticker crawl [should, ~120L]

**Value:** The final 10% that makes it a world instead of a screenshot: drifting clouds, circling birds by day, fireflies by night, workshop smoke, the trading-floor ticker crawling — all batched into a handful of Points/texture-offset tricks costing ~5 draw calls total.

**Design:** CLOUDS: ONE THREE.Points(10 verts), cloudTex = module-cached 128px canvas (3 overlapping radial-gradient blobs, softDot pattern), size 90, sizeAttenuation, depthWrite false, NormalBlending, opacity 0.15+0.5*dayness; y 90-120 hash-jittered; per frame pos.x += dt*(1.5+i%3*0.8), wrap at ±280 (attribute write, needsUpdate). BIRDS: ONE Points(12), softDot size 2.2, dark tint; parametric flight — bird i orbits (cx_i, cz_i from hashAngle) radius 60-140 at y 40-70, angle = t*speed_i + phase_i, plus sin bob; positions written into prealloc'd Float32Array each frame; opacity = dayness (birds sleep at night). FIREFLIES: ONE Points(40) additive, warm 0xd8ff9a, clustered in 3 park glades between districts (positions = glade center + sin/cos bobs at individual phases, amplitude 3); opacity = max(0, night-0.4)*1.6 — emerge after dusk; size 1.6. SMOKE: ONE Points(3 per workshop-archetype district, cap 12) above chimneys; puff k: y = chimneyTop + ((t*1.2 + k*2.7) % 8), x/z drift sin(t+k)*0.6, opacity fades (1 - h/8)*0.5 baked via vertex color grey ramp and material opacity — visible only when setLinksMode(true) (ambient-motion toggle from interaction item). TICKER: trading district's ticker texture offset.x -= dt*0.05 (RepeatWrapping) — one uniform write. AGENT RING (signal tower, from world item) also gated by the ambient toggle. ALL of these live in _loop with preallocated arrays; zero per-frame allocations; +5 draw calls total (clouds, birds, fireflies, smoke, ticker already counted) -> lens grand total ~32 calls, comfortably under the 40 budget with NPCs and labels. DISPOSE: 4 Points geos+mats disposed in _clearTown; cloudTex module-cached (never disposed, like softDot). EDGE CASES: no workshop district -> smoke Points count 0 (LinkPulses count-0 guard pattern, scenery.js:248); no trading district -> no ticker mesh.

**Files:** src/renderer/views/EcoView.js

**Tests:** Manual: daytime shows birds circling and clouds drifting with no fireflies; force night (system clock) -> fireflies pulse in glades, birds gone; synapses toggle off -> smoke/ring/citizen-motion stop while couriers keep delivering; renderer.info.render.calls stays <= 40.
