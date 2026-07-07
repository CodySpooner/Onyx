import { useEffect, useState } from 'react'
import { bus } from '../lib/bus.mjs'

// Bus-fed toast queue — leaf component; App never re-renders for toasts.
let seq = 0

export function Toasts() {
  const [items, setItems] = useState([])

  useEffect(() => {
    return bus.on('toast', ({ msg, kind = 'info', ttl = 4000 }) => {
      const id = ++seq
      setItems((cur) => [...cur, { id, msg, kind }])
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), ttl)
    })
  }, [])

  if (!items.length) return null
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast glass ${t.kind}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
