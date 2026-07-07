// Time Capsule: shadow snapshots of note content in userData, taken of the
// PREVIOUS on-disk content each time Onyx writes a note. Never touches the
// vault itself; restore goes back through the normal guarded write path.
import { app } from 'electron'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fnv1a32 } from '../renderer/lib/hash.mjs'

const CAP = 20 // snapshots kept per note

const dirFor = (noteId) => path.join(app.getPath('userData'), 'onyx-history', String(fnv1a32(noteId)))

export function snapshotNote(noteId, content) {
  try {
    const dir = dirFor(noteId)
    mkdirSync(dir, { recursive: true })
    const hash = fnv1a32(String(content))
    const existing = readdirSync(dir).filter((f) => f.endsWith('.md'))
    // identical to the latest snapshot → skip (no churn on repeated saves)
    const latest = existing.sort().pop()
    if (latest && latest.includes('-' + hash + '.md')) return
    writeFileSync(path.join(dir, `${Date.now()}-${hash}.md`), String(content), 'utf8')
    const all = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    while (all.length > CAP) {
      unlinkSync(path.join(dir, all.shift()))
    }
  } catch (e) {
    console.error('history snapshot failed:', e?.message || e) // history is best-effort, never blocks a save
  }
}

export function listHistory(noteId) {
  try {
    return readdirSync(dirFor(noteId))
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ ts: Number(f.split('-')[0]), file: f }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

export function readHistory(noteId, file) {
  try {
    if (!/^\d+-\d+\.md$/.test(String(file))) return null // filenames only — no traversal
    return readFileSync(path.join(dirFor(noteId), file), 'utf8')
  } catch {
    return null
  }
}
