import { useEffect, useMemo, useRef, useState } from 'react'
import { CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { pickColor } from '../lib/workspaces.mjs'
import { tagCounts, folderCounts } from '../lib/notesmode.mjs'
import { cleanFolder } from '../lib/stats.mjs'

// The scope switcher: ALL VAULT ▾ → auto workspaces (project logs) + manual
// ones + new. Scoping is a VIEW, never a move — the pill glows when active
// so nobody wonders where their notes went.
export function WorkspacePill({ workspaces, activeId, onPick, onNew, onEdit }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const active = workspaces.find((w) => w.id === activeId) || null
  return (
    <span className="wspill-wrap" ref={ref}>
      <button className={`wspill${active ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}>
        {active && <i style={{ background: active.color }} />}
        {active ? active.name : 'ALL VAULT'} ▾
      </button>
      {open && (
        <div className="ws-menu glass">
          <button className={`ws-item${!active ? ' on' : ''}`} onClick={() => { onPick(null); setOpen(false) }}>
            ◍ ALL VAULT
          </button>
          {workspaces.map((w) => (
            <div key={w.id} className={`ws-item-row${w.id === activeId ? ' on' : ''}`}>
              <button className="ws-item" onClick={() => { onPick(w.id); setOpen(false) }}>
                <i style={{ background: w.color }} />
                {w.name}
                {w.auto && <span className="ws-auto u-label">AGENT</span>}
              </button>
              {!w.auto && (
                <button className="ws-edit" data-tip="Edit workspace" onClick={() => { setOpen(false); onEdit(w) }}>✎</button>
              )}
            </div>
          ))}
          <button className="ws-item ws-new" onClick={() => { setOpen(false); onNew() }}>
            ＋ New workspace
          </button>
        </div>
      )}
    </span>
  )
}

// minimal manual-workspace editor: name + color + folder/tag checklists
export function WorkspaceModal({ graph, initial, onSave, onDelete, onClose }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || pickColor(initial?.name || 'new'))
  const [folders, setFolders] = useState(() => new Set(initial?.folders || []))
  const [tags, setTags] = useState(() => new Set(initial?.tags || []))
  const fCounts = useMemo(() => folderCounts(graph.notes), [graph])
  const tCounts = useMemo(() => tagCounts(graph.notes).slice(0, 24), [graph])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const toggle = (set, setter, v) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    setter(n)
  }
  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({
      id: initial?.id || 'ws-' + Date.now().toString(36),
      name: trimmed.slice(0, 40),
      color,
      folders: [...folders],
      tags: [...tags],
      noteIds: initial?.noteIds || []
    })
  }

  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="wsmodal glass brk" onMouseDown={(e) => e.stopPropagation()}>
        <div className="u-label rv-head">{initial ? 'EDIT WORKSPACE' : 'NEW WORKSPACE'}</div>
        <div className="rule-ticks" />
        <input className="nl-filter" placeholder="workspace name…" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <div className="ws-swatches">
          {CLUSTER_PALETTE.slice(0, 12).map((c) => (
            <button key={c} className={`ws-swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="u-label">FOLDERS</div>
        <div className="ws-checks">
          {graph.folders.map((f) => (
            <label key={f.id} className="ws-check">
              <input type="checkbox" checked={folders.has(f.id)} onChange={() => toggle(folders, setFolders, f.id)} />
              <i style={{ background: f.color }} />
              {cleanFolder(f.name)} <span className="num">{fCounts.get(f.id) || 0}</span>
            </label>
          ))}
        </div>
        <div className="u-label">TAGS</div>
        <div className="ws-checks">
          {tCounts.map((t) => (
            <label key={t.tag} className="ws-check">
              <input type="checkbox" checked={tags.has(t.tag)} onChange={() => toggle(tags, setTags, t.tag)} />
              #{t.tag} <span className="num">{t.count}</span>
            </label>
          ))}
        </div>
        <div className="tri-foot">
          <button className="rv-g good" onClick={save} disabled={!name.trim()}>SAVE</button>
          {initial && (
            <button className="rv-g again" onClick={() => onDelete(initial.id)}>DELETE</button>
          )}
          <button className="rv-g" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  )
}
