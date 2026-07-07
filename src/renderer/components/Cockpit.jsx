import { useMemo } from 'react'
import { Gauge } from './Gauge.jsx'
import { detectClusters } from '../lib/clusters.mjs'
import { velocity, coldNotes, bridgeStats, maturity, nextActions } from '../lib/stats.mjs'

function Spark({ weeks }) {
  const max = Math.max(1, ...weeks)
  const pts = weeks.map((v, i) => `${(i / (weeks.length - 1)) * 100},${34 - (v / max) * 30}`).join(' ')
  return (
    <svg viewBox="0 0 100 36" className="spark" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  )
}

export function Cockpit({ graph, clusters, onSelect }) {
  const d = useMemo(() => {
    const now = Date.now()
    const { clusterOf, clusterCount } = clusters ?? detectClusters(graph.notes.map((n) => n.id), graph.links)
    const vel = velocity(graph.notes, now)
    const cold = coldNotes(graph.notes, now)
    const br = bridgeStats(graph.links, clusterOf)
    const mat = maturity(graph.notes, now)
    const acts = nextActions({
      notes: graph.notes,
      cold,
      trendPct: vel.trendPct,
      clusterOf,
      clusterCount,
      links: graph.links
    })
    return { clusterCount, vel, cold, br, mat, acts }
  }, [graph, clusters])

  const titleOf = (id) => graph.notes.find((n) => n.id === id)?.title || id

  return (
    <aside className="cockpit">
      <div className="glass cpanel">
        <div className="sec-h">MATURITY</div>
        <div className="cp-row">
          <Gauge value={d.mat.score} label="SCORE" />
          <div className="cp-sub">
            <div>
              {graph.meta.noteCount} notes · {d.clusterCount} clusters
            </div>
            <div className="bar"><i style={{ width: `${d.mat.connectedRatio * 100}%` }} /></div>
            <div className="bar"><i style={{ width: `${d.mat.freshRatio * 100}%` }} /></div>
            <div className="bar"><i style={{ width: `${d.mat.densityScore * 100}%` }} /></div>
            <div className="cp-legend">linked · fresh · dense</div>
          </div>
        </div>
      </div>

      <div className="glass cpanel">
        <div className="sec-h">VELOCITY · 12 WK</div>
        <Spark weeks={d.vel.weeks} />
        <div className={`cp-trend ${d.vel.trendPct >= 0 ? 'up' : 'down'}`}>
          {d.vel.trendPct >= 0 ? '+' : ''}
          {d.vel.trendPct}%
        </div>
      </div>

      {d.cold.length > 0 && (
        <div className="glass cpanel">
          <div className="sec-h">COLD NOTES ›60D</div>
          {d.cold.slice(0, 5).map((c) => (
            <button key={c.note.id} className="cp-item" onClick={() => onSelect(c.note.id)}>
              <span className="cp-t">{c.note.title}</span>
              <span className="cp-v">{c.ageDays}d</span>
            </button>
          ))}
        </div>
      )}

      <div className="glass cpanel">
        <div className="sec-h">BRIDGES · {d.br.count}</div>
        {d.br.top.slice(0, 3).map((t) => (
          <button key={t.id} className="cp-item" onClick={() => onSelect(t.id)}>
            <span className="cp-t">{titleOf(t.id)}</span>
            <span className="cp-v">{t.cross}⇄</span>
          </button>
        ))}
      </div>

      <div className="glass cpanel">
        <div className="sec-h">NEXT ACTIONS</div>
        {d.acts.map((a, i) => (
          <div key={i} className="cp-act">
            ▸ {a}
          </div>
        ))}
      </div>
    </aside>
  )
}
