import { useState } from 'react'

// Collapsible sidebar instrument section. Collapse state is renderer-only UI
// state → localStorage, no IPC.
export function Section({ id, title, right, children }) {
  const key = 'onyx.sec.' + id
  const [open, setOpen] = useState(() => localStorage.getItem(key) !== '0')
  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem(key, next ? '1' : '0')
  }
  return (
    <div className={`section ${open ? 'open' : ''}`}>
      <button className="sec-head" onClick={toggle}>
        <span className="sec-caret">{open ? '▾' : '▸'}</span>
        <span className="u-label">{title}</span>
        <span className="sec-right">{right}</span>
      </button>
      <div className="rule-ticks" />
      <div className="sec-body">
        <div className="sec-inner">{children}</div>
      </div>
    </div>
  )
}
