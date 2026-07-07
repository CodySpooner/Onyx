import { useEffect, useState } from 'react'
import { cleanFolder } from '../lib/stats.mjs'

// Orphan triage — a guided inbox for unconnected notes. Frozen queue at open
// (the ReviewModal lesson: never iterate a live-recomputed list). 1/2/3 links
// a candidate, S skips, Esc closes.
export function TriageModal({ queue, graph, onAccept, onOpen, onClose }) {
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [excerpt, setExcerpt] = useState('')
  const row = queue[idx]
  const note = row ? graph.notes.find((n) => n.id === row.orphan) : null
  const titleOf = (id) => graph.notes.find((n) => n.id === id)?.title || id

  useEffect(() => {
    setExcerpt('')
    if (!row) return
    let dead = false
    window.onyx.readNote(row.orphan).then((raw) => {
      if (dead || raw == null) return
      const body = String(raw).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/\s+/g, ' ').trim()
      setExcerpt(body.length > 220 ? body.slice(0, 219) + '…' : body)
    })
    return () => {
      dead = true
    }
  }, [row?.orphan])

  const advance = () => {
    if (idx + 1 >= queue.length) onClose()
    else setIdx(idx + 1)
  }
  const accept = async (candidate) => {
    if (busy || !candidate) return
    setBusy(true)
    const ok = await onAccept(candidate)
    setBusy(false)
    if (ok) advance() // failed write → stay on this orphan so the user can retry
  }

  useEffect(() => {
    const onKey = (e) => {
      // modifier combos (Ctrl+1/2/3 mode switch, Ctrl+S reflex) and typing
      // fields must never be swallowed into a vault write
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        return onClose()
      }
      if (!row) return
      if (['1', '2', '3'].includes(e.key)) {
        e.stopPropagation()
        e.preventDefault()
        accept(row.candidates[+e.key - 1])
      } else if (e.key.toLowerCase() === 's') {
        e.stopPropagation()
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [row, idx, busy, queue.length])

  if (!row || !note) return null
  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="triage glass brk" onMouseDown={(e) => e.stopPropagation()}>
        <div className="u-label rv-head">TRIAGE · ORPHAN {idx + 1} / {queue.length}</div>
        <div className="rule-ticks" />
        <button className="tri-title" onClick={() => onOpen(note.id)} data-tip="Open note">
          {note.title}
        </button>
        <div className="chips">
          <span className="chip">{cleanFolder(note.folder)}</span>
          {note.type && <span className="chip">{note.type}</span>}
        </div>
        {excerpt && <div className="tri-excerpt">{excerpt}</div>}
        {row.candidates.length ? (
          <div className="tri-cands">
            <div className="u-label">LINK TO</div>
            {row.candidates.map((c, i) => {
              const other = c.a === note.id ? c.b : c.a
              return (
                <button key={c.a + c.b} className="tri-cand" disabled={busy} onClick={() => accept(c)}>
                  <span className="kbd">{i + 1}</span>
                  <span className="tri-cand-t">{titleOf(other)}</span>
                  <span className="sg-terms">{(c.terms || []).slice(0, 3).map((t) => '#' + t).join(' ')}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="tri-none">no lexical matches — open it, or skip for now</div>
        )}
        <div className="tri-foot">
          <button className="rv-g" onClick={advance}>S · SKIP</button>
          <button className="rv-g" onClick={onClose}>ESC · DONE</button>
        </div>
      </div>
    </div>
  )
}
