# ◑ Onyx

**Your mind, upgraded.** A desktop second brain that renders your Obsidian
vault as a living neural network — clusters emerge from your links, synapses
fire between thoughts, and a floating glass cockpit tracks the health of your
knowledge. Read, edit, create, and rewire notes without leaving the brain.

The AI Knowledge Engine (auto-summaries, suggested links, semantic search,
chat) arrives in upcoming slices — the hover card already reserves its seat.

## Run

```
npm install
npm run dev
```

On first launch it opens the configured vault; use **Change vault** to point it
at any folder of `.md` files.

> Note: if Electron launches as plain Node in your shell (a blank window or a
> `require('electron')` error), unset `ELECTRON_RUN_AS_NODE` first.

## Views

- **🧠 Brain** (default) — your vault as a living neural network: force-directed
  layout where lobes emerge from links, synapses fire along connections, hover
  previews any thought (click pins it, double-click opens it), and the cockpit
  tracks maturity, velocity, cold notes, bridges, and next actions.
- **☀ Solar System** — folders as suns, notes orbiting, links glowing.
- **◉ Core of Everything** — core star with teardrop rings + radial fan.
- **⊕ Second Brain** — spherical shells around a glowing core.
- **✦ Constellation** — folder-clustered node cloud.

## Features

- Reads your real vault live (frontmatter, tags, wikilinks, mtimes) and
  re-indexes on file changes.
- Edit & save with side-by-side live preview; create, rename, delete notes —
  all writes guarded to the vault.
- Rendered markdown reader with clickable `[[wikilinks]]`.
- Search + filter by folder / type / tag — matches glow, the rest dim.
- Auto-updates from GitHub Releases with a restart-to-install toast.

## Test

```
npm test
```

Covers the vault indexer (scan, frontmatter, wikilink resolution) and the filter
logic.

## Package a Windows app

```
npm run dist
```

Builds `release/Onyx Setup <version>.exe` (NSIS installer + desktop shortcut) and
a portable `release/win-unpacked/Onyx.exe`. The app icon is generated from
`pictures/icon.png` by `node scripts/make-icon.cjs`.

## Releasing (automated)

Bump the version and push a tag — GitHub Actions builds the installer on a
Windows runner and publishes it to a new Release automatically:

```
npm version patch        # bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

See `.github/workflows/release.yml` (triggered by any `v*` tag).

## Stack

Electron · electron-vite · React · Three.js · markdown-it · gray-matter ·
chokidar.
