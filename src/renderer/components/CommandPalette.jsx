import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyFilter } from '../lib/fuzzy.mjs'
import { cleanFolder, degree } from '../lib/stats.mjs'
import { Kbd } from './chrome.jsx'

function Marked({ text, indices }) {
  if (!indices?.length) return <>{text}</>
  const set = new Set(indices)
  return (
    <>
      {text.split('').map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : ch))}
    </>
  )
}

export function CommandPalette({ graph, actions, onSelectNote, onClose }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)
  const colorOf = (fid) => (graph.folders.find((f) => f.id === fid) || {}).color || '#8fa2d9'

  const results = useMemo(() => {
    const actionHits = fuzzyFilter(q, actions, (a) => a.label, q ? 4 : 6).map((r) => ({
      kind: 'action',
      key: `a:${r.item.label}`,
      label: r.item.label,
      hint: r.item.hint,
      indices: r.indices,
      run: r.item.run
    }))
    let noteHits
    if (q) {
      noteHits = fuzzyFilter(q, graph.notes, (n) => `${n.title} ${cleanFolder(n.folder)} ${(n.tags || []).join(' ')}`, 12).map(
        (r) => ({
          kind: 'note',
          key: `n:${r.item.id}`,
          label: r.item.title,
          hint: `${cleanFolder(r.item.folder)} · ${degree(r.item)}⇄`,
          color: colorOf(r.item.folder),
          indices: r.indices.filter((i) => i < r.item.title.length),
          run: () => onSelectNote(r.item.id)
        })
      )
    } else {
      noteHits = [...graph.notes]
        .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
        .slice(0, 8)
        .map((n) => ({
          kind: 'recent',
          key: `n:${n.id}`,
          label: n.title,
          hint: cleanFolder(n.folder),
          color: colorOf(n.folder),
          indices: [],
          run: () => onSelectNote(n.id)
        }))
    }
    return [...actionHits, ...noteHits]
  }, [q, graph, actions, onSelectNote])

  useEffect(() => setIdx(0), [q])
  useEffect(() => inputRef.current?.focus(), [])

  const runIdx = (i) => {
    const r = results[i]
    if (!r) return
    onClose()
    r.run()
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey) return // let global shortcuts (Ctrl+K toggle, Ctrl+1-3) bubble to App
    e.stopPropagation()
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      setIdx((i) => (i + 1) % Math.max(1, results.length))
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault()
      setIdx((i) => (i - 1 + results.length) % Math.max(1, results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runIdx(idx)
    }
  }

  let lastKind = null
  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="palette glass" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search notes and commands…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => inputRef.current?.focus()}
        />
        <div className="palette-list">
          {results.map((r, i) => {
            const header =
              r.kind !== lastKind ? (
                <div key={`h:${r.kind}`} className="u-label palette-sec">
                  {r.kind === 'action' ? 'ACTIONS' : r.kind === 'recent' ? 'RECENT' : 'NOTES'}
                </div>
              ) : null
            lastKind = r.kind
            return (
              <div key={r.key}>
                {header}
                <button
                  className={`palette-row ${i === idx ? 'sel' : ''}`}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => runIdx(i)}
                >
                  {r.kind !== 'action' && <i className="prow-dot" style={{ background: r.color }} />}
                  <span className="palette-label">
                    <Marked text={r.label} indices={r.indices} />
                  </span>
                  {r.hint && <span className="palette-hint">{r.hint}</span>}
                </button>
              </div>
            )
          })}
          {!results.length && <div className="palette-empty">no matches</div>}
        </div>
        <div className="palette-foot">
          <Kbd>↑↓</Kbd> navigate · <Kbd>↵</Kbd> run · <Kbd>esc</Kbd> close
        </div>
      </div>
    </div>
  )
}
