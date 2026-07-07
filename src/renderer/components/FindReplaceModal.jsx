import { useEffect, useRef, useState } from 'react'
import { bus } from '../lib/bus.mjs'
import { searchNote, applyReplace } from '../lib/findreplace.mjs'
import { cleanFolder } from '../lib/stats.mjs'

// Vault-wide find & replace. The rails ARE the feature: literal-only terms,
// mandatory scan preview, per-file APPLY (no apply-all), re-read at apply
// time, compare-and-swap UNDO toast per file.
export function FindReplaceModal({ graph, onClose }) {
  const [term, setTerm] = useState('')
  const [repl, setRepl] = useState('')
  const [wholeWord, setWholeWord] = useState(true)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null) // [{id,title,folder,count,previews}]
  const [applied, setApplied] = useState(() => new Set())
  const dead = useRef(false)
  useEffect(() => () => {
    dead.current = true
  }, [])

  // the preview IS the contract: any change to what we search invalidates it
  // (repl stays live — typing the replacement after scanning is the workflow)
  useEffect(() => {
    setResults(null)
    setApplied(new Set())
  }, [term, wholeWord, caseSensitive])

  const scan = async () => {
    if (!term.trim() || scanning) return
    setScanning(true)
    setResults(null)
    setApplied(new Set())
    const found = []
    const notes = graph.notes
    for (let i = 0; i < notes.length; i++) {
      if (dead.current) return
      setProgress(i + 1)
      const raw = await window.onyx.readNote(notes[i].id)
      if (raw == null) continue // unreadable → skipped, surfaced by absence
      const hits = searchNote(raw, term.trim(), { wholeWord, caseSensitive })
      if (hits.length) {
        found.push({
          id: notes[i].id,
          title: notes[i].title,
          folder: notes[i].folder,
          count: hits.length,
          previews: hits.slice(0, 3).map((h) => h.lineText)
        })
      }
    }
    if (!dead.current) {
      setResults(found)
      setScanning(false)
    }
  }

  const apply = async (r) => {
    // re-read at apply time — the scan preview may be minutes old
    const raw = await window.onyx.readNote(r.id)
    if (raw == null) {
      bus.emit('toast', { msg: '✕ could not read note — apply aborted', kind: 'err' })
      return
    }
    const { next, count } = applyReplace(raw, term.trim(), repl, { wholeWord, caseSensitive })
    if (!count) {
      bus.emit('toast', { msg: '✕ no matches anymore — note changed since scan', kind: 'err' })
      return
    }
    const ok = await window.onyx.writeNote(r.id, next)
    if (!ok) {
      bus.emit('toast', { msg: '✕ could not write note', kind: 'err' })
      return
    }
    setApplied((p) => new Set(p).add(r.id))
    bus.emit('toast', {
      msg: `◆ replaced ${count}× in ${r.title}`,
      kind: 'skill',
      action: {
        label: 'UNDO',
        run: async () => {
          const cur = await window.onyx.readNote(r.id)
          if (cur !== next) {
            bus.emit('toast', { msg: '✕ note changed since — undo skipped', kind: 'err' })
            return
          }
          const undone = await window.onyx.writeNote(r.id, raw)
          bus.emit('toast', undone ? { msg: '↩ replace undone' } : { msg: '✕ undo failed', kind: 'err' })
        }
      }
    })
  }

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

  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="fnr glass brk" onMouseDown={(e) => e.stopPropagation()}>
        <div className="u-label rv-head">FIND & REPLACE · WHOLE VAULT · LITERAL TEXT ONLY</div>
        <div className="rule-ticks" />
        <div className="fnr-row">
          <input className="nl-filter" placeholder="find…" value={term} autoFocus onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()} />
          <input className="nl-filter" placeholder="replace with…" value={repl} onChange={(e) => setRepl(e.target.value)} />
        </div>
        <div className="fnr-row fnr-opts">
          <label><input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> whole word</label>
          <label><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> match case</label>
          <span className="fnr-spacer" />
          <button className="hud-new" disabled={scanning || !term.trim()} onClick={scan}>
            {scanning ? `SCANNING ${progress}/${graph.notes.length}` : 'SCAN'}
          </button>
        </div>
        {results && (
          <div className="fnr-results">
            <div className="u-label">
              {results.length ? `${results.reduce((a, r) => a + r.count, 0)} MATCHES IN ${results.length} NOTES — apply per file` : 'NO MATCHES'}
            </div>
            {results.map((r) => (
              <div key={r.id} className={`fnr-file${applied.has(r.id) ? ' done' : ''}`}>
                <div className="fnr-file-head">
                  <span className="fnr-title">{r.title}</span>
                  <span className="fnr-meta num">{cleanFolder(r.folder)} · ×{r.count}</span>
                  {applied.has(r.id) ? (
                    <span className="fnr-applied u-label">APPLIED</span>
                  ) : (
                    <button className="sg-link" onClick={() => apply(r)} title={repl ? 'Replace in this file (undoable)' : 'Delete matches in this file (undoable)'}>
                      {repl ? 'APPLY' : 'DELETE'}
                    </button>
                  )}
                </div>
                {r.previews.map((p, i) => (
                  <div key={i} className="fnr-prev">{p}</div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="palette-foot">literal text only · re-reads each file at apply time · every apply has an UNDO toast</div>
      </div>
    </div>
  )
}
