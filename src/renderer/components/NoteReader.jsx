import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'

// html:true because notes are the user's own trusted vault (same as Obsidian),
// and wikilinks are injected as HTML anchors before rendering.
const md = new MarkdownIt({ html: true, linkify: true, breaks: true })

function renderBody(raw, basenameToId) {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') // strip frontmatter
  const withLinks = body.replace(/(!?)\[\[([^\]]+)\]\]/g, (m, bang, inner) => {
    if (bang) return m
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
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
    setEditing(false)
    window.onyx.readNote(id).then(setRaw)
  }, [id])

  useEffect(() => {
    if (editing) return
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
  }, [raw, editing, onSelect])

  const startEdit = () => {
    setDraft(raw || '')
    setEditing(true)
  }
  const save = async () => {
    setSaving(true)
    const ok = await window.onyx.writeNote(id, draft)
    setSaving(false)
    if (ok) {
      setRaw(draft)
      setEditing(false)
    } else {
      alert('Could not save the note.')
    }
  }

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
        <div className="reader-actions">
          {!editing && raw != null && (
            <button onClick={startEdit} title="Edit note">✎</button>
          )}
          <button onClick={onClose} title="Close">✕</button>
        </div>
      </div>
      {editing ? (
        <div className="reader-edit">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoFocus />
          <div className="edit-actions">
            <button className="save" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <span className="edit-hint">saves to {id}</span>
          </div>
        </div>
      ) : raw == null ? (
        <p className="muted" style={{ padding: 16 }}>
          loading…
        </p>
      ) : (
        <div className="reader-body" ref={ref} dangerouslySetInnerHTML={{ __html: renderBody(raw, basenameToId) }} />
      )}
    </aside>
  )
}
