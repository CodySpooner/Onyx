import { useMemo } from 'react'
import { habitGrid } from '../lib/habits.mjs'
import { dayKey } from '../lib/stats.mjs'

// 30-day habit grid from `- [x] #habit Name` lines in daily notes.
export function HabitGrid({ graph }) {
  const habits = useMemo(
    () => habitGrid(graph.habitEntries || [], dayKey(Date.now())),
    [graph]
  )
  if (!habits.length) return null
  return (
    <>
      <div className="u-label">HABITS · 30D</div>
      <div className="rule-ticks" />
      {habits.map((h) => (
        <div key={h.name} className="hb-row">
          <span className="hb-name">{h.name}</span>
          <span className="hb-cells">
            {h.cells.map((c) => (
              <i key={c.date} className={`hb-cell ${c.state}`} data-tip={`${c.date} · ${c.state}`} />
            ))}
          </span>
          <span className="hb-pct num">{h.pct}%</span>
          {h.streak >= 3 && <span className="hb-streak">🔥{h.streak}</span>}
        </div>
      ))}
    </>
  )
}
