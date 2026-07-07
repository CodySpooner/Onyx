import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import { extractLinkContext } from '../lib/backlinks.mjs'
import { neighborhood, radialLayout } from '../lib/neighborhood.mjs'
import { extractOutline } from '../lib/outline.mjs'
import { diffLines, diffStats } from '../lib/diff.mjs'
import { bus } from '../lib/bus.mjs'
import { CLUSTER_PALETTE } from '../lib/clusters.mjs'

// Time Capsule: shadow snapshots taken automatically before every Onyx write.
// Diff against now, restore with compare-and-swap + UNDO.
function History({ id, raw }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(null) // { ts, file, content, ops, big }
  useEffect(() => {
    let dead = false
    window.onyx.historyList?.(id).then((r) => {
      if (!dead) setItems(r || [])
    })
    return () => {
      dead = true
    }
  }, [id, raw])

  if (!items.length) return null
  const stamp = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const openDiff = async (item) => {
    const content = await window.onyx.historyRead?.(id, item.file)
    if (content == null) {
      bus.emit('toast', { msg: '✕ snapshot unreadable', kind: 'err' })
      return
    }
    setView({ ...item, content, base: raw ?? '', ...diffLines(content, raw ?? '') })
  }
  const restore = async () => {
    // CAS against the content the on-screen diff was computed from — NOT the
    // live raw prop, which auto-refreshes on watcher broadcasts
    const cur = await window.onyx.readNote(id)
    if (cur !== view.base) {
      bus.emit('toast', { msg: '✕ note changed since you opened it — reopen and retry', kind: 'err' })
      return
    }
    const ok = await window.onyx.writeNote(id, view.content)
    if (!ok) {
      bus.emit('toast', { msg: '✕ restore failed — vault not writable', kind: 'err' })
      return
    }
    const before = view.base
    bus.emit('toast', {
      msg: `⌛ restored snapshot from ${stamp(view.ts)}`,
      kind: 'skill',
      action: {
        label: 'UNDO',
        run: async () => {
          const now = await window.onyx.readNote(id)
          if (now !== view.content) {
            bus.emit('toast', { msg: '✕ note changed since — undo skipped', kind: 'err' })
            return
          }
          await window.onyx.writeNote(id, before)
          bus.emit('toast', { msg: '↩ restore undone' })
        }
      }
    })
    setView(null)
  }

  return (
    <div className="history">
      <button className="u-label ol-head" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} TIME CAPSULE · {items.length}
      </button>
      {open && (
        <div className="hist-rows">
          {items.slice(0, 10).map((it) => (
            <button key={it.file} className="hist-row" onClick={() => openDiff(it)}>
              <span>{stamp(it.ts)}</span>
              <span className="u-label">VIEW DIFF</span>
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="veil" onMouseDown={() => setView(null)}>
          <div className="histdiff glass brk" onMouseDown={(e) => e.stopPropagation()}>
            <div className="u-label rv-head">
              SNAPSHOT {stamp(view.ts)} → NOW
              {!view.big && (() => {
                const s = diffStats(view.ops)
                return ` · +${s.add} −${s.del}`
              })()}
            </div>
            <div className="rule-ticks" />
            <div className="hist-diff-body">
              {view.big ? (
                <pre className="daily-preview">{view.content.slice(0, 4000)}</pre>
              ) : (
                view.ops.map((o, i) => (
                  <div key={i} className={`dl ${o.type}`}>
                    {o.type === 'add' ? '+ ' : o.type === 'del' ? '− ' : '  '}
                    {o.text}
                  </div>
                ))
              )}
            </div>
            <div className="tri-foot">
              <button className="rv-g" onClick={restore}>⌛ RESTORE THIS VERSION</button>
              <button className="rv-g" onClick={() => setView(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// heading tree; click scrolls the body to the nth rendered h1-h6 (ordinal
// match — outline and markdown-it parse the same post-frontmatter text)
function Outline({ raw, bodyRef }) {
  const heads = useMemo(() => extractOutline(raw || ''), [raw])
  const [open, setOpen] = useState(true)
  if (heads.length < 2) return null
  // match by TEXT (nearest to expected ordinal for duplicates) — raw-HTML or
  // blockquote headings in the note would desync a pure ordinal lookup
  const jump = (h) => {
    const els = [...(bodyRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') || [])]
    const hits = els.filter((el) => el.textContent.trim() === h.text)
    const el = hits.length
      ? hits.reduce((a, b) => (Math.abs(els.indexOf(b) - h.ord) < Math.abs(els.indexOf(a) - h.ord) ? b : a))
      : els[h.ord]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div className="outline">
      <button className="u-label ol-head" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} OUTLINE · {heads.length}
      </button>
      {open && (
        <div className="ol-rows">
          {heads.map((h) => (
            <button key={h.ord} className="ol-row" style={{ paddingLeft: 8 + (h.level - 1) * 12 }} onClick={() => jump(h)}>
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 1-hop local graph, SVG, rendered once per note — link-walking without
// touching the 3D scene.
function Minimap({ note, graph, clusters, onSelect }) {
  const data = useMemo(() => {
    if (!note) return null
    const nb = neighborhood(graph, note.id)
    if (!nb.inbound.length && !nb.outbound.length && !nb.mutual.length) return { empty: true }
    const degOf = new Map(graph.notes.map((n) => [n.id, n.inLinks.length + n.outLinks.length]))
    return { nb, layout: radialLayout(nb, 236, 190, degOf) }
  }, [note?.id, graph])

  if (!data) return null
  const colorOf = (id) => {
    const ci = clusters?.clusterOf?.get(id)
    return ci >= 0 ? CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length] : '#4a5470'
  }
  const titleOf = (id) => graph.notes.find((n) => n.id === id)?.title || id
  const short = (id) => {
    const t = titleOf(id)
    return t.length > 13 ? t.slice(0, 12) + '…' : t
  }

  return (
    <div className="minimap">
      <div className="u-label">
        NEIGHBORHOOD{data.empty ? '' : ` · ${data.nb.inbound.length + data.nb.mutual.length} IN / ${data.nb.outbound.length + data.nb.mutual.length} OUT`}
      </div>
      <div className="rule-ticks" />
      {data.empty ? (
        <div className="mm-empty">no connections — try Suggested Links</div>
      ) : (
        <svg viewBox="0 0 236 190" className="mm-svg">
          {data.layout.nodes.map((p) => (
            <line key={'l' + p.id} x1={data.layout.center.x} y1={data.layout.center.y} x2={p.x} y2={p.y} className="mm-edge" />
          ))}
          {data.layout.nodes.map((p) => (
            <g key={p.id} className="mm-node" onClick={() => onSelect(p.id)}>
              <circle cx={p.x} cy={p.y} r="5" fill={colorOf(p.id)} />
              <text x={p.x + (p.side === 'in' ? -8 : 8)} y={p.y + 3} textAnchor={p.side === 'in' ? 'end' : 'start'}>
                {short(p.id)}
              </text>
              <title>{titleOf(p.id)}</title>
            </g>
          ))}
          <circle cx={data.layout.center.x} cy={data.layout.center.y} r="7" className="mm-center" />
          {(data.layout.more.in > 0 || data.layout.more.out > 0) && (
            <text x="118" y="184" textAnchor="middle" className="mm-more">
              +{data.layout.more.in + data.layout.more.out + data.layout.more.mutual} more
            </text>
          )}
        </svg>
      )}
    </div>
  )
}

function SuggestedLinks({ note, graph, suggestions, onAccept, onDismiss, onSelect }) {
  if (!note) return null
  const mine = suggestions.filter((s) => s.a === note.id || s.b === note.id).slice(0, 5)
  if (!mine.length) return null
  const titleOf = (id) => graph.notes.find((n) => n.id === id)?.title || id
  return (
    <div className="suggests">
      <div className="u-label">SUGGESTED LINKS · {mine.length}</div>
      <div className="rule-ticks" />
      {mine.map((s) => {
        const other = s.a === note.id ? s.b : s.a
        const target = s.mention?.in || s.a
        return (
          <div key={s.a + s.b} className="sg-row">
            <button className="bl-title" onClick={() => onSelect(other)} title="Open note">
              {titleOf(other)}
            </button>
            <span className="sg-terms">{s.terms.slice(0, 3).map((t) => '#' + t).join(' ')}</span>
            <button className="sg-link" onClick={() => onAccept(s)} title={`Insert wikilink into "${titleOf(target)}" (undoable)`}>
              LINK
            </button>
            <button className="sg-x" onClick={() => onDismiss(s)} title="Dismiss suggestion">
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

// per-session backlink snippet cache, invalidated by source-note mtime
const blCache = new Map() // linkingNoteId -> { mtime, snips }

function Backlinks({ note, graph, onSelect }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!note || !note.inLinks.length) {
      setRows([])
      return
    }
    let dead = false
    const targets = new Set([
      note.title.toLowerCase(),
      note.id.split('/').pop().replace(/\.md$/, '').toLowerCase()
    ])
    const linking = note.inLinks
      .map((id) => graph.notes.find((n) => n.id === id))
      .filter(Boolean)
      .slice(0, 20)
    Promise.all(
      linking.map(async (src) => {
        const hit = blCache.get(src.id)
        if (hit && hit.mtime === src.mtime && hit.target === note.id) return { src, snips: hit.snips }
        const raw = await window.onyx.readNote(src.id)
        const snips = raw == null ? [] : extractLinkContext(raw, targets)
        blCache.set(src.id, { mtime: src.mtime, target: note.id, snips })
        return { src, snips }
      })
    ).then((r) => {
      if (!dead) setRows(r)
    })
    return () => {
      dead = true
    }
  }, [note?.id, note?.inLinks?.length, graph])

  if (!note || !rows.length) return null
  return (
    <div className="backlinks">
      <div className="u-label">LINKED FROM · {rows.length}</div>
      <div className="rule-ticks" />
      {rows.map(({ src, snips }) => (
        <div key={src.id} className="bl-row">
          <button className="bl-title" onClick={() => onSelect(src.id)}>
            {src.title}
          </button>
          {snips.map((s, i) => (
            <div key={i} className="bl-snippet">
              {s.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

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

export function NoteReader({ id, graph, clusters, suggestions = [], onAcceptSuggestion, onDismissSuggestion, onSelect, onClose, pinned = false, onTogglePin, onRenamed, onUsage, onEditingChange, docked = false }) {
  const [raw, setRaw] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const ref = useRef(null)
  const baseRef = useRef(null) // disk content when editing began (conflict check)

  // report dirtiness upward so App can guard against silent draft loss;
  // second arg feeds the notes-mode live word count (overlay callers ignore it)
  useEffect(() => {
    onEditingChange?.(editing && draft !== raw, editing ? draft : null)
  }, [editing, draft, raw, onEditingChange])
  useEffect(() => () => onEditingChange?.(false), [onEditingChange])
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
    setRenaming(false)
  }, [id])

  // re-read whenever the note changes ON DISK too (mtime bumps via watcher):
  // covers suggestion accepts, UNDO restores, and external Obsidian edits —
  // and never clobbers an in-progress edit
  useEffect(() => {
    if (editing) return
    let dead = false
    window.onyx.readNote(id).then((r) => {
      if (!dead) setRaw(r)
    })
    return () => {
      dead = true
    }
  }, [id, note?.mtime, editing])

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
    baseRef.current = raw || ''
    setDraft(raw || '')
    setEditing(true)
  }
  const save = async () => {
    setSaving(true)
    // conflict check: did the file change on disk (capture, Obsidian) mid-edit?
    const disk = await window.onyx.readNote(id)
    if (disk != null && disk !== baseRef.current) {
      if (!window.confirm('This note changed on disk while you were editing — overwrite with your version?')) {
        setSaving(false)
        return
      }
    }
    const ok = await window.onyx.writeNote(id, draft)
    setSaving(false)
    if (ok) {
      baseRef.current = draft
      setRaw(draft)
      setEditing(false)
      onUsage?.('noteEdit')
    } else {
      alert('Could not save the note.')
    }
  }
  const del = async () => {
    if (!window.confirm(`Delete "${note?.title || id}"? This removes the file from your vault.`)) return
    const ok = await window.onyx.deleteNote(id)
    if (ok) {
      onUsage?.('noteDelete')
      onClose()
    } else alert('Could not delete the note.')
  }
  const startRename = () => {
    setRenameVal(note?.title || id.split('/').pop().replace(/\.md$/, ''))
    setRenaming(true)
  }
  const doRename = async () => {
    const nid = await window.onyx.renameNote(id, renameVal)
    setRenaming(false)
    if (nid && nid !== id) {
      onRenamed?.(id, nid)
      onUsage?.('noteRename')
      onSelect(nid)
    } else if (!nid) alert('Rename failed — the name may already be taken.')
  }

  const fcolor = (graph.folders.find((f) => f.id === note?.folder) || {}).color

  return (
    <aside className={`reader ${docked ? 'docked' : ''} ${editing ? 'editing' : ''}`} style={{ '--c': fcolor }}>
      <div className="reader-head">
        <div>
          {renaming ? (
            <input
              className="rename-input"
              value={renameVal}
              autoFocus
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              onBlur={() => setRenaming(false)}
            />
          ) : (
            <h2 onDoubleClick={startRename} title="Double-click to rename">
              {note?.title || id}
            </h2>
          )}
          <div className="chips">
            {note?.type && <span className="chip">{note.type}</span>}
            {note?.status && <span className="chip">{note.status}</span>}
            {(note?.tags || []).map((t) => (
              <span key={t} className="chip tag">#{t}</span>
            ))}
            {note?.updated && <span className="chip muted">{String(note.updated)}</span>}
            {note?.wordCount != null && (
              <span className="chip muted">
                {note.wordCount.toLocaleString()} w · {Math.max(1, Math.ceil(note.wordCount / 200))} min
              </span>
            )}
            {note?.mtime && (
              <span className="chip muted">
                {(() => {
                  const d = Math.floor((Date.now() - note.mtime) / 86400000)
                  return d === 0 ? 'edited today' : `edited ${d}d ago`
                })()}
              </span>
            )}
          </div>
        </div>
        <div className="reader-actions">
          <button onClick={onTogglePin} className={pinned ? 'pin on' : 'pin'} data-tip={pinned ? 'Unpin' : 'Pin'}>
            {pinned ? '◉' : '⊙'}
          </button>
          {!editing && raw != null && (
            <button onClick={startEdit} data-tip="Edit note">✎</button>
          )}
          {!editing && (
            <button onClick={del} className="danger" data-tip="Delete note">⌫</button>
          )}
          <button onClick={onClose} data-tip="Close · Esc">✕</button>
        </div>
      </div>
      {editing ? (
        <div className="reader-edit">
          <div className="edit-split">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoFocus />
            <div
              className="reader-body edit-preview"
              dangerouslySetInnerHTML={{ __html: renderBody(draft, basenameToId) }}
            />
          </div>
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
        <div className="reader-body">
          <div className="skel" style={{ width: '82%' }} />
          <div className="skel" style={{ width: '95%' }} />
          <div className="skel" style={{ width: '60%' }} />
          <div className="skel" style={{ width: '88%' }} />
        </div>
      ) : (
        <div className="reader-body" ref={ref} dangerouslySetInnerHTML={{ __html: renderBody(raw, basenameToId) }} />
      )}
      {!editing && raw != null && (
        <>
          <Outline raw={raw} bodyRef={ref} />
          <Minimap note={note} graph={graph} clusters={clusters} onSelect={onSelect} />
          <SuggestedLinks note={note} graph={graph} suggestions={suggestions} onAccept={onAcceptSuggestion} onDismiss={onDismissSuggestion} onSelect={onSelect} />
          <Backlinks note={note} graph={graph} onSelect={onSelect} />
          <History id={id} raw={raw} />
        </>
      )}
    </aside>
  )
}
