import { promises as fs } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const WIKILINK = /\[\[([^\]]+)\]\]/g

const PALETTE = [
  '#6ea8ff', '#ff7b7b', '#7bffb0', '#ffd166', '#c77dff', '#4cc9f0', '#f72585',
  '#80ed99', '#ff9f1c', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#9bf6ff'
]
const colorFor = (i) => PALETTE[i % PALETTE.length]

function normalizeTags(t) {
  if (!t) return []
  if (Array.isArray(t)) return t.map(String)
  return String(t).split(',').map((s) => s.trim()).filter(Boolean)
}

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue // skip .obsidian, .git, .claude
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, acc)
    else if (e.name.endsWith('.md')) acc.push(full)
  }
  return acc
}

export async function scanVault(vaultPath) {
  const files = await walk(vaultPath)
  const folders = new Map()
  const notes = []
  const byBasename = new Map() // lowercase basename → note id

  for (const abs of files) {
    const rel = path.relative(vaultPath, abs).split(path.sep).join('/')
    const folderId = rel.includes('/') ? rel.split('/')[0] : '(root)'
    if (!folders.has(folderId)) {
      folders.set(folderId, { id: folderId, name: folderId, path: folderId, color: colorFor(folders.size) })
    }
    const raw = await fs.readFile(abs, 'utf8')
    let data = {}
    let content = raw
    try {
      const p = matter(raw)
      data = p.data || {}
      content = p.content
    } catch {
      /* best-effort: malformed frontmatter → treat whole file as content */
    }
    const base = path.basename(rel, '.md')
    notes.push({
      id: rel,
      path: rel,
      title: String(data.title || base),
      folder: folderId,
      type: data.type ?? null,
      status: data.status ?? null,
      tags: normalizeTags(data.tags),
      updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : (data.updated ?? null),
      wordCount: content.split(/\s+/).filter(Boolean).length,
      outLinks: [],
      inLinks: [],
      _content: content
    })
    byBasename.set(base.toLowerCase(), rel)
  }

  const noteById = new Map(notes.map((n) => [n.id, n]))
  const links = []
  let unresolvedLinkCount = 0

  for (const note of notes) {
    const targets = new Set()
    let m
    WIKILINK.lastIndex = 0
    while ((m = WIKILINK.exec(note._content))) {
      const target = m[1].split('|')[0].split('#')[0].trim()
      const targetId = byBasename.get(target.toLowerCase())
      if (targetId && targetId !== note.id) targets.add(targetId)
      else if (!targetId) unresolvedLinkCount++
    }
    for (const t of targets) {
      note.outLinks.push(t)
      noteById.get(t).inLinks.push(note.id)
      links.push({ source: note.id, target: t })
    }
  }

  const publicNotes = notes.map(({ _content, ...n }) => n)
  return {
    folders: [...folders.values()],
    notes: publicNotes,
    links,
    meta: {
      vaultPath,
      noteCount: publicNotes.length,
      linkCount: links.length,
      unresolvedLinkCount
    }
  }
}

export function readNoteRaw(vaultPath, id) {
  return fs.readFile(path.join(vaultPath, id), 'utf8')
}
