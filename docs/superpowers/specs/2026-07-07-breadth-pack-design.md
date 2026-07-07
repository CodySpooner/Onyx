# Onyx Breadth Pack — Design Spec

- **Project:** Onyx · **Date:** 2026-07-07 · **Status:** Approved (user pre-approved slate)
- **Scope:** 7 additive features layered AFTER the CORTEX slice (v0.4.0) ships, as the follow-on slice. Plugs into CORTEX extension points: palette action registry, status-bar slot, dashboard panel slots, usage counters.
- **House rules:** zero new npm deps, pure logic in `.mjs` under `src/renderer/lib/` with `node --test` coverage, vault writes non-destructive + `insideVault`-guarded, app state as JSON under Electron userData.

## Integration deltas vs. the original breadth draft (reconciled against CORTEX)

- Generic `store:get`/`store:set` IPC (name-validated `/^[a-z][a-z0-9-]{0,32}$/`, atomic temp+rename writes in `src/main/store.js`) ships in this slice and holds ONLY the `srs` store. Counters (reviews, pomodoros) ride CORTEX's `usage:bump` (`counters.reviewsDone`, `counters.reviewsByDay` → use `usage.days`-style per-day map inside counters is NOT needed — dashboard reads totals; per-day detail deferred).
- Toasts ride CORTEX's `bus.emit('toast', …)` stack. Panels mount into DashboardMode grid slots; palette actions register in the CORTEX action list; status-bar widgets mount in StatusBar segments.

## 1. Backlinks + note intel (reader)

- NEW `src/renderer/lib/backlinks.mjs`: `extractLinkContext(raw, targetNames:Set<lowercase>) → [{line, text}]` — strip frontmatter, skip fenced code, match `[[Target]]`/`[[Target|alias]]`/`[[Target#h]]` by pre-`|`/`#` trimmed lowercase against targetNames; ≤2 snippets/note, 140 chars centered on the link.
- MOD NoteReader: "LINKED FROM" section after `.reader-body` — rows: linking note title (→ onSelect) + dimmed snippet. Chips row adds `{wordCount} words · {ceil(wordCount/200)} min · edited {age}d ago`.
- Cache `Map<noteId,{mtime,raw}>` invalidated by graph mtime; fetch inLinks via one Promise.all.
- Tests: alias/heading forms, case-insensitive, title-vs-basename, no substring false-positives (`[[Foobar]]` ≠ `Foo`), code-fence/frontmatter skips, ≤2 cap.

## 2. Templates

- NEW `src/renderer/lib/templates.mjs`: `findTemplateFolder(folders)` (first `/template/i` match, else null → UI hidden); `applyTemplate(raw, {title,date,time})` — case-insensitive `{{token}}` replace-all (`{{date}}`=local YYYY-MM-DD, `{{time}}`=HH:MM), unknown tokens pass through.
- Flow (existing IPC only): `readNote(templateId)` → `createNote(targetFolder,'Untitled')` → `writeNote(id, applyTemplate(...))`. Templates read-only.
- UI: `▾` split on the New-note button → glass menu of template titles; palette `New from template: {title}`.
- Tests: folder detection variants, substitution/casing/unknown-token/empty.

## 3. Flashcards + spaced repetition (local SRS)

- NEW `src/renderer/lib/srs.mjs` (pure): `parseCards(noteId, raw, tags)`, `cardHash`, `grade`, `dueCards`, `prune`; NEW `ReviewModal.jsx` (3D flip: perspective + rotateY 180, backface-hidden).
- Parsing: note qualifies via `flashcard` tag or body `#flashcard` token; per-line `#flashcard` qualifies individual lines in unqualified notes. Card line `/^(?:[-*]\s+)?(.+?)::(.+)$/`, reject `:::`, both sides non-empty trimmed, `#flashcard` tokens stripped.
- Identity: `fnv1a32(noteId + '\0' + normalize(question))`, normalize = lowercase/collapse-ws/strip trailing `?.!:` — answer edits & reordering preserve state; question edits mint a new card. `lastSeen` stamped per session; `prune(states, now)` drops >60d-unseen.
- SM-2 lite, state `{ease:2.5, interval:0, reps:0, lapses:0, due:0}`:
  - again(1): ease=max(1.3, ease−.2); interval=0; reps=0; lapses+1; due=now+10min
  - good(2): interval = reps0→1d, reps1→3d, else round(interval×ease); reps+1
  - easy(3): ease=min(3.0, ease+.15); interval = reps0→3d else round(interval×ease×1.3); reps+1
- `dueCards`: stateless-new first (due now), then oldest-due. Storage: store `srs` `{states:{hash:state}}`. Grades bump `usage counters.reviewsDone`.
- UI: sidebar badge `REVIEW · N DUE` (hidden at 0); modal Space=flip, 1/2/3=grade, Esc=close, progress `k/N`; palette "Review due cards". `graph.cards` attached in scanVault via parseCards import.
- Tests: parse gating/`:::`/fences/list-prefix/tag-strip; hash stability matrix; the grade table case-by-case incl. ease floor/cap + lapses; due ordering; prune.

## 4. Focus mode + Pomodoro

- NEW `src/renderer/lib/pomodoro.mjs` (pure, derived-not-accumulated): session `{phase,startedAt,pausedAt,pausedTotal}`; `elapsed(s,now)=(s.pausedAt??now)−startedAt−pausedTotal`; `remaining(s,now,cfg)`; `advance()` flips phase, resets startedAt, work-completion increments `usage counters.pomodorosCompleted`.
- NEW `Pomodoro.jsx` in StatusBar segment: `⏱ 24:31 ▍WORK`, click start/pause/reset; `document.title` tick while running; work-complete toast via bus; optional WebAudio beep (880Hz sine 0.15s, gain-ramped; config `pomodoroSound`).
- Focus mode: `F` (reader open, no input focused) toggles `.app.focus` — CSS hides topbar/hud-body/foldertabs/statusbar; `.reader` centers `inset:24px; max-width:860px; margin:auto`. Esc exits focus before closing reader.
- Config DEFAULTS: `pomodoroWork:25, pomodoroBreak:5, pomodoroSound:true`.
- Tests: remaining at t0/после 10min; pause-gap immunity; advance flip + single completion flag; custom durations.

## 5. Resurface / serendipity

- NEW `src/renderer/lib/resurface.mjs`: `resurfacePick(notes, dateStr)` — seed `fnv1a32(dateStr)` (fnv1a shared via `lib/hash.mjs`); pools: (1) anniversary (same month+day, earlier year) → (2) cold >60d → (3) 20 oldest; sort by id, pick `seed % len`; reasons `anniversary{years}/cold{days}/old`; null on empty vault. Stable within a day.
- NEW `ResurfacePanel.jsx` in Dashboard grid: `RESURFACE` header, title (→ open), reason line ("Written N year(s) ago today" / "Dormant Nd — reconnect this thought" / "One of your oldest notes"), `↗ reconnect`. Palette "Resurface a thought".
- Tests: determinism per date, pool priority, anniversary excludes current-year, 0/1-note edges.

## 6. Reading list / bookmarks

- Indexer: `url` (frontmatter string|null), `read` (`=== true`). NEW `src/renderer/lib/frontmatter.mjs`: `setFrontmatterKey(raw, key, value)` — anchored `^---` block match capturing EOL flavor; replace existing `^key[ \t]*:.*$` line, else insert before closing `---`, else create block; body byte-identical; throws on newline-bearing values.
- NEW IPC `shell:openExternal` — main validates `new URL(url).protocol ∈ {http:, https:}` then `shell.openExternal`.
- NEW `ReadingList.jsx` (Dashboard panel): unread-first rows `●/○ toggle · title · hostname · ↗`; badge `READING LIST · N UNREAD`; toggle = read→setFrontmatterKey→writeNote. Palette: "Open reading list", "Mark current note read".
- Tests (frontmatter fixtures with full-string equality): replace/insert/create-block, CRLF preservation, `read: false` round-trip, newline-value throw.

## 7. Habits (light)

- NEW `src/renderer/lib/habits.mjs`: `parseHabitLines(raw)` — checkbox regex `/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/`, requires exact `#habit` token (`/(^|\s)#habit(?=\s|$)/`), name = remainder minus token, key = lowercase, done-wins merge; daily-note date from basename `/(\d{4})-(\d{2})-(\d{2})/` sanity-checked. `habitGrid(entries, todayStr, 30)` → per habit `{name, cells:[{date,state: done|missed|none}], pct (none-excluded), streak (today-or-yesterday-anchored)}`.
- Indexer attaches `graph.habitEntries`. NEW `HabitGrid.jsx` (Dashboard): rows capped 8, 6px cells (done=accent, missed=faint, none=transparent+border), `pct%`, `🔥 streak` ≥3.
- Tests: parse variants/rejections (`#habits`), fences, date extraction + invalid dates, grid trichotomy, pct exclusion, streak anchoring, OR-merge.

## Build order (post-CORTEX slice → v0.5.0)

1. Backlinks + note intel  2. Focus + Pomodoro (+ store.js plumbing)  3. Templates  4. Resurface  5. Flashcards/SRS  6. Reading list (+ shell IPC)  7. Habits.

Trust boundaries (never cut): frontmatter byte-preservation tests, shell:openExternal protocol validation in main, store name validation.
