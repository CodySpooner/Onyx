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
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), action ? Math.max(ttl, 10000) : ttl)
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
        <div key={t.id} className={`toast glass ${t.kind}`}>
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
