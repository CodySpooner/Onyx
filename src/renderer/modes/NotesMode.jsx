import { useEffect, useMemo, useRef, useState } from 'react'
import { NoteReader } from '../components/NoteReader.jsx'
import { cleanFolder } from '../lib/stats.mjs'
import { scopeNotes, filterNotes, sortNotes, tagCounts, folderCounts, countWords, validateNotesUi } from '../lib/notesmode.mjs'

const SORTS = [
  { key: 'mtime', label: 'modified' },
  { key: 'ctime', label: 'created' },
  { key: 'title', label: 'title' },
  { key: 'wordCount', label: 'words' }
]

const relDate = (ts) => {
  if (!ts) return ''
  const d = Math.floor((Date.now() - ts) / 86400000)
  return d === 0 ? 'today' : d === 1 ? '1d' : d < 30 ? `${d}d` : d < 365 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`
}

// NOTES — the workspace mode. Rail (scopes) · list · docked reader.
// All list logic is pure (lib/notesmode.mjs); this file is layout + wiring.
export function NotesMode({ graph, selected, pins, dailyFolder, templates, onOpen, onClose, onCreate, onCreateFromTemplate, onTogglePin, onFlyTo, readerProps }) {
  const [scope, setScope] = useState({ kind: 'all' })
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'mtime', dir: 'desc' })
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [listIdx, setListIdx] = useState(0)
  const [ctxMenu, setCtxMenu] = useState(null) // {x, y, id, folder}
  const [tplPick, setTplPick] = useState(null) // {folder, list} — frozen at open
  const [draftText, setDraftText] = useState(null)
  const uiLoaded = useRef(false)
  const listRef = useRef(null)

  // persisted UI (store 'notes-ui'), validated against the live vault
  useEffect(() => {
    window.onyx.storeGet?.('notes-ui').then((stored) => {
      const ui = validateNotesUi(stored, { folders: graph.folders, tags: tagCounts(graph.notes).map((t) => t.tag) })
      setScope(ui.scope)
      setSort(ui.sort)
      setCollapsed(new Set(ui.collapsed))
      uiLoaded.current = true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (uiLoaded.current) window.onyx.storeSet?.('notes-ui', { scope, sort, collapsed: [...collapsed] })
  }, [scope, sort, collapsed])

  const fCounts = useMemo(() => folderCounts(graph.notes), [graph])
  const tags = useMemo(() => tagCounts(graph.notes), [graph])
  const rows = useMemo(
    () => sortNotes(filterNotes(scopeNotes(graph.notes, scope, { pins, dailyFolder }), q), sort.key, sort.dir),
    [graph, scope, q, sort, pins, dailyFolder]
  )
  const folderById = useMemo(() => new Map(graph.folders.map((f) => [f.id, f])), [graph])
  const note = graph.notes.find((n) => n.id === selected)

  // keep the cursor on the open note when it's in the list
  useEffect(() => {
    const at = rows.findIndex((n) => n.id === selected)
    if (at >= 0) setListIdx(at)
    else setListIdx((i) => Math.min(i, Math.max(0, rows.length - 1)))
  }, [rows, selected])

  // context menu closes on any outside press or Esc
  useEffect(() => {
    if (!ctxMenu && !tplPick) return
    const close = () => {
      setCtxMenu(null)
      setTplPick(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [ctxMenu, tplPick])

  const moveCursor = (delta) => {
    setListIdx((i) => {
      const next = Math.max(0, Math.min(rows.length - 1, i + delta))
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
      return next
    })
  }
  const onListKey = (e) => {
    const inInput = e.target.tagName === 'INPUT' // j/k must stay typable in the filter
    if (e.key === 'ArrowDown' || (e.key === 'j' && !inInput)) {
      e.preventDefault()
      moveCursor(1)
    } else if (e.key === 'ArrowUp' || (e.key === 'k' && !inInput)) {
      e.preventDefault()
      moveCursor(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[listIdx]) onOpen(rows[listIdx].id)
    }
  }

  const newNoteIn = (folder) => {
    setCtxMenu(null)
    if (!templates.length) {
      onCreate(folder)
      if (folder && folder !== '(root)') setScope({ kind: 'folder', value: folder })
      return
    }
    setTplPick({ folder, list: [...templates] }) // frozen copy — reindex can't reshuffle mid-pick
  }
  const pickTemplate = (t) => {
    const folder = tplPick.folder
    setTplPick(null)
    if (t) onCreateFromTemplate(t.id, folder)
    else onCreate(folder)
    if (folder && folder !== '(root)') setScope({ kind: 'folder', value: folder })
  }
  const del = async (id) => {
    setCtxMenu(null)
    const title = graph.notes.find((n) => n.id === id)?.title || id
    if (!window.confirm(`Delete "${title}"? This removes the file from your vault.`)) return
    const ok = await window.onyx.deleteNote(id)
    if (ok && id === selected) onClose()
  }

  const smart = [
    { kind: 'all', label: 'ALL NOTES', count: graph.notes.length },
    { kind: 'recent', label: 'RECENT', count: Math.min(30, graph.notes.length) },
    { kind: 'daily', label: 'DAILY', count: fCounts.get(dailyFolder) || 0 },
    { kind: 'pinned', label: 'PINNED', count: pins.length }
  ]
  const toggleSection = (name) =>
    setCollapsed((c) => {
      const n = new Set(c)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })

  const sortStampOf = (n) => relDate(sort.key === 'ctime' ? n.ctime : n.mtime)

  return (
    <div className="mode-scrim notes-mode">
      {/* ── rail ── */}
      <aside className="notes-rail glass">
        {smart.map((s) => (
          <button key={s.kind} className={`nr-row${scope.kind === s.kind ? ' on' : ''}`} onClick={() => setScope({ kind: s.kind })}>
            <span className="nr-label">{s.label}</span>
            <span className="nr-count num">{s.count}</span>
          </button>
        ))}
        <button className="u-label nr-sec" onClick={() => toggleSection('folders')}>
          {collapsed.has('folders') ? '▸' : '▾'} FOLDERS
        </button>
        {!collapsed.has('folders') &&
          [...graph.folders].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
            <div key={f.id} className={`nr-row nr-folder${scope.kind === 'folder' && scope.value === f.id ? ' on' : ''}`}>
              <button className="nr-main" onClick={() => setScope({ kind: 'folder', value: f.id })}>
                <i className="nr-dot" style={{ background: f.color }} />
                <span className="nr-label">{cleanFolder(f.name)}</span>
                <span className="nr-count num">{fCounts.get(f.id) || 0}</span>
              </button>
              <button className="nr-plus" data-tip="New note here" onClick={() => newNoteIn(f.id)}>
                ＋
              </button>
            </div>
          ))}
        <button className="u-label nr-sec" onClick={() => toggleSection('tags')}>
          {collapsed.has('tags') ? '▸' : '▾'} TAGS
        </button>
        {!collapsed.has('tags') &&
          tags.map((t) => (
            <button
              key={t.tag}
              className={`nr-row${scope.kind === 'tag' && scope.value === t.tag ? ' on' : ''}`}
              onClick={() => setScope({ kind: 'tag', value: t.tag })}
            >
              <span className="nr-label">#{t.tag}</span>
              <span className="nr-count num">{t.count}</span>
            </button>
          ))}
      </aside>

      {/* ── list ── */}
      <section className="notes-list glass">
        <div className="nl-head">
          <input className="nl-filter" placeholder="filter…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onListKey} />
          <select className="nl-sort" value={sort.key} onChange={(e) => setSort((s) => ({ ...s, key: e.target.value }))}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="nl-dir" data-tip="Flip sort order" onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }))}>
            {sort.dir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
        <div className="nl-rows" tabIndex={0} onKeyDown={onListKey} ref={listRef}>
          {rows.map((n, i) => (
            <button
              key={n.id}
              className={`nl-row${n.id === selected ? ' on' : ''}${i === listIdx ? ' cursor' : ''}`}
              onClick={() => onOpen(n.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ x: e.clientX, y: e.clientY, id: n.id, folder: n.folder })
              }}
            >
              <div className="nl-top">
                <span className="nl-title">{n.title}</span>
                <span className="nl-date num">{sortStampOf(n)}</span>
              </div>
              {n.excerpt && <div className="nl-excerpt">{n.excerpt}</div>}
              <div className="nl-meta">
                <i className="nr-dot" style={{ background: folderById.get(n.folder)?.color || '#4a5470' }} />
                <span>{cleanFolder(n.folder)}</span>
                {(n.tags || []).slice(0, 3).map((t) => (
                  <span key={t} className="nl-tag">#{t}</span>
                ))}
                {sort.key === 'wordCount' && <span className="num">{n.wordCount}w</span>}
              </div>
            </button>
          ))}
          {!rows.length && <div className="sec-empty">nothing here — clear the filter or pick another scope</div>}
        </div>
      </section>

      {/* ── editor column ── */}
      {/* gated on `selected`, NOT `note`: a reindex that drops the id (rename
          in Obsidian, OneDrive sync) must never unmount a dirty draft */}
      <section className="notes-editor">
        {selected ? (
          <>
            {note && (
            <div className="notes-crumb glass">
              <i className="nr-dot" style={{ background: folderById.get(note.folder)?.color || '#4a5470' }} />
              <span className="nc-folder">{cleanFolder(note.folder)}</span>
              <span className="nc-sep">›</span>
              <span className="nc-title">{note.title}</span>
              <span className="nc-spacer" />
              <button className="nc-fly" onClick={() => onFlyTo(selected)} data-tip="See this note in the 3D brain">
                ◍ FLY TO BRAIN
              </button>
            </div>
            )}
            <NoteReader
              key={selected}
              id={selected}
              docked
              pinned={pins.includes(selected)}
              onTogglePin={() => onTogglePin(selected)}
              onClose={onClose}
              {...readerProps}
              onEditingChange={(d, draft) => {
                readerProps.onEditingChange?.(d)
                setDraftText(d ? draft : null)
              }}
            />
            <div className="notes-status glass">
              <span className="num">
                {draftText != null
                  ? `${countWords(draftText)} words · editing`
                  : note
                    ? `${(note.wordCount || 0).toLocaleString()} words · ${Math.max(1, Math.ceil((note.wordCount || 0) / 200))} min`
                    : 'note missing from index — draft preserved'}
              </span>
              {draftText == null && note && (note.tasks || []).filter((t) => !t.done).length > 0 && (
                <span className="num">{(note.tasks || []).filter((t) => !t.done).length} open tasks</span>
              )}
              <span className="ns-spacer" />
              <span className="u-label">{selected}</span>
            </div>
          </>
        ) : (
          <div className="notes-empty glass brk">
            <div className="u-label">NO NOTE SELECTED</div>
            <p>j/k or ↑↓ to move · Enter to open · right-click for actions</p>
            <button className="hud-new" onClick={() => newNoteIn(scope.kind === 'folder' ? scope.value : null)}>
              ＋ New note
            </button>
          </div>
        )}
      </section>

      {/* ── context menu ── */}
      {ctxMenu && (
        <div className="ctx glass" style={{ left: Math.min(ctxMenu.x, window.innerWidth - 220), top: Math.min(ctxMenu.y, window.innerHeight - 200) }} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => { setCtxMenu(null); onOpen(ctxMenu.id) }}>Open</button>
          <button onClick={() => { setCtxMenu(null); onFlyTo(ctxMenu.id) }}>Fly to in brain</button>
          <button onClick={() => { setCtxMenu(null); onTogglePin(ctxMenu.id) }}>{pins.includes(ctxMenu.id) ? 'Unpin' : 'Pin'}</button>
          <button onClick={() => newNoteIn(ctxMenu.folder)}>New note in {cleanFolder(ctxMenu.folder)}</button>
          <button className="danger" onClick={() => del(ctxMenu.id)}>Delete</button>
        </div>
      )}

      {/* ── template picker (frozen list) ── */}
      {tplPick && (
        <div className="ctx glass tplpick" style={{ left: '50%', top: '30%', transform: 'translateX(-50%)' }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="u-label">NEW NOTE {tplPick.folder ? 'IN ' + cleanFolder(tplPick.folder).toUpperCase() : ''}</div>
          <button onClick={() => pickTemplate(null)}>Blank note</button>
          {tplPick.list.map((t) => (
            <button key={t.id} onClick={() => pickTemplate(t)}>
              ⧉ {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
