import { useEffect, useMemo, useRef, useState } from 'react'
import { cleanFolder } from '../lib/stats.mjs'
import { folderCounts } from '../lib/notesmode.mjs'

// close-on-outside-click hook shared by both pills
function useDropdown() {
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
  return { open, setOpen, ref }
}

// Vault selector (top-left): flip between opened vaults, or open a new folder.
export function VaultPill({ vaults, active, onSwitch, onOpen }) {
  const { open, setOpen, ref } = useDropdown()
  const name = vaults.find((v) => v.path === active)?.name || 'NO VAULT'
  return (
    <span className="wspill-wrap" ref={ref}>
      <button className="wspill on" data-tip="Switch vault" onClick={() => setOpen((o) => !o)}>
        ◆ {name} ▾
      </button>
      {open && (
        <div className="ws-menu glass">
          {vaults.map((v) => (
            <button
              key={v.path}
              className={`ws-item${v.path === active ? ' on' : ''}`}
              data-tip={v.path}
              onClick={() => { setOpen(false); if (v.path !== active) onSwitch(v.path) }}
            >
              ◆ {v.name}
            </button>
          ))}
          <button className="ws-item ws-new" onClick={() => { setOpen(false); onOpen() }}>
            ＋ Open vault folder…
          </button>
        </div>
      )}
    </span>
  )
}

// Topic selector: one folder of the active vault, or All. Always reads the
// FULL graph's folders so you can jump between topics while scoped.
export function TopicPill({ graph, activeId, onPick }) {
  const { open, setOpen, ref } = useDropdown()
  const counts = useMemo(() => folderCounts(graph?.notes || []), [graph])
  const folders = graph?.folders || []
  // guard on truthy activeId so a null scope never matches a falsy folder id
  const active = activeId ? folders.find((f) => f.id === activeId) || null : null
  return (
    <span className="wspill-wrap" ref={ref}>
      <button className={`wspill${active ? ' on' : ''}`} data-tip="Focus a folder" onClick={() => setOpen((o) => !o)}>
        {active && <i style={{ background: active.color }} />}
        {active ? cleanFolder(active.name) : '◍ All Topics'} ▾
      </button>
      {open && (
        <div className="ws-menu glass">
          <button className={`ws-item${!active ? ' on' : ''}`} onClick={() => { setOpen(false); onPick(null) }}>
            ◍ All Topics
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`ws-item${f.id === activeId ? ' on' : ''}`}
              onClick={() => { setOpen(false); onPick(f.id) }}
            >
              <i style={{ background: f.color }} />
              {cleanFolder(f.name)} <span className="num">{counts.get(f.id) || 0}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
