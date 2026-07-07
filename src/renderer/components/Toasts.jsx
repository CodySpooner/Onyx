import { useEffect, useState } from 'react'
import { bus } from '../lib/bus.mjs'

// Bus-fed toast queue — leaf component; App never re-renders for toasts.
let seq = 0

export function Toasts() {
  const [items, setItems] = useState([])

  useEffect(() => {
    return bus.on('toast', ({ msg, kind = 'info', ttl = 4000, action = null }) => {
      const id = ++seq
      setItems((cur) => [...cur, { id, msg, kind, action }])
      const life = action ? Math.max(ttl, 10000) : ttl
      // fade out instead of vanishing: flag leaving, remove 180ms later
      setTimeout(() => setItems((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t))), life)
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), life + 180)
    })
  }, [])

  const runAction = (t) => {
    t.action?.run?.()
    setItems((cur) => cur.filter((x) => x.id !== t.id))
  }

  if (!items.length) return null
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast glass ${t.kind}${t.leaving ? ' out' : ''}`}>
          {t.msg}
          {t.action && (
            <button className="toast-act" onClick={() => runAction(t)}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
