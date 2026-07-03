import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'

// html:true because notes are the user's own trusted vault (same as Obsidian),
// and wikilinks are injected as HTML anchors before rendering.
const md = new MarkdownIt({ html: true, linkify: true, breaks: true })

function renderBody(raw, basenameToId) {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') // strip frontmatter
  const withLinks = body.replace(/(!?)\[\[([^\]]+)\]\]/g, (m, bang, inner) => {
    if (bang) return m // leave ![[embeds]] as literal text in v1
    const [target, alias] = inner.split('|')
    const id = basenameToId.get(target.split('#')[0].trim().toLowerCase())
    const label = (alias || target).trim()
    return id
      ? `<a class="wikilink" data-id="${id}">${label}</a>`
      : `<span class="wikilink dead">${label}</span>`
  })
  return md.render(withLinks)
}

export function NoteReader({ id, graph, onSelect, onClose }) {
  const [raw, setRaw] = useState(null)
  const ref = useRef(null)
  const note = graph.notes.find((n) => n.id === id)

  const basenameToId = useMemo(
    () =>
      new Map(
        graph.notes
          .map((n) => [n.title.toLowerCase(), n.id])
          .concat(graph.notes.map((n) => [n.id.split('/').pop().replace(/\.md$/, '').toLowerCase(), n.id]))
      ),
    [graph]
  )

  useEffect(() => {
    setRaw(null)
    window.onyx.readNote(id).then(setRaw)
  }, [id])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = (e) => {
      const a = e.target.closest('a.wikilink[data-id]')
      if (a) {
        e.preventDefault()
        onSelect(a.dataset.id)
      }
    }
    el.addEventListener('click', h)
    return () => el.removeEventListener('click', h)
  }, [raw, onSelect])

  return (
    <aside className="reader">
      <div className="reader-head">
        <div>
          <h2>{note?.title || id}</h2>
          <div className="chips">
            {note?.type && <span className="chip">{note.type}</span>}
            {note?.status && <span className="chip">{note.status}</span>}
            {(note?.tags || []).map((t) => (
              <span key={t} className="chip tag">#{t}</span>
            ))}
            {note?.updated && <span className="chip muted">{String(note.updated)}</span>}
          </div>
        </div>
        <button onClick={onClose}>✕</button>
      </div>
      {raw == null ? (
        <p className="muted" style={{ padding: 16 }}>loading…</p>
      ) : (
        <div className="reader-body" ref={ref} dangerouslySetInnerHTML={{ __html: renderBody(raw, basenameToId) }} />
      )}
    </aside>
  )
}
