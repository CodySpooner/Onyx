# Vault + Topic selectors, and per-project Claude routing — design

**Date:** 2026-07-08 · **Target:** Onyx v0.11.0

## Problem

Onyx views exactly one vault (single `config.vaultPath`) and scopes within it
via project "workspaces." The user wants:

1. To keep several vaults and **flip between them** in-app.
2. A dead-simple **folder ("topic") selector** — pick one folder to see only
   its notes, or "All" to see the whole vault — driving every graph lens.
3. Claude to **route project notes to the right vault automatically**, so
   work on the Xody Bets site never files notes into the Onyx vault (and
   vice versa).

## Design

### A. Vault selector (new pill, top-left)

- `config.vaults: string[]` — absolute paths of every vault ever opened.
  `config.vaultPath` stays the *active* one.
- `vault:pickVault` (existing) also appends the chosen path to `vaults`.
- New IPC `vault:list` → `{ vaults: [{path, name}], active }` (name = basename).
- New IPC `vault:switch(path)` → sets active `vaultPath`, reindexes, re-watches,
  returns the graph.
- `VaultPill` renders left of the topic pill: shows the active vault's basename;
  dropdown lists known vaults + "＋ Open vault folder…" (calls pickVault).
  Switching resets the topic to All and clears filters.

### B. Topic (folder) selector (replaces the workspace pill)

- A "topic" = one folder in the active vault. The pill lists **◍ All Topics**
  + every entry in `graph.folders` (full graph, with note counts).
- Picking a folder scopes every lens via the existing `scopeGraph` engine —
  a topic is just `{ folders: [folderId] }`. Picking All Topics = full graph.
- Single `topicFolder` state (folder id | null). **Not persisted** — always
  boots to All Topics, which removes the whole class of "silent scope reads as
  empty vault" bugs.
- The custom/auto **workspace** UI is retired (pill, modal, persistence). The
  `scopeGraph`/`noteInWorkspace` library stays — it now backs topics.
- Full-graph consumers (NoteReader, TrailStrip, Find&Replace) keep the full
  graph, exactly as before.

### C. `/onyx-vault "folder"` — per-project routing

- User slash command at `~/.claude/commands/onyx-vault.md`.
- Expands to a rich, explicit prompt: names the given folder as *this*
  project's vault, and instructs Claude to proactively capture daily logs,
  notes, changes, decisions, ideas, and research into it hands-free following
  the onyx-bridge read-modify-write conventions — so the vault grows without
  the user doing the note-taking manually.
- The `onyx-bridge` skill is updated to be **per-project vault aware**: resolve
  the active project's vault from the `/onyx-vault` routing (or the project
  log's own location) rather than always assuming the Xody Bets vault.

## Non-goals

- No auto-discovery of vaults on disk (only folders the user opens).
- No nested-folder rollup: each distinct folder is its own topic (the vault is
  effectively flat; `graph.folders` already enumerates them).
- No cross-machine vault registry sync.

## Verification

- Tests stay green (`npm test`).
- Screenshot: both pills render; switching vault reindexes; picking a topic
  scopes the brain to that folder; All Topics restores the full graph.
