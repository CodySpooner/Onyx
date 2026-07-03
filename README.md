# ◑ Onyx

A desktop app that renders an Obsidian vault as an explorable **galaxy of solar
systems** — each folder a glowing sun, each note a planet orbiting it, each
wikilink a glowing arc. A dramatically better-looking, better-organized
alternative to Obsidian's built-in graph view.

Editing stays in Obsidian for now — Onyx is the read-only "map layer" (editing
is a planned later slice).

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

- **☀ Solar System** — folders as suns, notes orbiting them, all wikilinks
  glowing at once (toggle **links** off for a calm, hover-only web). Click a sun
  to fly into its system; click a planet to read the note.
- **✦ Constellation** — the same graph as a folder-clustered node cloud.

## Features

- Reads your real vault live (frontmatter, tags, wikilinks) and re-indexes on
  file changes.
- Click any planet → rendered markdown reader with clickable `[[wikilinks]]`.
- Search + filter by folder / type / tag — matches glow, the rest dim.

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
