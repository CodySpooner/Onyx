import { useEffect, useState } from 'react'
import { cleanFolder } from '../lib/stats.mjs'

const excerptCache = new Map()

function toExcerpt(raw) {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`\[\]!|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function HoverCard({ hover, graph }) {
  const [excerpt, setExcerpt] = useState('')
  const note = hover ? graph.notes.find((n) => n.id === hover.id) : null

  useEffect(() => {
    if (!note) return
    if (excerptCache.has(note.id)) {
      setExcerpt(excerptCache.get(note.id))
      return
    }
    setExcerpt('')
    let dead = false
    window.onyx.readNote(note.id).then((raw) => {
      if (dead || raw == null) return
      const ex = toExcerpt(raw)
      excerptCache.set(note.id, ex)
      setExcerpt(ex)
    })
    return () => {
      dead = true
    }
  }, [note?.id])

  if (!hover || !note) return null
  const age = note.mtime ? Math.max(0, Math.floor((Date.now() - note.mtime) / 86400000)) : null

  return (
    <div
      className={`hovercard glass ${hover.pinned ? 'pinned' : ''}`}
      style={{
        left: Math.min(hover.x + 18, window.innerWidth - 320),
        top: Math.min(hover.y + 14, window.innerHeight - 240)
      }}
    >
      <div className="hc-title">{note.title}</div>
      <div className="hc-meta">
        <span>{cleanFolder(note.folder)}</span>
        {note.type && <span>{note.type}</span>}
        <span>→ {note.outLinks.length}</span>
        <span>← {note.inLinks.length}</span>
        {age != null && <span>{age === 0 ? 'today' : `${age}d ago`}</span>}
      </div>
      {excerpt && <div className="hc-excerpt">{excerpt}…</div>}
      <div className="hc-ai">✦ AI summary — arrives with the Knowledge Engine</div>
      {hover.pinned && <div className="hc-hint">double-click to open · click space to release</div>}
    </div>
  )
}
