# APEX Design — AAA visual overhaul, BROWSE tab, workhorse surfacing, wildcards

Date: 2026-07-07 · 5-agent design workflow (AAA visual director @xhigh, browse, workhorse, wildcards, judge @xhigh). Ships as v0.9.0.

## User brief (verbatim)
> "triple aaa made game with cool assets, amazing 3d models… stare for hours" + "browse plugins / skills tab… based on our project or popularity" + "work horse for my claude ai agent… never redo steps" + "state of the art top of the line features"

## Build order (14 slices, judge-reconciled)
### S1

SLICE 1 — Cinematic Kit A (visual kit, part 1): new src/renderer/lib/cinema.js makeEnv() with custom NebulaStudio PMREM scene (per-view-mount generation, tex.dispose() in each view's dispose — PMREM textures are GL-context-bound and SpaceCanvas.jsx:19 constructs one renderer per view); upgrade scenery.js makeOrb() (line 54) MeshStandardMaterial → MeshPhysicalMaterial (clearcoat 1.0, iridescence 0.35, NO transmission); 3-line wire-up in all 8 views. GATE: ONYX_SHOT of brain lens shows moving colored specular on spinning gems; 60fps with 104 notes; switch lenses 20x → renderer.info.memory.textures returns to baseline.

### S2

SLICE 2 — Cinematic Kit B (visual kit, part 2): cinema.js makeComposer() — ACESFilmicToneMapping + RenderPass → UnrealBloomPass → single combined GradeShader pass (grain/vignette/chroma, one fullscreen pass not three) → OutputPass (required in r169 or ACES is ignored in composer); replace the composer block in all 8 views, preserving each lens's current bloom numbers +0.1 strength. GATE: screenshot shows animated grain + vignette + edge fringe; all 8 lenses switch with no console errors/black frames; <1.5ms frame-time delta on devtools FPS meter.

### S3

SLICE 3 — Depth pass (visual kit, part 3 — hard prerequisite of the flagship lens, which consumes both pieces): scenery.js makeStarfield(count, layers=2) returning a Group (near layer r 180-320) + makeGlowShafts() crossed-plane streak billboards (NOT GodRaysShader — rejected for integrated GPU); wire suns/cores in SolarSystemView, CoreView, GlobeView. GATE: screenshot of solar lens shows parallax slide + counter-rotating streaks; renderer.info.render.calls increases ≤10; 60fps.

### S4

SLICE 4 — Motion polish: pure lib first — new src/renderer/lib/cinemath.mjs (easeOutBack, easeInOutCubic) + test/cinemath.test.mjs (node --test: endpoints, overshoot window) — then LinkPulses comet trails (TRAIL=6 position chain in the existing Points buffer, color-decay to black under additive blending), staggered orb spawn via rec.born in animateOrbs + BrainView's inline block (label opacity multiplied by same factor), focus-ring sprite on BrainView._flyTo arrival. GATE: node --test green; screenshot shows comet tails; manual: orbs cascade-pop on reload, click → cubic fly-in + ring flash.

### S5

SLICE 5 — NEXUS CORE flagship lens: pure lib first — new src/renderer/lib/flow.mjs (buildCurveTable pure Catmull-Rom, advanceMote with core-gravity accel) + test/flow.test.mjs — then src/renderer/views/NexusView.js (noise-displaced shader core, 2 counter-rotating tori, 48-shard InstancedMesh halo, 5 per-gem-kind InstancedMesh node swarm with instanceColor + raycast instanceId picking, 1200-mote link-flow Points off the precomputed curve table, kit env+composer bloom [0.85,0.55,0.25], glow shafts + dual starfield from slices 1-3); register in SpaceCanvas.jsx VIEWS map (line 11), ViewSwitcher.jsx, App.jsx palette. GATE: node --test flow green; ONYX_SHOT of nexus lens with real 104-note vault; 60fps; renderer.info.render.calls ≤20; hover/click/dblclick parity with brain; 20 lens switches → memory baseline.

### S6

SLICE 6 — BROWSE catalog lib (pure first): new src/renderer/lib/skill-catalog.mjs — ~38-entry curated CATALOG (uncertain:true flags where unvouched), searchCatalog, markInstalled (normalizes against the arsenal payload SkillsMode already polls), vaultTopTags, fitScore with alias map (bets→betting etc. so the real vault's tags hit), mergeLive (null → no-op offline) + test/skill-catalog.test.mjs. GATE: node --test green including superpowers-fixture installed match and null-live passthrough.

### S7

SLICE 7 — BROWSE tab UI: new src/renderer/components/BrowseSkills.jsx (DOM-only card grid, search, ALL/FITS/INSTALLED/kind chips, INSTALLED badge, UNVERIFIED chip, COPY INSTALL via clipboard, REPO via existing https-only openExternal guard — no install/run button exists, safety is structural); 4th tab in SkillsMode.jsx after QUESTS (existing sk-tab pattern, SkillsMode.jsx:174-183) with 'DISCOVERY ONLY · NEVER AUTO-INSTALLS' status line; App.jsx passes notes; ~55 lines CSS. GATE: ONYX_SHOT of BROWSE tab — superpowers card shows INSTALLED badge from the live arsenal scan; search 'security' filters; FITS surfaces betting/research-tagged entries with accent-bordered matching tags.

### S8

SLICE 8 — BROWSE live layer (optional-by-design, degrades to no-op offline): new src/main/browse-live.js — two GitHub topic-search requests max per 24h, cached via existing store.js, UA header, AbortSignal.timeout(8000), any failure → stale cache or null, never throws; ipcMain.handle('browse:live') + preload getBrowseLive (renderer already optional-chains it so slice 7 ships without this). GATE: online → star counts + live entries render; wipe cache + disconnect → 'OFFLINE — CURATED CATALOG' notice, zero errors.

### S9

SLICE 9 — Workhorse data spine (pure first): new src/renderer/lib/projects.mjs — PROJECT_FOLDER const, parseProjectLog (never throws; tolerant headings/CRLF/continuations/dated em-dash bullets), lastDoneDate, isStale, collectProjects (underscore filter) + test/projects.test.mjs; +5 lines in src/main/vault-indexer.mjs attaching .projectLog (same import pattern as parseTasks, vault-indexer.mjs:5-9); fixture note under test/fixture-vault/Claude Projects/. GATE: node --test projects + indexer both green; fixture note carries .projectLog through scanVault.

### S10

SLICE 10 — Dashboard PROJECTS page + BRIDGE indicator (workhorse surfacing): PAGES → ['overview','today','projects','analytics','health'] (DashboardMode.jsx:20), page-gated projects memo per the existing insights idiom (line 231), BRIDGE ●/○ strip via existing getInstalledSkills checking onyx-bridge, per-project span6 cards (status clamp, last-done + relAge, first-5 next, decisions chip, OPEN → onSelect, dp-warn staleness >7d), empty state with CREATE PROJECT LOG via existing createNote; ~15 lines CSS. GATE: ONYX_SHOT with ONYX_SHOT_JS clicking PROJECTS — Onyx project card renders with status/next/dates and green BRIDGE dot (bridge is installed on this machine).

### S11

SLICE 11 — Agent digest export: buildAgentDigest + DIGEST_MARKER + canOverwriteDigest in projects.mjs (deterministic, snapshot-tested in test/projects.test.mjs); explicit EXPORT button on PROJECTS page (never write-on-close — honors the vault's read-modify-write/null-abort decision) using existing ensureNote/readNote/writeNote flow, refuses to clobber hand-edited _AGENT.md. GATE: node --test green; manual: export twice cleanly, hand-edit then export → refusal toast.

### S12

SLICE 12 — Project-log quest: ~6 lines in src/main/index.js watchVault bump() (path regex for 'Claude Projects/*.md', underscore-excluded so digest export can't self-complete, one bump per debounce burst) + 1-line DAILY_POOL entry in quests.mjs + 6-line case in test/quests.test.mjs. GATE: node --test quests green; manual: edit Onyx.md in Obsidian → quest ticks within ~1s.

### S13

SLICE 13 — Time Capsule (wildcard 1, trust feature): pure first — new src/renderer/lib/diff.mjs (LCS line diff, 4e6-cell guard → 'big' fallback) + test/diff.test.mjs (identical/insert/delete/rewrite/empty/CRLF) — then new src/main/history.js (fnv1a32-named per-note dirs in userData, filename-embedded content hash for zero-read dedup, 30-snapshot prune, snapshot() try/catch-wrapped so a failed snapshot NEVER blocks the save) called at top of the existing vault:writeNote/deleteNote/renameNote handlers (index.js:116-157, one choke point each); history:list/history:read IPC with digits-only ts validation; restore = existing writeNote (self-snapshotting, so restore is undoable by construction); History panel + diff viewer in NoteReader.jsx. GATE: node --test diff green; manual: edit twice → two entries + correct diff, restore round-trips, deleted note's history survives; screenshot of history panel.

### S14

SLICE 14 — Graph physics play mode (wildcard 2, BrainView.js only): pointerdown grab with 6px promotion threshold (click/dblclick/fly-to untouched below threshold), camera-facing drag plane, pin sim node + zero velocity re-asserted after sim.tick, exponentially-smoothed throw velocity clamped to 8 units/tick, emissiveIntensity 2.0 while held, release on pointerup/pointerleave, _clear() nulls grab on graph update, 3 reused scratch Vector3s (zero per-frame allocs). GATE: manual — drag is cursor-locked with spring ripple, fling settles, single/double-click and empty-space OrbitControls regress clean, 60fps held; final full-app ONYX_SHOT pass across all 9 lenses + 4 modes closes the release.

## Cuts
- Idle Director + ambient event system (VISUALS 'should') — largest touch surface in the batch (12 files, all 8 views) for a passive feature; the Nexus lens already reads as the screensaver and Motion polish covers aliveness. Revisit v0.9; LinkPulses.surge() goes with it (trails don't need it).
- Vault Time Machine (wildcard) — strong demo but exceeds the 2-wildcard cap, and OneDrive ctime frequently reports download time, which quietly falsifies the replay story on this exact vault.
- Morning Brief (wildcard) — overlaps the Agent Digest (both compile vault state into a vault note); the digest wins because it directly serves the onyx-bridge agent contract. Fold its best ideas (stale-project lines) into a later digest revision if wanted.
- Focus Theater + WebAudio ambience (wildcard) — 260 lines and a whole audio subsystem serving no MUST; pomodoro widget already exists.
- Vault share-card PNG (wildcard) — lowest alignment with any brief item; pure vanity, cut without replacement.
- Confirmed proposer-rejected GPU items stay cut: MeshPhysicalMaterial transmission (2x scene render), BokehPass DOF (two depth passes), GodRaysShader (6+ passes/light), AfterimagePass (whole-frame smear), three separate Film/Vignette/RGBShift passes (replaced by the single combined GradeShader).
- RoomEnvironment's stock beige studio — replaced by the custom NebulaStudio PMREM scene inside Kit A (no external HDRI assets exist in-repo, and none are needed).

## Risks
- Frame-budget stacking on integrated GPU: physical materials (+~0.3ms), grade+OutputPass (+~1ms), trails, and the new lens each fit individually, but they land in ONE release — enforce the 60fps gate per visual slice with the devtools meter, not once at the end; if brain lens dips, first lever is grade-pass half-resolution, second is iridescence off.
- ACES + OutputPass is a global look change across all 8 existing lenses simultaneously — per-lens bloom retune (+0.1 strength) is an eyeball process and the most likely source of 'it looks worse now' regressions; screenshot-compare every lens against pre-Kit-B captures.
- PMREM texture is GL-context-bound and each view mounts its own renderer — a future 'optimization' caching it module-level will silently render black gems; the 20x-lens-switch renderer.info.memory.textures gate in slices 1 and 5 is the guard, keep it in the checklist forever.
- NexusView is the least-proven code in the release (custom noise shader, InstancedMesh picking via instanceId, setColorAt dim path) and its pure tests only cover mote math — hover/select/fly-to parity with BrainView is manual-QA only; budget real time on the picking map.
- Time Capsule snapshot() runs before every write/delete/rename on a OneDrive-synced vault — a sync lock mid-snapshot must never block or corrupt the actual save; snapshot failures are swallowed-and-logged by design (verify the try/catch actually wraps the whole call site in all three handlers).
- BROWSE live layer injects GitHub-sourced strings (repo names, descriptions, topics) into the UI — treat all live entries as untrusted display text (React's default escaping suffices, never dangerouslySetInnerHTML) and note the curated catalog's install commands can rot; UNVERIFIED chips and the https-only openExternal guard are the mitigations.
- parseProjectLog runs inside every vault reindex on agent-authored files — a malformed note must degrade to empty sections, never throw (the 'never throws' contract is load-bearing for the indexer; its tests must include garbage input).
- Physics grab shares pointer handling with BrainView's click/dblclick/OrbitControls — the primary navigation of the flagship mode; the 6px promotion threshold is the whole disambiguation story, regression-test it explicitly (slice 14 gate).
- watchVault quest bump keys off a path regex including the literal folder name 'Claude Projects' — if PROJECT_FOLDER ever changes, main/index.js and projects.mjs drift apart; import the const or leave a pointed comment at both sites.
- Total scope is ~2,300 lines across 14 slices — large for one release even with gates; if schedule slips, the pre-agreed cut order is slice 12 (quest) → slice 8 (live layer) → slice 14 (physics grab); slices 1-7, 9-11, and 13 are the non-negotiable core (kit, flagship, browse, workhorse, trust).

## AAA visuals proposals

### Cinematic Kit A — PMREM environment + physical gem materials (all 8 lenses) [must, ~90L]

**Value:** The single biggest AAA lever: gems currently use MeshStandardMaterial lit by 2 point lights, so facets read flat. A shared PMREM environment makes every facet catch colored studio reflections — instant 'real gemstone' look across all 8 lenses with zero per-frame cost.

**Design:** VERIFIED: three@0.169.0 installed; node_modules/three/examples/jsm/environments/RoomEnvironment.js exists. But skip RoomEnvironment's beige room — build a 30-line 'NebulaStudio' env scene that matches the space aesthetic: new THREE.Scene() containing (a) BackSide SphereGeometry(10) with MeshBasicMaterial vertex-colored gradient deep-navy(#050818 bottom)→violet(#2a1a5e top), (b) four emissive PlaneGeometry quads as area-light shapes: white 6x1 strip overhead (intensity via color multiplyScalar 8), cyan 3x3 left (#59f0ff x4), magenta 3x3 right (#ff4fd8 x4), amber 1x1 low-back (#ffb35e x3). New file src/renderer/lib/cinema.js exports makeEnv(renderer): const pmrem = new THREE.PMREMGenerator(renderer); const tex = pmrem.fromScene(nebulaStudioScene(), 0.04).texture; pmrem.dispose(); return tex. IMPORTANT edge case: each view constructs its OWN WebGLRenderer (SpaceCanvas.jsx mounts one view at a time), and PMREM textures are GL-context-bound — so generate per view mount (~15-30ms one-time on integrated GPU, invisible during mount) and tex.dispose() in each view's dispose(). NOT cached module-level. MATERIAL UPGRADE in scenery.js makeOrb(): replace MeshStandardMaterial with MeshPhysicalMaterial { color, emissive: color*0.35, emissiveIntensity 0.7 (slightly lower — env adds light), roughness 0.22, metalness 0.1, clearcoat 1.0, clearcoatRoughness 0.08, iridescence 0.35, iridescenceIOR 1.6, iridescenceThicknessRange [140,450], envMapIntensity 1.25, flatShading: kind !== 'sphere' }. DO NOT enable transmission — transmission forces an extra full scene render into the transmissionRenderTarget every frame (~2x scene cost), a killer on integrated GPU. Clearcoat+iridescence are fragment-ALU only: measured class ~0.3ms extra for 104 orbs at 1080p. Wire-up per lens (mechanical 3-line diff in each of the 8 view constructors): this.envTex = makeEnv(this.renderer); this.scene.environment = this.envTex — scene.environment auto-applies to ALL Standard/Physical materials, no per-material assignment needed (SolarSystemView suns use MeshBasicMaterial and correctly ignore it). dispose(): this.envTex.dispose(). Keep addLights() as-is — points lights still drive the emissive-pulse read; env supplies specular. Flat-shaded facets + clearcoat + colored env quads = actual cut-gem sparkle when orbs spin (they already spin via animateOrbs).

**Files:** src/renderer/lib/cinema.js, src/renderer/lib/scenery.js, src/renderer/views/BrainView.js, src/renderer/views/AtlasView.js, src/renderer/views/StacksView.js, src/renderer/views/ArchiveCityView.js, src/renderer/views/SolarSystemView.js, src/renderer/views/GraphView.js, src/renderer/views/CoreView.js, src/renderer/views/GlobeView.js

**Tests:** Visual: orbs show moving colored specular streaks while spinning. Perf: fps counter stays 60 in brain lens with 104 notes. Leak: switch lenses 20x, renderer.info.memory.textures returns to baseline (env tex disposed).

### Cinematic Kit B — shared makeComposer: ACES tonemap + bloom + one combined grade pass (grain/vignette/chroma) + OutputPass [must, ~120L]

**Value:** Kills 8 copies of composer boilerplate and adds the film look everywhere at once: ACESFilmic tonemapping (rich highlight rolloff on bloom), animated film grain, vignette, and edge chromatic aberration — the 'shot on a camera' feel that separates AAA from tech demo.

**Design:** VERIFIED available: OutputPass.js, ShaderPass.js, FilmShader.js, VignetteShader.js in node_modules/three/examples/jsm — but FilmShader+VignetteShader+RGBShift = 3 fullscreen passes; instead write ONE ~35-line combined GradeShader inline in cinema.js (single fullscreen pass, <0.5ms at 1080p integrated): uniforms { tDiffuse, time, grain: 0.035, vig: 0.32, chroma: 0.0015 }. Fragment: vec2 d = vUv - 0.5; float r2 = dot(d,d); RGB-split sample: col.r = texture(tDiffuse, vUv + d*chroma*r2).r, col.b = texture(tDiffuse, vUv - d*chroma*r2).b, col.g from center tap; grain: col += (fract(sin(dot(vUv*vec2(time*13.7,time*17.3), vec2(12.9898,78.233)))*43758.5453) - 0.5) * grain; vignette: col *= 1.0 - vig*smoothstep(0.35, 0.85, r2). cinema.js exports makeComposer(renderer, scene, camera, { w, h, bloom = [0.65, 0.5, 0.3] }): sets renderer.toneMapping = THREE.ACESFilmicToneMapping, renderer.toneMappingExposure = 1.1; chain = RenderPass → UnrealBloomPass(Vector2(w,h), ...bloom) → ShaderPass(GradeShader) → OutputPass (REQUIRED in r169: OutputPass applies tonemap + sRGB conversion at end of composer chain; without it ACES setting is ignored inside EffectComposer). Returns { composer, grade } — views call grade.uniforms.time.value = this._t in their loop (grain animates), composer.setSize in _resize, composer.dispose() in dispose (EffectComposer.dispose() exists in r169 and frees render targets; also call each pass .dispose()). Per-lens diff: replace the existing 3-line composer block with ({ composer: this.composer, grade: this.grade } = makeComposer(...)), pass each lens's current bloom numbers (city 0.75/0.5/0.28, stacks 0.5/0.4/0.3, rest 0.65/0.5/0.3) so nothing visually regresses except improves. Edge case: bloom threshold interacts with ACES (scene gets slightly darker pre-tonemap) — bump UnrealBloomPass strength +0.1 across the board and eyeball. FPS budget: OutputPass+grade ≈ 0.7ms total; UnrealBloom unchanged. Net new cost ~1ms, still 60fps.

**Files:** src/renderer/lib/cinema.js, src/renderer/views/BrainView.js, src/renderer/views/AtlasView.js, src/renderer/views/StacksView.js, src/renderer/views/ArchiveCityView.js, src/renderer/views/SolarSystemView.js, src/renderer/views/GraphView.js, src/renderer/views/CoreView.js, src/renderer/views/GlobeView.js

**Tests:** Visual: subtle animated grain, darkened corners, faint color fringe at screen edges, filmic highlight rolloff on bloom cores. Perf: <1.5ms frame-time delta (Chrome devtools FPS meter). Switch all 8 lenses — no console errors, no black frames.

### Idle Director + ambient event system (screensaver-grade cinematics) [should, ~260L]

**Value:** The 'stare for hours' feature: after 45s idle the camera begins a slow cinematic orbit-and-dolly through the graph's points of interest, and the scene stays alive with synapse storms, shooting stars, and nebula aurora pulses. Any input instantly returns control.

**Design:** Two pieces in cinema.js + pure math in new lib/cinemath.mjs (node --test coverage per house rule). (1) Director class: constructor(camera, controls, dom, { delay = 45 }). Wires pointerdown/wheel/keydown listeners on dom + controls.addEventListener('start') → this.lastInput = now. Pure helper idleWeight(lastInput, now, delay, ramp = 4) in cinemath.mjs returns 0..1 (0 before delay, smoothstep ramp over 4s after). update(t, dt): w = idleWeight(...); if w === 0 return; drive controls.autoRotate-style motion manually for dolly control: azimuth += dt * 0.05 * w; camera distance breathes: dist = baseDist * (1 + 0.10 * sin(t * 0.045)); controls.target lerps (rate 0.3*w*dt) along a THREE.CatmullRomCurve3(poi, closed: true).getPoint((t * 0.008) % 1) where poi = view-supplied points of interest — each lens passes getPOI(): BrainView = positions of 5 highest-degree nodes, SolarSystemView = 4 sun positions, NexusView = origin + 3 outer cluster centroids, others default [origin]. Curve rebuilt on update(graph). Because we mutate controls.target and let OrbitControls damping smooth it, user input composes naturally: on any input w snaps toward 0 (lastInput reset), damping eases control back — no snap. dispose(): remove listeners. Per-lens diff: this.director = new Director(...) in constructor, this.director.update(this._t, dt) in loop, director.setPOI(...) after graph update, director.dispose(). (2) AmbientEvents class (brain-mode aliveness, works in every lens): update(t, dt) rolls next event at now + 8 + rand*14 s; picks one of: [a] SYNAPSE STORM — calls pulses.surge(): add to LinkPulses a surge(duration = 3) method that multiplies assign[i].speed ×3 and material.size ×1.6, decaying linearly back over duration (~12 lines in scenery.js); [b] SHOOTING STAR — transient THREE.Line with 14 positions + vertexColors fading white→black (additive blending: black = invisible, so no per-vertex alpha needed), head at p = random point on sphere r=430, velocity tangent ~340 units/s, life 1.2s, shift positions each frame (head extends, tail follows), then geometry.dispose()+material.dispose()+remove; [c] AURORA PULSE — lerp the makeNebula mesh material.color from white toward 1.35×(0.8,0.9,1.3) and back over 4s sine (nebula mesh handle returned from makeNebula, stored by views). Perf: all near-zero — one transient draw call max. Edge cases: paused view (setPaused) → clock stops, events naturally freeze; dispose mid-event → transient objects tracked in this._live[] and force-disposed.

**Files:** src/renderer/lib/cinema.js, src/renderer/lib/cinemath.mjs, src/renderer/lib/scenery.js, src/renderer/views/BrainView.js, src/renderer/views/SolarSystemView.js, src/renderer/views/AtlasView.js, src/renderer/views/GraphView.js, src/renderer/views/CoreView.js, src/renderer/views/GlobeView.js, src/renderer/views/StacksView.js, src/renderer/views/ArchiveCityView.js, test/cinemath.test.mjs

**Tests:** node --test: idleWeight(0, 44, 45)===0, idleWeight(0, 49, 45)===1, monotone ramp between. Manual: leave brain lens untouched 45s → camera starts drifting; move mouse → control returns within 1s; within 2 min observe at least 3 ambient events.

### Motion polish — pulse trails, staggered orb spawn, focus ring on fly-to [should, ~110L]

**Value:** Comets instead of dots: every energy pulse drags a fading tail; orbs pop in with a staggered elastic bloom on graph load (a 'universe boots up' moment); selecting a note lands with an animated focus ring instead of a dead stop.

**Design:** All in scenery.js so all lenses inherit. (1) TRAILS in LinkPulses: verified rejected alternative — AfterimagePass (exists in examples) ghosts the whole frame including camera motion smear; instead extend the existing Points buffer: allocate count × (1 + TRAIL) points, TRAIL = 6. Each update(dt), before moving pulse i, copy its position chain back one slot (positions[i][k] = positions[i][k-1], a 18-float memmove per pulse — 90 pulses = trivial). Static color attribute: head white, tail slots colorHex × (1 - k/TRAIL)² toward black (additive blending already on → black tail = transparent fade, no alpha attribute needed). Size stays uniform (PointsMaterial limit) — decay via color is enough at size 3.2. ~25 changed lines; existing surge() from Ambient item stacks (storms = longer bright tails automatically). dispose unchanged. (2) SPAWN: animateOrbs(nodes, t, dt) already runs per lens; add optional per-record born field (views set rec.born = t + index * 0.012 in update(graph)); in animateOrbs scale *= easeOutBack(clamp((t - born)/0.6, 0, 1)) with easeOutBack in cinemath.mjs (c=1.70158 standard). Orbs with born undefined skip (backwards compatible). BrainView applies same factor in its inline animation block (it doesn't use animateOrbs — 3-line addition). Guard: label opacity multiplied by same factor so labels don't float over unspawned orbs. (3) FOCUS RING: scenery.js focusRingTexture() — 128px canvas, radial gradient ring (transparent→white ring at r 0.42-0.5→transparent), cached like softDot. showFocusRing(group, position, color): additive Sprite scale 6, animated in a tiny self-driving record list views tick: scale 6→14, opacity 0.9→0 over 0.7s, auto-remove+dispose (shared texture kept). BrainView._flyTo swaps its quadratic ease k = t*(2-t) for easeInOutCubic from cinemath.mjs (nicer arrival) and fires showFocusRing at target on arrival. Cost: one transient sprite. Skipped: BokehPass DOF — two extra scene-depth passes, too heavy for integrated GPU; bloom + ring reads as focus.

**Files:** src/renderer/lib/scenery.js, src/renderer/lib/cinemath.mjs, src/renderer/views/BrainView.js, test/cinemath.test.mjs

**Tests:** node --test: easeOutBack(0)===0, easeOutBack(1)===1, overshoots >1 in (0.4,0.9); easeInOutCubic endpoints. Manual: reload brain lens → orbs cascade-pop over ~1.5s; pulses show comet tails; click a node → cubic fly-in ends with expanding ring flash.

### Depth pass — dual-layer parallax starfield + billboard glow shafts [should, ~80L]

**Value:** Depth you can feel: a near star layer sliding against the far one under camera motion, plus cheap volumetric-looking light shafts around every bright center (suns, cores) — the 'god rays' read without the god-rays price.

**Design:** (1) PARALLAX STARFIELD: makeStarfield(count) currently returns one Points at r 380-840. Change signature to makeStarfield(count = 1400, layers = 2) returning a Group: layer 1 = existing far shell unchanged; layer 2 = 350 points at r 180-320, size 3.4, opacity 0.75, slightly blue-shifted tints. Parallax is free from perspective — no per-frame code. All 8 views already call makeStarfield() and dispose via group traversal in _clear (their loops iterate group.children — Group works since children carry geometry/material; verify ArchiveCityView's recursive dispose handles nesting — it does, it walks child.children). ~15 changed lines. Rejected: per-frame counter-rotation of layers — needless, camera parallax already sells it. (2) GLOW SHAFTS: scenery.js makeGlowShafts(colorHex, scale = 22): canvas 256x64 horizontal streak texture (linear gradient white core → transparent ends, squashed gaussian vertically), two crossed THREE.Sprite? No — sprites always face camera and can't cross; use 2 PlaneGeometry meshes with MeshBasicMaterial { map: streak, additive, depthWrite false, side: DoubleSide, opacity 0.5 }, rotated 90° apart around z, in a Group; views spin the group ±0.02 rad/s opposite via userData.spin consumed in their loop (or simplest: group.rotation.z += dt*0.03 by the caller). Placed at: SolarSystemView suns (4x), CoreView core, GlobeView core, NexusView core. VERIFIED-and-REJECTED: GodRaysShader.js exists in examples but is the multi-pass depth-masked Crysis technique (6+ passes per light) — not viable for 4 suns on integrated GPU. Billboard streaks cost 2 draw calls per sun, ~0.1ms total. Texture cached module-level like softDot (one per color via Map<hex,texture>, disposed never — bounded by palette size ~12). Dispose: geometry per-instance disposed via existing _clear walks; shared textures kept (same policy as softDot/label cache).

**Files:** src/renderer/lib/scenery.js, src/renderer/views/SolarSystemView.js, src/renderer/views/CoreView.js, src/renderer/views/GlobeView.js

**Tests:** Manual: orbit camera in any lens — near stars visibly slide against far shell; suns show slowly counter-rotating light streaks. Perf: renderer.info.render.calls increases by ≤10 in solar lens; 60fps held.

### NEXUS CORE — flagship lens: living neural nebula with chromatic plasma heart [must, ~380L]

**Value:** The jaw-dropper and the ninth lens: your whole vault as a galactic neural organism — a breathing plasma core, GPU-instanced gem swarm in a galactic disc, and 1200 light-motes streaming along curved link splines that accelerate as they fall toward the center. Built to be stared at.

**Design:** New src/renderer/views/NexusView.js, registered as 'nexus' in SpaceCanvas VIEWS map, ViewSwitcher.jsx list ('◉ Nexus Core'), and App.jsx command palette ('View: Nexus Core'). Same class contract as siblings (update/setActive/setLabels/setPaused/focus/dispose; onSelect/onHover). LAYOUT: reuse createSim(ids, links) from lib/force.mjs, tick(300) warmup, then flatten to galactic disc: display position = (x, y*0.35, z), radius normalized so max ‖p‖ ≈ 130. CORE (the heart): IcosahedronGeometry(6, 4) + custom ShaderMaterial (~55 lines, inline): vertex — displace along normal by 0.6 * n where n = sum of two value-noise octaves via hash(floor(pos*f)+t-scroll) trilinear-lerped (cheap, no texture); fragment — fresnel = pow(1 - dot(N,V), 2.5), color ramp mix(#3b1a8e violet, #59f0ff cyan, n) + fresnel * white * 2.2 (feeds bloom hard), uniform time. Two TorusGeometry(9.5, 0.07, 8, 90) rings, MeshBasicMaterial additive #7f9dff opacity 0.5, tilted ±24°, counter-rotating 0.1 rad/s. Shard halo: ONE THREE.InstancedMesh(unitGeometry('octa'), MeshPhysicalMaterial from kit, 48) — shards orbit on individually-phased tilted ellipses r 11-15, scale 0.25-0.5, per-frame setMatrixAt from pure helper shardMatrix(i, t) values computed in cinemath.mjs (48 matrix writes/frame — trivial). NODES AS INSTANCES (draw-call win vs 104 meshes elsewhere): 5 InstancedMesh, one per gem kind from scenery.js shapeFor/unitGeometry (sharedGeo — never disposed), each with the kit MeshPhysicalMaterial (white base) + per-instance instanceColor = cluster color from detectClusters/CLUSTER_PALETTE; per-frame compose matrix (position + spin from hashed seed + pulse scale) with a scratch Object3D, setMatrixAt + instanceMatrix.needsUpdate. setActive dims via setColorAt (color × 0.15 for inactive) — instanceColor.needsUpdate. PICKING: Raycaster natively returns instanceId on InstancedMesh; map (mesh,instanceId)→note.id for hover/select/fly-to; reuse BrainView's hover-card projection block verbatim. LABELS: reuse makeLabel + BrainView's distance-fade/cull loop. LINK FLOW (showpiece): at update(graph), for each link build THREE.CatmullRomCurve3([A, mid.lerp(origin, 0.35) + up*(4+‖A-B‖*0.08), B]), sample 24 points via curve.getPoints into one flat Float32Array table (links × 24 × 3) — built ONCE, no per-frame curve math. Pure helpers in new lib/flow.mjs (node --test): buildCurveTable(segments, samples) (Catmull-Rom basis implemented pure — no three import — so it's testable; three's curve only used nowhere) and advanceMote(mote, dt, table) returning interpolated xyz with speed × (1 + 2.2/(1 + d²/900)) core-gravity acceleration (d = distance to origin). ONE THREE.Points, count = min(1200, links*6) motes: position attr updated per frame (CPU: 1200 × ~15 flops ≈ free), static color attr = mix(clusterColor, white, 0.35), softDot() map, size 2.6, additive. ATMOSPHERE: makeNebula('#2a0a4d', '#0a2a4c'), dual-layer makeStarfield from depth item, makeGlowShafts at core, kit composer with bloom [0.85, 0.55, 0.25] (hotter than siblings — this lens is allowed to glow). Draw calls: 5 instanced + 1 motes + core + 2 rings + 1 shards + shafts 2 + nebula 1 + starfield 2 ≈ 15 (vs ~200+ in brain lens) — the CHEAPEST lens despite looking the richest; 60fps with margin on integrated GPU. DISPOSE: instanced meshes → material.dispose only (sharedGeo), core shader material + torus geo disposed, motes geo+mat disposed, env/composer via kit handles; verify with renderer.info after 20 switches. Idle Director POI = origin + 3 farthest cluster centroids — this lens IS the screensaver.

**Files:** src/renderer/views/NexusView.js, src/renderer/lib/flow.mjs, src/renderer/views/SpaceCanvas.jsx, src/renderer/views/ViewSwitcher.jsx, src/renderer/App.jsx, test/flow.test.mjs

**Tests:** node --test flow.test.mjs: buildCurveTable endpoints equal input endpoints, monotone t sampling, advanceMote wraps t>1 and accelerates near origin (speed(d=0) > speed(d=100)). Manual: switch to Nexus lens with real 104-note vault — 60fps (devtools), hover/click/double-click parity with brain lens, renderer.info.render.calls ≤ 20.


## Browse tab proposals

### skill-catalog.mjs — curated static catalog + pure browse logic [must, ~340L]

**Value:** The always-works, offline foundation of the BROWSE tab: ~38 REAL ecosystem entries plus every pure function the UI needs (search, installed cross-ref, vault-tag fit scoring, live-data merge). Testable with node --test like every other lib/*.mjs.

**Design:** NEW FILE src/renderer/lib/skill-catalog.mjs. Exports:

1) `export const CATALOG` — array of ~38 entries, shape: `{ id, name, kind: 'skill'|'plugin'|'marketplace'|'tool', repo: 'owner/name'|null, url, description (<=200 chars), install (exact copy-paste command), tags: string[], tier: 'essential'|'popular'|'niche', uncertain?: true }`. Entries are REAL things verified against knowledge through Jan 2026; anything I can't fully vouch for carries `uncertain: true` and the UI renders an 'UNVERIFIED' chip. Concrete list (curator can prune): OFFICIAL — anthropics/skills (official Agent Skills repo; split into 5 entries: document-skills docx/pdf/pptx/xlsx, mcp-builder, artifacts-builder, webapp-testing, canvas-design; install hint `git clone https://github.com/anthropics/skills ~/.claude/skills-official` + copy dirs), anthropics/claude-code official plugin marketplace (install `/plugin marketplace add anthropics/claude-code`, mark uncertain:true on exact repo path), anthropics/claude-code-security-review (security-review action/command), anthropics claude-code-action (kind tool, CI reviewer). COMMUNITY MARKETPLACES/COLLECTIONS — obra/superpowers via obra/superpowers-marketplace (`/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers`), hesreallyhim/awesome-claude-code (kind marketplace/list), davila7/claude-code-templates (aitmpl.com, `npx claude-code-templates@latest`), wshobson/agents, wshobson/commands, VoltAgent/awesome-claude-code-subagents, brennercruvinel/CCPlugins, SuperClaude-Org/SuperClaude_Framework, ruvnet/claude-flow, Pimzino/claude-code-spec-workflow, disler/claude-code-hooks-mastery, OneRedOak/claude-code-workflows (uncertain), EveryInc every-marketplace / compounding-engineering plugin (uncertain), musistudio/claude-code-router (kind tool), ericbuess/claude-code-docs, getAsterisk/claudia GUI (kind tool, uncertain on rename to opcode), vijaythecoder/awesome-claude-agents (uncertain), claude-plugins.dev community directory (uncertain). Tags drawn from a fixed vocabulary: ['agents','automation','betting','ci','debugging','design','docs','git','mcp','obsidian','pkm','productivity','research','security','sports','testing','ui','workflow','writing'].

2) `searchCatalog(entries, q)` — case-insensitive substring over name+description+tags; empty q returns all. One line-ish filter.

3) `markInstalled(entries, arsenalSkills)` — returns entries with `.installed` set. Match rule: normalize both sides via `norm(s)=s.toLowerCase().replace(/^claude-/, '')`; an entry is installed if any arsenal skill's `norm(name)`, `norm(plugin||'')`, or name-prefix (entry 'superpowers' matches arsenal skill plugin==='superpowers') equals `norm(entry.name)` or `norm(entry.repo?.split('/')[1])`. Reuses the exact arsenal payload SkillsMode already polls every 60s — zero new scanning.

4) `vaultTopTags(notes, n=10)` — count `note.tags` (already indexed by vault-indexer), return top-n lowercase. Pure O(notes).

5) `fitScore(entry, topTags)` — |intersection(entry.tags, expand(topTags))| where `expand` applies a tiny hardcoded alias map ({ bet:'betting', bets:'betting', projection:'betting', esports:'sports', note:'pkm', notes:'pkm', obsidian:'pkm', claude:'agents', ai:'agents', research:'research' }) so the user's real vault tags (betting/projections/research) hit catalog tags. 'FITS YOUR PROJECT' filter = fitScore > 0, sorted desc.

6) `mergeLive(catalog, liveRepos)` — liveRepos from the cache shape (see live-layer feature). Match by `full_name === entry.repo` (case-insensitive) → set `entry.stars`, `entry.liveUpdatedAt`. Unmatched live repos become synthetic entries `{ id: 'live:'+full_name, kind: 'plugin', name, description, url: html_url, tags: topics.filter(t=>t!=='claude-code').slice(0,5), tier: stars>=500?'popular':'niche', install: '/plugin marketplace add '+full_name, live: true }`. Null/absent liveRepos → catalog unchanged (offline degrade is a no-op).

NEW FILE test/skill-catalog.test.mjs (node --test, mirrors test/installed-skills.test.mjs style): asserts every CATALOG entry has valid kind/tier/https-url/nonempty install; searchCatalog hit+miss; markInstalled matches 'superpowers' plugin arsenal fixture and claude- prefix stripping; vaultTopTags ordering; fitScore alias expansion (['bets'] matches a 'betting'-tagged entry); mergeLive star-attach + synthetic entry + null passthrough.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/skill-catalog.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/test/skill-catalog.test.mjs

**Tests:** node --test test/skill-catalog.test.mjs — catalog schema integrity, search, installed cross-ref against a superpowers/firecrawl arsenal fixture, vault-tag fit scoring with aliases, live-merge with and without data.

### Optional live layer — GitHub search fetch, 24h cache, offline fallback [should, ~65L]

**Value:** Fresh star counts and discovery of NEW community plugins beyond the frozen catalog, honestly scoped: no official registry JSON exists, so we use the only real no-auth endpoint (GitHub search API) twice a day, cached in the existing store, and the tab is 100% functional offline.

**Design:** NEW FILE src/main/browse-live.js (~55 lines). `export async function fetchBrowseLive()`:

1) Read cache: `storeGet('browse-cache')` (reuses src/main/store.js — name passes NAME_RE, atomic writes already solved). Shape: `{ fetchedAt: msEpoch, repos: [{ full_name, name, description, html_url, stargazers_count, topics, pushed_at }] }`. If `Date.now() - fetchedAt < 24*3600e3` → return cache immediately (no network).

2) Fetch (Electron main has global fetch, Node>=18): exactly two requests —
  GET https://api.github.com/search/repositories?q=topic%3Aclaude-code-plugin&sort=stars&order=desc&per_page=30
  GET https://api.github.com/search/repositories?q=topic%3Aclaude-code-skills&sort=stars&order=desc&per_page=30
  Headers: `{ Accept: 'application/vnd.github+json', 'User-Agent': 'onyx-browse' }` (GitHub 403s without a UA). Each wrapped in `AbortSignal.timeout(8000)`. Unauthenticated search quota is 10 req/min — 2 per 24h is 0.01% of budget; no auth, no key storage. Dedupe merged items by full_name, keep only the fields in the cache shape (topics array capped at 8), cap at 50 repos.

3) Any failure (offline, 403 rate-limit, non-200, timeout, JSON parse) → return the STALE cache if one exists, else null. Never throws; console.error once. // ponytail: two hardcoded queries, add a topics list constant only if a third topic ever matters.

4) On success: `storeSet('browse-cache', payload)` then return payload.

WIRING (3 lines each): src/main/index.js `ipcMain.handle('browse:live', () => fetchBrowseLive())` + import; src/preload/index.js `getBrowseLive: () => ipcRenderer.invoke('browse:live')`. Renderer treats null as 'offline — showing curated catalog' (small u-label line under the search box). Fetch runs in MAIN deliberately: no renderer CORS concerns, matches the existing trust-boundary pattern (openExternal guard lives in main), and the renderer never touches the network.

HONESTY NOTE carried into a code comment: there is no public Claude plugin registry JSON endpoint as of Jan 2026; marketplaces are git repos with .claude-plugin/marketplace.json. If Anthropic ships a registry later, swap the two GitHub URLs for it — cache shape and UI stay identical.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/main/browse-live.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/main/index.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/preload/index.js

**Tests:** Manual: run app online → BROWSE shows star counts + 'live' entries; check %APPDATA%/onyx-store-browse-cache.json exists with fetchedAt; disconnect network, wipe cache, relaunch → tab renders full curated catalog with 'OFFLINE — CURATED CATALOG' notice, zero errors. mergeLive logic itself is covered by the node --test in the catalog feature.

### BROWSE tab UI — card grid, search, fit filter, INSTALLED badges, copy-install [must, ~230L]

**Value:** The discovery surface itself: a house-chrome card grid inside SkillsMode where the user (and the Claude agent reading the screen) sees what exists, what's already installed, what fits this vault's actual tags, and gets a one-click copy of the exact terminal install command. Discovery only — installation never leaves the user's terminal.

**Design:** NEW FILE src/renderer/components/BrowseSkills.jsx (~150 lines), plain React + existing CSS vocabulary (glass, u-label, num, brk classes from index.css) — NO Three.js, no canvas; this tab is DOM like QUESTS, so it costs zero GPU and needs no dispose logic.

Props: `{ arsenal, notes }` (arsenal = the same state SkillsMode already polls every 60s; notes = graph.notes for tags).

State: `q` (search string), `filter` ('all'|'fits'|'installed'|'skill'|'plugin'|'marketplace')`, `live` (null|cache payload), `copied` (entry id | null).

Data flow (all pure calls from skill-catalog.mjs): `useEffect` once → `window.onyx.getBrowseLive?.().then(setLive)` (optional-chained so the tab works even before the live-layer feature lands). `useMemo`: `entries = markInstalled(mergeLive(CATALOG, live?.repos), arsenal?.skills || [])`; `topTags = vaultTopTags(notes)`; then apply filter (fits → fitScore(e, topTags) > 0 sorted by score desc then tier; installed → e.installed; kind filters literal) and `searchCatalog(entries, q)`. Sort default: tier order essential→popular→niche, stars desc within tier.

LAYOUT: header row — search `<input className='browse-search' placeholder='SEARCH SKILLS & PLUGINS'>` + filter chip buttons (reuse .sk-tab styling) `ALL / FITS YOUR PROJECT (n) / INSTALLED (n) / SKILLS / PLUGINS / MARKETPLACES` + right-aligned u-label status: `LIVE · UPDATED {ago}` or `OFFLINE — CURATED CATALOG`. Below: `.browse-grid` = CSS `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; overflow-y: auto` (native scroll, no zoom/wheel handling needed).

CARD (.browse-card.glass.brk): top row — name (.sk-name, colored by kind via 3-entry const map using existing CLUSTER_PALETTE colors) + badges: `INSTALLED ✓` (accent pill, from cross-ref), kind chip, `★ {stars}` (.num, only when live), `UNVERIFIED` dim chip when entry.uncertain. Middle: 2-line clamped description (`-webkit-line-clamp:2`), tag chips (max 5, tiny .u-label pills; tags intersecting topTags get accent border = visible 'why this fits you'). Bottom row, two buttons: `COPY INSTALL` → `navigator.clipboard.writeText(entry.install)` then setCopied(id) + 1.5s timeout flips label to `COPIED ✓` (clipboard API works in the renderer, no new IPC); `REPO ↗` → `window.onyx.openExternal(entry.url)` (existing main-process http(s)-only guard is the trust boundary — nothing to add). NO install/run button exists anywhere: safety is structural, the app can only put text on the clipboard and open a browser.

SkillsMode wiring (~12 lines in src/renderer/modes/SkillsMode.jsx): add 4th tab button `BROWSE` after QUESTS; header status line for browse = `DISCOVERY ONLY · INSTALL FROM YOUR TERMINAL · NEVER AUTO-INSTALLS`; render `{tab === 'browse' && <BrowseSkills arsenal={arsenal} notes={notes} />}`. App.jsx one-liner: pass `notes={graph?.notes || []}` into <SkillsMode> at the existing line-715 call site (graph is already in scope). CSS: ~55 lines appended to src/renderer/index.css (.browse-grid, .browse-card, .browse-search, .badge-installed, .tag-chip, .tag-chip.fit) reusing var(--card)/var(--accent)/var(--text-faint) tokens.

Perf: pure DOM, ~40-90 cards, single re-render on search keystroke (useMemo keyed on q/filter/live/arsenal) — nothing for the integrated GPU to do; brain-mode canvas pause behavior untouched.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/BrowseSkills.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/modes/SkillsMode.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/App.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/index.css

**Tests:** Run app → skills mode → BROWSE: superpowers card shows INSTALLED ✓ (matches live arsenal scan of this machine); type 'security' → filters to security-review; click FITS YOUR PROJECT → betting/research-tagged entries surface first with accent-bordered matching tags; COPY INSTALL puts exact command on clipboard (paste in terminal to verify); REPO ↗ opens default browser; ONYX_SHOT screenshot harness (already in main/index.js) captures the tab for visual check.


## Workhorse proposals

### lib/projects.mjs — project-log parser + index-time plumbing [must, ~240L]

**Value:** Turns the onyx-bridge contract notes (Claude Projects/<name>.md with ## Status/## Done/## Next/## Decisions) into structured data every mode can consume. This is the data spine for the whole agent-workhorse loop.

**Design:** NEW FILE src/renderer/lib/projects.mjs (pure, no imports except dayKey from './stats.mjs'). Exports:

1) `export const PROJECT_FOLDER = 'Claude Projects'` — single source for the contract folder name (matches the onyx-bridge SKILL.md contract verbatim).

2) `parseProjectLog(content)` → `{ status:'', done:[{date,text}], next:[string], decisions:[{date,text}] }`. Algorithm: (a) strip optional frontmatter with the exact regex already used in DashboardMode.jsx line 379: `content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')` — tolerant to being fed either raw file or gray-matter content. (b) split `/\r?\n/`; walk lines with a `cur` section pointer. Heading detect `/^##\s+(.+?)\s*$/`; canonicalize by lowercase startsWith: 'status'→status, 'done'→done, 'next'→next, 'decision'→decisions (tolerates '## Done (dated, append-only)', '## Decisions log'); any other ## heading sets cur=null (ignored); `#`/`###` headings and preamble ignored. (c) inside done/next/decisions: bullet `/^\s*[-*+]\s+(.*)$/`; a non-bullet, non-empty line while a bullet is open is a continuation → append with single space (agents wrap long entries). (d) inside status: collect non-empty lines, join with ' ', collapse `\s+`. (e) dated-entry split on each done/decisions bullet: `/^(\d{4}-\d{2}-\d{2})\s*(?:[—–-]\s*)?(.*)$/` → {date, text}; no match → {date:null, text:bullet}. next stays plain strings. Always returns all four keys (empty string / empty arrays when sections missing) — never throws.

3) `lastDoneDate(log)` → max `done[].date` (YYYY-MM-DD strings compare lexically) or null. `isStale(log, mtime, now, days=7)` → boolean: use lastDoneDate; if no dated Done entries fall back to mtime; stale when the reference date/ms is older than `now - days*86400000` (compare dates via dayKey from stats.mjs).

4) `collectProjects(notes)` → `notes.filter(n => n.projectLog && !n.path.split('/').pop().startsWith('_')).sort((a,b)=>(b.mtime||0)-(a.mtime||0))` — underscore filter keeps _AGENT.md out.

INDEXER PLUMBING (src/main/vault-indexer.mjs, +5 lines, same pattern as parseTasks/parseCards imports at top): `import { parseProjectLog, PROJECT_FOLDER } from '../renderer/lib/projects.mjs'`; in the note-build loop, after `wordCount`: `...(data.type === 'project-log' || folderId === PROJECT_FOLDER ? { projectLog: parseProjectLog(content) } : {})`. Runs on ~1-5 notes per scan — O(lines) each, zero perf impact; survives the `publicNotes` destructuring untouched (only `_content` is stripped). Live updates for free: chokidar reindex → vault:update → dashboard rerenders.

TESTS test/projects.test.mjs (node --test, mirrors sibling test style): parses the real Onyx.md shape (dated em-dash bullets); missing sections → empty defaults; CRLF input; `*` bullets; heading suffix '## Done (dated, append-only)'; undated bullets → date:null; continuation-line join; frontmatter both present and pre-stripped; collectProjects underscore + sort; isStale boundary (exactly 7d = not stale, 8d = stale) and mtime fallback.

**Files:** src/renderer/lib/projects.mjs, src/main/vault-indexer.mjs, test/projects.test.mjs

**Tests:** node --test test/projects.test.mjs passes; node --test test/indexer.test.mjs still passes; add one fixture note under test/fixture-vault/Claude Projects/ and assert scanVault attaches .projectLog

### Dashboard 5th page: PROJECTS (winner over OVERVIEW panel / NOTES scope) [must, ~130L]

**Value:** The human-facing half of the agent loop: see per-project what Claude did, what's queued, what's gone stale — without opening a single note. Also proves the bridge is alive (BRIDGE indicator).

**Design:** SURFACING EVALUATION → dashboard 5th page WINS. (a) OVERVIEW panel: already 7 panels; a project card needs Status+Next+Done width, would evict SYNAPSE SUGGESTIONS — rejected. (b) NOTES smart scope: gives a file list, not parsed Status/Next/staleness, and duplicates the existing folder filter — rejected. (c) Dashboard page: the PAGES array + page-gated useMemo pattern (insights/healthCalcs, DashboardMode.jsx lines 20, 233-258) already exists, [ ]-cycling and persisted page choice come free, full 12-col dash-grid for cards. Change `PAGES = ['overview','today','projects','analytics','health']`.

IMPLEMENTATION in DashboardMode.jsx, exactly the established idioms:
- `const projects = useMemo(() => page !== 'projects' ? null : collectProjects(graph.notes), [graph, page])` — page-gated like insights.
- BRIDGE indicator: page-gated fetch mirroring the snaps effect: `useEffect(() => { if (page!=='projects') return; window.onyx.getInstalledSkills().then(r => setBridge(!!r?.skills?.some(s => s.source==='user' && s.name==='onyx-bridge'))) }, [page])` (preload `getInstalledSkills` already exists, main handler skills:installed). Header strip (span12, house chrome): `BRIDGE ●` green + 'onyx-bridge installed — agents log to this vault' when true; `BRIDGE ○` + dp-warn 'skill missing — install ~/.claude/skills/onyx-bridge so agents keep logs' when false; while null show 'BRIDGE —'.
- Per-project card `<section className="dpanel brk panel-in span6">` (two per row, wraps at 104-note scale fine): title row = note title + decisions count chip (`dchip`, '5 DECISIONS') + OPEN button → existing `onSelect(n.id)` (routes to NoteReader). STATUS: `n.projectLog.status` in a div clamped via existing dp-sub styling + `-webkit-line-clamp:3` (one new CSS rule `.proj-status`). LAST DONE row: `lastDoneDate` + last dated entry text + `relAge(n.mtime, now)` (reuse relAge import). NEXT list: first 5 of `projectLog.next` as plain `cp-item`-styled rows with '▹' prefix, '+N MORE' u-label if longer (task-more class). STALENESS: `isStale(n.projectLog, n.mtime, now, 7)` → `<div className="dp-warn">no Done entry in {days}d — project going cold</div>` (dp-warn class exists, StreakPanel uses it).
- Empty state (no project notes): single span12 panel explaining the contract: folder name, template headings, and that the onyx-bridge skill auto-creates them — plus a 'CREATE PROJECT LOG' button calling existing `window.onyx.createNote(PROJECT_FOLDER, name)` then writeNote with the SKILL.md template string.
CSS: ~15 lines in index.css (.proj-status clamp, .proj-next row tint). No Three.js, no canvas, DOM only — zero GPU cost; page-gating keeps parse/scan work off other pages.

**Files:** src/renderer/modes/DashboardMode.jsx, src/renderer/index.css

**Tests:** ONYX_SHOT screenshot harness (env-gated in src/main/index.js) with ONYX_SHOT_JS clicking the PROJECTS tab: card shows Onyx project with status, dated last-done, next list, decisions chip, green BRIDGE dot; logic (collectProjects/isStale) already covered by test/projects.test.mjs

### Agent handshake: _AGENT.md digest, explicit-export only [must, ~110L]

**Value:** One machine-readable file an agent reads to orient in seconds: vault stats, every active project's Status+Next, top tags. Closes the loop from the app back to Claude sessions.

**Design:** DECISION: explicit 'EXPORT AGENT DIGEST' button on the PROJECTS page — NOT write-on-app-close. Rationale: silent writes violate the vault's recorded decision ('All vault writes: read-modify-write, null-read abort'), before-quit writes race OneDrive file locks, and a stale-but-explicit digest beats a corrupted silent one. The digest carries its own timestamp so staleness is self-evident to the reading agent.

PURE BUILDER in src/renderer/lib/projects.mjs: `export const DIGEST_ID = PROJECT_FOLDER + '/_AGENT.md'`; `export const DIGEST_MARKER = '<!-- onyx:agent-digest'`; `buildAgentDigest({ graph, now, version })` → markdown string:
```
---
title: _AGENT
type: agent-digest
---
<!-- onyx:agent-digest · generated by Onyx v{version} · {ISO} · do not hand-edit -->
# Agent Digest · {YYYY-MM-DD HH:mm}

## Vault
- {noteCount} notes · {linkCount} links · {totalWords} words · {orphans} orphans
- top tags: {top 10 as #tag ×n, comma-joined}

## Active Projects ({n})
### {title} — last touch {YYYY-MM-DD}
Status: {status, truncated 400 chars}
Next:
- {each next item}
Last done: {date} — {text}   (omit line if none)
Decisions: {count} — read [[{basename}]] before working

## Contract
- Full logs: {PROJECT_FOLDER}/<name>.md · read ## Done before redoing anything
```
Inputs all exist on graph: meta.noteCount/linkCount, wordCount sum, orphan count via inLinks/outLinks empties, `topTags` reused from './dashboard.mjs', projects via collectProjects. Deterministic given (graph, now, version) → snapshot-testable.

GUARD `canOverwriteDigest(raw)` → `raw == null || String(raw).includes(DIGEST_MARKER)` — Onyx only ever clobbers files it authored.

WRITE FLOW (handler in DashboardMode, uses existing preload only): (1) `const md = buildAgentDigest(...)`. (2) `const r = await window.onyx.ensureNote(DIGEST_ID, md)` — wx-flag create; if `r?.created` → success toast, done; if `r == null` → err toast abort. (3) exists: `const cur = await window.onyx.readNote(DIGEST_ID)`; `cur == null` → err toast 'digest unreadable — try again' (null read = lock, never a license to guess, per house rule); `!canOverwriteDigest(cur)` → err toast 'refusing: _AGENT.md was hand-edited — delete it to re-enable export'; else `await window.onyx.writeNote(DIGEST_ID, md)` → toast '⇪ agent digest exported' via existing bus. writeNote already triggers reindex+broadcast. _AGENT.md stays out of project cards via the underscore filter in collectProjects; its `type: agent-digest` frontmatter keeps it honest in the graph.

Optional 1-line bonus: onyx-bridge SKILL.md gains 'read Claude Projects/_AGENT.md first if present' — outside this repo, mention in ship notes.

TESTS (extend test/projects.test.mjs): digest contains marker as first body line, all project titles, next items verbatim, tag counts; canOverwriteDigest true for null/marker-bearing, false for arbitrary user text; digest of empty-projects graph still emits ## Vault (no throw).

**Files:** src/renderer/lib/projects.mjs, src/renderer/modes/DashboardMode.jsx, test/projects.test.mjs

**Tests:** node --test test/projects.test.mjs (builder + guard cases); manual: click EXPORT twice (second overwrites cleanly), hand-edit _AGENT.md, click again → refusal toast

### Quest: 'Update a project log' (projectLogEdit counter) [could, ~20L]

**Value:** Rewards keeping the agent loop warm — the staleness warning's carrot counterpart.

**Design:** COUNTER NAMESPACE WEIGHED: appdata.js counters are an open, regex-validated namespace (NAME_RE, /^[a-zA-Z][a-zA-Z0-9.]{0,39}$/) bumped main-process-only — 'projectLogEdit' needs zero schema work and satisfies quests.mjs anti-cheese rule 2 (main-only increments). Verdict: cheap, take it.

MAIN (src/main/index.js watchVault, ~6 lines): chokidar handlers already receive the path — currently ignored. `let sawProjectLog = false`; in `bump(p)`: `if (/[\\/]Claude Projects[\\/][^\\/]+\.md$/.test(String(p||'')) && !String(p).split(/[\\/]/).pop().startsWith('_')) sawProjectLog = true`; inside the existing debounce timeout, next to the vaultEdit bump: `if (sawProjectLog) { bumpUsage('projectLogEdit'); sawProjectLog = false }`. Catches BOTH agent edits from outside (the common case — Claude writing via filesystem) and in-app edits, one bump per debounced burst (300ms) so a single save isn't multi-counted. _AGENT.md excluded so exporting the digest can't self-complete the quest.

QUESTS (src/renderer/lib/quests.mjs, 1 line): DAILY_POOL += `{ id: 'project-log-1', label: 'Update a project log', metrics: ['projectLogEdit'], target: 1, xp: 25 }`. Deterministic day-seeded pick and fresh-base instantiation already handle the new pool size; reroll covers the day it lands for someone without the folder.

TEST: one case in test/quests.test.mjs asserting the new quest completes on a projectLogEdit delta and respects base capture (existing questValue/tickQuests helpers make this 6 lines).

**Files:** src/main/index.js, src/renderer/lib/quests.mjs, test/quests.test.mjs

**Tests:** node --test test/quests.test.mjs; manual: edit Claude Projects/Onyx.md in Obsidian → MOMENTUM/quests tick within ~1s via chokidar


## Wildcard proposals

### Time Capsule — local note version history with diff viewer [must, ~320L]

**Value:** The single biggest trust feature: every write/delete/rename silently snapshots the previous content into userData, so a bad edit, a Claude-agent overwrite, or a OneDrive sync mangle is always recoverable across sessions. Turns Onyx from 'viewer I might edit in' into 'the place I edit'.

**Design:** MAIN (new src/main/history.js, ~90 lines): dir per note = userData/onyx-history/<fnv1a32(id).toString(16)>-<sanitized basename, 24 chars>/ (reuse fnv1a32 from src/renderer/lib/hash.mjs — main already imports renderer libs, see appdata.js importing dashboard.mjs). API: `async snapshot(vaultPath, id)` — try readNoteRaw(vaultPath, id); if file missing return; compute fnv1a32(content); read dir's newest entry name (files named `<Date.now()>-<hash>.md`, hash embedded in filename so dedup needs zero file reads); if hash matches newest, skip; else writeFile `<ts>-<hash>.md`, then prune: readdir, sort desc, unlink beyond 30 (ponytail: 30-cap, no size budget — 104 notes × 30 × ~5KB ≈ 15MB worst case). Also write meta.json {id} once for future GC/inspection. WIRING (src/main/index.js, ~10 lines): call `await snapshot(vaultPath, id)` at top of the vault:writeNote and vault:deleteNote handlers, and for the old id in vault:renameNote — one choke point each, all callers covered. IPC (2 new handlers + preload): history:list(id) → [{ts,size}] from readdir (parse ts prefix, validate /^\d+-/); history:read(id, ts) → file content (validate ts is digits — trust boundary, no path chars accepted). RESTORE needs no new IPC: renderer calls existing writeNote(id, oldContent) — which itself snapshots the current version first, so restore is undoable by construction. PURE DIFF (new src/renderer/lib/diff.mjs, ~60 lines + node --test): diffLines(a,b) — split on /\r?\n/, classic LCS DP over line arrays (correct on edge cases: empty file, identical, full rewrite); guard: if a.length*b.length > 4e6 return [{type:'big'}] and the UI shows plain old-version text instead (never freezes on a pathological note). Output rows {type:'same'|'add'|'del', text}. UI (NoteReader.jsx, ~120 lines): 'History' button in the existing reader toolbar → right-side panel (house chrome: same panel styling as ResurfacePanel) listing snapshots as relative times ('2h ago', '3d ago'); selecting one renders the diff (green/red row backgrounds, monospace, virtualless — capped notes are small) with a 'Restore this version' button + confirm. DATA FLOW: renderer never touches the filesystem; everything routes through the two vault-scoped handlers. EDGE CASES: rename keeps the old dir (history of the old name is preserved; new name starts fresh — acceptable, documented); external Obsidian edits are NOT snapshotted (chokidar-driven snapshots would double-fire on OneDrive — deliberately only Onyx-initiated writes, comment it). PERF: snapshot adds one read+write per save, imperceptible.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/main/history.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/main/index.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/preload/index.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/diff.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/test/diff.test.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/NoteReader.jsx

**Tests:** node --test on diff.mjs (identical/insert/delete/rewrite/empty/CRLF cases). Manual: edit a note in Onyx twice, open History → two entries, diff shows the change, Restore brings old text back AND adds a new snapshot; delete a note → its history dir still holds the last content.

### Graph physics play mode — grab and throw thoughts [must, ~95L]

**Value:** Grab any orb with the mouse, drag it, fling it, and watch the whole brain ripple through the springs. Pure AAA-feel toy physics with zero new physics code — the existing force sim already does all the work. This is the 'sit and stare/play for hours' feature with the best wow-per-line in the whole list.

**Design:** ALL inside BrainView.js (~90 lines), zero changes to force.mjs — sim nodes are plain mutable {x,y,z,vx,vy,vz} objects. GRAB START: new pointerdown listener; if _pick(e) hits an orb, store pendingGrab={rec, sx:e.clientX, sy:e.clientY} but do NOT disturb existing click/dblclick logic yet. On pointermove, if pendingGrab and hypot(dx,dy)>6px → promote to grab: this.controls.enabled=false; build drag plane once: THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(v).negate(), rec.mesh.position) — camera-facing plane through the orb, the standard trick. DRAG: each pointermove, raycaster.setFromCamera(pointer, camera); ray.intersectPlane(plane, target); clamp target.length() to sim maxRadius (165); write target into rec.simNode.{x,y,z} and zero its vx/vy/vz. Velocity tracking for the throw: inst=(target−last)/dt with dt from performance.now(); grabVel.lerp(inst, 0.35) exponential smoothing so a jittery last frame doesn't ruin the fling; keep last=target.clone(). IN _loop: after this.sim.tick(2), re-assert the grabbed node's position and zero-velocity (the tick moved it); skip the micro-drift offset for the grabbed node so it pins exactly under the cursor; bump its material.emissiveIntensity to 2.0 while held (restore on release) — bloom makes it visibly 'charged'. RELEASE (pointerup): rec.simNode.vx/vy/vz = grabVel * 0.35 per-axis, magnitude clamped to 8 units/tick (prevents launching a note into the fog); controls.enabled=true; clear grab. Neighbors follow via the existing spring forces — that ripple IS the feature. CLICK DISAMBIGUATION: if pointerup fires while still pendingGrab (never moved 6px), do nothing extra — the existing click/dblclick handlers fire normally, so fly-to and open-note behavior is untouched. EDGE CASES: pointer leaves canvas mid-drag → also release on pointerleave; graph update() mid-drag → _clear() nulls the grab ref (add one line). PERF: zero new allocations per frame (reuse 3 scratch Vector3s); no new render cost. Optionally mirror the same ~90 lines into GraphView.js later — ship BrainView only first.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/BrainView.js

**Tests:** Manual (it's an interaction): drag an orb → cursor-locked, links stretch, neighbors follow; fling → it sails and settles; single-click and double-click still fly-to/open; OrbitControls unaffected when starting drag on empty space; 60fps maintained (no per-frame allocs).

### Vault Time Machine — replay your brain growing [should, ~200L]

**Value:** A timeline scrubber over the brain: drag back to any date and watch notes pop into existence in chronological order, links igniting as both ends appear. Press play and the whole 104-note galaxy assembles itself over 30 seconds. Nothing else in note-app land does this; it is THE stare-at-it demo moment, and it needs zero new data — ctime/mtime are already indexed.

**Design:** PURE (new src/renderer/lib/timeline.mjs, ~30 lines + test): buildTimeline(notes, now) → { minT, maxT: now, ctimeOf: Map(id→ctime||mtime) } using existing note.ctime (vault-indexer already falls back birthtime→mtime; OneDrive may report download time — acceptable, ponytail-comment it). VIEW (BrainView.js, ~55 lines): new method setEpoch(tMs|null). Store this.epochT and stamp rec.ctime onto each node rec in update(). In _loop: if epochT != null, per node compute k = clamp((epochT − ctime)/400ms, 0, 1) eased with k*k*(3−2k) (smoothstep) → multiply into the existing scale.setScalar call (k=0 hides, the 400ms window gives every appearing orb a satisfying pop); labels already cull via existing opacity path — multiply o by k. Links: in the existing segArray fill loop, if either endpoint's k<1 write endpoint A's coords into both triplets (degenerate zero-length segment — buffer size never changes, no geometry rebuild, LinkPulses keeps working and pulses simply collapse on unborn links). setEpoch(null) restores normal. UI (new src/renderer/components/TimelineScrubber.jsx, ~95 lines, house chrome): thin bottom-docked bar in brain mode toggled from HudToolbar ('⏳ Replay'); contains an <input type=range> (native — no custom slider lib) mapped minT→now, a date readout (toLocaleDateString), and ▶/⏸. Play mode: requestAnimationFrame loop advancing a 0→1 progress over 30s with ease-in-out cubic, T = minT + p*(now−minT); calls viewRef.setEpoch(T) (SpaceCanvas already holds the view instance — expose via the same pattern as focus()). Esc or closing the bar → setEpoch(null). Edge cases: all notes same ctime (fresh vault copy) → range collapses, guard minT===maxT by disabling scrubber with a tooltip; graph update during replay → update() re-stamps ctimes, epoch persists. PERF: the k computation is 104 multiply-adds per frame — free; no allocations.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/timeline.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/test/timeline.test.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/views/BrainView.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/TimelineScrubber.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/HudToolbar.jsx

**Tests:** node --test buildTimeline (fallbacks, empty vault, single date). Manual: scrub to vault start → near-empty space; press play → orbs pop in chronological waves, links ignite only when both ends exist; close → full brain restored; fps steady during replay.

### Morning Brief — one-click smart daily digest written into the vault [should, ~210L]

**Value:** A 'Generate brief' button computes due flashcards, stale Claude project-logs, yesterday's activity, orphan count, and top link suggestions — all from data the indexer already produces — and writes it as a section in today's daily note. Doubles as the Claude-agent workhorse: onyx-bridge sessions read the daily note and instantly know vault state without rescanning anything.

**Design:** PURE (new src/renderer/lib/digest.mjs, ~85 lines + test): buildBrief({graph, srsStates, now}) → markdown string. Sections, all from existing data: (1) due cards: dueCards(graph.cards, srsStates||{}, now).length — reuse srs.mjs export directly; (2) stale projects: graph.notes.filter(n => n.type==='project-log') sorted mtime asc, list those quiet >3 days as '- [[Title]] — quiet Nd' (this is exactly the onyx-bridge 'Claude Projects/' frontmatter contract); (3) yesterday: notes with dayKey(mtime)===yesterday (reuse dayKey from stats.mjs), count + up to 3 [[wikilinked]] titles; (4) health: orphan count via vaultStats(graph).orphans + top 2 graph.suggestions (already computed by vault-indexer's buildSuggestions) as '- Consider linking [[A]] ↔ [[B]]'; (5) one nextActions line (reuse stats.mjs nextActions? skip — sections 1-4 suffice, YAGNI). Second export insertBrief(raw, briefMd): idempotent section replace — find '## Onyx Brief' heading with the same section-scan loop style as appendCapture (find heading, find next '## ' or EOF, splice replacement); if absent, insert after the '## Log' section's end, else append at EOF; preserve EOL flavor exactly like appendCapture does. WIRING (~45 lines): button in DashboardMode header ('☀ Morning brief') + CommandPalette entry. Flow: read dailyFolder from config (same source QuickCapture uses), id = dailyId(new Date(), folder) from daily.mjs; await onyx.ensureNote(id, dailyTemplate(new Date())) — create-only, never clobbers; raw = await onyx.readNote(id); srs = await onyx.storeGet('srs'); next = insertBrief(raw, buildBrief({graph, srsStates: srs?.states ?? srs, now: Date.now()})); await onyx.writeNote(id, next); toast 'Brief written to today's note' via existing Toasts bus; onyx.bumpUsage('briefGenerate'). Regenerating later the same day replaces the section (idempotent), so it's safe to spam. ZERO new IPC, zero main-process changes. EDGE CASES: no daily folder configured → toast asking to set one (same guard QuickCapture already has); empty srs store → treat all cards as new (dueCards handles it); notes with null mtime skipped from yesterday calc.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/digest.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/test/digest.test.mjs, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/modes/DashboardMode.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/CommandPalette.jsx

**Tests:** node --test: buildBrief section content from a fixture graph (due counts, stale project detection at the 3-day boundary, yesterday bucketing across midnight); insertBrief idempotence (run twice → identical output), CRLF preservation, missing-heading append. Manual: click button, open today's daily in Obsidian → '## Onyx Brief' present and correct.

### Focus Theater — deep-work HUD with generated ambient hum [could, ~260L]

**Value:** Full-screen pomodoro theater: the living brain dims behind frosted glass, a huge timer and session intent take over, and an optional WebAudio-synthesized spaceship hum (zero assets) fills the room. Merges candidates #3 and #6 into one coherent feature — the honest verdict on generated ambience is 'good as a hum, bad as music', and a hum is exactly what a focus mode wants.

**Design:** AMBIENCE (new src/renderer/lib/ambience.js, ~90 lines, honest scope: a hum, not a soundscape): one AudioContext created lazily on first enable (autoplay-policy safe — it's a user click). Graph: (a) brown noise — 4s AudioBuffer filled once via b += 0.02*(white−b); b/1.02 normalized, looped BufferSource → BiquadFilter lowpass 220Hz Q0.7; (b) two OscillatorNodes, sine 55Hz + 55.4Hz (0.4Hz beat frequency = the slow 'engine throb'); (c) LFO: 0.05Hz sine osc → GainNode.gain of the drone bus, depth ±30% — slow breathing; (d) master GainNode default 0.06, exposed setVolume; (e) chime(f=660): sine osc + gain envelope setValueAtTime(0.08)→exponentialRampToValueAtTime(0.0001, +1.2s), fired ONLY on pomodoro phase transitions — deliberately not on link pulses (would nag). API start()/stop() (stop = disconnect + ctx.suspend, cheap resume), fully offline, zero assets. THEATER (new src/renderer/components/FocusTheater.jsx, ~130 lines): fixed inset-0 overlay, background rgba(5,6,10,0.72) + backdrop-filter: blur(6px) — the brain canvas keeps animating dimly behind it (it already runs in brain mode; SpaceCanvas pause logic untouched since we stay in brain mode). Content, house chrome: 9rem tabular-nums timer fed by the EXISTING pure pomodoro.mjs (startSession/remaining/advance/fmt — reuse, zero timer code), phase label, an intent input ('what are you attacking?'), pause/resume/end buttons, volume slider + mute toggle for ambience (persist {volume,enabled} via onyx.storeSet('ambience')). Entry: button on the existing Pomodoro.jsx widget ('⛶ Theater') + command palette; Esc exits (session keeps running in the small widget — state lives where Pomodoro.jsx already keeps it, theater is just a bigger face on the same session object, lift state up only if it currently lives inside Pomodoro.jsx). On work-phase completion: chime(880), bump usage, and if an intent was typed, append '🎯 25m — <intent>' to today's daily Log via the exact QuickCapture path (ensureNote + readNote + appendCapture + writeNote — all existing). EDGE CASES: ctx creation failure (no audio device) → silently disable audio, theater still works; window blur → nothing special, pomodoro.mjs is wall-clock derived so sleep/lag can't corrupt it (already its design). PERF: audio graph is ~6 nodes, negligible; overlay is pure CSS.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/ambience.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/FocusTheater.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/Pomodoro.jsx, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/components/CommandPalette.jsx

**Tests:** Manual: enter theater → brain visibly dimmed-but-alive behind blur, timer counts, Esc exits with session intact; ambience toggles instantly, volume persists across restart, phase change plays one chime; complete a work phase with intent typed → line appears in daily Log; app fully functional with audio disabled.

### Vault share-card — one-click flex PNG [could, ~200L]

**Value:** Renders a 1200×630 dark-nebula stat card (maturity ring, streak, notes/links/words, 12-week sparkline) to the clipboard as PNG — screenshot-quality flexing of your second brain with zero assets, all canvas 2D.

**Design:** RENDERER-ONLY, zero new IPC. Draw (new src/renderer/lib/sharecard.js, ~160 lines): drawShareCard(canvas, data) on an offscreen <canvas> 1200×630 @2x for crispness (2400×1260 backing, scale(2)). Background: #05060a fill + 3 radial gradients at hashed positions using the makeNebula color language ('#1c1442','#0a1a3c', low alpha) + ~140 star dots (seeded via fnv1a32 so the card is deterministic per vault name — no flicker between exports). Left: maturity ring — ctx.arc stroke, lineWidth 18, gradient stroke createLinearGradient(#6ea8ff→#c77dff), background track at 12% alpha, sweep = score/100 · 2π from −π/2; score number centered 96px bold, 'MATURITY' caption. Right column stat rows (notes, links, words, streak days, connected %) in the app's mono/label styling, values 40px, labels 12px letterspaced. Bottom: 12-week note-count sparkline from snapshots (reuse velocity(notes, now).weeks from stats.mjs — already the exact 12-bucket array) drawn as a glow polyline (draw twice: 6px @20% alpha then 2px solid). 'ONYX' wordmark + date bottom-right. DATA: buildCardData(graph, usage, now) — small pure fn in the same file: vaultStats + maturity from stats.mjs, words = sum wordCount, streak = walk usage.days backward from today (same convention the dashboard uses). EXPORT (~35 lines in DashboardMode): 'Share card' button → draw → canvas.toBlob('image/png') → try navigator.clipboard.write([new ClipboardItem({'image/png': blob})]) (works in Electron 32 renderer) → toast 'Card copied'; catch → fallback <a download='onyx-card.png' href=objectURL>.click() then revokeObjectURL. Show a small <img> preview of the result in a modal so the user sees what they copied. EDGE CASES: empty snapshots → flat sparkline at 0; clipboard denied → download fallback always works offline.

**Files:** c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/lib/sharecard.js, c:/Users/Xody2/OneDrive/Desktop/Note App/src/renderer/modes/DashboardMode.jsx

**Tests:** node --test on buildCardData (streak walk across gaps, empty usage). Manual: click → preview modal shows the card, paste into any chat app → correct PNG; deterministic star layout across two exports.
