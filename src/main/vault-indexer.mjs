import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { parseTasks } from '../renderer/lib/tasks.mjs'
import { parseCards } from '../renderer/lib/srs.mjs'

const SAFE = /[\\/:*?"<>|#^[\]]/g
function insideVault(vaultPath, abs) {
  const rel = path.relative(vaultPath, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('refusing to touch a path outside the vault')
}

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
  const cards = []
  const notes = []
  const byBasename = new Map() // lowercase basename → note id

  for (const abs of files) {
    const rel = path.relative(vaultPath, abs).split(path.sep).join('/')
    const folderId = rel.includes('/') ? rel.split('/')[0] : '(root)'
    if (!folders.has(folderId)) {
      folders.set(folderId, { id: folderId, name: folderId, path: folderId, color: colorFor(folders.size) })
    }
    const raw = await fs.readFile(abs, 'utf8')
    let mtime
    try {
      mtime = Math.round((await fs.stat(abs)).mtimeMs)
    } catch {
      mtime = null
    }
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
    const noteTags = normalizeTags(data.tags)
    notes.push({
      id: rel,
      path: rel,
      title: String(data.title || base),
      folder: folderId,
      type: data.type ?? null,
      status: data.status ?? null,
      tags: noteTags,
      updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : (data.updated ?? null),
      mtime: mtime ?? (Number.isFinite(Date.parse(data.updated)) ? Date.parse(data.updated) : Date.now()),
      wordCount: content.split(/\s+/).filter(Boolean).length,
      tasks: parseTasks(raw, rel),
      outLinks: [],
      inLinks: [],
      _content: content
    })
    cards.push(...parseCards(rel, raw, noteTags))
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
    cards,
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
  const abs = path.join(vaultPath, id)
  insideVault(vaultPath, abs) // reads are vault-scoped too — no traversal
  return fs.readFile(abs, 'utf8')
}

export async function writeNoteRaw(vaultPath, id, content) {
  const abs = path.join(vaultPath, id)
  insideVault(vaultPath, abs)
  return fs.writeFile(abs, content, 'utf8')
}

export async function createNote(vaultPath, folder, title) {
  const base = String(title || 'Untitled').replace(SAFE, '').trim() || 'Untitled'
  const dir = folder && folder !== '(root)' ? folder : ''
  let name = base
  let n = 1
  while (existsSync(path.join(vaultPath, dir, name + '.md'))) name = `${base} ${++n}`
  const rel = path.join(dir, name + '.md')
  const abs = path.join(vaultPath, rel)
  insideVault(vaultPath, abs)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, `---\ntitle: ${name}\n---\n\n`, 'utf8')
  return rel.split(path.sep).join('/')
}

// create-only write ('wx' flag): never clobbers an existing note
export async function ensureNote(vaultPath, rel, content) {
  const abs = path.join(vaultPath, rel)
  insideVault(vaultPath, abs)
  if (!String(rel).endsWith('.md')) throw new Error('ensureNote: .md files only')
  await fs.mkdir(path.dirname(abs), { recursive: true })
  try {
    await fs.writeFile(abs, content, { flag: 'wx' })
    return { created: true }
  } catch (e) {
    if (e.code === 'EEXIST') return { created: false }
    throw e
  }
}

export async function deleteNote(vaultPath, id) {
  const abs = path.join(vaultPath, id)
  insideVault(vaultPath, abs)
  return fs.unlink(abs)
}

export async function renameNote(vaultPath, id, newTitle) {
  const base = String(newTitle || '').replace(SAFE, '').trim()
  if (!base) throw new Error('empty title')
  const dir = path.dirname(id)
  const rel = path.join(dir === '.' ? '' : dir, base + '.md')
  const absOld = path.join(vaultPath, id)
  const absNew = path.join(vaultPath, rel)
  insideVault(vaultPath, absOld)
  insideVault(vaultPath, absNew)
  if (absNew !== absOld && existsSync(absNew)) throw new Error('a note with that name already exists')
  await fs.rename(absOld, absNew)
  return rel.split(path.sep).join('/')
}
