import { useEffect, useRef, useState } from 'react'
import { easeOutCubic } from '../lib/hud.mjs'

const REDUCED =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// rAF count-up tween toward `value`; snaps under prefers-reduced-motion
export function useCountUp(value, dur = 600) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    if (REDUCED || !Number.isFinite(value)) {
      fromRef.current = value
      setShown(value)
      return
    }
    const from = fromRef.current
    if (from === value) return
    let raf
    const t0 = performance.now()
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur)
      const v = from + (value - from) * easeOutCubic(k)
      setShown(Math.round(v))
      if (k < 1) raf = requestAnimationFrame(step)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, dur])
  return shown
}

export function Num({ value, dur = 600 }) {
  const shown = useCountUp(value ?? 0, dur)
  return <span className="num">{Number.isFinite(shown) ? shown.toLocaleString() : '—'}</span>
}

export function Kbd({ children }) {
  return <span className="kbd">{children}</span>
}
