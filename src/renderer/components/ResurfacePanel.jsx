import { useMemo } from 'react'
import { resurfacePick } from '../lib/resurface.mjs'
import { dayKey } from '../lib/stats.mjs'

const NUDGE = {
  anniversary: (p) => `Written ${p.years} year${p.years === 1 ? '' : 's'} ago today`,
  cold: (p) => `Dormant ${p.days}d — reconnect this thought`,
  old: () => 'One of your oldest notes'
}

export function ResurfacePanel({ graph, onSelect }) {
  const pick = useMemo(() => {
    const now = Date.now()
    return resurfacePick(graph.notes, dayKey(now), now)
  }, [graph])

  if (!pick) return null
  return (
    <>
      <div className="u-label">RESURFACE</div>
      <div className="rule-ticks" />
      <button className="rs-title" onClick={() => onSelect(pick.note.id)}>
        {pick.note.title}
      </button>
      <div className="dp-sub">{NUDGE[pick.reason](pick)}</div>
      <button className="rs-go" onClick={() => onSelect(pick.note.id)}>
        ↗ reconnect
      </button>
    </>
  )
}
